import { View } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { SideNav, type NavItem } from '../../src/components/SideNav';

// Routes are GROUP-QUALIFIED: /projects, /crew and /dashboard also exist
// in the (worker) group, and the bare path can resolve to the worker
// screen — whose layout bounces admins back to the dashboard. That made
// the Projects sidebar item "open the Dashboard". `match` keeps the
// active-highlight working on the group-less pathname.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'grid', route: '/(admin)/dashboard', match: '/dashboard' },
  { label: 'Search', icon: 'search', route: '/(admin)/search', match: '/search' },
  { label: 'Inbox', icon: 'bell', route: '/(admin)/inbox', match: '/inbox' },
  { label: 'Site Timeline', icon: 'image', route: '/(admin)/timeline', match: '/timeline' },
  { label: 'Money', icon: 'dollar-sign', route: '/(admin)/money', match: '/money' },
  { label: 'Hours & Reports', icon: 'bar-chart-2', route: '/(admin)/reports', match: '/reports' },
  { label: 'Crew Board', icon: 'columns', route: '/(admin)/crew', match: '/crew' },
  { label: 'Users', icon: 'users', route: '/(admin)/users', match: '/users' },
  { label: 'Clients', icon: 'phone', route: '/(admin)/clients', match: '/clients' },
  { label: 'Projects', icon: 'briefcase', route: '/(admin)/sites', match: '/sites' },
  { label: 'Forms & Documents', icon: 'folder', route: '/(admin)/library', match: '/library' },
  { label: 'Safety Center', icon: 'shield', route: '/(admin)/safety', match: '/safety' },
  { label: 'Compliance', icon: 'award', route: '/(admin)/compliance', match: '/compliance' },
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
