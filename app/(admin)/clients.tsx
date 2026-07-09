/**
 * Admin → Clients (CRM v1). Client records + append-only communication log —
 * "when a payment dispute happens, pull the full dated history."
 * Entries can never be edited or deleted; that's what makes them a record.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  addDoc, collection, getDocs, orderBy, query, serverTimestamp, updateDoc, doc, limit,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify } from '../../src/lib/notify';
import { tsToMs } from '../../src/lib/attendance';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type Client = {
  id: string; company: string; contactName?: string;
  phone?: string; email?: string; notes?: string;
};
type Comm = { id: string; medium: string; summary: string; byName?: string; at?: unknown };

const MEDIUMS = ['call', 'text', 'email', 'meeting', 'site visit'];

export default function ClientsScreen() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  const [clients, setClients] = useState<Client[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comms, setComms] = useState<Record<string, Comm[]>>({});
  const [showCreate, setShowCreate] = useState(false);

  // New client form
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  // New comm entry
  const [medium, setMedium] = useState('call');
  const [summary, setSummary] = useState('');

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'clients'), orderBy('company')));
      setClients(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Client, 'id'>) })));
    } catch (err: any) {
      notify('Could not load clients', err.message);
      setClients([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadComms(clientId: string) {
    try {
      const snap = await getDocs(query(
        collection(db, 'clients', clientId, 'comms'),
        orderBy('at', 'desc'),
        limit(50),
      ));
      setComms((prev) => ({ ...prev, [clientId]: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comm, 'id'>) })) }));
    } catch { /* empty log */ }
  }

  async function createClient() {
    if (!company.trim()) { notify('Missing name', 'Company name is required.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'clients'), {
        company: company.trim(),
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        createdAt: Date.now(),
        createdBy: me?.uid,
      });
      setCompany(''); setContactName(''); setPhone(''); setEmail('');
      setShowCreate(false);
      await load();
    } catch (err: any) { notify('Create failed', err.message); }
    finally { setBusy(false); }
  }

  async function addComm(clientId: string) {
    if (!summary.trim() || !me) { notify('Missing summary', 'Write what was discussed or agreed.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'clients', clientId, 'comms'), {
        medium,
        summary: summary.trim(),
        byUid: me.uid,
        byName: me.displayName,
        at: serverTimestamp(),
      });
      setSummary('');
      await loadComms(clientId);
    } catch (err: any) { notify('Log failed', err.message); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Clients</Text>
        {isAdmin ? (
          <Pressable hitSlop={8} onPress={() => setShowCreate((v) => !v)}>
            <Feather name={showCreate ? 'x' : 'plus'} size={24} color={colors.primary} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {showCreate && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>New client</Text>
            <TextInput style={styles.input} placeholder="Company (e.g. a GC or developer)" placeholderTextColor={colors.textTertiary} value={company} onChangeText={setCompany} />
            <TextInput style={styles.input} placeholder="Contact name" placeholderTextColor={colors.textTertiary} value={contactName} onChangeText={setContactName} />
            <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={createClient}>
              {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveText}>Add client</Text>}
            </Pressable>
          </View>
        )}

        {clients === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing['3xl'] }} />
        ) : clients.length === 0 && !showCreate ? (
          <View style={styles.empty}>
            <Feather name="briefcase" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No clients yet</Text>
            <Text style={styles.emptySub}>Add the GCs and developers you work for — every call and agreement gets logged with a timestamp.</Text>
          </View>
        ) : (
          clients.map((c) => {
            const isOpen = expanded === c.id;
            return (
              <View key={c.id} style={styles.card}>
                <Pressable
                  style={styles.cardRow}
                  onPress={() => {
                    setExpanded(isOpen ? null : c.id);
                    if (!isOpen) loadComms(c.id);
                  }}
                >
                  <View style={styles.avatar}><Text style={styles.avatarText}>{c.company[0]?.toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.company}</Text>
                    <Text style={styles.sub}>
                      {[c.contactName, c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
                    </Text>
                  </View>
                  <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
                </Pressable>

                {isOpen && (
                  <View style={styles.detail}>
                    {isAdmin && (
                      <>
                        <Text style={styles.detailLabel}>Log a communication</Text>
                        <View style={styles.mediumRow}>
                          {MEDIUMS.map((m) => (
                            <Pressable key={m} style={[styles.chip, medium === m && styles.chipOn]} onPress={() => setMedium(m)}>
                              <Text style={[styles.chipText, medium === m && styles.chipTextOn]}>{m}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          style={[styles.input, { minHeight: 60 }]}
                          multiline
                          placeholder='What was discussed / agreed? e.g. "Navneet confirmed change order for unit 204 — extra $1,800, approved verbally, email to follow"'
                          placeholderTextColor={colors.textTertiary}
                          value={summary}
                          onChangeText={setSummary}
                        />
                        <Pressable style={[styles.saveBtn, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => addComm(c.id)}>
                          {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveText}>Add to record</Text>}
                        </Pressable>
                      </>
                    )}

                    <Text style={[styles.detailLabel, { marginTop: spacing.lg }]}>
                      Communication record — append-only, timestamped
                    </Text>
                    {(comms[c.id] ?? []).length === 0 && (
                      <Text style={styles.sub}>Nothing logged yet.</Text>
                    )}
                    {(comms[c.id] ?? []).map((entry) => {
                      const ms = tsToMs(entry.at);
                      return (
                        <View key={entry.id} style={styles.commRow}>
                          <Text style={styles.commMeta}>
                            {ms ? new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '…'}
                            {' · '}{entry.medium}{entry.byName ? ` · ${entry.byName}` : ''}
                          </Text>
                          <Text style={styles.commText}>{entry.summary}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
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

  formCard: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.lg, ...shadows.card,
  },
  formTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    marginBottom: spacing.sm, color: colors.text, backgroundColor: colors.background,
  },
  saveBtn: { marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: colors.textInverse, fontWeight: typography.weights.semibold },

  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, ...shadows.card,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: typography.weights.bold },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },

  detail: { borderTopWidth: 1, borderColor: colors.border, padding: spacing.lg },
  detailLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary, marginBottom: spacing.sm },
  mediumRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
  chipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  commRow: {
    borderLeftWidth: 2, borderColor: colors.primary, paddingLeft: spacing.md,
    marginBottom: spacing.md,
  },
  commMeta: { color: colors.textSecondary, fontSize: typography.sizes.xs },
  commText: { color: colors.text, fontSize: typography.sizes.sm, marginTop: 2, lineHeight: 20 },

  empty: { alignItems: 'center', padding: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
});
