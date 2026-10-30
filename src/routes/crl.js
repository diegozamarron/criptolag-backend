import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { HttpError, sendError } from '../lib/httpError.js';
import { isDocId, isPositiveAmount, isUsername } from '../lib/validate.js';
import { requireAuth, requireCustomer, requireVendor } from '../middleware/auth.js';
import { addHistory } from '../services/balances.js';
import { crlToMxn } from '../services/pricing.js';

const router = express.Router();

// A customer pays a restaurant from their CRL balance
router.post('/send-crl', requireAuth, requireCustomer, async (req, res) => {
  const { restaurantUid, amount } = req.body;

  if (!isDocId(restaurantUid) || !isPositiveAmount(amount)) {
    return res.status(400).json({ error: 'Invalid request parameters.' });
  }

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const restaurantRef = db.collection('restaurants').doc(restaurantUid);

    const { userUsername, restaurantEmail } = await db.runTransaction(async (transaction) => {
      const [userSnap, restaurantSnap] = await transaction.getAll(userRef, restaurantRef);
      if (!userSnap.exists) {
        throw new HttpError(404, 'User not found.');
      }
      if (!restaurantSnap.exists) {
        throw new HttpError(404, 'Restaurant not found.');
      }

      const user = userSnap.data();
      const restaurant = restaurantSnap.data();
      if ((user.crlBalance || 0) < amount) {
        throw new HttpError(400, 'Insufficient CRL balance.');
      }

      transaction.update(userRef, { crlBalance: FieldValue.increment(-amount) });
      transaction.update(restaurantRef, { balance: FieldValue.increment(amount) });
      addHistory(transaction, {
        type: 'send',
        userUid: req.user.uid,
        userUsername: user.username,
        restaurantUid,
        restaurantEmail: restaurant.email || null,
        amountCRL: amount,
        amountMXN: crlToMxn(amount),
      });
      return { userUsername: user.username, restaurantEmail: restaurant.email };
    });

    console.log(`${userUsername} paid ${amount} CRL to ${restaurantEmail}`);
    res.json({ success: true, message: 'CRL tokens sent successfully.' });
  } catch (err) {
    sendError(res, err, '/send-crl', 'Could not send CRL.');
  }
});

// A vendor hands out CRL from its own resale balance to a customer, by username
router.post('/credit-user', requireAuth, requireVendor, async (req, res) => {
  const { username: userUsername, crlAmount } = req.body;

  if (!isUsername(userUsername) || !isPositiveAmount(crlAmount)) {
    return res.status(400).json({ error: 'Invalid request parameters.' });
  }

  try {
    const usernameDoc = await db.collection('usernames').doc(userUsername).get();
    if (!usernameDoc.exists || !usernameDoc.data().uid) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const userUid = usernameDoc.data().uid;
    const userRef = db.collection('users').doc(userUid);
    // Always the signed-in vendor (set by requireVendor), so a vendor
    // can only give out CRL from its own balance.
    const restaurantRef = req.restaurantRef;

    const vendorEmail = await db.runTransaction(async (transaction) => {
      const [restaurantSnap, userSnap] = await transaction.getAll(restaurantRef, userRef);
      if (!userSnap.exists) {
        throw new HttpError(404, 'User not found.');
      }

      const restaurant = restaurantSnap.data();
      const restaurantBalance = typeof restaurant?.balance === 'number' ? restaurant.balance : 0;
      if (restaurantBalance < crlAmount) {
        throw new HttpError(400, 'Insufficient restaurant balance.');
      }

      transaction.update(restaurantRef, { balance: FieldValue.increment(-crlAmount) });
      transaction.update(userRef, { crlBalance: FieldValue.increment(crlAmount) });
      addHistory(transaction, {
        type: 'sell',
        userUid,
        userUsername,
        restaurantUid: req.user.uid,
        restaurantEmail: restaurant?.email || null,
        amountCRL: crlAmount,
        amountMXN: crlToMxn(crlAmount),
      });
      return restaurant?.email || null;
    });

    console.log(`${vendorEmail} credited ${crlAmount} CRL to ${userUsername}`);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, '/credit-user', 'Could not credit the user.');
  }
});

export default router;
