import { Router } from 'express';
import { ObjectId } from 'mongodb';
import asyncHandler from 'express-async-handler';

const router = Router();

export default function classesRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {

  // GET all classes
  router.get('/', asyncHandler(async (req, res) => {
    const key = cacheKey('classes', req.userId);

    const cachedData = cache.get(key);
    if (cachedData) {
      console.log('Serving from cache:', key);
      return res.json(cachedData);
    }

    const classes = await db.collection('classes')
      .find({ userId: req.userId })
      .sort({ dayIndex: 1, startTime: 1, createdAt: -1 })
      .toArray();

    cache.set(key, classes);
    console.log('Data cached:', key);

    res.json(classes);
  }));

  // POST new class
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const missing = requireFields(body, ['subject', 'day', 'startTime', 'endTime']);

    if (missing.length) {
      return res.status(400).json({ message: 'Missing fields', missing });
    }

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayIndex = days.indexOf(String(body.day).slice(0, 3).toLowerCase());

    const newDoc = {
      subject: String(body.subject).trim(),
      instructor: body.instructor ? String(body.instructor).trim() : '',
      day: String(body.day),
      dayIndex: dayIndex >= 0 ? dayIndex : 0,
      startTime: String(body.startTime),
      endTime: String(body.endTime),
      color: body.color || '#45b7d1',
      userId: req.userId,
      email: req.decodedEmail,
      createdAt: new Date(),
    };


    const result = await db.collection('classes').insertOne(newDoc);

    // Invalidate relevant caches
    invalidate('classes', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Class created, cache invalidated');

    res.status(201).json({ ...newDoc, _id: result.insertedId });
  }));

  // PUT update class
  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updatedClass = { ...req.body, updatedAt: new Date() };
    delete updatedClass._id;
    delete updatedClass.userId;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (updatedClass.day) {
      const dayIndex = days.indexOf(String(updatedClass.day));
      if (dayIndex !== -1) updatedClass.dayIndex = dayIndex;
      else return res.status(400).json({ message: 'Invalid day provided' });
    }

    const result = await db.collection('classes').updateOne(
      { _id: new ObjectId(id), userId: req.userId },
      { $set: updatedClass }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Class not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('classes', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Class updated, cache invalidated');

    res.json({
      message: 'Class updated successfully',
      updated: result.modifiedCount
    });
  }));

  // DELETE class
  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('classes').deleteOne(
      { _id: new ObjectId(id), userId: req.userId }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Class not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('classes', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Class deleted, cache invalidated');

    res.json({
      message: 'Class deleted successfully',
      deleted: result.deletedCount
    });
  }));

  return router;
}