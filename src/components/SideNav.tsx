/**
 * Left sidebar navigation — wide screens (desktop web) only; phones get
 * the bottom tab bar (BottomBar.tsx). Field-readiness pass (UX audit):
 *   · grouped sections instead of 13 flat rows (N4)
 *   · real <a> links via expo-router Link — open-in-new-tab, keyboard,
 *     screen readers all work (CS-5/K1)
 *   · 48px rows (F1), AA contrast (F2)
 */

import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, usePathname } from 'expo-router';

import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radii, typography, touch } from '../theme';

export type NavItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  /** Match the active state on this prefix. */
  match?: string;
  /** Section header this item renders under. */
  section?: string;
};

export function SideNav({ items, title }: { items: NavItem[]; title: string }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  if (width < 900) return null;

  // Preserve item order, group by section label.
  const sections: Array<{ name: string; items: NavItem[] }> = [];
  for (const item of items) {
    const name = item.section ?? '';
    const last = sections[sections.length - 1];
    if (last && last.name === name) last.items.push(item);
    else sections.push({ name, items: [item] });
  }

  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <View style={styles.logo}><Text style={styles.logoText}>C</Text></View>
        <View>
          <Text style={styles.brandName}>Consite</Text>
          <Text style={styles.brandSub}>{title}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}>
        {sections.map((section) => (
          <View key={section.name || 'top'}>
            {!!section.name && <Text style={styles.sectionLabel}>{section.name}</Text>}
            {section.items.map((item) => {
              const active = pathname === (item.match ?? item.route) ||
                pathname.startsWith((item.match ?? item.route) + '/') ||
                pathname === item.route.split('?')[0];
              return (
                <Link key={item.route} href={item.route as never} asChild>
                  <Pressable
                    accessibilityRole="link"
                    style={[styles.item, active && styles.itemActive]}
                  >
                    <Feather name={item.icon} size={19} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.item} onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out">
        <Feather name="log-out" size={19} color={colors.textSecondary} />
        <Text style={styles.itemText} numberOfLines={1}>
          Sign out{user?.displayName ? ` · ${user.displayName.split(' ')[0]}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 248,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    height: '100%',
  },
  brand: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.lg,
  },
  logo: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: colors.textInverse, fontWeight: typography.weights.bold, fontSize: 18 },
  brandName: { fontWeight: typography.weights.bold, color: colors.text, fontSize: typography.sizes.md },
  brandSub: { color: colors.textSecondary, fontSize: typography.sizes.xs },

  sectionLabel: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold,
    color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: touch.min,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.sm, borderRadius: radii.md,
  },
  itemActive: { backgroundColor: colors.primarySoft },
  itemText: { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  itemTextActive: { color: colors.primary, fontWeight: typography.weights.semibold },
});
