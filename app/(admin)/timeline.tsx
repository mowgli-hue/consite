/**
 * Admin → Site Timeline. The living project feed: work updates with photos,
 * grouped by day — the seed of the "digital twin" view from the v3 vision.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { notify, confirm, toast } from '../../src/lib/notify';
import { useAuth } from '../../src/contexts/AuthContext';
import { listAllProjects } from '../../src/lib/adminUsers';
import { Dropdown } from '../../src/components/Dropdown';
import { tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project } from '../../src/types';

type Entry = {
  id: string; summary: string; trade: string; location: string;
  quantities: string; flags: string; displayName: string;
  ms: number; photoUrl?: string;
  projectId: string; projectName: string;
};

export default function SiteTimeline() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('all');
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Filter the feed to one person — "what did Harjeet post on this job?"
  const [worker, setWorker] = useState<string>('all');
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  function removeEntry(e: Entry) {
    confirm('Delete this update?', `${e.displayName}: ${e.summary.slice(0, 80)}`, async () => {
      try {
        await deleteDoc(doc(db, 'projects', e.projectId, 'workLog', e.id));
        setEntries((list) => (list ?? []).filter((x) => x.id !== e.id));
        toast('Update deleted');
      } catch (err: any) { notify('Delete failed', err.message); }
    }, 'Delete');
  }

  useEffect(() => {
    (async () => {
      try {
        const p = await listAllProjects();
        setProjects(p);
      } catch (err: any) { notify('Could not load projects', err.message); }
    })();
  }, []);

  const load = useCallback(async () => {
    if (projects.length === 0) { setEntries([]); return; }
    setEntries(null);
    try {
      const targets = projectId === 'all' ? projects : projects.filter((p) => p.id === projectId);
      const per = await Promise.all(targets.map(async (p) => {
        try {
          const snap = await getDocs(query(
            collection(db, 'projects', p.id, 'workLog'),
            orderBy('createdAt', 'desc'),
            limit(projectId === 'all' ? 25 : 60),
          ));
          return await Promise.all(snap.docs.map(async (d): Promise<Entry> => {
            const a = d.data() as any;
            let photoUrl: string | undefined;
            if (a.photoPath) {
              try { photoUrl = await getDownloadURL(ref(storage, a.photoPath)); } catch { /* photo unavailable */ }
            }
            return {
              id: d.id,
              summary: a.summary ?? '',
              trade: a.trade ?? '',
              location: a.location ?? '',
              quantities: a.quantities ?? '',
              flags: a.flags ?? '',
              displayName: a.displayName ?? 'Worker',
              ms: tsToMs(a.createdAt) ?? 0,
              photoUrl,
              projectId: p.id, projectName: p.name,
            };
          }));
        } catch { return [] as Entry[]; /* one unreadable project must not blank the feed */ }
      }));
      setEntries(per.flat().sort((x, y) => y.ms - x.ms));
    } catch (err: any) {
      notify('Timeline failed', err.message);
      setEntries([]);
    }
  }, [projectId, projects]);

  useEffect(() => { load(); }, [load]);

  const workerNames = [...new Set((entries ?? []).map((e) => e.displayName))].sort();
  // If the chosen employee has nothing in this project, fall back to everyone.
  const workerOn = worker !== 'all' && workerNames.includes(worker) ? worker : 'all';
  const shown = (entries ?? []).filter((e) => workerOn === 'all' || e.displayName === workerOn);

  // Group by day
  const groups = new Map<string, Entry[]>();
  for (const e of shown) {
    const day = new Date(e.ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Site Timeline</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.pickers}>
          <Dropdown
            label="Project" icon="briefcase" value={projectId} onChange={setProjectId}
            options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <Dropdown
            label="Employee" icon="user" value={workerOn} onChange={setWorker}
            options={[{ value: 'all', label: 'All employees' }, ...workerNames.map((n) => ({
              value: n, label: n, hint: String((entries ?? []).filter((e) => e.displayName === n).length),
            }))]}
          />
        </View>
        {entries !== null && entries.length > 0 && (
          <Text style={styles.count}>{shown.length} update{shown.length === 1 ? '' : 's'}</Text>
        )}

        {entries === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="image" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No work updates yet</Text>
            <Text style={styles.emptySub}>Workers post photo + voice updates from the Work Update button — they land here in real time.</Text>
          </View>
        ) : (
          [...groups.entries()].map(([day, list]) => (
            <View key={day}>
              <Text style={styles.dayLabel}>{day}</Text>
              {list.map((e) => (
                <View key={e.id} style={[styles.card, !!e.flags && styles.cardFlagged]}>
                  {e.photoUrl && <Image source={{ uri: e.photoUrl }} style={styles.photo} resizeMode="cover" />}
                  <View style={styles.cardBody}>
                    <Text style={styles.summary}>{e.summary}</Text>
                    <Text style={styles.meta}>
                      {e.displayName}{projectId === 'all' ? ` · ${e.projectName}` : ''} · {e.trade}
                      {e.location && e.location !== 'unspecified' ? ` · ${e.location}` : ''}
                      {' · '}{new Date(e.ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {!!e.quantities && <Text style={styles.qty}>📦 {e.quantities}</Text>}
                    {!!e.flags && <Text style={styles.flags}>⚠ {e.flags}</Text>}
                    {isAdmin && (
                      <Pressable hitSlop={8} onPress={() => removeEntry(e)} style={{ alignSelf: 'flex-end', marginTop: spacing.xs }} accessibilityLabel="Delete update">
                        <Feather name="trash-2" size={16} color={colors.danger} />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 760, width: '100%', alignSelf: 'center' },

  pickers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  count: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  dayLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md, overflow: 'hidden', ...shadows.card,
  },
  cardFlagged: { borderColor: colors.warning },
  photo: { width: '100%', height: 200, backgroundColor: colors.border },
  cardBody: { padding: spacing.lg },
  summary: { color: colors.text, fontSize: typography.sizes.md, lineHeight: 21 },
  meta: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  qty: { color: colors.text, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  flags: { color: colors.warning, fontSize: typography.sizes.sm, marginTop: spacing.xs, fontWeight: typography.weights.semibold },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
