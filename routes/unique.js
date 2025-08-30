import { Router } from 'express';

const router = Router();

export default function uniqueRoutes() {
  router.get('/', (_req, res) => {
    res.json({ message: 'This is your unique feature API endpoint!' });
  });
  return router;
}
