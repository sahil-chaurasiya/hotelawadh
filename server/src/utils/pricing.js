/**
 * Tariff logic (matches the hotel's printed tariff card), per ROOM per night:
 *   Single occupancy -> room.price
 *   Double occupancy -> room.priceDouble (falls back to room.price when 0)
 * Taxes (GST) come from Admin > Settings and are added on the total.
 *
 * All maths is done in integer paise to avoid floating point errors.
 */
const toPaise = (n) => Math.round((Number(n) || 0) * 100);
const toRupees = (p) => p / 100;
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const OCCUPANCY_TYPES = ['single', 'double'];

/** The two tariff numbers, with a fallback (e.g. a suite that only has a double rate). */
export function tariffOf(room) {
  const single = room.price > 0 ? room.price : room.priceDouble > 0 ? room.priceDouble : 0;
  const double = room.priceDouble > 0 ? room.priceDouble : single;
  return { single, double };
}

export function pricingConfigured(room) {
  const t = tariffOf(room);
  return t.single > 0 && t.double > 0;
}

export const occupancyLabel = (type) => (type === 'single' ? 'Single occupancy' : 'Double occupancy');

/** Nightly rate (rupees) for ONE room. */
export function roomNightRate(room, type) {
  const t = tariffOf(room);
  return type === 'single' ? t.single : t.double;
}

/** occupancy: [{ type: 'single' | 'double' }, ...] one entry per room */
export function priceStay({ room, occupancy, nights, taxPercent = 0, advancePercent = 100 }) {
  const lines = occupancy.map((o, i) => ({
    room: i + 1,
    type: o.type,
    label: occupancyLabel(o.type),
    perNight: roomNightRate(room, o.type),
  }));
  const nightlyPaise = lines.reduce((s, l) => s + toPaise(l.perNight), 0);
  const subtotalPaise = nightlyPaise * nights;
  const taxPaise = Math.round((subtotalPaise * (Number(taxPercent) || 0)) / 100);
  const totalPaise = subtotalPaise + taxPaise;
  const payNowPaise = Math.round((totalPaise * (Number(advancePercent) || 100)) / 100);
  return {
    lines: lines.map((l) => ({ ...l, stayTotal: toRupees(toPaise(l.perNight) * nights) })),
    nights,
    nightlyTotal: toRupees(nightlyPaise),
    subtotal: toRupees(subtotalPaise),
    taxPercent: Number(taxPercent) || 0,
    taxAmount: toRupees(taxPaise),
    totalAmount: toRupees(totalPaise),
    payNow: toRupees(payNowPaise),
    payLater: toRupees(totalPaise - payNowPaise),
  };
}

/** Returns an error message or null. occupancy: [{ type }] */
export function validateOccupancy(occupancy) {
  if (!Array.isArray(occupancy) || occupancy.length < 1) return 'Select at least 1 room';
  if (occupancy.some((o) => !OCCUPANCY_TYPES.includes(o.type))) return 'Choose single or double occupancy for every room';
  return null;
}