/**
 * Form fill screen — the v0.1 magic moment.
 *
 * Flow:
 *  1. Worker opens form.
 *  2. App calls aiFillForm with project + worker context. Form opens 80% filled.
 *  3. (Optional) Worker hits the mic, says one sentence about today's work.
 *  4. Voice transcript triggers a second aiFillForm pass that fills the rest.
 *  5. Worker confirms/edits values, signs, submits.
 *  6. PDF auto-saved to project. Done.
 *
 * The two-pass approach lets us pre-fill INSTANTLY on open (no waiting for
 * voice) and then refine after the worker speaks. This is the difference
 * between feeling magical and feeling slow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';

import { db } from '../../../src/lib/firebase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { fillFormWithAi } from '../../../src/lib/ai';
import { FormRenderer } from '../../../src/components/FormRenderer';
import { AIFilledBanner } from '../../../src/components/AIFilledBanner';
import { VoiceInput } from '../../../src/components/VoiceInput';
import { exportSubmissionToPdf, shareSubmissionPdf } from '../../../src/lib/pdf';
import { colors, spacing, radii, typography } from '../../../src/theme';
import type { FormSchema, FormValues } from '../../../src/types';

type Phase = 'loading' | 'filling' | 'voice-prompt' | 'voice-filling' | 'review' | 'submitting' | 'done';

export default function FormFillScreen() {
  const { formId, projectId, phase: routePhase } = useLocalSearchParams<{
    formId: string;
    projectId?: string;
    /** 'checkout' renders only End-of-Day sections and updates today's submission. */
    phase?: string;
  }>();
  const { user } = useAuth();
  const isCheckout = routePhase === 'checkout';

  const [schema, setSchema] = useState<FormSchema | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [aiNotes, setAiNotes] = useState<string>('');
  const [aiConfidence, setAiConfidence] = useState<'high' | 'medium' | 'low'>('medium');
  const [aiFilledKeys, setAiFilledKeys] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>('loading');
  const [phaseMessage, setPhaseMessage] = useState<string>('Loading form…');
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');

  // ─── Load schema + run first AI pass on open ──────────────────────────

  useEffect(() => {
    (async () => {
      if (!formId || !projectId) return;
      try {
        const snap = await getDoc(doc(db, 'forms', formId));
        if (!snap.exists()) {
          setPhase('review');
          return;
        }
        const loaded: FormSchema = { id: snap.id, ...(snap.data() as Omit<FormSchema, 'id'>) };
        setSchema(loaded);

        // Checkout mode: 4 quick questions — no AI pass, no voice, straight in.
        if (routePhase === 'checkout') {
          setPhase('review');
          return;
        }

        // First AI pass — pre-fill from context only (no voice yet)
        setPhase('filling');
        setPhaseMessage('AI is reading the site context…');
        try {
          const result = await fillFormWithAi({ schema: loaded, projectId });
          setValues(result.values);
          setAiFilledKeys(new Set(Object.keys(result.values ?? {})));
          setAiNotes(result.notes);
          setAiConfidence(result.confidence);
          setPhase('voice-prompt');
        } catch (err) {
          console.warn('AI pre-fill failed (non-fatal)', err);
          setPhase('voice-prompt');
        }
      } catch (err) {
        console.warn('Form load failed', err);
        setPhase('review');
      }
    })();
  }, [formId, projectId]);

  // ─── Voice handler — runs second AI pass with transcript ──────────────

  const handleVoice = useCallback(
    async (transcript: string) => {
      if (!schema || !projectId) return;
      setVoiceTranscript(transcript);
      setPhase('voice-filling');
      setPhaseMessage('AI is filling the hazards from what you said…');
      try {
        const result = await fillFormWithAi({
          schema,
          projectId,
          voiceTranscript: transcript,
        });
        // Merge: voice-driven results override pre-fill where present
        setValues((prev) => ({ ...prev, ...result.values }));
        setAiFilledKeys((prev) => {
          const next = new Set(prev);
          Object.keys(result.values ?? {}).forEach((k) => next.add(k));
          return next;
        });
        setAiNotes(result.notes);
        setAiConfidence(result.confidence);
      } catch (err) {
        Alert.alert('Voice fill failed', 'You can still fill the form manually.');
      } finally {
        setPhase('review');
      }
    },
    [schema, projectId]
  );

  // ─── Skip voice straight to review ────────────────────────────────────

  function skipVoice() {
    setPhase('review');
  }

  // ─── Clear AI-filled values (worker doesn't trust the fills) ──────────

  function clearAiFills() {
    setValues((prev) => {
      const next = { ...prev };
      aiFilledKeys.forEach((k) => delete next[k]);
      return next;
    });
    setAiFilledKeys(new Set());
  }

  // Which sections this mode shows: check-in hides checkout sections; checkout shows only them.
  const displaySchema = useMemo<FormSchema | null>(() => {
    if (!schema) return null;
    const sections = schema.sections.filter((s) =>
      isCheckout ? s.phase === 'checkout' : s.phase !== 'checkout',
    );
    return { ...schema, sections };
  }, [schema, isCheckout]);

  // ─── Submit ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!schema || !displaySchema || !user || !projectId) {
      Alert.alert('Missing context', 'No project selected for this form.');
      return;
    }

    const missing: string[] = [];
    for (const section of displaySchema.sections) {
      for (const field of section.fields) {
        if ('required' in field && field.required) {
          const v = values[field.id];
          if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
            missing.push(field.label);
          }
        }
      }
    }
    if (missing.length > 0) {
      Alert.alert('Missing required fields', missing.join('\n'));
      return;
    }

    setPhase('submitting');
    try {
      // Checkout mode: merge the End-of-Day answers into TODAY's submission
      // of this form (created at clock-in), instead of creating a new one.
      if (isCheckout) {
        const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        const snap = await getDocs(query(
          collection(db, 'projects', projectId, 'submissions'),
          where('submittedBy', '==', user.uid),
        ));
        const today = snap.docs
          .filter((d) => {
            const data = d.data() as any;
            const ms = data.submittedAt?.toMillis ? data.submittedAt.toMillis() : 0;
            return data.schemaId === schema.id && ms >= dayStart.getTime();
          })
          .sort((a, b) => ((b.data() as any).submittedAt?.toMillis?.() ?? 0) - ((a.data() as any).submittedAt?.toMillis?.() ?? 0))[0];

        if (today) {
          const patch: Record<string, unknown> = { endOfDayAt: serverTimestamp() };
          for (const [k, v] of Object.entries(values)) {
            if (v !== undefined) patch[`values.${k}`] = v;
          }
          await updateDoc(today.ref, patch);
        } else {
          // No morning FLHA found — record End of Day standalone rather than lose it.
          await addDoc(collection(db, 'projects', projectId, 'submissions'), {
            schemaId: schema.id,
            schemaVersion: schema.version,
            projectId,
            values,
            submittedBy: user.uid,
            submittedAt: serverTimestamp(),
            endOfDayAt: serverTimestamp(),
            aiAssisted: false,
            voiceTranscript: null,
          });
        }
        setPhase('done');
        Alert.alert('End of day recorded', 'Have a good one.');
        router.back();
        return;
      }

      const submission = {
        schemaId: schema.id,
        schemaVersion: schema.version,
        projectId,
        values,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        aiAssisted: aiFilledKeys.size > 0,
        voiceTranscript: voiceTranscript || null,
      };
      const ref = await addDoc(collection(db, 'projects', projectId, 'submissions'), submission);

      try {
        const uri = await exportSubmissionToPdf(schema, {
          ...submission,
          id: ref.id,
          submittedAt: Date.now(),
        } as any);
        await shareSubmissionPdf(uri);
      } catch (pdfErr) {
        console.warn('PDF export failed (non-fatal)', pdfErr);
      }

      setPhase('done');
      Alert.alert('Submitted', 'Your form has been recorded.');
      router.back();
    } catch (err: any) {
      Alert.alert('Submission failed', err.message ?? 'Please try again.');
      setPhase('review');
    }
  }

  // ─── Render branches ──────────────────────────────────────────────────

  if (phase === 'loading' || phase === 'filling') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.phaseLabel}>{phaseMessage}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!schema) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text>Form not found.</Text>
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
        <Text style={styles.title} numberOfLines={1}>
          {schema.title}
        </Text>
      </View>

      {phase === 'voice-prompt' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {aiFilledKeys.size > 0 && (
            <AIFilledBanner
              confidence={aiConfidence}
              notes={aiNotes}
              filledCount={aiFilledKeys.size}
              totalCount={countAllFields(schema)}
            />
          )}

          <View style={styles.voiceCard}>
            <Text style={styles.voiceCardTitle}>One more thing — what are you doing today?</Text>
            <Text style={styles.voiceCardSubtitle}>
              Hold the mic and say one sentence. AI will fill the hazards and PPE.
            </Text>
            <VoiceInput onTranscript={handleVoice} />
            <Pressable hitSlop={8} onPress={skipVoice}>
              <Text style={styles.skipLink}>Skip — I'll fill it myself</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {phase === 'voice-filling' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.phaseLabel}>{phaseMessage}</Text>
          <Text style={styles.transcriptShown}>"{voiceTranscript}"</Text>
        </View>
      )}

      {(phase === 'review' || phase === 'submitting') && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {aiFilledKeys.size > 0 && (
            <AIFilledBanner
              confidence={aiConfidence}
              notes={aiNotes}
              filledCount={aiFilledKeys.size}
              totalCount={countAllFields(schema)}
              onClear={clearAiFills}
            />
          )}

          <FormRenderer
            schema={displaySchema ?? schema}
            values={values}
            onChange={setValues}
            aiFilledKeys={aiFilledKeys}
            onFieldEdited={(fieldId) =>
              setAiFilledKeys((prev) => {
                const next = new Set(prev);
                next.delete(fieldId);
                return next;
              })
            }
          />

          <Pressable
            style={[styles.submitButton, phase === 'submitting' && { opacity: 0.6 }]}
            disabled={phase === 'submitting'}
            onPress={handleSubmit}
          >
            {phase === 'submitting' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.submitText}>{isCheckout ? 'Finish the day' : 'Submit form'}</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function countAllFields(schema: FormSchema): number {
  return schema.sections.reduce((acc, s) => acc + s.fields.length, 0);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  phaseLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.md,
    textAlign: 'center',
  },
  transcriptShown: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.lg,
    maxWidth: 280,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    flex: 1,
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  voiceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceCardTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  voiceCardSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  skipLink: {
    marginTop: spacing.lg,
    color: colors.textTertiary,
    fontSize: typography.sizes.sm,
  },
  submitButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  submitText: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
