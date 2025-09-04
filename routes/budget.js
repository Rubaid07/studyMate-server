import { Router } from 'express';
import { ObjectId } from 'mongodb';
import asyncHandler from 'express-async-handler';

const router = Router();

export default function budgetRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {
  // GET all budget entries
  router.get('/', asyncHandler(async (req, res) => {
    const key = cacheKey('budget', req.userId);

    // Check cache first
    const cachedData = cache.get(key);
    if (cachedData) {
      console.log('Serving from cache:', key);
      return res.json(cachedData);
    }

    // Fetch from database
    const budgetEntries = await db.collection('budget')
      .find({ userId: req.userId })
      .sort({ date: -1, createdAt: -1 })
      .toArray();

    // Cache the result
    cache.set(key, budgetEntries);
    console.log('Data cached:', key);

    res.json(budgetEntries);
  }));

  // POST new budget entry
  router.post('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const missing = requireFields(body, ['type', 'amount', 'category', 'date']);

    if (missing.length) {
      return res.status(400).json({ message: 'Missing fields', missing });
    }

    const newEntry = {
      type: String(body.type).trim(),
      amount: Number(body.amount),
      category: String(body.category).trim(),
      date: new Date(body.date),
      description: body.description ? String(body.description).trim() : '',
      userId: req.userId,
      email: req.decodedEmail,
      createdAt: new Date(),
    };


    if (isNaN(newEntry.amount) || newEntry.amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const result = await db.collection('budget').insertOne(newEntry);

    // Invalidate relevant caches
    invalidate('budget', req.userId);
    invalidate('dashboard-summary', req.userId);
    invalidate('summary', req.userId);

    console.log('Budget entry created, cache invalidated');

    res.status(201).json({ ...newEntry, _id: result.insertedId });
  }));

  // PUT update budget entry
  router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const updatedEntry = { ...req.body, updatedAt: new Date() };
    delete updatedEntry._id;
    delete updatedEntry.userId;

    if (updatedEntry.date) updatedEntry.date = new Date(updatedEntry.date);
    if (updatedEntry.amount) updatedEntry.amount = Number(updatedEntry.amount);

    const result = await db.collection('budget').updateOne(
      { _id: new ObjectId(id), userId: req.userId },
      { $set: updatedEntry }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Budget entry not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('budget', req.userId);
    invalidate('dashboard-summary', req.userId);
    invalidate('summary', req.userId);

    console.log('Budget entry updated, cache invalidated');

    res.json({
      message: 'Budget entry updated successfully',
      updated: result.modifiedCount
    });
  }));

  // DELETE budget entry
  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('budget').deleteOne(
      { _id: new ObjectId(id), userId: req.userId }
    );

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Budget entry not found or unauthorized' });
    }

    // Invalidate relevant caches
    invalidate('budget', req.userId);
    invalidate('dashboard-summary', req.userId);
    invalidate('summary', req.userId);

    console.log('Budget entry deleted, cache invalidated');

    res.json({
      message: 'Budget entry deleted successfully',
      deleted: result.deletedCount
    });
  }));

  return router;
}