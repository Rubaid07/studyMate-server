import { Router } from 'express';
import { ObjectId } from 'mongodb';

const router = Router();

export default function plannerRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {
  router.get('/', async (req, res) => {
    const key = cacheKey('planner', req.userId);
    if (cache.has(key)) return res.json(cache.get(key));
    const plannerEntries = await db.collection('planner')
      .find({ userId: req.userId })
      .sort({ dueDate: 1, createdAt: -1 })
      .toArray();
    cache.set(key, plannerEntries);
    res.json(plannerEntries);
  });

  router.post('/', async (req, res) => {
    const body = req.body || {};
    const missing = requireFields(body, ['title', 'dueDate']);
    if (missing.length) return res.status(400).json({ message: 'Missing fields', missing });

    const newEntry = {
      title: String(body.title).trim(),
      description: body.description ? String(body.description).trim() : '',
      dueDate: new Date(body.dueDate),
      status: body.status || 'pending',
      priority: body.priority || 'medium',
      userId: req.userId,
      createdAt: new Date(),
    };

    const result = await db.collection('planner').insertOne(newEntry);
    invalidate('planner', req.userId);
    res.status(201).json({ ...newEntry, _id: result.insertedId });
  });

  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID format' });

    const updatedEntry = { ...req.body, updatedAt: new Date() };
    delete updatedEntry._id;
    delete updatedEntry.userId;

    if (updatedEntry.dueDate) updatedEntry.dueDate = new Date(updatedEntry.dueDate);

    const result = await db.collection('planner').updateOne(
      { _id: new ObjectId(id), userId: req.userId },
      { $set: updatedEntry }
    );

    if (result.matchedCount === 0) return res.status(404).json({ message: 'Planner task not found or unauthorized' });
    invalidate('planner', req.userId);
    res.json({ message: 'Planner task updated successfully' });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID format' });

    const result = await db.collection('planner').deleteOne({ _id: new ObjectId(id), userId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Planner task not found or unauthorized' });
    invalidate('planner', req.userId);
    res.json({ message: 'Planner task deleted successfully' });
  });

  return router;
}
