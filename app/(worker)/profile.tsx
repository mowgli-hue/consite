/**
 * Worker → My Profile. The pocket safety card:
 * WCB number, emergency contact, tickets summary, safety documents —
 * everything a worker (or a safety officer asking) needs, one tap away.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';

import { db, storage } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { useT, type Lang } from '../../src/contexts/I18nContext';
import { notify } from '../../src/lib/notify';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';

type CertSummary = { total: number; expiringSoon: number; expired: number };
type SafetyDoc = { id: string; title: string; url?: string; storagePath?: string };

export default function WorkerProfile() {
  const { user } = useAuth();
  const { t, lang, setLang } = useT();
  const [wcb, setWcb] = useState('');
  const [ecName, setEcName] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [certs, setCerts] = useState<CertSummary | null>(null);
  const [docs, setDocs] = useState<SafetyDoc[]>([]);

  useEffect(() => {
    if (!user) return;
    setWcb(user.wcbNumber ?? '');
    setEcName(user.emergencyContactName ?? '');
    setEcPhone(user.emergencyContactPhone ?? '');
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users', user.uid, 'certifications'));
        const now = Date.now();
        const soon = now + 30 * 86_400_000;
        let expiringSoon = 0; let expired = 0;
        snap.docs.forEach((d) => {
          const exp = d.data().expiresAt;
          if (typeof exp !== 'number') return;
          if (exp < now) expired += 1;
          else if (exp < soon) expiringSoon += 1;
        });
        setCerts({ total: snap.size, expiringSoon, expired });
      } catch { setCerts({ total: 0, expiringSoon: 0, expired: 0 }); }
      try {
        const t = await getDocs(query(collection(db, 'templates')));
        setDocs(t.docs.map((d) => ({
          id: d.id,
          title: (d.data().title ?? d.data().name ?? d.id) as string,
          url: d.data().url as string | undefined,
          storagePath: d.data().storagePath as string | undefined,
        })));
      } catch { setDocs([]); }
    })();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        wcbNumber: wcb.trim(),
        emergencyContactName: ecName.trim(),
        emergencyContactPhone: ecPhone.trim(),
      });
      setDirty(false);
      notify('Saved', 'Your profile is up to date.');
    } catch (err: any) {
      notify('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.idCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={styles.name}>{user.displayName}</Text>
          <Text style={styles.sub}>{user.email}{user.phone ? ` · ${user.phone}` : ''}</Text>
          {!!wcb && !dirty && <Text style={styles.wcbLine}>WCB # {wcb}</Text>}
        </View>

        <Text style={styles.sectionLabel}>{t('Language')} · ਭਾਸ਼ਾ</Text>
        <View style={styles.langRow}>
          {([['en', 'English'], ['pa', 'ਪੰਜਾਬੀ']] as Array<[Lang, string]>).map(([code, label]) => (
            <Pressable
              key={code}
              style={[styles.langChip, lang === code && styles.langChipOn]}
              onPress={() => setLang(code)}
            >
              <Text style={[styles.langChipText, lang === code && styles.langChipTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionLabel}>{t('Safety ID')}</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>WCB / WorkSafeBC number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 123456789"
            placeholderTextColor={colors.textTertiary}
            value={wcb}
            onChangeText={(v) => { setWcb(v); setDirty(true); }}
          />
          <Text style={styles.fieldLabel}>Emergency contact — name</Text>
          <TextInput
            style={styles.input}
            placeholder="Who should we call?"
            placeholderTextColor={colors.textTertiary}
            value={ecName}
            onChangeText={(v) => { setEcName(v); setDirty(true); }}
          />
          <Text style={styles.fieldLabel}>Emergency contact — phone</Text>
          <TextInput
            style={styles.input}
            placeholder="+1 604 555 1234"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
            value={ecPhone}
            onChangeText={(v) => { setEcPhone(v); setDirty(true); }}
          />
          {dirty && (
            <Pressable style={[styles.saveBtn, saving && { opacity: 0.5 }]} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.saveBtnText}>Save</Text>}
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionLabel}>My Tickets</Text>
        <Pressable style={styles.rowCard} onPress={() => router.push('/certifications' as any)}>
          <Feather name="shield" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>
              {certs ? `${certs.total} certification${certs.total === 1 ? '' : 's'}` : 'Certifications'}
            </Text>
            {certs && (certs.expired > 0 || certs.expiringSoon > 0) ? (
              <Text style={[styles.rowSub, { color: colors.danger }]}>
                {certs.expired > 0 ? `${certs.expired} expired` : ''}
                {certs.expired > 0 && certs.expiringSoon > 0 ? ' · ' : ''}
                {certs.expiringSoon > 0 ? `${certs.expiringSoon} expiring within 30 days` : ''}
              </Text>
            ) : (
              <Text style={styles.rowSub}>WHMIS, fall arrest, first aid — tap to view or add</Text>
            )}
          </View>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>

        <Text style={styles.sectionLabel}>Safety Documents & Procedures</Text>
        {docs.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.rowSub}>
              Company safety procedures appear here once the office uploads them
              (Templates in the admin dashboard).
            </Text>
          </View>
        ) : (
          docs.map((d) => (
            <Pressable
              key={d.id}
              style={styles.rowCard}
              onPress={async () => {
                try {
                  const url = d.url ?? (d.storagePath ? await getDownloadURL(ref(storage, d.storagePath)) : null);
                  if (url) Linking.openURL(url);
                  else notify(d.title, 'No document attached yet — ask the office.');
                } catch (err: any) { notify('Could not open', err.message); }
              }}
            >
              <Feather name="file-text" size={20} color={colors.primary} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>{d.title}</Text>
              <Feather name={(d.url || d.storagePath) ? 'external-link' : 'chevron-right'} size={16} color={colors.textTertiary} />
            </Pressable>
          ))
        )}

        <Text style={styles.sectionLabel}>Quick Links</Text>
        <Pressable style={styles.rowCard} onPress={() => router.push('/timesheet' as any)}>
          <Feather name="calendar" size={20} color={colors.primary} />
          <Text style={[styles.rowTitle, { flex: 1 }]}>My Hours</Text>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
        <Pressable style={styles.rowCard} onPress={() => router.push('/forms/submitted' as any)}>
          <Feather name="check-square" size={20} color={colors.primary} />
          <Text style={[styles.rowTitle, { flex: 1 }]}>My Submitted Forms</Text>
          <Feather name="chevron-right" size={18} color={colors.textTertiary} />
        </Pressable>
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
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'], maxWidth: 640, width: '100%', alignSelf: 'center' },

  idCard: {
    alignItems: 'center', padding: spacing.xl, backgroundColor: colors.surface,
    borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
  },
  avatarText: { color: colors.primary, fontWeight: typography.weights.bold, fontSize: 26 },
  name: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  sub: { color: colors.textSecondary, marginTop: 2 },
  wcbLine: { marginTop: spacing.sm, color: colors.primary, fontWeight: typography.weights.semibold },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadows.card,
  },
  fieldLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.background,
  },
  saveBtn: {
    marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold },

  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.xs, ...shadows.card,
  },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, color: colors.text },
  rowSub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },

  langRow: { flexDirection: 'row', gap: spacing.sm },
  langChip: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  langChipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  langChipText: { color: colors.textSecondary, fontWeight: typography.weights.medium },
  langChipTextOn: { color: colors.primary, fontWeight: typography.weights.bold },
});
