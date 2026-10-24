/**
 * Cross-platform alert/confirm.
 *
 * React Native's Alert.alert is a NO-OP on web — the office dashboard
 * would silently swallow every confirmation and error. These helpers
 * use window.alert / window.confirm on web and Alert on native.
 */

import { Alert, Platform } from 'react-native';

/**
 * Non-blocking in-app toast (crew-test fix: native alert() freezes the
 * page on web, reads as an error, and said "offline — will sync" over a
 * working connection). Success feedback should never need an OK button.
 * ToastHost (components/ToastHost.tsx) renders these; toast() falls back
 * to notify() if no host is mounted.
 */
type ToastMsg = { title: string; body?: string; tone: 'success' | 'info' };
type ToastListener = (t: ToastMsg) => void;
let toastListener: ToastListener | null = null;

export function registerToastHost(fn: ToastListener): () => void {
  toastListener = fn;
  return () => { if (toastListener === fn) toastListener = null; };
}

export function toast(title: string, body?: string, tone: 'success' | 'info' = 'success') {
  if (toastListener) toastListener({ title, body, tone });
  else notify(title, body);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

export function confirm(title: string, message: string, onYes: () => void, yesLabel = 'OK') {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onYes();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: yesLabel, style: 'destructive', onPress: onYes },
    ]);
  }
}
