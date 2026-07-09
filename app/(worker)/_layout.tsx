import { View, useWindowDimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useT } from '../../src/contexts/I18nContext';
import { SideNav, type NavItem } from '../../src/components/SideNav';
import { colors } from '../../src/theme';

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', icon: 'home', route: '/dashboard' },
  { label: 'Clock In / Out', icon: 'clock', route: '/clock' },
  { label: 'My Tasks', icon: 'clipboard', route: '/tasks' },
  { label: 'AI Scan', icon: 'camera', route: '/scan' },
  { label: 'Work Update', icon: 'image', route: '/work-log' },
  { label: 'My Hours', icon: 'calendar', route: '/timesheet' },
  { label: 'Crew Hours', icon: 'users', route: '/crew' },
  { label: 'Site Drawings', icon: 'map', route: '/drawings' },
  { label: 'Forms', icon: 'check-square', route: '/forms' },
  { label: 'Punch List', icon: 'alert-triangle', route: '/punch-list' },
  { label: 'Projects', icon: 'briefcase', route: '/projects' },
  { label: 'My Tickets', icon: 'shield', route: '/certifications' },
  { label: 'My Profile', icon: 'user', route: '/profile' },
];

export default function WorkerLayout() {
  const { ready, user } = useAuth();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  if (!ready) return null;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role === 'admin') return <Redirect href="/(admin)/dashboard" />;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <SideNav items={NAV_ITEMS} title="Field" />
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textTertiary,
            // Desktop uses the sidebar; phones keep three thumb-sized tabs.
            tabBarStyle: wide ? { display: 'none' } : { borderTopColor: colors.border },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: t('Home'),
              tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="clock"
            options={{
              title: t('Clock'),
              tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} />,
            }}
          />
          <Tabs.Screen
            name="tasks"
            options={{
              title: t('Tasks'),
              tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} />,
            }}
          />
          {/* Everything else opens from cards/menu — never as a bottom tab. */}
          <Tabs.Screen name="projects/index" options={{ href: null }} />
          <Tabs.Screen name="projects/[id]" options={{ href: null }} />
          <Tabs.Screen name="forms/[formId]" options={{ href: null }} />
          <Tabs.Screen name="forms/index" options={{ href: null }} />
          <Tabs.Screen name="daily-log" options={{ href: null }} />
          <Tabs.Screen name="deficiency" options={{ href: null }} />
          <Tabs.Screen name="receipt" options={{ href: null }} />
          <Tabs.Screen name="punch-list" options={{ href: null }} />
          <Tabs.Screen name="certifications" options={{ href: null }} />
          <Tabs.Screen name="timesheet" options={{ href: null }} />
          <Tabs.Screen name="crew" options={{ href: null }} />
          <Tabs.Screen name="profile" options={{ href: null }} />
          <Tabs.Screen name="work-log" options={{ href: null }} />
          <Tabs.Screen name="drawings" options={{ href: null }} />
          <Tabs.Screen name="drawing" options={{ href: null }} />
          <Tabs.Screen name="scan" options={{ href: null }} />
        </Tabs>
      </View>
    </View>
  );
}
