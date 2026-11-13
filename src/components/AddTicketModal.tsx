/**
 * Add a ticket the easy way: take (or pick) a photo of it. That's it.
 *
 * Client feedback (Nov 2026): creating a ticket asked for certificate
 * number, issuer, issue date, expiry… nobody on site has that to hand.
 * The photo IS the record. Name and expiry are optional extras.
 *
 * Used by the worker (My Tickets — saved unverified until the office
 * confirms) and by the office (worker profile — saved verified).
 */

import { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput, ScrollView, Image, Switch, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import { db, storage } from '../lib/firebase';
import { notify, toast } from '../lib/notify';
import { colors, spacing, radii, typography, touch } from '../theme';

/** Open a ticket photo in a new tab / the system viewer. */
export async function openTicketPhoto(path?: string | null) {
  if (!path) return;
  try {
    const url = await getDownloadURL(ref(storage, path));
    await Linking.openURL(url);
  } catch {
    notify('Could not open the photo', 'Try again in a moment.');
  }
}

export function AddTicketModal({
  visible, onClose, onAdded, workerUid, byUid, verified,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
  /** Whose ticket this is. */
  workerUid: string;
  /** Who is adding it. */
  byUid: string;
  /** Office-added tickets count right away; self-added wait for the office. */
  verified: boolean;
}) {
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [name, setName] = useState('');
  const [expires, setExpires] = useState('');
  const [firstAid, setFirstAid] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() { setPhoto(null); setName(''); setExpires(''); setFirstAid(false); }

  async function pick(source: 'camera' | 'library') {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify('Permission needed', source === 'camera' ? 'Allow camera access to take the photo.' : 'Allow photo access to pick the picture.');
        return;
      }
      const res = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
      const asset = res.canceled ? null : res.assets?.[0];
      if (!asset?.base64) return;
      setPhoto({ uri: asset.uri, base64: asset.base64 });
    } catch (e) {
      notify('Could not get the photo', e instanceof Error ? e.message : String(e));
    }
  }

  async function save() {
    if (!photo) { notify('Add a photo', 'Take a picture of the ticket first.'); return; }
    let expiresMs: number | null = null;
    if (expires.trim()) {
      expiresMs = Date.parse(expires.trim());
      if (isNaN(expiresMs)) { notify('Check the date', 'Expiry should look like 2027-01-15 — or leave it empty.'); return; }
    }
    setSaving(true);
    try {
      const path = `users/${workerUid}/certifications/${Date.now()}.jpg`;
      await uploadString(ref(storage, path), photo.base64, 'base64', { contentType: 'image/jpeg' });
      const label = name.trim() || (firstAid ? 'First Aid' : 'Ticket');
      await addDoc(collection(db, 'users', workerUid, 'certifications'), {
        type: firstAid ? 'first-aid-level-1' : 'other',
        customName: firstAid ? null : label,
        displayName: label,
        issuer: '',
        certificateNumber: null,
        issuedAt: Date.now(),
        expiresAt: expiresMs,
        documentStoragePath: path,
        createdAt: Date.now(),
        createdBy: byUid,
        verified,
        ...(verified ? { verifiedBy: byUid, verifiedAt: Date.now() } : {}),
      });
      reset();
      toast('Ticket saved');
      onAdded();
    } catch (e) {
      notify('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => { reset(); onClose(); }} hitSlop={8} accessibilityLabel="Close">
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Add a ticket</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {photo ? (
            <View>
              <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" />
              <Pressable onPress={() => setPhoto(null)} style={styles.retake}>
                <Text style={styles.retakeText}>Use a different photo</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.lead}>Just take a picture of the ticket. Nothing else is needed.</Text>
              <Pressable style={styles.bigBtn} onPress={() => pick('camera')}>
                <Feather name="camera" size={22} color={colors.textInverse} />
                <Text style={styles.bigBtnText}>Take a photo</Text>
              </Pressable>
              <Pressable style={[styles.bigBtn, styles.bigBtnAlt]} onPress={() => pick('library')}>
                <Feather name="image" size={22} color={colors.primary} />
                <Text style={[styles.bigBtnText, { color: colors.primary }]}>Choose a picture</Text>
              </Pressable>
            </>
          )}

          {photo && (
            <>
              <Text style={styles.label}>What is it? (optional)</Text>
              <TextInput
                style={styles.input} value={name} onChangeText={setName}
                placeholder="e.g. Fall Arrest, WHMIS" placeholderTextColor={colors.textTertiary}
              />

              <Text style={styles.label}>Expiry date (optional)</Text>
              <TextInput
                style={styles.input} value={expires} onChangeText={setExpires}
                placeholder="2027-01-15" placeholderTextColor={colors.textTertiary}
                autoCapitalize="none" keyboardType="numbers-and-punctuation"
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>This is a First Aid ticket</Text>
                <Switch value={firstAid} onValueChange={setFirstAid} />
              </View>

              <Pressable style={[styles.bigBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.textInverse} /> : (
                  <>
                    <Feather name="check" size={22} color={colors.textInverse} />
                    <Text style={styles.bigBtnText}>Save ticket</Text>
                  </>
                )}
              </Pressable>
              {!verified && (
                <Text style={styles.note}>The office will take a quick look and confirm it.</Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  title: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  body: { padding: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  lead: { fontSize: typography.sizes.md, color: colors.textSecondary, marginBottom: spacing.sm },
  bigBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radii.md, minHeight: touch.primary,
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary,
  },
  bigBtnAlt: { backgroundColor: colors.surface },
  bigBtnText: { color: colors.textInverse, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  preview: { width: '100%', height: 260, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  retake: { alignSelf: 'center', padding: spacing.md },
  retakeText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  label: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    marginTop: spacing.lg, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typography.sizes.md, color: colors.text,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, minHeight: touch.min,
  },
  switchLabel: { fontSize: typography.sizes.md, color: colors.text },
  note: { marginTop: spacing.md, textAlign: 'center', color: colors.textSecondary, fontSize: typography.sizes.sm },
});
