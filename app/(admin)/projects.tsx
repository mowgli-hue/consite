/**
 * Admin → Projects. List sites, create and edit (name, address,
 * geofence center + radius, active flag).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';

import { db } from '../../src/lib/firebase';
import { useAuth } from '../../src/contexts/AuthContext';
import { notify } from '../../src/lib/notify';
import { listAllProjects } from '../../src/lib/adminUsers';
import { colors, spacing, radii, typography, shadows } from '../../src/theme';
import type { Project } from '../../src/types';

export default function AdminProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listAllProjects());
    } catch (err: any) {
      notify('Could not load projects', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Projects</Text>
        <Pressable hitSlop={8} onPress={() => setEditing(editing ? null : 'new')}>
          <Feather name={editing ? 'x' : 'plus'} size={24} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {editing && (
            <ProjectForm
              project={editing === 'new' ? null : editing}
              onDone={() => { setEditing(null); load(); }}
            />
          )}

          {projects.map((p) => (
            <Pressable key={p.id} style={styles.card} onPress={() => router.push(`/project?id=${p.id}` as any)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}{!p.active && <Text style={styles.inactive}>  · INACTIVE</Text>}</Text>
                <Text style={styles.sub}>{p.address}</Text>
                <Text style={styles.sub}>
                  Stage: {(p.stage ?? 'contract').toUpperCase()} · {p.memberUids?.length ?? 0} workers
                  {p.clientName ? ` · ${p.clientName}` : ''}
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={() => setEditing(p)}>
                <Feather name="edit-2" size={16} color={colors.textTertiary} />
              </Pressable>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ProjectForm({ project, onDone }: { project: Project | null; onDone: () => void }) {
  const { user: me } = useAuth();
  const [name, setName] = useState(project?.name ?? '');
  const [address, setAddress] = useState(project?.address ?? '');
  const [lat, setLat] = useState(project ? String(project.geofence.center.lat) : '');
  const [lng, setLng] = useState(project ? String(project.geofence.center.lng) : '');
  const [radius, setRadius] = useState(String(project?.geofence.radiusM ?? 150));
  const [geofenceEnabled, setGeofenceEnabled] = useState(project?.geofenceEnabled ?? true);
  const [active, setActive] = useState(project?.active ?? true);
  const [busy, setBusy] = useState(false);

  function useMyLocation() {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); },
        () => notify('Location unavailable', 'Enter coordinates manually (right-click a spot in Google Maps to copy them).'),
      );
    } else {
      notify('Tip', 'Right-click the site in Google Maps and copy the coordinates.');
    }
  }

  async function submit() {
    const latN = parseFloat(lat); const lngN = parseFloat(lng); const radN = parseInt(radius, 10);
    if (!name.trim() || !address.trim()) { notify('Missing info', 'Name and address are required.'); return; }
    if (geofenceEnabled && (Number.isNaN(latN) || Number.isNaN(lngN) || Number.isNaN(radN))) {
      notify('Geofence incomplete', 'Latitude, longitude and radius are required when geofence is on.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        geofence: { center: { lat: latN || 0, lng: lngN || 0 }, radiusM: radN || 150 },
        geofenceEnabled,
        active,
      };
      if (project) {
        await updateDoc(doc(db, 'projects', project.id), payload);
        notify('Project updated', name);
      } else {
        await addDoc(collection(db, 'projects'), {
          ...payload,
          memberUids: [], supervisorUids: [],
          createdAt: Date.now(), createdBy: me?.uid ?? 'admin',
        });
        notify('Project created', `${name} is ready. Assign workers from Users.`);
      }
      onDone();
    } catch (err: any) {
      notify('Save failed', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', marginBottom: spacing.lg }]}>
      <Text style={styles.formTitle}>{project ? 'Edit project' : 'New project'}</Text>
      <TextInput style={styles.input} placeholder="Site name" placeholderTextColor={colors.textTertiary} value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Address" placeholderTextColor={colors.textTertiary} value={address} onChangeText={setAddress} />

      <View style={styles.row}>
        <Text style={styles.label}>GPS geofence</Text>
        <Switch value={geofenceEnabled} onValueChange={setGeofenceEnabled} />
      </View>

      {geofenceEnabled && (
        <>
          <View style={styles.coordRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Latitude" placeholderTextColor={colors.textTertiary} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Longitude" placeholderTextColor={colors.textTertiary} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.coordRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Radius (m)" placeholderTextColor={colors.textTertiary} value={radius} onChangeText={setRadius} keyboardType="number-pad" />
            <Pressable style={styles.locBtn} onPress={useMyLocation}>
              <Feather name="crosshair" size={16} color={colors.primary} />
              <Text style={styles.locBtnText}>Use my location</Text>
            </Pressable>
          </View>
        </>
      )}

      <View style={styles.row}>
        <Text style={styles.label}>Active</Text>
        <Switch value={active} onValueChange={setActive} />
      </View>

      <Pressable style={[styles.button, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color={colors.textInverse} /> : <Text style={styles.buttonText}>{project ? 'Save changes' : 'Create project'}</Text>}
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, marginBottom: spacing.sm, ...shadows.card,
  },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text },
  inactive: { fontSize: typography.sizes.xs, color: colors.danger, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: 1 },

  formTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text, marginBottom: spacing.md },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md,
    marginBottom: spacing.sm, color: colors.text, backgroundColor: colors.background,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm },
  label: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textSecondary },
  coordRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md,
    paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.primary,
    marginBottom: spacing.sm,
  },
  locBtnText: { color: colors.primary, fontWeight: typography.weights.medium, fontSize: typography.sizes.sm },
  button: {
    marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  buttonText: { color: colors.textInverse, fontWeight: typography.weights.semibold, fontSize: typography.sizes.md },
});
