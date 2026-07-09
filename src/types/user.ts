/**
 * User data model.
 *
 * Stored at /users/{uid} where uid matches Firebase Auth uid.
 * A user is a "supervisor" by being assigned that role on a specific
 * project member doc — not by their top-level user.role.
 *
 * Top-level roles: admin OR worker. Supervisor is a per-project elevation.
 */

/** manager = sees everything on their projects, changes nothing. */
export type UserRole = 'admin' | 'manager' | 'worker';

/**
 * Per-project roles matching a real BC framing crew:
 *   worker       — clocks in/out, does assigned work
 *   foreman      — approves crew hours, owns the daily FLHA, assigns tasks
 *   lead-foreman — foreman powers across the project + manages foremen
 *   supervisor   — legacy alias (v0.1), treated as foreman
 */
export type ProjectMemberRole = 'worker' | 'foreman' | 'lead-foreman' | 'supervisor';

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
  /** WorkSafeBC / WCB personal identification number. */
  wcbNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface ProjectMember {
  uid: string;
  role: ProjectMemberRole;
  permissions: Permission[];
  assignedAt: number;
  assignedBy: string;
}
