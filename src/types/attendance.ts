/**
 * Attendance / clock in-out data model.
 */

export interface AttendanceGps {
  lat: number;
  lng: number;
  /** Accuracy in meters reported by the device. */
  accuracy: number;
  /** Distance in meters from project center. Cached for fast reports. */
  distanceFromProjectM: number;
}

/**
 * Shift approval lifecycle:
 *   (open, no status) → clock-out sets 'pending' → foreman/admin sets 'approved'.
 * Payroll export counts only approved hours.
 */
export type AttendanceStatus = 'pending' | 'approved';

export interface AttendanceRecord {
  id: string;
  projectId: string;
  uid: string;
  /** Denormalized at clock-in so foremen can read crew names without user-doc access. */
  displayName?: string;
  clockInAt: number;
  clockOutAt?: number;
  clockInGps?: AttendanceGps; // optional only if geofencing was disabled
  status?: AttendanceStatus;
  approvedBy?: string;
  approvedAt?: number;
  /** Set by the nightly sweep when a worker forgot to clock out. */
  needsReview?: boolean;
  /**
   * If admin or supervisor clocked the worker out, their uid is recorded here.
   * Self clock-outs leave this undefined.
   */
  clockOutBy?: string;
  /**
   * If admin overrode the geofence (worker outside radius but admin allowed
   * clock-in anyway), we record why.
   */
  override?: {
    reason: string;
    approvedBy: string;
  };
}

/** Result returned by attemptClockIn before the record is written. */
export interface ClockInValidationResult {
  ok: boolean;
  distanceM?: number;
  reason?: 'outside_geofence' | 'location_denied' | 'location_unavailable' | 'project_inactive' | 'already_clocked_in';
  message?: string;
}
