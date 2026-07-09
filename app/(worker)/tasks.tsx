/**
 * My Tasks — every pin assigned to me across my projects.
 * Tap → opens the drawing at that pin.
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
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type TaskRow = {
  id: string; planId: string; projectId: string; projectName: string;
  instruction: string; type: string; status: string; createdAt: number;
};

export default function MyTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const out: TaskRow[] = [];
      for (const pid of user.projectIds ?? []) {
        const projSnap = await getDoc(doc(db, 'projects', pid));
        const projectName = projSnap.data()?.name ?? pid;
        const plans = await getDocs(collection(db, 'projects', pid, 'plans'));
        for (const plan of plans.docs) {
          const pins = await getDocs(query(
            collection(db, 'projects', pid, 'plans', plan.id, 'pins'),
            where('assigneeUid', '==', user.uid),
          ));
          for (const p of pins.docs) {
            const a = p.data() as any;
            out.push({
              id: p.id, planId: plan.id, projectId: pid, projectName,
              instruction: a.instruction ?? '', type: a.type ?? 'task',
              status: a.status ?? 'open', createdAt: a.createdAt ?? 0,
            });
          }
        }
      }
      // Open first, then done, then accepted; newest first within groups
      const rank = (s: string) => (s === 'open' ? 0 : s === 'done' ? 1 : 2);
      out.sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt - a.createdAt);
      setTasks(out);
    } catch (err: any) {
      notify('Could not load tasks', err.message);
      setTasks([]);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openCount = (tasks ?? []).filter((t) => t.status === 'open').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Tasks{openCount > 0 ? ` (${openCount})` : ''}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {tasks === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : tasks.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="check-circle" size={32} color={colors.success} />
            <Text style={styles.emptyTitle}>Nothing assigned to you</Text>
            <Text style={styles.emptySub}>When the foreman pins work for you on a drawing, it shows up here.</Text>
          </View>
        ) : (
          tasks.map((t) => (
            <Pressable
              key={`${t.planId}-${t.id}`}
              style={[styles.card, t.status === 'open' && t.type === 'issue' && { borderColor: colors.danger }]}
              onPress={() => router.push(`/drawing?projectId=${t.projectId}&planId=${t.planId}` as any)}
            >
              <Feather
                name={t.status === 'accepted' ? 'check-circle' : t.type === 'issue' ? 'alert-triangle' : 'map-pin'}
                size={20}
                color={t.status === 'accepted' ? colors.success : t.status === 'done' ? colors.primary : t.type === 'issue' ? colors.danger : colors.warning}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.instruction} numberOfLines={2}>{t.instruction}</Text>
                <Text style={styles.sub}>
                  {t.projectName} · {t.status === 'open' ? 'TO DO' : t.status === 'done' ? 'awaiting approval' : 'accepted ✓'}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 640, width: '100%', alignSelf: 'center' },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.card,
  },
  instruction: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
