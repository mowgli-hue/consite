/**
 * Drawing viewer + pin-tasks. "Google Maps for the job site", v0:
 *
 *  - everyone: see the drawing with colored pins, tap a pin for details
 *  - foreman: tap an empty spot → drop a pin → instruction + assignee
 *  - assigned worker: open their pin → complete with photo + note
 *  - foreman: accept completed work
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { DrawingPin, User } from '../../src/types';

export default function DrawingScreen() {
  const { projectId, planId } = useLocalSearchParams<{ projectId: string; planId: string }>();
  const { user } = useAuth();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [pins, setPins] = useState<DrawingPin[]>([]);
  const [isForeman, setIsForeman] = useState(false);
  const [members, setMembers] = useState<Array<{ uid: string; name: string }>>([]);
  const [imgBox, setImgBox] = useState({ w: 0, h: 0 });

  // New-pin flow
  const [newPin, setNewPin] = useState<{ x: number; y: number } | null>(null);
  const [instruction, setInstruction] = useState('');
  const [pinType, setPinType] = useState<'task' | 'issue'>('task');
  const [assignee, setAssignee] = useState<{ uid: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Pin detail
  const [selected, setSelected] = useState<DrawingPin | null>(null);
  const [completionNote, setCompletionNote] = useState('');

  useEffect(() => {
    if (!projectId || !planId || !user) return;
    (async () => {
      try {
        const [plan, member] = await Promise.all([
          getDoc(doc(db, 'projects', projectId, 'plans', planId)),
          getDoc(doc(db, 'projects', projectId, 'members', user.uid)),
        ]);
        setPlanName(plan.data()?.name ?? 'Drawing');
        const p = plan.data();
        if (p?.storagePath) setImageUrl(await getDownloadURL(ref(storage, p.storagePath)));
        const role = member.data()?.role;
        setIsForeman(user.role === 'admin' || ['foreman', 'lead-foreman', 'supervisor'].includes(role));
      } catch (err: any) { notify('Could not load drawing', err.message); }
      try {
        // Assignable crew: project member list via parent doc's memberUids + user names
        const proj = await getDoc(doc(db, 'projects', projectId));
        const uids: string[] = proj.data()?.memberUids ?? [];
        const named = await Promise.all(uids.map(async (u) => {
          try {
            const m = await getDoc(doc(db, 'projects', projectId, 'members', u));
            return { uid: u, name: (m.data() as any)?.displayName ?? u.slice(0, 8) };
          } catch { return { uid: u, name: u.slice(0, 8) }; }
        }));
        setMembers(named);
      } catch { /* assignment picker just shows fewer names */ }
    })();

    const unsub = onSnapshot(
      query(collection(db, 'projects', projectId, 'plans', planId, 'pins'), orderBy('createdAt', 'desc')),
      (snap) => setPins(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    );
    return unsub;
  }, [projectId, planId, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const onImagePress = useCallback((evt: any) => {
    if (!isForeman || imgBox.w === 0) return;
    const { locationX, locationY } = evt.nativeEvent;
    setNewPin({ x: locationX / imgBox.w, y: locationY / imgBox.h });
    setInstruction('');
    setAssignee(null);
    setPinType('task');
  }, [isForeman, imgBox]);

  async function createPin() {
    if (!newPin || !user || !projectId || !planId) return;
    if (!instruction.trim()) { notify('Missing instruction', 'Say what needs to be done here.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'plans', planId, 'pins'), {
        planId, projectId,
        x: newPin.x, y: newPin.y,
        type: pinType,
        instruction: instruction.trim(),
        assigneeUid: assignee?.uid ?? null,
        assigneeName: assignee?.name ?? null,
        status: 'open',
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: Date.now(),
      });
      setNewPin(null);
    } catch (err: any) { notify('Pin failed', err.message); }
    finally { setBusy(false); }
  }

  async function completePin(withPhoto: boolean) {
    if (!selected || !user || !projectId || !planId) return;
    setBusy(true);
    try {
      let completionPhotoPath: string | null = null;
      if (withPhoto) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status === 'granted') {
          const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
          if (!result.canceled && result.assets[0]) {
            const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
            completionPhotoPath = `projects/${projectId}/media/pin-${selected.id}/done.jpg`;
            await uploadString(ref(storage, completionPhotoPath), b64, 'base64', { contentType: 'image/jpeg' });
          }
        }
      }
      await updateDoc(doc(db, 'projects', projectId, 'plans', planId, 'pins', selected.id), {
        status: 'done',
        completedAt: Date.now(),
        completionNote: completionNote.trim() || null,
        ...(completionPhotoPath ? { completionPhotoPath } : {}),
      });
      setSelected(null);
      setCompletionNote('');
    } catch (err: any) { notify('Could not complete', err.message); }
    finally { setBusy(false); }
  }

  async function acceptPin() {
    if (!selected || !user || !projectId || !planId) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'plans', planId, 'pins', selected.id), {
        status: 'accepted',
        acceptedBy: user.uid,
      });
      setSelected(null);
    } catch (err: any) { notify('Accept failed', err.message); }
    finally { setBusy(false); }
  }

  const pinColor = (p: DrawingPin) =>
    p.status === 'accepted' ? colors.success
    : p.status === 'done' ? colors.primary
    : p.type === 'issue' ? colors.danger
    : colors.warning;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{planName}</Text>
        <View style={{ width: 22 }} />
      </View>

      {isForeman && (
        <Text style={styles.hint}>Tap anywhere on the drawing to pin a task or issue.</Text>
      )}

      <ScrollView contentContainerStyle={styles.scroll} maximumZoomScale={3}>
        {!imageUrl ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : (
          <Pressable
            onPress={onImagePress}
            onLayout={(e) => setImgBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            style={styles.imageWrap}
          >
            <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
            {imgBox.w > 0 && pins.map((p) => (
              <Pressable
                key={p.id}
                style={[styles.pin, {
                  left: p.x * imgBox.w - 14, top: p.y * imgBox.h - 28,
                }]}
                onPress={() => { setSelected(p); setCompletionNote(''); }}
                hitSlop={6}
              >
                <Feather name="map-pin" size={28} color={pinColor(p)} />
              </Pressable>
            ))}
          </Pressable>
        )}

        <View style={styles.legend}>
          <Legend color={colors.warning} label="Task" />
          <Legend color={colors.danger} label="Issue" />
          <Legend color={colors.primary} label="Done" />
          <Legend color={colors.success} label="Accepted" />
        </View>
      </ScrollView>

      {/* New pin modal */}
      <Modal visible={!!newPin} animationType="slide" transparent onRequestClose={() => setNewPin(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New pin</Text>
            <View style={styles.typeRow}>
              {(['task', 'issue'] as const).map((t) => (
                <Pressable key={t} style={[styles.typeChip, pinType === t && styles.typeChipOn]} onPress={() => setPinType(t)}>
                  <Text style={[styles.typeChipText, pinType === t && styles.typeChipTextOn]}>
                    {t === 'task' ? '📌 Task' : '⚠ Issue'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, { minHeight: 70 }]}
              multiline
              placeholder='What needs to happen here? e.g. "Install beam per detail 5, double top plate"'
              placeholderTextColor={colors.textTertiary}
              value={instruction}
              onChangeText={setInstruction}
            />
            <Text style={styles.label}>Assign to</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {members.map((m) => (
                <Pressable
                  key={m.uid}
                  style={[styles.assigneeChip, assignee?.uid === m.uid && styles.typeChipOn]}
                  onPress={() => setAssignee(assignee?.uid === m.uid ? null : m)}
                >
                  <Text style={[styles.typeChipText, assignee?.uid === m.uid && styles.typeChipTextOn]}>{m.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable style={styles.cancelBtn} onPress={() => setNewPin(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={createPin}>
                {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveText}>Drop pin</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pin detail modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          {selected && (
            <View style={styles.modalCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Feather name="map-pin" size={20} color={pinColor(selected)} />
                <Text style={styles.modalTitle}>
                  {selected.type === 'issue' ? 'Issue' : 'Task'} · {selected.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.instructionText}>{selected.instruction}</Text>
              <Text style={styles.metaText}>
                {selected.assigneeName ? `Assigned to ${selected.assigneeName}` : 'Unassigned'}
                {' · by '}{selected.createdByName ?? 'foreman'}
                {' · '}{new Date(selected.createdAt).toLocaleDateString()}
              </Text>
              {!!selected.completionNote && (
                <Text style={styles.completionText}>Done: {selected.completionNote}</Text>
              )}

              {selected.status === 'open' && selected.assigneeUid === user?.uid && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="What did you do? (optional)"
                    placeholderTextColor={colors.textTertiary}
                    value={completionNote}
                    onChangeText={setCompletionNote}
                  />
                  <View style={styles.modalBtns}>
                    <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => completePin(true)}>
                      <Text style={styles.saveText}>📷 Done + photo</Text>
                    </Pressable>
                    <Pressable style={[styles.cancelBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => completePin(false)}>
                      <Text style={styles.cancelText}>Done, no photo</Text>
                    </Pressable>
                  </View>
                </>
              )}

              {selected.status === 'done' && isForeman && (
                <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }, { marginTop: spacing.md }]} disabled={busy} onPress={acceptPin}>
                  <Text style={styles.saveText}>✓ Accept work</Text>
                </Pressable>
              )}

              <Pressable style={{ alignItems: 'center', marginTop: spacing.md }} onPress={() => setSelected(null)}>
                <Text style={styles.cancelText}>Close</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Feather name="map-pin" size={14} color={color} />
      <Text style={{ color: colors.textSecondary, fontSize: typography.sizes.xs }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  hint: { textAlign: 'center', color: colors.textSecondary, fontSize: typography.sizes.xs, paddingVertical: spacing.sm },
  scroll: { padding: spacing.md, paddingBottom: spacing['3xl'] },

  imageWrap: { width: '100%', aspectRatio: 0.8, backgroundColor: '#fff', borderRadius: radii.md, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  pin: { position: 'absolute' },

  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    padding: spacing.xl, gap: spacing.sm, ...shadows.card,
  },
  modalTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  instructionText: { color: colors.text, fontSize: typography.sizes.md, lineHeight: 21, marginTop: spacing.sm },
  metaText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  completionText: { color: colors.success, fontSize: typography.sizes.sm, marginTop: spacing.xs },

  typeRow: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  typeChipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  typeChipText: { color: colors.textSecondary },
  typeChipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },
  assigneeChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
  },
  label: { color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.background, marginTop: spacing.sm,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  saveBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  saveText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  cancelText: { color: colors.textSecondary, fontWeight: typography.weights.medium },
});
