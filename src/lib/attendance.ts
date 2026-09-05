import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocs, query, where, serverTimestamp, addDoc, setDoc, updateDoc, Timestamp, limit } from 'firebase/firestore';
import { db } from './firebase';
import { checkGeofence } from './geofence';
import { enqueue, withTimeout } from './offlineQueue';
import type { Project, AttendanceRecord, ClockInValidationResult, AttendanceGps } from '../types';

const LOCAL_SHIFT_KEY = 'consite.localOpenShift.v1';

/** A clock-in captured offline, waiting to sync. */
export interface LocalShift {
  localId: string;
  projectId: string;
  projectName: string;
  clockInMs: number;
}

export async function getLocalOpenShift(): Promise<LocalShift | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_SHIFT_KEY);
    return raw ? (JSON.parse(raw) as LocalShift) : null;
  } catch { return null; }
}

function isNetworkError(err: unknown): boolean {
  const m = String((err as Error)?.message ?? '').toLowerCase();
  const code = String((err as { code?: string })?.code ?? '');
  return m.includes('offline-timeout') || m.includes('network') || m.includes('unavailable') ||
    m.includes('backend') || code === 'unavailable' || code === 'deadline-exceeded';
}

/**
 * Clock in; if the network is dead, verify the geofence locally (GPS works
 * offline) and queue the record for sync. Returns { offline: true } in that
 * case so the UI can say so.
 */
export async function clockInWithOfflineFallback(opts: {
  uid: string; displayName?: string; project: Project; allProjectIds?: string[];
}): Promise<{ offline: boolean; distanceM?: number }> {
  const { uid, displayName, project } = opts;
  // Pre-generate the doc id so the online attempt and the offline replay
  // target the SAME document. Before this, a timed-out-but-eventually-
  // committed online write plus the queued copy meant a duplicate paid
  // shift; now the replay overwrites idempotently.
  const shiftId = doc(collection(db, 'projects', project.id, 'attendance')).id;
  try {
    const result = await withTimeout(clockIn({ ...opts, shiftId }), 10_000);
    return { offline: false, distanceM: result.gps?.distanceFromProjectM };
  } catch (err) {
    if (!isNetworkError(err)) throw err; // real rejection (geofence, already clocked in…)
  }

  // ── Offline path: GPS + local geofence, then queue ──
  let gps: AttendanceGps | null = null;
  if (project.geofenceEnabled) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Location permission is required to clock in.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const check = checkGeofence(
      { lat: pos.coords.latitude, lng: pos.coords.longitude },
      project.geofence,
      pos.coords.accuracy ?? 0,
    );
    gps = {
      lat: pos.coords.latitude, lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? 0, distanceFromProjectM: check.distanceM,
    };
    if (!check.inside) {
      throw new Error(`You are ${check.distanceM}m from the site. Move within ${project.geofence.radiusM}m to clock in.`);
    }
  }

  const clockInMs = Date.now();
  // 'set' at the pre-generated path: replaying after the original write
  // landed just overwrites the same doc — never a duplicate.
  await enqueue({
    kind: 'set',
    collectionPath: '',
    docPath: `projects/${project.id}/attendance/${shiftId}`,
    data: {
      uid, displayName: displayName ?? null,
      clockInAt: clockInMs, clockOutAt: null, clockOutBy: null,
      clockInGps: gps, override: null, offlineQueued: true,
    },
    tsFields: ['clockInAt'],
    label: `Clock-in · ${project.name}`,
  });
  await AsyncStorage.setItem(LOCAL_SHIFT_KEY, JSON.stringify({
    localId: shiftId, projectId: project.id, projectName: project.name, clockInMs,
  } satisfies LocalShift));
  return { offline: true, distanceM: gps?.distanceFromProjectM };
}

/** Clock out of an offline-captured shift — queues the update behind the clock-in. */
export async function clockOutLocalShift(shift: LocalShift): Promise<void> {
  await enqueue({
    kind: 'update',
    collectionPath: '',
    docPath: `projects/${shift.projectId}/attendance/${shift.localId}`,
    data: { clockOutAt: Date.now(), status: 'pending' },
    tsFields: ['clockOutAt'],
    label: `Clock-out · ${shift.projectName}`,
  });
  await AsyncStorage.removeItem(LOCAL_SHIFT_KEY);
}

export async function clockIn(opts: {
  uid: string; displayName?: string; project: Project;
  override?: { reason: string; approvedBy: string };
  /** Pre-generated doc id (idempotent offline replay). */
  shiftId?: string;
  /** ALL the worker's projects — blocks double clock-in across sites. */
  allProjectIds?: string[];
}) {
  const { uid, displayName, project, override, shiftId, allProjectIds } = opts;
  if (!project.active) throw asError({ ok: false, reason: 'project_inactive', message: 'This project is not active.' });

  // Check EVERY assigned project, not just this one — being on the clock
  // at Site A must block clocking into Site B. A failed check blocks too
  // (fail closed): unverifiable is not the same as clear.
  const checkIds = [...new Set([project.id, ...(allProjectIds ?? [])])];
  let openShift: AttendanceRecord | null = null;
  try {
    openShift = await findOpenShift(uid, checkIds);
  } catch {
    throw asError({ ok: false, reason: 'check_failed', message: 'Could not verify your existing shifts — check your connection and try again.' });
  }
  if (openShift) throw asError({ ok: false, reason: 'already_clocked_in', message: `You are already clocked in. Clock out first.` });

  let gps: AttendanceGps | undefined;
  if (project.geofenceEnabled && !override) {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw asError({ ok: false, reason: 'location_denied', message: 'Location permission is required to clock in.' });
    let pos;
    try { pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); }
    catch { throw asError({ ok: false, reason: 'location_unavailable', message: 'Could not determine your location.' }); }
    const check = checkGeofence({ lat: pos.coords.latitude, lng: pos.coords.longitude }, project.geofence, pos.coords.accuracy ?? 0);
    gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0, distanceFromProjectM: check.distanceM };
    if (!check.inside) throw asError({ ok: false, reason: 'outside_geofence', distanceM: check.distanceM, message: `You are ${check.distanceM}m from the site. Move within ${project.geofence.radiusM}m to clock in.` });
  } else {
    // Geofence off (or override): still CAPTURE the location best-effort —
    // unenforced is fine, unrecorded is not. A 40km outlier should at
    // least be visible in an audit. Never blocks the clock-in.
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 6_000);
        gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 0, distanceFromProjectM: -1 };
      }
    } catch { /* no location — record proceeds without */ }
  }

  const data = {
    uid, displayName: displayName ?? null,
    clockInAt: serverTimestamp(), clockOutAt: null, clockOutBy: null,
    clockInGps: gps ?? null, override: override ?? null,
  };
  let id: string;
  if (shiftId) {
    await setDoc(doc(db, 'projects', project.id, 'attendance', shiftId), data);
    id = shiftId;
  } else {
    id = (await addDoc(collection(db, 'projects', project.id, 'attendance'), data)).id;
  }
  return { id, gps, validation: { ok: true, distanceM: gps?.distanceFromProjectM } };
}

export async function clockOut(opts: { projectId: string; recordId: string; actorUid: string; workerUid: string }) {
  const { projectId, recordId, actorUid, workerUid } = opts;
  await updateDoc(doc(db, 'projects', projectId, 'attendance', recordId), {
    clockOutAt: serverTimestamp(),
    clockOutBy: actorUid !== workerUid ? actorUid : null,
    status: 'pending', // hours count for payroll only after foreman approval
  });
}

/**
 * Foreman enters a crew member's shift by hand (missed clock-in, paper
 * timesheet catch-up). Flagged manualEntry + attributed, lands 'pending'
 * so the normal approval flow still applies — the app computes hours,
 * the office confirms them.
 */
export async function addManualShift(opts: {
  projectId: string; workerUid: string; workerName: string;
  inMs: number; outMs: number; breakMinutes?: number; notes?: string;
  enteredBy: string; enteredByName?: string;
}) {
  const { projectId, workerUid, workerName, inMs, outMs, breakMinutes, notes, enteredBy, enteredByName } = opts;
  if (outMs <= inMs) throw new Error('Shift end must be after shift start.');
  if (outMs - inMs > 16 * 3_600_000) throw new Error('Shift longer than 16 hours — check the times.');
  await addDoc(collection(db, 'projects', projectId, 'attendance'), {
    uid: workerUid, displayName: workerName,
    clockInAt: Timestamp.fromMillis(inMs), clockOutAt: Timestamp.fromMillis(outMs),
    clockOutBy: enteredBy, clockInGps: null, override: null,
    status: 'pending',
    manualEntry: true, enteredBy, enteredByName: enteredByName ?? null,
    breakMinutes: breakMinutes ?? 0, notes: notes?.trim() || null,
  });
}

/** Paid hours for a shift — clocked time minus the unpaid break. */
export function paidHours(inMs: number, outMs: number, breakMinutes?: number): number {
  return Math.max(0, (outMs - inMs) / 3_600_000 - (breakMinutes ?? 0) / 60);
}

export async function approveShift(opts: { projectId: string; recordId: string; approverUid: string }) {
  const { projectId, recordId, approverUid } = opts;
  await updateDoc(doc(db, 'projects', projectId, 'attendance', recordId), {
    status: 'approved',
    approvedBy: approverUid,
    approvedAt: Date.now(),
    needsReview: false,
  });
}

export async function findOpenShift(uid: string, projectIds?: string[]): Promise<AttendanceRecord | null> {
  if (!projectIds || projectIds.length === 0) return null;
  for (const pid of projectIds) {
    const q = query(collection(db, 'projects', pid, 'attendance'), where('uid', '==', uid), where('clockOutAt', '==', null), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, projectId: pid, ...(d.data() as any) } as AttendanceRecord;
    }
  }
  return null;
}

function asError(p: ClockInValidationResult): Error & ClockInValidationResult {
  const err = new Error(p.message ?? 'Clock-in failed') as Error & ClockInValidationResult;
  Object.assign(err, p);
  return err;
}

export function tsToMs(v: unknown): number | undefined {
  if (!v) return undefined;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  return undefined;
}
