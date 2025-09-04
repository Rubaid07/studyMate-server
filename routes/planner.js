import { Router } from 'express';
import { ObjectId } from 'mongodb';
import asyncHandler from 'express-async-handler';

const router = Router();

export default function plannerRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {

  // GET all planner tasks
  router.get('/', asyncHandler(async (req, res) => {
    const key = cacheKey('planner', req.userId);

    const cachedData = cache.get(key);
    if (cachedData) {
      console.log('Serving from cache:', key);
      return res.json(cachedData);
    }

    const plannerEntries = await db.collection('planner')
      .find({ userId: req.userId })
      .sort({ dueDate: 1, createdAt: -1 })
      .toArray();

    cache.set(key, plannerEntries);
    console.log('Data cached:', key);

    res.json(plannerEntries);
  }));

  // POST new planner task
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const missing = requireFields(body, ['title', 'dueDate']);

    if (missing.length) {
      return res.status(400).json({ message: 'Missing fields', missing });
    }

    const newEntry = {
      title: String(body.title).trim(),
      description: body.description ? String(body.description).trim() : '',
      dueDate: new Date(body.dueDate),
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      userId: req.userId,
      email: req.decodedEmail,
      createdAt: new Date(),
    };


    const result = await db.collection('planner').insertOne(newEntry);

    // Invalidate relevant caches
    invalidate('planner', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Planner task created, cache invalidated');

    res.status(201).json({ ...newEntry, _id: result.insertedId });
  }));

  // PUT update planner task
  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updatedEntry = { ...req.body, updatedAt: new Date() };
    delete updatedEntry._id;
    delete updatedEntry.userId;

    if (updatedEntry.dueDate) updatedEntry.dueDate = new Date(updatedEntry.dueDate);

    const result = await db.collection('planner').updateOne(
      { _id: new ObjectId(id), userId: req.userId },
      { $set: updatedEntry }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Planner task not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('planner', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Planner task updated, cache invalidated');

    res.json({
      message: 'Planner task updated successfully',
      updated: result.modifiedCount
    });
  }));

  // DELETE planner task
  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('planner').deleteOne(
      { _id: new ObjectId(id), userId: req.userId }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Planner task not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('planner', req.userId);
    invalidate('dashboard-summary', req.userId);

    console.log('Planner task deleted, cache invalidated');

    res.json({
      message: 'Planner task deleted successfully',
      deleted: result.deletedCount
    });
  }));

  return router;
}