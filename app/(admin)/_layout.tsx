import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function AdminLayout() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'admin') return <Redirect href="/(worker)/dashboard" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
