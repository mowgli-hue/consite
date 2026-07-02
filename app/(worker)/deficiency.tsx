/**
 * Deficiency capture screen — the second daily magic moment.
 *
 * Worker sees a problem on site. Taps Report Deficiency. Takes a photo.
 * Says one sentence describing what they see ("drywall damaged, looks like
 * water"). AI writes a structured deficiency report:
 *   - Title
 *   - Description
 *   - Likely trade (drywall, electrical, plumbing, etc.)
 *   - Severity (minor / major / safety-critical)
 *   - Recommended action
 *
 * Worker confirms with one tap. Logged to /projects/{pid}/deficiencies/{id}.
 * Now in the punch list.
 *
 * Replaces: iPhone Notes app + WhatsApp + memory.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { analyzeDeficiency } from '../../src/lib/ai';
import { VoiceInput } from '../../src/components/VoiceInput';
import { AIFilledBanner } from '../../src/components/AIFilledBanner';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Phase = 'capture' | 'voice' | 'analyzing' | 'review' | 'submitting' | 'done';

interface DeficiencyDraft {
  title: string;
  description: string;
  trade: string;
  severity: 'minor' | 'major' | 'safety-critical';
  recommendedAction: string;
  confidence: 'high' | 'medium' | 'low';
}

const TRADE_OPTIONS = [
  'framing',
  'drywall',
  'electrical',
  'plumbing',
  'mechanical',
  'painting',
  'flooring',
  'roofing',
  'exterior',
  'general',
];

const SEVERITIES: Array<'minor' | 'major' | 'safety-critical'> = ['minor', 'major', 'safety-critical'];

export default function DeficiencyScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [draft, setDraft] = useState<DeficiencyDraft | null>(null);

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Camera needed', 'Please grant camera access to take a deficiency photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);

    // Read as base64 for upload to Anthropic via Cloud Function
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setImageBase64(b64);
      setPhase('voice');
    } catch (err) {
      console.warn('Failed to read image', err);
      Alert.alert('Photo error', 'Could not process the photo. Try again.');
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setImageBase64(b64);
      setPhase('voice');
    } catch (err) {
      console.warn('Failed to read image', err);
    }
  }

  async function runAnalysis(transcript: string) {
    if (!imageBase64) return;
    setVoiceTranscript(transcript);
    setPhase('analyzing');
    try {
      const result = await analyzeDeficiency({
        imageBase64,
        imageMediaType: 'image/jpeg',
        voiceTranscript: transcript || undefined,
      });
      setDraft(result);
      setPhase('review');
    } catch (err: any) {
      console.warn('Analysis failed', err);
      Alert.alert('Analysis failed', err.message ?? 'Try again.');
      setPhase('voice');
    }
  }

  function skipVoice() {
    runAnalysis('');
  }

  async function handleSubmit() {
    if (!draft || !user || !projectId || !imageUri) return;
    setPhase('submitting');
    try {
      await addDoc(collection(db, 'projects', projectId, 'deficiencies'), {
        ...draft,
        photoUri: imageUri, // Local URI for v0.2; v0.3 uploads to Storage
        voiceTranscript: voiceTranscript || null,
        status: 'open',
        reportedBy: user.uid,
        reportedAt: serverTimestamp(),
        aiAssisted: true,
      });
      setPhase('done');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      Alert.alert('Submit failed', err.message ?? 'Try again.');
      setPhase('review');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Report deficiency</Text>
      </View>

      {phase === 'capture' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.heroCard}>
            <View style={styles.iconCircle}>
              <Feather name="camera" size={28} color={colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Snap. Talk. Done.</Text>
            <Text style={styles.heroSubtitle}>
              Take a photo of the problem. Say one sentence about what you see. AI writes the report and adds it to the punch list.
            </Text>
          </View>

          <Pressable style={styles.bigButton} onPress={takePhoto}>
            <Feather name="camera" size={20} color={colors.textInverse} />
            <Text style={styles.bigButtonText}>Take photo</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={pickFromLibrary}>
            <Feather name="image" size={18} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Choose from library</Text>
          </Pressable>
        </ScrollView>
      )}

      {phase === 'voice' && imageUri && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Image source={{ uri: imageUri }} style={styles.photoPreview} />
          <Pressable
            style={styles.retakeLink}
            onPress={() => {
              setImageUri(null);
              setImageBase64(null);
              setPhase('capture');
            }}
          >
            <Feather name="refresh-cw" size={14} color={colors.textSecondary} />
            <Text style={styles.retakeLinkText}>Retake photo</Text>
          </Pressable>

          <View style={styles.voiceCard}>
            <Text style={styles.voiceCardTitle}>Tell me what's wrong</Text>
            <Text style={styles.voiceCardSubtitle}>
              One sentence is enough. AI uses the photo + your words to write the report.
            </Text>
            <VoiceInput
              onTranscript={runAnalysis}
              placeholder="e.g. drywall damaged behind the panel, looks like water"
            />
            <Pressable hitSlop={8} onPress={skipVoice}>
              <Text style={styles.skipLink}>Skip — just analyze the photo</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {phase === 'analyzing' && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.phaseLabel}>Analyzing the photo…</Text>
          {voiceTranscript ? (
            <Text style={styles.transcriptShown}>"{voiceTranscript}"</Text>
          ) : null}
        </View>
      )}

      {(phase === 'review' || phase === 'submitting') && draft && imageUri && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <AIFilledBanner
            confidence={draft.confidence}
            notes="AI wrote this report from the photo and your description. Edit before submitting."
          />

          <Image source={{ uri: imageUri }} style={styles.photoPreviewSmall} />

          <Text style={styles.fieldLabel}>Title</Text>
          <Text style={styles.draftValue}>{draft.title}</Text>

          <Text style={styles.fieldLabel}>Description</Text>
          <Text style={styles.draftValue}>{draft.description}</Text>

          <Text style={styles.fieldLabel}>Trade</Text>
          <View style={styles.pillRow}>
            {TRADE_OPTIONS.map((t) => (
              <Pressable
                key={t}
                style={[styles.pill, draft.trade === t && styles.pillActive]}
                onPress={() => setDraft({ ...draft, trade: t })}
              >
                <Text style={[styles.pillText, draft.trade === t && styles.pillTextActive]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Severity</Text>
          <View style={styles.pillRow}>
            {SEVERITIES.map((s) => (
              <Pressable
                key={s}
                style={[
                  styles.pill,
                  draft.severity === s && severityStyle(s),
                ]}
                onPress={() => setDraft({ ...draft, severity: s })}
              >
                <Text
                  style={[
                    styles.pillText,
                    draft.severity === s && styles.pillTextActive,
                  ]}
                >
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Recommended action</Text>
          <Text style={styles.draftValue}>{draft.recommendedAction}</Text>

          <Pressable
            style={[styles.submitButton, phase === 'submitting' && { opacity: 0.6 }]}
            disabled={phase === 'submitting'}
            onPress={handleSubmit}
          >
            {phase === 'submitting' ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <>
                <Feather name="check" size={18} color={colors.textInverse} />
                <Text style={styles.submitButtonText}>Add to punch list</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {phase === 'done' && (
        <View style={styles.center}>
          <View style={[styles.iconCircle, { backgroundColor: colors.success }]}>
            <Feather name="check" size={32} color={colors.textInverse} />
          </View>
          <Text style={styles.phaseLabel}>Added to punch list</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function severityStyle(s: 'minor' | 'major' | 'safety-critical') {
  if (s === 'safety-critical') return { backgroundColor: colors.danger, borderColor: colors.danger };
  if (s === 'major') return { backgroundColor: colors.warning, borderColor: colors.warning };
  return { backgroundColor: colors.primary, borderColor: colors.primary };
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
    marginTop: spacing.sm,
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
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
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

  bigButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  bigButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },

  secondaryButton: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },

  photoPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceAlt,
  },
  photoPreviewSmall: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.lg,
  },
  retakeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  retakeLinkText: { color: colors.textSecondary, fontSize: typography.sizes.sm },

  voiceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
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

  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  draftValue: {
    fontSize: typography.sizes.md,
    color: colors.text,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    lineHeight: 22,
  },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: { fontSize: typography.sizes.sm, color: colors.text, textTransform: 'capitalize' },
  pillTextActive: { color: colors.textInverse, fontWeight: typography.weights.semibold },

  submitButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitButtonText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
});
