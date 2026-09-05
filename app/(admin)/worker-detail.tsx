/**
 * Admin → Users → worker detail. The whole person on one screen:
 * contact info, WCB + emergency contact, project assignments with roles,
 * and every certification/ticket with live expiry status (expired first).
 *
 * Requested by Brown Bros: "All Workers → Harjeet Singh → info incl. all
 * his certifications and tickets." Staff read-only data; edits still
 * happen where they always did (Users screen / worker's own profile).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { notify } from '../../src/lib/notify';
import { expiryStatus, type Certification } from '../../src/types/certification';
import type { User } from '../../src/types';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

interface ProjectAssignment { id: string; name: string; role: string }

const ROLE_LABEL: Record<string, string> = {
  worker: 'Worker', foreman: 'Foreman', 'lead-foreman': 'Lead Foreman', supervisor: 'Foreman',
};

function fmtDate(ms?: number | null): string {
  if (typeof ms !== 'number') return '—';
  return new Date(ms).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function WorkerDetail() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [worker, setWorker] = useState<User | null>(null);
  const [certs, setCerts] = useState<Certification[] | null>(null);
  const [assignments, setAssignments] = useState<ProjectAssignment[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const u = await getDoc(doc(db, 'users', uid));
      if (!u.exists()) { notify('Not found', 'This user no longer exists.'); router.back(); return; }
      const w = { uid: u.id, ...(u.data() as Omit<User, 'uid'>) };
      setWorker(w);

      // Certifications — expired first, then soonest expiry.
      try {
        const snap = await getDocs(collection(db, 'users', uid, 'certifications'));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Certification, 'id'>) }));
        list.sort((a, b) => (a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER));
        setCerts(list);
      } catch { setCerts([]); }

      // Project assignments with per-project role.
      const rows: ProjectAssignment[] = [];
      for (const pid of w.projectIds ?? []) {
        try {
          const [p, m] = await Promise.all([
            getDoc(doc(db, 'projects', pid)),
            getDoc(doc(db, 'projects', pid, 'members', uid)),
          ]);
          rows.push({
            id: pid,
            name: p.data()?.name ?? pid,
            role: ROLE_LABEL[(m.data()?.role as string) ?? 'worker'] ?? 'Worker',
          });
        } catch { /* skip unreadable */ }
      }
      setAssignments(rows);
    } catch (e) {
      notify('Could not load worker', e instanceof Error ? e.message : String(e));
    }
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!worker) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  const expired = (certs ?? []).filter((c) => expiryStatus(c).state === 'expired').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{worker.displayName}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Identity */}
        <View style={styles.card}>
          <View style={styles.idRow}>
            <View style={[styles.avatar, !worker.active && { backgroundColor: colors.border }]}>
              <Text style={styles.avatarText}>{worker.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{worker.displayName}</Text>
              <Text style={styles.sub}>
                {worker.role === 'worker' ? 'Worker' : worker.role.toUpperCase()}
                {!worker.active && ' · DEACTIVATED'}
              </Text>
            </View>
          </View>
          <InfoRow icon="mail" label="Email" value={worker.email} />
          <InfoRow icon="phone" label="Phone" value={worker.phone || '—'} />
          <InfoRow icon="shield" label="WCB number" value={worker.wcbNumber || 'Not on file'} warn={!worker.wcbNumber} />
          <InfoRow
            icon="alert-circle" label="Emergency contact"
            value={worker.emergencyContactName
              ? `${worker.emergencyContactName}${worker.emergencyContactPhone ? ` · ${worker.emergencyContactPhone}` : ''}`
              : 'Not on file'}
            warn={!worker.emergencyContactName}
          />
        </View>

        {/* Projects */}
        <Text style={styles.sectionLabel}>Projects</Text>
        {assignments.length === 0 ? (
          <Text style={styles.emptyText}>Not assigned to any project.</Text>
        ) : assignments.map((a) => (
          <Pressable key={a.id} style={styles.rowCard} onPress={() => router.push(`/project?id=${a.id}` as any)}>
            <Feather name="briefcase" size={16} color={colors.textSecondary} />
            <Text style={styles.rowMain}>{a.name}</Text>
            <Text style={[styles.roleText, a.role !== 'Worker' && { color: colors.primary }]}>{a.role}</Text>
          </Pressable>
        ))}

        {/* Certifications & tickets */}
        <Text style={styles.sectionLabel}>
          Certifications & tickets{certs ? ` (${certs.length})` : ''}
          {expired > 0 ? `  ·  ${expired} EXPIRED` : ''}
        </Text>
        {certs === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : certs.length === 0 ? (
          <Text style={styles.emptyText}>
            No certifications on file — the worker adds them under My Tickets, or ask them for paper copies.
          </Text>
        ) : certs.map((c) => {
          const st = expiryStatus(c);
          const tone = st.state === 'expired' ? colors.danger
            : st.state === 'expiring-soon' ? colors.warning : colors.success;
          const statusText = st.state === 'expired'
            ? `EXPIRED ${fmtDate(c.expiresAt)}`
            : st.state === 'expiring-soon'
              ? `Expires in ${st.daysUntilExpiry} days`
              : st.state === 'never-expires' ? 'No expiry' : `Valid until ${fmtDate(c.expiresAt)}`;
          return (
            <View key={c.id} style={styles.rowCard}>
              <Feather
                name={st.state === 'expired' ? 'x-circle' : st.state === 'expiring-soon' ? 'alert-triangle' : 'check-circle'}
                size={16} color={tone}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMain}>{c.displayName || c.customName || c.type}</Text>
                <Text style={styles.rowSub}>
                  {c.issuer}{c.certificateNumber ? ` · #${c.certificateNumber}` : ''} · issued {fmtDate(c.issuedAt)}
                </Text>
              </View>
              <Text style={[styles.statusText, { color: tone }]}>{statusText}</Text>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, warn }: {
  icon: keyof typeof Feather.glyphMap; label: string; value: string; warn?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={15} color={warn ? colors.warning : colors.textSecondary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, warn && { color: colors.warning }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 720, width: '100%', alignSelf: 'center' },

  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadows.card,
  },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.lg },
  name: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },

  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderTopWidth: 1, borderColor: colors.border,
  },
  infoLabel: { width: 130, fontSize: typography.sizes.sm, color: colors.textSecondary },
  infoValue: { flex: 1, fontSize: typography.sizes.sm, color: colors.text, fontWeight: typography.weights.medium },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
  },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm, ...shadows.card,
  },
  rowMain: { flex: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.text },
  rowSub: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 1 },
  roleText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.textSecondary },
  statusText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textAlign: 'right' },

  emptyText: { color: colors.textSecondary, fontSize: typography.sizes.sm },
});
