/**
 * Admin → Reports. Attendance hours by project + date range,
 * flagged entries (no clock-out), payroll CSV export (web).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { Linking } from 'react-native';

import { db, functions, storage } from '../../src/lib/firebase';
import { notify } from '../../src/lib/notify';
import { listUsers, listAllProjects } from '../../src/lib/adminUsers';
import { tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project, User } from '../../src/types';

type Row = {
  id: string; uid: string; name: string;
  inMs: number; outMs?: number; hours?: number; open: boolean;
  status?: string;
};

const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '14', label: 'Last 14 days', days: 14 },
  { id: '31', label: 'Last 31 days', days: 31 },
] as const;

export default function AdminReports() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [packBusy, setPackBusy] = useState(false);

  async function exportAuditPack() {
    if (!projectId) return;
    setPackBusy(true);
    try {
      const fn = httpsCallable<{ projectId: string; fromMs: number; toMs: number }, { storagePath: string; records: number }>(functions, 'generateAuditPack');
      const res = await fn({ projectId, fromMs: Date.now() - rangeDays * 86_400_000, toMs: Date.now() });
      const url = await getDownloadURL(ref(storage, res.data.storagePath));
      notify('Audit pack ready', `${res.data.records} signed record${res.data.records === 1 ? '' : 's'} merged.`);
      if (typeof window !== 'undefined') window.open(url, '_blank');
      else Linking.openURL(url);
    } catch (err: any) {
      notify('Audit pack failed', err.message);
    } finally {
      setPackBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [p, u] = await Promise.all([listAllProjects(), listUsers()]);
        setProjects(p);
        setUsers(u);
        if (p.length > 0) setProjectId(p[0].id);
      } catch (err: any) {
        notify('Could not load', err.message);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const since = Timestamp.fromMillis(Date.now() - rangeDays * 86_400_000);
      const snap = await getDocs(query(
        collection(db, 'projects', projectId, 'attendance'),
        where('clockInAt', '>=', since),
        orderBy('clockInAt', 'desc'),
      ));
      const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.displayName ?? uid.slice(0, 8);
      setRows(snap.docs.map((d) => {
        const a = d.data() as any;
        const inMs = tsToMs(a.clockInAt) ?? 0;
        const outMs = tsToMs(a.clockOutAt);
        return {
          id: d.id, uid: a.uid, name: a.displayName ?? nameOf(a.uid),
          inMs, outMs,
          hours: outMs ? (outMs - inMs) / 3_600_000 : undefined,
          open: !outMs,
          status: a.status,
        };
      }));
    } catch (err: any) {
      notify('Report failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, rangeDays, users]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const byWorker = new Map<string, { name: string; hours: number; shifts: number; open: number }>();
    for (const r of rows) {
      const t = byWorker.get(r.uid) ?? { name: r.name, hours: 0, shifts: 0, open: 0 };
      t.shifts += 1;
      t.hours += r.hours ?? 0;
      if (r.open) t.open += 1;
      byWorker.set(r.uid, t);
    }
    return [...byWorker.values()].sort((a, b) => b.hours - a.hours);
  }, [rows]);

  function exportCsv() {
    if (Platform.OS !== 'web') {
      notify('Web only', 'Open the dashboard in a browser to download the CSV.');
      return;
    }
    const project = projects.find((p) => p.id === projectId);
    const esc = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [
      ['Worker', 'Project', 'Date', 'Clock in', 'Clock out', 'Hours', 'Status'].join(','),
      ...rows.map((r) => [
        esc(r.name), esc(project?.name ?? ''),
        new Date(r.inMs).toLocaleDateString('en-CA'),
        new Date(r.inMs).toLocaleTimeString(), r.outMs ? new Date(r.outMs).toLocaleTimeString() : '',
        r.hours?.toFixed(2) ?? '',
        r.open ? 'NO CLOCK-OUT — REVIEW' : (r.status === 'approved' ? 'approved' : 'PENDING FOREMAN APPROVAL'),
      ].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `consite-hours-${project?.name?.replace(/\W+/g, '-') ?? 'project'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Hours & Reports</Text>
        <Pressable hitSlop={8} onPress={exportCsv}>
          <Feather name="download" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Project</Text>
        <View style={styles.chips}>
          {projects.map((p) => (
            <Pressable key={p.id} style={[styles.chip, projectId === p.id && styles.chipOn]} onPress={() => setProjectId(p.id)}>
              <Text style={[styles.chipText, projectId === p.id && styles.chipTextOn]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Range</Text>
        <View style={styles.chips}>
          {RANGES.map((r) => (
            <Pressable key={r.id} style={[styles.chip, rangeDays === r.days && styles.chipOn]} onPress={() => setRangeDays(r.days)}>
              <Text style={[styles.chipText, rangeDays === r.days && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[styles.auditBtn, packBusy && { opacity: 0.6 }]}
          disabled={packBusy || !projectId}
          onPress={exportAuditPack}
        >
          {packBusy ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Feather name="folder" size={16} color={colors.textInverse} />
          )}
          <Text style={styles.auditBtnText}>
            {packBusy ? 'Building audit pack…' : `Audit pack — all signed records, last ${rangeDays} days`}
          </Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Totals by worker</Text>
            {totals.length === 0 && <Text style={styles.emptyText}>No attendance in this range.</Text>}
            {totals.map((t) => (
              <View key={t.name} style={styles.totalRow}>
                <Text style={styles.totalName}>{t.name}</Text>
                <Text style={styles.totalHours}>
                  {t.hours.toFixed(1)}h · {t.shifts} shift{t.shifts === 1 ? '' : 's'}
                  {t.open > 0 && <Text style={styles.flag}>  ⚠ {t.open} open</Text>}
                </Text>
              </View>
            ))}

            <Text style={styles.sectionLabel}>All entries</Text>
            {rows.map((r) => (
              <View key={r.id} style={[styles.entryRow, r.open && styles.entryOpen]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{r.name}</Text>
                  <Text style={styles.entrySub}>
                    {new Date(r.inMs).toLocaleDateString('en-CA')} · in {new Date(r.inMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {r.outMs ? ` → out ${new Date(r.outMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' → still on the clock'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.entryHours, r.open && { color: colors.danger }]}>
                    {r.hours ? `${r.hours.toFixed(1)}h` : 'OPEN'}
                  </Text>
                  {!r.open && (
                    <Text style={[styles.statusTag, r.status === 'approved' ? { color: colors.success } : { color: colors.warning }]}>
                      {r.status === 'approved' ? '✓ approved' : 'pending'}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  emptyText: { color: colors.textTertiary, marginTop: spacing.sm },
  auditBtn: {
    marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md,
  },
  auditBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.card,
  },
  totalName: { fontWeight: typography.weights.semibold, color: colors.text },
  totalHours: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  flag: { color: colors.danger, fontWeight: typography.weights.bold },

  entryRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs,
  },
  entryOpen: { borderColor: colors.danger },
  entryName: { fontWeight: typography.weights.medium, color: colors.text },
  entrySub: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 1 },
  entryHours: { fontWeight: typography.weights.bold, color: colors.text },
  statusTag: { fontSize: typography.sizes.xs, marginTop: 2 },
});
