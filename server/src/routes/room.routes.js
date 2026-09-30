import { Router } from 'express';
import { body, query } from 'express-validator';
import Room from '../models/Room.js';
import RoomCategory from '../models/RoomCategory.js';
import Booking from '../models/Booking.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { assertValidImage, uploadBufferToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { assertValidDateRange, countOverlappingBookings } from '../utils/availability.js';

const router = Router();

// ---------- PUBLIC ----------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, featured } = req.query;
    const filter = { status: 'active' };
    if (category) filter.category = category;
    if (featured === 'true') filter.featured = true;
    const rooms = await Room.find(filter).populate('category').populate('amenities').sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, data: rooms });
  })
);

// Admin: every room, whatever its status (the public list only shows active ones)
router.get(
  '/admin/all',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rooms = await Room.find().populate('category').populate('amenities').sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, data: rooms });
  })
);

router.get(
  '/search',
  [
    query('checkIn').notEmpty().withMessage('checkIn is required'),
    query('checkOut').notEmpty().withMessage('checkOut is required'),
    query('guests').optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { checkIn, checkOut } = req.query;
    const guests = parseInt(req.query.guests, 10) || 1;
    const { inDate, outDate } = assertValidDateRange(checkIn, checkOut);

    const candidates = await Room.find({
      status: 'active',
      capacityAdults: { $gte: guests },
    })
      .populate('category')
      .populate('amenities');

    const results = [];
    for (const room of candidates) {
      const overlapping = await countOverlappingBookings(room._id, inDate, outDate);
      const availableUnits = room.totalUnits - overlapping;
      if (availableUnits > 0) {
        results.push({ ...room.toObject(), availableUnits });
      }
    }
    res.json({ success: true, data: results, meta: { checkIn: inDate, checkOut: outDate, guests } });
  })
);

router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const categories = await RoomCategory.find().sort({ name: 1 });
    res.json({ success: true, data: categories });
  })
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const room = await Room.findOne({ slug: req.params.slug, status: { $ne: 'inactive' } })
      .populate('category')
      .populate('amenities');
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.json({ success: true, data: room });
  })
);

router.get(
  '/:id/availability',
  [
    query('checkIn').notEmpty(),
    query('checkOut').notEmpty(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    const { inDate, outDate } = assertValidDateRange(req.query.checkIn, req.query.checkOut);
    const overlapping = await countOverlappingBookings(room._id, inDate, outDate);
    const availableUnits = room.totalUnits - overlapping;
    res.json({ success: true, data: { available: availableUnits > 0, availableUnits } });
  })
);

// ---------- ADMIN ----------

router.post(
  '/',
  requireAuth,
  [
    body('name').notEmpty(),
    body('slug').notEmpty(),
    body('category').notEmpty(),
    body('description').notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('capacityAdults').isInt({ min: 1 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const room = await Room.create(req.body);
    res.status(201).json({ success: true, data: room });
  })
);

router.put(
  '/reorder',
  requireAuth,
  [body('order').isArray({ min: 1 })],
  validate,
  asyncHandler(async (req, res) => {
    const { order } = req.body; // array of room _ids in the desired display order
    await Promise.all(
      order.map((id, idx) => Room.findByIdAndUpdate(id, { displayOrder: idx }))
    );
    const rooms = await Room.find().populate('category').populate('amenities').sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, data: rooms });
  })
);

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Images are managed only through the /images endpoints — saving room details must never touch them.
    const { images, _id, createdAt, updatedAt, ...updates } = req.body;
    const room = await Room.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.json({ success: true, data: room });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const activeBookings = await Booking.countDocuments({
      room: room._id,
      status: { $in: ['pending', 'confirmed', 'checked-in'] },
    });
    if (activeBookings > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete a room with active or upcoming bookings',
      });
    }

    for (const img of room.images) {
      try {
        await deleteFromCloudinary(img.publicId);
      } catch (err) {
        console.warn('[rooms] cloudinary delete failed (continuing):', err.message);
      }
    }
    await room.deleteOne();
    res.json({ success: true });
  })
);

router.post(
  '/:id/images',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    assertValidImage(req.file);
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const { secure_url: url, public_id: publicId } = await uploadBufferToCloudinary(
      req.file.buffer,
      'rooms'
    );
    room.images.push({ url, publicId, alt: room.name, order: room.images.length });
    await room.save();
    res.status(201).json({ success: true, data: room });
  })
);

router.delete(
  '/:id/images/:publicId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    const publicId = decodeURIComponent(req.params.publicId);
    const img = room.images.find((i) => i.publicId === publicId);
    if (!img) return res.status(404).json({ success: false, message: 'Image not found' });
    try {
      await deleteFromCloudinary(publicId);
    } catch (err) {
      // Don't let a Cloudinary hiccup (or a non-Cloudinary/local image) block removal from the room.
      console.warn('[rooms] cloudinary delete failed (continuing):', err.message);
    }
    room.images = room.images.filter((i) => i.publicId !== publicId);
    await room.save();
    res.json({ success: true, data: room });
  })
);

router.put(
  '/:id/images/reorder',
  requireAuth,
  [body('order').isArray({ min: 1 })],
  validate,
  asyncHandler(async (req, res) => {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    const orderMap = new Map(req.body.order.map((publicId, idx) => [publicId, idx]));
    room.images = room.images
      .map((img) => ({ ...img.toObject(), order: orderMap.get(img.publicId) ?? img.order }))
      .sort((a, b) => a.order - b.order);
    await room.save();
    res.json({ success: true, data: room });
  })
);

export default router;