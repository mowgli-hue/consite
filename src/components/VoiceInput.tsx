/**
 * VoiceInput component.
 *
 * The big teal mic button. Worker holds it, talks, releases.
 *
 * For v0.1 we use device-native speech recognition:
 *   - iOS: SFSpeechRecognizer via expo-speech-recognition
 *   - Android: SpeechRecognizer via expo-speech-recognition
 *   - Web: Web Speech API
 *
 * This is free and instant. The transcript then goes to our AI form-fill
 * Cloud Function for structured extraction.
 *
 * NOTE: expo-speech-recognition is a community plugin and needs a development
 * build (not Expo Go). For pure Expo Go testing in v0.1 we expose a manual
 * text input fallback so the demo still works without installing native deps.
 */

import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  TextInput,
  Platform,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme';

interface Props {
  /** Called when the worker finishes speaking with the final transcript. */
  onTranscript: (text: string) => void;
  /** Disable while AI is processing. */
  disabled?: boolean;
  /** Optional placeholder shown in the manual fallback input. */
  placeholder?: string;
  /** "Hold to talk" label override. */
  label?: string;
}

export function VoiceInput({
  onTranscript,
  disabled,
  placeholder = 'Tell me about today\'s work…',
  label,
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
  }, [isRecording, pulse]);

  async function startRecording() {
    if (disabled) return;

    // Try to load expo-speech-recognition lazily.
    // If it's not installed (Expo Go), fall back to manual entry.
    let SpeechRecognition: any;
    try {
      SpeechRecognition = require('expo-speech-recognition');
    } catch {
      setManualMode(true);
      return;
    }

    try {
      const perm = await SpeechRecognition.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone needed',
          'We need microphone access to fill the form by voice. You can also type it instead.',
          [
            { text: 'Type instead', onPress: () => setManualMode(true) },
            { text: 'OK' },
          ]
        );
        return;
      }

      setTranscript('');
      setIsRecording(true);

      const handler = (event: any) => {
        if (event?.results?.[0]?.transcript) {
          setTranscript(event.results[0].transcript);
        }
      };
      const endHandler = (event: any) => {
        setIsRecording(false);
        const final = event?.results?.[0]?.transcript ?? '';
        if (final) onTranscript(final);
      };

      SpeechRecognition.ExpoSpeechRecognitionModule?.addListener?.('result', handler);
      SpeechRecognition.ExpoSpeechRecognitionModule?.addListener?.('end', endHandler);

      await SpeechRecognition.ExpoSpeechRecognitionModule?.start?.({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
    } catch (err) {
      console.warn('Voice recognition failed, falling back to manual', err);
      setIsRecording(false);
      setManualMode(true);
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    try {
      const SpeechRecognition = require('expo-speech-recognition');
      await SpeechRecognition.ExpoSpeechRecognitionModule?.stop?.();
    } catch {}
    setIsRecording(false);
    if (transcript) onTranscript(transcript);
  }

  // ─── Manual fallback UI ─────────────────────────────────────────

  if (manualMode) {
    return (
      <ManualEntry
        placeholder={placeholder}
        onSubmit={(text) => {
          setManualMode(false);
          onTranscript(text);
        }}
        onSwitchToVoice={() => setManualMode(false)}
      />
    );
  }

  // ─── Main mic-button UI ─────────────────────────────────────────

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label ?? 'Now: tell me about today\'s work'}</Text>

      <Animated.View style={[styles.micWrap, { transform: [{ scale: pulse }] }]}>
        <Pressable
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={disabled}
          style={[
            styles.micButton,
            isRecording && styles.micButtonActive,
            disabled && styles.micButtonDisabled,
          ]}
        >
          <Feather
            name="mic"
            size={28}
            color={isRecording ? colors.textInverse : colors.textInverse}
          />
        </Pressable>
      </Animated.View>

      <Text style={styles.hint}>
        {isRecording ? 'Listening…' : 'Hold to talk'}
      </Text>

      {transcript ? (
        <View style={styles.transcript}>
          <Text style={styles.transcriptText}>"{transcript}"</Text>
        </View>
      ) : null}

      <Pressable hitSlop={8} onPress={() => setManualMode(true)}>
        <Text style={styles.fallbackLink}>Or type instead</Text>
      </Pressable>
    </View>
  );
}

// ─── Manual entry component ──────────────────────────────────────────

function ManualEntry({
  placeholder,
  onSubmit,
  onSwitchToVoice,
}: {
  placeholder: string;
  onSubmit: (text: string) => void;
  onSwitchToVoice: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <View style={styles.manualWrap}>
      <Text style={styles.label}>Describe today's work</Text>
      <TextInput
        style={styles.manualInput}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        autoFocus={Platform.OS !== 'web'}
      />
      <View style={styles.manualActions}>
        <Pressable hitSlop={8} onPress={onSwitchToVoice}>
          <Text style={styles.fallbackLink}>Switch to voice</Text>
        </Pressable>
        <Pressable
          style={[styles.submitBtn, !text.trim() && styles.submitBtnDisabled]}
          disabled={!text.trim()}
          onPress={() => onSubmit(text.trim())}
        >
          <Text style={styles.submitText}>Use this</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.lg },
  label: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  micWrap: {
    marginBottom: spacing.sm,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: {
    backgroundColor: colors.success,
  },
  micButtonDisabled: { opacity: 0.4 },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  transcript: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    maxWidth: 320,
  },
  transcriptText: {
    fontSize: typography.sizes.sm,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  fallbackLink: {
    marginTop: spacing.md,
    color: colors.primary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  manualWrap: { padding: spacing.lg },
  manualInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.md,
    color: colors.text,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  manualActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: {
    color: colors.textInverse,
    fontWeight: typography.weights.semibold,
  },
});
