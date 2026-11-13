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
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

interface CreateWorkerData {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  role?: 'worker' | 'manager' | 'admin';
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

  let userRecord;
  try {
    userRecord = await getAuth().createUser({
      email: email.trim().toLowerCase(),
      password,
      displayName,
      // Auth requires strict E.164 (+16045551234); anything else crashes the
      // whole call. Only pass it if it looks valid — otherwise store on the
      // Firestore doc only.
      phoneNumber: phone && /^\+[1-9]\d{9,14}$/.test(phone.replace(/[\s()-]/g, ''))
        ? phone.replace(/[\s()-]/g, '')
        : undefined,
    });
  } catch (err: any) {
    const code = err?.errorInfo?.code ?? err?.code ?? '';
    if (String(code).includes('email-already-exists')) {
      throw new HttpsError('already-exists', 'An account with this email already exists.');
    }
    if (String(code).includes('invalid-phone-number')) {
      throw new HttpsError('invalid-argument', 'Phone must be in +16045551234 format (or leave it empty).');
    }
    if (String(code).includes('invalid-password')) {
      throw new HttpsError('invalid-argument', 'Password must be at least 8 characters.');
    }
    if (String(code).includes('invalid-email')) {
      throw new HttpsError('invalid-argument', 'That email address is not valid.');
    }
    logger.error('createUser failed', err);
    throw new HttpsError('internal', `Account creation failed: ${err?.message ?? 'unknown error'}`);
  }

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

  // Create the project-side membership HERE, atomically with the user —
  // it used to be mirrored client-side after the callable returned, and
  // an interrupted mirror left workers with projectIds but no member
  // doc: every screen listed the site, every read was denied.
  const batch = db.batch();
  for (const pid of projectIds) {
    batch.set(db.collection('projects').doc(pid).collection('members').doc(userRecord.uid), {
      uid: userRecord.uid,
      displayName,
      role: 'worker',
      permissions: ['worker.projects.view', 'worker.forms.submit', 'worker.templates.view', 'worker.media.upload'],
      assignedAt: Date.now(),
      assignedBy: request.auth.uid,
    });
    batch.update(db.collection('projects').doc(pid), {
      memberUids: FieldValue.arrayUnion(userRecord.uid),
    });
  }
  if (projectIds.length > 0) await batch.commit();

  logger.info(`Created ${role} ${userRecord.uid} by admin ${request.auth.uid}`);
  return { uid: userRecord.uid };
});

/**
 * `deleteWorker` — admin removes an account for good: the sign-in, the
 * profile, and their place on every crew. Their HOURS and signed FORMS
 * stay (payroll and safety history must survive the person leaving).
 * Guards: admins only, never yourself, never the last active admin.
 */
export const deleteWorker = onCall<{ uid: string }>(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const db = getFirestore();

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (callerDoc.data()?.role !== 'admin' || callerDoc.data()?.active === false) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }

  const uid = String(request.data?.uid ?? '');
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === request.auth.uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own account.');
  }

  const targetDoc = await db.collection('users').doc(uid).get();
  if (targetDoc.data()?.role === 'admin') {
    const admins = await db.collection('users').where('role', '==', 'admin').get();
    const activeAdmins = admins.docs.filter((d) => d.data().active !== false);
    if (activeAdmins.length <= 1) {
      throw new HttpsError('failed-precondition', 'This is the only active admin — promote someone else first.');
    }
  }

  // 1. Sign-in (tolerate "already gone")
  try {
    await getAuth().deleteUser(uid);
  } catch (err: any) {
    const code = String(err?.errorInfo?.code ?? err?.code ?? '');
    if (!code.includes('user-not-found')) {
      logger.error('deleteUser failed', err);
      throw new HttpsError('internal', `Could not remove the sign-in: ${err?.message ?? 'unknown error'}`);
    }
  }

  // 2. Crew memberships on every project
  const projects = await db.collection('projects').get();
  const batch = db.batch();
  for (const p of projects.docs) {
    batch.delete(p.ref.collection('members').doc(uid));
    batch.update(p.ref, {
      memberUids: FieldValue.arrayRemove(uid),
      supervisorUids: FieldValue.arrayRemove(uid),
    });
  }
  await batch.commit();

  // 3. Profile + its subcollections
  for (const sub of ['certifications', 'notifications']) {
    const docs = await db.collection('users').doc(uid).collection(sub).get();
    for (const d of docs.docs) await d.ref.delete();
  }
  await db.collection('users').doc(uid).delete();

  logger.info(`Deleted user ${uid} by admin ${request.auth.uid}`);
  return { ok: true };
});
