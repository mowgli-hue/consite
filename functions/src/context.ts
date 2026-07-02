/**
 * Context engine.
 *
 * Given a project and worker, assembles everything the AI needs to pre-fill
 * forms intelligently. The goal: make the AI feel like it already knows the
 * site — because it does.
 *
 * Heavy lifts:
 *  - Weather from Environment Canada (free, no key needed for forecast)
 *  - Crew = anyone with an open attendance shift on this project
 *  - Recent work = last 3 days of cost-coded clock-ins + completed FLHAs
 *
 * All Firestore reads are read-only — this never writes. Safe to call often.
 */

import { getFirestore } from 'firebase-admin/firestore';
import type { FillContext } from './ai-prompts';

const db = () => getFirestore();

// ─────────────────────────────────────────────────────
// Top-level assembler
// ─────────────────────────────────────────────────────

export async function buildContext(opts: {
  projectId: string;
  workerUid: string;
}): Promise<FillContext> {
  const { projectId, workerUid } = opts;

  const [project, crew, recentWork] = await Promise.all([
    loadProject(projectId),
    loadCrewOnSite(projectId),
    loadRecentWork(projectId, workerUid),
  ]);

  const weather = project?.geofence
    ? await loadWeather(project.geofence.center.lat, project.geofence.center.lng).catch(() => undefined)
    : undefined;

  return {
    now: Date.now(),
    project,
    weather,
    crew,
    recentWork,
  };
}

// ─────────────────────────────────────────────────────
// Project
// ─────────────────────────────────────────────────────

async function loadProject(projectId: string): Promise<FillContext['project'] | undefined> {
  const snap = await db().doc(`projects/${projectId}`).get();
  if (!snap.exists) return undefined;
  const d = snap.data()!;
  return {
    id: projectId,
    name: d.name ?? 'Unknown project',
    address: d.address ?? '',
    projectType: d.projectType,
    geofence: d.geofence,
  };
}

// ─────────────────────────────────────────────────────
// Crew currently on site
// ─────────────────────────────────────────────────────

async function loadCrewOnSite(projectId: string): Promise<FillContext['crew']> {
  const attendance = await db()
    .collection(`projects/${projectId}/attendance`)
    .where('clockOutAt', '==', null)
    .get();

  const uids = Array.from(new Set(attendance.docs.map((d) => d.data().uid as string)));
  if (uids.length === 0) return [];

  const userDocs = await Promise.all(uids.map((uid) => db().doc(`users/${uid}`).get()));

  return userDocs
    .filter((s) => s.exists)
    .map((s) => {
      const d = s.data()!;
      return {
        uid: s.id,
        name: d.displayName ?? 'Worker',
        role: d.role === 'admin' ? 'admin' : 'worker',
      };
    });
}

// ─────────────────────────────────────────────────────
// Recent work — last 3 days of cost-coded shifts + FLHA submissions
// ─────────────────────────────────────────────────────

async function loadRecentWork(
  projectId: string,
  workerUid: string
): Promise<FillContext['recentWork']> {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  const submissionsQ = db()
    .collection(`projects/${projectId}/submissions`)
    .where('submittedBy', '==', workerUid)
    .orderBy('submittedAt', 'desc')
    .limit(3);

  const snap = await submissionsQ.get().catch(() => null);
  if (!snap) return [];

  const out: FillContext['recentWork'] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const submittedAt = tsToMs(d.submittedAt);
    if (submittedAt && submittedAt < threeDaysAgo) continue;

    const values = (d.values ?? {}) as Record<string, unknown>;
    const workDescription = String(
      values['job-description'] ?? values['work-today'] ?? values['workType'] ?? ''
    );
    if (!workDescription) continue;

    out.push({
      date: new Date(submittedAt ?? Date.now()).toISOString().slice(0, 10),
      workDescription,
      costCode: typeof values['cost-code'] === 'string' ? (values['cost-code'] as string) : undefined,
    });
  }
  return out;
}

function tsToMs(v: unknown): number | undefined {
  if (!v) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toMillis' in v && typeof (v as any).toMillis === 'function') {
    return (v as any).toMillis();
  }
  return undefined;
}

// ─────────────────────────────────────────────────────
// Weather (Environment Canada — public, no key)
//
// We use Open-Meteo's free forecast API which proxies ECCC data and is
// keyless. If we ever outgrow it, swap in the paid OpenWeatherMap layer.
// ─────────────────────────────────────────────────────

async function loadWeather(
  lat: number,
  lng: number
): Promise<FillContext['weather'] | undefined> {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) return undefined;
  const data = (await res.json()) as any;
  const c = data?.current;
  if (!c) return undefined;

  const tempC = Math.round(c.temperature_2m);
  const humidity = c.relative_humidity_2m as number;
  const code = c.weather_code as number;
  const conditions = describeWeatherCode(code);

  // Simple heat-stress heuristic.
  // WorkSafeBC recommends Humidex monitoring; we use a simplified version here.
  // Real implementation should use WBGT or full Humidex tables.
  const heatIndex = computeHumidex(tempC, humidity);
  const heatRisk = heatIndex >= 35;

  return {
    tempC,
    summary: `${tempC}°C, ${conditions.toLowerCase()}`,
    conditions,
    heatRisk,
  };
}

function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Mixed conditions';
}

function computeHumidex(tempC: number, rh: number): number {
  // Humidex = T + 0.5555 * (e - 10) where e = vapour pressure
  // Simplified: returns a "feels-like" number similar to WorkSafeBC's reference table.
  const dewPoint = tempC - (100 - rh) / 5;
  const e = 6.11 * Math.exp((5417.7530 * (1 / 273.16 - 1 / (dewPoint + 273.15))));
  return tempC + 0.5555 * (e - 10);
}
