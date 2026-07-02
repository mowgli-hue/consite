/**
 * Admin Compliance Overview — the audit-readiness dashboard.
 *
 * Aggregates expiring certifications across all workers. Shows which workers
 * have lapsed or imminently-lapsing tickets so the admin can chase them
 * before a WorkSafeBC inspector does.
 *
 * v0.2: read-only summary. v0.3 adds bulk renewal reminders and
 * automated email/SMS via a Cloud Function scheduled daily.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, getDocs, collectionGroup, query } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { expiryStatus, type Certification } from '../../src/types/certification';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

interface CertRow extends Certification {
  workerUid: string;
  workerName: string;
}

export default function ComplianceScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load all users first so we can attribute names to UIDs.
      const usersSnap = await getDocs(collection(db, 'users'));
      const userNames = new Map<string, string>();
      for (const u of usersSnap.docs) {
        userNames.set(u.id, u.data().displayName ?? 'Worker');
      }

      // Collection group query across all /users/*/certifications.
      const q = query(collectionGroup(db, 'certifications'));
      const snap = await getDocs(q);

      const allRows: CertRow[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Omit<Certification, 'id'>;
        // The parent of certifications is the user doc; extract uid from path.
        const path = d.ref.path.split('/');
        const workerUid = path[path.length - 3];
        allRows.push({
          id: d.id,
          ...data,
          workerUid,
          workerName: userNames.get(workerUid) ?? 'Worker',
        });
      }

      // Sort by urgency: expired first, then soonest expiry.
      allRows.sort((a, b) => {
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt - b.expiresAt;
      });

      setRows(allRows);
    } catch (err) {
      console.warn('Compliance load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const expired = rows.filter((r) => expiryStatus(r).state === 'expired');
  const expiringSoon = rows.filter((r) => expiryStatus(r).state === 'expiring-soon');
  const valid = rows.filter((r) => {
    const s = expiryStatus(r).state;
    return s === 'valid' || s === 'never-expires';
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Compliance</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.statsRow}>
            <StatCard
              label="Expired"
              value={expired.length}
              color={colors.danger}
              soft={colors.dangerSoft}
            />
            <StatCard
              label="Expiring soon"
              value={expiringSoon.length}
              color={colors.warning}
              soft={colors.warningSoft}
            />
            <StatCard
              label="Valid"
              value={valid.length}
              color={colors.success}
              soft={colors.successSoft}
            />
          </View>

          {expired.length > 0 && (
            <Section title="Expired" rows={expired} accent={colors.danger} />
          )}
          {expiringSoon.length > 0 && (
            <Section title="Expiring within 30 days" rows={expiringSoon} accent={colors.warning} />
          )}
          {expired.length === 0 && expiringSoon.length === 0 && (
            <View style={styles.allGood}>
              <Feather name="check-circle" size={32} color={colors.success} />
              <Text style={styles.allGoodTitle}>All clear</Text>
              <Text style={styles.allGoodSub}>
                No expired or expiring-soon certifications across your team.
              </Text>
            </View>
          )}

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Coming in v0.3</Text>
            <Text style={styles.tipsBody}>
              Automated email/SMS reminders to workers at 30, 14, and 7 days before expiry. One-tap audit pack export (last 90 days of FLHAs, toolbox talks, certs, incidents) as a PDF binder.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  color,
  soft,
}: {
  label: string;
  value: number;
  color: string;
  soft: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: soft }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, rows, accent }: { title: string; rows: CertRow[]; accent: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, { backgroundColor: accent }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {rows.map((r) => {
        const s = expiryStatus(r);
        return (
          <View key={r.id} style={styles.certRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.certName}>{r.displayName}</Text>
              <Text style={styles.certWorker}>{r.workerName}</Text>
            </View>
            <Text style={[styles.certDate, s.state === 'expired' && { color: colors.danger }]}>
              {s.state === 'expired'
                ? `${Math.abs(s.daysUntilExpiry ?? 0)}d ago`
                : `${s.daysUntilExpiry}d left`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  statCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold,
  },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  section: { marginBottom: spacing.xl },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionAccent: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },

  certRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  certName: { fontSize: typography.sizes.sm, color: colors.text, fontWeight: typography.weights.medium },
  certWorker: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  certDate: { fontSize: typography.sizes.sm, color: colors.warning, fontWeight: typography.weights.semibold },

  allGood: {
    alignItems: 'center',
    padding: spacing['3xl'],
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radii.lg,
  },
  allGoodTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  allGoodSub: { color: colors.textSecondary, textAlign: 'center' },

  tipsCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
  },
  tipsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.primaryDark, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.xs },
  tipsBody: { fontSize: typography.sizes.sm, color: colors.text, lineHeight: 20 },
});
