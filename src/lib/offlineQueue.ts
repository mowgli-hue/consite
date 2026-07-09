/**
 * Offline queue — construction sites have dead zones; the app must not.
 *
 * Any critical write (clock-in, clock-out, form submission, work log) that
 * can't reach Firestore within a timeout gets persisted to AsyncStorage and
 * replayed when connectivity returns. GPS still works offline (satellites,
 * not cell towers), so offline clock-ins keep their verified coordinates.
 *
 * Design notes:
 *  - Ops are generic {collectionPath, data} writes. Fields listed in
 *    `tsFields` are stored as client ms and converted to Firestore
 *    Timestamps at flush, so range queries keep working.
 *  - clockOut for an offline clockIn references the op's localId; flush
 *    resolves it to the real doc id after the clockIn lands.
 *  - flush() is safe to call anytime; it no-ops when the queue is empty
 *    and stops at the first failure (still offline).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

const KEY = 'consite.offlineQueue.v1';

export interface QueuedOp {
  localId: string;
  kind: 'add' | 'update';
  collectionPath: string;      // for add
  docPath?: string;            // for update (may contain {localId} of an earlier add)
  data: Record<string, unknown>;
  tsFields: string[];          // ms-number fields to convert to Timestamp at flush
  queuedAt: number;
  label: string;               // human description for the sync banner
}

let flushing = false;
const listeners = new Set<(count: number) => void>();

async function readQueue(): Promise<QueuedOp[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch { return []; }
}

async function writeQueue(q: QueuedOp[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(q));
  listeners.forEach((l) => l(q.length));
}

export function onQueueChange(fn: (count: number) => void): () => void {
  listeners.add(fn);
  readQueue().then((q) => fn(q.length));
  return () => { listeners.delete(fn); };
}

export async function pendingCount(): Promise<number> {
  return (await readQueue()).length;
}

/** Wrap a Firestore write so an offline hang becomes a catchable failure. */
export function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('offline-timeout')), ms)),
  ]);
}

export async function enqueue(op: Omit<QueuedOp, 'localId' | 'queuedAt'>): Promise<string> {
  const q = await readQueue();
  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  q.push({ ...op, localId, queuedAt: Date.now() });
  await writeQueue(q);
  return localId;
}

function reviveTimestamps(data: Record<string, unknown>, tsFields: string[]): Record<string, unknown> {
  const out = { ...data };
  for (const f of tsFields) {
    const v = out[f];
    if (typeof v === 'number') out[f] = Timestamp.fromMillis(v);
  }
  return out;
}

/** Replay queued ops in order. Returns how many synced. */
export async function flush(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let synced = 0;
  try {
    let q = await readQueue();
    const idMap = new Map<string, string>(); // localId → real doc id

    while (q.length > 0) {
      const op = q[0];
      try {
        if (op.kind === 'add') {
          const ref = await withTimeout(
            addDoc(collection(db, op.collectionPath), reviveTimestamps(op.data, op.tsFields)),
          );
          idMap.set(op.localId, ref.id);
        } else {
          // Resolve any {localId} placeholder from an earlier add in this queue
          let path = op.docPath!;
          for (const [lid, rid] of idMap) path = path.replace(lid, rid);
          if (path.includes('local-')) throw new Error('unresolved-local-ref');
          await withTimeout(updateDoc(doc(db, path), reviveTimestamps(op.data, op.tsFields)));
        }
        q = q.slice(1);
        await writeQueue(q);
        synced += 1;
      } catch {
        break; // still offline (or dependent op failed) — try again later
      }
    }
  } finally {
    flushing = false;
  }
  return synced;
}
