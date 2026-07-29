import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { fonts, radii, spacing } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { CartBar } from '@/components/CartBar';
import { Badge, Chip, EmptyState, IconBubble, Text } from '@/components/ui';
import { formatPrice, getPopularServices, SERVICES, type Service } from '@/lib/catalog';

/** Suggested queries shown before the user types anything. */
const QUICK_SEARCHES = ['Mopping', 'Bathroom', 'Utensils', 'Laundry', 'Deep clean', 'AC'];

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { addToCart, quantityForService } = useAppContext();
  const [query, setQuery] = useState('');

  const trimmed = query.trim().toLowerCase();

  /** Matches on name, tagline and description so "grout" finds bathroom deep clean. */
  const results = useMemo(() => {
    if (!trimmed) return [];
    return SERVICES.filter((s) =>
      [s.name, s.tagline, s.description, ...s.includes]
        .join(' ')
        .toLowerCase()
        .includes(trimmed)
    );
  }, [trimmed]);

  const shown: Service[] = trimmed ? results : getPopularServices();

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder="Search a task — mopping, bathroom, AC…"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          style={[styles.input, { color: colors.foreground }]}
        />
        {query ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setQuery('')}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={19}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
      >
        {!trimmed ? (
          <>
            <Text variant="label" tone="muted" style={styles.groupLabel}>
              TRY SEARCHING FOR
            </Text>
            <View style={styles.quickRow}>
              {QUICK_SEARCHES.map((term) => (
                <Chip key={term} label={term} onPress={() => setQuery(term)} />
              ))}
            </View>
            <Text variant="label" tone="muted" style={styles.groupLabel}>
              MOST BOOKED
            </Text>
          </>
        ) : (
          <Text variant="label" tone="muted" style={styles.groupLabel}>
            {results.length === 0
              ? 'NO MATCHES'
              : `${results.length} ${results.length === 1 ? 'RESULT' : 'RESULTS'}`}
          </Text>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon="magnify-close"
            title="Nothing matched that"
            message="Try a shorter word like “clean”, “laundry” or “repair”."
          />
        ) : (
          <View style={styles.list}>
            {shown.map((service) => {
              const count = quantityForService(service.key);
              return (
                <Pressable
                  key={service.key}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: '/service/[key]', params: { key: service.key } })
                  }
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <IconBubble icon={service.icon} size={46} />
                  <View style={styles.flex}>
                    <View style={styles.rowTitle}>
                      <Text variant="bodySemi" numberOfLines={1} style={styles.flex}>
                        {service.name}
                      </Text>
                      {service.offer ? (
                        <Badge label={service.offer} tone="destructive" />
                      ) : null}
                    </View>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {service.tagline}
                    </Text>
                    <Text variant="captionSemi" tone="primary" style={styles.rowPrice}>
                      {service.price === 0
                        ? 'Free visit'
                        : `from ${formatPrice(service.price)}`}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${service.name}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      addToCart(service.key);
                    }}
                    hitSlop={8}
                    style={[
                      styles.add,
                      {
                        backgroundColor: count > 0 ? colors.primary : 'transparent',
                        borderColor: colors.primary,
                      },
                    ]}
                  >
                    <Text
                      variant="micro"
                      style={{ color: count > 0 ? colors.primaryForeground : colors.primary }}
                    >
                      {count > 0 ? String(count) : 'ADD'}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CartBar bottomInset={insets.bottom} offsetAboveTabBar={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, padding: 0 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  groupLabel: { letterSpacing: 0.8, marginBottom: spacing.md },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowPrice: { marginTop: 2 },
  add: {
    minWidth: 46,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radii.xs,
    borderWidth: 1.5,
    alignItems: 'center',
  },
});
