import { PORT, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './config.js';
import app from './app.js';
import { startPriceUpdates } from './services/pricing.js';

const missing = Object.entries({ STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET })
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}. See .env.example.`);
  process.exit(1);
}

startPriceUpdates();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
