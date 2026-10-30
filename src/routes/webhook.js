import express from 'express';
import { stripe } from '../lib/stripe.js';
import { db, FieldValue } from '../lib/firebase.js';
import { STRIPE_WEBHOOK_SECRET } from '../config.js';
import { creditTarget, addHistory } from '../services/balances.js';

const router = express.Router();

// Stripe needs the raw body to verify the signature, so this router is mounted
// before express.json() in app.js.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook signature verification failed.');
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;
  const metadata = session.metadata || {};
  const userId = metadata.userId;
  const tokens = parseFloat(metadata.tokens);

  if (session.payment_status !== 'paid') {
    console.warn(`Checkout session ${session.id} completed without payment; not crediting.`);
    return res.json({ received: true });
  }
  if (!userId || !Number.isFinite(tokens) || tokens <= 0) {
    console.error(`Checkout session ${session.id} has bad metadata; not crediting.`, metadata);
    return res.json({ received: true });
  }

  try {
    // Vendors' purchases go to their resale balance, customers' to their spending balance
    const isVendor = metadata.buyerType === 'vendor';
    const target = creditTarget(userId, isVendor);
    // Stripe can deliver the same event more than once; this doc makes sure we credit it once
    const processedRef = db.collection('stripe_sessions').doc(session.id);

    const credited = await db.runTransaction(async (transaction) => {
      if ((await transaction.get(processedRef)).exists) {
        return false;
      }

      transaction.set(target.ref, { [target.field]: FieldValue.increment(tokens) }, { merge: true });
      transaction.set(processedRef, { userId, tokens, processedAt: new Date().toISOString() });
      addHistory(transaction, {
        type: 'purchase',
        userUid: userId,
        buyerType: isVendor ? 'vendor' : 'customer',
        amountCRL: tokens,
        amountMXN: session.amount_total / 100,
      });
      return true;
    });

    if (credited) {
      console.log(`${userId} (${isVendor ? 'vendor' : 'customer'}) bought ${tokens} CRL`);
    }
    res.json({ received: true });
  } catch (err) {
    // A non-2xx response makes Stripe retry later instead of the purchase being lost
    console.error(`Error crediting checkout session ${session.id}:`, err);
    res.status(500).json({ error: 'Could not record the purchase.' });
  }
});

export default router;
