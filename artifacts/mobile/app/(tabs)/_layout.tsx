import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { fonts, radii, spacing, TAB_BAR_HEIGHT } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { Button, EmptyState } from '@/components/ui';
import type { MdiName } from '@/lib/catalog';

/**
 * Floating pill tab bar.
 *
 * Detached from the screen edge so content scrolls visibly beneath it — the
 * quick-commerce convention, and it leaves room for the cart bar to dock above.
 */
export default function TabLayout() {
  const { colors, shadow } = useTheme();
  const insets = useScreenInsets();
  const { history, liveRequests, liveTrials, profile, isRestoringSession, isBlocked, signOut } =
    useAppContext();

  // All three booking families count: instant requests and discounted trials come
  // from the server, scheduled ones from the on-device history.
  const liveBookings =
    liveRequests.length +
    liveTrials.length +
    history.filter((h) => ['searching', 'in_progress', 'pending_rating'].includes(h.status))
      .length;

  /**
   * The auth gate for every tab, not just Home — a deep link or a tab press while
   * signed out would otherwise land on an empty screen. Held until the stored
   * token has been checked so a signed-in user never sees the login screen flash.
   */
  useEffect(() => {
    if (isRestoringSession || isBlocked) return;
    if (!profile) router.replace('/login');
    else if (!profile.profileCompleted) router.replace('/name');
  }, [profile, isRestoringSession, isBlocked]);

  if (isRestoringSession) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // A blocked account is terminal: signing in again just returns another 403, so
  // the only route forward is support.
  if (isBlocked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="account-cancel-outline"
          title="Account on hold"
          message="This account has been blocked. Please contact us at care@kaaryo.in or 1800-000-000 and we will help sort it out."
        >
          <Button label="Sign out" variant="destructive" onPress={signOut} />
        </EmptyState>
      </View>
    );
  }

  if (!profile) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarBadgeStyle: {
          backgroundColor: colors.primary,
          color: colors.primaryForeground,
          fontFamily: fonts.semibold,
          fontSize: 10,
        },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: [
          styles.bar,
          shadow.lg,
          {
            bottom: insets.bottom + 10,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={focused ? 'home-variant' : 'home-variant-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarBadge: liveBookings > 0 ? liveBookings : undefined,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={focused ? 'clipboard-text' : 'clipboard-text-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon
              icon={focused ? 'account-circle' : 'account-circle-outline'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}

/** Icon with a green tint pill behind it while the tab is active. */
function TabIcon({
  icon,
  color,
  focused,
}: {
  icon: MdiName;
  color: string;
  focused: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.iconPill, focused && { backgroundColor: colors.secondary }]}>
      <MaterialCommunityIcons name={icon} size={21} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: TAB_BAR_HEIGHT,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: radii.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 12,
  },
  item: { height: TAB_BAR_HEIGHT - 16 },
  label: { fontFamily: fonts.semibold, fontSize: 10.5, marginTop: -2 },
  iconPill: {
    width: 46,
    height: 26,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
