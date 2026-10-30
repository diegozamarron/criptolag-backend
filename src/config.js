import 'dotenv/config';

export const PORT = Number(process.env.PORT) || 3000;

export const FIREBASE_SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
export const STRIPE_API_VERSION = '2022-11-15';

export const FOREX_API_KEY = process.env.FOREX_API_KEY;

// CLABE shown to buyers who pay by bank transfer
export const BANK_CLABE = process.env.BANK_CLABE || '123456789012345678';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const CORS_ORIGINS = [
  'https://lawngreen-dove-487183.hostingersite.com',
  'https://www.lawngreen-dove-487183.hostingersite.com',
  'https://criptolag.io',
  'https://www.criptolag.io',
  // Local Expo/web dev server
  ...(IS_PRODUCTION ? [] : ['http://localhost:8081']),
];

// The CRL token's pool on GeckoTerminal (Solana)
export const TOKEN_POOL_ADDRESS = '857wGRbkBN7uAKdsdzop4BCQ8ZPeqKX8x3v6JDPbpSnc';
