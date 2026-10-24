/**
 * Renders toast() messages as a big, glove-readable banner that slides
 * in at the top and dismisses itself. Mount once per layout.
 */

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { registerToastHost } from '../lib/notify';
import { colors, spacing, radii, typography, shadows } from '../theme';

export function ToastHost() {
  const [msg, setMsg] = useState<{ title: string; body?: string; tone: 'success' | 'info' } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => registerToastHost((t) => {
    setMsg(t);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: Platform.OS !== 'web' })
        .start(() => setMsg(null));
    }, 3500);
  }), [opacity]);

  if (!msg) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]} accessibilityLiveRegion="polite">
      <View style={[styles.toast, msg.tone === 'success' ? styles.success : styles.info]}>
        <Feather name={msg.tone === 'success' ? 'check-circle' : 'info'} size={22} color={colors.textInverse} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{msg.title}</Text>
          {!!msg.body && <Text style={styles.body}>{msg.body}</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', top: spacing.xl, left: spacing.lg, right: spacing.lg,
    zIndex: 1000, alignItems: 'center',
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radii.lg, padding: spacing.lg, maxWidth: 560, width: '100%',
    ...shadows.modal,
  },
  success: { backgroundColor: colors.success },
  info: { backgroundColor: colors.text },
  title: { color: colors.textInverse, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  body: { color: colors.textInverse, opacity: 0.95, fontSize: typography.sizes.sm, marginTop: 2 },
});
