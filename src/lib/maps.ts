/**
 * Google Maps helpers — no API key, no SDK.
 *
 * The office finds the site in Google Maps like they already do, pastes
 * the link (or bare "lat, lng"), and we extract the coordinates. Workers
 * tap an address and get turn-by-turn in the Maps app. Preview uses the
 * keyless Google embed.
 */

import type { Project } from '../types';

/**
 * Extract coordinates from anything Google Maps hands you:
 *   "49.104671, -122.801094"            (right-click → copy coordinates)
 *   https://www.google.com/maps/place/…/@49.1046,-122.8010,17z
 *   https://www.google.com/maps?q=49.1046,-122.8010
 *   https://maps.google.com/…!3d49.1046!4d-122.8010…
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const s = text.trim();
  if (!s) return null;

  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,          // /@lat,lng,zoom
    /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,  // ?q=lat,lng
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,      // !3dlat!4dlng
    /^(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/,    // bare "lat, lng"
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/** Turn-by-turn directions to the site — coords when set, address otherwise. */
export function directionsUrl(p: Pick<Project, 'address' | 'geofence'>): string {
  const c = p.geofence?.center;
  const dest = c && (c.lat !== 0 || c.lng !== 0) ? `${c.lat},${c.lng}` : encodeURIComponent(p.address ?? '');
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Open Google Maps searching for an address (to find + copy the pin). */
export function searchUrl(queryText: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryText)}`;
}

/** Keyless embeddable map centered on a pin (web iframe preview). */
export function embedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
}
