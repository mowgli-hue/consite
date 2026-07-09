/**
 * Site Drawings — list per project; foremen photograph/upload new ones.
 * Tap a drawing → pin-task viewer.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ref, uploadString } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type PlanRow = { id: string; name: string; openPins: number };

export default function DrawingsScreen() {
  const { projectId: projectIdParam } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuth();
  // Sidebar opens this without params — default to the worker's first site.
  const projectId = projectIdParam && projectIdParam !== 'sample-project-1'
    ? projectIdParam
    : user?.projectIds?.[0] ?? projectIdParam;
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [isForeman, setIsForeman] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingB64, setPendingB64] = useState<string | null>(null);
  const [drawingName, setDrawingName] = useState('');

  const load = useCallback(async () => {
    if (!projectId || !user) return;
    try {
      const member = await getDoc(doc(db, 'projects', projectId, 'members', user.uid));
      const role = member.data()?.role;
      setIsForeman(user.role === 'admin' || ['foreman', 'lead-foreman', 'supervisor'].includes(role));
    } catch { /* stays worker view */ }
    try {
      const snap = await getDocs(query(collection(db, 'projects', projectId, 'plans'), orderBy('uploadedAt', 'desc')));
      const rows: PlanRow[] = await Promise.all(snap.docs.map(async (d) => {
        let openPins = 0;
        try {
          const pins = await getDocs(collection(db, 'projects', projectId, 'plans', d.id, 'pins'));
          openPins = pins.docs.filter((p) => (p.data() as any).status === 'open').length;
        } catch { /* count stays 0 */ }
        return { id: d.id, name: (d.data() as any).name ?? 'Drawing', openPins };
      }));
      setPlans(rows);
    } catch (err: any) {
      notify('Could not load drawings', err.message);
      setPlans([]);
    }
  }, [projectId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function upload(fromCamera: boolean) {
    if (!projectId || !user) return;
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { notify('Permission needed', 'Camera / photos access required.'); return; }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      // Ask for a proper name before anything uploads — "Drawing 2026-07-09"
      // helps nobody find the 2nd-floor framing plan later.
      setPendingB64(b64);
      setDrawingName('');
    } catch (err: any) {
      notify('Photo error', err.message);
    }
  }

  async function confirmUpload() {
    if (!pendingB64 || !projectId || !user) return;
    if (!drawingName.trim()) {
      notify('Name the drawing', 'e.g. "Building B — 2nd floor framing plan"');
      return;
    }
    setUploading(true);
    try {
      const planRef = await addDoc(collection(db, 'projects', projectId, 'plans'), {
        projectId,
        name: drawingName.trim(),
        storagePath: null,
        fileType: 'image',
        version: 1,
        uploadedBy: user.uid,
        uploadedAt: Date.now(),
      });
      const storagePath = `projects/${projectId}/plans/${planRef.id}/drawing.jpg`;
      await uploadString(ref(storage, storagePath), pendingB64, 'base64', { contentType: 'image/jpeg' });
      await updateDoc(planRef, { storagePath });
      setPendingB64(null);
      await load();
      router.push(`/drawing?projectId=${projectId}&planId=${planRef.id}` as any);
    } catch (err: any) {
      notify('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Site Drawings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isForeman && (
          <View style={styles.uploadRow}>
            <Pressable style={[styles.uploadBtn, uploading && { opacity: 0.5 }]} disabled={uploading} onPress={() => upload(true)}>
              {uploading ? <ActivityIndicator color={colors.textInverse} /> : (
                <>
                  <Feather name="camera" size={16} color={colors.textInverse} />
                  <Text style={styles.uploadText}>Photograph drawing</Text>
                </>
              )}
            </Pressable>
            <Pressable style={styles.uploadBtnAlt} disabled={uploading} onPress={() => upload(false)}>
              <Feather name="upload" size={16} color={colors.primary} />
            </Pressable>
          </View>
        )}

        {plans === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : plans.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No drawings yet</Text>
            <Text style={styles.emptySub}>
              {isForeman
                ? 'Photograph the site drawing — then pin tasks right on it.'
                : 'Your foreman hasn’t uploaded drawings for this site yet.'}
            </Text>
          </View>
        ) : (
          plans.map((p) => (
            <Pressable
              key={p.id}
              style={styles.card}
              onPress={() => router.push(`/drawing?projectId=${projectId}&planId=${p.id}` as any)}
            >
              <Feather name="map" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.sub}>{p.openPins > 0 ? `${p.openPins} open pin${p.openPins === 1 ? '' : 's'}` : 'No open pins'}</Text>
              </View>
              {p.openPins > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{p.openPins}</Text></View>
              )}
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Name-the-drawing modal — shown after photo/pick, before upload */}
      <Modal visible={!!pendingB64} animationType="slide" transparent onRequestClose={() => setPendingB64(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Name this drawing</Text>
            <Text style={styles.modalSub}>So the crew can find it — building, floor, what it shows.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder='e.g. "Building B — 2nd floor framing plan"'
              placeholderTextColor={colors.textTertiary}
              value={drawingName}
              onChangeText={setDrawingName}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setPendingB64(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, uploading && { opacity: 0.5 }]} disabled={uploading} onPress={confirmUpload}>
                {uploading ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveText}>Upload</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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

  uploadRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  uploadBtn: {
    flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md,
  },
  uploadText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  uploadBtnAlt: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md,
  },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.card,
  },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },
  badge: {
    minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.warning,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    padding: spacing.xl, gap: spacing.sm,
  },
  modalTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  modalSub: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.background, marginTop: spacing.sm,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  saveBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontWeight: typography.weights.medium },
});
