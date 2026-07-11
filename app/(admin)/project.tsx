/**
 * Project Lifecycle — the spine. Stage stepper, live-verified checklist
 * with instructions, phase plan from trade templates, gated stage advance.
 * The app tells the office exactly what's blocking and how to clear it.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, updateDoc, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';

import { db, functions, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify, confirm } from '../../src/lib/notify';
import {
  STAGES, STAGE_LABELS, PHASE_TEMPLATES, computeStageChecks, stageIndex,
  type Stage, type StageCheck, type Phase,
} from '../../src/lib/lifecycle';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project } from '../../src/types';

export default function ProjectLifecycle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checks, setChecks] = useState<StageCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; company: string }>>([]);
  const [valueDraft, setValueDraft] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setChecks(null);
    try {
      const snap = await getDoc(doc(db, 'projects', id));
      if (!snap.exists()) { notify('Not found', 'Project does not exist.'); return; }
      const p = { id: snap.id, ...(snap.data() as Omit<Project, 'id'>) } as Project;
      setProject(p);
      setValueDraft(p.contractValue ? String(p.contractValue) : '');

      const ph = await getDocs(query(collection(db, 'projects', id, 'phases'), orderBy('order')));
      const phaseList = ph.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Phase, 'id'>) }));
      setPhases(phaseList);

      setChecks(await computeStageChecks(p, phaseList));

      try {
        const cs = await getDocs(collection(db, 'clients'));
        setClients(cs.docs.map((d) => ({ id: d.id, company: (d.data() as { company?: string }).company ?? d.id })));
      } catch { /* CRM may be empty */ }
    } catch (err: unknown) {
      notify('Load failed', (err as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const stage = (project?.stage ?? 'contract') as Stage;
  const allPass = (checks ?? []).every((c) => c.pass);

  async function patchProject(patch: Record<string, unknown>) {
    if (!id) return;
    await updateDoc(doc(db, 'projects', id), patch);
    await load();
  }

  async function advanceStage() {
    const idx = stageIndex(stage);
    const next = idx >= STAGES.length - 1 ? 'archived' : STAGES[idx + 1];
    confirm(
      next === 'archived' ? 'Close out this project?' : `Advance to ${STAGE_LABELS[next as Stage] ?? next}?`,
      next === 'archived'
        ? 'The project archives as a permanent, searchable record.'
        : 'The whole team sees the new stage.',
      () => patchProject({ stage: next }).catch((e) => notify('Advance failed', e.message)),
      next === 'archived' ? 'Close out' : 'Advance',
    );
  }

  async function createPhasesFromTemplate(templateName: string) {
    if (!id) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      PHASE_TEMPLATES[templateName].forEach((t, i) => {
        batch.set(doc(collection(db, 'projects', id, 'phases')), {
          name: t.name, order: i + 1, status: i === 0 ? 'active' : 'pending',
          invoiceMilestone: t.invoiceMilestone ?? false,
        });
      });
      await batch.commit();
      await load();
    } catch (err: unknown) { notify('Template failed', (err as Error).message); }
    finally { setBusy(false); }
  }

  async function advancePhase(p: Phase) {
    if (!id) return;
    const next = p.status === 'pending' ? 'active' : 'done';
    try {
      await updateDoc(doc(db, 'projects', id, 'phases', p.id), {
        status: next,
        ...(next === 'done' ? { completedAt: Date.now(), completedBy: me?.uid } : {}),
      });
      // Auto-activate the next pending phase when one completes.
      if (next === 'done') {
        const nextPhase = phases.filter((x) => x.status === 'pending' && x.order > p.order).sort((a, b) => a.order - b.order)[0];
        if (nextPhase) await updateDoc(doc(db, 'projects', id, 'phases', nextPhase.id), { status: 'active' });
      }
      await load();
    } catch (err: unknown) { notify('Phase update failed', (err as Error).message); }
  }

  function uploadContract() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      notify('Desktop only', 'Attach the contract from the office dashboard in a browser.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !id) return;
      setBusy(true);
      try {
        const b64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result).split(',')[1] ?? '');
          r.onerror = rej; r.readAsDataURL(file);
        });
        const contractPath = `projects/${id}/media/contract/contract.pdf`;
        await uploadString(ref(storage, contractPath), b64, 'base64', { contentType: 'application/pdf' });
        await patchProject({ contractPath });
        notify('Contract attached', 'Part of the permanent project record now.');
      } catch (err: unknown) { notify('Upload failed', (err as Error).message); }
      finally { setBusy(false); }
    };
    input.click();
  }

  async function generateCloseoutAudit() {
    if (!id) return;
    setBusy(true);
    try {
      const fn = httpsCallable<{ projectId: string; fromMs: number; toMs: number }, { storagePath: string }>(functions, 'generateAuditPack');
      const res = await fn({ projectId: id, fromMs: Date.now() - 365 * 86_400_000, toMs: Date.now() });
      await patchProject({ auditAt: Date.now() });
      const url = await getDownloadURL(ref(storage, res.data.storagePath));
      if (typeof window !== 'undefined') window.open(url, '_blank');
    } catch (err: unknown) { notify('Audit failed', (err as Error).message); }
    finally { setBusy(false); }
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{project.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Stage stepper */}
        <View style={styles.stepper}>
          {STAGES.map((s, i) => {
            const cur = stageIndex(stage);
            const state = project.stage === 'archived' ? 'done' : i < cur ? 'done' : i === cur ? 'current' : 'todo';
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.stepDot,
                  state === 'done' && { backgroundColor: colors.success },
                  state === 'current' && { backgroundColor: colors.primary },
                ]}>
                  {state === 'done'
                    ? <Feather name="check" size={12} color={colors.textInverse} />
                    : <Text style={styles.stepNum}>{i + 1}</Text>}
                </View>
                <Text style={[styles.stepLabel, state === 'current' && { color: colors.primary, fontWeight: typography.weights.bold }]}>
                  {STAGE_LABELS[s]}
                </Text>
              </View>
            );
          })}
        </View>

        {project.stage === 'archived' ? (
          <View style={styles.archived}>
            <Feather name="check-circle" size={40} color={colors.success} />
            <Text style={styles.archivedText}>Project closed out — permanent searchable record.</Text>
          </View>
        ) : (
          <>
            {/* Current stage checklist */}
            <Text style={styles.sectionLabel}>{STAGE_LABELS[stage]} — what the app can verify</Text>
            {checks === null ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              checks.map((c) => (
                <View key={c.id} style={[styles.checkRow, !c.pass && styles.checkRowFail]}>
                  <Feather name={c.pass ? 'check-circle' : 'circle'} size={18} color={c.pass ? colors.success : colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkLabel}>{c.label}</Text>
                    {!c.pass && <Text style={styles.checkInstruction}>{c.instruction}</Text>}
                  </View>
                </View>
              ))
            )}

            {/* Stage-specific quick actions */}
            {stage === 'contract' && isAdmin && (
              <View style={styles.actions}>
                <Text style={styles.miniLabel}>Client</Text>
                <View style={styles.chips}>
                  {clients.length === 0 && <Text style={styles.hint}>No clients yet — add one in Clients first.</Text>}
                  {clients.map((c) => (
                    <Pressable
                      key={c.id}
                      style={[styles.chip, project.clientId === c.id && styles.chipOn]}
                      onPress={() => patchProject({ clientId: c.id, clientName: c.company })}
                    >
                      <Text style={[styles.chipText, project.clientId === c.id && styles.chipTextOn]}>{c.company}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.rowSplit}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Contract value (e.g. 86000)"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="number-pad"
                    value={valueDraft}
                    onChangeText={setValueDraft}
                    onBlur={() => {
                      const v = parseFloat(valueDraft);
                      if (!Number.isNaN(v) && v > 0) patchProject({ contractValue: v });
                    }}
                  />
                  <Pressable style={[styles.actionBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={uploadContract}>
                    <Feather name="paperclip" size={15} color={colors.textInverse} />
                    <Text style={styles.actionBtnText}>{project.contractPath ? 'Replace contract' : 'Attach contract'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {stage === 'closeout' && isAdmin && (
              <Pressable style={[styles.actionBtn, { marginTop: spacing.md }, busy && { opacity: 0.6 }]} disabled={busy} onPress={generateCloseoutAudit}>
                {busy ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Feather name="folder" size={15} color={colors.textInverse} />}
                <Text style={styles.actionBtnText}>Generate closeout audit pack</Text>
              </Pressable>
            )}

            {/* Phases */}
            <Text style={styles.sectionLabel}>Build phases</Text>
            {phases.length === 0 ? (
              <View style={styles.actions}>
                <Text style={styles.hint}>Start from a trade template — adjust afterwards:</Text>
                <View style={styles.chips}>
                  {Object.keys(PHASE_TEMPLATES).map((t) => (
                    <Pressable key={t} style={[styles.chip, busy && { opacity: 0.6 }]} disabled={busy || !isAdmin} onPress={() => createPhasesFromTemplate(t)}>
                      <Text style={styles.chipText}>+ {t}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              phases.map((p) => (
                <View key={p.id} style={[styles.phaseRow, p.status === 'active' && { borderColor: colors.primary }]}>
                  <View style={[styles.phaseDot,
                    p.status === 'done' && { backgroundColor: colors.success },
                    p.status === 'active' && { backgroundColor: colors.primary },
                  ]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.phaseName, p.status === 'done' && { textDecorationLine: 'line-through', color: colors.textSecondary }]}>
                      {p.order}. {p.name}{p.invoiceMilestone ? '  💰' : ''}
                    </Text>
                    <Text style={styles.phaseSub}>
                      {p.status === 'done' && p.completedAt
                        ? `Done ${new Date(p.completedAt).toLocaleDateString('en-CA')}`
                        : p.status.toUpperCase()}
                    </Text>
                  </View>
                  {p.status !== 'done' && (
                    <Pressable style={styles.phaseBtn} onPress={() => advancePhase(p)}>
                      <Text style={styles.phaseBtnText}>{p.status === 'pending' ? 'Start' : 'Complete'}</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}

            {/* Advance */}
            {isAdmin && (
              <Pressable
                style={[styles.advanceBtn, !allPass && styles.advanceBtnDisabled]}
                disabled={!allPass}
                onPress={advanceStage}
              >
                <Feather name={stage === 'closeout' ? 'archive' : 'arrow-right-circle'} size={18} color={colors.textInverse} />
                <Text style={styles.advanceText}>
                  {allPass
                    ? stage === 'closeout' ? 'Close out project' : `Advance to ${STAGE_LABELS[STAGES[stageIndex(stage) + 1] as Stage] ?? 'next'}`
                    : 'Clear the checklist to advance'}
                </Text>
              </Pressable>
            )}
          </>
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
  headerTitle: { flex: 1, textAlign: 'center', fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 760, width: '100%', alignSelf: 'center' },

  stepper: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadows.card,
  },
  step: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontWeight: typography.weights.bold },
  stepLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs,
  },
  checkRowFail: { borderColor: colors.warning },
  checkLabel: { color: colors.text, fontWeight: typography.weights.medium },
  checkInstruction: { color: colors.textSecondary, fontSize: typography.sizes.sm, marginTop: 2, lineHeight: 19 },

  actions: { marginTop: spacing.sm },
  miniLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, fontWeight: typography.weights.semibold, marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },
  hint: { color: colors.textTertiary, fontSize: typography.sizes.sm, marginBottom: spacing.xs },
  rowSplit: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.surface,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  actionBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },

  phaseRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs, ...shadows.card,
  },
  phaseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.borderStrong },
  phaseName: { color: colors.text, fontWeight: typography.weights.medium },
  phaseSub: { color: colors.textTertiary, fontSize: typography.sizes.xs, marginTop: 1 },
  phaseBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  phaseBtnText: { color: colors.primary, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },

  advanceBtn: {
    marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.success, borderRadius: radii.lg, paddingVertical: spacing.lg,
  },
  advanceBtnDisabled: { backgroundColor: colors.borderStrong },
  advanceText: { color: colors.textInverse, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },

  archived: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.md },
  archivedText: { color: colors.textSecondary, textAlign: 'center' },
});
