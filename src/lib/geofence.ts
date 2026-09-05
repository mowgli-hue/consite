import type { GeoPoint, Geofence } from '../types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface GeofenceCheckResult {
  inside: boolean;
  distanceM: number;
  bufferM: number;
}

/**
 * GPS accuracy buffers the fence, but CAPPED — an old phone reporting
 * ±2000m used to turn a 150m site fence into a 2km one (clock in from the
 * kitchen table, legitimately). Max 75m of slack; a fix worse than 200m
 * is rejected outright as "no usable GPS".
 */
const MAX_ACCURACY_BUFFER_M = 75;
const MAX_USABLE_ACCURACY_M = 200;

export function checkGeofence(workerCoord: GeoPoint, geofence: Geofence, gpsAccuracyM = 0): GeofenceCheckResult {
  const d = distanceMeters(workerCoord, geofence.center);
  if (gpsAccuracyM > MAX_USABLE_ACCURACY_M) {
    // Fix too vague to prove anything — fail with distance info so the
    // UI can say "wait for GPS / step outside".
    return { inside: false, distanceM: Math.round(d), bufferM: -1 };
  }
  const effectiveRadius = geofence.radiusM + Math.min(Math.max(0, gpsAccuracyM), MAX_ACCURACY_BUFFER_M);
  return { inside: d <= effectiveRadius, distanceM: Math.round(d), bufferM: Math.round(effectiveRadius - d) };
}
