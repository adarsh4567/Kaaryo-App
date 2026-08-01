import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii, spacing } from '@/constants/theme';
import { Badge, Button, Chip, IconButton, Text } from '@/components/ui';
import { formatPrice } from '@/lib/catalog';
import { netCostOf, type TrialOffer } from '@/lib/userTrials';

/** Which kind of professional the customer is asking for. */
export type WorkerChoice = 'experienced' | 'trial';

/**
 * The "who should we send?" step of the instant booking sheet.
 *
 * Two genuinely different products behind one Book button, so the choice is
 * explicit and defaults to the experienced professional — nobody should end up in
 * a trial by tapping through. The trial card carries the whole offer, because it
 * is the only place the customer learns that the discount exists and what it is
 * for: a trainee cleaner doing their last onboarding job, whose approval depends
 * on the feedback form afterwards. That is stated rather than buried — it is true,
 * and it is why the price is lower.
 *
 * Prices are never hardcoded. The experienced rate comes from the server's rate
 * card and all four trial numbers come from `GET /api/user/trials/offer`, which is
 * env-tunable server-side.
 */
export function WorkerChoiceStep({
  categoryName,
  categoryPrice,
  choice,
  onChoice,
  offer,
  offerLoading,
  onBack,
  onConfirm,
  onResumeTrial,
  submitting,
}: {
  categoryName: string;
  /** The server's flat rate for a normal booking of this category. */
  categoryPrice: number;
  choice: WorkerChoice;
  onChoice: (choice: WorkerChoice) => void;
  /** Null while loading, on failure, or for a category with no trial. */
  offer: TrialOffer | null;
  offerLoading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  /** Opens the trial the customer already has in flight. */
  onResumeTrial: (id: string) => void;
  submitting?: boolean;
}) {
  const { colors } = useTheme();

  // `available: false` still renders the card, disabled, with the server's own
  // reason — a silently missing option reads as a bug, and "you have already used
  // your trial" is a better answer than nothing.
  const trialOffered = !!offer;
  const trialUsable = !!offer?.available;
  const pricing = offer?.pricing;

  /**
   * The one unavailable reason that is not a dead end: the customer already has a
   * trial in flight. That is a navigation, so the card stays tappable.
   */
  const liveTrialId =
    !trialUsable && offer?.code === 'TRIAL_IN_PROGRESS' ? offer.liveTrialId : null;

  const confirmLabel =
    choice === 'trial' && pricing
      ? `Book new professional · ${formatPrice(pricing.userPrice)}`
      : `Book experienced · ${formatPrice(categoryPrice)}`;

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          accessibilityLabel="Back to job details"
          size={34}
          onPress={onBack}
        />
        <View style={styles.flex}>
          <Text variant="h3">Who should we send?</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {categoryName} · your address
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Experienced ──────────────────────────────────────────────────── */}
        <OptionCard
          selected={choice === 'experienced'}
          onPress={() => onChoice('experienced')}
          icon="shield-check"
          title="Experienced professional"
          subtitle="Fully verified, hundreds of jobs behind them"
        >
          <Text variant="h2">{formatPrice(categoryPrice)}</Text>
          <Text variant="caption" tone="muted" style={styles.priceNote}>
            Flat rate · pay after the job
          </Text>
          <View style={styles.pointList}>
            <Point icon="account-star-outline" label="Highest-rated professional free nearby" />
            <Point icon="timer-outline" label="Usually accepted within a minute" />
          </View>
        </OptionCard>

        {/* ── New professional (trial) ─────────────────────────────────────── */}
        {offerLoading && !trialOffered ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" tone="muted">
              Checking for a discounted trial…
            </Text>
          </View>
        ) : trialOffered && pricing ? (
          <OptionCard
            selected={choice === 'trial'}
            disabled={!trialUsable && !liveTrialId}
            onPress={
              trialUsable
                ? () => onChoice('trial')
                : liveTrialId
                  ? () => onResumeTrial(liveTrialId)
                  : () => {}
            }
            icon="account-plus-outline"
            title="New professional"
            subtitle={
              trialUsable
                ? 'Completing their onboarding — your feedback decides it'
                : (offer?.reason ?? 'Not available right now')
            }
            badge={
              trialUsable
                ? `Save ${formatPrice(pricing.userSavings)} + ${formatPrice(pricing.rewardAmount)} back`
                : liveTrialId
                  ? 'Tap to resume'
                  : undefined
            }
          >
            <View style={styles.priceRow}>
              <Text variant="h2">{formatPrice(pricing.userPrice)}</Text>
              <Text variant="body" tone="muted" style={styles.strike}>
                {formatPrice(pricing.basePrice)}
              </Text>
            </View>
            <Text variant="caption" tone="muted" style={styles.priceNote}>
              Effectively {formatPrice(netCostOf(pricing))} after the reward
            </Text>

            <View style={styles.pointList}>
              <Point
                icon="wallet-giftcard"
                label={`${formatPrice(pricing.rewardAmount)} back as a wallet reward (${pricing.rewardPercent}%) when you pay`}
                tone="primary"
              />
              <Point
                icon="clipboard-check-outline"
                label="A short 10-question form after the job — that form is what gets them approved"
                tone="primary"
              />
              <Point
                icon="school-outline"
                label="Trained and ID-verified already; this is their final assessment"
              />
            </View>

            {/* The allowance is why the discount is not repeatable — say it here
                rather than letting a 403 explain it later. */}
            {trialUsable && offer ? (
              <Text variant="caption" tone="muted" style={styles.allowance}>
                {offer.allowance - offer.used === 1
                  ? 'One discounted trial per account · cleaning only'
                  : `${offer.allowance - offer.used} left on your account · cleaning only`}
              </Text>
            ) : null}
          </OptionCard>
        ) : null}

        {/* Honest about supply before the customer commits: a trial is however
            many trainees happen to be mid-onboarding in range, which is often
            none. The searching screen says the same thing with a countdown. */}
        {choice === 'trial' && trialUsable ? (
          <View style={[styles.notice, { backgroundColor: colors.warningLight }]}>
            <MaterialCommunityIcons name="information-outline" size={17} color={colors.warning} />
            <Text variant="caption" tone="muted" style={styles.flex}>
              Up to 3 trainees are asked one at a time, {offer?.offerWindowSeconds ?? 90} seconds
              each, so this can take a few minutes. You can leave the screen — we will keep
              looking.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* ── Confirm ────────────────────────────────────────────────────────── */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button
          label={submitting ? 'Booking…' : confirmLabel}
          icon={choice === 'trial' ? 'account-plus-outline' : 'lightning-bolt'}
          fullWidth
          loading={submitting}
          disabled={submitting}
          onPress={onConfirm}
        />
      </View>
    </>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function OptionCard({
  selected,
  disabled,
  onPress,
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  icon: 'shield-check' | 'account-plus-outline';
  title: string;
  subtitle: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? colors.secondary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          opacity: disabled ? 0.55 : pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.optionHead}>
        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primary : 'transparent',
            },
          ]}
        >
          {selected ? (
            <MaterialCommunityIcons name="check" size={12} color={colors.primaryForeground} />
          ) : null}
        </View>
        <MaterialCommunityIcons
          name={icon}
          size={19}
          color={selected ? colors.secondaryForeground : colors.mutedForeground}
        />
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        </View>
      </View>

      {badge ? <Badge label={badge} tone="success" icon="tag-outline" style={styles.badge} /> : null}

      <View style={styles.optionBody}>{children}</View>
    </Pressable>
  );
}

function Point({
  icon,
  label,
  tone = 'muted',
}: {
  icon: 'account-star-outline' | 'timer-outline' | 'wallet-giftcard' | 'clipboard-check-outline' | 'school-outline';
  label: string;
  tone?: 'muted' | 'primary';
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.point}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={tone === 'primary' ? colors.primary : colors.mutedForeground}
      />
      <Text variant="caption" tone={tone} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  scroll: { flexShrink: 1 },
  scrollBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  option: { borderRadius: radii.lg, padding: spacing.lg },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { marginTop: spacing.md },
  optionBody: { marginTop: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  strike: { textDecorationLine: 'line-through' },
  priceNote: { marginTop: 2 },
  pointList: { marginTop: spacing.md, gap: spacing.sm },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  allowance: { marginTop: spacing.md },
  subWrap: { marginTop: spacing.lg },
  subLabel: { letterSpacing: 0.8, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
