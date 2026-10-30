import express from 'express';
import { getTokenInfo } from '../services/pricing.js';

const router = express.Router();

router.get('/token-info', (req, res) => {
  const tokenInfo = getTokenInfo();
  if (!tokenInfo) return res.status(503).json({ error: 'Token info not ready' });
  res.json(tokenInfo);
});

export default router;
