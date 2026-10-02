/**
 * NEXT STEP — the one giant button a non-technical worker needs.
 *
 * The app computes where you are in the day and shows exactly one thing:
 *   · not clocked in         → START WORK (orange)
 *   · clocked in, no FLHA    → DO TODAY'S SAFETY FORM (red — it's a gate)
 *   · clocked in, FLHA done  → YOU'RE WORKING + two big actions:
 *                              TAKE A PHOTO and FINISH WORK
 *
 * No menus to understand. Can't tell the state (offline, slow reads)?
 * It falls back to START WORK → the Clock screen sorts it out.
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDoc, getDocs, limit, query, Timestamp, where } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../contexts/I18nContext';
import { findOpenShift, getLocalOpenShift, tsToMs } from '../lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../theme';

type DayState =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'needs-flha'; projectId: string; projectName: string; flhaFormId: string }
  | { kind: 'working'; projectId: string; projectName: string; sinceMs: number };

export function NextStep() {
  const { user } = useAuth();
  const { t } = useT();
  const [state, setState] = useState<DayState>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      // Offline-captured shift first — it's on this phone, trust it.
      const local = await getLocalOpenShift();
      if (local) {
        setState({ kind: 'working', projectId: local.projectId, projectName: local.projectName, sinceMs: local.clockInMs });
        return;
      }
      const open = await findOpenShift(user.uid, user.projectIds ?? []);
      if (!open) { setState({ kind: 'off' }); return; }

      // On the clock — has today's FLHA been done?
      let projectName = open.projectId;
      let flhaFormId = 'flha-daily-v1';
      try {
        const p = await getDoc(doc(db, 'projects', open.projectId));
        projectName = (p.data() as { name?: string } | undefined)?.name ?? projectName;
        flhaFormId = (p.data() as { defaultFlhaFormId?: string } | undefined)?.defaultFlhaFormId ?? flhaFormId;
      } catch { /* name stays id */ }

      let flhaDone = false;
      try {
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const subs = await getDocs(query(
          collection(db, 'projects', open.projectId, 'submissions'),
          where('submittedBy', '==', user.uid),
          where('submittedAt', '>=', Timestamp.fromMillis(dayStart.getTime())),
          limit(25),
        ));
        flhaDone = subs.docs.some((d) =>
          String((d.data() as { schemaId?: string }).schemaId ?? '').toLowerCase().includes('flha'));
      } catch { /* unknown → treat as not done; the form screen is harmless */ }

      if (flhaDone) {
        setState({ kind: 'working', projectId: open.projectId, projectName, sinceMs: tsToMs(open.clockInAt) ?? Date.now() });
      } else {
        setState({ kind: 'needs-flha', projectId: open.projectId, projectName, flhaFormId });
      }
    } catch {
      setState({ kind: 'off' }); // safe fallback — Clock screen re-checks everything
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (state.kind === 'loading') {
    return (
      <View style={[styles.hero, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (state.kind === 'off') {
    return (
      <Pressable style={[styles.hero, { backgroundColor: colors.primary }]} onPress={() => router.push('/clock' as any)}>
        <Feather name="log-in" size={34} color={colors.textInverse} />
        <Text style={styles.heroText}>{t('Start work')}</Text>
        <Text style={styles.heroSub}>{t('Tap here when you get to the site')}</Text>
      </Pressable>
    );
  }

  if (state.kind === 'needs-flha') {
    return (
      <Pressable
        style={[styles.hero, { backgroundColor: colors.danger }]}
        onPress={() => router.push(`/forms/${state.flhaFormId}?projectId=${state.projectId}` as any)}
      >
        <Feather name="shield" size={34} color={colors.textInverse} />
        <Text style={styles.heroText}>{t('Do today’s safety form')}</Text>
        <Text style={styles.heroSub}>{state.projectName} · {t('takes one minute — AI fills most of it')}</Text>
      </Pressable>
    );
  }

  // working
  const hours = Math.floor((Date.now() - state.sinceMs) / 3_600_000);
  const mins = Math.floor(((Date.now() - state.sinceMs) % 3_600_000) / 60_000);
  return (
    <View style={[styles.hero, styles.workingHero]}>
      <View style={styles.workingTop}>
        <View style={styles.liveDot} />
        <Text style={styles.workingText}>
          {t('You’re working')} · {state.projectName} · {hours}h {mins}m
        </Text>
      </View>
      <View style={styles.workingActions}>
        <Pressable style={[styles.bigAction, { backgroundColor: colors.primary }]} onPress={() => router.push(`/scan?projectId=${state.projectId}` as any)}>
          <Feather name="camera" size={26} color={colors.textInverse} />
          <Text style={styles.bigActionText}>{t('Take a photo')}</Text>
        </Pressable>
        <Pressable style={[styles.bigAction, { backgroundColor: colors.danger }]} onPress={() => router.push('/clock' as any)}>
          <Feather name="log-out" size={26} color={colors.textInverse} />
          <Text style={styles.bigActionText}>{t('Finish work')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.xl, padding: spacing.xl, alignItems: 'center',
    marginBottom: spacing.lg, minHeight: 130, justifyContent: 'center',
    ...shadows.card,
  },
  heroText: {
    color: colors.textInverse, fontSize: 26, fontWeight: typography.weights.bold,
    marginTop: spacing.sm, textAlign: 'center',
  },
  heroSub: { color: colors.textInverse, opacity: 0.9, marginTop: spacing.xs, textAlign: 'center', fontSize: typography.sizes.md },

  workingHero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'stretch' },
  workingTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center' },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  workingText: { color: colors.text, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md, textAlign: 'center' },
  workingActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  bigAction: {
    flex: 1, borderRadius: radii.lg, paddingVertical: spacing.xl,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  bigActionText: { color: colors.textInverse, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
});
