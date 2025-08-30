import { Router } from 'express';
import { ObjectId } from 'mongodb';

const router = Router();

export default function classesRoutes(db, cache, cacheKey, invalidate, isValidObjectId, requireFields) {
  router.get('/', async (req, res) => {
    const key = cacheKey('classes', req.userId);
    if (cache.has(key)) return res.json(cache.get(key));
    const classes = await db.collection('classes')
      .find({ userId: req.userId })
      .sort({ dayIndex: 1, startTime: 1, createdAt: -1 })
      .toArray();
    cache.set(key, classes);
    res.json(classes);
  });

  router.post('/', async (req, res) => {
    const body = req.body || {};
    const missing = requireFields(body, ['subject', 'day', 'startTime', 'endTime']);
    if (missing.length) return res.status(400).json({ message: 'Missing fields', missing });

    const days = ['sun','mon','tue','wed','thu','fri','sat'];
    const dayIndex = days.indexOf(String(body.day).slice(0,3).toLowerCase());

    const newDoc = {
      subject: String(body.subject).trim(),
      instructor: body.instructor ? String(body.instructor).trim() : '',
      day: String(body.day),
      dayIndex: dayIndex >= 0 ? dayIndex : 0,
      startTime: String(body.startTime),
      endTime: String(body.endTime),
      color: body.color || '#45b7d1',
      userId: req.userId,
      createdAt: new Date(),
    };

    const r = await db.collection('classes').insertOne(newDoc);
    invalidate('classes', req.userId);
    res.status(201).json({ ...newDoc, _id: r.insertedId });
  });

  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID format' });

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

    if (result.matchedCount === 0) return res.status(404).json({ message: 'Class not found or unauthorized' });
    invalidate('classes', req.userId);
    res.json({ message: 'Class updated successfully' });
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID format' });

    const result = await db.collection('classes').deleteOne({ _id: new ObjectId(id), userId: req.userId });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'Class not found or unauthorized' });
    invalidate('classes', req.userId);
    res.json({ message: 'Class deleted successfully' });
  });

  return router;
}
