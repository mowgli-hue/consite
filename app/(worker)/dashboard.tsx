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
import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { flush, onQueueChange } from '../../src/lib/offlineQueue';
import { DailyBriefing } from '../../src/components/DailyBriefing';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { DashboardModule } from '../../src/types';

const DEFAULT_MODULES: DashboardModule[] = [
  { id: 'clock', label: 'Clock In / Out', icon: 'clock', route: '/clock', order: 1, visible: true, requiredPermissions: [], subtitle: 'GPS-verified' },
  { id: 'forms', label: 'FLHA Forms', icon: 'shield', route: '/forms/flha-daily-v1?projectId=sample-project-1', order: 2, visible: true, requiredPermissions: [], subtitle: 'AI auto-filled' },
  { id: 'scan', label: 'AI Scan', icon: 'image', route: '/scan', order: 1, visible: true, requiredPermissions: [], subtitle: 'Point, shoot, filed' },
  { id: 'work-log', label: 'Work Update', icon: 'image', route: '/work-log?projectId=sample-project-1', order: 2, visible: true, requiredPermissions: [], subtitle: 'Photo + voice → done' },
  { id: 'tasks', label: 'My Tasks', icon: 'clipboard', route: '/tasks', order: 2, visible: true, requiredPermissions: [], subtitle: 'Pinned work for you' },
  { id: 'drawings', label: 'Site Drawings', icon: 'file-text', route: '/drawings?projectId=sample-project-1', order: 6, visible: true, requiredPermissions: [], subtitle: 'Plans & pin-tasks' },
  { id: 'crew', label: 'Crew Hours', icon: 'users', route: '/crew', order: 3, visible: true, requiredPermissions: [], subtitle: 'Approve crew shifts' },
  { id: 'deficiency', label: 'Report Issue', icon: 'image', route: '/deficiency?projectId=sample-project-1', order: 3, visible: true, requiredPermissions: [], subtitle: 'Photo + voice' },
  { id: 'receipt', label: 'Scan Receipt', icon: 'file-text', route: '/receipt?projectId=sample-project-1', order: 4, visible: true, requiredPermissions: [], subtitle: 'To job cost' },
  { id: 'daily-log', label: 'Daily Log', icon: 'clipboard', route: '/daily-log?projectId=sample-project-1', order: 5, visible: true, requiredPermissions: [], subtitle: 'AI-written' },
  { id: 'forms-browser', label: 'Forms', icon: 'clipboard', route: '/forms', order: 5, visible: true, requiredPermissions: [], subtitle: 'QC, environmental & more' },
  { id: 'punch-list', label: 'Punch List', icon: 'bar-chart', route: '/punch-list?projectId=sample-project-1', order: 6, visible: true, requiredPermissions: [], subtitle: 'Open issues' },
  { id: 'certs', label: 'My Tickets', icon: 'shield', route: '/certifications', order: 7, visible: true, requiredPermissions: [], subtitle: 'WHMIS, fall arrest' },
  { id: 'projects', label: 'Projects', icon: 'briefcase', route: '/projects', order: 8, visible: true, requiredPermissions: [] },
  { id: 'profile', label: 'My Profile', icon: 'user', route: '/profile', order: 9, visible: true, requiredPermissions: [], subtitle: 'WCB, tickets & safety docs' },
];

type WorkerNotice = { id: string; title: string; body?: string };

export default function WorkerDashboard() {
  const { user, signOut } = useAuth();
  const [modules, setModules] = useState<DashboardModule[]>(DEFAULT_MODULES);
  const [refreshing, setRefreshing] = useState(false);
  const [notices, setNotices] = useState<WorkerNotice[]>([]);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    flush().catch(() => {}); // sync anything captured offline as soon as we're home
    return onQueueChange(setPendingSync);
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false),
      limit(3),
    );
    return onSnapshot(
      q,
      (snap) => setNotices(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      () => setNotices([]),
    );
  }, [user]);

  async function dismissNotice(id: string) {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid, 'notifications', id), { read: true });
  }

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

        {pendingSync > 0 && (
          <Pressable style={styles.syncBanner} onPress={() => flush().catch(() => {})}>
            <Feather name="upload-cloud" size={16} color={colors.warning} />
            <Text style={styles.syncText}>
              {pendingSync} update{pendingSync === 1 ? '' : 's'} saved offline — tap to sync now
            </Text>
          </Pressable>
        )}

        <DailyBriefing />

        {notices.map((n) => (
          <View key={n.id} style={styles.notice}>
            <Feather name="bell" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>{n.title}</Text>
              {!!n.body && <Text style={styles.noticeBody}>{n.body}</Text>}
            </View>
            <Pressable hitSlop={8} onPress={() => dismissNotice(n.id)}>
              <Feather name="x" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        ))}

        <View style={styles.grid}>
          {modules.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                // Routes were seeded against the sample project — point them
                // at the worker's real first assignment instead.
                const pid = user?.projectIds?.[0];
                const route = pid ? m.route.replace('sample-project-1', pid) : m.route;
                router.push(route as any);
              }}
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
    user: 'user',
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
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeTitle: { color: colors.text, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },
  noticeBody: { color: colors.textSecondary, fontSize: typography.sizes.xs, marginTop: 1 },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.warningSoft, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.warning,
    padding: spacing.md, marginBottom: spacing.md,
  },
  syncText: { color: colors.text, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, flex: 1 },
  card: {
    // 2-up on phones, flows to 3–5 columns on desktop widths.
    flexBasis: '48%',
    flexGrow: 1,
    maxWidth: 280,
    minWidth: 150,
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
