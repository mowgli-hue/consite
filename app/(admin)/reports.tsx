/**
 * Admin → Hours & Reports.
 *
 * Pick a WORKER, pick a PROJECT, pick a range — and read off how much
 * that person worked there. Any combination works: one worker across all
 * projects, everyone on one site, or the whole company.
 *
 * Admins can approve, EDIT (fix a wrong time) and DELETE any shift; the
 * payroll CSV exports exactly what's on screen. Audit pack per project.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where, Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';

import { db, functions, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { approveShift, paidHours, tsToMs } from '../../src/lib/attendance';
import { notify, confirm, toast } from '../../src/lib/notify';
import { listUsers, listAllProjects } from '../../src/lib/adminUsers';
import { colors, spacing, radii, typography, shadows, touch } from '../../src/theme';
import type { Project, User } from '../../src/types';

type Row = {
  id: string; projectId: string; projectName: string;
  uid: string; name: string;
  inMs: number; outMs?: number; hours?: number; open: boolean;
  status?: string; breakMinutes: number;
  manualEntry?: boolean; enteredBy?: string; approvedBy?: string;
};

type EditDraft = { id: string; date: string; start: string; end: string; breakMin: string };

const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '14', label: 'Last 14 days', days: 14 },
  { id: '31', label: 'Last 31 days', days: 31 },
  { id: '90', label: 'Last 90 days', days: 90 },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = (ms: number) => new Date(ms).toLocaleDateString('en-CA');

function parseWhen(dateStr: string, timeStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m || !t) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export default function AdminReports() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectSel, setProjectSel] = useState<string>('all');
  const [workerSel, setWorkerSel] = useState<string>('all');
  const [workerSearch, setWorkerSearch] = useState('');
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [packBusy, setPackBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [p, u] = await Promise.all([listAllProjects(), listUsers()]);
        setProjects(p);
        setUsers(u);
      } catch (err: any) {
        notify('Could not load', err.message);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (projects.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      // Calendar days, not a rolling millisecond window — "last 7 days"
      // run at 9am and at 4pm must produce the same payroll totals.
      const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
      const since = Timestamp.fromMillis(dayStart.getTime() - (rangeDays - 1) * 86_400_000);
      const nameOf = (uid: string) => users.find((u) => u.uid === uid)?.displayName ?? uid.slice(0, 8);
      const targets = projectSel === 'all' ? projects : projects.filter((p) => p.id === projectSel);

      const perProject = await Promise.all(targets.map(async (p) => {
        try {
          const snap = await getDocs(query(
            collection(db, 'projects', p.id, 'attendance'),
            where('clockInAt', '>=', since),
            orderBy('clockInAt', 'desc'),
          ));
          return snap.docs.map((d): Row => {
            const a = d.data() as any;
            const inMs = tsToMs(a.clockInAt) ?? 0;
            const outMs = tsToMs(a.clockOutAt);
            return {
              id: d.id, projectId: p.id, projectName: p.name,
              uid: a.uid, name: nameOf(a.uid) !== a.uid?.slice(0, 8) ? nameOf(a.uid) : (a.displayName ?? nameOf(a.uid)),
              inMs, outMs,
              hours: outMs ? paidHours(inMs, outMs, a.breakMinutes) : undefined,
              open: !outMs,
              status: a.status,
              breakMinutes: a.breakMinutes ?? 0,
              manualEntry: a.manualEntry === true,
              enteredBy: a.enteredBy ? nameOf(a.enteredBy) : undefined,
              approvedBy: a.approvedBy ? nameOf(a.approvedBy) : undefined,
            };
          });
        } catch { return []; /* one unreadable project must not blank the report */ }
      }));
      setRows(perProject.flat().sort((a, b) => b.inMs - a.inMs));
    } catch (err: any) {
      notify('Report failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [projects, projectSel, rangeDays, users]);

  useEffect(() => { load(); }, [load]);

  // The selection, applied.
  const visible = useMemo(
    () => (workerSel === 'all' ? rows : rows.filter((r) => r.uid === workerSel)),
    [rows, workerSel],
  );

  const summary = useMemo(() => {
    let approved = 0; let pending = 0; let open = 0;
    for (const r of visible) {
      if (r.open) open += 1;
      else if (r.status === 'approved') approved += r.hours ?? 0;
      else pending += r.hours ?? 0;
    }
    return { approved, pending, open, shifts: visible.length, total: approved + pending };
  }, [visible]);

  const byWorker = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; hours: number; shifts: number; open: number }>();
    for (const r of visible) {
      const t = m.get(r.uid) ?? { uid: r.uid, name: r.name, hours: 0, shifts: 0, open: 0 };
      t.shifts += 1; t.hours += r.hours ?? 0; if (r.open) t.open += 1;
      m.set(r.uid, t);
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [visible]);

  const byProject = useMemo(() => {
    const m = new Map<string, { id: string; name: string; hours: number; shifts: number }>();
    for (const r of visible) {
      const t = m.get(r.projectId) ?? { id: r.projectId, name: r.projectName, hours: 0, shifts: 0 };
      t.shifts += 1; t.hours += r.hours ?? 0;
      m.set(r.projectId, t);
    }
    return [...m.values()].sort((a, b) => b.hours - a.hours);
  }, [visible]);

  // Worker picker: people who can have hours, narrowed by the search box.
  const pickable = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    return users
      .filter((u) => u.role === 'worker' || rows.some((r) => r.uid === u.uid))
      .filter((u) => !q || (u.displayName ?? '').toLowerCase().includes(q))
      .slice(0, 40);
  }, [users, rows, workerSearch]);

  const workerLabel = workerSel === 'all' ? 'All workers' : (users.find((u) => u.uid === workerSel)?.displayName ?? 'Worker');
  const projectLabel = projectSel === 'all' ? 'All projects' : (projects.find((p) => p.id === projectSel)?.name ?? 'Project');

  async function officeApprove(r: Row) {
    if (!me) return;
    setApprovingId(r.id);
    try {
      await approveShift({ projectId: r.projectId, recordId: r.id, approverUid: me.uid });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, status: 'approved' } : x)));
    } catch (err: any) {
      notify('Approve failed', err.message);
    } finally {
      setApprovingId(null);
    }
  }

  async function saveEdit(r: Row) {
    if (!edit || !me) return;
    const inMs = parseWhen(edit.date, edit.start);
    const outMs = edit.end.trim() ? parseWhen(edit.date, edit.end) : null;
    const breakMin = Math.max(0, parseInt(edit.breakMin || '0', 10) || 0);
    if (inMs === null) { notify('Check the times', 'Date is YYYY-MM-DD and times are HH:MM (24-hour), e.g. 07:30.'); return; }
    if (edit.end.trim() && (outMs === null || outMs <= inMs)) { notify('Check the times', 'End must be after start, as HH:MM (24-hour).'); return; }
    try {
      await updateDoc(doc(db, 'projects', r.projectId, 'attendance', r.id), {
        clockInAt: Timestamp.fromMillis(inMs),
        clockOutAt: outMs ? Timestamp.fromMillis(outMs) : null,
        breakMinutes: breakMin,
        // An edited shift always shows who changed it and when.
        editedBy: me.uid, editedAt: Date.now(),
        ...(outMs && r.open ? { status: 'pending', clockOutBy: me.uid } : {}),
      });
      setEdit(null);
      toast('Shift updated ✓', `${r.name} · ${edit.date}`);
      await load();
    } catch (err: any) { notify('Could not save', err.message); }
  }

  function removeShift(r: Row) {
    confirm(
      'Delete this shift?',
      `${r.name} · ${r.projectName} · ${ymd(r.inMs)}${r.hours ? ` · ${r.hours.toFixed(1)}h` : ''}\n\nIt comes off the hours and payroll export.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'projects', r.projectId, 'attendance', r.id));
          setRows((list) => list.filter((x) => x.id !== r.id));
          toast('Shift deleted');
        } catch (err: any) { notify('Delete failed', err.message); }
      },
      'Delete shift',
    );
  }

  async function exportAuditPack() {
    if (projectSel === 'all') return;
    setPackBusy(true);
    try {
      const fn = httpsCallable<{ projectId: string; fromMs: number; toMs: number }, { storagePath: string; records: number }>(functions, 'generateAuditPack');
      const res = await fn({ projectId: projectSel, fromMs: Date.now() - rangeDays * 86_400_000, toMs: Date.now() });
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

  function exportCsv() {
    if (Platform.OS !== 'web') {
      notify('Web only', 'Open the dashboard in a browser to download the CSV.');
      return;
    }
    const esc = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [
      ['Worker', 'Project', 'Date', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Status', 'Entry type', 'Entered by', 'Approved by'].join(','),
      ...visible.map((r) => [
        esc(r.name), esc(r.projectName),
        ymd(r.inMs),
        new Date(r.inMs).toLocaleTimeString(), r.outMs ? new Date(r.outMs).toLocaleTimeString() : '',
        String(r.breakMinutes),
        r.hours?.toFixed(2) ?? '',
        r.open ? 'NO CLOCK-OUT — REVIEW' : (r.status === 'approved' ? 'approved' : 'PENDING APPROVAL'),
        r.manualEntry ? 'MANUAL (foreman-entered)' : 'GPS clock-in',
        esc(r.enteredBy ?? ''), esc(r.approvedBy ?? ''),
      ].join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = `${workerLabel}-${projectLabel}`.replace(/\W+/g, '-');
    a.download = `consite-hours-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Hours & Reports</Text>
        <Pressable hitSlop={8} onPress={exportCsv} accessibilityRole="button" accessibilityLabel="Download CSV">
          <Feather name="download" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── The three pickers ── */}
        <Text style={styles.sectionLabel}>Worker</Text>
        <TextInput
          style={styles.search}
          value={workerSearch} onChangeText={setWorkerSearch}
          placeholder="Type a name to find someone…" placeholderTextColor={colors.textTertiary}
        />
        <View style={styles.chips}>
          <Pressable style={[styles.chip, workerSel === 'all' && styles.chipOn]} onPress={() => setWorkerSel('all')}>
            <Text style={[styles.chipText, workerSel === 'all' && styles.chipTextOn]}>All workers</Text>
          </Pressable>
          {pickable.map((u) => (
            <Pressable key={u.uid} style={[styles.chip, workerSel === u.uid && styles.chipOn]} onPress={() => setWorkerSel(u.uid)}>
              <Text style={[styles.chipText, workerSel === u.uid && styles.chipTextOn]}>{u.displayName}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Project</Text>
        <View style={styles.chips}>
          <Pressable style={[styles.chip, projectSel === 'all' && styles.chipOn]} onPress={() => setProjectSel('all')}>
            <Text style={[styles.chipText, projectSel === 'all' && styles.chipTextOn]}>All projects</Text>
          </Pressable>
          {projects.map((p) => (
            <Pressable key={p.id} style={[styles.chip, projectSel === p.id && styles.chipOn]} onPress={() => setProjectSel(p.id)}>
              <Text style={[styles.chipText, projectSel === p.id && styles.chipTextOn]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>When</Text>
        <View style={styles.chips}>
          {RANGES.map((r) => (
            <Pressable key={r.id} style={[styles.chip, rangeDays === r.days && styles.chipOn]} onPress={() => setRangeDays(r.days)}>
              <Text style={[styles.chipText, rangeDays === r.days && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            {/* ── The answer ── */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryWho}>{workerLabel} · {projectLabel}</Text>
              <Text style={styles.summaryHours}>{summary.total.toFixed(1)}h</Text>
              <Text style={styles.summarySub}>
                {summary.approved.toFixed(1)}h approved · {summary.pending.toFixed(1)}h waiting for approval · {summary.shifts} shift{summary.shifts === 1 ? '' : 's'}
                {summary.open > 0 ? ` · ${summary.open} still open` : ''}
              </Text>
            </View>

            {workerSel === 'all' && byWorker.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>By worker — tap a name to see just them</Text>
                {byWorker.map((t) => (
                  <Pressable key={t.uid} style={styles.totalRow} onPress={() => setWorkerSel(t.uid)}>
                    <Text style={styles.totalName}>{t.name}</Text>
                    <Text style={styles.totalHours}>
                      {t.hours.toFixed(1)}h · {t.shifts} shift{t.shifts === 1 ? '' : 's'}
                      {t.open > 0 && <Text style={styles.flag}>  ⚠ {t.open} open</Text>}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            {projectSel === 'all' && byProject.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>By project</Text>
                {byProject.map((t) => (
                  <Pressable key={t.id} style={styles.totalRow} onPress={() => setProjectSel(t.id)}>
                    <Text style={styles.totalName}>{t.name}</Text>
                    <Text style={styles.totalHours}>{t.hours.toFixed(1)}h · {t.shifts} shift{t.shifts === 1 ? '' : 's'}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {projectSel !== 'all' && (
              <Pressable style={[styles.auditBtn, packBusy && { opacity: 0.6 }]} disabled={packBusy} onPress={exportAuditPack}>
                {packBusy
                  ? <ActivityIndicator color={colors.textInverse} size="small" />
                  : <Feather name="folder" size={16} color={colors.textInverse} />}
                <Text style={styles.auditBtnText}>
                  {packBusy ? 'Building audit pack…' : `Audit pack — all signed records, last ${rangeDays} days`}
                </Text>
              </Pressable>
            )}

            <Text style={styles.sectionLabel}>Shifts ({visible.length})</Text>
            {visible.length === 0 && <Text style={styles.emptyText}>No shifts for this selection.</Text>}
            {visible.map((r) => (
              <View key={`${r.projectId}-${r.id}`} style={[styles.entryCard, r.open && styles.entryOpen]}>
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryName}>{r.name}</Text>
                    <Text style={styles.entrySub}>
                      {r.projectName} · {ymd(r.inMs)} · {hhmm(r.inMs)}
                      {r.outMs ? ` – ${hhmm(r.outMs)}` : ' – still on the clock'}
                      {r.breakMinutes ? ` · ${r.breakMinutes}min break` : ''}
                    </Text>
                    {r.manualEntry && (
                      <Text style={styles.manualTag}>✎ entered by {r.enteredBy ?? 'foreman'}, not GPS</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.entryHours, r.open && { color: colors.danger }]}>
                      {r.hours != null ? `${r.hours.toFixed(1)}h` : 'OPEN'}
                    </Text>
                    {!r.open && (
                      <Text style={[styles.statusTag, r.status === 'approved' ? { color: colors.success } : { color: colors.warning }]}>
                        {r.status === 'approved' ? '✓ approved' : 'pending'}
                      </Text>
                    )}
                  </View>
                </View>

                {isAdmin && edit?.id !== r.id && (
                  <View style={styles.toolRow}>
                    {!r.open && r.status !== 'approved' && (
                      <Pressable
                        style={[styles.toolBtn, styles.toolApprove, approvingId === r.id && { opacity: 0.5 }]}
                        disabled={approvingId === r.id}
                        onPress={() => officeApprove(r)}
                      >
                        <Feather name="check" size={16} color={colors.textInverse} />
                        <Text style={[styles.toolText, { color: colors.textInverse }]}>Approve</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.toolBtn}
                      onPress={() => setEdit({ id: r.id, date: ymd(r.inMs), start: hhmm(r.inMs), end: r.outMs ? hhmm(r.outMs) : '', breakMin: String(r.breakMinutes) })}
                    >
                      <Feather name="edit-2" size={15} color={colors.primary} />
                      <Text style={styles.toolText}>Edit</Text>
                    </Pressable>
                    <Pressable style={[styles.toolBtn, { borderColor: colors.danger }]} onPress={() => removeShift(r)}>
                      <Feather name="trash-2" size={15} color={colors.danger} />
                      <Text style={[styles.toolText, { color: colors.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                )}

                {isAdmin && edit?.id === r.id && (
                  <View style={styles.editBox}>
                    <View style={styles.editRow}>
                      <View style={{ flex: 1.4 }}>
                        <Text style={styles.editLabel}>Date</Text>
                        <TextInput style={styles.editInput} value={edit.date} onChangeText={(t) => setEdit({ ...edit, date: t })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editLabel}>Start</Text>
                        <TextInput style={styles.editInput} value={edit.start} onChangeText={(t) => setEdit({ ...edit, start: t })} placeholder="07:00" placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editLabel}>End</Text>
                        <TextInput style={styles.editInput} value={edit.end} onChangeText={(t) => setEdit({ ...edit, end: t })} placeholder="15:30" placeholderTextColor={colors.textTertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.editLabel}>Break min</Text>
                        <TextInput style={styles.editInput} value={edit.breakMin} onChangeText={(t) => setEdit({ ...edit, breakMin: t })} placeholder="30" keyboardType="number-pad" placeholderTextColor={colors.textTertiary} />
                      </View>
                    </View>
                    <View style={styles.toolRow}>
                      <Pressable style={[styles.toolBtn, styles.toolApprove]} onPress={() => saveEdit(r)}>
                        <Text style={[styles.toolText, { color: colors.textInverse }]}>Save</Text>
                      </Pressable>
                      <Pressable style={styles.toolBtn} onPress={() => setEdit(null)}>
                        <Text style={styles.toolText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 900, width: '100%', alignSelf: 'center' },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  search: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    backgroundColor: colors.surface, color: colors.text, fontSize: typography.sizes.md,
    marginBottom: spacing.sm, minHeight: touch.min,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    minHeight: 40, justifyContent: 'center',
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  summaryCard: {
    marginTop: spacing.xl, alignItems: 'center', padding: spacing.xl,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.primary, ...shadows.card,
  },
  summaryWho: { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, textAlign: 'center' },
  summaryHours: { fontSize: 44, fontWeight: typography.weights.bold, color: colors.text, marginTop: spacing.xs },
  summarySub: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.xs, textAlign: 'center' },

  emptyText: { color: colors.textTertiary, marginTop: spacing.sm },
  auditBtn: {
    marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.md, minHeight: touch.min,
  },
  auditBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, minHeight: touch.min, ...shadows.card,
  },
  totalName: { fontWeight: typography.weights.semibold, color: colors.text },
  totalHours: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  flag: { color: colors.danger, fontWeight: typography.weights.bold },

  entryCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  entryOpen: { borderColor: colors.danger },
  entryName: { fontWeight: typography.weights.semibold, color: colors.text },
  entrySub: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 1 },
  manualTag: {
    color: colors.warning, fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold, marginTop: 2,
  },
  entryHours: { fontWeight: typography.weights.bold, color: colors.text, fontSize: typography.sizes.md },
  statusTag: { fontSize: typography.sizes.xs, marginTop: 2, fontWeight: typography.weights.semibold },

  toolRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md,
    paddingHorizontal: spacing.md, minHeight: 40,
  },
  toolApprove: { backgroundColor: colors.success, borderColor: colors.success },
  toolText: { color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },

  editBox: { marginTop: spacing.md, borderTopWidth: 1, borderColor: colors.border, paddingTop: spacing.md },
  editRow: { flexDirection: 'row', gap: spacing.sm },
  editLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginBottom: 2 },
  editInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.sm,
    color: colors.text, backgroundColor: colors.background, fontSize: typography.sizes.sm,
  },
});
