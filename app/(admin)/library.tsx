/**
 * Admin → Forms & Documents. The office window into the paperwork library:
 * every form the crews can fill, every company document in workers' pockets.
 * Upload new documents from the desktop (web file picker).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify, confirm } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type FormRow = { id: string; title: string; category?: string; version?: number; archived?: boolean; sections?: number; fields?: number };
type DocRow = { id: string; title: string; storagePath?: string; url?: string };

const CATEGORY_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  flha: 'shield', inspection: 'check-square', toolbox: 'tool', incident: 'alert-triangle', custom: 'clipboard',
};

export default function LibraryScreen() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const f = await getDocs(collection(db, 'forms'));
      setForms(f.docs.map((d) => {
        const a = d.data() as any;
        const sections = (a.sections ?? []) as Array<{ fields?: unknown[] }>;
        return {
          id: d.id, title: a.title ?? d.id, category: a.category, version: a.version,
          archived: a.archived === true,
          sections: sections.length,
          fields: sections.reduce((n, s) => n + (s.fields?.length ?? 0), 0),
        };
      }).sort((a, b) => Number(a.archived) - Number(b.archived) || a.title.localeCompare(b.title)));
    } catch (err: any) { notify('Could not load forms', err.message); setForms([]); }
    try {
      const t = await getDocs(collection(db, 'templates'));
      setDocs(t.docs.map((d) => ({
        id: d.id,
        title: (d.data() as any).title ?? (d.data() as any).name ?? d.id,
        storagePath: (d.data() as any).storagePath,
        url: (d.data() as any).url,
      })));
    } catch { setDocs([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openDoc(d: DocRow) {
    try {
      const url = d.url ?? (d.storagePath ? await getDownloadURL(ref(storage, d.storagePath)) : null);
      if (!url) { notify(d.title, 'No file attached.'); return; }
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank');
      else Linking.openURL(url);
    } catch (err: any) { notify('Could not open', err.message); }
  }

  async function toggleArchive(f: FormRow) {
    try {
      await updateDoc(doc(db, 'forms', f.id), { archived: !f.archived, updatedAt: Date.now() });
      await load();
    } catch (err: any) { notify('Update failed', err.message); }
  }

  /** Web-only PDF upload — the office works on a desktop. */
  function uploadDocument() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      notify('Desktop only', 'Upload documents from the office dashboard in a browser.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) { notify('Too large', 'Keep documents under 20 MB.'); return; }
      setUploading(true);
      try {
        const b64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1] ?? '');
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const id = `doc-${Date.now()}`;
        const storagePath = `templates/${id}/document.pdf`;
        await uploadString(ref(storage, storagePath), b64, 'base64', { contentType: 'application/pdf' });
        await setDoc(doc(db, 'templates', id), {
          title: file.name.replace(/\.pdf$/i, ''),
          storagePath,
          uploadedAt: Date.now(),
          uploadedBy: me?.uid,
        });
        await load();
        notify('Uploaded', 'The document is now in every worker’s Safety Documents.');
      } catch (err: any) { notify('Upload failed', err.message); }
      finally { setUploading(false); }
    };
    input.click();
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Forms & Documents</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionLabel}>Forms crews can fill ({(forms ?? []).filter((f) => !f.archived).length} active)</Text>
        {forms === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          forms.map((f) => (
            <View key={f.id} style={[styles.card, f.archived && { opacity: 0.55 }]}>
              <View style={styles.iconWrap}>
                <Feather name={CATEGORY_ICON[f.category ?? 'custom'] ?? 'clipboard'} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{f.title}{f.archived ? '  · ARCHIVED' : ''}</Text>
                <Text style={styles.sub}>
                  {f.category ?? 'custom'} · v{f.version ?? 1} · {f.sections} section{f.sections === 1 ? '' : 's'}, {f.fields} fields
                </Text>
              </View>
              {isAdmin && (
                <Pressable
                  hitSlop={8}
                  onPress={() =>
                    f.archived
                      ? toggleArchive(f)
                      : confirm('Archive form?', `${f.title} will disappear from the crews' Forms list. Past submissions stay.`, () => toggleArchive(f), 'Archive')
                  }
                >
                  <Feather name={f.archived ? 'rotate-ccw' : 'archive'} size={18} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
          ))
        )}

        <View style={styles.docsHeaderRow}>
          <Text style={styles.sectionLabel}>Company documents (workers’ Safety Documents)</Text>
          {isAdmin && (
            <Pressable style={[styles.uploadBtn, uploading && { opacity: 0.6 }]} disabled={uploading} onPress={uploadDocument}>
              {uploading ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Feather name="upload" size={14} color={colors.textInverse} />}
              <Text style={styles.uploadText}>Upload PDF</Text>
            </Pressable>
          )}
        </View>
        {docs === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : docs.length === 0 ? (
          <Text style={styles.emptyText}>No documents yet — upload the safety manual, policies, procedures.</Text>
        ) : (
          docs.map((d) => (
            <Pressable key={d.id} style={styles.card} onPress={() => openDoc(d)}>
              <View style={styles.iconWrap}>
                <Feather name="file-text" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.title, { flex: 1 }]}>{d.title}</Text>
              <Feather name="external-link" size={16} color={colors.textTertiary} />
            </Pressable>
          ))
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 760, width: '100%', alignSelf: 'center' },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm, flex: 1,
  },
  docsHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  uploadText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.xs },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.xs, ...shadows.card,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },
  emptyText: { color: colors.textTertiary },
});
