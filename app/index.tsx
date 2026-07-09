/**
 * Root index — the gatekeeper.
 *
 * Watches auth state and redirects to the right route group:
 *  - not signed in       → /(auth)/login
 *  - signed in as worker → /(worker)/dashboard
 *  - signed in as admin  → /(admin)/dashboard
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { colors } from '../src/theme';

export default function Index() {
  const { ready, user } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace('/(auth)/login');
    } else if (user.role === 'admin' || user.role === 'manager') {
      router.replace('/(admin)/dashboard');
    } else {
      router.replace('/(worker)/dashboard');
    }
  }, [ready, user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
