/**
 * Admin → Safety Center. Audit-readiness for the whole company, one screen.
 *
 * Per active site, computed over the last 14 days of REAL data:
 *   · FLHA compliance — % of worked days (≥1 clock-in) that also have an
 *     FLHA submission. Green ≥ 90%, yellow ≥ 70%, red below. Days nobody
 *     worked don't count against the site.
 *   · Toolbox talks — count in the window (weekly cadence expected).
 *   · Open safety deficiencies — straight off the punch list.
 * Company-wide: cert expiries (expired / expiring ≤ 30 days) linking to
 * the full Compliance screen.
 *
 * Same philosophy as the lifecycle: every red number is a specific,
 * fixable instruction — this is what a WorkSafeBC inspector would ask for.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  collection, collectionGroup, getDocs, query, where, Timestamp,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { notify } from '../../src/lib/notify';
import { tsToMs } from '../../src/lib/attendance';
import type { Project } from '../../src/types';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

const WINDOW_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

interface SiteSafety {
  project: Project;
  workedDays: number;
  flhaDays: number;
  toolboxCount: number;
  openDeficiencies: number;
}

interface CertSummary { expired: number; expiring30: number }

function dayKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA'); // YYYY-MM-DD local
}

function pct(sites: SiteSafety): number | null {
  if (sites.workedDays === 0) return null;
  return Math.round((sites.flhaDays / sites.workedDays) * 100);
}

export default function SafetyCenter() {
  const [sites, setSites] = useState<SiteSafety[] | null>(null);
  const [certs, setCerts] = useState<CertSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const since = Date.now() - WINDOW_DAYS * DAY;
    const sinceTs = Timestamp.fromMillis(since);
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('active', '==', true)));
      const projects = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }))
        .filter((p) => p.stage !== 'archived');

      const rows = await Promise.all(projects.map(async (project) => {
        const row: SiteSafety = {
          project, workedDays: 0, flhaDays: 0, toolboxCount: 0, openDeficiencies: 0,
        };

        // Worked days: distinct local days with ≥1 clock-in.
        try {
          const att = await getDocs(query(
            collection(db, 'projects', project.id, 'attendance'),
            where('clockInAt', '>=', sinceTs),
          ));
          const days = new Set<string>();
          att.docs.forEach((d) => {
            const ms = tsToMs((d.data() as { clockInAt?: unknown }).clockInAt);
            if (ms) days.add(dayKey(ms));
          });
          row.workedDays = days.size;
        } catch { /* skip — row shows what it can */ }

        // FLHA days + toolbox talks from submissions in the window.
        try {
          const subs = await getDocs(query(
            collection(db, 'projects', project.id, 'submissions'),
            where('submittedAt', '>=', sinceTs),
          ));
          const flhaDays = new Set<string>();
          subs.docs.forEach((d) => {
            const data = d.data() as { schemaId?: string; submittedAt?: unknown };
            const sid = String(data.schemaId ?? '').toLowerCase();
            const ms = tsToMs(data.submittedAt);
            if (!ms) return;
            if (sid.includes('flha') || data.schemaId === project.defaultFlhaFormId) flhaDays.add(dayKey(ms));
            if (sid.includes('toolbox')) row.toolboxCount += 1;
          });
          row.flhaDays = flhaDays.size;
        } catch { /* skip */ }

        try {
          row.openDeficiencies = (await getDocs(query(
            collection(db, 'projects', project.id, 'deficiencies'),
            where('status', '==', 'open'),
          ))).size;
        } catch { /* skip */ }

        return row;
      }));

      // Worst compliance first — that's where the inspector looks.
      rows.sort((a, b) => (pct(a) ?? 101) - (pct(b) ?? 101));
      setSites(rows);
    } catch (e) {
      setSites([]);
      notify('Safety Center failed to load', e instanceof Error ? e.message : String(e));
    }

    // Cert expiries (company-wide) — same source as the Compliance screen.
    try {
      const snap = await getDocs(query(collectionGroup(db, 'certifications')));
      let expired = 0; let expiring30 = 0;
      snap.docs.forEach((d) => {
        const exp = (d.data() as { expiresAt?: number }).expiresAt;
        if (typeof exp !== 'number') return;
        if (exp <= Date.now()) expired += 1;
        else if (exp <= Date.now() + 30 * DAY) expiring30 += 1;
      });
      setCerts({ expired, expiring30 });
    } catch { setCerts(null); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const totalDefs = (sites ?? []).reduce((s, r) => s + r.openDeficiencies, 0);
  const rated = (sites ?? []).filter((r) => pct(r) !== null);
  const worst = rated.length > 0 ? Math.min(...rated.map((r) => pct(r) as number)) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Safety Center</Text>
        <Pressable hitSlop={8} onPress={() => router.push('/compliance' as any)} style={styles.certsLink}>
          <Feather name="shield" size={15} color={colors.primary} />
          <Text style={styles.certsLinkText}>All certs</Text>
        </Pressable>
      </View>

      {sites === null ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Summary strip */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, worst !== null && worst < 70 && { color: colors.danger }]}>
                {worst !== null ? `${worst}%` : '–'}
              </Text>
              <Text style={styles.statLabel}>Worst site FLHA</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, totalDefs > 0 && { color: colors.warning }]}>{totalDefs}</Text>
              <Text style={styles.statLabel}>Open deficiencies</Text>
            </View>
            <Pressable style={styles.stat} onPress={() => router.push('/compliance' as any)}>
              <Text style={[styles.statNumber, (certs?.expired ?? 0) > 0 && { color: colors.danger }]}>
                {certs ? certs.expired + certs.expiring30 : '–'}
              </Text>
              <Text style={styles.statLabel}>
                Certs expired/≤30d{certs && certs.expired > 0 ? ` (${certs.expired} lapsed)` : ''}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Sites — last {WINDOW_DAYS} days</Text>
          {sites.length === 0 ? (
            <Text style={styles.emptyText}>No active sites.</Text>
          ) : sites.map((r) => {
            const p = pct(r);
            const tone = p === null ? 'idle' : p >= 90 ? 'good' : p >= 70 ? 'warn' : 'bad';
            const barColor = tone === 'good' ? colors.success : tone === 'warn' ? colors.warning : tone === 'bad' ? colors.danger : colors.borderStrong;
            return (
              <Pressable
                key={r.project.id}
                style={styles.card}
                onPress={() => router.push(`/project?id=${r.project.id}` as any)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.siteName} numberOfLines={1}>{r.project.name}</Text>
                  <Text style={[styles.pctText, { color: barColor }]}>
                    {p === null ? 'no work' : `${p}% FLHA`}
                  </Text>
                </View>

                {p !== null && (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${p}%`, backgroundColor: barColor }]} />
                  </View>
                )}

                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>
                    {r.flhaDays}/{r.workedDays} worked days with FLHA
                  </Text>
                  <Text style={[styles.metaText, r.toolboxCount === 0 && r.workedDays > 0 && styles.metaWarn]}>
                    {r.toolboxCount} toolbox talk{r.toolboxCount === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.metaText, r.openDeficiencies > 0 && styles.metaWarn]}>
                    {r.openDeficiencies} open deficienc{r.openDeficiencies === 1 ? 'y' : 'ies'}
                  </Text>
                </View>

                {/* Instruction — every red is fixable */}
                {tone === 'bad' && (
                  <Text style={styles.instruction}>
                    ✗ Crews are working without the daily FLHA — remind the foreman: it auto-opens at clock-in.
                  </Text>
                )}
                {r.toolboxCount === 0 && r.workedDays >= 5 && (
                  <Text style={styles.instruction}>
                    ✗ No toolbox talk in {WINDOW_DAYS} days — run one this week (Forms → Toolbox Talk, AI-fillable).
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  certsLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  certsLinkText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  statNumber: { fontSize: 24, fontWeight: typography.weights.bold, color: colors.text },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, ...shadows.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  siteName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  pctText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },

  track: {
    height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt,
    overflow: 'hidden', marginTop: spacing.sm,
  },
  fill: { height: '100%', borderRadius: radii.pill },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  metaText: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  metaWarn: { color: colors.warning, fontWeight: typography.weights.semibold },

  instruction: { marginTop: spacing.sm, fontSize: typography.sizes.xs, color: colors.danger },
  emptyText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
});
