/**
 * Project Hub tabs — Viewpoint-Team-style navigation INSIDE a project
 * (requested by Brown Bros): Photos · Documents · Forms · Punch List ·
 * Daily Logs · Crew, each one tap from the project screen.
 *
 * Every tab is a read over collections the app already writes — no new
 * data model. Tabs load on demand, tolerate missing permissions, and
 * link out to the PDF/photo in Storage where one exists.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Image, Linking, Platform, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { notify } from '../lib/notify';
import { tsToMs } from '../lib/attendance';
import type { Project } from '../types';
import { colors, spacing, radii, typography, shadows } from '../theme';

/** Web-only file picker → base64. The office adds photos/drawings from desktop. */
function pickFileWeb(accept: string): Promise<{ name: string; base64: string; mime: string } | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, base64: String(r.result).split(',')[1] ?? '', mime: file.type || 'application/octet-stream' });
      r.onerror = () => resolve(null);
      r.readAsDataURL(file);
    };
    input.click();
  });
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.addBtn} onPress={onPress}>
      <Feather name="plus" size={16} color={colors.primary} />
      <Text style={styles.addBtnText}>{label}</Text>
    </Pressable>
  );
}

export type HubTab = 'lifecycle' | 'photos' | 'docs' | 'forms' | 'punch' | 'logs' | 'crew';

export const HUB_TABS: Array<{ id: HubTab; label: string; icon: keyof typeof Feather.glyphMap }> = [
  { id: 'lifecycle', label: 'Lifecycle', icon: 'git-commit' },
  { id: 'photos', label: 'Photos', icon: 'image' },
  { id: 'docs', label: 'Documents', icon: 'folder' },
  { id: 'forms', label: 'Forms', icon: 'clipboard' },
  { id: 'punch', label: 'Punch List', icon: 'alert-triangle' },
  { id: 'logs', label: 'Daily Logs', icon: 'book-open' },
  { id: 'crew', label: 'Crew', icon: 'users' },
];

export function HubTabBar({ active, onChange }: { active: HubTab; onChange: (t: HubTab) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
      {HUB_TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <Pressable key={tab.id} style={[styles.tab, on && styles.tabOn]} onPress={() => onChange(tab.id)}>
            <Feather name={tab.icon} size={14} color={on ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function fmtWhen(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) +
    ' ' + new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function openStoragePath(path?: string | null, url?: string | null) {
  try {
    const u = url ?? (path ? await getDownloadURL(ref(storage, path)) : null);
    if (u) Linking.openURL(u);
    else notify('No file', 'Nothing attached here yet.');
  } catch (e) {
    notify('Could not open', e instanceof Error ? e.message : String(e));
  }
}

/* ── Photos ───────────────────────────────────────────── */

interface Photo { id: string; url?: string; caption: string; by?: string; atMs?: number }

export function PhotosTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function addPhoto() {
    const f = await pickFileWeb('image/*');
    if (!f) { notify('Desktop only', 'Add photos here from a desktop browser — crews add them with AI Scan and Work Update on the phone.'); return; }
    setBusy(true);
    try {
      const storagePath = `projects/${projectId}/media/office-${Date.now()}/${f.name.replace(/[^\w.-]+/g, '_')}`;
      await uploadString(ref(storage, storagePath), f.base64, 'base64', { contentType: f.mime });
      await addDoc(collection(db, 'projects', projectId, 'media'), {
        projectId, storagePath, type: 'image',
        caption: f.name, uploadedBy: user?.uid ?? 'office', uploadedAt: Date.now(),
      });
      await load();
    } catch (e) { notify('Upload failed', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const load = useCallback(async () => {
    const out: Photo[] = [];
    // Site media (AI scan, uploads) + work-log photos, newest first.
    try {
      const snap = await getDocs(query(collection(db, 'projects', projectId, 'media'), limit(60)));
      for (const d of snap.docs) {
        const a = d.data() as { storagePath?: string; caption?: string; uploadedBy?: string; uploadedAt?: unknown };
        out.push({ id: `m-${d.id}`, caption: a.caption ?? 'Site photo', by: a.uploadedBy, atMs: tsToMs(a.uploadedAt) ?? (a.uploadedAt as number | undefined), url: a.storagePath ? await getDownloadURL(ref(storage, a.storagePath)).catch(() => undefined) : undefined });
      }
    } catch { /* fine */ }
    try {
      const snap = await getDocs(query(collection(db, 'projects', projectId, 'workLog'), orderBy('createdAt', 'desc'), limit(40)));
      for (const d of snap.docs) {
        const a = d.data() as { photoPath?: string; summary?: string; displayName?: string; createdAt?: unknown };
        if (!a.photoPath) continue;
        out.push({ id: `w-${d.id}`, caption: a.summary ?? 'Work update', by: a.displayName, atMs: tsToMs(a.createdAt), url: await getDownloadURL(ref(storage, a.photoPath)).catch(() => undefined) });
      }
    } catch { /* fine */ }
    out.sort((a, b) => (b.atMs ?? 0) - (a.atMs ?? 0));
    setPhotos(out);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (photos === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  const canAdd = user?.role === 'admin';
  if (photos.length === 0) {
    return (
      <View>
        {canAdd && <AddButton label={busy ? 'Uploading…' : 'Add photo'} onPress={addPhoto} />}
        <Empty text="No photos yet — AI Scan and Work Updates from the crew land here, or add one above." />
      </View>
    );
  }

  return (
    <View>
      {canAdd && <AddButton label={busy ? 'Uploading…' : 'Add photo'} onPress={addPhoto} />}
    <View style={styles.photoGrid}>
      {photos.filter((p) => p.url).map((p) => (
        <Pressable key={p.id} style={styles.photoCard} onPress={() => p.url && Linking.openURL(p.url)}>
          <Image source={{ uri: p.url }} style={styles.photoImg} resizeMode="cover" />
          <Text style={styles.photoCaption} numberOfLines={2}>{p.caption}</Text>
          <Text style={styles.photoMeta}>{p.by ? `${p.by} · ` : ''}{fmtWhen(p.atMs)}</Text>
        </Pressable>
      ))}
    </View>
    </View>
  );
}

/* ── Documents (drawings + contract) ──────────────────── */

interface DocRow { id: string; title: string; sub: string; icon: keyof typeof Feather.glyphMap; path?: string }

export function DocsTab({ project }: { project: Project }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function addDrawing() {
    const f = await pickFileWeb('application/pdf,image/*');
    if (!f) { notify('Desktop only', 'Upload drawings here from a desktop browser — foremen can also photograph them on site (Site Drawings).'); return; }
    setBusy(true);
    try {
      const planId = `office-${Date.now()}`;
      const storagePath = `projects/${project.id}/plans/${planId}/${f.name.replace(/[^\w.-]+/g, '_')}`;
      await uploadString(ref(storage, storagePath), f.base64, 'base64', { contentType: f.mime });
      await addDoc(collection(db, 'projects', project.id, 'plans'), {
        projectId: project.id, name: f.name, storagePath,
        fileType: f.mime.includes('pdf') ? 'pdf' : 'image',
        version: 1, uploadedBy: user?.uid ?? 'office', uploadedAt: Date.now(),
      });
      await load();
    } catch (e) { notify('Upload failed', e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const load = useCallback(async () => {
    const out: DocRow[] = [];
    if (project.contractPath) {
      out.push({ id: 'contract', title: 'Signed contract', sub: 'Office-only · PDF', icon: 'file-text', path: project.contractPath });
    }
    try {
      const snap = await getDocs(collection(db, 'projects', project.id, 'plans'));
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as { name?: string; storagePath?: string; fileType?: string; version?: number; uploadedAt?: number }) }))
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0))
        .forEach((p) => out.push({
          id: p.id, title: p.name ?? 'Drawing',
          sub: `Drawing · v${p.version ?? 1} · ${(p.fileType ?? 'pdf').toUpperCase()}`,
          icon: 'map', path: p.storagePath,
        }));
    } catch { /* fine */ }
    setRows(out);
  }, [project]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  const canAdd = user?.role === 'admin';
  if (rows.length === 0) {
    return (
      <View>
        {canAdd && <AddButton label={busy ? 'Uploading…' : 'Upload drawing / document'} onPress={addDrawing} />}
        <Empty text="No documents yet — upload a drawing above, or attach the signed contract on the Lifecycle tab (Contract stage)." />
      </View>
    );
  }
  return (
    <View>
      {canAdd && <AddButton label={busy ? 'Uploading…' : 'Upload drawing / document'} onPress={addDrawing} />}
      {rows.map((r) => (
        <Pressable key={r.id} style={styles.rowCard} onPress={() => openStoragePath(r.path)}>
          <Feather name={r.icon} size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.rowSub}>{r.sub}</Text>
          </View>
          <Feather name="external-link" size={16} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

/* ── Forms (submissions + PDFs) ───────────────────────── */

interface SubRow { id: string; schemaId: string; by?: string; atMs?: number; pdfPath?: string }

export function FormsTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<SubRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'projects', projectId, 'submissions'),
        orderBy('submittedAt', 'desc'), limit(100),
      ));
      const uids = new Map<string, string>();
      const out: SubRow[] = [];
      for (const d of snap.docs) {
        // The records pipeline writes `pdfStoragePath` (see functions/src/
        // records.ts) — reading `pdfPath` here showed "PDF rendering…"
        // forever on forms whose PDFs existed all along.
        const a = d.data() as { schemaId?: string; submittedBy?: string; submittedAt?: unknown; pdfStoragePath?: string; pdfPath?: string };
        let by = a.submittedBy;
        if (by) {
          if (!uids.has(by)) {
            try { uids.set(by, ((await getDoc(doc(db, 'users', by))).data() as { displayName?: string })?.displayName ?? by.slice(0, 8)); }
            catch { uids.set(by, by.slice(0, 8)); }
          }
          by = uids.get(by);
        }
        out.push({ id: d.id, schemaId: a.schemaId ?? 'form', by, atMs: tsToMs(a.submittedAt), pdfPath: a.pdfStoragePath ?? a.pdfPath });
      }
      setRows(out);
    } catch (e) {
      setRows([]);
      notify('Forms failed to load', e instanceof Error ? e.message : String(e));
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  if (rows.length === 0) return <Empty text="No form submissions yet — FLHAs, QC checks and Daily Progress land here with their PDFs." />;
  return (
    <View>
      {rows.map((r) => (
        <Pressable key={r.id} style={styles.rowCard} onPress={() => openStoragePath(r.pdfPath)}>
          <Feather name={r.pdfPath ? 'file-text' : 'clipboard'} size={18} color={r.pdfPath ? colors.primary : colors.textTertiary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.schemaId}</Text>
            <Text style={styles.rowSub}>{r.by ?? '—'} · {fmtWhen(r.atMs)}{r.pdfPath ? '' : ' · PDF rendering…'}</Text>
          </View>
          {r.pdfPath && <Feather name="external-link" size={16} color={colors.textTertiary} />}
        </Pressable>
      ))}
    </View>
  );
}

/* ── Punch List ───────────────────────────────────────── */

interface DefRow { id: string; title: string; status: string; severity?: string; atMs?: number; photoPath?: string }

export function PunchTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<DefRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'projects', projectId, 'deficiencies'), limit(200)));
      const out = snap.docs.map((d) => {
        const a = d.data() as { title?: string; status?: string; severity?: string; reportedAt?: unknown; photoPath?: string };
        return { id: d.id, title: a.title ?? 'Deficiency', status: a.status ?? 'open', severity: a.severity, atMs: tsToMs(a.reportedAt), photoPath: a.photoPath };
      });
      // Open first, newest first within each group.
      out.sort((a, b) => (a.status === b.status ? (b.atMs ?? 0) - (a.atMs ?? 0) : a.status === 'open' ? -1 : 1));
      setRows(out);
    } catch { setRows([]); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  if (rows.length === 0) return <Empty text="Clean punch list — nothing reported." />;
  return (
    <View>
      {rows.map((r) => (
        <Pressable key={r.id} style={[styles.rowCard, r.status === 'open' && { borderColor: r.severity === 'safety-critical' ? colors.danger : colors.warning }]} onPress={() => r.photoPath && openStoragePath(r.photoPath)}>
          <Feather
            name={r.status === 'open' ? 'alert-triangle' : 'check-circle'}
            size={18}
            color={r.status === 'open' ? (r.severity === 'safety-critical' ? colors.danger : colors.warning) : colors.success}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.rowSub}>
              {r.status.toUpperCase()}{r.severity ? ` · ${r.severity}` : ''} · {fmtWhen(r.atMs)}
            </Text>
          </View>
          {r.photoPath && <Feather name="image" size={16} color={colors.textTertiary} />}
        </Pressable>
      ))}
    </View>
  );
}

/* ── Daily Logs ───────────────────────────────────────── */

interface LogRow { id: string; date: string; summary?: string; flagged?: boolean }

export function LogsTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'projects', projectId, 'dailyLogs'), limit(90)));
      const out = snap.docs.map((d) => {
        const a = d.data() as { date?: string; summary?: string; flagged?: boolean; log?: string };
        full[d.id] = a.log ?? '';
        return { id: d.id, date: a.date ?? d.id, summary: a.summary, flagged: a.flagged };
      });
      out.sort((a, b) => b.date.localeCompare(a.date));
      setRows(out);
      setFull({ ...full });
    } catch { setRows([]); }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  if (rows.length === 0) return <Empty text="No daily logs yet — the foreman writes one per day (AI drafts it)." />;
  return (
    <View>
      {rows.map((r) => (
        <Pressable key={r.id} style={styles.rowCard} onPress={() => setOpenId(openId === r.id ? null : r.id)}>
          <Feather name={r.flagged ? 'flag' : 'book-open'} size={18} color={r.flagged ? colors.warning : colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.date}{r.flagged ? '  ⚑ flagged' : ''}</Text>
            <Text style={styles.rowSub} numberOfLines={openId === r.id ? undefined : 2}>
              {openId === r.id ? (full[r.id] || r.summary || '') : (r.summary ?? full[r.id] ?? '')}
            </Text>
          </View>
          <Feather name={openId === r.id ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}

/* ── Crew (contacts, Viewpoint-style) ─────────────────── */

interface CrewRow { uid: string; name: string; role: string; phone?: string; email?: string }

export function CrewTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<CrewRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'projects', projectId, 'members'));
      // Fetch contact info for the whole crew IN PARALLEL — sequential
      // awaits made this tab take 5–8s while every other tab was instant.
      const out: CrewRow[] = await Promise.all(snap.docs.map(async (m) => {
        const md = m.data() as { role?: string; displayName?: string };
        let name = md.displayName ?? m.id.slice(0, 8);
        let phone: string | undefined; let email: string | undefined;
        try {
          const u = (await getDoc(doc(db, 'users', m.id))).data() as { displayName?: string; phone?: string; email?: string } | undefined;
          if (u) { name = u.displayName ?? name; phone = u.phone; email = u.email; }
        } catch { /* worker-level viewers can't read users — name from member doc */ }
        return {
          uid: m.id, name,
          role: ['foreman', 'lead-foreman', 'supervisor'].includes(md.role ?? '') ? 'Foreman' as const : 'Worker' as const,
          phone, email,
        };
      }));
      out.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'Foreman' ? -1 : 1));
      setRows(out);
    } catch { setRows([]); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (rows === null) return <ActivityIndicator color={colors.primary} style={styles.spinner} />;
  if (rows.length === 0) return <Empty text="No crew assigned yet — assign from the Crew Board or Users." />;
  return (
    <View>
      {rows.map((r) => (
        <View key={r.uid} style={styles.rowCard}>
          <View style={styles.crewAvatar}><Text style={styles.crewAvatarText}>{r.name[0]?.toUpperCase() ?? '?'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{r.name} {r.role === 'Foreman' && <Text style={{ color: colors.primary }}>· FOREMAN</Text>}</Text>
            <Text style={styles.rowSub}>{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</Text>
          </View>
          {r.phone && (
            <Pressable hitSlop={8} onPress={() => Linking.openURL(`tel:${r.phone}`)}>
              <Feather name="phone" size={18} color={colors.primary} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Feather name="inbox" size={28} color={colors.textTertiary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabBarContent: { paddingHorizontal: spacing.md, gap: spacing.xs },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.medium },
  tabTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  spinner: { marginTop: spacing['2xl'] },
  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyText: { color: colors.textSecondary, textAlign: 'center', fontSize: typography.sizes.sm },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoCard: {
    width: 180, flexGrow: 1, maxWidth: 260,
    backgroundColor: colors.surface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadows.card,
  },
  photoImg: { width: '100%', height: 130, backgroundColor: colors.surfaceAlt },
  photoCaption: { padding: spacing.sm, paddingBottom: 0, fontSize: typography.sizes.sm, color: colors.text, fontWeight: typography.weights.medium },
  photoMeta: { padding: spacing.sm, paddingTop: 2, fontSize: typography.sizes.xs, color: colors.textTertiary },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.xs, ...shadows.card,
  },
  rowTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.text },
  rowSub: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },

  crewAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  crewAvatarText: { color: colors.primary, fontWeight: typography.weights.bold },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md, borderStyle: 'dashed',
    paddingVertical: spacing.md, marginBottom: spacing.md,
  },
  addBtnText: { color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },
});
