import { signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { User } from '../types';

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await fetchUserProfile(cred.user.uid);
  if (!profile) { await fbSignOut(auth); throw new Error('Account not provisioned. Contact your admin.'); }
  if (!profile.active) { await fbSignOut(auth); throw new Error('Account deactivated. Contact your admin.'); }
  return profile;
}

export function signOut() { return fbSignOut(auth); }

export async function fetchUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as Omit<User, 'uid'>) };
}

export function onAuthChange(cb: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb);
}
