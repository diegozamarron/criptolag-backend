import express from 'express';
import { auth, db } from '../lib/firebase.js';
import { sendError } from '../lib/httpError.js';
import { isUsername } from '../lib/validate.js';
import { requireAuth, requireVendorOrAdmin } from '../middleware/auth.js';

const router = express.Router();

// Firestore's error code when create() hits a document that already exists
const ALREADY_EXISTS = 6;

// Firebase Auth errors that are the client's fault, with the message to show
const AUTH_ERRORS = {
  'auth/email-already-exists': 'Email is already in use.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/invalid-password': 'Password must be at least 6 characters.',
};

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

// Creates the Firebase Auth account, the users/{uid} profile and the usernames/{username} lookup
router.post('/register-user', async (req, res) => {
  const { email, password, name, username } = req.body;

  if (!isText(email, 254) || !isText(password, 128) || !isText(name, 100) || typeof username !== 'string') {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!isUsername(username) || username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Invalid username. Use 3-30 letters, numbers, and underscores.' });
  }

  const usernameRef = db.collection('usernames').doc(username);

  // Reserve the username first: create() fails if it exists, so two people
  // registering the same name at once can't both get it.
  try {
    await usernameRef.create({ uid: null, reservedAt: new Date().toISOString() });
  } catch (err) {
    if (err.code === ALREADY_EXISTS) {
      return res.status(400).json({ error: 'Username is already taken.' });
    }
    return sendError(res, err, '/register-user', 'Could not create the account.');
  }

  let userRecord = null;
  try {
    userRecord = await auth.createUser({ email, password });

    const batch = db.batch();
    batch.set(db.collection('users').doc(userRecord.uid), {
      name,
      email,
      username,
      createdAt: new Date().toISOString(),
      crlBalance: 0,
      customer: true,
      vendor: false,
      admin: false,
    });
    batch.update(usernameRef, { uid: userRecord.uid });
    await batch.commit();

    res.json({ success: true, uid: userRecord.uid });
  } catch (err) {
    // Undo the partial signup so the username and email can be used again
    await usernameRef.delete().catch(() => {});
    if (userRecord) {
      await auth.deleteUser(userRecord.uid).catch(() => {});
    }

    if (AUTH_ERRORS[err.code]) {
      return res.status(400).json({ error: AUTH_ERRORS[err.code] });
    }
    sendError(res, err, '/register-user', 'Could not create the account.');
  }
});

// Up to 50 usernames, for vendors picking who to credit
router.get('/list-users', requireAuth, requireVendorOrAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users').limit(50).get();
    const usernames = snapshot.docs
      .map((doc) => doc.data().username)
      .filter(Boolean);
    res.json({ usernames });
  } catch (err) {
    sendError(res, err, '/list-users', 'Failed to fetch usernames');
  }
});

export default router;
