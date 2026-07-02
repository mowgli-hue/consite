/**
 * Admin Cloud Functions.
 *
 * `createWorker` — admin provisions a new user (Auth + Firestore /users doc).
 *
 * Bootstrapping the FIRST admin: do that manually in the Firebase console.
 * See docs/SETUP.md.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

interface CreateWorkerData {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  role?: 'worker' | 'admin';
  projectIds?: string[];
}

export const createWorker = onCall<CreateWorkerData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const db = getFirestore();

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }

  const { email, password, displayName, phone, role = 'worker', projectIds = [] } = request.data;

  if (!email || !password || !displayName) {
    throw new HttpsError('invalid-argument', 'email, password, displayName are required.');
  }
  if (password.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
  }

  const userRecord = await getAuth().createUser({
    email: email.trim().toLowerCase(),
    password,
    displayName,
    phoneNumber: phone,
  });

  await db.collection('users').doc(userRecord.uid).set({
    displayName,
    email: userRecord.email,
    phone: phone ?? null,
    role,
    active: true,
    projectIds,
    createdAt: Date.now(),
    createdBy: request.auth.uid,
  });

  logger.info(`Created ${role} ${userRecord.uid} by admin ${request.auth.uid}`);
  return { uid: userRecord.uid };
});
