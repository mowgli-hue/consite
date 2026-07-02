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

export function checkGeofence(workerCoord: GeoPoint, geofence: Geofence, gpsAccuracyM = 0): GeofenceCheckResult {
  const d = distanceMeters(workerCoord, geofence.center);
  const effectiveRadius = geofence.radiusM + Math.max(0, gpsAccuracyM);
  return { inside: d <= effectiveRadius, distanceM: Math.round(d), bufferM: Math.round(effectiveRadius - d) };
}
