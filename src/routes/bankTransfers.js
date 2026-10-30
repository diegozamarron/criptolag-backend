import crypto from 'crypto';
import express from 'express';
import { db } from '../lib/firebase.js';
import { HttpError, sendError } from '../lib/httpError.js';
import { isDocId, isPositiveAmount } from '../lib/validate.js';
import { BANK_CLABE } from '../config.js';
import { requireAuth, requireBuyer, requireAdmin } from '../middleware/auth.js';
import { creditTarget, addHistory } from '../services/balances.js';
import { getTokenInfo } from '../services/pricing.js';

const router = express.Router();

const REF_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Random 8-character alphanumeric reference the buyer puts on their transfer
const generateReferenceNumber = () => {
  let ref = '';
  for (let i = 0; i < 8; i++) {
    ref += REF_CHARS.charAt(crypto.randomInt(REF_CHARS.length));
  }
  return ref;
};

const listTransfers = async (query) => {
  const snapshot = await query.get();
  // Attach the Firestore doc ID for client-side actions
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

router.post('/create-bank-transfer', requireAuth, requireBuyer, async (req, res) => {
  const userUid = req.user.uid;
  const { amountCRL } = req.body;

  if (!isPositiveAmount(amountCRL)) {
    return res.status(400).json({ error: 'Invalid request parameters.' });
  }

  // The buyer needs to know how many pesos to send, so a price is required
  const tokenInfo = getTokenInfo();
  if (!tokenInfo) {
    return res.status(503).json({ error: 'Token price information is not available at the moment.' });
  }

  try {
    const userDoc = await db.collection('users').doc(userUid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const referenceNumber = generateReferenceNumber();
    const amountMXN = Math.round(amountCRL * tokenInfo.price_mxn * 100) / 100;

    await db.collection('bank_transfers').add({
      userUid,
      userUsername: userDoc.data().username,
      buyerType: req.user.vendor ? 'vendor' : 'customer',
      amountCRL,
      amountMXN,
      referenceNumber,
      status: 'pending',
      CLABE: BANK_CLABE,
      createdAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      referenceNumber,
      amountMXN,
      CLABE: BANK_CLABE,
      message: 'Bank transfer created successfully.',
    });
  } catch (err) {
    sendError(res, err, '/create-bank-transfer', 'Failed to create bank transfer.');
  }
});

// The signed-in user's own pending transfers
router.get('/get-pending-bank-transfers', requireAuth, async (req, res) => {
  try {
    const transfers = await listTransfers(
      db.collection('bank_transfers')
        .where('userUid', '==', req.user.uid)
        .where('status', '==', 'pending'),
    );
    res.json({ transfers });
  } catch (err) {
    sendError(res, err, '/get-pending-bank-transfers', 'Failed to fetch pending bank transfers.');
  }
});

// Every pending transfer, for admins to review
router.get('/get-pending-bank-transfers-admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const transfers = await listTransfers(
      db.collection('bank_transfers').where('status', '==', 'pending'),
    );
    res.json({ transfers });
  } catch (err) {
    sendError(res, err, '/get-pending-bank-transfers-admin', 'Failed to fetch all pending bank transfers.');
  }
});

// Credits the buyer and marks the transfer approved
router.post('/approve-bank-transfer', requireAuth, requireAdmin, async (req, res) => {
  const { transferId } = req.body;

  if (!isDocId(transferId)) {
    return res.status(400).json({ error: 'Missing transferId parameter.' });
  }

  try {
    const transferRef = db.collection('bank_transfers').doc(transferId);

    const transferData = await db.runTransaction(async (transaction) => {
      // Checked inside the transaction so two admins approving at once can't credit twice
      const transferSnap = await transaction.get(transferRef);
      if (!transferSnap.exists) {
        throw new HttpError(404, 'Transfer not found.');
      }
      const transfer = transferSnap.data();
      if (transfer.status !== 'pending') {
        throw new HttpError(400, 'Transfer is not pending.');
      }

      const isVendor = transfer.buyerType === 'vendor';
      const target = creditTarget(transfer.userUid, isVendor);
      const targetDoc = await transaction.get(target.ref);
      if (!targetDoc.exists) {
        throw new HttpError(404, 'Account not found.');
      }

      const newBalance = (targetDoc.data()[target.field] || 0) + transfer.amountCRL;
      transaction.update(target.ref, { [target.field]: newBalance });
      transaction.update(transferRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: req.user.uid,
      });
      addHistory(transaction, {
        type: 'bank_transfer',
        userUid: transfer.userUid,
        userUsername: transfer.userUsername,
        buyerType: isVendor ? 'vendor' : 'customer',
        amountCRL: transfer.amountCRL,
        amountMXN: transfer.amountMXN,
        referenceNumber: transfer.referenceNumber,
      });
      return transfer;
    });

    console.log(`Bank transfer ${transferId} approved for ${transferData.userUsername}`);
    res.json({ success: true, message: 'Transfer approved and credited.' });
  } catch (err) {
    sendError(res, err, '/approve-bank-transfer', 'Failed to approve bank transfer.');
  }
});

export default router;
