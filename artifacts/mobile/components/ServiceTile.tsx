import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii, spacing } from '@/constants/theme';
import { Text } from '@/components/ui/Text';
import { Rating } from '@/components/ui/Controls';
import { formatPrice, type Service } from '@/lib/catalog';

/**
 * Compact grid tile — three per row on the home screen.
 *
 * The tinted art panel stands in for photography: one icon, one tint, so a
 * 25-service grid stays visually calm. The floating add button is the primary
 * affordance; tapping anywhere else opens the detail screen.
 */
export function ServiceTile({
  service,
  quantity,
  onPress,
  onAdd,
  width,
  instant = false,
}: {
  service: Service;
  /** Total units of this service already in the cart; 0 hides the count pip. */
  quantity: number;
  onPress: () => void;
  onAdd: () => void;
  width: number;
  /**
   * The corner button books this service outright rather than stacking a cart
   * line. It carries a bolt instead of a plus, and drops the cart count — an
   * instant booking never touches the cart, so showing one would be a lie.
   */
  instant?: boolean;
}) {
  const { colors, shadow } = useTheme();
  const inCart = !instant && quantity > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${service.name}, from ${formatPrice(service.price)}`}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <View
        style={[
          styles.art,
          { backgroundColor: colors.secondary, height: width * 0.86 },
        ]}
      >
        {/* Soft depth wash behind the icon. */}
        <View style={[styles.blob, styles.blobA, { backgroundColor: colors.primary }]} />
        <View style={[styles.blob, styles.blobB, { backgroundColor: colors.primary }]} />

        <MaterialCommunityIcons
          name={service.icon}
          size={width * 0.42}
          color={colors.secondaryForeground}
        />

        {service.offer ? (
          <View style={[styles.ribbon, { backgroundColor: colors.destructive }]}>
            <Text variant="micro" style={{ color: '#FFFFFF' }}>
              {service.offer}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAdd();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${instant ? 'Book' : 'Add'} ${service.name}`}
          hitSlop={6}
          style={({ pressed }) => [
            styles.addBtn,
            shadow.sm,
            {
              backgroundColor: instant || inCart ? colors.primary : colors.card,
              borderColor: instant || inCart ? colors.primary : colors.border,
              transform: [{ scale: pressed ? 0.9 : 1 }],
            },
          ]}
        >
          {instant ? (
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={16}
              color={colors.primaryForeground}
            />
          ) : inCart ? (
            <Text variant="captionSemi" style={{ color: colors.primaryForeground }}>
              {quantity}
            </Text>
          ) : (
            <MaterialCommunityIcons name="plus" size={17} color={colors.primary} />
          )}
        </Pressable>
      </View>

      <Text variant="captionSemi" style={styles.name} numberOfLines={2}>
        {service.gridName}
      </Text>
      <Text variant="caption" tone="muted">
        {service.price === 0 ? 'Free visit' : formatPrice(service.price)}
      </Text>
    </Pressable>
  );
}

/**
 * Wide horizontal card for the "Most booked" rail — carries rating and social
 * proof that does not fit in the compact grid tile.
 */
export function ServiceRailCard({
  service,
  onPress,
  onAdd,
  inCart,
  width,
  instant = false,
}: {
  service: Service;
  onPress: () => void;
  onAdd: () => void;
  inCart: boolean;
  width: number;
  /** Books outright instead of adding to the cart — see `ServiceTile`. */
  instant?: boolean;
}) {
  const { colors, shadow } = useTheme();
  const filled = instant || inCart;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.railCard,
        shadow.sm,
        {
          width,
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.railArt, { backgroundColor: colors.secondary }]}>
        <MaterialCommunityIcons
          name={service.icon}
          size={30}
          color={colors.secondaryForeground}
        />
      </View>
      <View style={styles.railBody}>
        <Text variant="bodySemi" numberOfLines={1}>
          {service.name}
        </Text>
        <View style={styles.railMeta}>
          <Rating value={service.rating} size={11} />
          <Text variant="caption" tone="muted">
            {service.bookings}
          </Text>
        </View>
        <View style={styles.railFooter}>
          <Text variant="bodySemi" tone="primary">
            {formatPrice(service.price)}
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAdd();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${instant ? 'Book' : 'Add'} ${service.name}`}
            style={({ pressed }) => [
              styles.railAdd,
              {
                backgroundColor: filled ? colors.primary : 'transparent',
                borderColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text
              variant="micro"
              style={{ color: filled ? colors.primaryForeground : colors.primary }}
            >
              {instant ? 'BOOK' : inCart ? 'ADDED' : 'ADD'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.07 },
  blobA: { width: 90, height: 90, top: -34, right: -26 },
  blobB: { width: 60, height: 60, bottom: -22, left: -18 },
  ribbon: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  addBtn: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginBottom: 1 },
  railCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  railArt: {
    width: 54,
    height: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBody: { flex: 1, gap: 3 },
  railMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  railFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  railAdd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.xs,
    borderWidth: 1.5,
  },
});
