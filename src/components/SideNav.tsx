/**
 * Left sidebar navigation — renders on wide screens (desktop web) only;
 * phones keep the dashboard grid. Active route highlighted.
 */

import { View, Text, StyleSheet, Pressable, useWindowDimensions, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';

import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radii, typography } from '../theme';

export type NavItem = {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  route: string;
  /** Match the active state on this prefix. */
  match?: string;
};

export function SideNav({ items, title }: { items: NavItem[]; title: string }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  if (width < 900) return null;

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
        {items.map((item) => {
          const active = pathname === (item.match ?? item.route) ||
            pathname.startsWith((item.match ?? item.route) + '/') ||
            pathname === item.route.split('?')[0];
          return (
            <Pressable
              key={item.route}
              style={[styles.item, active && styles.itemActive]}
              onPress={() => router.push(item.route as any)}
            >
              <Feather name={item.icon} size={17} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable style={styles.item} onPress={signOut}>
        <Feather name="log-out" size={17} color={colors.textSecondary} />
        <Text style={styles.itemText} numberOfLines={1}>
          {user?.displayName?.split(' ')[0] ?? 'Sign out'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 230,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    height: '100%',
  },
  brand: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, marginBottom: spacing.xl,
  },
  logo: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: colors.textInverse, fontWeight: typography.weights.bold, fontSize: 18 },
  brandName: { fontWeight: typography.weights.bold, color: colors.text, fontSize: typography.sizes.md },
  brandSub: { color: colors.textSecondary, fontSize: typography.sizes.xs },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.sm, borderRadius: radii.md,
  },
  itemActive: { backgroundColor: colors.primarySoft },
  itemText: { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  itemTextActive: { color: colors.primary, fontWeight: typography.weights.semibold },
});
