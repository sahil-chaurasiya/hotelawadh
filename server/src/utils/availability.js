import mongoose from 'mongoose';
import Booking from '../models/Booking.js';

/**
 * Parses 'YYYY-MM-DD' (or any date) into a UTC-midnight Date so that a stay
 * always starts/ends at the same instant regardless of server timezone.
 */
export function parseDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return dt;
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
}

/** "Today" as a UTC-midnight Date, computed in India time (Asia/Kolkata). */
export function todayIST() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // YYYY-MM-DD
  return parseDay(parts);
}

/**
 * Mongo filter for bookings that currently block inventory:
 *  - confirmed / checked-in always block
 *  - pending blocks unless it is a website hold that has expired
 */
function blockingFilter() {
  return {
    $or: [
      { status: { $in: ['confirmed', 'checked-in'] } },
      {
        status: 'pending',
        $or: [{ holdExpiresAt: null }, { holdExpiresAt: { $gt: new Date() } }],
      },
    ],
  };
}

/**
 * Returns how many ROOMS (sum of roomCount) of `roomId` are already taken for
 * the [checkIn, checkOut) range. Overlap test: existing.checkIn < newCheckOut
 * AND existing.checkOut > newCheckIn.
 */
export async function countOverlappingBookings(roomId, checkIn, checkOut, excludeBookingId = null) {
  const match = {
    room: new mongoose.Types.ObjectId(String(roomId)),
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    ...blockingFilter(),
  };
  if (excludeBookingId) match._id = { $ne: new mongoose.Types.ObjectId(String(excludeBookingId)) };
  const agg = await Booking.aggregate([
    { $match: match },
    { $group: { _id: null, rooms: { $sum: { $ifNull: ['$roomCount', 1] } } } },
  ]);
  return agg[0]?.rooms || 0;
}

/** Peak number of rooms of a type in use on any night of the range (for calendars). */
export function blockingQuery() {
  return blockingFilter();
}

export function nightsBetween(checkIn, checkOut) {
  const a = Date.UTC(new Date(checkIn).getUTCFullYear(), new Date(checkIn).getUTCMonth(), new Date(checkIn).getUTCDate());
  const b = Date.UTC(new Date(checkOut).getUTCFullYear(), new Date(checkOut).getUTCMonth(), new Date(checkOut).getUTCDate());
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function assertValidDateRange(checkIn, checkOut, { allowPast = false } = {}) {
  const inDate = parseDay(checkIn);
  const outDate = parseDay(checkOut);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    throw Object.assign(new Error('Invalid check-in/check-out date'), { status: 400 });
  }
  if (!allowPast && inDate < todayIST()) {
    throw Object.assign(new Error('Check-in date cannot be in the past'), { status: 400 });
  }
  if (outDate <= inDate) {
    throw Object.assign(new Error('Check-out date must be after check-in date'), { status: 400 });
  }
  if (nightsBetween(inDate, outDate) > 30) {
    throw Object.assign(new Error('Maximum stay is 30 nights'), { status: 400 });
  }
  return { inDate, outDate };
}