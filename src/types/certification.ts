/**
 * Certifications / tickets data model.
 *
 * Stored at /users/{uid}/certifications/{certId}. A separate subcollection
 * (not on the user doc) because workers can have many certs and they have
 * their own lifecycle.
 *
 * Auto-expiry: a daily Cloud Function (v0.3) checks all certs and fires
 * notifications at 30/14/7 days before expiry. Admin sees a dashboard tile
 * for expiring certs.
 *
 * BC compliance: WHMIS, fall arrest, first aid (Level 1/2/3), forklift,
 * confined space, traffic control, swing stage, asbestos, silica, hot work,
 * scissor lift, boom lift — these are the common ones contractors require
 * proof of before letting someone on site.
 */

/**
 * Standard cert types in BC. Custom values allowed via 'other'.
 */
export type CertType =
  | 'whmis'
  | 'fall-arrest'
  | 'first-aid-level-1'
  | 'first-aid-level-2'
  | 'first-aid-level-3'
  | 'forklift'
  | 'confined-space'
  | 'traffic-control'
  | 'swing-stage'
  | 'asbestos'
  | 'silica'
  | 'hot-work'
  | 'scissor-lift'
  | 'boom-lift'
  | 'mewp' // mobile elevating work platform
  | 'rigging'
  | 'flagging'
  | 'cpr-c'
  | 'transportation-of-dangerous-goods'
  | 'other';

export interface Certification {
  id: string;
  /** Standard cert type or 'other' with a custom label. */
  type: CertType;
  /** If type === 'other', a free-form name. */
  customName?: string;
  /** Human-readable display name (filled in even for standard types). */
  displayName: string;
  /** Issuing body (BCCSA, Red Cross, Worksafe BC, etc.) */
  issuer: string;
  /** Certificate or ticket number. */
  certificateNumber?: string;
  /** Date issued (ms epoch). */
  issuedAt: number;
  /** Date expiring (ms epoch). null = never expires. */
  expiresAt: number | null;
  /** Photo or PDF of the cert in Firebase Storage. */
  documentStoragePath?: string;
  /** Notes from the worker or admin. */
  notes?: string;
  /** When this cert was added to Consite. */
  createdAt: number;
  /** Who added it (worker self-upload or admin upload). */
  createdBy: string;
}

/** Standard cert metadata — for display and validation. */
export const CERT_METADATA: Record<Exclude<CertType, 'other'>, { displayName: string; typicalIssuer: string; typicalDurationMonths: number }> = {
  'whmis': { displayName: 'WHMIS 2015', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'fall-arrest': { displayName: 'Fall Arrest', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'first-aid-level-1': { displayName: 'Occupational First Aid Level 1', typicalIssuer: 'Red Cross / St John', typicalDurationMonths: 36 },
  'first-aid-level-2': { displayName: 'Occupational First Aid Level 2', typicalIssuer: 'Red Cross / St John', typicalDurationMonths: 36 },
  'first-aid-level-3': { displayName: 'Occupational First Aid Level 3', typicalIssuer: 'Red Cross / St John', typicalDurationMonths: 36 },
  'forklift': { displayName: 'Forklift Operator', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'confined-space': { displayName: 'Confined Space Entry', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'traffic-control': { displayName: 'Traffic Control Person', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'swing-stage': { displayName: 'Swing Stage', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'asbestos': { displayName: 'Asbestos Awareness', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'silica': { displayName: 'Silica Exposure Control', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'hot-work': { displayName: 'Hot Work', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'scissor-lift': { displayName: 'Scissor Lift Operator', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'boom-lift': { displayName: 'Boom Lift Operator', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'mewp': { displayName: 'Mobile Elevating Work Platform', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'rigging': { displayName: 'Basic Rigging', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'flagging': { displayName: 'Flagger Certification', typicalIssuer: 'BCCSA', typicalDurationMonths: 36 },
  'cpr-c': { displayName: 'CPR Level C', typicalIssuer: 'Red Cross / St John', typicalDurationMonths: 12 },
  'transportation-of-dangerous-goods': { displayName: 'TDG', typicalIssuer: 'Transport Canada', typicalDurationMonths: 36 },
};

/** Helper: compute expiry status from now. */
export function expiryStatus(cert: Certification): {
  state: 'expired' | 'expiring-soon' | 'valid' | 'never-expires';
  daysUntilExpiry: number | null;
} {
  if (cert.expiresAt == null) return { state: 'never-expires', daysUntilExpiry: null };
  const now = Date.now();
  const ms = cert.expiresAt - now;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return { state: 'expired', daysUntilExpiry: days };
  if (days <= 30) return { state: 'expiring-soon', daysUntilExpiry: days };
  return { state: 'valid', daysUntilExpiry: days };
}
