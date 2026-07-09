/**
 * Admin → Inbox. Live alerts feed: deficiencies, missed clock-outs,
 * system notices. Realtime via onSnapshot; unread badge feeds the
 * dashboard card.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch, where, getDocs,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { notify } from '../../src/lib/notify';
import { tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Notification = {
  id: string;
  type: 'deficiency' | 'missed-clockout' | 'system';
  title: string;
  body: string;
  urgent: boolean;
  read: boolean;
  projectId?: string;
  projectName?: string;
  createdAt?: unknown;
};

const ICONS: Record<Notification['type'], keyof typeof Feather.glyphMap> = {
  deficiency: 'alert-triangle',
  'missed-clockout': 'clock',
  system: 'info',
};

export default function AdminInbox() {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notification, 'id'>) }))),
      (err) => notify('Inbox failed to load', err.message),
    );
    return unsub;
  }, []);

  const visible = (items ?? []).filter((n) => (filter === 'unread' ? !n.read : true));
  const unreadCount = (items ?? []).filter((n) => !n.read).length;

  async function markRead(n: Notification) {
    if (!n.read) await updateDoc(doc(db, 'notifications', n.id), { read: true });
  }

  async function markAllRead() {
    const snap = await getDocs(query(collection(db, 'notifications'), where('read', '==', false), limit(400)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Inbox{unreadCount > 0 ? ` (${unreadCount})` : ''}</Text>
        <Pressable hitSlop={8} onPress={markAllRead} disabled={unreadCount === 0}>
          <Feather name="check-circle" size={20} color={unreadCount > 0 ? colors.primary : colors.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['unread', 'all'] as const).map((f) => (
          <Pressable key={f} style={[styles.tab, filter === f && styles.tabOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.tabText, filter === f && styles.tabTextOn]}>
              {f === 'unread' ? `Unread (${unreadCount})` : 'All'}
            </Text>
          </Pressable>
        ))}
      </View>

      {items === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {visible.length === 0 && (
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                {filter === 'unread' ? 'All caught up.' : 'No alerts yet — they appear here when workers report issues.'}
              </Text>
            </View>
          )}

          {visible.map((n) => {
            const ms = tsToMs(n.createdAt);
            return (
              <Pressable
                key={n.id}
                style={[styles.card, !n.read && styles.cardUnread, n.urgent && styles.cardUrgent]}
                onPress={() => markRead(n)}
              >
                <View style={[styles.iconWrap, n.urgent && { backgroundColor: colors.dangerSoft }]}>
                  <Feather name={ICONS[n.type] ?? 'bell'} size={18} color={n.urgent ? colors.danger : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, !n.read && { fontWeight: typography.weights.bold }]}>{n.title}</Text>
                  <Text style={styles.body}>{n.body}</Text>
                  {ms && (
                    <Text style={styles.time}>
                      {new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                {!n.read && <View style={styles.dot} />}
              </Pressable>
            );
          })}
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

  card: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.card,
  },
  cardUnread: { borderColor: colors.primary },
  cardUrgent: { borderColor: colors.danger, borderWidth: 1.5 },
  iconWrap: {
    width: 34, height: 34, borderRadius: radii.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  title: { color: colors.text, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  body: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 2 },
  time: { color: colors.textTertiary, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyText: { color: colors.textSecondary, textAlign: 'center' },
});
