import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From server/src/config/, go up 3 levels to reach project root
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const required = ['MONGODB_URI', 'JWT_SECRET'];
const recommendedForProduction = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];

const missing = required.filter((key) => !process.env[key]);
if (missing.length && process.env.NODE_ENV !== 'test') {
  console.warn(`[env] Missing REQUIRED variables: ${missing.join(', ')}.`);
}

const missingOptional = recommendedForProduction.filter((key) => !process.env[key]);
if (missingOptional.length && process.env.NODE_ENV !== 'test') {
  console.warn(
    `[env] Missing OPTIONAL (dev mode) variables: ${missingOptional.join(', ')}. ` +
      'Image uploads will fail. Get free Cloudinary account at https://cloudinary.com'
  );
}

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn('[env] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set. Online payments will be unavailable.');
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cookieName: process.env.COOKIE_NAME || 'sharan_token',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@sharan.test',
    password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
  },
};