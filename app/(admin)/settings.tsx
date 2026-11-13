/**
 * Admin → Settings. The company's own control panel — so Consite is
 * THEIR application, not a thing they phone us to change:
 *   · company name
 *   · how strict projects are (checks as advice vs. hard gates)
 *   · who receives every signed form PDF by email
 *   · send us feedback / request a change (emails Jungle Labs)
 *   · my account (password reset, sign out)
 * Admins change; managers see it read-only but can still send feedback.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';

import { auth } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify, toast } from '../../src/lib/notify';
import {
  loadAppSettings, saveAppSettings, sendFeedback, DEFAULT_SETTINGS, type AppSettings,
} from '../../src/lib/settings';
import { colors, spacing, radii, typography, shadows, touch } from '../../src/theme';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function AdminSettings() {
  const { user, signOut } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [companyDraft, setCompanyDraft] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const s = await loadAppSettings();
    setSettings(s);
    setCompanyDraft(s.companyName);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<AppSettings>, okMsg: string) {
    try {
      await saveAppSettings(patch);
      setSettings((s) => ({ ...(s ?? DEFAULT_SETTINGS), ...patch }));
      toast('Saved ✓', okMsg);
    } catch (e) {
      notify('Could not save', e instanceof Error ? e.message : String(e));
    }
  }

  function addEmail() {
    const e = emailDraft.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { notify('Check the address', 'That doesn’t look like an email address.'); return; }
    const list = settings?.recordsEmails ?? [];
    if (list.includes(e)) { setEmailDraft(''); return; }
    setEmailDraft('');
    save({ recordsEmails: [...list, e] }, `${e} will get every signed form.`);
  }

  async function submitFeedback() {
    if (!user || feedback.trim().length < 3) { notify('Write a few words', 'Tell us what you need changed or what went wrong.'); return; }
    setSending(true);
    try {
      await sendFeedback({ text: feedback, uid: user.uid, name: user.displayName, email: user.email, page: 'Settings' });
      setFeedback('');
      toast('Sent ✓', 'We got it — we’ll get back to you.');
    } catch (e) {
      notify('Could not send', e instanceof Error ? e.message : String(e));
    } finally { setSending(false); }
  }

  async function resetMyPassword() {
    if (!user?.email) return;
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast('Email sent ✓', `Check ${user.email} for the link to set a new password.`);
    } catch (e) {
      notify('Could not send the email', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      {settings === null ? (
        <ActivityIndicator style={{ marginTop: spacing['2xl'] }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {!isAdmin && (
            <Text style={styles.readOnly}>You have view-only access — an admin can change these. You can still send feedback below.</Text>
          )}

          {/* Company */}
          <Text style={styles.sectionLabel}>Company</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Company name</Text>
            <View style={styles.inlineRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={companyDraft} onChangeText={setCompanyDraft} editable={isAdmin}
                placeholder="e.g. Brown Bros Framing & Drywall" placeholderTextColor={colors.textTertiary}
              />
              {isAdmin && companyDraft.trim() !== settings.companyName && (
                <Pressable style={styles.smallBtn} onPress={() => save({ companyName: companyDraft.trim() }, 'Company name updated.')}>
                  <Text style={styles.smallBtnText}>Save</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Lifecycle strictness */}
          <Text style={styles.sectionLabel}>Projects</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Require every check before moving a project forward</Text>
                <Text style={styles.rowSub}>
                  {settings.strictLifecycle
                    ? 'ON — a project can’t advance until its checklist is fully green.'
                    : 'OFF — the checklist is a guide. You can move a project to any stage, any time.'}
                </Text>
              </View>
              <Switch
                value={settings.strictLifecycle}
                disabled={!isAdmin}
                onValueChange={(v) => save({ strictLifecycle: v }, v ? 'Checks are now required.' : 'Checks are now just a guide.')}
              />
            </View>
          </View>

          {/* Records recipients */}
          <Text style={styles.sectionLabel}>Who gets the form PDFs by email</Text>
          <View style={styles.card}>
            <Text style={styles.rowSub}>
              Every signed form (FLHA, end-of-day, QC…) is emailed as a PDF. Add the people who should receive them.
            </Text>
            {(settings.recordsEmails ?? []).map((e) => (
              <View key={e} style={styles.emailRow}>
                <Feather name="mail" size={16} color={colors.textSecondary} />
                <Text style={styles.emailText}>{e}</Text>
                {isAdmin && (
                  <Pressable
                    hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${e}`}
                    onPress={() => save({ recordsEmails: settings.recordsEmails.filter((x) => x !== e) }, `${e} removed.`)}
                  >
                    <Feather name="x" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            ))}
            {isAdmin && (
              <View style={[styles.inlineRow, { marginTop: spacing.md }]}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={emailDraft} onChangeText={setEmailDraft}
                  placeholder="office@yourcompany.ca" placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none" keyboardType="email-address"
                  onSubmitEditing={addEmail}
                />
                <Pressable style={styles.smallBtn} onPress={addEmail}>
                  <Text style={styles.smallBtnText}>Add</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.hint}>
              Every form is always saved in the app (Project → Forms) whether or not the email arrives.
            </Text>
          </View>

          {/* Feedback */}
          <Text style={styles.sectionLabel}>Need something changed?</Text>
          <View style={styles.card}>
            <Text style={styles.rowSub}>
              Tell us what you need — a change, a new feature, something that isn’t working. It goes straight to the Consite team.
            </Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={feedback} onChangeText={setFeedback} multiline
              placeholder="e.g. We need a field for lot number on each project…"
              placeholderTextColor={colors.textTertiary}
            />
            <Pressable style={[styles.primaryBtn, sending && { opacity: 0.5 }]} disabled={sending} onPress={submitFeedback}>
              {sending
                ? <ActivityIndicator color={colors.textInverse} />
                : <><Feather name="send" size={18} color={colors.textInverse} /><Text style={styles.primaryBtnText}>Send to the Consite team</Text></>}
            </Pressable>
          </View>

          {/* Account */}
          <Text style={styles.sectionLabel}>My account</Text>
          <View style={styles.card}>
            <Text style={styles.rowTitle}>{user?.displayName}</Text>
            <Text style={styles.rowSub}>{user?.email} · {user?.role === 'admin' ? 'Admin' : 'Manager (view only)'}</Text>
            <Pressable style={styles.outlineBtn} onPress={resetMyPassword}>
              <Feather name="key" size={18} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Email me a link to change my password</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={signOut}>
              <Feather name="log-out" size={18} color={colors.primary} />
              <Text style={styles.outlineBtnText}>Sign out</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
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
  readOnly: {
    backgroundColor: colors.warningSoft, color: colors.text, borderRadius: radii.md,
    padding: spacing.md, fontSize: typography.sizes.sm,
  },

  sectionLabel: {
    fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xl, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, ...shadows.card,
  },
  fieldLabel: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    color: colors.text, backgroundColor: colors.background, fontSize: typography.sizes.md, minHeight: touch.min,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top', marginTop: spacing.md },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  rowSub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 2 },
  hint: { fontSize: typography.sizes.xs, color: colors.textTertiary, marginTop: spacing.md },

  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: touch.min, borderBottomWidth: 1, borderColor: colors.border,
  },
  emailText: { flex: 1, color: colors.text, fontSize: typography.sizes.md },

  smallBtn: {
    backgroundColor: colors.primary, borderRadius: radii.md,
    minHeight: touch.min, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center',
  },
  smallBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold },
  primaryBtn: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md,
    minHeight: touch.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md },
  outlineBtn: {
    marginTop: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radii.md,
    minHeight: touch.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  outlineBtnText: { color: colors.primary, fontWeight: typography.weights.semibold },
});
