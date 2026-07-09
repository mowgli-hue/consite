/**
 * Cross-platform alert/confirm.
 *
 * React Native's Alert.alert is a NO-OP on web — the office dashboard
 * would silently swallow every confirmation and error. These helpers
 * use window.alert / window.confirm on web and Alert on native.
 */

import { Alert, Platform } from 'react-native';

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
