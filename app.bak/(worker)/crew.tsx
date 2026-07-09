/**
 * Foreman → Crew Hours. Shows the crew's shifts on projects where I hold
 * the approve permission; pending shifts get one-tap approval.
 * Workers without foreman role see a friendly no-access state.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { approveShift, tsToMs } from '../../src/lib/attendance';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type PendingShift = {
  id: string; projectId: string; projectName: string;
  uid: string; name: string; inMs: number; outMs?: number; hours?: number;
  needsReview?: boolean; open: boolean;
};

export default function CrewHours() {
  const { user } = useAuth();
  const [foremanProjects, setForemanProjects] = useState<{ id: string; name: string }[] | null>(null);
  const [shifts, setShifts] = useState<PendingShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
            hours: outMs ? (outMs - inMs) / 3_600_000 : undefined,
            needsReview: a.needsReview, open: !outMs,
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

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
