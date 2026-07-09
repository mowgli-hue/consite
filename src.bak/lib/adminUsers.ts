/**
 * Admin operations on users and project assignment.
 *
 * Client-side writes are allowed here because Firestore rules grant
 * admins full write on /users, /projects and members subcollections.
 * Worker creation goes through the `createWorker` Cloud Function
 * (Auth user + /users doc are created server-side).
 */

import { httpsCallable } from 'firebase/functions';
import {
  collection, doc, getDocs, orderBy, query,
  updateDoc, setDoc, deleteDoc, arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db, functions } from './firebase';
import type { User, Project } from '../types';

const DEFAULT_WORKER_PERMISSIONS = [
  'worker.projects.view',
  'worker.forms.submit',
  'worker.templates.view',
  'worker.media.upload',
];

const FOREMAN_PERMISSIONS = [
  ...DEFAULT_WORKER_PERMISSIONS,
  'supervisor.attendance.approve',
  'supervisor.attendance.clockout-others',
  'supervisor.forms.approve',
];

export type MemberRole = 'worker' | 'foreman' | 'lead-foreman';

export function permissionsForRole(role: MemberRole): string[] {
  return role === 'worker' ? DEFAULT_WORKER_PERMISSIONS : FOREMAN_PERMISSIONS;
}

/** Change a member's per-project role (worker ↔ foreman ↔ lead-foreman). */
export async function setMemberRole(uid: string, projectId: string, role: MemberRole) {
  await setDoc(
    doc(db, 'projects', projectId, 'members', uid),
    { role, permissions: permissionsForRole(role) },
    { merge: true },
  );
  const projRef = doc(db, 'projects', projectId);
  if (role === 'worker') {
    await updateDoc(projRef, { supervisorUids: arrayRemove(uid) });
  } else {
    await updateDoc(projRef, { supervisorUids: arrayUnion(uid) });
  }
}

export async function listUsers(): Promise<User[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('displayName')));
  return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<User, 'uid'>) }));
}

export async function listAllProjects(): Promise<Project[]> {
  const snap = await getDocs(query(collection(db, 'projects'), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
}

export async function createWorkerAccount(data: {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  role?: 'worker' | 'admin';
  projectIds?: string[];
}): Promise<string> {
  const fn = httpsCallable<typeof data, { uid: string }>(functions, 'createWorker');
  const res = await fn(data);
  const uid = res.data.uid;
  // createWorker sets user.projectIds but not the project-side records —
  // mirror the assignment so rules (isProjectMember) and queries line up.
  for (const pid of data.projectIds ?? []) {
    await addMembership(uid, pid, 'system:createWorker');
  }
  return uid;
}

export async function setUserActive(uid: string, active: boolean) {
  await updateDoc(doc(db, 'users', uid), { active });
}

export async function assignToProject(uid: string, projectId: string, adminUid: string) {
  await addMembership(uid, projectId, adminUid);
  await updateDoc(doc(db, 'users', uid), { projectIds: arrayUnion(projectId) });
}

export async function removeFromProject(uid: string, projectId: string) {
  await deleteDoc(doc(db, 'projects', projectId, 'members', uid));
  await updateDoc(doc(db, 'projects', projectId), { memberUids: arrayRemove(uid) });
  await updateDoc(doc(db, 'users', uid), { projectIds: arrayRemove(projectId) });
}

async function addMembership(uid: string, projectId: string, assignedBy: string) {
  await setDoc(doc(db, 'projects', projectId, 'members', uid), {
    uid,
    role: 'worker',
    permissions: DEFAULT_WORKER_PERMISSIONS,
    assignedAt: Date.now(),
    assignedBy,
  });
  await updateDoc(doc(db, 'projects', projectId), { memberUids: arrayUnion(uid) });
}
