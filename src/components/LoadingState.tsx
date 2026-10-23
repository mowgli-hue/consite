/**
 * Loading & empty-state primitives for field conditions (UX audit F3):
 *
 *  <Skeleton rows={3} />       — grey placholder bars instead of a bare
 *                                spinner, so the page shape is visible
 *  <LoadingState onRetry />    — skeleton that, after 8 s, admits it's
 *                                stuck and offers a big Retry button.
 *                                Spinners that never resolve are how the
 *                                office loses trust in the data.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radii, typography, touch } from '../theme';

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonBar, { width: `${70 - i * 8}%` }]} />
            <View style={[styles.skeletonBar, { width: '45%', opacity: 0.6 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function LoadingState({ rows = 3, onRetry, slowAfterMs = 8000 }: {
  rows?: number;
  onRetry?: () => void;
  slowAfterMs?: number;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [slowAfterMs]);

  return (
    <View>
      <Skeleton rows={rows} />
      {slow && (
        <View style={styles.slowBox}>
          <Text style={styles.slowText}>This is taking longer than it should — weak signal?</Text>
          {onRetry && (
            <Pressable style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
              <Feather name="refresh-cw" size={18} color={colors.textInverse} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.sm,
  },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt },

  slowBox: { alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  slowText: { color: colors.textSecondary, fontSize: typography.sizes.sm, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radii.md,
    minHeight: touch.min, paddingHorizontal: spacing.xl, alignSelf: 'stretch',
  },
  retryText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md },
});
