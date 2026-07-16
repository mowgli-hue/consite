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
import { useT } from '../../src/contexts/I18nContext';
import { scanPhoto, type ScanResult } from '../../src/lib/ai';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Phase = 'capture' | 'scanning' | 'result' | 'saving' | 'done';

/** Where the photo will be filed. The AI proposes; the worker can change it. */
type Dest = 'safety' | 'materials' | 'progress';

const KIND_META = {
  progress: { icon: 'trending-up' as const, label: 'Work progress', color: colors.success },
  materials: { icon: 'package' as const, label: 'Materials', color: colors.primary },
  safety: { icon: 'alert-triangle' as const, label: 'Safety issue', color: colors.danger },
  other: { icon: 'camera' as const, label: 'Photo', color: colors.textSecondary },
};

/** Mirror of the filing logic: what the AI result files as by default. */
function defaultDest(scan: ScanResult): Dest {
  if (scan.kind === 'safety' || (scan.kind === 'other' && scan.safetyIssues.length > 0)) return 'safety';
  if (scan.kind === 'materials') return 'materials';
  return 'progress';
}

const DEST_META: Record<Dest, {
  chip: string; button: string; explain: string; icon: keyof typeof Feather.glyphMap;
}> = {
  safety: {
    chip: 'Safety issue', button: 'File as safety issue',
    explain: 'Files to the punch list — the office gets an alert.', icon: 'alert-triangle',
  },
  materials: {
    chip: 'Materials', button: 'Save material count',
    explain: 'Saves to the project’s material counts.', icon: 'package',
  },
  progress: {
    chip: 'Timeline', button: 'Post to timeline',
    explain: 'Posts to the site timeline for the office.', icon: 'trending-up',
  },
};

export default function ScanScreen() {
  const { projectId: pidParam } = useLocalSearchParams<{ projectId?: string }>();
  const { user } = useAuth();
  const { t } = useT();
  const projectId = pidParam && pidParam !== 'sample-project-1' ? pidParam : user?.projectIds?.[0];

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [dest, setDest] = useState<Dest>('progress');

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
      setDest(defaultDest(r)); // AI proposes; the worker can change it below
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
      if (dest === 'safety') {
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
      } else if (dest === 'materials') {
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
        {phase === 'capture' && !projectId && (
          <View style={styles.center}>
            <View style={styles.bigIcon}><Feather name="briefcase" size={44} color={colors.textTertiary} /></View>
            <Text style={styles.bigText}>{t('No projects assigned')}</Text>
            <Text style={styles.subText}>{t('Ask your admin to add you to a project.')}</Text>
          </View>
        )}

        {phase === 'capture' && !!projectId && (
          <View style={styles.center}>
            <View style={styles.bigIcon}><Feather name="camera" size={44} color={colors.primary} /></View>
            <Text style={styles.bigText}>{t('Point. Shoot. Done.')}</Text>
            <Text style={styles.subText}>
              Work progress, a pile of lumber, a hazard — the AI figures out what it's
              looking at and files it in the right place.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => shoot(true)}>
              <Feather name="camera" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>{t('Scan')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => shoot(false)}>
              <Text style={styles.secondaryBtnText}>{t('Choose from library')}</Text>
            </Pressable>
          </View>
        )}

        {(phase === 'scanning' || phase === 'saving') && (
          <View style={styles.center}>
            {imageUri && <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />}
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.subText}>{phase === 'scanning' ? t('AI is reading the photo…') : t('Filing it…')}</Text>
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

            {/* Where it goes — AI's pick, one tap to change. App computes, worker confirms. */}
            <Text style={styles.destPrompt}>{t('Wrong category? Tap to change:')}</Text>
            <View style={styles.destRow}>
              {(Object.keys(DEST_META) as Dest[]).map((d) => {
                const on = dest === d;
                return (
                  <Pressable
                    key={d}
                    style={[styles.destChip, on && styles.destChipOn]}
                    onPress={() => setDest(d)}
                  >
                    <Feather name={DEST_META[d].icon} size={13} color={on ? colors.textInverse : colors.textSecondary} />
                    <Text style={[styles.destChipText, on && styles.destChipTextOn]}>{t(DEST_META[d].chip)}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.destExplain}>{t(DEST_META[dest].explain)}</Text>

            <Pressable style={styles.primaryBtn} onPress={fileIt}>
              <Feather name="check" size={18} color={colors.textInverse} />
              <Text style={styles.primaryBtnText}>{t(DEST_META[dest].button)}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setPhase('capture')}>
              <Text style={styles.secondaryBtnText}>{t('Rescan')}</Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.center}>
            <Feather name="check-circle" size={48} color={colors.success} />
            <Text style={styles.bigText}>{t('Filed.')}</Text>
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

  destPrompt: { marginTop: spacing.lg, color: colors.textSecondary, fontSize: typography.sizes.xs },
  destRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  destChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface,
  },
  destChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  destChipText: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.medium },
  destChipTextOn: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  destExplain: { marginTop: spacing.sm, fontSize: typography.sizes.xs, color: colors.textTertiary },

  primaryBtn: {
    marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: radii.lg,
    paddingVertical: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    alignSelf: 'stretch',
  },
  primaryBtnText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  secondaryBtn: { marginTop: spacing.sm, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryBtnText: { color: colors.primary, fontWeight: typography.weights.medium },
});
