import crypto from 'crypto';
import { env } from './env.js';

const API = 'https://api.razorpay.com/v1';

export function razorpayConfigured() {
  return Boolean(env.razorpay.keyId && env.razorpay.keySecret);
}

async function rzp(path, body) {
  if (!razorpayConfigured()) {
    throw Object.assign(new Error('Online payments are not configured yet'), { status: 503 });
  }
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(json?.error?.description || 'Razorpay request failed'), { status: 502 });
  }
  return json;
}

/** amountRupees -> Razorpay order (amount is sent in paise) */
export function createOrder({ amountRupees, receipt, notes }) {
  return rzp('/orders', {
    amount: Math.round(amountRupees * 100),
    currency: 'INR',
    receipt,
    notes,
  });
}

export function refundPayment(paymentId, amountRupees, notes) {
  return rzp(`/payments/${paymentId}/refund`, {
    amount: Math.round(amountRupees * 100),
    notes,
  });
}

export function fetchPayment(paymentId) {
  return rzp(`/payments/${paymentId}`);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout success signature: HMAC_SHA256(order_id|payment_id, key_secret) */
export function verifyCheckoutSignature(orderId, paymentId, signature) {
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqual(expected, signature || '');
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature || '');
}