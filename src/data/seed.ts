/**
 * Seed data — minimal viable dataset for first run.
 *
 * Run via the Firebase Admin SDK from a Node script, or paste into the Firestore
 * console manually. Once the form builder UI ships in v0.3, admins create these
 * themselves and this file becomes a reference.
 *
 * Usage (node script — not included; trivial to write):
 *   import { seedAll } from './seed';
 *   await seedAll(adminUidYouCreatedManually);
 */

import type {
  Project,
  FormSchema,
  DashboardModule,
  ProjectMember,
} from '../types';
import { DEFAULT_WORKER_PERMISSIONS } from '../lib/permissions';

// ─────────────────────────────────────────────────────
// Sample project — Surrey BC site (Jungle Labs HQ-ish coordinates)
// ─────────────────────────────────────────────────────

export const SAMPLE_PROJECT: Omit<Project, 'id'> = {
  name: 'Fleetwood Tower – Phase 1',
  address: '16007 80 Ave, Surrey, BC',
  geofence: {
    center: { lat: 49.1539, lng: -122.7972 },
    radiusM: 150,
  },
  geofenceEnabled: true,
  active: true,
  memberUids: [],       // populate with worker uids after creation
  supervisorUids: [],
  createdAt: Date.now(),
  createdBy: 'SEED',
};

// ─────────────────────────────────────────────────────
// Sample worker member doc — paste under /projects/{pid}/members/{uid}
// ─────────────────────────────────────────────────────

export function buildSampleWorkerMember(uid: string, assignedBy: string): ProjectMember {
  return {
    uid,
    role: 'worker',
    permissions: DEFAULT_WORKER_PERMISSIONS,
    assignedAt: Date.now(),
    assignedBy,
  };
}

// ─────────────────────────────────────────────────────
// Worker dashboard modules
// ─────────────────────────────────────────────────────

export const SEED_DASHBOARD_MODULES: Array<Omit<DashboardModule, 'id'> & { id: string }> = [
  {
    id: 'projects',
    label: 'Projects',
    icon: 'briefcase',
    route: '/projects',
    order: 1,
    visible: true,
    requiredPermissions: ['worker.projects.view'],
    subtitle: 'View your assigned sites',
  },
  {
    id: 'timesheet',
    label: 'My Hours',
    icon: 'calendar',
    route: '/timesheet',
    order: 3,
    visible: true,
    requiredPermissions: [],
    subtitle: 'This week’s shifts & totals',
  },
  {
    id: 'clock',
    label: 'Clock In / Out',
    icon: 'clock',
    route: '/clock',
    order: 2,
    visible: true,
    requiredPermissions: [],
    subtitle: 'GPS-verified attendance',
  },
  {
    id: 'flha',
    label: 'FLHA Forms',
    icon: 'shield',
    route: '/forms/submitted',
    order: 3,
    visible: true,
    requiredPermissions: ['worker.forms.submit'],
    subtitle: 'Daily safety checks',
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: 'file-text',
    route: '/templates',
    order: 4,
    visible: true,
    requiredPermissions: ['worker.templates.view'],
    subtitle: 'Safety docs & policies',
  },
];

// ─────────────────────────────────────────────────────
// Sample FLHA form schema
// ─────────────────────────────────────────────────────

export const SAMPLE_FLHA_FORM: FormSchema = {
  id: 'flha-daily-v1',
  title: 'Daily FLHA — Field Level Hazard Assessment',
  description: 'Complete before starting work each day.',
  category: 'flha',
  version: 1,
  archived: false,
  createdBy: 'SEED',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sections: [
    {
      id: 'context',
      title: 'Job context',
      fields: [
        {
          id: 'job-description',
          type: 'text',
          label: 'What work are you doing today?',
          placeholder: 'e.g. Framing 2nd floor walls',
          required: true,
        },
        {
          id: 'start-time',
          type: 'date',
          label: 'Start time',
          mode: 'datetime',
          required: true,
        },
        {
          id: 'crew-size',
          type: 'dropdown',
          label: 'Crew size',
          options: ['Just me', '2–3', '4–6', '7–10', '10+'],
          required: true,
        },
      ],
    },
    {
      id: 'hazards',
      title: 'Hazards on site',
      description: 'Check all that apply',
      fields: [
        {
          id: 'hazards-present',
          type: 'checkbox',
          label: 'Hazards present today',
          options: [
            'Working at heights',
            'Heavy equipment nearby',
            'Excavation / open trenches',
            'Live electrical',
            'Hot work (welding/cutting)',
            'Confined space',
            'Slip / trip / fall hazards',
            'Adverse weather',
          ],
        },
        {
          id: 'mitigation',
          type: 'multiline',
          label: 'How will you control these hazards?',
          placeholder: 'PPE, barriers, lockouts, etc.',
          rows: 4,
          required: true,
        },
      ],
    },
    {
      id: 'ppe',
      title: 'PPE check',
      fields: [
        {
          id: 'ppe-confirmed',
          type: 'checkbox',
          label: 'Required PPE confirmed on hand',
          options: [
            'Hard hat',
            'Safety glasses',
            'Steel-toe boots',
            'Hi-vis vest',
            'Gloves',
            'Hearing protection',
            'Fall arrest gear',
            'Respirator',
          ],
        },
      ],
    },
    {
      id: 'photos',
      title: 'Site photos',
      fields: [
        {
          id: 'site-photos',
          type: 'image',
          label: 'Photos of work area (optional)',
          max: 4,
        },
      ],
    },
    {
      id: 'signoff',
      title: 'Sign-off',
      fields: [
        {
          id: 'worker-signature',
          type: 'signature',
          label: 'Worker signature',
          required: true,
        },
      ],
    },
  ],
};
