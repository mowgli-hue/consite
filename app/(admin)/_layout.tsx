import { View } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { SideNav, type NavItem } from '../../src/components/SideNav';
import { BottomBar } from '../../src/components/BottomBar';

// Routes are GROUP-QUALIFIED: /projects, /crew and /dashboard also exist
// in the (worker) group, and the bare path can resolve to the worker
// screen — whose layout bounces admins back to the dashboard. That made
// the Projects sidebar item "open the Dashboard". `match` keeps the
// active-highlight working on the group-less pathname.
// Grouped per the UX audit (N4): Today · Sites · Safety · Admin.
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'grid', route: '/(admin)/dashboard', match: '/dashboard', section: 'Today' },
  { label: 'Inbox', icon: 'bell', route: '/(admin)/inbox', match: '/inbox', section: 'Today' },
  { label: 'Search', icon: 'search', route: '/(admin)/search', match: '/search', section: 'Today' },
  { label: 'Site Timeline', icon: 'image', route: '/(admin)/timeline', match: '/timeline', section: 'Today' },
  { label: 'Projects', icon: 'briefcase', route: '/(admin)/sites', match: '/sites', section: 'Sites' },
  { label: 'Crew Board', icon: 'columns', route: '/(admin)/crew', match: '/crew', section: 'Sites' },
  { label: 'Money', icon: 'dollar-sign', route: '/(admin)/money', match: '/money', section: 'Sites' },
  { label: 'Hours & Reports', icon: 'bar-chart-2', route: '/(admin)/reports', match: '/reports', section: 'Sites' },
  { label: 'Safety Center', icon: 'shield', route: '/(admin)/safety', match: '/safety', section: 'Safety' },
  { label: 'Compliance', icon: 'award', route: '/(admin)/compliance', match: '/compliance', section: 'Safety' },
  { label: 'Users', icon: 'users', route: '/(admin)/users', match: '/users', section: 'Admin' },
  { label: 'Clients', icon: 'phone', route: '/(admin)/clients', match: '/clients', section: 'Admin' },
  { label: 'Forms & Documents', icon: 'folder', route: '/(admin)/library', match: '/library', section: 'Admin' },
];

// Phone bottom bar: the four everyday destinations; the rest in More.
const BOTTOM_PRIMARY = NAV_ITEMS.filter((i) =>
  ['Dashboard', 'Projects', 'Crew Board', 'Inbox'].includes(i.label))
  .map((i) => (i.label === 'Dashboard' ? { ...i, label: 'Home' } : i.label === 'Crew Board' ? { ...i, label: 'Crew' } : i.label === 'Projects' ? { ...i, label: 'Sites' } : i));
const BOTTOM_MORE = NAV_ITEMS.filter((i) =>
  !['Dashboard', 'Projects', 'Crew Board', 'Inbox'].includes(i.label));

export default function AdminLayout() {
  const { ready, user } = useAuth();
  if (!ready) return null;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role !== 'admin' && user.role !== 'manager') return <Redirect href="/(worker)/dashboard" />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SideNav items={NAV_ITEMS} title="Office" />
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </View>
      <BottomBar primary={BOTTOM_PRIMARY} more={BOTTOM_MORE} />
    </View>
  );
}
