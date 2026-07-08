import * as Location from 'expo-location';
import { collection, doc, getDocs, query, where, serverTimestamp, addDoc, updateDoc, Timestamp, limit } from 'firebase/firestore';
import { db } from './firebase';
import { checkGeofence } from './geofence';
import type { Project, AttendanceRecord, ClockInValidationResult, AttendanceGps } from '../types';

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
