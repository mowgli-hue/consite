/**
 * Worker → My Hours. This week's shifts per project, running totals.
 * Queries by uid only (auto-indexed) and filters the date client-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { tsToMs } from '../../src/lib/attendance';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Shift = { id: string; projectName: string; inMs: number; outMs?: number; hours?: number };

function weekStartMs(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  return d.getTime() - day * 86_400_000;
}

export default function Timesheet() {
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastWeek, setLastWeek] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const start = lastWeek ? weekStartMs() - 7 * 86_400_000 : weekStartMs();
      const end = lastWeek ? weekStartMs() : Date.now() + 86_400_000;
      const out: Shift[] = [];
      for (const pid of user.projectIds ?? []) {
        const snap = await getDocs(query(
          collection(db, 'projects', pid, 'attendance'),
          where('uid', '==', user.uid),
        ));
        for (const d of snap.docs) {
          const a = d.data() as any;
          const inMs = tsToMs(a.clockInAt) ?? 0;
          if (inMs < start || inMs >= end) continue;
          const outMs = tsToMs(a.clockOutAt);
          out.push({
            id: d.id,
            projectName: pid,
            inMs, outMs,
            hours: outMs ? (outMs - inMs) / 3_600_000 : undefined,
          });
        }
      }
      out.sort((a, b) => b.inMs - a.inMs);
      setShifts(out);
    } catch (err: any) {
      notify('Could not load hours', err.message);
    } finally {
      setLoading(false);
    }
  }, [user, lastWeek]);

  useEffect(() => { load(); }, [load]);

  const total = shifts.reduce((s, x) => s + (x.hours ?? 0), 0);
  const open = shifts.filter((s) => !s.outMs).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Hours</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, !lastWeek && styles.tabOn]} onPress={() => setLastWeek(false)}>
          <Text style={[styles.tabText, !lastWeek && styles.tabTextOn]}>This week</Text>
        </Pressable>
        <Pressable style={[styles.tab, lastWeek && styles.tabOn]} onPress={() => setLastWeek(true)}>
          <Text style={[styles.tabText, lastWeek && styles.tabTextOn]}>Last week</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.totalCard}>
            <Text style={styles.totalHours}>{total.toFixed(1)}h</Text>
            <Text style={styles.totalSub}>
              {shifts.length} shift{shifts.length === 1 ? '' : 's'}
              {open > 0 ? ` · ${open} still open` : ''}
            </Text>
          </View>

          {shifts.map((s) => (
            <View key={s.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowDate}>
                  {new Date(s.inMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
                <Text style={styles.rowSub}>
                  {new Date(s.inMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {s.outMs ? ` – ${new Date(s.outMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' – on the clock'}
                </Text>
              </View>
              <Text style={[styles.rowHours, !s.outMs && { color: colors.success }]}>
                {s.hours ? `${s.hours.toFixed(1)}h` : '● LIVE'}
              </Text>
            </View>
          ))}

          {shifts.length === 0 && (
            <View style={styles.empty}>
              <Feather name="clock" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No shifts {lastWeek ? 'last week' : 'yet this week'}.</Text>
            </View>
          )}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  tab: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radii.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  tabOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tabText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  tabTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  totalCard: {
    alignItems: 'center', padding: spacing.xl, backgroundColor: colors.surface,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg, ...shadows.card,
  },
  totalHours: { fontSize: 40, fontWeight: typography.weights.bold, color: colors.text },
  totalSub: { color: colors.textSecondary, marginTop: spacing.xs },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs,
  },
  rowDate: { fontWeight: typography.weights.semibold, color: colors.text },
  rowSub: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 1 },
  rowHours: { fontWeight: typography.weights.bold, color: colors.text },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyText: { color: colors.textSecondary },
});
