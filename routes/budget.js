import { Router } from 'express';
import { ObjectId } from 'mongodb';
import asyncHandler from 'express-async-handler';

const router = Router();

export default function plannerRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {
  router.get('/', asyncHandler(async (req, res) => {
    const key = cacheKey('budget', req.userId);
    if (cache.has(key)) return res.json(cache.get(key));
    const budgetEntries = await db.collection('budget')
      .find({ userId: req.userId })
      .sort({ date: -1, createdAt: -1 })
      .toArray();
    cache.set(key, budgetEntries);
    res.json(budgetEntries);
  }));

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
      createdAt: new Date(),
    };

    if (isNaN(newEntry.amount) || newEntry.amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a positive number' });
    }

    const result = await db.collection('budget').insertOne(newEntry);
    invalidate('budget', req.userId);
    res.status(201).json({ ...newEntry, _id: result.insertedId });
  }));

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
    invalidate('budget', req.userId);
    res.json({ message: 'Budget entry updated successfully' });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID format' });
    }

    const result = await db.collection('budget').deleteOne({ _id: new ObjectId(id), userId: req.userId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Budget entry not found or unauthorized' });
    }
    invalidate('budget', req.userId);
    res.json({ message: 'Budget entry deleted successfully' });
  }));

  return router;
}
