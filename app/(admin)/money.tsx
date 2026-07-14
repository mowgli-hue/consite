/**
 * Admin → Money. The bookkeeper's queue: never miss a billable milestone.
 *
 * Three sections, all computed from live phase data:
 *  1. READY TO INVOICE — 💰 phases done but not marked invoiced, oldest first,
 *     with aging (yellow > 7 days, red > 14 — money left on the table).
 *  2. RECENTLY INVOICED — audit trail (who/when) with undo for mis-taps.
 *  3. COMING UP — 💰 phases not yet done: the revenue pipeline.
 *
 * The app computes, people confirm: marking invoiced is one tap + confirm,
 * admin-only (managers see everything read-only). Payroll export lives in
 * Hours & Reports — linked from the header.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { notify, confirm } from '../../src/lib/notify';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Phase } from '../../src/lib/lifecycle';
import type { Project } from '../../src/types';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

interface Milestone {
  project: Project;
  phase: Phase;
  /** "Milestone 2 of 3" — position among the project's 💰 phases. */
  seq: number;
  seqTotal: number;
}

const DAY = 24 * 60 * 60 * 1000;

function daysSince(ms?: number | null): number | null {
  if (typeof ms !== 'number') return null;
  return Math.floor((Date.now() - ms) / DAY);
}

function fmtValue(v?: number): string | null {
  if (typeof v !== 'number' || v <= 0) return null;
  return `$${v.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`;
}

function fmtDate(ms?: number | null): string {
  if (typeof ms !== 'number') return '—';
  return new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

export default function AdminMoney() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // phase id being written

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('active', '==', true)));
      const projects = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
      const all: Milestone[] = [];
      await Promise.all(projects.map(async (project) => {
        try {
          const ph = await getDocs(query(collection(db, 'projects', project.id, 'phases'), orderBy('order')));
          const phases = ph.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Phase, 'id'>) }));
          const money = phases.filter((p) => p.invoiceMilestone);
          money.forEach((phase, i) => all.push({ project, phase, seq: i + 1, seqTotal: money.length }));
        } catch { /* unreadable project → skip, don't kill the queue */ }
      }));
      setMilestones(all);
    } catch (e) {
      setMilestones([]);
      notify('Money view failed to load', e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function markInvoiced(m: Milestone) {
    confirm(
      'Mark invoiced?',
      `${m.project.name} — ${m.phase.name}\n\nThis records today as the invoice date (visible to the whole office).`,
      async () => {
        setBusy(m.phase.id);
        try {
          await updateDoc(doc(db, 'projects', m.project.id, 'phases', m.phase.id), {
            invoicedAt: Date.now(),
            invoicedBy: user?.displayName ?? user?.uid ?? 'office',
          });
          await load();
        } catch (e) {
          notify('Could not mark invoiced', e instanceof Error ? e.message : String(e));
        } finally { setBusy(null); }
      },
      'Mark invoiced',
    );
  }

  function undoInvoiced(m: Milestone) {
    confirm(
      'Undo invoice mark?',
      `${m.project.name} — ${m.phase.name} goes back into the queue.`,
      async () => {
        setBusy(m.phase.id);
        try {
          await updateDoc(doc(db, 'projects', m.project.id, 'phases', m.phase.id), {
            invoicedAt: null, invoicedBy: null,
          });
          await load();
        } catch (e) {
          notify('Could not undo', e instanceof Error ? e.message : String(e));
        } finally { setBusy(null); }
      },
      'Undo',
    );
  }

  const all = milestones ?? [];
  const ready = all
    .filter((m) => m.phase.status === 'done' && !m.phase.invoicedAt)
    .sort((a, b) => (a.phase.completedAt ?? 0) - (b.phase.completedAt ?? 0)); // oldest first — worst first
  const invoiced = all
    .filter((m) => !!m.phase.invoicedAt)
    .sort((a, b) => (b.phase.invoicedAt ?? 0) - (a.phase.invoicedAt ?? 0))
    .slice(0, 10);
  const upcoming = all
    .filter((m) => m.phase.status !== 'done')
    .sort((a, b) => a.project.name.localeCompare(b.project.name) || a.phase.order - b.phase.order);

  const oldestWait = ready.length > 0 ? daysSince(ready[0].phase.completedAt) : null;
  const valueInPlay = [...new Map(
    ready.map((m) => [m.project.id, m.project.contractValue ?? 0]),
  ).values()].reduce((s, v) => s + v, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Money</Text>
        <Pressable hitSlop={8} onPress={() => router.push('/reports' as any)} style={styles.payrollLink}>
          <Feather name="bar-chart-2" size={15} color={colors.primary} />
          <Text style={styles.payrollLinkText}>Payroll export</Text>
        </Pressable>
      </View>

      {milestones === null ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Summary strip */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, ready.length > 0 && { color: colors.primary }]}>{ready.length}</Text>
              <Text style={styles.statLabel}>Ready to invoice</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumber, (oldestWait ?? 0) > 7 && { color: colors.danger }]}>
                {oldestWait !== null ? `${oldestWait}d` : '–'}
              </Text>
              <Text style={styles.statLabel}>Longest waiting</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{fmtValue(valueInPlay) ?? '–'}</Text>
              <Text style={styles.statLabel}>Contracts in play</Text>
            </View>
          </View>

          {/* 1 — Ready to invoice */}
          <Text style={styles.sectionLabel}>Ready to invoice</Text>
          {ready.length === 0 ? (
            <View style={styles.emptyCard}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={styles.emptyText}>Nothing waiting — every completed milestone is invoiced.</Text>
            </View>
          ) : ready.map((m) => {
            const wait = daysSince(m.phase.completedAt);
            const waitStyle = wait !== null && wait > 14 ? styles.waitDanger
              : wait !== null && wait > 7 ? styles.waitWarning : styles.waitOk;
            return (
              <View key={`${m.project.id}-${m.phase.id}`} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.phaseName}>💰 {m.phase.name}</Text>
                  <Text style={styles.projectLine}>
                    {m.project.name} · milestone {m.seq} of {m.seqTotal}
                    {fmtValue(m.project.contractValue) ? ` · contract ${fmtValue(m.project.contractValue)}` : ''}
                  </Text>
                  <Text style={styles.metaLine}>
                    Completed {fmtDate(m.phase.completedAt)}
                    {m.phase.completedBy ? ` by ${m.phase.completedBy}` : ''}
                    {'  '}
                    <Text style={waitStyle}>
                      {wait !== null ? `· waiting ${wait} day${wait === 1 ? '' : 's'}` : ''}
                    </Text>
                  </Text>
                </View>
                {isAdmin && (
                  <Pressable
                    style={[styles.invoiceBtn, busy === m.phase.id && { opacity: 0.5 }]}
                    disabled={busy === m.phase.id}
                    onPress={() => markInvoiced(m)}
                  >
                    <Feather name="check" size={15} color={colors.textInverse} />
                    <Text style={styles.invoiceBtnText}>Invoiced</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* 2 — Recently invoiced */}
          {invoiced.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Recently invoiced</Text>
              {invoiced.map((m) => (
                <View key={`${m.project.id}-${m.phase.id}`} style={[styles.card, styles.cardDim]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.phaseName}>{m.phase.name}</Text>
                    <Text style={styles.projectLine}>{m.project.name}</Text>
                    <Text style={styles.metaLine}>
                      Invoiced {fmtDate(m.phase.invoicedAt)}
                      {m.phase.invoicedBy ? ` by ${m.phase.invoicedBy}` : ''}
                    </Text>
                  </View>
                  {isAdmin && (
                    <Pressable hitSlop={8} disabled={busy === m.phase.id} onPress={() => undoInvoiced(m)}>
                      <Text style={styles.undoText}>Undo</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </>
          )}

          {/* 3 — Coming up: the revenue pipeline */}
          {upcoming.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Coming up</Text>
              {upcoming.map((m) => (
                <View key={`${m.project.id}-${m.phase.id}`} style={[styles.card, styles.cardDim]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.phaseName}>💰 {m.phase.name}</Text>
                    <Text style={styles.projectLine}>
                      {m.project.name} · {m.phase.status === 'active' ? 'in progress now' : 'not started'}
                      {m.phase.targetEnd ? ` · target ${m.phase.targetEnd}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, m.phase.status === 'active' && styles.statusPillActive]}>
                    <Text style={[styles.statusPillText, m.phase.status === 'active' && styles.statusPillTextActive]}>
                      {m.phase.status === 'active' ? 'Active' : 'Pending'}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
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
  payrollLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  payrollLinkText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  statNumber: { fontSize: 24, fontWeight: typography.weights.bold, color: colors.text },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, ...shadows.card,
  },
  cardDim: { opacity: 0.75 },

  phaseName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  projectLine: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
  metaLine: { fontSize: typography.sizes.xs, color: colors.textTertiary, marginTop: 4 },
  waitOk: { color: colors.textTertiary },
  waitWarning: { color: colors.warning, fontWeight: typography.weights.semibold },
  waitDanger: { color: colors.danger, fontWeight: typography.weights.bold },

  invoiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  invoiceBtnText: { color: colors.textInverse, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  undoText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.successSoft, borderRadius: radii.lg, padding: spacing.lg,
  },
  emptyText: { flex: 1, color: colors.text, fontSize: typography.sizes.sm },

  statusPill: {
    borderRadius: radii.pill, paddingVertical: 3, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  statusPillActive: { backgroundColor: colors.primarySoft },
  statusPillText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary },
  statusPillTextActive: { color: colors.primary },
});
