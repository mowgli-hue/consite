/**
 * Punch list — list of deficiencies on a project.
 *
 * v0.2: read-only list with filter by status. Workers see their own;
 * supervisors and admins see all. v0.3 adds resolution workflow,
 * plan markup, and trade assignment.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

interface DeficiencyRecord {
  id: string;
  title: string;
  description: string;
  trade: string;
  severity: 'minor' | 'major' | 'safety-critical';
  recommendedAction: string;
  status: 'open' | 'in-progress' | 'resolved';
  photoUri?: string;
  reportedBy: string;
  reportedAt: any;
}

type Filter = 'all' | 'open' | 'safety';

export default function PunchListScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  const [deficiencies, setDeficiencies] = useState<DeficiencyRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('open');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'projects', projectId, 'deficiencies'),
        orderBy('reportedAt', 'desc')
      );
      const snap = await getDocs(q);
      setDeficiencies(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeficiencyRecord, 'id'>) }))
      );
    } catch (err) {
      console.warn('Punch list load failed', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = deficiencies.filter((d) => {
    if (filter === 'open') return d.status !== 'resolved';
    if (filter === 'safety') return d.severity === 'safety-critical';
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Punch list</Text>
        <Pressable
          onPress={() => router.push(`/(worker)/deficiency?projectId=${projectId}`)}
          hitSlop={8}
          style={styles.addButton}
        >
          <Feather name="plus" size={20} color={colors.textInverse} />
        </Pressable>
      </View>

      <View style={styles.filterBar}>
        {(['open', 'safety', 'all'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.filterPill, filter === f && styles.filterPillActive]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[styles.filterText, filter === f && styles.filterTextActive]}
            >
              {filterLabel(f)}
              {f === 'safety' && deficiencies.some((d) => d.severity === 'safety-critical' && d.status !== 'resolved') && (
                <Text style={styles.alertDot}> •</Text>
              )}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="check-circle" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                {filter === 'open' ? 'No open deficiencies' : 'Nothing here'}
              </Text>
              <Text style={styles.emptySub}>
                Tap + to report one.
              </Text>
            </View>
          }
          renderItem={({ item }) => <DefCard d={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function DefCard({ d }: { d: DeficiencyRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.sevBadge, severityBadgeStyle(d.severity)]}>
          <Text style={styles.sevBadgeText}>{d.severity}</Text>
        </View>
        <View style={styles.tradeBadge}>
          <Text style={styles.tradeBadgeText}>{d.trade}</Text>
        </View>
        {d.status !== 'open' && (
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: d.status === 'resolved' ? colors.successSoft : colors.warningSoft },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: d.status === 'resolved' ? colors.success : colors.warning },
              ]}
            >
              {d.status}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle}>{d.title}</Text>
      <Text style={styles.cardDescription} numberOfLines={2}>
        {d.description}
      </Text>
      {d.photoUri && (
        <Image source={{ uri: d.photoUri }} style={styles.cardPhoto} />
      )}
      <View style={styles.cardFooter}>
        <Feather name="tool" size={12} color={colors.textTertiary} />
        <Text style={styles.cardFooterText}>{d.recommendedAction}</Text>
      </View>
    </View>
  );
}

function filterLabel(f: Filter): string {
  if (f === 'open') return 'Open';
  if (f === 'safety') return 'Safety';
  return 'All';
}

function severityBadgeStyle(s: 'minor' | 'major' | 'safety-critical') {
  if (s === 'safety-critical') return { backgroundColor: colors.dangerSoft };
  if (s === 'major') return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.primarySoft };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBar: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  filterTextActive: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  alertDot: { color: colors.danger },

  list: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap' },
  sevBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sevBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tradeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  tradeBadgeText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'capitalize',
  },
  cardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  cardDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  cardPhoto: {
    marginTop: spacing.md,
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cardFooterText: { fontSize: typography.sizes.xs, color: colors.textTertiary, flex: 1 },
});
