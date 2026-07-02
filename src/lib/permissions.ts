import type { User, ProjectMember } from '../types';

export const PERMISSIONS = {
  WORKER_PROJECTS_VIEW: 'worker.projects.view',
  WORKER_FORMS_SUBMIT: 'worker.forms.submit',
  WORKER_FORMS_DOWNLOAD: 'worker.forms.download',
  WORKER_MEDIA_UPLOAD: 'worker.media.upload',
  WORKER_PLANS_VIEW: 'worker.plans.view',
  WORKER_PLANS_DOWNLOAD: 'worker.plans.download',
  WORKER_TEMPLATES_VIEW: 'worker.templates.view',
  SUPERVISOR_CLOCKOUT_OTHERS: 'supervisor.attendance.clockout-others',
  SUPERVISOR_FORMS_APPROVE: 'supervisor.forms.approve',
} as const;

export const DEFAULT_WORKER_PERMISSIONS = [
  PERMISSIONS.WORKER_PROJECTS_VIEW, PERMISSIONS.WORKER_FORMS_SUBMIT,
  PERMISSIONS.WORKER_FORMS_DOWNLOAD, PERMISSIONS.WORKER_PLANS_VIEW,
  PERMISSIONS.WORKER_TEMPLATES_VIEW,
];

export const DEFAULT_SUPERVISOR_PERMISSIONS = [
  ...DEFAULT_WORKER_PERMISSIONS,
  PERMISSIONS.WORKER_MEDIA_UPLOAD, PERMISSIONS.WORKER_PLANS_DOWNLOAD,
  PERMISSIONS.SUPERVISOR_CLOCKOUT_OTHERS, PERMISSIONS.SUPERVISOR_FORMS_APPROVE,
];

export function hasPermission(user: User, permission: string, projectMember?: ProjectMember | null): boolean {
  if (user.role === 'admin') return true;
  if (!projectMember) return false;
  return projectMember.permissions.includes(permission);
}

export function hasAny(user: User, permissions: string[], projectMember?: ProjectMember | null): boolean {
  if (user.role === 'admin') return true;
  if (permissions.length === 0) return true;
  if (!projectMember) return false;
  return permissions.some((p) => projectMember.permissions.includes(p));
}
