import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useColors';
import { radii, spacing, TAB_BAR_HEIGHT } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { useAppContext } from '@/context/AppContext';
import { formatMinutes, formatPrice } from '@/lib/catalog';

/**
 * Persistent cart summary that docks just above the tab bar.
 *
 * Renders nothing on an empty cart, so screens can mount it unconditionally.
 * `offsetAboveTabBar` is false on pushed screens, which have no tab bar.
 */
export function CartBar({
  bottomInset,
  offsetAboveTabBar = true,
}: {
  bottomInset: number;
  offsetAboveTabBar?: boolean;
}) {
  const { colors, shadow } = useTheme();
  const { itemCount, subtotal, totalMinutes } = useAppContext();

  if (itemCount === 0) return null;

  const bottom = bottomInset + (offsetAboveTabBar ? TAB_BAR_HEIGHT + 20 : 14);

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View cart, ${itemCount} items, ${formatPrice(subtotal)}`}
        onPress={() => router.push('/cart')}
        style={({ pressed }) => [
          styles.bar,
          shadow.lg,
          { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
        ]}
      >
        <View style={[styles.countBubble, { backgroundColor: colors.onHeroSurface }]}>
          <Text variant="bodySemi" tone="onPrimary">
            {itemCount}
          </Text>
        </View>

        <View style={styles.flex}>
          <Text variant="bodySemi" tone="onPrimary">
            {formatPrice(subtotal)}
          </Text>
          <Text variant="caption" style={{ color: colors.onHeroMuted }}>
            {itemCount === 1 ? '1 task' : `${itemCount} tasks`} · {formatMinutes(totalMinutes)}
          </Text>
        </View>

        <Text variant="bodySemi" tone="onPrimary">
          View cart
        </Text>
        <MaterialCommunityIcons
          name="arrow-right"
          size={18}
          color={colors.primaryForeground}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radii.md,
  },
  countBubble: {
    minWidth: 34,
    height: 34,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
