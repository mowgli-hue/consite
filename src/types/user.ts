/**
 * User data model.
 *
 * Stored at /users/{uid} where uid matches Firebase Auth uid.
 * A user is a "supervisor" by being assigned that role on a specific
 * project member doc — not by their top-level user.role.
 *
 * Top-level roles: admin OR worker. Supervisor is a per-project elevation.
 */

export type UserRole = 'admin' | 'worker';

export type ProjectMemberRole = 'worker' | 'supervisor';

/**
 * Permission strings follow `<scope>.<resource>.<action>` convention.
 * e.g. `worker.forms.submit`, `admin.users.create`.
 *
 * Workers receive permissions per-project via /projects/{pid}/members/{uid}.
 * Admins implicitly have all permissions.
 */
export type Permission = string;

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  role: UserRole;
  active: boolean;
  createdAt: number; // ms epoch
  createdBy?: string; // admin uid
  /** Cached list of project IDs the user is assigned to. Updated by Cloud Function. */
  projectIds?: string[];
}

export interface ProjectMember {
  uid: string;
  role: ProjectMemberRole;
  permissions: Permission[];
  assignedAt: number;
  assignedBy: string;
}
