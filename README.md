# CriptoLag Backend

Express API behind [criptolag.io](https://criptolag.io). Customers buy CRL tokens by card (Stripe) or bank transfer and spend them at restaurants. Vendors (restaurants) buy CRL in bulk and hand it out to customers. Balances and history live in Firebase Firestore. The CRL price comes from GeckoTerminal and is converted to MXN.

## Project layout

```
src/
├── index.js               Starts the server and the price updater
├── app.js                 Express app: CORS, body parsing, routes
├── config.js              Environment variables and constants
├── lib/
│   ├── firebase.js        Firebase Admin (Firestore + Auth)
│   └── stripe.js          Stripe client
├── middleware/
│   └── auth.js            Firebase ID token check and role guards
├── services/
│   ├── balances.js        Where purchases are credited, history log
│   └── pricing.js         CRL price (GeckoTerminal) and USD→MXN rate cache
└── routes/
    ├── webhook.js         Stripe webhook
    ├── checkout.js        Stripe checkout sessions
    ├── bankTransfers.js   Bank transfer requests and admin approval
    ├── crl.js             Paying restaurants, vendors crediting customers
    ├── users.js           Registration and user list
    └── tokenInfo.js       Current CRL price
```

## Setup

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`, then put your Firebase Admin service account JSON in the project folder and point `FIREBASE_SERVICE_ACCOUNT_PATH` at it. `.gitignore` keeps both `.env` and the key file out of git.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default `3000`) |
| `NODE_ENV` | Set to `production` on the server to drop `localhost` from the allowed CORS origins |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to the Firebase Admin service account JSON |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the `/webhook` endpoint |
| `FOREX_API_KEY` | Currencylayer key for the USD→MXN rate |
| `BANK_CLABE` | CLABE shown to buyers paying by bank transfer |

```bash
npm start      # run
npm run dev    # run and restart on file changes
```

## Authentication and roles

Authenticated routes expect the signed-in user's Firebase ID token:

```
Authorization: Bearer <token from auth.currentUser.getIdToken()>
```

Roles are the boolean fields `customer`, `vendor` and `admin` on `users/{uid}`. A vendor also needs a `restaurants/{uid}` document, which holds its resale balance.

## API

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| `POST` | `/webhook` | Stripe | Credits CRL when a checkout session is paid (each session is credited once, even if Stripe retries) |
| `POST` | `/create-checkout-session` | Customer or vendor | Starts a card checkout. Body: `{ mxnAmount }` (min 20) |
| `POST` | `/create-bank-transfer` | Customer or vendor | Creates a pending bank transfer. Body: `{ amountCRL }`. Returns `referenceNumber`, `amountMXN` and `CLABE` |
| `GET` | `/get-pending-bank-transfers` | Signed in | Your pending bank transfers |
| `GET` | `/get-pending-bank-transfers-admin` | Admin | All pending bank transfers |
| `POST` | `/approve-bank-transfer` | Admin | Credits the buyer and marks the transfer `approved`. Body: `{ transferId }` |
| `POST` | `/send-crl` | Customer | Pays a restaurant. Body: `{ restaurantUid, amount }` |
| `POST` | `/credit-user` | Vendor | Gives CRL from the vendor's balance to a customer. Body: `{ username, crlAmount }` |
| `POST` | `/register-user` | Anyone | Creates an account. Body: `{ email, password, name, username }` (username: 3-30 letters, numbers, underscores) |
| `GET` | `/list-users` | Vendor or admin | Up to 50 usernames |
| `GET` | `/token-info` | Anyone | Current CRL price in MXN (503 if there's no price from the last 15 minutes) |

Errors are always JSON: `{ "error": "message" }`. Unexpected server errors return a generic message; details go to the server log only.

## Firestore collections

- `users/{uid}`: profile, roles, `crlBalance` (customer spending balance)
- `usernames/{username}`: `{ uid }` lookup
- `restaurants/{uid}`: vendor profile, `balance` (resale balance)
- `bank_transfers/{id}`: bank transfer requests, `status` is `pending` or `approved`
- `stripe_sessions/{sessionId}`: Stripe checkout sessions already credited
- `crl_history/{id}`: log written in the same transaction as each balance change. Every entry has `timestamp`, `type` (`purchase`, `send`, `sell` or `bank_transfer`), `amountCRL` and `amountMXN`, plus whichever of `userUid`, `userUsername`, `buyerType`, `restaurantUid`, `restaurantEmail` and `referenceNumber` apply

Balances and roles must only ever be written by this server. Make sure your Firestore security rules don't let the app write `users`, `restaurants`, `usernames`, `bank_transfers`, `stripe_sessions` or `crl_history` directly.
