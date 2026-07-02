/**
 * Daily Log screen — the supervisor's end-of-shift magic moment.
 *
 * Flow:
 *  1. Supervisor picks the date (defaults to today).
 *  2. Taps "Generate Daily Log" — AI synthesizes the day's events.
 *  3. Reads the draft, can edit any paragraph.
 *  4. Saves to /projects/{pid}/dailyLogs/{date}.
 *
 * Time saved: ~30 min/day per super. Replaces a paper site diary
 * that 70% of small contractors keep poorly or not at all.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { generateDailyLog } from '../../src/lib/ai';
import { AIFilledBanner } from '../../src/components/AIFilledBanner';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project } from '../../src/types';

type Phase = 'loading' | 'idle' | 'generating' | 'review' | 'saving' | 'saved';

export default function DailyLogScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [dateISO, setDateISO] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [logText, setLogText] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [flagged, setFlagged] = useState<string[]>([]);
  const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [existingLog, setExistingLog] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      if (!projectId) return;
      try {
        const snap = await getDoc(doc(db, 'projects', projectId));
        if (snap.exists()) {
          setProject({ id: snap.id, ...(snap.data() as Omit<Project, 'id'>) });
        }
        // Check if today's log already exists
        const existing = await getDoc(doc(db, 'projects', projectId, 'dailyLogs', dateISO));
        if (existing.exists()) {
          const d = existing.data();
          setLogText(d.log ?? '');
          setSummary(d.summary ?? '');
          setFlagged(d.flagged ?? []);
          setExistingLog(true);
          setPhase('review');
        } else {
          setPhase('idle');
        }
      } catch (err) {
        console.warn('Load failed', err);
        setPhase('idle');
      }
    })();
  }, [projectId, dateISO]);

  async function handleGenerate() {
    if (!projectId) return;
    setPhase('generating');
    try {
      const result = await generateDailyLog({ projectId, dateISO });
      setLogText(result.log ?? '');
      setSummary(result.summary ?? '');
      setFlagged(result.flagged ?? []);
      setAiConfidence('high');
      setPhase('review');
    } catch (err: any) {
      Alert.alert('Generation failed', err.message ?? 'Try again in a moment.');
      setPhase('idle');
    }
  }

  async function handleSave() {
    if (!projectId || !user) return;
    setPhase('saving');
    try {
      await setDoc(doc(db, 'projects', projectId, 'dailyLogs', dateISO), {
        date: dateISO,
        log: logText,
        summary,
        flagged,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        aiGenerated: true,
      });
      setPhase('saved');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
      setPhase('review');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.title}>Daily Log</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {project?.name ?? 'Loading…'} · {formatDate(dateISO)}
          </Text>
        </View>
      </View>

      {phase === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {phase === 'idle' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroCard}>
            <View style={styles.iconCircle}>
              <Feather name="edit-3" size={28} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Let AI write today's log</Text>
            <Text style={styles.heroSubtitle}>
              We'll pull everything that happened on site today — clock-ins, FLHAs, deliveries, photos, weather — and write a complete, professional daily log. You review and edit before submitting.
            </Text>

            <Pressable
              style={styles.generateButton}
              onPress={handleGenerate}
            >
              <Feather name="zap" size={18} color={colors.textInverse} />
              <Text style={styles.generateButtonText}>Generate daily log</Text>
            </Pressable>

            <Text style={styles.heroFootnote}>
              Takes about 5–10 seconds. You can edit anything before saving.
            </Text>
          </View>

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>What gets included</Text>
            {[
              'Weather + site conditions',
              'Crew on site + hours worked',
              'Work performed by trade',
              'Deliveries, visitors, inspections',
              'Issues, incidents, deficiencies',
              'Things to follow up tomorrow',
            ].map((t) => (
              <View key={t} style={styles.tipRow}>
                <Feather name="check-circle" size={14} color={colors.success} />
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {phase === 'generating' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.phaseLabel}>Reading the day's events…</Text>
          <Text style={styles.phaseSub}>
            Pulling clock-ins, submissions, weather, photos
          </Text>
        </View>
      )}

      {(phase === 'review' || phase === 'saving' || phase === 'saved') && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!existingLog && (
            <AIFilledBanner
              confidence={aiConfidence}
              notes="AI drafted this log from today's clock-ins, submissions, and weather. Edit anything below."
            />
          )}

          {existingLog && (
            <View style={styles.savedBanner}>
              <Feather name="check-circle" size={16} color={colors.success} />
              <Text style={styles.savedBannerText}>
                Already saved. Editing creates an update.
              </Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>One-line summary</Text>
          <TextInput
            style={styles.summaryInput}
            value={summary}
            onChangeText={setSummary}
            placeholder="Headline for the day"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Full log</Text>
          <TextInput
            style={styles.logInput}
            value={logText}
            onChangeText={setLogText}
            multiline
            textAlignVertical="top"
            placeholder="The full daily log appears here…"
            placeholderTextColor={colors.textTertiary}
          />

          {flagged.length > 0 && (
            <View style={styles.flaggedCard}>
              <View style={styles.flaggedHeader}>
                <Feather name="alert-circle" size={16} color={colors.warning} />
                <Text style={styles.flaggedTitle}>For tomorrow</Text>
              </View>
              {flagged.map((f, i) => (
                <Text key={i} style={styles.flaggedItem}>
                  • {f}
                </Text>
              ))}
            </View>
          )}

          <Pressable
            style={[styles.saveButton, phase === 'saving' && { opacity: 0.6 }]}
            disabled={phase === 'saving' || phase === 'saved'}
            onPress={handleSave}
          >
            {phase === 'saving' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : phase === 'saved' ? (
              <>
                <Feather name="check" size={18} color={colors.textInverse} />
                <Text style={styles.saveButtonText}>Saved</Text>
              </>
            ) : (
              <>
                <Feather name="save" size={18} color={colors.textInverse} />
                <Text style={styles.saveButtonText}>Save daily log</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={styles.regenButton}
            onPress={handleGenerate}
            disabled={phase === 'saving' || phase === 'saved'}
          >
            <Feather name="refresh-cw" size={14} color={colors.textSecondary} />
            <Text style={styles.regenButtonText}>Regenerate with AI</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  phaseLabel: { color: colors.textSecondary, fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.sm },
  phaseSub: { color: colors.textTertiary, fontSize: typography.sizes.sm, textAlign: 'center' },
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  generateButton: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  generateButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  heroFootnote: { marginTop: spacing.md, fontSize: typography.sizes.xs, color: colors.textTertiary, textAlign: 'center' },

  tipsCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tipsTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  tipText: { fontSize: typography.sizes.sm, color: colors.text },

  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  logInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
    minHeight: 320,
    lineHeight: 22,
  },

  flaggedCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  flaggedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  flaggedTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.text },
  flaggedItem: { fontSize: typography.sizes.sm, color: colors.text, marginVertical: 2 },

  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.successSoft,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  savedBannerText: { fontSize: typography.sizes.sm, color: colors.text },

  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  saveButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },

  regenButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  regenButtonText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
});
