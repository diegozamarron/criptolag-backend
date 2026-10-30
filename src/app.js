import express from 'express';
import cors from 'cors';
import { CORS_ORIGINS } from './config.js';
import webhookRoutes from './routes/webhook.js';
import checkoutRoutes from './routes/checkout.js';
import bankTransferRoutes from './routes/bankTransfers.js';
import crlRoutes from './routes/crl.js';
import userRoutes from './routes/users.js';
import tokenInfoRoutes from './routes/tokenInfo.js';

const app = express();

app.disable('x-powered-by');

app.use(cors({
  origin: CORS_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// The Stripe webhook reads the raw body, so it goes before the JSON parser
app.use(webhookRoutes);

app.use(express.json({ limit: '10kb' }));

app.use(checkoutRoutes);
app.use(bankTransferRoutes);
app.use(crlRoutes);
app.use(userRoutes);
app.use(tokenInfoRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Malformed JSON and anything else unhandled: answer in JSON, never with a stack trace
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
