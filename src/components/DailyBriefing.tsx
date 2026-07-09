/**
 * Daily Briefing — Layer 2 v0. Intelligence, not buttons.
 *
 * Adapts to what the signed-in user is allowed to see:
 *   foreman  → crew on site, pending hour approvals, site FLHA status,
 *              open deficiencies
 *   worker   → own shift status, own FLHA today, open punch list, own
 *              expiring tickets
 * Each stat loads independently and simply doesn't render if the query
 * is denied or empty — the briefing never blocks the dashboard.
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { collection, doc, getDoc, getDocs, limit, query, where, Timestamp } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, radii, typography, shadows } from '../theme';

type Line = {
  id: string;
  icon: keyof typeof Feather.glyphMap;
  text: string;
  tone?: 'ok' | 'warn' | 'info';
  route?: string;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dayStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function DailyBriefing() {
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>([]);
  const [projectName, setProjectName] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    const pid = user.projectIds?.[0];
    if (!pid) return;
    let cancelled = false;

    (async () => {
      const out: Line[] = [];
      const add = (l: Line) => { if (!cancelled) out.push(l); };

      // Project name + my role on it
      let isForeman = false;
      try {
        const [proj, member] = await Promise.all([
          getDoc(doc(db, 'projects', pid)),
          getDoc(doc(db, 'projects', pid, 'members', user.uid)),
        ]);
        if (!cancelled) setProjectName(proj.data()?.name ?? '');
        const role = member.data()?.role;
        const perms: string[] = member.data()?.permissions ?? [];
        isForeman = role === 'foreman' || role === 'lead-foreman' || role === 'supervisor' ||
          perms.includes('supervisor.attendance.approve');
      } catch { /* keep going */ }

      // Crew on site now (foreman) / my shift (worker)
      try {
        if (isForeman) {
          const open = await getDocs(query(
            collection(db, 'projects', pid, 'attendance'),
            where('clockOutAt', '==', null),
          ));
          add({
            id: 'onsite', icon: 'users',
            text: open.size === 0 ? 'Nobody on site yet' : `${open.size} on site right now`,
            tone: open.size > 0 ? 'ok' : 'info',
            route: '/clock',
          });
        } else {
          const mine = await getDocs(query(
            collection(db, 'projects', pid, 'attendance'),
            where('uid', '==', user.uid),
            where('clockOutAt', '==', null),
            limit(1),
          ));
          add({
            id: 'shift', icon: 'clock',
            text: mine.empty ? 'Not clocked in yet' : 'You are on the clock',
            tone: mine.empty ? 'warn' : 'ok',
            route: '/clock',
          });
        }
      } catch { /* permission — skip */ }

      // Pending hour approvals (foreman only)
      if (isForeman) {
        try {
          const pending = await getDocs(query(
            collection(db, 'projects', pid, 'attendance'),
            where('status', '==', 'pending'),
          ));
          if (pending.size > 0) {
            add({
              id: 'approvals', icon: 'check-circle',
              text: `${pending.size} shift${pending.size === 1 ? '' : 's'} waiting for your approval`,
              tone: 'warn', route: '/crew',
            });
          }
        } catch { /* skip */ }
      }

      // FLHA today — mine (worker) or any (foreman)
      try {
        const since = Timestamp.fromMillis(dayStartMs());
        const q1 = isForeman
          ? query(collection(db, 'projects', pid, 'submissions'), where('submittedAt', '>=', since), limit(5))
          : query(collection(db, 'projects', pid, 'submissions'), where('submittedBy', '==', user.uid), where('submittedAt', '>=', since), limit(5));
        const subs = await getDocs(q1);
        add({
          id: 'flha', icon: 'shield',
          text: subs.empty
            ? (isForeman ? 'No FLHA submitted for the site today' : 'Your FLHA is not done today')
            : (isForeman ? 'Site FLHA is done for today' : 'Your FLHA is done — good to work'),
          tone: subs.empty ? 'warn' : 'ok',
        });
      } catch { /* composite index or perms — skip quietly */ }

      // Open deficiencies (any member can read)
      try {
        const defs = await getDocs(query(
          collection(db, 'projects', pid, 'deficiencies'),
          where('status', '==', 'open'),
        ));
        if (defs.size > 0) {
          add({
            id: 'defs', icon: 'alert-triangle',
            text: `${defs.size} open deficienc${defs.size === 1 ? 'y' : 'ies'} on the punch list`,
            tone: 'warn', route: `/punch-list?projectId=${pid}`,
          });
        }
      } catch { /* skip */ }

      // My tickets expiring within 30 days
      try {
        const certs = await getDocs(collection(db, 'users', user.uid, 'certifications'));
        const soon = Date.now() + 30 * 86_400_000;
        const expiring = certs.docs.filter((d) => {
          const e = d.data().expiresAt;
          return typeof e === 'number' && e < soon;
        }).length;
        if (expiring > 0) {
          add({
            id: 'certs', icon: 'credit-card',
            text: `${expiring} of your ticket${expiring === 1 ? '' : 's'} expire${expiring === 1 ? 's' : ''} within 30 days`,
            tone: 'warn', route: '/certifications',
          });
        }
      } catch { /* skip */ }

      if (!cancelled) setLines(out);
    })();

    return () => { cancelled = true; };
  }, [user?.uid, user?.projectIds?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || lines.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.greeting}>
        {greeting()}, {user.displayName?.split(' ')[0] ?? 'there'}.
        {projectName ? <Text style={styles.project}>  {projectName}</Text> : null}
      </Text>
      {lines.map((l) => (
        <Pressable
          key={l.id}
          style={styles.line}
          disabled={!l.route}
          onPress={() => l.route && router.push(l.route as any)}
        >
          <Feather
            name={l.icon}
            size={15}
            color={l.tone === 'warn' ? colors.warning : l.tone === 'ok' ? colors.success : colors.primary}
          />
          <Text style={styles.lineText}>{l.text}</Text>
          {l.route && <Feather name="chevron-right" size={14} color={colors.textTertiary} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  greeting: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  project: { color: colors.textSecondary, fontWeight: typography.weights.medium, fontSize: typography.sizes.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  lineText: { flex: 1, color: colors.text, fontSize: typography.sizes.sm, lineHeight: 19 },
});
