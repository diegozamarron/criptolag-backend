import express from 'express';
import { stripe } from '../lib/stripe.js';
import { sendError } from '../lib/httpError.js';
import { requireAuth, requireBuyer } from '../middleware/auth.js';
import { getTokenInfo } from '../services/pricing.js';

const router = express.Router();

// Starts a Stripe card checkout; the webhook credits the CRL once payment completes.
router.post('/create-checkout-session', requireAuth, requireBuyer, async (req, res) => {
  const mxnAmount = Number(req.body.mxnAmount);
  const userId = req.user.uid;

  if (!Number.isFinite(mxnAmount) || mxnAmount < 20) {
    return res.status(400).json({ error: 'mxnAmount must be a number and at least 20.' });
  }

  const tokenInfo = getTokenInfo();
  if (!tokenInfo) {
    return res.status(503).json({ error: 'Token price information is not available at the moment.' });
  }

  try {
    const tokens = Math.ceil((mxnAmount / tokenInfo.price_mxn) * 100) / 100; // round up to 2 decimals

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: { name: 'CRL Token' },
            unit_amount: Math.round(mxnAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: {
        userId,
        tokens: tokens.toString(),
        buyerType: req.user.vendor ? 'vendor' : 'customer',
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    sendError(res, err, '/create-checkout-session', 'Could not start the checkout.');
  }
});

export default router;
