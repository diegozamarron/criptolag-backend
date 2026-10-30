import fs from 'fs';
import admin from 'firebase-admin';
import { FIREBASE_SERVICE_ACCOUNT_PATH } from '../config.js';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const { FieldValue } = admin.firestore;
