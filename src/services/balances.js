import { db } from '../lib/firebase.js';

// Where a purchase is credited: a vendor's resale balance lives on restaurants/{uid}.balance,
// a customer's spending balance on users/{uid}.crlBalance.
export const creditTarget = (uid, isVendor) => isVendor
  ? { ref: db.collection('restaurants').doc(uid), field: 'balance' }
  : { ref: db.collection('users').doc(uid), field: 'crlBalance' };

// Writes a crl_history entry inside the same transaction as the balance change,
// so the log can never disagree with the balances.
// Every entry has type, amountCRL and amountMXN, plus whichever of
// userUid, userUsername, buyerType, restaurantUid, restaurantEmail and referenceNumber apply.
export const addHistory = (transaction, entry) => {
  transaction.set(db.collection('crl_history').doc(), {
    timestamp: new Date().toISOString(),
    ...entry,
  });
};
