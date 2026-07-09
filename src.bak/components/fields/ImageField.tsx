/**
 * Image field.
 *
 * Uses expo-image-picker to capture or select images. For v0.1 we store local
 * URIs in values. v0.2 will upload to Firebase Storage on submit and store
 * storage paths instead.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';

import { FieldWrapper } from './FieldWrapper';
import { colors, spacing, radii, typography } from '../../theme';
import type { ImageField as ImageFieldSchema } from '../../types';

interface Props {
  field: ImageFieldSchema;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}

export function ImageField({ field, value, onChange }: Props) {
  const [working, setWorking] = useState(false);
  const max = field.max ?? 1;
  const uris = value ?? [];

  async function pick(source: 'camera' | 'library') {
    if (uris.length >= max) {
      Alert.alert('Limit reached', `Max ${max} image${max > 1 ? 's' : ''}.`);
      return;
    }

    setWorking(true);
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant access in Settings.');
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });

      if (!result.canceled && result.assets[0]) {
        onChange([...uris, result.assets[0].uri]);
      }
    } finally {
      setWorking(false);
    }
  }

  function remove(i: number) {
    onChange(uris.filter((_, idx) => idx !== i));
  }

  return (
    <FieldWrapper label={field.label} required={field.required} helperText={field.helperText}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {uris.map((uri, i) => (
          <View key={i} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} />
            <Pressable style={styles.remove} hitSlop={6} onPress={() => remove(i)}>
              <Feather name="x" size={12} color={colors.textInverse} />
            </Pressable>
          </View>
        ))}

        {uris.length < max && (
          <>
            <Pressable
              style={styles.addButton}
              onPress={() => pick('camera')}
              disabled={working}
            >
              <Feather name="camera" size={20} color={colors.primary} />
              <Text style={styles.addLabel}>Camera</Text>
            </Pressable>
            {!field.cameraOnly && (
              <Pressable
                style={styles.addButton}
                onPress={() => pick('library')}
                disabled={working}
              >
                <Feather name="image" size={20} color={colors.primary} />
                <Text style={styles.addLabel}>Library</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </FieldWrapper>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingRight: spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 84, height: 84, borderRadius: radii.md, backgroundColor: colors.surfaceAlt },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 84,
    height: 84,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
});
