/**
 * Portfolio view — every project at a glance on the office dashboard.
 *
 * One card per active project: stage stepper, current-stage check counts,
 * THE single blocking item (first failing check + its instruction),
 * contract value, phase progress. Tap → full Lifecycle screen.
 *
 * All of it is computed from live data via computeStageChecks — the app
 * computes, people confirm.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  STAGES, STAGE_LABELS, computeStageChecks, stageIndex,
  type Phase, type StageCheck,
} from '../lib/lifecycle';
import type { Project } from '../types';
import { colors, spacing, radii, typography, shadows } from '../theme';

interface PortfolioItem {
  project: Project;
  phases: Phase[];
  checks: StageCheck[];
}

function formatValue(v?: number): string | null {
  if (typeof v !== 'number' || v <= 0) return null;
  return `$${v.toLocaleString('en-CA', { maximumFractionDigits: 0 })}`;
}

export default function ProjectPortfolio({ reloadKey }: { reloadKey?: number }) {
  const [items, setItems] = useState<PortfolioItem[] | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'projects'), where('active', '==', true)));
      const projects = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Project, 'id'>) }))
        .filter((p) => p.stage !== 'archived')
        .sort((a, b) => a.name.localeCompare(b.name));

      const loaded = await Promise.all(projects.map(async (project) => {
        let phases: Phase[] = [];
        try {
          const ph = await getDocs(query(collection(db, 'projects', project.id, 'phases'), orderBy('order')));
          phases = ph.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Phase, 'id'>) }));
        } catch { /* phases unreadable → checks still compute */ }
        let checks: StageCheck[] = [];
        try {
          checks = await computeStageChecks(project, phases);
        } catch { /* keep card with no checks rather than dropping the project */ }
        return { project, phases, checks };
      }));
      setItems(loaded);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load, reloadKey]);

  if (items === null) {
    return <Text style={styles.loading}>Checking every job…</Text>;
  }
  if (items.length === 0) return null;

  return (
    <View style={styles.grid}>
      {items.map((it) => <PortfolioCard key={it.project.id} item={it} />)}
    </View>
  );
}

function PortfolioCard({ item }: { item: PortfolioItem }) {
  const { project, phases, checks } = item;
  const idx = stageIndex(project.stage as any);
  const passed = checks.filter((c) => c.pass).length;
  const blocking = checks.find((c) => !c.pass);
  const value = formatValue(project.contractValue);
  const phasesDone = phases.filter((p) => p.status === 'done').length;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={() => router.push(`/project?id=${project.id}` as any)}
    >
      {/* Name + contract value */}
      <View style={styles.topRow}>
        <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
        {value && <Text style={styles.value}>{value}</Text>}
      </View>

      {/* Stage stepper mini-view */}
      <View style={styles.stepper}>
        {STAGES.map((s, i) => (
          <View
            key={s}
            style={[
              styles.step,
              i < idx && styles.stepDone,
              i === idx && styles.stepCurrent,
            ]}
          />
        ))}
      </View>
      <View style={styles.stageRow}>
        <Text style={styles.stageLabel}>{STAGE_LABELS[STAGES[idx]]}</Text>
        {checks.length > 0 && (
          <Text style={[styles.checkCount, blocking ? styles.checkCountBad : styles.checkCountGood]}>
            {passed}/{checks.length} ✓
          </Text>
        )}
      </View>

      {/* The single blocking item — or the green light */}
      {blocking ? (
        <View style={styles.blockRow}>
          <Feather name="x-circle" size={14} color={colors.danger} style={styles.blockIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.blockLabel} numberOfLines={1}>{blocking.label}</Text>
            <Text style={styles.blockInstruction} numberOfLines={2}>{blocking.instruction}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.blockRow}>
          <Feather name="check-circle" size={14} color={colors.success} style={styles.blockIcon} />
          <Text style={styles.readyText}>
            {idx >= STAGES.length - 1
              ? 'All checks clear — ready to archive'
              : `Ready to advance to ${STAGE_LABELS[STAGES[idx + 1]]}`}
          </Text>
        </View>
      )}

      {/* Phase progress */}
      {phases.length > 0 && (
        <View style={styles.phaseWrap}>
          <View style={styles.phaseTrack}>
            <View style={[styles.phaseFill, { width: `${Math.round((phasesDone / phases.length) * 100)}%` }]} />
          </View>
          <Text style={styles.phaseText}>{phasesDone}/{phases.length} phases</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    color: colors.textTertiary, fontSize: typography.sizes.sm,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    flexBasis: '48%', minWidth: 260, maxWidth: 420, flexGrow: 1,
    backgroundColor: colors.surface, borderRadius: radii.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    ...shadows.card,
  },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  name: {
    flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  value: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary },

  stepper: { flexDirection: 'row', gap: 4, marginTop: spacing.md },
  step: { flex: 1, height: 5, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt },
  stepDone: { backgroundColor: colors.success },
  stepCurrent: { backgroundColor: colors.primary },

  stageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  stageLabel: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  checkCount: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  checkCountGood: { color: colors.success },
  checkCountBad: { color: colors.danger },

  blockRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.md, gap: spacing.sm },
  blockIcon: { marginTop: 2 },
  blockLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.text },
  blockInstruction: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 1 },
  readyText: {
    flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium,
    color: colors.success,
  },

  phaseWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  phaseTrack: {
    flex: 1, height: 6, borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt, overflow: 'hidden',
  },
  phaseFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.primary },
  phaseText: { fontSize: typography.sizes.xs, color: colors.textSecondary },
});
