import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import SiteSetting from '../models/SiteSetting.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { publicFormLimiter } from '../middleware/rateLimit.js';
import {
  assertValidDateRange,
  countOverlappingBookings,
  nightsBetween,
  blockingQuery,
  parseDay,
} from '../utils/availability.js';
import { generateBookingReference } from '../utils/reference.js';
import { priceStay, validateOccupancy, pricingConfigured, tariffOf, round2 } from '../utils/pricing.js';
import {
  createOrder,
  refundPayment,
  razorpayConfigured,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../config/razorpay.js';
import { env } from '../config/env.js';

const router = Router();

// The live price check fires as the customer changes dates/guests, so it gets a looser limit than form submits.
const quoteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const HOLD_MINUTES = 15; // how long an unpaid website booking holds its rooms
const STATUSES = ['pending', 'confirmed', 'cancelled', 'checked-in', 'completed'];
const populateRoom = { path: 'room', populate: 'category' };

async function getSettings() {
  let settings = await SiteSetting.findOne({ key: 'general' });
  if (!settings) settings = await SiteSetting.create({ key: 'general' });
  return settings;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Occupancy is one { type: 'single' | 'double' } entry per room.
 * If only a room count is given, every room defaults to single occupancy.
 */
function normalizeOccupancy({ occupancy, roomCount }) {
  if (Array.isArray(occupancy) && occupancy.length) {
    return occupancy.map((o) => ({ type: o?.type === 'double' ? 'double' : o?.type === 'single' ? 'single' : '' }));
  }
  const n = Math.max(1, parseInt(roomCount, 10) || 1);
  return Array.from({ length: n }, () => ({ type: 'single' }));
}

/** Validates dates/occupancy/availability and prices a stay. Throws on any problem. */
async function evaluateStay({ room, checkIn, checkOut, occupancy, settings, excludeBookingId = null, allowPast = false, maxRooms, requirePricing = true }) {
  const { inDate, outDate } = assertValidDateRange(checkIn, checkOut, { allowPast });
  const roomCount = occupancy.length;
  if (maxRooms && roomCount > maxRooms) throw httpError(422, `You can book at most ${maxRooms} rooms at a time`);
  const occupancyError = validateOccupancy(occupancy);
  if (occupancyError) throw httpError(422, occupancyError);
  if (requirePricing && !pricingConfigured(room)) {
    throw httpError(422, 'Online pricing for this room is not available yet. Please call the hotel to book.');
  }

  const taken = await countOverlappingBookings(room._id, inDate, outDate, excludeBookingId);
  const availableUnits = Math.max(0, room.totalUnits - taken);
  if (roomCount > availableUnits) {
    throw httpError(
      409,
      availableUnits === 0
        ? 'Sorry, this room type is fully booked for the selected dates'
        : `Only ${availableUnits} room${availableUnits === 1 ? '' : 's'} of this type available for the selected dates`
    );
  }
  const nights = nightsBetween(inDate, outDate);
  const pricing = priceStay({ room, occupancy, nights, taxPercent: settings.taxPercent, advancePercent: settings.advancePercent });
  return { inDate, outDate, nights, pricing, availableUnits, roomCount, occupancy };
}

function paymentStateFor(booking) {
  const net = booking.amountPaid - booking.amountRefunded;
  if (booking.amountRefunded > 0 && net <= 0.009) return 'refunded';
  if (net >= booking.totalAmount - 0.009 && booking.totalAmount > 0) return 'paid';
  if (net > 0.009) return 'partial';
  return 'unpaid';
}

/**
 * Applies a captured Razorpay payment to its booking. Used by both the
 * browser callback (/verify) and the webhook, so it must be idempotent.
 */
async function applyOnlinePayment(booking, paymentId, amountRupees) {
  if (booking.payments.some((p) => p.razorpayPaymentId === paymentId)) {
    return { ok: true, already: true, booking };
  }

  const holdExpired = booking.holdExpiresAt && booking.holdExpiresAt < new Date();
  if (booking.status === 'cancelled' || holdExpired) {
    // Hold lapsed (or booking was cancelled) before the money arrived — re-check stock.
    const room = await Room.findById(booking.room);
    const taken = await countOverlappingBookings(booking.room, booking.checkIn, booking.checkOut, booking._id);
    if (!room || taken + booking.roomCount > room.totalUnits) {
      booking.payments.push({ amount: amountRupees, method: 'razorpay', razorpayPaymentId: paymentId, note: 'Paid after hold expired' });
      booking.amountPaid = round2(booking.amountPaid + amountRupees);
      booking.status = 'cancelled';
      booking.holdExpiresAt = null;
      booking.notes = `${booking.notes} [Paid after the room hold expired and rooms were sold out — auto-refund attempted]`.trim();
      try {
        const refund = await refundPayment(paymentId, amountRupees, { reference: booking.reference });
        booking.refunds.push({ amount: amountRupees, razorpayRefundId: refund.id, razorpayPaymentId: paymentId, method: 'razorpay', note: 'Auto-refund: no rooms left' });
        booking.amountRefunded = round2(booking.amountRefunded + amountRupees);
      } catch (err) {
        booking.notes = `${booking.notes} [AUTO-REFUND FAILED: refund ₹${amountRupees} manually — ${err.message}]`.trim();
      }
      booking.paymentStatus = paymentStateFor(booking);
      await booking.save();
      return { ok: false, soldOut: true, booking };
    }
  }

  booking.payments.push({ amount: amountRupees, method: 'razorpay', razorpayPaymentId: paymentId });
  booking.amountPaid = round2(booking.amountPaid + amountRupees);
  booking.paymentStatus = paymentStateFor(booking);
  booking.status = booking.status === 'cancelled' ? 'confirmed' : booking.status === 'pending' ? 'confirmed' : booking.status;
  booking.holdExpiresAt = null;
  await booking.save();
  return { ok: true, booking };
}

// ======================= PUBLIC =======================

// Live price + availability check used by the booking widget (also used by the admin "New booking" form)
router.post(
  '/quote',
  quoteLimiter,
  [body('roomId').notEmpty(), body('checkIn').notEmpty(), body('checkOut').notEmpty()],
  validate,
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const room = await Room.findOne({ _id: req.body.roomId, status: 'active' });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found or unavailable' });
    const occupancy = normalizeOccupancy(req.body);
    try {
      const stay = await evaluateStay({
        room, checkIn: req.body.checkIn, checkOut: req.body.checkOut,
        occupancy, settings, maxRooms: settings.maxRoomsPerBooking,
      });
      res.json({
        success: true,
        data: {
          available: true,
          availableUnits: stay.availableUnits,
          nights: stay.nights,
          pricing: stay.pricing,
          tariff: tariffOf(room),
          advancePercent: settings.advancePercent,
          payNow: stay.pricing.payNow,
          payLater: stay.pricing.payLater,
          onlineBookingEnabled: settings.onlineBookingEnabled,
          paymentsConfigured: razorpayConfigured(),
        },
      });
    } catch (err) {
      if (err.status && err.status < 500) {
        return res.json({ success: true, data: { available: false, message: err.message } });
      }
      throw err;
    }
  })
);

// Create a booking + Razorpay order (rooms are held for HOLD_MINUTES)
router.post(
  '/',
  publicFormLimiter,
  [
    body('roomId').notEmpty(),
    body('checkIn').notEmpty(),
    body('checkOut').notEmpty(),
    body('occupancy').isArray({ min: 1, max: 20 }),
    body('occupancy.*.type').isIn(['single', 'double']),
    body('guest.firstName').trim().notEmpty(),
    body('guest.lastName').trim().notEmpty(),
    body('guest.email').isEmail(),
    body('guest.phone').trim().isLength({ min: 8 }),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    if (!settings.onlineBookingEnabled) throw httpError(403, 'Online booking is currently unavailable. Please call the hotel to book.');
    if (!razorpayConfigured()) throw httpError(503, 'Online payment is not available right now. Please call the hotel to book.');

    const { roomId, checkIn, checkOut, guest } = req.body;
    const occupancy = normalizeOccupancy(req.body);
    const roomCount = occupancy.length;

    const room = await Room.findOne({ _id: roomId, status: 'active' });
    if (!room) throw httpError(404, 'Room not found or unavailable');

    const stay = await evaluateStay({
      room, checkIn, checkOut, occupancy, settings, maxRooms: settings.maxRoomsPerBooking,
    });
    const { pricing } = stay;
    const amountDueOnline = pricing.payNow;
    if (amountDueOnline <= 0) throw httpError(422, 'Invalid payable amount');

    const booking = await Booking.create({
      reference: generateBookingReference(),
      room: room._id,
      roomCount,
      occupancy,
      checkIn: stay.inDate,
      checkOut: stay.outDate,
      nights: stay.nights,
      guest: {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone,
        specialRequests: guest.specialRequests || '',
      },
      pricePerNight: pricing.nightlyTotal,
      subtotal: pricing.subtotal,
      taxPercent: pricing.taxPercent,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      amountDueOnline,
      status: 'pending',
      source: 'website',
      paymentStatus: 'unpaid',
      holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
    });

    // Re-verify after insert to close the race window.
    const overlapAfter = await countOverlappingBookings(room._id, stay.inDate, stay.outDate);
    if (overlapAfter > room.totalUnits) {
      booking.status = 'cancelled';
      booking.holdExpiresAt = null;
      booking.notes = '[auto-cancelled: overbooked race condition]';
      await booking.save();
      throw httpError(409, 'Rooms were just booked by someone else. Please try different dates.');
    }

    let order;
    try {
      order = await createOrder({
        amountRupees: amountDueOnline,
        receipt: booking.reference,
        notes: { reference: booking.reference, guest: `${guest.firstName} ${guest.lastName}` },
      });
    } catch (err) {
      booking.status = 'cancelled';
      booking.holdExpiresAt = null;
      booking.notes = `[payment order failed: ${err.message}]`;
      await booking.save();
      throw err;
    }
    booking.razorpayOrderId = order.id;
    await booking.save();

    const populated = await booking.populate(populateRoom);
    res.status(201).json({
      success: true,
      data: {
        booking: populated,
        payment: {
          keyId: env.razorpay.keyId,
          orderId: order.id,
          amount: order.amount, // paise
          currency: order.currency,
          holdMinutes: HOLD_MINUTES,
        },
      },
    });
  })
);

// Called by the browser after Razorpay Checkout succeeds
router.post(
  '/verify',
  publicFormLimiter,
  [
    body('reference').notEmpty(),
    body('razorpay_order_id').notEmpty(),
    body('razorpay_payment_id').notEmpty(),
    body('razorpay_signature').notEmpty(),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { reference, razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    const booking = await Booking.findOne({ reference, razorpayOrderId: orderId });
    if (!booking) throw httpError(404, 'Booking not found');
    if (!verifyCheckoutSignature(orderId, paymentId, signature)) {
      throw httpError(400, 'Payment verification failed');
    }
    const result = await applyOnlinePayment(booking, paymentId, booking.amountDueOnline);
    const populated = await result.booking.populate(populateRoom);
    if (result.soldOut) {
      return res.status(409).json({
        success: false,
        message: 'Your payment came through after the room hold expired and the rooms are now sold out. Your money is being refunded automatically.',
        data: populated,
      });
    }
    res.json({ success: true, data: populated });
  })
);

// Razorpay -> server webhook (safety net if the customer closes the tab after paying)
// Set this URL in Razorpay Dashboard > Webhooks:  https://<your-api>/api/bookings/razorpay-webhook
router.post(
  '/razorpay-webhook',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!req.rawBody || !verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    const event = req.body?.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const payment = req.body?.payload?.payment?.entity;
      if (payment?.order_id && payment?.id) {
        const booking = await Booking.findOne({ razorpayOrderId: payment.order_id });
        if (booking) await applyOnlinePayment(booking, payment.id, round2(payment.amount / 100));
      }
    }
    res.json({ success: true });
  })
);

router.get(
  '/reference/:reference',
  asyncHandler(async (req, res) => {
    const booking = await Booking.findOne({ reference: req.params.reference }).populate(populateRoom);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: booking });
  })
);

// ======================= ADMIN =======================

// Availability calendar: rooms booked per day per room type
router.get(
  '/calendar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const from = parseDay(req.query.from || new Date().toISOString().slice(0, 10));
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 31, 7), 62);
    const to = new Date(from.getTime() + days * 86400000);

    const rooms = await Room.find().populate('category').sort({ displayOrder: 1, createdAt: -1 });
    const bookings = await Booking.find({
      checkIn: { $lt: to },
      checkOut: { $gt: from },
      ...blockingQuery(),
    }).populate({ path: 'room', select: 'name' });

    const dates = Array.from({ length: days }, (_, i) => new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10));
    const counts = {};
    rooms.forEach((r) => { counts[r._id] = new Array(days).fill(0); });
    for (const b of bookings) {
      const arr = counts[b.room?._id];
      if (!arr) continue;
      for (let i = 0; i < days; i += 1) {
        const day = from.getTime() + i * 86400000;
        if (b.checkIn.getTime() <= day && b.checkOut.getTime() > day) arr[i] += b.roomCount || 1;
      }
    }
    res.json({
      success: true,
      data: {
        dates,
        rooms: rooms.map((r) => ({ _id: r._id, name: r.name, totalUnits: r.totalUnits, status: r.status })),
        counts,
        bookings,
      },
    });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, paymentStatus, from, to, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (from || to) {
      filter.checkIn = {};
      if (from) filter.checkIn.$gte = parseDay(from);
      if (to) filter.checkIn.$lte = parseDay(to);
    }
    if (q && q.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), 'i');
      filter.$or = [{ reference: rx }, { 'guest.firstName': rx }, { 'guest.lastName': rx }, { 'guest.email': rx }, { 'guest.phone': rx }];
    }
    const bookings = await Booking.find(filter).populate(populateRoom).sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data: bookings });
  })
);

// Admin-created booking (phone / walk-in). Availability is still enforced.
router.post(
  '/manual',
  requireAuth,
  [
    body('roomId').notEmpty(),
    body('checkIn').notEmpty(),
    body('checkOut').notEmpty(),
    body('occupancy').isArray({ min: 1, max: 50 }),
    body('occupancy.*.type').isIn(['single', 'double']),
    body('guest.firstName').trim().notEmpty(),
    body('guest.phone').trim().notEmpty(),
    body('guest.email').optional({ checkFalsy: true }).isEmail(),
    body('status').optional().isIn(STATUSES),
    body('totalOverride').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('amountReceived').optional({ checkFalsy: true }).isFloat({ min: 0 }),
    body('paymentMethod').optional().isIn(['cash', 'upi', 'card', 'bank', 'other']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const { roomId, checkIn, checkOut, guest, notes } = req.body;
    const occupancy = normalizeOccupancy(req.body);
    const roomCount = occupancy.length;
    const hasOverride = req.body.totalOverride !== undefined && req.body.totalOverride !== '' && req.body.totalOverride !== null;

    const room = await Room.findById(roomId);
    if (!room) throw httpError(404, 'Room not found');
    if (room.status === 'inactive') throw httpError(422, 'This room type is inactive');

    const stay = await evaluateStay({ room, checkIn, checkOut, occupancy, settings, allowPast: true, requirePricing: !hasOverride });
    let { pricing } = stay;
    if (hasOverride) {
      const total = round2(Number(req.body.totalOverride));
      pricing = { ...pricing, nightlyTotal: round2(total / stay.nights), subtotal: total, taxPercent: 0, taxAmount: 0, totalAmount: total };
    }

    const booking = new Booking({
      reference: generateBookingReference(),
      room: room._id,
      roomCount,
      occupancy,
      checkIn: stay.inDate,
      checkOut: stay.outDate,
      nights: stay.nights,
      guest: {
        firstName: guest.firstName,
        lastName: guest.lastName || '',
        email: guest.email || '',
        phone: guest.phone,
        specialRequests: guest.specialRequests || '',
      },
      pricePerNight: pricing.nightlyTotal,
      subtotal: pricing.subtotal,
      taxPercent: pricing.taxPercent,
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      status: req.body.status || 'confirmed',
      source: 'admin',
      notes: notes || '',
      holdExpiresAt: null,
    });
    const received = round2(Number(req.body.amountReceived) || 0);
    if (received > 0) {
      booking.payments.push({ amount: received, method: req.body.paymentMethod || 'cash', note: 'Recorded at booking' });
      booking.amountPaid = received;
    }
    booking.paymentStatus = paymentStateFor(booking);
    await booking.save();
    res.status(201).json({ success: true, data: await booking.populate(populateRoom) });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate(populateRoom);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, data: booking });
  })
);

// Edit guest details / notes / stay (dates, rooms, guests). Re-prices if the stay changes.
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw httpError(404, 'Booking not found');
    const b = req.body;

    if (b.guest) {
      ['firstName', 'lastName', 'email', 'phone', 'specialRequests'].forEach((k) => {
        if (b.guest[k] !== undefined) booking.guest[k] = b.guest[k];
      });
    }
    if (b.notes !== undefined) booking.notes = b.notes;

    const stayChanged = ['checkIn', 'checkOut', 'roomCount', 'occupancy'].some((k) => b[k] !== undefined);
    if (stayChanged) {
      if (['cancelled', 'completed'].includes(booking.status)) {
        throw httpError(422, `Cannot change the stay of a ${booking.status} booking`);
      }
      const settings = await getSettings();
      const room = await Room.findById(booking.room);
      const checkIn = b.checkIn || booking.checkIn;
      const checkOut = b.checkOut || booking.checkOut;
      let occupancy;
      if (Array.isArray(b.occupancy) && b.occupancy.length) {
        occupancy = normalizeOccupancy({ occupancy: b.occupancy });
      } else {
        const count = b.roomCount !== undefined ? parseInt(b.roomCount, 10) : booking.roomCount;
        const existing = (booking.occupancy || []).map((o) => ({ type: o.type || 'single' }));
        occupancy = Array.from({ length: count }, (_, i) => existing[i] || { type: existing[0]?.type || 'single' });
      }
      const stay = await evaluateStay({
        room, checkIn, checkOut, occupancy, settings, excludeBookingId: booking._id, allowPast: true,
      });
      booking.checkIn = stay.inDate;
      booking.checkOut = stay.outDate;
      booking.nights = stay.nights;
      booking.roomCount = occupancy.length;
      booking.occupancy = occupancy;
      booking.pricePerNight = stay.pricing.nightlyTotal;
      booking.subtotal = stay.pricing.subtotal;
      booking.taxPercent = stay.pricing.taxPercent;
      booking.taxAmount = stay.pricing.taxAmount;
      booking.totalAmount = stay.pricing.totalAmount;
      booking.paymentStatus = paymentStateFor(booking);
    }
    await booking.save();
    res.json({ success: true, data: await booking.populate(populateRoom) });
  })
);

router.put(
  '/:id/status',
  requireAuth,
  [body('status').isIn(STATUSES)],
  validate,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    // Re-opening a cancelled booking must still fit in stock.
    if (booking.status === 'cancelled' && req.body.status !== 'cancelled') {
      const room = await Room.findById(booking.room);
      const taken = await countOverlappingBookings(booking.room, booking.checkIn, booking.checkOut, booking._id);
      if (!room || taken + booking.roomCount > room.totalUnits) {
        throw httpError(409, 'Cannot re-open: those rooms are booked by someone else for these dates');
      }
    }
    booking.status = req.body.status;
    if (req.body.status !== 'pending') booking.holdExpiresAt = null;
    await booking.save();
    res.json({ success: true, data: await booking.populate(populateRoom) });
  })
);

// Record money received outside Razorpay (cash / UPI at desk / card machine ...)
router.post(
  '/:id/payments',
  requireAuth,
  [
    body('amount').isFloat({ gt: 0 }),
    body('method').isIn(['cash', 'upi', 'card', 'bank', 'other']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw httpError(404, 'Booking not found');
    const amount = round2(Number(req.body.amount));
    booking.payments.push({ amount, method: req.body.method, note: req.body.note || '' });
    booking.amountPaid = round2(booking.amountPaid + amount);
    booking.paymentStatus = paymentStateFor(booking);
    await booking.save();
    res.json({ success: true, data: await booking.populate(populateRoom) });
  })
);

// Refund: through Razorpay (original payment) or record a manual (cash) refund
router.post(
  '/:id/refund',
  requireAuth,
  [body('amount').isFloat({ gt: 0 }), body('mode').isIn(['razorpay', 'manual'])],
  validate,
  asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw httpError(404, 'Booking not found');
    const amount = round2(Number(req.body.amount));
    const refundable = round2(booking.amountPaid - booking.amountRefunded);
    if (amount > refundable + 0.009) throw httpError(422, `Cannot refund more than ₹${refundable.toFixed(2)}`);

    if (req.body.mode === 'razorpay') {
      let remaining = amount;
      for (const p of booking.payments.filter((x) => x.method === 'razorpay' && x.razorpayPaymentId)) {
        if (remaining <= 0.009) break;
        const alreadyRefunded = booking.refunds
          .filter((r) => r.razorpayPaymentId === p.razorpayPaymentId)
          .reduce((s, r) => s + r.amount, 0);
        const canRefund = round2(p.amount - alreadyRefunded);
        if (canRefund <= 0.009) continue;
        const part = round2(Math.min(remaining, canRefund));
        const refund = await refundPayment(p.razorpayPaymentId, part, { reference: booking.reference });
        booking.refunds.push({ amount: part, razorpayRefundId: refund.id, razorpayPaymentId: p.razorpayPaymentId, method: 'razorpay', note: req.body.note || '' });
        booking.amountRefunded = round2(booking.amountRefunded + part);
        remaining = round2(remaining - part);
        await booking.save(); // persist each successful refund immediately
      }
      if (remaining > 0.009) {
        throw httpError(422, `Only part of this could be refunded via Razorpay (₹${remaining.toFixed(2)} left — refund that part manually)`);
      }
    } else {
      booking.refunds.push({ amount, method: 'manual', note: req.body.note || '' });
      booking.amountRefunded = round2(booking.amountRefunded + amount);
    }
    booking.paymentStatus = paymentStateFor(booking);
    await booking.save();
    res.json({ success: true, data: await booking.populate(populateRoom) });
  })
);

export default router;