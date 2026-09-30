import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

import authRoutes from './routes/auth.routes.js';
import roomRoutes from './routes/room.routes.js';
import categoryRoutes from './routes/category.routes.js';
import amenityRoutes from './routes/amenity.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import contactRoutes from './routes/contact.routes.js';
import newsletterRoutes from './routes/newsletter.routes.js';
import blogRoutes from './routes/blog.routes.js';
import galleryRoutes from './routes/gallery.routes.js';
import galleryCategoryRoutes from './routes/gallery-categories.routes.js';
import testimonialRoutes from './routes/testimonial.routes.js';
import settingRoutes from './routes/setting.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import adminRoutes from './routes/admin.routes.js';
import heroRoutes from './routes/hero.routes.js';
import aboutRoutes from './routes/about.routes.js';
import aboutSectionRoutes from './routes/about-section.routes.js';
import serviceRoutes from './routes/service.routes.js';
import partnerRoutes from './routes/partner.routes.js';
import teamRoutes from './routes/team.routes.js';
import specializationRoutes from './routes/specialization.routes.js';
import facilityRoutes from './routes/facility.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) put the app behind a reverse proxy.
  // Without this, express-rate-limit throws on every request because it
  // sees an X-Forwarded-For header while 'trust proxy' is still false,
  // and secure cookies / req.ip resolution also break behind the proxy.
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: false }));

  // CLIENT_URL can be a single origin or a comma-separated list (handy for
  // supporting a Vercel production URL + preview deployments at once).
  // Each entry is trimmed and has any trailing slash stripped so
  // "https://x.vercel.app/" still matches the browser's Origin header
  // "https://x.vercel.app".
  const allowedOrigins = env.clientUrl
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // eslint-disable-next-line no-console
  console.log('[cors] allowed origins:', allowedOrigins);

  app.use(cors({
    origin(origin, callback) {
      // No Origin header = same-origin request, curl, server-to-server, etc.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
      // eslint-disable-next-line no-console
      console.warn(`[cors] rejected origin "${origin}" — not in CLIENT_URL (${allowedOrigins.join(', ')})`);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));
  // Keep the raw body so the Razorpay webhook signature can be verified.
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      if (req.originalUrl.startsWith('/api/bookings/razorpay-webhook')) req.rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  app.get('/api/health', (req, res) => res.json({
    success: true,
    status: 'ok',
    env: env.nodeEnv,
    allowedOrigins,
    receivedOrigin: req.headers.origin || null,
  }));

  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/amenities', amenityRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/newsletter', newsletterRoutes);
  app.use('/api/blog', blogRoutes);
  app.use('/api/gallery', galleryRoutes);
  app.use('/api/gallery-categories', galleryCategoryRoutes);
  app.use('/api/testimonials', testimonialRoutes);
  app.use('/api/settings', settingRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/admins', adminRoutes);
  app.use('/api/hero', heroRoutes);
  app.use('/api/about-images', aboutRoutes);
  app.use('/api/about-section', aboutSectionRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/partners', partnerRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/specialization', specializationRoutes);
  app.use('/api/facilities', facilityRoutes);
  
  // Serve the built React app in production — only when it's actually
  // present in this deployment (e.g. a single combined deploy). When the
  // client is deployed separately (Render for the API + Vercel for the
  // client), client/dist won't exist here, so this block is skipped and
  // the API-only server just answers /api/* requests.
  const clientDist = path.join(__dirname, '../../client/dist');
  if (env.nodeEnv === 'production' && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else if (env.nodeEnv === 'production') {
    app.get('/', (req, res) => res.json({ success: true, message: 'Hotel Awadh Palace API is running.' }));
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}