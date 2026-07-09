/**
 * Admin → Users. List workers, create new accounts, toggle active,
 * assign/remove projects.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '../../src/contexts/AuthContext';
import { notify, confirm } from '../../src/lib/notify';
import {
  listUsers, listAllProjects, createWorkerAccount, setUserActive,
  assignToProject, removeFromProject, setMemberRole, type MemberRole,
} from '../../src/lib/adminUsers';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../src/lib/firebase';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { User, Project } from '../../src/types';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memberRoles, setMemberRoles] = useState<Record<string, MemberRole>>({});

  // When a user card expands, load their per-project roles.
  useEffect(() => {
    (async () => {
      if (!expanded) return;
      const u = users.find((x) => x.uid === expanded);
      if (!u) return;
      const updates: Record<string, MemberRole> = {};
      for (const pid of u.projectIds ?? []) {
        const m = await getDoc(doc(db, 'projects', pid, 'members', u.uid));
        const r = (m.data()?.role ?? 'worker') as string;
        updates[`${u.uid}:${pid}`] = (r === 'supervisor' ? 'foreman' : r) as MemberRole;
      }
      setMemberRoles((prev) => ({ ...prev, ...updates }));
    })();
  }, [expanded, users]);

  const ROLE_LABELS: Record<MemberRole, string> = {
    worker: 'Worker',
    foreman: 'Foreman',
    'lead-foreman': 'Lead Foreman',
  };

  async function cycleRole(u: User, projectId: string) {
    const key = `${u.uid}:${projectId}`;
    const current = memberRoles[key] ?? 'worker';
    const next: MemberRole =
      current === 'worker' ? 'foreman' : current === 'foreman' ? 'lead-foreman' : 'worker';
    try {
      await setMemberRole(u.uid, projectId, next);
      setMemberRoles((prev) => ({ ...prev, [key]: next }));
    } catch (err: any) {
      notify('Role change failed', err.message);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([listUsers(), listAllProjects()]);
      setUsers(u);
      setProjects(p);
    } catch (err: any) {
      notify('Could not load users', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(u: User) {
    try {
      await setUserActive(u.uid, !u.active);
      await load();
    } catch (err: any) {
      notify('Update failed', err.message);
    }
  }

  async function toggleProject(u: User, p: Project) {
    if (!me) return;
    const assigned = (u.projectIds ?? []).includes(p.id);
    try {
      if (assigned) await removeFromProject(u.uid, p.id);
      else await assignToProject(u.uid, p.id, me.uid, u.displayName);
      await load();
    } catch (err: any) {
      notify('Assignment failed', err.message);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Users</Text>
        {me?.role === 'admin' ? (
          <Pressable hitSlop={8} onPress={() => setShowCreate((v) => !v)}>
            <Feather name={showCreate ? 'x' : 'user-plus'} size={22} color={colors.primary} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {showCreate && (
            <CreateWorkerCard
              projects={projects}
              onDone={() => { setShowCreate(false); load(); }}
            />
          )}

          {users.map((u) => {
            const isOpen = expanded === u.uid;
            return (
              <View key={u.uid} style={styles.card}>
                <Pressable style={styles.cardRow} onPress={() => setExpanded(isOpen ? null : u.uid)}>
                  <View style={[styles.avatar, !u.active && { backgroundColor: colors.border }]}>
                    <Text style={styles.avatarText}>{u.displayName?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {u.displayName} {u.role !== 'worker' && <Text style={styles.adminBadge}> {u.role.toUpperCase()}</Text>}
                    </Text>
                    <Text style={styles.sub}>{u.email}{u.phone ? ` · ${u.phone}` : ''}</Text>
                    <Text style={styles.sub}>
                      {(u.projectIds ?? []).length} project{(u.projectIds ?? []).length === 1 ? '' : 's'}
                      {!u.active && ' · DEACTIVATED'}
                    </Text>
                  </View>
                  <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
                </Pressable>

                {isOpen && (
                  <View style={styles.detail}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Active</Text>
                      <Switch
                        value={u.active}
                        onValueChange={() =>
                          u.active
                            ? confirm('Deactivate user?', `${u.displayName} will no longer be able to sign in features.`, () => toggleActive(u), 'Deactivate')
                            : toggleActive(u)
                        }
                        disabled={u.uid === me?.uid}
                      />
                    </View>
                    <Text style={[styles.detailLabel, { marginTop: spacing.md }]}>
                      Projects — tap the role chip to promote
                    </Text>
                    {projects.map((p) => {
                      const assigned = (u.projectIds ?? []).includes(p.id);
                      const role = memberRoles[`${u.uid}:${p.id}`] ?? 'worker';
                      return (
                        <View key={p.id} style={styles.projRow}>
                          <Pressable
                            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}
                            onPress={() => toggleProject(u, p)}
                          >
                            <Feather
                              name={assigned ? 'check-square' : 'square'}
                              size={18}
                              color={assigned ? colors.primary : colors.textTertiary}
                            />
                            <Text style={styles.projName}>{p.name}</Text>
                          </Pressable>
                          {assigned && (
                            <Pressable
                              style={[styles.roleChip, role !== 'worker' && styles.roleChipOn]}
                              onPress={() => cycleRole(u, p.id)}
                            >
                              <Text style={[styles.roleChipText, role !== 'worker' && styles.roleChipTextOn]}>
                                {ROLE_LABELS[role]}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CreateWorkerCard({ projects, onDone }: { projects: Project[]; onDone: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [role, setRole] = useState<'worker' | 'manager' | 'admin'>('worker');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!displayName.trim() || !email.trim() || password.length < 8) {
      notify('Missing info', 'Name, email and a password of at least 8 characters are required.');
      return;
    }
    setBusy(true);
    try {
      await createWorkerAccount({
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role,
        projectIds,
      });
      notify('Account created', `${displayName} can now sign in with ${email.trim()}.`);
      onDone();
    } catch (err: any) {
      notify('Create failed', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { padding: spacing.lg, marginBottom: spacing.lg }]}>
      <Text style={styles.formTitle}>New account</Text>
      <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={colors.textTertiary} value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textTertiary} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Phone (+16045551234, for SMS)" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.input} placeholder="Temporary password (8+ chars)" placeholderTextColor={colors.textTertiary} autoCapitalize="none" value={password} onChangeText={setPassword} />

      <Text style={styles.detailLabel}>Account type</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
        {([
          { id: 'worker', label: 'Worker' },
          { id: 'manager', label: 'Manager (view-only)' },
          { id: 'admin', label: 'Admin' },
        ] as const).map((r) => (
          <Pressable
            key={r.id}
            style={[styles.roleChip, role === r.id && styles.roleChipOn]}
            onPress={() => setRole(r.id)}
          >
            <Text style={[styles.roleChipText, role === r.id && styles.roleChipTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.detailLabel, { marginTop: spacing.sm }]}>Assign to projects</Text>
      {projects.filter((p) => p.active).map((p) => {
        const on = projectIds.includes(p.id);
        return (
          <Pressable
            key={p.id}
            style={styles.projRow}
            onPress={() => setProjectIds((ids) => (on ? ids.filter((i) => i !== p.id) : [...ids, p.id]))}
          >
            <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? colors.primary : colors.textTertiary} />
            <Text style={styles.projName}>{p.name}</Text>
          </Pressable>
        );
      })}

      <Pressable style={[styles.button, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.buttonText}>Create account</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  headerTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing['3xl'] },

  card: {
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm, ...shadows.card,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  adminBadge: { fontSize: typography.sizes.xs, color: colors.primary, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },

  detail: { borderTopWidth: 1, borderColor: colors.border, padding: spacing.lg, paddingTop: spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  detailLabel: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary },
  projRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  projName: { color: colors.text, fontSize: typography.sizes.md },
  roleChip: {
    paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  roleChipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleChipText: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  roleChipTextOn: { color: colors.primary, fontWeight: typography.weights.semibold },

  formTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    marginBottom: spacing.sm, color: colors.text, backgroundColor: colors.background,
  },
  button: {
    marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  buttonText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md },
});
