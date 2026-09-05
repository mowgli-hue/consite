/**
 * Foreman → Crew Hours. Shows the crew's shifts on projects where I hold
 * the approve permission; pending shifts get one-tap approval.
 * Workers without foreman role see a friendly no-access state.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { addManualShift, approveShift, paidHours, tsToMs } from '../../src/lib/attendance';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

/** "New Shift" quick presets — one tap fills start/end. */
const QUICK_SHIFTS = [
  { label: '7–3:30', start: '07:00', end: '15:30', breakMin: 30 },
  { label: '8–4:30', start: '08:00', end: '16:30', breakMin: 30 },
  { label: '8–5', start: '08:00', end: '17:00', breakMin: 60 },
] as const;
const BREAK_OPTIONS = [0, 15, 30, 45, 60] as const;

function parseWhen(dateStr: string, timeStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m || !t) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

type PendingShift = {
  id: string; projectId: string; projectName: string;
  uid: string; name: string; inMs: number; outMs?: number; hours?: number;
  needsReview?: boolean; open: boolean; manualEntry?: boolean;
};

type CrewMember = { uid: string; name: string };

export default function CrewHours() {
  const { user } = useAuth();
  const [foremanProjects, setForemanProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [shifts, setShifts] = useState<PendingShift[]>([]);
  const [crews, setCrews] = useState<Record<string, CrewMember[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Which of my projects am I foreman on?
      const fps: { id: string; name: string }[] = [];
      for (const pid of user.projectIds ?? []) {
        const member = await getDoc(doc(db, 'projects', pid, 'members', user.uid));
        const role = member.data()?.role;
        const perms: string[] = member.data()?.permissions ?? [];
        if (role === 'foreman' || role === 'lead-foreman' || role === 'supervisor' || perms.includes('supervisor.attendance.approve')) {
          const proj = await getDoc(doc(db, 'projects', pid));
          fps.push({ id: pid, name: proj.data()?.name ?? pid });
        }
      }
      setForemanProjects(fps);

      // Crew rosters for manual shift entry.
      const rosters: Record<string, CrewMember[]> = {};
      for (const fp of fps) {
        try {
          const ms = await getDocs(collection(db, 'projects', fp.id, 'members'));
          rosters[fp.id] = ms.docs
            .map((d) => ({ uid: d.id, name: (d.data().displayName as string) ?? d.id.slice(0, 8) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        } catch { rosters[fp.id] = []; }
      }
      setCrews(rosters);

      // Crew shifts awaiting approval (+ open shifts for visibility)
      const out: PendingShift[] = [];
      for (const fp of fps) {
        const snap = await getDocs(query(
          collection(db, 'projects', fp.id, 'attendance'),
          where('status', '==', 'pending'),
        ));
        for (const d of snap.docs) {
          const a = d.data() as any;
          const inMs = tsToMs(a.clockInAt) ?? 0;
          const outMs = tsToMs(a.clockOutAt);
          out.push({
            id: d.id, projectId: fp.id, projectName: fp.name,
            uid: a.uid, name: a.displayName ?? a.uid?.slice(0, 8) ?? 'Worker',
            inMs, outMs,
            hours: outMs ? paidHours(inMs, outMs, a.breakMinutes) : undefined,
            needsReview: a.needsReview, open: !outMs, manualEntry: a.manualEntry,
          });
        }
      }
      out.sort((a, b) => b.inMs - a.inMs);
      setShifts(out);
    } catch (err: any) {
      notify('Could not load crew hours', err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function approve(s: PendingShift) {
    if (!user) return;
    if (s.uid === user.uid) {
      notify('Not allowed', 'You cannot approve your own hours — a lead foreman or the office does that.');
      return;
    }
    setBusyId(s.id);
    try {
      await approveShift({ projectId: s.projectId, recordId: s.id, approverUid: user.uid });
      setShifts((list) => list.filter((x) => x.id !== s.id));
    } catch (err: any) {
      notify('Approve failed', err.message);
    } finally {
      setBusyId(null);
    }
  }

  const isForeman = (foremanProjects?.length ?? 0) > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Crew Hours</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !isForeman ? (
        <View style={styles.center}>
          <Feather name="users" size={32} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Foreman access only</Text>
          <Text style={styles.emptySub}>Ask the office to make you a foreman on your project.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Pressable style={styles.addToggle} onPress={() => setShowAdd((v) => !v)}>
            <Feather name={showAdd ? 'x' : 'plus-circle'} size={16} color={colors.primary} />
            <Text style={styles.addToggleText}>
              {showAdd ? 'Cancel' : 'New shift — enter hours for a worker'}
            </Text>
          </Pressable>

          {showAdd && user && (
            <NewShiftCard
              projects={foremanProjects ?? []}
              crews={crews}
              enteredBy={user.uid}
              enteredByName={user.displayName}
              onSaved={() => { setShowAdd(false); load(); }}
            />
          )}

          <Text style={styles.sectionLabel}>
            Awaiting approval ({shifts.length})
          </Text>

          {shifts.length === 0 && (
            <View style={styles.empty}>
              <Feather name="check-circle" size={32} color={colors.success} />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptySub}>Crew clock-outs appear here for your approval.</Text>
            </View>
          )}

          {shifts.map((s) => (
            <View key={s.id} style={[styles.card, s.needsReview && styles.cardFlagged]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.sub}>{s.projectName}</Text>
                <Text style={styles.sub}>
                  {new Date(s.inMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' · '}
                  {new Date(s.inMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {s.outMs ? ` – ${new Date(s.outMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  {s.needsReview ? '  ⚠ auto clock-out' : ''}
                  {s.manualEntry ? '  ✎ entered by foreman' : ''}
                </Text>
              </View>
              <Text style={styles.hours}>{s.hours ? `${s.hours.toFixed(1)}h` : '—'}</Text>
              <Pressable
                style={[styles.approveBtn, busyId === s.id && { opacity: 0.5 }]}
                disabled={busyId === s.id}
                onPress={() => approve(s)}
              >
                {busyId === s.id
                  ? <ActivityIndicator color={colors.textInverse} size="small" />
                  : <Feather name="check" size={18} color={colors.textInverse} />}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * "New Shift" — modeled on the timesheet apps foremen already know:
 * quick-shift presets, start/end, unpaid break, live paid total, notes.
 * Saves as a flagged manualEntry, status pending — approval flow unchanged.
 */
function NewShiftCard({ projects, crews, enteredBy, enteredByName, onSaved }: {
  projects: { id: string; name: string }[];
  crews: Record<string, CrewMember[]>;
  enteredBy: string; enteredByName?: string;
  onSaved: () => void;
}) {
  const today = new Date().toLocaleDateString('en-CA');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [workerUid, setWorkerUid] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:30');
  const [breakMin, setBreakMin] = useState<number>(30);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const crew = crews[projectId] ?? [];
  const worker = crew.find((c) => c.uid === workerUid);
  const inMs = parseWhen(date, start);
  const outMs = parseWhen(date, end);
  const total = inMs !== null && outMs !== null && outMs > inMs ? paidHours(inMs, outMs, breakMin) : null;

  async function save() {
    if (!projectId || !worker) { notify('Pick a worker', 'Choose the site and the worker first.'); return; }
    if (worker.uid === enteredBy) { notify('Not allowed', 'You cannot enter your own hours — the office does that.'); return; }
    if (inMs === null || outMs === null) { notify('Check the times', 'Date is YYYY-MM-DD, times are HH:MM (24h).'); return; }
    if (total === null || total <= 0) { notify('Check the times', 'Shift end must be after shift start.'); return; }
    setBusy(true);
    try {
      await addManualShift({
        projectId, workerUid: worker.uid, workerName: worker.name,
        inMs, outMs, breakMinutes: breakMin, notes,
        enteredBy, enteredByName,
      });
      notify('Shift entered', `${worker.name} · ${total.toFixed(1)}h paid — pending approval.`);
      onSaved();
    } catch (err: any) {
      notify('Could not save shift', err.message);
    } finally { setBusy(false); }
  }

  return (
    <View style={styles.addCard}>
      {projects.length > 1 && (
        <>
          <Text style={styles.addLabel}>Site</Text>
          <View style={styles.chipRow}>
            {projects.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.chip, projectId === p.id && styles.chipOn]}
                onPress={() => { setProjectId(p.id); setWorkerUid(null); }}
              >
                <Text style={[styles.chipText, projectId === p.id && styles.chipTextOn]}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Text style={styles.addLabel}>Worker</Text>
      <View style={styles.chipRow}>
        {crew.filter((c) => c.uid !== enteredBy).map((c) => (
          <Pressable
            key={c.uid}
            style={[styles.chip, workerUid === c.uid && styles.chipOn]}
            onPress={() => setWorkerUid(c.uid)}
          >
            <Text style={[styles.chipText, workerUid === c.uid && styles.chipTextOn]}>{c.name}</Text>
          </Pressable>
        ))}
        {crew.length <= 1 && <Text style={styles.addHint}>No other crew on this site.</Text>}
      </View>

      <Text style={styles.addLabel}>Quick shift</Text>
      <View style={styles.chipRow}>
        {QUICK_SHIFTS.map((q) => {
          const on = start === q.start && end === q.end && breakMin === q.breakMin;
          return (
            <Pressable
              key={q.label}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => { setStart(q.start); setEnd(q.end); setBreakMin(q.breakMin); }}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{q.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.timeRow}>
        <View style={{ flex: 1.4 }}>
          <Text style={styles.addLabel}>Date</Text>
          <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.addLabel}>Start</Text>
          <TextInput style={styles.input} value={start} onChangeText={setStart} placeholder="08:00" placeholderTextColor={colors.textTertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.addLabel}>End</Text>
          <TextInput style={styles.input} value={end} onChangeText={setEnd} placeholder="16:30" placeholderTextColor={colors.textTertiary} />
        </View>
      </View>

      <Text style={styles.addLabel}>Break (unpaid)</Text>
      <View style={styles.chipRow}>
        {BREAK_OPTIONS.map((b) => (
          <Pressable key={b} style={[styles.chip, breakMin === b && styles.chipOn]} onPress={() => setBreakMin(b)}>
            <Text style={[styles.chipText, breakMin === b && styles.chipTextOn]}>{b === 0 ? 'None' : `${b} min`}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.addLabel}>Notes (optional)</Text>
      <TextInput
        style={styles.input} value={notes} onChangeText={setNotes}
        placeholder="e.g. forgot phone, worked the Miller garage" placeholderTextColor={colors.textTertiary}
      />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total (paid)</Text>
        <Text style={styles.totalValue}>{total !== null ? `${total.toFixed(1)}h` : '—'}</Text>
      </View>

      <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={save}>
        {busy
          ? <ActivityIndicator color={colors.textInverse} />
          : <Text style={styles.saveBtnText}>Enter shift — goes to approval</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.card,
  },
  cardFlagged: { borderColor: colors.warning },
  name: { fontWeight: typography.weights.semibold, color: colors.text },
  sub: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 1 },
  hours: { fontWeight: typography.weights.bold, color: colors.text, fontSize: typography.sizes.md },
  approveBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
  },

  addToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primarySoft, borderRadius: radii.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  addToggleText: { color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },
  addCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.card,
  },
  addLabel: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
    color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  addHint: { fontSize: typography.sizes.xs, color: colors.textTertiary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },
  timeRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.background,
  },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderColor: colors.border,
  },
  totalLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.semibold },
  totalValue: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  saveBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
