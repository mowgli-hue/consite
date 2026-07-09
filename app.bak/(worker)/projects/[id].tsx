/**
 * Project detail — Plans | Media | Forms sub-sections.
 *
 * v0.1 just lists the section names — actual upload/view UIs come in v0.2.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../../src/lib/firebase';
import { colors, spacing, radii, typography, shadows } from '../../../src/theme';
import type { Project } from '../../../src/types';

type Tab = 'plans' | 'media' | 'forms';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>('plans');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const snap = await getDoc(doc(db, 'projects', id));
        if (snap.exists()) setProject({ id: snap.id, ...(snap.data() as Omit<Project, 'id'>) });
      } catch (err) {
        console.warn('Project load failed', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text>Project not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <View style={{ marginLeft: spacing.sm, flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{project.name}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{project.address}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton label="Plans" active={tab === 'plans'} onPress={() => setTab('plans')} />
        <TabButton label="Media" active={tab === 'media'} onPress={() => setTab('media')} />
        <TabButton label="Forms" active={tab === 'forms'} onPress={() => setTab('forms')} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {tab === 'plans' && <PlaceholderTab icon="file-text" label="Drawings & plans" />}
        {tab === 'media' && <PlaceholderTab icon="image" label="Site photos & video" />}
        {tab === 'forms' && <PlaceholderTab icon="clipboard" label="FLHA & inspection forms" />}
      </ScrollView>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PlaceholderTab({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={styles.placeholder}>
      <Feather name={icon} size={40} color={colors.textTertiary} />
      <Text style={styles.placeholderTitle}>{label}</Text>
      <Text style={styles.placeholderSub}>Coming in v0.2 — upload, view, version history.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  subtitle: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
  },
  tabActive: { borderBottomWidth: 2, borderColor: colors.primary },
  tabText: { color: colors.textSecondary, fontWeight: typography.weights.medium },
  tabTextActive: { color: colors.primary },
  placeholder: {
    alignItems: 'center',
    padding: spacing['3xl'],
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    ...shadows.card,
  },
  placeholderTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  placeholderSub: { color: colors.textSecondary, textAlign: 'center' },
});
