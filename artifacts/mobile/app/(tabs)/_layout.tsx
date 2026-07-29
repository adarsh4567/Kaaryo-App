import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { fonts, radii, TAB_BAR_HEIGHT } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
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
  const { history } = useAppContext();

  const liveBookings = history.filter((h) =>
    ['searching', 'in_progress', 'pending_rating'].includes(h.status)
  ).length;

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
