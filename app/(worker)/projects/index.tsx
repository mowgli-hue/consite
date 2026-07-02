import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../../src/lib/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { colors, spacing, radii, typography, shadows } from '../../../src/theme';
import type { Project } from '../../../src/types';

export default function ProjectsList() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'projects'),
        where('memberUids', 'array-contains', user.uid),
        where('active', '==', true)
      );
      const snap = await getDocs(q);
      setProjects(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) })));
    } catch (err) {
      console.warn('Projects load failed', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Projects</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="briefcase" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptySub}>Ask your admin to add you to a project.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/projects/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.address}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.textTertiary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  cardSub: { marginTop: 2, fontSize: typography.sizes.sm, color: colors.textSecondary },
  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
