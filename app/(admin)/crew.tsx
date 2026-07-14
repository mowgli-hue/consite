/**
 * Admin → Crew Board. Every worker × every active site in one grid.
 *
 * Tap a cell to assign / unassign (writes the same membership records as
 * the Users screen — rules and queries stay consistent). The board checks
 * itself live after every change:
 *   · per site: crew size, foreman present, first-aid coverage (valid
 *     OFA/first-aid cert on an assigned worker — same rule the lifecycle
 *     Crew stage enforces)
 *   · per worker: ⛑ marks certified first-aiders; amber flags workers
 *     split across multiple sites (conflict check)
 *   · THE BENCH — active workers assigned to no site.
 *
 * Admin assigns; managers see the whole board read-only.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { notify, confirm } from '../../src/lib/notify';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  listUsers, listAllProjects, assignToProject, removeFromProject,
} from '../../src/lib/adminUsers';
import type { User, Project } from '../../src/types';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

interface MemberInfo { role?: string }

interface BoardData {
  workers: User[];
  projects: Project[];
  /** projectId → uid → member info (role). */
  members: Record<string, Record<string, MemberInfo>>;
  /** uids holding a valid first-aid/OFA cert. */
  firstAiders: Set<string>;
}

function isFirstAidCert(data: Record<string, unknown>): boolean {
  const t = `${data.type ?? ''} ${data.displayName ?? ''}`.toLowerCase();
  const exp = data.expiresAt;
  const valid = typeof exp !== 'number' || exp > Date.now();
  return valid && (t.includes('first') || t.includes('ofa') || t.includes('aid'));
}

export default function CrewBoard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [data, setData] = useState<BoardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyCell, setBusyCell] = useState<string | null>(null); // `${uid}:${pid}`

  const load = useCallback(async () => {
    try {
      const [users, allProjects] = await Promise.all([listUsers(), listAllProjects()]);
      const workers = users.filter((u) => u.active && u.role === 'worker');
      const projects = allProjects.filter((p) => p.active && p.stage !== 'archived');

      const members: Record<string, Record<string, MemberInfo>> = {};
      await Promise.all(projects.map(async (p) => {
        members[p.id] = {};
        try {
          const snap = await getDocs(collection(db, 'projects', p.id, 'members'));
          snap.docs.forEach((d) => { members[p.id][d.id] = d.data() as MemberInfo; });
        } catch { /* unreadable → shows as empty column, board stays up */ }
      }));

      const firstAiders = new Set<string>();
      await Promise.all(workers.map(async (w) => {
        try {
          const certs = await getDocs(collection(db, 'users', w.uid, 'certifications'));
          if (certs.docs.some((c) => isFirstAidCert(c.data()))) firstAiders.add(w.uid);
        } catch { /* no cert access → treated as not certified */ }
      }));

      setData({ workers, projects, members, firstAiders });
    } catch (e) {
      setData({ workers: [], projects: [], members: {}, firstAiders: new Set() });
      notify('Crew Board failed to load', e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function toggle(w: User, p: Project) {
    if (!isAdmin || !data) return;
    const assigned = !!data.members[p.id]?.[w.uid];
    const cellKey = `${w.uid}:${p.id}`;
    const run = async (fn: () => Promise<void>) => {
      setBusyCell(cellKey);
      try { await fn(); await load(); }
      catch (e) { notify('Change failed', e instanceof Error ? e.message : String(e)); }
      finally { setBusyCell(null); }
    };

    if (!assigned) {
      run(() => assignToProject(w.uid, p.id, user?.uid ?? 'crew-board', w.displayName));
      return;
    }
    const role = data.members[p.id]?.[w.uid]?.role ?? 'worker';
    const isForeman = ['foreman', 'lead-foreman', 'supervisor'].includes(role);
    confirm(
      `Remove from ${p.name}?`,
      `${w.displayName}${isForeman ? ' is the FOREMAN on this site — removing them may block the Crew stage.' : ' comes off this crew.'}`,
      () => run(() => removeFromProject(w.uid, p.id)),
      'Remove',
    );
  }

  if (data === null) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header />
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { workers, projects, members, firstAiders } = data;
  const assignmentCount = (uid: string) =>
    projects.filter((p) => !!members[p.id]?.[uid]).length;
  const bench = workers.filter((w) => assignmentCount(w.uid) === 0);
  const siteFirstAid = (pid: string) =>
    Object.keys(members[pid] ?? {}).some((uid) => firstAiders.has(uid));
  const siteForeman = (pid: string) =>
    Object.values(members[pid] ?? {}).some((m) => ['foreman', 'lead-foreman', 'supervisor'].includes(m.role ?? ''));
  const sitesNoFirstAid = projects.filter((p) => Object.keys(members[p.id] ?? {}).length > 0 && !siteFirstAid(p.id));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Summary strip */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNumber}>{workers.length}</Text>
            <Text style={styles.statLabel}>Active workers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, bench.length > 0 && { color: colors.warning }]}>{bench.length}</Text>
            <Text style={styles.statLabel}>On the bench</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, sitesNoFirstAid.length > 0 && { color: colors.danger }]}>
              {sitesNoFirstAid.length}
            </Text>
            <Text style={styles.statLabel}>Sites w/o first aid</Text>
          </View>
        </View>

        {projects.length === 0 ? (
          <Text style={styles.emptyText}>No active projects.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Column headers: project + live site checks */}
              <View style={styles.row}>
                <View style={styles.workerCol} />
                {projects.map((p) => {
                  const crew = Object.keys(members[p.id] ?? {}).length;
                  const aid = siteFirstAid(p.id);
                  const foreman = siteForeman(p.id);
                  return (
                    <Pressable key={p.id} style={styles.projCol} onPress={() => router.push(`/project?id=${p.id}` as any)}>
                      <Text style={styles.projName} numberOfLines={2}>{p.name}</Text>
                      <Text style={styles.projCrew}>{crew} crew</Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.miniBadge, foreman ? styles.badgeOk : styles.badgeBad]}>
                          <Text style={[styles.miniBadgeText, foreman ? styles.badgeOkText : styles.badgeBadText]}>
                            {foreman ? 'Foreman ✓' : 'No foreman'}
                          </Text>
                        </View>
                        <View style={[styles.miniBadge, aid ? styles.badgeOk : styles.badgeBad]}>
                          <Text style={[styles.miniBadgeText, aid ? styles.badgeOkText : styles.badgeBadText]}>
                            {aid ? 'First aid ✓' : 'No first aid'}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Worker rows */}
              {workers.map((w) => {
                const count = assignmentCount(w.uid);
                return (
                  <View key={w.uid} style={styles.row}>
                    <View style={styles.workerCol}>
                      <Text style={styles.workerName} numberOfLines={1}>
                        {firstAiders.has(w.uid) ? '⛑ ' : ''}{w.displayName}
                      </Text>
                      {count > 1 && (
                        <Text style={styles.splitText}>split across {count} sites</Text>
                      )}
                      {count === 0 && <Text style={styles.benchText}>on the bench</Text>}
                    </View>
                    {projects.map((p) => {
                      const m = members[p.id]?.[w.uid];
                      const role = m?.role ?? '';
                      const isForeman = ['foreman', 'lead-foreman', 'supervisor'].includes(role);
                      const busy = busyCell === `${w.uid}:${p.id}`;
                      return (
                        <Pressable
                          key={p.id}
                          style={[
                            styles.cell,
                            m && styles.cellOn,
                            m && count > 1 && styles.cellSplit,
                            busy && { opacity: 0.4 },
                          ]}
                          disabled={!isAdmin || busy}
                          onPress={() => toggle(w, p)}
                        >
                          {m ? (
                            <Text style={[styles.cellText, isForeman && styles.cellForeman]}>
                              {isForeman ? 'F' : '✓'}
                            </Text>
                          ) : (
                            isAdmin && <Feather name="plus" size={14} color={colors.borderStrong} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Legend */}
        <Text style={styles.legend}>
          ✓ assigned · F foreman · ⛑ valid first-aid cert · amber cell = worker on multiple sites
          {isAdmin ? ' · tap a cell to assign / remove' : ' · read-only'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={8} onPress={() => router.back()}>
        <Feather name="arrow-left" size={22} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Crew Board</Text>
      <Pressable hitSlop={8} onPress={() => router.push('/users' as any)} style={styles.usersLink}>
        <Feather name="users" size={15} color={colors.primary} />
        <Text style={styles.usersLinkText}>Users</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  usersLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  usersLinkText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },

  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  statNumber: { fontSize: 24, fontWeight: typography.weights.bold, color: colors.text },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'stretch' },
  workerCol: {
    width: 170, justifyContent: 'center',
    paddingVertical: spacing.sm, paddingRight: spacing.sm,
  },
  workerName: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.text },
  splitText: { fontSize: typography.sizes.xs, color: colors.warning, marginTop: 1 },
  benchText: { fontSize: typography.sizes.xs, color: colors.textTertiary, marginTop: 1 },

  projCol: {
    width: 130, padding: spacing.sm, alignItems: 'center',
  },
  projName: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
    color: colors.text, textAlign: 'center',
  },
  projCrew: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  badgeRow: { gap: 3, marginTop: spacing.xs, alignItems: 'center' },
  miniBadge: { borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeOk: { backgroundColor: colors.successSoft },
  badgeBad: { backgroundColor: colors.dangerSoft },
  miniBadgeText: { fontSize: 10, fontWeight: typography.weights.semibold },
  badgeOkText: { color: colors.success },
  badgeBadText: { color: colors.danger },

  cell: {
    width: 130, minHeight: 44, margin: 1,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  cellOn: { backgroundColor: colors.successSoft, borderColor: colors.success },
  cellSplit: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  cellText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: colors.success },
  cellForeman: { color: colors.primary },

  emptyText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  legend: {
    marginTop: spacing.lg, fontSize: typography.sizes.xs,
    color: colors.textTertiary, lineHeight: 18,
  },
});
