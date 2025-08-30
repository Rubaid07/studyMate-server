import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import cors from 'cors';
import fetch from 'node-fetch';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import NodeCache from 'node-cache';
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import * as admin from 'firebase-admin';
import classesRoutes from './routes/classes.js';
import qaRoutes from './routes/qa.js';
import plannerRoutes from './routes/planner.js';
import budgetRoutes from './routes/budget.js';
import uniqueRoutes from './routes/unique.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'studymate';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(helmet());
app.use(compression());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const cacheKey = (name, userId) => `${name}:${userId}`;
const invalidate = (name, userId) => cache.del(cacheKey(name, userId));

let firebaseEnabled = false;
try {
  if (!admin.getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const svc = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
      );
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      firebaseEnabled = true;
    } else {
      admin.initializeApp();
      firebaseEnabled = true;
    }
  } else {
    firebaseEnabled = true;
  }
} catch {
  firebaseEnabled = false;
}

const authMiddleware = asyncHandler(async (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (firebaseEnabled && auth.startsWith('Bearer ')) {
    const token = auth.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.userId = decoded.uid;
    return next();
  }
  const devUid = req.headers['x-user-id'];
  if (devUid) {
    req.userId = String(devUid);
    return next();
  }
  return res.status(401).json({ message: 'Unauthorized: token or x-user-id required' });
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req, res) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

if (!MONGO_URI) {
  console.error('❌ MONGO_URI missing in .env');
  process.exit(1);
}
const mongoClient = new MongoClient(MONGO_URI);
let db;
async function connectToMongo() {
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);
  console.log('✅ Connected to MongoDB:', DB_NAME);
}
await connectToMongo();

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

app.get('/', (_req, res) => res.send('StudyMate Backend is running!'));
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use(authMiddleware);

// ===================== classes =====================
app.use('/api/classes', classesRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));

// ===================== GEMINI Q&A =====================
app.use('/api', qaRoutes(GEMINI_API_KEY));

// ===================== STUDY PLANNER =====================
app.use('/api/planner', plannerRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));

// ===================== BUDGET TRACKER =====================
app.use('/api/budget', budgetRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields));
// ================

app.use('/api/unique-feature', uniqueRoutes());

app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error('💥 Global Error:', err);
  res.status(500).json({ message: 'Something went wrong', error: err?.message || String(err) });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`\n⏳ Received ${signal}, closing server...`);
  server.close(async () => {
    await mongoClient.close();
    console.log('🛑 Closed MongoDB connection. Bye!');
    process.exit(0);
  });
};
['SIGINT','SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
