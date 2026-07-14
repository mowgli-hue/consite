/**
 * Admin dashboard — the office home screen.
 *
 * Top: live stats (on site now, unread alerts, active projects).
 * Sections: Today (inbox, hours), Manage (users, projects, compliance),
 * Coming soon (dimmed placeholders).
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import ProjectPortfolio from '../../src/components/ProjectPortfolio';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Module = { id: string; label: string; icon: any; subtitle: string; route?: string };

const TODAY_MODULES: Module[] = [
  { id: 'search', label: 'Search', icon: 'search', subtitle: 'Ask your project anything', route: '/(admin)/search' },
  { id: 'inbox', label: 'Inbox', icon: 'bell', subtitle: 'Site alerts & reports', route: '/(admin)/inbox' },
  { id: 'timeline', label: 'Site Timeline', icon: 'image', subtitle: 'Live work updates & photos', route: '/(admin)/timeline' },
  { id: 'money', label: 'Money', icon: 'dollar-sign', subtitle: 'Invoice queue & milestones', route: '/(admin)/money' },
  { id: 'reports', label: 'Hours & Reports', icon: 'bar-chart-2', subtitle: 'Attendance & payroll CSV', route: '/(admin)/reports' },
];

const MANAGE_MODULES: Module[] = [
  { id: 'crew', label: 'Crew Board', icon: 'columns', subtitle: 'Who’s on which site', route: '/(admin)/crew' },
  { id: 'users', label: 'Users', icon: 'users', subtitle: 'Workers & accounts', route: '/(admin)/users' },
  { id: 'clients', label: 'Clients', icon: 'phone', subtitle: 'CRM & comm records', route: '/(admin)/clients' },
  { id: 'projects', label: 'Projects', icon: 'briefcase', subtitle: 'Sites & geofences', route: '/(admin)/projects' },
  { id: 'library', label: 'Forms & Documents', icon: 'folder', subtitle: 'Company forms & safety docs', route: '/(admin)/library' },
  { id: 'safety', label: 'Safety Center', icon: 'shield', subtitle: 'FLHA rates & deficiencies', route: '/(admin)/safety' },
  { id: 'compliance', label: 'Compliance', icon: 'award', subtitle: 'Cert expiries', route: '/(admin)/compliance' },
];

const SOON_MODULES: Module[] = [
  { id: 'forms', label: 'Form Builder', icon: 'clipboard', subtitle: 'Coming soon' },
];

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [unread, setUnread] = useState(0);
  const [onSiteNow, setOnSiteNow] = useState<number | null>(null);
  const [activeProjects, setActiveProjects] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioKey, setPortfolioKey] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(q, (snap) => setUnread(snap.size), () => setUnread(0));
    return unsub;
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const projSnap = await getDocs(query(collection(db, 'projects'), where('active', '==', true)));
      setActiveProjects(projSnap.size);
      let open = 0;
      await Promise.all(projSnap.docs.map(async (p) => {
        const att = await getDocs(query(
          collection(db, 'projects', p.id, 'attendance'),
          where('clockOutAt', '==', null),
        ));
        open += att.size;
      }));
      setOnSiteNow(open);
    } catch {
      setOnSiteNow(null);
      setActiveProjects(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function onRefresh() {
    setRefreshing(true);
    setPortfolioKey((k) => k + 1);
    await loadStats();
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
            <Text style={styles.greeting}>Office Dashboard</Text>
            <Text style={styles.name}>{user?.displayName ?? 'Admin'}</Text>
          </View>
          <Pressable hitSlop={8} onPress={signOut}>
            <Feather name="log-out" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Pressable style={styles.stat} onPress={() => router.push('/(admin)/reports' as any)}>
            <Text style={styles.statNumber}>{onSiteNow ?? '–'}</Text>
            <Text style={styles.statLabel}>On site now</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={() => router.push('/(admin)/inbox' as any)}>
            <Text style={[styles.statNumber, unread > 0 && { color: colors.danger }]}>{unread}</Text>
            <Text style={styles.statLabel}>Unread alerts</Text>
          </Pressable>
          <Pressable style={styles.stat} onPress={() => router.push('/(admin)/projects' as any)}>
            <Text style={styles.statNumber}>{activeProjects ?? '–'}</Text>
            <Text style={styles.statLabel}>Active sites</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Jobs at a glance</Text>
        <ProjectPortfolio reloadKey={portfolioKey} />

        <Section title="Today" modules={TODAY_MODULES} unread={unread} />
        <Section title="Manage" modules={MANAGE_MODULES} unread={unread} />
        <Section title="Coming soon" modules={SOON_MODULES} unread={unread} dim />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, modules, unread, dim }: { title: string; modules: Module[]; unread: number; dim?: boolean }) {
  return (
    <>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.grid}>
        {modules.map((m) => (
          <Pressable
            key={m.id}
            style={({ pressed }) => [styles.card, dim && styles.cardDim, pressed && m.route && { opacity: 0.7 }]}
            onPress={() => m.route && router.push(m.route as any)}
            disabled={!m.route}
          >
            <View style={styles.iconWrap}>
              <Feather name={m.icon as any} size={22} color={dim ? colors.textTertiary : colors.primary} />
              {m.id === 'inbox' && unread > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.cardLabel, dim && { color: colors.textTertiary }]}>{m.label}</Text>
            <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  greeting: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  name: {
    color: colors.text,
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    marginTop: 2,
  },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  statNumber: { fontSize: 28, fontWeight: typography.weights.bold, color: colors.text },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    // 2-up on phones, 3–5 columns full-width on desktop.
    flexBasis: '48%',
    minWidth: 200,
    maxWidth: 340,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardDim: { opacity: 0.6 },
  iconWrap: {
    width: 40, height: 40, borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badge: {
    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18,
    borderRadius: 9, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: colors.textInverse, fontSize: 10, fontWeight: typography.weights.bold },
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
