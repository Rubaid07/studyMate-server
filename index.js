import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';

// routes
import classesRoutes from './routes/classes.js';
import plannerRoutes from './routes/planner.js';
import budgetRoutes from './routes/budget.js';
import summaryRoutes from './routes/summary.js';
import qaRoutes from './routes/qa.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'studymate';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const app = express();

// cache setup
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const cacheKey = (name, userId) => `${name}:${userId}`;
const invalidate = (name, userId) => cache.del(cacheKey(name, userId));

app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// ---------------- MongoDB ----------------
if (!MONGO_URI) {
  console.error('MONGO_URI missing');
  process.exit(1);
}
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(DB_NAME);
console.log('MongoDB connected');

// ---------------- Firebase Admin ----------------
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const svc = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString());
  admin.initializeApp({ credential: admin.credential.cert(svc) });
} else {
  admin.initializeApp();
}

// ---------------- Rate limiter ----------------
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

// ---------------- Auth Middleware ----------------
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = await admin.auth().verifyIdToken(token);
      req.userId = decoded.uid;
      return next();
    }
    const devUid = req.headers['x-user-id'];
    if (devUid) {
      req.userId = devUid;
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized: token or x-user-id required' });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', error: err.message });
  }
};

// ---------------- Utility functions ----------------
const isValidObjectId = (id) => {
  try {
    return Boolean(new ObjectId(id));
  } catch {
    return false;
  }
};

const requireFields = (obj, fields) => {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  return missing;
};

// ---------------- Routes ----------------
app.get('/', (_req, res) => res.send('Backend running'));
app.get('/health', (_req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Apply auth middleware to all API routes
app.use('/api', authMiddleware);

app.use('/api/classes', classesRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));
app.use('/api/planner', plannerRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));
app.use('/api/budget', budgetRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));
app.use('/api/summary', summaryRoutes(db, cache, cacheKey, invalidate));
app.use('/api/qa', qaRoutes(GEMINI_API_KEY));

// ---------------- Error handler ----------------
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// ---------------- Start server ----------------
const server = app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  await client.close();
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);