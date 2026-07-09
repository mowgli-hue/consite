/**
 * AIFilledBanner.
 *
 * Shown at the top of any form the AI has pre-filled. Subtle teal accent,
 * explains what was filled, lets the worker accept-all or clear-all.
 *
 * The visual cue is important — workers should know which fields are AI
 * guesses vs their own input. Trust calibration matters.
 */

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  onAccept?: () => void;
  onClear?: () => void;
  filledCount?: number;
  totalCount?: number;
}

export function AIFilledBanner({ confidence, notes, onAccept, onClear, filledCount, totalCount }: Props) {
  const pct =
    filledCount != null && totalCount != null && totalCount > 0
      ? Math.round((filledCount / totalCount) * 100)
      : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Feather name="zap" size={16} color={colors.textInverse} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            AI auto-filled
            {pct != null ? ` · ${pct}%` : ''}
          </Text>
          <Text style={styles.notes}>{notes}</Text>
        </View>
        <View style={[styles.confidence, confidenceStyle(confidence)]}>
          <Text style={[styles.confidenceText, confidenceTextStyle(confidence)]}>
            {confidence}
          </Text>
        </View>
      </View>

      {(onAccept || onClear) && (
        <View style={styles.actions}>
          {onAccept && (
            <Pressable onPress={onAccept} hitSlop={6} style={styles.btnGhost}>
              <Feather name="check" size={14} color={colors.success} />
              <Text style={[styles.btnText, { color: colors.success }]}>Accept all</Text>
            </Pressable>
          )}
          {onClear && (
            <Pressable onPress={onClear} hitSlop={6} style={styles.btnGhost}>
              <Feather name="x" size={14} color={colors.textSecondary} />
              <Text style={[styles.btnText, { color: colors.textSecondary }]}>Clear AI fills</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function confidenceStyle(c: 'high' | 'medium' | 'low') {
  if (c === 'high') return { backgroundColor: colors.successSoft };
  if (c === 'low') return { backgroundColor: colors.warningSoft };
  return { backgroundColor: colors.primarySoft };
}

function confidenceTextStyle(c: 'high' | 'medium' | 'low') {
  if (c === 'high') return { color: colors.success };
  if (c === 'low') return { color: colors.warning };
  return { color: colors.primary };
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  notes: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 1,
  },
  confidence: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  confidenceText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'lowercase',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 185, 129, 0.2)',
  },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btnText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
