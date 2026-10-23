/**
 * Bottom tab bar for phones (UX audit N7/S1: at 390px the sidebar
 * disappears and nothing replaces it). Four primary destinations +
 * a More sheet holding everything else. 56px items, real links.
 * Renders only below the sidebar breakpoint.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, usePathname, router } from 'expo-router';

import type { NavItem } from './SideNav';
import { colors, spacing, radii, typography, touch, shadows } from '../theme';

export function BottomBar({ primary, more }: { primary: NavItem[]; more: NavItem[] }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (width >= 900) return null; // sidebar handles desktop

  const isActive = (item: NavItem) => {
    const m = item.match ?? item.route;
    return pathname === m || pathname.startsWith(m + '/');
  };

  return (
    <>
      <View style={styles.bar} accessibilityRole="tablist">
        {primary.map((item) => {
          const active = isActive(item);
          return (
            <Link key={item.route} href={item.route as never} asChild>
              <Pressable accessibilityRole="link" style={styles.tab}>
                <Feather name={item.icon} size={22} color={active ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
              </Pressable>
            </Link>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More sections"
          style={styles.tab}
          onPress={() => setSheetOpen(true)}
        >
          <Feather name="grid" size={22} color={colors.textSecondary} />
          <Text style={styles.tabLabel}>More</Text>
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <View />
        </Pressable>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView>
            {more.map((item) => (
              <Pressable
                key={item.route}
                accessibilityRole="link"
                style={styles.sheetRow}
                onPress={() => { setSheetOpen(false); router.push(item.route as never); }}
              >
                <Feather name={item.icon} size={20} color={colors.primary} />
                <Text style={styles.sheetRowText}>{item.label}</Text>
                <Feather name="chevron-right" size={18} color={colors.textTertiary} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderColor: colors.border,
    paddingBottom: spacing.xs, // breathing room above home indicators
    ...shadows.modal,
  },
  tab: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    minHeight: touch.primary, gap: 2, paddingTop: spacing.xs,
  },
  tabLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontWeight: typography.weights.medium },
  tabLabelActive: { color: colors.primary, fontWeight: typography.weights.bold },

  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl,
    maxHeight: '70%', paddingBottom: spacing.xl, paddingTop: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.borderStrong, marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: touch.min, paddingHorizontal: spacing.xl,
  },
  sheetRowText: { flex: 1, fontSize: typography.sizes.md, color: colors.text, fontWeight: typography.weights.medium },
});
