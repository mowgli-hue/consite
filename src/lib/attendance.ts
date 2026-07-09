import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, getDocs, query, where, serverTimestamp, addDoc, updateDoc, Timestamp, limit } from 'firebase/firestore';
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
  uid: string; displayName?: string; project: Project;
}): Promise<{ offline: boolean; distanceM?: number }> {
  const { uid, displayName, project } = opts;
  try {
    const result = await withTimeout(clockIn(opts), 10_000);
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
  const localId = await enqueue({
    kind: 'add',
    collectionPath: `projects/${project.id}/attendance`,
    data: {
      uid, displayName: displayName ?? null,
      clockInAt: clockInMs, clockOutAt: null, clockOutBy: null,
      clockInGps: gps, override: null, offlineQueued: true,
    },
    tsFields: ['clockInAt'],
    label: `Clock-in · ${project.name}`,
  });
  await AsyncStorage.setItem(LOCAL_SHIFT_KEY, JSON.stringify({
    localId, projectId: project.id, projectName: project.name, clockInMs,
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

export async function clockIn(opts: { uid: string; displayName?: string; project: Project; override?: { reason: string; approvedBy: string } }) {
  const { uid, displayName, project, override } = opts;
  if (!project.active) throw asError({ ok: false, reason: 'project_inactive', message: 'This project is not active.' });

  const openShift = await findOpenShift(uid, [project.id]);
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
  }

  const ref = await addDoc(collection(db, 'projects', project.id, 'attendance'), {
    uid, displayName: displayName ?? null,
    clockInAt: serverTimestamp(), clockOutAt: null, clockOutBy: null,
    clockInGps: gps ?? null, override: override ?? null,
  });
  return { id: ref.id, gps, validation: { ok: true, distanceM: gps?.distanceFromProjectM } };
}

export async function clockOut(opts: { projectId: string; recordId: string; actorUid: string; workerUid: string }) {
  const { projectId, recordId, actorUid, workerUid } = opts;
  await updateDoc(doc(db, 'projects', projectId, 'attendance', recordId), {
    clockOutAt: serverTimestamp(),
    clockOutBy: actorUid !== workerUid ? actorUid : null,
    status: 'pending', // hours count for payroll only after foreman approval
  });
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
