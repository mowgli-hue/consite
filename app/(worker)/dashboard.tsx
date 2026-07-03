/**
 * Worker dashboard.
 *
 * Renders dashboard modules from Firestore (/dashboards/worker/modules).
 * Admin can add/remove/reorder without a deploy.
 *
 * Falls back to a hardcoded default set if the collection is empty (first run).
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { DashboardModule } from '../../src/types';

const DEFAULT_MODULES: DashboardModule[] = [
  { id: 'clock', label: 'Clock In / Out', icon: 'clock', route: '/clock', order: 1, visible: true, requiredPermissions: [], subtitle: 'GPS-verified' },
  { id: 'forms', label: 'FLHA Forms', icon: 'shield', route: '/forms/flha-daily-v1?projectId=sample-project-1', order: 2, visible: true, requiredPermissions: [], subtitle: 'AI auto-filled' },
  { id: 'deficiency', label: 'Report Issue', icon: 'image', route: '/deficiency?projectId=sample-project-1', order: 3, visible: true, requiredPermissions: [], subtitle: 'Photo + voice' },
  { id: 'receipt', label: 'Scan Receipt', icon: 'file-text', route: '/receipt?projectId=sample-project-1', order: 4, visible: true, requiredPermissions: [], subtitle: 'To job cost' },
  { id: 'daily-log', label: 'Daily Log', icon: 'clipboard', route: '/daily-log?projectId=sample-project-1', order: 5, visible: true, requiredPermissions: [], subtitle: 'AI-written' },
  { id: 'punch-list', label: 'Punch List', icon: 'bar-chart', route: '/punch-list?projectId=sample-project-1', order: 6, visible: true, requiredPermissions: [], subtitle: 'Open issues' },
  { id: 'certs', label: 'My Tickets', icon: 'shield', route: '/certifications', order: 7, visible: true, requiredPermissions: [], subtitle: 'WHMIS, fall arrest' },
  { id: 'projects', label: 'Projects', icon: 'briefcase', route: '/projects', order: 8, visible: true, requiredPermissions: [] },
];

export default function WorkerDashboard() {
  const { user, signOut } = useAuth();
  const [modules, setModules] = useState<DashboardModule[]>(DEFAULT_MODULES);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      const q = query(collection(db, 'dashboards/worker/modules'), orderBy('order'));
      const snap = await getDocs(q);

      // Merge strategy: start with defaults, let Firestore override matching IDs.
      // New local features stay visible; admin can still hide via `visible: false`.
      const byId = new Map<string, DashboardModule>();
      for (const m of DEFAULT_MODULES) byId.set(m.id, m);
      for (const d of snap.docs) {
        const fb = { id: d.id, ...(d.data() as Omit<DashboardModule, 'id'>) };
        byId.set(d.id, fb);
      }
      const merged = Array.from(byId.values())
        .filter((m) => m.visible)
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setModules(merged);
    } catch (err) {
      console.warn('Dashboard load failed, using defaults', err);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.name}>{user?.displayName ?? 'Worker'}</Text>
          </View>
          <Pressable hitSlop={8} onPress={signOut}>
            <Feather name="log-out" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {modules.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(m.route as any)}
            >
              <View style={[styles.iconWrap, { backgroundColor: m.color ?? colors.primarySoft }]}>
                <Feather name={iconFor(m.icon)} size={22} color={m.color ? '#fff' : colors.primary} />
              </View>
              <Text style={styles.cardLabel}>{m.label}</Text>
              {m.subtitle && <Text style={styles.cardSubtitle}>{m.subtitle}</Text>}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function iconFor(icon: DashboardModule['icon']): keyof typeof Feather.glyphMap {
  // 1:1 mapping for clarity; future icons just need a switch case.
  const map: Record<DashboardModule['icon'], keyof typeof Feather.glyphMap> = {
    briefcase: 'briefcase',
    clipboard: 'clipboard',
    image: 'image',
    'file-text': 'file-text',
    calendar: 'calendar',
    clock: 'clock',
    users: 'users',
    shield: 'shield',
    bell: 'bell',
    'bar-chart': 'bar-chart-2',
    settings: 'settings',
  };
  return map[icon];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  greeting: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  name: {
    color: colors.text,
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardPressed: { opacity: 0.7 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
  },
});
