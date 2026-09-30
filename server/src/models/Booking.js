import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, enum: ['razorpay', 'cash', 'upi', 'card', 'bank', 'other'], default: 'razorpay' },
    razorpayPaymentId: { type: String, default: '' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const refundSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    razorpayRefundId: { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    method: { type: String, enum: ['razorpay', 'manual'], default: 'manual' },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    roomCount: { type: Number, default: 1, min: 1 }, // how many rooms of this type
    // one entry per room: single or double occupancy (drives the tariff)
    occupancy: [new mongoose.Schema({ type: { type: String, enum: ['single', 'double'], default: 'single' } }, { _id: false })],
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true, min: 1 },
    // Legacy only (older bookings). Guest counts are no longer collected.
    guests: {
      adults: { type: Number, default: 0, min: 0 },
      children: { type: Number, default: 0, min: 0 },
    },
    guest: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
      specialRequests: { type: String, default: '' },
    },
    pricePerNight: { type: Number, required: true }, // snapshot: combined nightly tariff for all rooms (before tax)
    subtotal: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true }, // server-calculated (subtotal + tax), never trust client
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'checked-in', 'completed'],
      default: 'pending',
    },
    source: { type: String, enum: ['website', 'admin'], default: 'website' },

    // ---- payment ----
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'refunded', 'failed'],
      default: 'unpaid',
    },
    amountDueOnline: { type: Number, default: 0 }, // what the customer must pay through Razorpay
    amountPaid: { type: Number, default: 0 },
    amountRefunded: { type: Number, default: 0 },
    razorpayOrderId: { type: String, default: '', index: true },
    payments: [paymentSchema],
    refunds: [refundSchema],
    // Pending website bookings only hold inventory until this time.
    // null = holds forever (admin-created bookings).
    holdExpiresAt: { type: Date, default: null },

    notes: { type: String, default: '' }, // internal admin notes
  },
  { timestamps: true }
);

bookingSchema.index({ room: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ status: 1 });

export default mongoose.model('Booking', bookingSchema);