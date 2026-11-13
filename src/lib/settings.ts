/**
 * App settings — the company's own knobs, so they run Consite as THEIR
 * application instead of asking us for every change. One doc
 * (settings/app): any signed-in user reads, admins write.
 */

import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface AppSettings {
  companyName: string;
  /**
   * false (default): lifecycle checks are ADVICE — a project can move to
   * any stage at any time. true: every check must pass before advancing.
   */
  strictLifecycle: boolean;
  /** Extra addresses that receive every signed form PDF. */
  recordsEmails: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: '',
  strictLifecycle: false,
  recordsEmails: [],
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'app'));
    return { ...DEFAULT_SETTINGS, ...((snap.data() as Partial<AppSettings>) ?? {}) };
  } catch {
    return DEFAULT_SETTINGS; // unreadable → the relaxed defaults
  }
}

export async function saveAppSettings(patch: Partial<AppSettings>): Promise<void> {
  await setDoc(doc(db, 'settings', 'app'), { ...patch, updatedAt: Date.now() }, { merge: true });
}

/** Feedback / change request → lands in our inbox by email (Cloud Function). */
export async function sendFeedback(opts: {
  text: string; uid: string; name?: string; email?: string; page?: string;
}): Promise<void> {
  await addDoc(collection(db, 'feedback'), {
    text: opts.text.trim(),
    submittedBy: opts.uid,
    name: opts.name ?? null,
    email: opts.email ?? null,
    page: opts.page ?? null,
    createdAt: serverTimestamp(),
  });
}
