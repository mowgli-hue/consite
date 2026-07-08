/**
 * Clock In / Out screen — the hero flow.
 *
 * Worker selects a project, taps Clock In, GPS is verified against the
 * project geofence, attendance record is written.
 *
 * For v0.1, the project list is whatever the user has in `user.projectIds`.
 * If empty, falls back to fetching projects where `memberUids` contains uid.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { notify, confirm } from '../../src/lib/notify';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { clockIn, clockOut, findOpenShift, tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project, AttendanceRecord } from '../../src/types';

export default function ClockScreen() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openShift, setOpenShift] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Load projects the user is assigned to
      let projectIds = user.projectIds ?? [];
      let list: Project[] = [];

      if (projectIds.length > 0) {
        const docs = await Promise.all(
          projectIds.map((id) => getDoc(doc(db, 'projects', id)))
        );
        list = docs
          .filter((d) => d.exists())
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }))
          .filter((p) => p.active);
      } else {
        // Fallback: scan for projects where this user is a member
        const q = query(
          collection(db, 'projects'),
          where('memberUids', 'array-contains', user.uid),
          where('active', '==', true)
        );
        const snap = await getDocs(q);
        list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }));
        projectIds = list.map((p) => p.id);
      }

      setProjects(list);
      if (list.length === 1) setSelectedId(list[0].id);

      // 2. Check for open shift across all assigned projects
      const open = await findOpenShift(user.uid, projectIds);
      setOpenShift(open);
      if (open) setSelectedId(open.projectId);
    } catch (err) {
      console.warn('Clock screen load failed', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClockIn() {
    if (!user || !selectedId) return;
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;

    setSubmitting(true);
    try {
      const result = await clockIn({ uid: user.uid, project });
      const distance = result.gps?.distanceFromProjectM;
      // The site paperwork moment: clocked in → do today's FLHA now.
      confirm(
        'Clocked in ✓',
        (distance != null ? `You're ${distance}m from site center. ` : '') +
          'Complete your FLHA for today?',
        () => router.push(`/forms/flha-daily-v1?projectId=${project.id}` as any),
        'Start FLHA',
      );
      await load();
    } catch (err: any) {
      notify('Cannot clock in', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClockOut() {
    if (!user || !openShift) return;
    setSubmitting(true);
    try {
      await clockOut({
        projectId: openShift.projectId,
        recordId: openShift.id,
        actorUid: user.uid,
        workerUid: openShift.uid,
      });
      notify('Clocked out', 'See you next shift.');
      await load();
    } catch (err: any) {
      notify('Clock-out failed', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Clock In / Out</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : openShift ? (
        <ActiveShift
          openShift={openShift}
          project={projects.find((p) => p.id === openShift.projectId)}
          onClockOut={handleClockOut}
          submitting={submitting}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {projects.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <Text style={styles.sectionLabel}>Select project</Text>
              {projects.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.projectRow, selectedId === p.id && styles.projectRowSelected]}
                  onPress={() => setSelectedId(p.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectName}>{p.name}</Text>
                    <Text style={styles.projectAddress}>{p.address}</Text>
                    {p.geofenceEnabled && (
                      <View style={styles.gpsBadge}>
                        <Feather name="map-pin" size={11} color={colors.primary} />
                        <Text style={styles.gpsBadgeText}>GPS verified · {p.geofence.radiusM}m radius</Text>
                      </View>
                    )}
                  </View>
                  {selectedId === p.id && (
                    <Feather name="check-circle" size={20} color={colors.primary} />
                  )}
                </Pressable>
              ))}

              <Pressable
                style={[
                  styles.bigButton,
                  (!selectedId || submitting) && styles.bigButtonDisabled,
                ]}
                disabled={!selectedId || submitting}
                onPress={handleClockIn}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <>
                    <Feather name="log-in" size={20} color={colors.textInverse} />
                    <Text style={styles.bigButtonText}>Clock In</Text>
                  </>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ActiveShift({
  openShift,
  project,
  onClockOut,
  submitting,
}: {
  openShift: AttendanceRecord;
  project?: Project;
  onClockOut: () => void;
  submitting: boolean;
}) {
  const clockInMs = tsToMs(openShift.clockInAt) ?? Date.now();
  const elapsed = Date.now() - clockInMs;
  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);

  return (
    <View style={styles.activeShift}>
      <View style={styles.statusDot} />
      <Text style={styles.activeLabel}>On the clock</Text>
      <Text style={styles.activeProject}>{project?.name ?? 'Project'}</Text>
      <Text style={styles.activeTime}>
        {hours}h {minutes}m
      </Text>
      <Text style={styles.activeSince}>since {new Date(clockInMs).toLocaleTimeString()}</Text>

      <Pressable
        style={[styles.bigButton, styles.dangerButton, submitting && styles.bigButtonDisabled]}
        onPress={onClockOut}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <>
            <Feather name="log-out" size={20} color={colors.textInverse} />
            <Text style={styles.bigButtonText}>Clock Out</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Feather name="briefcase" size={32} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>No projects assigned</Text>
      <Text style={styles.emptySub}>Ask your admin to add you to a project.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  sectionLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },

  projectRow: {
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
  projectRowSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  projectName: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  projectAddress: { marginTop: 2, fontSize: typography.sizes.sm, color: colors.textSecondary },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  gpsBadgeText: { fontSize: typography.sizes.xs, color: colors.primary, fontWeight: typography.weights.medium },

  bigButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bigButtonDisabled: { opacity: 0.5 },
  bigButtonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
  },
  dangerButton: { backgroundColor: colors.danger },

  activeShift: {
    margin: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginBottom: spacing.sm,
  },
  activeLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.success,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  activeProject: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  activeTime: {
    marginTop: spacing.lg,
    fontSize: 44,
    fontWeight: typography.weights.bold,
    color: colors.text,
  },
  activeSince: { marginTop: spacing.xs, color: colors.textSecondary },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
