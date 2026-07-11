/**
 * AI Scan — the AI Camera from the v3 vision, v1.
 * One button: shoot. The AI classifies what it sees (work progress /
 * materials / safety hazard), extracts everything, and files it with
 * one tap: progress → work log · materials → material count ·
 * safety → deficiency. No folders, no naming, no forms.
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { scanPhoto, type ScanResult } from '../../src/lib/ai';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Phase = 'capture' | 'scanning' | 'result' | 'saving' | 'done';

const KIND_META = {
  progress: { icon: 'trending-up' as const, label: 'Work progress', color: colors.success },
  materials: { icon: 'package' as const, label: 'Materials', color: colors.primary },
  safety: { icon: 'alert-triangle' as const, label: 'Safety issue', color: colors.danger },
  other: { icon: 'camera' as const, label: 'Photo', color: colors.textSecondary },
};

export default function ScanScreen() {
  const { projectId: pidParam } = useLocalSearchParams<{ projectId?: string }>();
  const { user } = useAuth();
  const projectId = pidParam && pidParam !== 'sample-project-1' ? pidParam : user?.projectIds?.[0];

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);

  async function shoot(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { notify('Permission needed', 'Camera access required.'); return; }
    // base64:true → the picker hands us the data directly. No file-system
    // round-trip, works identically on phones and web.
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setPhase('scanning');
    try {
      const b64 = asset.base64;
      if (!b64) throw new Error('Could not read the photo from the camera — try again.');
      if (b64.length > 4_800_000) throw new Error('Photo too large for analysis — try again (it will auto-compress).');
      setImageBase64(b64);
      const r = await scanPhoto({ imageBase64: b64, imageMediaType: 'image/jpeg' });
      setScan(r);
      setPhase('result');
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      notify(
        'Scan failed',
        msg.includes('not-found') || msg.includes('NOT_FOUND')
          ? 'The AI scan service isn’t deployed yet — run: firebase deploy --only functions'
          : msg || 'Try again.',
      );
      setPhase('capture');
    }
  }

  async function uploadPhoto(pathPrefix: string): Promise<string> {
    const photoPath = `projects/${projectId}/media/${pathPrefix}-${Date.now()}/photo.jpg`;
    await uploadString(ref(storage, photoPath), imageBase64!, 'base64', { contentType: 'image/jpeg' });
    return photoPath;
  }

  async function fileIt() {
    if (!scan || !user || !projectId || !imageBase64) return;
    setPhase('saving');
    try {
      if (scan.kind === 'safety' || scan.safetyIssues.length > 0 && scan.kind === 'other') {
        // → deficiency (punch list + office alert via existing trigger)
        await addDoc(collection(db, 'projects', projectId, 'deficiencies'), {
          title: scan.safetyIssues[0] ?? scan.summary.slice(0, 80),
          description: `${scan.summary}${scan.safetyIssues.length ? `\nHazards: ${scan.safetyIssues.join('; ')}` : ''}`,
          trade: scan.trade,
          severity: 'safety-critical',
          recommendedAction: 'Address the hazard before work continues.',
          confidence: scan.confidence,
          photoUri: null,
          photoPath: await uploadPhoto('scan-safety'),
          status: 'open',
          reportedBy: user.uid,
          reportedAt: serverTimestamp(),
          aiAssisted: true,
        });
      } else if (scan.kind === 'materials') {
        // → material count
        await addDoc(collection(db, 'projects', projectId, 'materialCounts'), {
          items: scan.materials,
          summary: scan.summary,
          location: scan.location,
          photoPath: await uploadPhoto('scan-materials'),
          countedBy: user.uid,
          countedByName: user.displayName,
          createdAt: serverTimestamp(),
          aiAssisted: true,
        });
      } else {
        // → work log (timeline)
        const docRef = await addDoc(collection(db, 'projects', projectId, 'workLog'), {
          summary: scan.summary,
          trade: scan.trade,
          location: scan.location,
          quantities: scan.materials.map((m) => `${m.quantity} ${m.item}`).join(', '),
          flags: scan.safetyIssues.join('; '),
          progressPct: scan.progressPct,
          confidence: scan.confidence,
          uid: user.uid,
          displayName: user.displayName,
          createdAt: serverTimestamp(),
          photoPath: null,
          aiAssisted: true,
        });
        await updateDoc(docRef, { photoPath: await uploadPhoto(`worklog-${docRef.id}`) });
      }
      setPhase('done');
      setTimeout(() => router.back(), 1200);
    } catch (err: any) {
      notify('Save failed', err.message);
      setPhase('result');
    }
  }

  const meta = scan ? KIND_META[scan.kind] : KIND_META.other;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>AI Scan</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {phase === 'capture' && (
          <View style={styles.center}>
            <View style={styles.bigIcon}><Feather name="camera" size={44} color={colors.primary} /></View>
            <Text style={styles.bigText}>Point. Shoot. Done.</Text>
            <Text style={styles.subText}>
              Work progress, a pile of lumber, a hazard — the AI figures out what it's
              looking at and files it in the right place.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => shoot(true)}>
              <Feather name="camera" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>Scan</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => shoot(false)}>
              <Text style={styles.secondaryBtnText}>Choose from library</Text>
            </Pressable>
          </View>
        )}

        {(phase === 'scanning' || phase === 'saving') && (
          <View style={styles.center}>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />}
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.subText}>{phase === 'scanning' ? 'AI is reading the photo…' : 'Filing it…'}</Text>
          </View>
        )}

        {phase === 'result' && scan && (
          <View>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />}

            <View style={[styles.kindBadge, { borderColor: meta.color }]}>
              <Feather name={meta.icon} size={16} color={meta.color} />
              <Text style={[styles.kindText, { color: meta.color }]}>{meta.label}</Text>
              {scan.progressPct != null && (
                <Text style={[styles.kindText, { color: meta.color }]}>· ~{scan.progressPct}% complete</Text>
              )}
            </View>

            <Text style={styles.summary}>{scan.summary}</Text>
            <Text style={styles.metaLine}>
              {scan.trade}{scan.location !== 'unspecified' ? ` · ${scan.location}` : ''}
            </Text>

            {scan.materials.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Counted</Text>
                {scan.materials.map((m, i) => (
                  <Text key={i} style={styles.cardLine}>• {m.quantity} {m.item}</Text>
                ))}
              </View>
            )}

            {scan.safetyIssues.length > 0 && (
              <View style={[styles.card, { borderColor: colors.danger }]}>
                <Text style={[styles.cardTitle, { color: colors.danger }]}>Safety flags</Text>
                {scan.safetyIssues.map((s, i) => (
                  <Text key={i} style={styles.cardLine}>⚠ {s}</Text>
                ))}
              </View>
            )}

            <Pressable style={styles.primaryBtn} onPress={fileIt}>
              <Feather name="check" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>
                {scan.kind === 'safety' ? 'File as safety issue' : scan.kind === 'materials' ? 'Save material count' : 'Post to timeline'}
              </Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setPhase('capture')}>
              <Text style={styles.secondaryBtnText}>Rescan</Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.center}>
            <Feather name="check-circle" size={48} color={colors.success} />
            <Text style={styles.bigText}>Filed.</Text>
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

  bigIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  bigText: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  subText: { color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg },

  photo: { width: '100%', height: 220, borderRadius: radii.lg, marginBottom: spacing.md, backgroundColor: colors.border },

  kindBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start',
    borderWidth: 1.5, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  kindText: { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm },
  summary: { color: colors.text, fontSize: typography.sizes.md, lineHeight: 22 },
  metaLine: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, marginTop: spacing.md, ...shadows.card,
  },
  cardTitle: { fontWeight: typography.weights.bold, color: colors.text, marginBottom: spacing.xs },
  cardLine: { color: colors.text, fontSize: typography.sizes.sm, lineHeight: 21 },

  primaryBtn: {
    marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radii.lg,
    paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  secondaryBtn: { marginTop: spacing.sm, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryBtnText: { color: colors.primary, fontWeight: typography.weights.medium },
});
