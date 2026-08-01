import React, { useCallback } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/HeroHeader';
import { Badge, Button, Card, Text } from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { formatPrice } from '@/lib/catalog';

export default function CouponsScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { subtotal, couponCode, applyCoupon, credits, profile, serverCoupons, isLoadingCoupons, refreshCoupons } = useAppContext();

  // Refresh on every screen visit so WELCOME150 disappears after first payment.
  useFocusEffect(
    useCallback(() => {
      refreshCoupons();
    }, [refreshCoupons])
  );

  const referralCode = profile?.referralCode ?? null;

  async function handleCopyCode() {
    if (!referralCode) return;
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `Use my Kaaryo referral code ${referralCode} to get ₹150 off your first booking! 🎉`,
        title: 'Share Kaaryo referral code',
      });
    } catch {
      // User dismissed share sheet — no-op.
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Offers & rewards"
        subtitle="Applied automatically at checkout"
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing['3xl'] }]}
      >
        {/* ── Wallet ─────────────────────────────────────────────────────── */}
        <Card tone="hero" padding="lg" bordered={false}>
          <View style={styles.walletRow}>
            <View style={styles.flex}>
              <Text variant="caption" style={{ color: colors.onHeroMuted }}>
                Kaaryo credits
              </Text>
              <Text variant="display" tone="onHero">
                {formatPrice(credits)}
              </Text>
              <Text variant="caption" style={{ color: colors.onHeroMuted }}>
                Auto-applied to your next booking
              </Text>
            </View>
            <View
              style={[
                styles.walletArt,
                { backgroundColor: colors.onHeroSurface, borderColor: colors.onHeroBorder },
              ]}
            >
              <MaterialCommunityIcons name="gift-outline" size={32} color={colors.heroForeground} />
            </View>
          </View>
        </Card>

        {/* ── Coupons ────────────────────────────────────────────────────── */}
        <Text variant="h3" style={styles.sectionTitle}>
          Coupons for you
        </Text>

        {isLoadingCoupons && serverCoupons.length === 0 ? (
          <Card padding="lg">
            <Text variant="caption" tone="muted" center>
              Loading your coupons…
            </Text>
          </Card>
        ) : serverCoupons.length === 0 ? (
          <Card padding="lg">
            <Text variant="caption" tone="muted" center>
              No coupons available right now.
            </Text>
          </Card>
        ) : (
          <View style={styles.stack}>
            {serverCoupons.map((coupon) => {
              const eligible = subtotal >= coupon.minSubtotal;
              const applied = couponCode === coupon.code;
              const shortfall = coupon.minSubtotal - subtotal;

              return (
                <Card
                  key={coupon.code}
                  padding="lg"
                  style={[
                    styles.coupon,
                    applied && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  <View style={styles.couponTop}>
                    <View
                      style={[styles.couponCode, { borderColor: colors.border }]}
                    >
                      <MaterialCommunityIcons
                        name="ticket-percent-outline"
                        size={16}
                        color={colors.primary}
                      />
                      <Text variant="captionSemi" tone="primary">
                        {coupon.code}
                      </Text>
                    </View>
                    {applied ? <Badge label="Applied" tone="success" icon="check" /> : null}
                  </View>

                  <Text variant="h3" style={styles.couponTitle}>
                    {coupon.title}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {coupon.detail}
                  </Text>

                  <View style={styles.couponFooter}>
                    {eligible ? (
                      <Text variant="caption" tone="success">
                        Saves {formatPrice(coupon.discount)} on this cart
                      </Text>
                    ) : (
                      <Text variant="caption" tone="muted">
                        {subtotal === 0
                          ? `Minimum cart ${formatPrice(coupon.minSubtotal)}`
                          : `Add ${formatPrice(shortfall)} more to unlock`}
                      </Text>
                    )}
                    <Button
                      label={applied ? 'Remove' : 'Apply'}
                      variant={applied ? 'outline' : 'secondary'}
                      size="sm"
                      disabled={!eligible && !applied}
                      onPress={() => {
                        Haptics.selectionAsync();
                        applyCoupon(applied ? null : coupon.code);
                      }}
                    />
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {/* ── Referral ───────────────────────────────────────────────────── */}
        {/* Hide the block entirely when referralCode is null (mint-collision edge case). */}
        {referralCode !== null ? (
          <>
            <Text variant="h3" style={styles.sectionTitle}>
              Invite and earn
            </Text>
            <Card tone="tint" padding="lg" bordered={false}>
              <Text variant="bodySemi" style={{ color: colors.secondaryForeground }}>
                Give ₹150, get ₹150
              </Text>
              <Text variant="caption" style={{ color: colors.secondaryForeground }}>
                Your friend gets ₹150 off their first booking. You get ₹150 once they complete it.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy referral code"
                onPress={handleCopyCode}
                style={({ pressed }) => [
                  styles.referral,
                  { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text variant="bodySemi" tone="primary" style={styles.flex}>
                  {referralCode}
                </Text>
                <MaterialCommunityIcons name="share-variant-outline" size={16} color={colors.primary} />
              </Pressable>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  walletArt: {
    width: 62,
    height: 62,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  stack: { gap: spacing.md },
  coupon: { overflow: 'hidden' },
  couponTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  couponCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  couponTitle: { marginTop: spacing.md, marginBottom: 2 },
  couponFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  referral: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
});
