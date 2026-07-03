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
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  CERT_METADATA,
  type Certification,
  type CertType,
  expiryStatus,
} from '../../src/types/certification';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

const STANDARD_CERT_TYPES = Object.keys(CERT_METADATA) as Array<Exclude<CertType, 'other'>>;

export default function CertificationsScreen() {
  const { user } = useAuth();
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users', user.uid, 'certifications'),
        orderBy('expiresAt', 'asc')
      );
      const snap = await getDocs(q);
      setCerts(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Certification, 'id'>) }))
      );
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
        <Text style={styles.title}>My Certifications</Text>
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
            <Text style={styles.emptyTitle}>No certifications yet</Text>
            <Text style={styles.emptySub}>
              Add your WHMIS, fall arrest, first aid, and other tickets so they're easy to show on site.
            </Text>
            <Pressable style={styles.bigButton} onPress={() => setShowAdd(true)}>
              <Feather name="plus" size={18} color={colors.textInverse} />
              <Text style={styles.bigButtonText}>Add a certification</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={certs}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <CertCard cert={item} />}
        />
      )}

      <AddCertModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={async () => {
          setShowAdd(false);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function CertCard({ cert }: { cert: Certification }) {
  const status = expiryStatus(cert);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{cert.displayName}</Text>
        <StatusBadge status={status} />
      </View>
      <Text style={styles.cardSub}>
        {cert.issuer} {cert.certificateNumber ? `· ${cert.certificateNumber}` : ''}
      </Text>
      <View style={styles.cardDates}>
        <View>
          <Text style={styles.dateLabel}>Issued</Text>
          <Text style={styles.dateValue}>{formatDate(cert.issuedAt)}</Text>
        </View>
        <View>
          <Text style={styles.dateLabel}>Expires</Text>
          <Text style={styles.dateValue}>
            {cert.expiresAt ? formatDate(cert.expiresAt) : 'Never'}
          </Text>
        </View>
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

function AddCertModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<CertType | null>(null);
  const [customName, setCustomName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiresDate, setExpiresDate] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setSelectedType(null);
    setCustomName('');
    setIssuer('');
    setCertNumber('');
    setIssuedDate('');
    setExpiresDate('');
  }

  function pickType(t: CertType) {
    setSelectedType(t);
    if (t !== 'other') {
      const meta = CERT_METADATA[t];
      setIssuer(meta.typicalIssuer);
    } else {
      setIssuer('');
    }
  }

  async function save() {
    if (!user || !selectedType) return;
    if (selectedType === 'other' && !customName.trim()) {
      Alert.alert('Missing name', 'Enter a name for this certification.');
      return;
    }
    if (!issuedDate) {
      Alert.alert('Missing date', 'Enter when this was issued (YYYY-MM-DD).');
      return;
    }
    const issuedMs = Date.parse(issuedDate);
    const expiresMs = expiresDate ? Date.parse(expiresDate) : null;
    if (isNaN(issuedMs)) {
      Alert.alert('Bad date', 'Issued date must be YYYY-MM-DD.');
      return;
    }
    if (expiresMs != null && isNaN(expiresMs)) {
      Alert.alert('Bad date', 'Expiry date must be YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const displayName =
        selectedType === 'other'
          ? customName.trim()
          : CERT_METADATA[selectedType].displayName;
      await addDoc(collection(db, 'users', user.uid, 'certifications'), {
        type: selectedType,
        customName: selectedType === 'other' ? customName.trim() : null,
        displayName,
        issuer: issuer.trim(),
        certificateNumber: certNumber.trim() || null,
        issuedAt: issuedMs,
        expiresAt: expiresMs,
        createdAt: Date.now(),
        createdBy: user.uid,
      });
      reset();
      onAdded();
    } catch (err: any) {
      Alert.alert('Save failed', err.message ?? 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.modalTitle}>Add certification</Text>
          <Pressable
            disabled={saving}
            onPress={save}
            style={[styles.modalSave, saving && { opacity: 0.4 }]}
          >
            <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <Text style={styles.modalLabel}>Type</Text>
          <View style={styles.typeGrid}>
            {STANDARD_CERT_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.typePill, selectedType === t && styles.typePillActive]}
                onPress={() => pickType(t)}
              >
                <Text
                  style={[
                    styles.typePillText,
                    selectedType === t && styles.typePillTextActive,
                  ]}
                >
                  {CERT_METADATA[t].displayName}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.typePill, selectedType === 'other' && styles.typePillActive]}
              onPress={() => pickType('other')}
            >
              <Text
                style={[
                  styles.typePillText,
                  selectedType === 'other' && styles.typePillTextActive,
                ]}
              >
                Other
              </Text>
            </Pressable>
          </View>

          {selectedType === 'other' && (
            <>
              <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>
                Custom name
              </Text>
              <TextInput
                style={styles.modalInput}
                value={customName}
                onChangeText={setCustomName}
                placeholder="e.g. OSSA standard"
                placeholderTextColor={colors.textTertiary}
              />
            </>
          )}

          <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>Issuer</Text>
          <TextInput
            style={styles.modalInput}
            value={issuer}
            onChangeText={setIssuer}
            placeholder="BCCSA, Red Cross, etc."
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>
            Certificate number (optional)
          </Text>
          <TextInput
            style={styles.modalInput}
            value={certNumber}
            onChangeText={setCertNumber}
            placeholder="e.g. ABC123456"
            placeholderTextColor={colors.textTertiary}
          />

          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalLabel}>Issued (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.modalInput}
                value={issuedDate}
                onChangeText={setIssuedDate}
                placeholder="2024-01-15"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalLabel}>Expires (optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={expiresDate}
                onChangeText={setExpiresDate}
                placeholder="2027-01-15"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <Text style={styles.modalFootnote}>
            v0.3 adds photo upload + AI extraction of cert details from the image. For now, type it in.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
