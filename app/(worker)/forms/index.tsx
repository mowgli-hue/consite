/**
 * Forms browser — every active form the company uses (FLHA, QC,
 * environmental, whatever the office adds). Tap → AI-assisted fill.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../../src/lib/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { notify } from '../../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../../src/theme';

type FormRow = { id: string; title: string; description?: string; category?: string };

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  flha: 'shield',
  inspection: 'check-square',
  toolbox: 'tool',
  incident: 'alert-triangle',
  custom: 'clipboard',
};

export default function FormsIndex() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const projectId = user?.projectIds?.[0];

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'forms'), where('archived', '==', false)));
        setForms(snap.docs.map((d) => ({
          id: d.id,
          title: (d.data() as any).title ?? d.id,
          description: (d.data() as any).description,
          category: (d.data() as any).category,
        })).sort((a, b) => (a.category === 'flha' ? -1 : 1) - (b.category === 'flha' ? -1 : 1)));
      } catch (err: any) {
        notify('Could not load forms', err.message);
        setForms([]);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Forms</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!projectId && (
          <Text style={styles.warnText}>You're not assigned to a project yet — ask the office.</Text>
        )}
        {forms === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : (
          forms.map((f) => (
            <Pressable
              key={f.id}
              style={styles.card}
              disabled={!projectId}
              onPress={() => router.push(`/forms/${f.id}?projectId=${projectId}` as any)}
            >
              <View style={styles.iconWrap}>
                <Feather name={CATEGORY_ICON[f.category ?? 'custom'] ?? 'clipboard'} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{f.title}</Text>
                {!!f.description && <Text style={styles.sub} numberOfLines={2}>{f.description}</Text>}
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 640, width: '100%', alignSelf: 'center' },
  warnText: { color: colors.warning, marginBottom: spacing.md },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.card,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: radii.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
});
