import { View } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { SideNav, type NavItem } from '../../src/components/SideNav';

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'grid', route: '/dashboard' },
  { label: 'Search', icon: 'search', route: '/search' },
  { label: 'Inbox', icon: 'bell', route: '/inbox' },
  { label: 'Site Timeline', icon: 'image', route: '/timeline' },
  { label: 'Hours & Reports', icon: 'bar-chart-2', route: '/reports' },
  { label: 'Users', icon: 'users', route: '/users' },
  { label: 'Clients', icon: 'phone', route: '/clients' },
  { label: 'Projects', icon: 'briefcase', route: '/projects' },
  { label: 'Compliance', icon: 'shield', route: '/compliance' },
];

export default function AdminLayout() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'admin' && user.role !== 'manager') return <Redirect href="/(worker)/dashboard" />;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <SideNav items={NAV_ITEMS} title="Office" />
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </View>
  );
}
