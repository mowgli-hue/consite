/**
 * My Certifications screen.
 *
 * Worker sees their own tickets: WHMIS, fall arrest, first aid, etc.
 * Each one shows expiry status with a colored badge. They can add new
 * certs via a sheet (manual entry for v0.2; v0.3 adds photo-upload + AI
 * OCR of the certificate image).
 *
 * Stored at /users/{uid}/certifications/{certId}.
 *
 * BC pain killer: contractors get audited or want to verify a worker is
 * legal to be on site. Looking through paper photocopies or texting the
 * worker for proof is brutal. This makes "show me your tickets" one tap.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { AddTicketModal, openTicketPhoto } from '../../src/components/AddTicketModal';
import { confirm, notify, toast } from '../../src/lib/notify';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  type Certification,
  expiryStatus,
} from '../../src/types/certification';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';


export default function CertificationsScreen() {
  const { user } = useAuth();
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // No orderBy: it silently drops docs that have no expiresAt field.
      const snap = await getDocs(collection(db, 'users', user.uid, 'certifications'));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Certification, 'id'>) }));
      list.sort((x, y) => (x.expiresAt ?? Infinity) - (y.expiresAt ?? Infinity));
      setCerts(list);
    } catch (err) {
      console.warn('Cert load failed', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>My Tickets</Text>
        <Pressable onPress={() => setShowAdd(true)} hitSlop={8} style={styles.addButton}>
          <Feather name="plus" size={20} color={colors.textInverse} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : certs.length === 0 ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.empty}>
            <Feather name="shield" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No tickets yet</Text>
            <Text style={styles.emptySub}>
              Take a picture of each ticket — WHMIS, fall arrest, first aid — so it's always with you on site.
            </Text>
            <Pressable style={styles.bigButton} onPress={() => setShowAdd(true)}>
              <Feather name="plus" size={18} color={colors.textInverse} />
              <Text style={styles.bigButtonText}>Add a ticket (photo)</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={certs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CertCard cert={item} uid={user!.uid} onChanged={load} />}
        />
      )}

      <AddTicketModal
        visible={showAdd}
        workerUid={user?.uid ?? ''}
        byUid={user?.uid ?? ''}
        verified={false}
        onClose={() => setShowAdd(false)}
        onAdded={async () => {
          setShowAdd(false);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function CertCard({ cert, uid, onChanged }: { cert: Certification; uid: string; onChanged: () => void }) {
  const status = expiryStatus(cert);
  const verified = (cert as { verified?: boolean }).verified;
  const sub = [cert.issuer, cert.certificateNumber].filter(Boolean).join(' · ');

  function remove() {
    confirm('Delete this ticket?', `“${cert.displayName}” will be removed.`, async () => {
      try {
        await deleteDoc(doc(db, 'users', uid, 'certifications', cert.id));
        if (cert.documentStoragePath) await deleteObject(ref(storage, cert.documentStoragePath)).catch(() => {});
        toast('Ticket deleted');
        onChanged();
      } catch (e) { notify('Could not delete', e instanceof Error ? e.message : String(e)); }
    }, 'Delete');
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{cert.displayName}</Text>
        <StatusBadge status={status} />
      </View>
      {!!sub && <Text style={styles.cardSub}>{sub}</Text>}
      <Text style={styles.cardSub}>
        {cert.expiresAt ? `Expires ${formatDate(cert.expiresAt)}` : 'No expiry date'}
        {verified === false ? ' · waiting for the office to confirm' : ''}
      </Text>
      <View style={styles.cardDates}>
        {cert.documentStoragePath ? (
          <Pressable onPress={() => openTicketPhoto(cert.documentStoragePath)} hitSlop={8}>
            <Text style={styles.linkText}>View photo</Text>
          </Pressable>
        ) : <View />}
        {verified !== true && (
          <Pressable onPress={remove} hitSlop={8} accessibilityLabel="Delete ticket">
            <Feather name="trash-2" size={18} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof expiryStatus>;
}) {
  let bg: string = colors.successSoft;
  let fg: string = colors.success;
  let text = 'Valid';

  if (status.state === 'expired') {
    bg = colors.dangerSoft;
    fg = colors.danger;
    text = 'Expired';
  } else if (status.state === 'expiring-soon') {
    bg = colors.warningSoft;
    fg = colors.warning;
    text = `${status.daysUntilExpiry}d left`;
  } else if (status.state === 'never-expires') {
    bg = colors.surfaceAlt;
    fg = colors.textSecondary;
    text = 'No expiry';
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: bg }]}>
      <Text style={[styles.statusText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA');
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
  title: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: spacing.lg },
  empty: {
    alignItems: 'center',
    padding: spacing['3xl'],
    gap: spacing.md,
  },
  emptyTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  emptySub: { color: colors.textSecondary, textAlign: 'center' },
  bigButton: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
  },
  bigButtonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },

  list: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text, flex: 1 },
  cardSub: { marginTop: 2, fontSize: typography.sizes.sm, color: colors.textSecondary },
  cardDates: {
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateLabel: { fontSize: typography.sizes.xs, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  dateValue: { marginTop: 2, fontSize: typography.sizes.sm, color: colors.text },

  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
  },

  // Modal
  linkText: { color: colors.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  modalTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.text },
  modalSave: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  modalSaveText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  modalLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typePillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typePillText: { fontSize: typography.sizes.sm, color: colors.text },
  typePillTextActive: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  dateRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  modalFootnote: {
    marginTop: spacing.xl,
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
