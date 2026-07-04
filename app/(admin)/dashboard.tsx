/**
 * Admin dashboard — entry point for admin features.
 *
 * v0.1 lists the admin modules. v0.3 each becomes a real screen.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

const ADMIN_MODULES: Array<{ id: string; label: string; icon: any; subtitle: string; route?: string }> = [
  { id: 'inbox', label: 'Inbox', icon: 'bell', subtitle: 'Site alerts & reports', route: '/(admin)/inbox' },
  { id: 'users', label: 'Users', icon: 'users', subtitle: 'Add workers & supervisors', route: '/(admin)/users' },
  { id: 'projects', label: 'Projects', icon: 'briefcase', subtitle: 'Create & manage sites', route: '/(admin)/projects' },
  { id: 'reports', label: 'Hours & Reports', icon: 'bar-chart-2', subtitle: 'Attendance & payroll CSV', route: '/(admin)/reports' },
  { id: 'compliance', label: 'Compliance', icon: 'shield', subtitle: 'Cert expiries', route: '/(admin)/compliance' },
  { id: 'forms', label: 'Form Builder', icon: 'clipboard', subtitle: 'Design FLHA & inspections' },
  { id: 'templates', label: 'Templates', icon: 'file-text', subtitle: 'Safety docs & policies' },
];

export default function AdminDashboard() {
  const { user, signOut } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(q, (snap) => setUnread(snap.size), () => setUnread(0));
    return unsub;
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Admin</Text>
            <Text style={styles.name}>{user?.displayName ?? 'Admin'}</Text>
          </View>
          <Pressable hitSlop={8} onPress={signOut}>
            <Feather name="log-out" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {ADMIN_MODULES.map((m) => (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
              onPress={() => m.route && router.push(m.route as any)}
            >
              <View style={styles.iconWrap}>
                <Feather name={m.icon as any} size={22} color={colors.primary} />
                {m.id === 'inbox' && unread > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardLabel}>{m.label}</Text>
              <Text style={styles.cardSubtitle}>{m.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.banner}>
          <Feather name="info" size={16} color={colors.textSecondary} />
          <Text style={styles.bannerText}>
            Admin features are scaffolded for v0.1. Full CRUD UIs land in v0.3.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
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
  banner: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
  },
  bannerText: { color: colors.textSecondary, flex: 1, fontSize: typography.sizes.sm },
});
