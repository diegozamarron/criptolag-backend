import { auth, db } from '../lib/firebase.js';

// The app sends the signed-in user's Firebase ID token on every request:
//   Authorization: Bearer <token from auth.currentUser.getIdToken()>
// requireAuth verifies the token with Firebase and puts the caller's uid on req.user.
// Routes use req.user.uid instead of trusting a uid sent in the request body,
// so nobody can act on another person's account.
export const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Missing sign-in token.' });
  }
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    // Roles are three true/false fields on the user's Firestore document,
    // set in the Firebase console: customer, vendor and admin.
    const userSnap = await db.collection('users').doc(decoded.uid).get();
    const data = userSnap.exists ? userSnap.data() : {};
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      customer: data.customer === true,
      vendor: data.vendor === true,
      admin: data.admin === true,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired sign-in token.' });
  }
};

export const requireCustomer = (req, res, next) => {
  if (!req.user || !req.user.customer) {
    return res.status(403).json({ error: 'Customers only.' });
  }
  next();
};

// Buying CRL: customers buy to spend; vendors (resellers) buy to hand out to customers.
export const requireBuyer = (req, res, next) => {
  if (!req.user || !(req.user.customer || req.user.vendor)) {
    return res.status(403).json({ error: 'Only customers and vendors can buy CRL.' });
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.admin) {
    return res.status(403).json({ error: 'Admins only.' });
  }
  next();
};

export const requireVendorOrAdmin = (req, res, next) => {
  if (!req.user || !(req.user.vendor || req.user.admin)) {
    return res.status(403).json({ error: 'Vendors and admins only.' });
  }
  next();
};

// Vendors need vendor: true and a document in the restaurants collection (which holds their balance).
export const requireVendor = async (req, res, next) => {
  if (!req.user || !req.user.vendor) {
    return res.status(403).json({ error: 'Vendors only.' });
  }
  try {
    const snap = await db.collection('restaurants').doc(req.user.uid).get();
    if (!snap.exists) {
      return res.status(403).json({ error: 'Vendors only.' });
    }
    req.restaurantRef = snap.ref;
    next();
  } catch (err) {
    console.error('Vendor check failed:', err);
    res.status(500).json({ error: 'Could not check vendor status.' });
  }
};
