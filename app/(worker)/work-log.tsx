/**
 * Worker → Work Update. The "here's what I did" flow, Layer-3 seed data:
 * photo → voice note → AI structures it → worker confirms → entry lands on
 * the project timeline (photo in Storage, structured data in Firestore).
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { analyzeWork, type WorkLogResult } from '../../src/lib/ai';
import { VoiceInput } from '../../src/components/VoiceInput';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Phase = 'capture' | 'voice' | 'analyzing' | 'review' | 'submitting' | 'done';

export default function WorkLogScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<WorkLogResult | null>(null);

  async function grabImage(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Camera / photo access is required to add a work photo.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setImageBase64(b64);
      setPhase('voice');
    } catch {
      notify('Photo error', 'Could not process the photo. Try again.');
    }
  }

  async function runAnalysis(t: string) {
    if (!imageBase64) return;
    setTranscript(t);
    setPhase('analyzing');
    try {
      const result = await analyzeWork({
        imageBase64,
        imageMediaType: 'image/jpeg',
        voiceTranscript: t || undefined,
      });
      setDraft(result);
      setPhase('review');
    } catch (err: any) {
      notify('Analysis failed', err.message ?? 'Try again.');
      setPhase('voice');
    }
  }

  async function submit() {
    if (!draft || !user || !projectId || !imageBase64) return;
    setPhase('submitting');
    try {
      const docRef = await addDoc(collection(db, 'projects', projectId, 'workLog'), {
        ...draft,
        voiceTranscript: transcript || null,
        uid: user.uid,
        displayName: user.displayName,
        createdAt: serverTimestamp(),
        photoPath: null,
        aiAssisted: true,
      });
      // Photo → Storage under the media path project members may write to.
      const photoPath = `projects/${projectId}/media/worklog-${docRef.id}/photo.jpg`;
      await uploadString(ref(storage, photoPath), imageBase64, 'base64', { contentType: 'image/jpeg' });
      await updateDoc(docRef, { photoPath });
      setPhase('done');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      notify('Submit failed', err.message ?? 'Try again.');
      setPhase('review');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Work Update</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {phase === 'capture' && (
          <View style={styles.center}>
            <Feather name="camera" size={40} color={colors.primary} />
            <Text style={styles.bigText}>Show what got done</Text>
            <Text style={styles.subText}>One photo of today's work — the AI writes it up.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => grabImage(true)}>
              <Feather name="camera" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>Take photo</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => grabImage(false)}>
              <Text style={styles.secondaryBtnText}>Choose from library</Text>
            </Pressable>
          </View>
        )}

        {phase === 'voice' && (
          <View>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />}
            <Text style={styles.sectionLabel}>Say what you did (optional)</Text>
            <VoiceInput
              onTranscript={runAnalysis}
              placeholder='e.g. "Finished framing the north wall, second floor — need more 2x6 for tomorrow"'
            />
            <Pressable style={styles.skip} onPress={() => runAnalysis('')}>
              <Text style={styles.skipText}>Skip — photo only</Text>
            </Pressable>
          </View>
        )}

        {(phase === 'analyzing' || phase === 'submitting') && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.subText}>{phase === 'analyzing' ? 'AI is writing your update…' : 'Saving…'}</Text>
          </View>
        )}

        {phase === 'review' && draft && (
          <View>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />}
            <Text style={styles.sectionLabel}>Summary</Text>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              multiline
              value={draft.summary}
              onChangeText={(v) => setDraft({ ...draft, summary: v })}
            />
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Trade</Text>
                <TextInput style={styles.input} value={draft.trade} onChangeText={(v) => setDraft({ ...draft, trade: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Location</Text>
                <TextInput style={styles.input} value={draft.location} onChangeText={(v) => setDraft({ ...draft, location: v })} />
              </View>
            </View>
            <Text style={styles.sectionLabel}>Quantities</Text>
            <TextInput style={styles.input} value={draft.quantities} onChangeText={(v) => setDraft({ ...draft, quantities: v })} placeholder="e.g. 12 walls, 40 sheets" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.sectionLabel}>Flags for the office</Text>
            <TextInput style={styles.input} value={draft.flags} onChangeText={(v) => setDraft({ ...draft, flags: v })} placeholder="delays, blockers, materials needed" placeholderTextColor={colors.textTertiary} />

            <Pressable style={styles.primaryBtn} onPress={submit}>
              <Feather name="check" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>Post update</Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.center}>
            <Feather name="check-circle" size={48} color={colors.success} />
            <Text style={styles.bigText}>Posted to the timeline</Text>
          </View>
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
  center: { alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.md },

  bigText: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  subText: { color: colors.textSecondary, textAlign: 'center' },

  photo: { width: '100%', height: 220, borderRadius: radii.lg, marginBottom: spacing.md, backgroundColor: colors.border },
  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.surface,
  },
  row2: { flexDirection: 'row', gap: spacing.md },

  primaryBtn: {
    marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radii.lg,
    paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  secondaryBtn: { marginTop: spacing.sm, paddingVertical: spacing.md },
  secondaryBtnText: { color: colors.primary, fontWeight: typography.weights.medium },
  skip: { alignItems: 'center', marginTop: spacing.lg },
  skipText: { color: colors.textSecondary },
});
