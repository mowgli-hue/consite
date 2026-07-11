/**
 * Project + geofence data model.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Geofence {
  /** Project center coordinate. */
  center: GeoPoint;
  /** Radius in meters. Clock-in succeeds if worker is within this distance. */
  radiusM: number;
}

export interface Project {
  id: string;
  name: string;
  /** Human-readable site address. */
  address: string;
  /** Geofence config. Required even if geofenceEnabled = false (used as project center for maps). */
  geofence: Geofence;
  /** If false, workers can clock in without GPS verification. */
  geofenceEnabled: boolean;
  /** If true, project is shown in worker lists. */
  active: boolean;
  /** Which FLHA schema this site uses for the daily assessment. */
  defaultFlhaFormId?: string;
  /** Lifecycle stage — see src/lib/lifecycle.ts. Defaults to 'contract'. */
  stage?: 'contract' | 'setup' | 'crew' | 'build' | 'punch' | 'closeout' | 'archived';
  /** CRM link. */
  clientId?: string;
  clientName?: string;
  /** Signed contract PDF in Storage. */
  contractPath?: string;
  contractValue?: number;
  /** Set when the closeout audit pack is generated. */
  auditAt?: number;
  /** Workers assigned to this project (cached for fast queries). */
  memberUids: string[];
  /** Supervisors for this project. */
  supervisorUids: string[];
  createdAt: number;
  createdBy: string;
}

/** Storage path = `projects/{pid}/plans/{planId}/{filename}` */
export interface Plan {
  id: string;
  projectId: string;
  name: string;
  storagePath: string;
  fileType: 'pdf' | 'image';
  version: number;
  uploadedBy: string;
  uploadedAt: number;
}

/** Storage path = `projects/{pid}/media/{mediaId}/{filename}` */
export interface MediaItem {
  id: string;
  projectId: string;
  storagePath: string;
  type: 'image' | 'video';
  caption?: string;
  /** For organizing — defaults to date of upload. */
  folder?: string;
  uploadedBy: string;
  uploadedAt: number;
}
