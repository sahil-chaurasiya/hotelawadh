import mongoose from 'mongoose';
import { imageSchema } from './shared/imageSchema.js';

const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // singleton row keyed 'general'
    siteName: { type: String, default: 'Hotel Awadh Palace' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    socialLinks: {
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
    },
    checkInTime: { type: String, default: '12:00 PM' },
    checkOutTime: { type: String, default: '11:00 AM' },
    // ---- Online booking ----
    onlineBookingEnabled: { type: Boolean, default: true },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 }, // GST % added on top of room tariff
    advancePercent: { type: Number, default: 100, min: 1, max: 100 }, // % of total collected online at booking
    maxRoomsPerBooking: { type: Number, default: 5, min: 1 },
    testimonialsBgImage: imageSchema,
    // Per-page hero banner (the dark image behind each page's title +
    // breadcrumb, e.g. "About Us" / "Contact Us"). Optional — pages fall
    // back to their original bundled image until an admin uploads one.
    pageBanners: {
      about: imageSchema,
      contact: imageSchema,
      gallery: imageSchema,
      rooms: imageSchema,
      roomDetail: imageSchema,
      blog: imageSchema,
      blogDetail: imageSchema,
    },
  },
  { timestamps: true }
);

export default mongoose.model('SiteSetting', siteSettingSchema);