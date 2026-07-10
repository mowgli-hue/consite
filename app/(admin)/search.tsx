/**
 * Search — the Company Brain's front door.
 * Keyword search across everything a project has ever recorded (work log,
 * form submissions, deficiencies, pin-tasks), plus "Ask AI" which answers
 * the question from the matched history with dates and names.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '../../src/lib/firebase';
import { notify } from '../../src/lib/notify';
import { listAllProjects } from '../../src/lib/adminUsers';
import { tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project } from '../../src/types';

type HistoryItem = {
  id: string;
  type: 'work update' | 'form' | 'deficiency' | 'pin-task';
  ms: number;
  by?: string;
  text: string;      // searchable haystack
  display: string;   // shown snippet
};

const TYPE_META: Record<HistoryItem['type'], { icon: keyof typeof Feather.glyphMap; color: string }> = {
  'work update': { icon: 'image', color: colors.success },
  'form': { icon: 'check-square', color: colors.primary },
  'deficiency': { icon: 'alert-triangle', color: colors.danger },
  'pin-task': { icon: 'map-pin', color: colors.warning },
};

export default function SearchScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await listAllProjects();
        setProjects(p);
        if (p.length > 0) setProjectId(p[0].id);
      } catch (err: any) { notify('Could not load projects', err.message); }
    })();
  }, []);

  // Build the project's history index (once per project selection)
  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    setHistory(null);
    setAnswer(null);
    const items: HistoryItem[] = [];
    const fmtBy = (v: unknown) => (typeof v === 'string' ? v : undefined);

    try {
      const wl = await getDocs(query(collection(db, 'projects', projectId, 'workLog'), orderBy('createdAt', 'desc'), limit(400)));
      for (const d of wl.docs) {
        const a = d.data() as any;
        const text = [a.summary, a.trade, a.location, a.quantities, a.flags, a.displayName].filter(Boolean).join(' ');
        items.push({
          id: d.id, type: 'work update', ms: tsToMs(a.createdAt) ?? 0,
          by: fmtBy(a.displayName), text,
          display: `${a.summary ?? ''}${a.quantities ? ` · ${a.quantities}` : ''}${a.location && a.location !== 'unspecified' ? ` · ${a.location}` : ''}`,
        });
      }
    } catch { /* skip */ }

    try {
      const subs = await getDocs(query(collection(db, 'projects', projectId, 'submissions'), orderBy('submittedAt', 'desc'), limit(400)));
      for (const d of subs.docs) {
        const a = d.data() as any;
        // Skip signature data-URLs and other binary noise — words only.
        const valuesText = Object.values(a.values ?? {})
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .filter((v): v is string => typeof v === 'string' && !v.startsWith('data:') && v.length < 400)
          .join(' ');
        items.push({
          id: d.id, type: 'form', ms: tsToMs(a.submittedAt) ?? 0,
          text: `${a.schemaId ?? ''} ${valuesText}`,
          display: `${String(a.schemaId ?? 'form')} — ${valuesText.slice(0, 140) || 'signed form'}`,
        });
      }
    } catch { /* skip */ }

    try {
      const defs = await getDocs(query(collection(db, 'projects', projectId, 'deficiencies'), orderBy('reportedAt', 'desc'), limit(400)));
      for (const d of defs.docs) {
        const a = d.data() as any;
        items.push({
          id: d.id, type: 'deficiency', ms: tsToMs(a.reportedAt) ?? 0,
          text: [a.title, a.description, a.trade, a.severity, a.status].filter(Boolean).join(' '),
          display: `${a.title ?? 'Deficiency'} · ${a.severity ?? ''} · ${a.status ?? ''}`,
        });
      }
    } catch { /* skip */ }

    try {
      const plans = await getDocs(collection(db, 'projects', projectId, 'plans'));
      for (const plan of plans.docs) {
        const pins = await getDocs(collection(db, 'projects', projectId, 'plans', plan.id, 'pins'));
        for (const p of pins.docs) {
          const a = p.data() as any;
          items.push({
            id: p.id, type: 'pin-task', ms: a.createdAt ?? 0,
            by: fmtBy(a.assigneeName),
            text: [a.instruction, a.completionNote, a.assigneeName, a.status, a.type].filter(Boolean).join(' '),
            display: `${a.instruction ?? ''} · ${a.status ?? ''}${a.assigneeName ? ` · ${a.assigneeName}` : ''}`,
          });
        }
      }
    } catch { /* skip */ }

    items.sort((a, b) => b.ms - a.ms);
    setHistory(items);
  }, [projectId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const results = useMemo(() => {
    if (!history) return null;
    const terms = q.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (terms.length === 0) return history.slice(0, 30);
    return history.filter((h) => {
      const hay = h.text.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).slice(0, 100);
  }, [history, q]);

  async function askAi() {
    if (!q.trim() || !results || results.length === 0 || !projectId) {
      notify('Nothing to ask about', 'Type a question and make sure there are matching records.');
      return;
    }
    setAsking(true);
    setAnswer(null);
    try {
      const fn = httpsCallable<any, { answer: string }>(functions, 'aiAskProject');
      const res = await fn({
        question: q.trim(),
        projectName: projects.find((p) => p.id === projectId)?.name ?? '',
        snippets: results.slice(0, 50).map((r) => ({
          type: r.type,
          date: r.ms ? new Date(r.ms).toLocaleDateString('en-CA') : '?',
          by: r.by,
          text: r.display,
        })),
      });
      setAnswer(res.data.answer);
    } catch (err: any) {
      notify('Ask failed', err.message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          {projects.map((p) => (
            <Pressable key={p.id} style={[styles.chip, projectId === p.id && styles.chipOn]} onPress={() => setProjectId(p.id)}>
              <Text style={[styles.chipText, projectId === p.id && styles.chipTextOn]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchRow}>
          <Feather name="search" size={18} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder='Search or ask — "when did we frame unit 204?"'
            placeholderTextColor={colors.textTertiary}
            value={q}
            onChangeText={(v) => { setQ(v); setAnswer(null); }}
            returnKeyType="search"
          />
        </View>

        {q.trim().length > 3 && (
          <Pressable style={[styles.askBtn, asking && { opacity: 0.6 }]} disabled={asking} onPress={askAi}>
            {asking ? <ActivityIndicator color={colors.textInverse} size="small" /> : <Feather name="zap" size={16} color={colors.textInverse} />}
            <Text style={styles.askBtnText}>{asking ? 'Reading the project history…' : 'Ask AI'}</Text>
          </Pressable>
        )}

        {answer && (
          <View style={styles.answerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Feather name="zap" size={16} color={colors.primary} />
              <Text style={styles.answerTitle}>Project memory says</Text>
            </View>
            <Text style={styles.answerText}>{answer}</Text>
          </View>
        )}

        {history === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : (
          <>
            <Text style={styles.countLine}>
              {q.trim() ? `${results?.length ?? 0} matching record${(results?.length ?? 0) === 1 ? '' : 's'}` : `Recent activity · ${history.length} records indexed`}
            </Text>
            {(results ?? []).map((r) => {
              const meta = TYPE_META[r.type];
              return (
                <View key={`${r.type}-${r.id}`} style={styles.resultRow}>
                  <Feather name={meta.icon} size={16} color={meta.color} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultText} numberOfLines={3}>{r.display}</Text>
                    <Text style={styles.resultMeta}>
                      {r.ms ? new Date(r.ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {' · '}{r.type}{r.by ? ` · ${r.by}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
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
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 760, width: '100%', alignSelf: 'center' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.lg, paddingHorizontal: spacing.md, ...shadows.card,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, color: colors.text, fontSize: typography.sizes.md },

  askBtn: {
    marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md,
  },
  askBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm },

  answerCard: {
    marginTop: spacing.md, backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary,
    borderRadius: radii.lg, padding: spacing.lg,
  },
  answerTitle: { fontWeight: typography.weights.bold, color: colors.primary },
  answerText: { color: colors.text, fontSize: typography.sizes.md, lineHeight: 22 },

  countLine: {
    color: colors.textSecondary, fontSize: typography.sizes.xs, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row', gap: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs,
  },
  resultText: { color: colors.text, fontSize: typography.sizes.sm, lineHeight: 20 },
  resultMeta: { color: colors.textTertiary, fontSize: typography.sizes.xs, marginTop: 2 },
});
