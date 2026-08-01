import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { invalidateTrialOffer } from '@/hooks/useTrialOffer';
import { radii, spacing } from '@/constants/theme';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import {
  Badge,
  BottomBar,
  BottomSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  IconBubble,
  Text,
} from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import {
  feedbackThanks,
  fetchFeedbackForm,
  isTrialApiError,
  payForTrial,
  submitTrialFeedback,
  type FeedbackForm,
  type FeedbackOutcome,
  type FeedbackQuestion,
  type PaymentMethod,
  type Trial,
} from '@/lib/userTrials';
import { formatPrice, type MdiName } from '@/lib/catalog';

/** Payment rails the server accepts, in the order Indian customers reach for them. */
const METHODS: { key: PaymentMethod; label: string; detail: string; icon: MdiName }[] = [
  { key: 'upi', label: 'UPI', detail: 'GPay, PhonePe, Paytm', icon: 'cellphone-check' },
  { key: 'cash', label: 'Cash', detail: 'Hand it to your professional', icon: 'cash' },
  { key: 'card', label: 'Card', detail: 'Debit or credit', icon: 'credit-card-outline' },
  { key: 'netbanking', label: 'Net banking', detail: 'All major banks', icon: 'bank-outline' },
  { key: 'wallet', label: 'Wallet', detail: 'Prepaid balance', icon: 'wallet-outline' },
];

/** The server caps free text; this keeps the counter honest before it 422s. */
const TEXT_LIMIT = 500;

/**
 * The 10-question trial feedback form — the step that onboards the worker.
 *
 * Three rules this screen exists to hold:
 *
 *  1. **The questions are rendered from the server.** The wording is explicitly
 *     placeholder-quality and will change; only the `value` strings are the
 *     contract. Nothing here is hardcoded, not even the count.
 *  2. **Nothing hints which answer is the "good" one.** The response deliberately
 *     does not say, the scoring thresholds are server-side, and a form that
 *     telegraphs the right answer is worthless as a filter. So every option gets
 *     identical styling — no green ticks on "on time", no warning tint on "very
 *     late".
 *  3. **The customer is never told they rejected somebody.** `outcome` drives the
 *     thank-you copy only, and a failed worker gets a plain thank-you. The
 *     customer rated a job; they did not sit on a panel.
 *
 * One submission only — a repost is a 409, so the button disables on the first
 * success and the UI runs off `feedbackSubmitted` from then on.
 */
export default function TrialFeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token, mergeTrial, refreshTrials } = useAppContext();

  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  /** The trial returned after a successful feedback submit — holds payment info. */
  const [submittedTrial, setSubmittedTrial] = useState<Trial | null>(null);
  /** True when the server says this trial was already rated — a 409, not a failure. */
  const [alreadyDone, setAlreadyDone] = useState(false);

  /** Ringed after a failed submit so the customer can see what is still blank. */
  const [firstMissing, setFirstMissing] = useState<string | null>(null);

  // ── Payment state (shown after feedback submit) ─────────────────────────────
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    let cancelled = false;

    fetchFeedbackForm(token, id)
      .then((next) => {
        if (cancelled) return;
        setForm(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'This feedback form is not available yet.'
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, id]);

  const questions = form?.questions ?? [];

  /** Every non-optional question needs a value before the button unlocks. */
  const missing = useMemo(
    () => questions.filter((q) => !q.optional && !answers[q.key]?.trim()).map((q) => q.key),
    [questions, answers]
  );
  const answeredCount = questions.filter((q) => answers[q.key]?.trim()).length;

  function setAnswer(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFirstMissing((prev) => (prev === key ? null : prev));
  }

  async function handleSubmit() {
    if (!token || !id) return;
    if (missing.length) {
      setFirstMissing(missing[0]);
      setSubmitError('Please answer every question before sending.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    try {
      // Optional blanks are dropped rather than sent as empty strings — the
      // server validates each answer against the question's own option list.
      const payload = Object.fromEntries(
        Object.entries(answers).filter(([, value]) => value.trim().length > 0)
      );
      const result = await submitTrialFeedback(token, id, payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOutcome(result.outcome);
      setSubmittedTrial(result.trial);
      mergeTrial(result.trial);
      // The trial is finished, which frees nothing but does change the offer's
      // `used` count — re-read it rather than keeping a stale answer.
      invalidateTrialOffer();
      refreshTrials();
    } catch (err) {
      if (isTrialApiError(err) && err.status === 409) {
        // Already submitted, or not ready. Either way the form is not the fix.
        setAlreadyDone(true);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Could not send your feedback.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePay(method: PaymentMethod) {
    if (!token || !id) return;
    setPayBusy(true);
    setPayError('');
    try {
      const result = await payForTrial(token, id, method);
      setSubmittedTrial(result.trial);
      mergeTrial(result.trial);
      if (result.trial.payment.status === 'paid') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPayOpen(false);
        refreshTrials();
        // Job done — go straight to the Home tab.
        router.replace('/(tabs)');
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed. Please try again.');
    } finally {
      setPayBusy(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="body" tone="muted" style={styles.loadingText}>
          Loading the questions…
        </Text>
      </View>
    );
  }

  // ── Sent — show payment prompt if the job still needs paying ───────────────
  if (outcome || alreadyDone) {
    const needsPay = submittedTrial?.payment.payable ?? false;
    const pricing = submittedTrial?.pricing;
    const alreadyPaid = submittedTrial?.payment.status === 'paid';
    const thankYouMsg = outcome
      ? feedbackThanks(outcome, form?.worker.name)
      : 'You have already rated this trial. Thanks for helping out.';

    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.donePage,
            { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + 120 },
          ]}
        >
          {/* ── Feedback confirmed ────────────────────────────────────────── */}
          <Card tone="tint" padding="lg" style={styles.doneCard}>
            <View style={styles.doneIconRow}>
              <MaterialCommunityIcons name="check-decagram" size={40} color={colors.primary} />
            </View>
            <Text variant="h2" style={styles.doneTitle}>
              Feedback sent
            </Text>
            <Text variant="body" tone="muted" style={styles.doneMsg}>
              {thankYouMsg}
            </Text>
          </Card>

          {/* ── Payment section ──────────────────────────────────────────── */}
          {needsPay && pricing ? (
            <Card padding="lg" style={styles.doneCard}>
              <View style={styles.payHeader}>
                <IconBubble icon="cash-multiple" size={44} tone="primary" />
                <View style={styles.flex}>
                  <Text variant="h3">
                    Pay for the job
                  </Text>
                  <Text variant="caption" tone="muted">
                    {pricing.rewardAmount
                      ? `${formatPrice(pricing.rewardAmount)} comes back as a wallet reward — net cost ${formatPrice(Math.max(0, pricing.userPrice - pricing.rewardAmount))}.`
                      : 'Complete your payment to finish the booking.'}
                  </Text>
                </View>
              </View>
              <Divider spacingY={spacing.md} />
              <View style={styles.payPriceRow}>
                <Text variant="caption" tone="muted">Amount due</Text>
                <View style={styles.priceGroup}>
                  <Text variant="display">{formatPrice(submittedTrial!.payment.amount)}</Text>
                  {pricing.basePrice !== submittedTrial!.payment.amount ? (
                    <Text variant="body" tone="muted" style={styles.strike}>
                      {formatPrice(pricing.basePrice)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Button
                label="Pay now"
                icon="cash-multiple"
                fullWidth
                style={styles.payBtn}
                onPress={() => {
                  setPayError('');
                  setPayOpen(true);
                }}
              />
            </Card>
          ) : alreadyPaid ? (
            <Card padding="lg" style={styles.doneCard}>
              <View style={styles.noteRow}>
                <MaterialCommunityIcons name="check-decagram" size={18} color={colors.success} />
                <Text variant="caption" tone="muted" style={styles.flex}>
                  Payment received — all done!
                </Text>
              </View>
            </Card>
          ) : null}

          {/* ── Navigation ───────────────────────────────────────────────── */}
          {!needsPay ? (
            <View style={styles.doneActions}>
              <Button
                label="Back to my bookings"
                fullWidth
                onPress={() => router.replace('/(tabs)/bookings')}
              />
              <Button
                label="Go home"
                variant="secondary"
                fullWidth
                onPress={() => router.replace('/(tabs)')}
              />
            </View>
          ) : null}
        </ScrollView>

        {/* ── Pay bottom bar — only while payment is still due ────────────── */}
        {needsPay ? (
          <BottomBar bottomInset={insets.bottom}>
            <Button
              label={`Pay ${formatPrice(submittedTrial!.payment.amount)}`}
              icon="cash-multiple"
              fullWidth
              onPress={() => {
                setPayError('');
                setPayOpen(true);
              }}
            />
          </BottomBar>
        ) : null}

        {/* ── Payment method sheet ─────────────────────────────────────────── */}
        <BottomSheet visible={payOpen} onClose={() => setPayOpen(false)}>
          <View style={styles.sheetHead}>
            <Text variant="h2">Pay {formatPrice(submittedTrial?.payment.amount ?? 0)}</Text>
            {pricing?.rewardAmount ? (
              <Text variant="caption" tone="muted">
                {formatPrice(pricing.rewardAmount)} comes straight back to your wallet.
              </Text>
            ) : null}
          </View>

          {payError ? (
            <View style={[styles.sheetNotice, { backgroundColor: colors.destructiveLight }]}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={17}
                color={colors.destructive}
              />
              <Text variant="caption" tone="destructive" style={styles.flex}>
                {payError}
              </Text>
            </View>
          ) : null}

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {METHODS.map((method, i) => (
              <Pressable
                key={method.key}
                accessibilityRole="button"
                disabled={payBusy}
                onPress={() => handlePay(method.key)}
                style={({ pressed }) => [
                  styles.methodRow,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: i === METHODS.length - 1 ? 0 : StyleSheet.hairlineWidth,
                    opacity: pressed || payBusy ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialCommunityIcons
                    name={method.icon}
                    size={19}
                    color={colors.secondaryForeground}
                  />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodySemi">{method.label}</Text>
                  <Text variant="caption" tone="muted">
                    {method.detail}
                  </Text>
                </View>
                {payBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={colors.mutedForeground}
                  />
                )}
              </Pressable>
            ))}
          </ScrollView>
        </BottomSheet>
      </View>
    );
  }

  // ── Not available ──────────────────────────────────────────────────────────
  if (!form) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <FormHeader title="Feedback" topInset={insets.top} />
        <EmptyState
          icon="clipboard-alert-outline"
          title="Form not available"
          message={
            loadError ||
            'This form opens once your professional marks the work done. Please check back then.'
          }
        >
          <Button label="Back to my bookings" onPress={() => router.replace('/(tabs)/bookings')} />
        </EmptyState>
      </View>
    );
  }

  const workerFirst = form.worker.name.trim().split(/\s+/)[0];

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <FormHeader
        title={`Rate ${workerFirst}`}
        subtitle={`${answeredCount} of ${questions.length} answered`}
        topInset={insets.top}
      />

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 130 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Why this matters ─────────────────────────────────────────────── */}
        <Card tone="tint" padding="lg">
          <View style={styles.introRow}>
            <IconBubble icon="school-outline" size={44} tone="primary" />
            <View style={styles.flex}>
              <Text variant="h3" numberOfLines={1}>
                {form.worker.name}
              </Text>
              {form.worker.isTrainee ? (
                <Badge
                  label="Completing onboarding"
                  tone="success"
                  icon="account-clock-outline"
                  style={styles.introBadge}
                />
              ) : null}
            </View>
          </View>
          <Text variant="body" tone="muted" style={styles.introBody}>
            This was {workerFirst}&apos;s trial job. Your answers are what decide whether they
            become a verified Kaaryo professional, so please answer honestly — there is no right
            answer here.
          </Text>
        </Card>

        {/* ── The questions, exactly as the server sent them ───────────────── */}
        {questions.map((question, index) => (
          <QuestionBlock
            key={question.key}
            index={index}
            question={question}
            value={answers[question.key] ?? ''}
            highlight={firstMissing === question.key}
            onChange={(value) => setAnswer(question.key, value)}
          />
        ))}

        {submitError ? (
          <View style={[styles.notice, { backgroundColor: colors.destructiveLight }]}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={17}
              color={colors.destructive}
            />
            <Text variant="caption" tone="destructive" style={styles.flex}>
              {submitError}
            </Text>
          </View>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <BottomBar bottomInset={insets.bottom}>
        <Button
          label={
            submitting
              ? 'Sending…'
              : missing.length
                ? `${missing.length} question${missing.length === 1 ? '' : 's'} left`
                : 'Send feedback'
          }
          icon={submitting ? undefined : 'send-outline'}
          fullWidth
          loading={submitting}
          disabled={submitting || missing.length > 0}
          onPress={handleSubmit}
        />
      </BottomBar>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

/**
 * One question.
 *
 * `single` renders as a radio list and `text` as a free-text box, which is the
 * whole of the type system the endpoint uses. Every option in a list gets the
 * same treatment — see rule 2 at the top of the file.
 */
function QuestionBlock({
  index,
  question,
  value,
  highlight,
  onChange,
}: {
  index: number;
  question: FeedbackQuestion;
  value: string;
  /** Ringed after a failed submit, so the customer can see what is missing. */
  highlight?: boolean;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <Card
      padding="lg"
      style={highlight ? { borderWidth: 1.5, borderColor: colors.destructive } : undefined}
    >
      <View style={styles.questionHead}>
        <View style={[styles.questionNumber, { backgroundColor: colors.muted }]}>
          <Text variant="captionSemi" tone="muted">
            {index + 1}
          </Text>
        </View>
        <Text variant="bodySemi" style={styles.flex}>
          {question.prompt}
        </Text>
      </View>

      {question.type === 'text' ? (
        <Field
          multiline
          value={value}
          onChangeText={onChange}
          maxLength={TEXT_LIMIT}
          placeholder="Anything else worth mentioning…"
          containerStyle={styles.questionBody}
        />
      ) : (
        <View style={styles.questionBody}>
          {(question.options ?? []).map((option, i) => {
            const selected = value === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  Haptics.selectionAsync();
                  onChange(option.value);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: selected ? colors.secondary : colors.muted,
                    borderColor: selected ? colors.primary : 'transparent',
                    borderWidth: selected ? 1.5 : 0,
                    marginTop: i === 0 ? 0 : spacing.sm,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
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
                    <MaterialCommunityIcons
                      name="check"
                      size={11}
                      color={colors.primaryForeground}
                    />
                  ) : null}
                </View>
                <Text variant="body" style={styles.flex}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

function FormHeader({
  title,
  subtitle,
  topInset,
}: {
  title: string;
  subtitle?: string;
  topInset: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + spacing.sm,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.headerBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={19} color={colors.foreground} />
      </Pressable>
      <View style={styles.flex}>
        <Text variant="h3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  // ── Done / Payment page ───────────────────────────────────────────────────
  donePage: { paddingHorizontal: spacing.lg, gap: spacing.md },
  doneCard: { gap: 0 },
  doneIconRow: { alignItems: 'center', marginBottom: spacing.md },
  doneTitle: { textAlign: 'center', marginBottom: spacing.xs },
  doneMsg: { textAlign: 'center' },
  doneActions: { gap: spacing.sm, marginTop: spacing.xs },
  payHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  payPriceRow: { gap: 2, marginBottom: spacing.xs },
  priceGroup: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  strike: { textDecorationLine: 'line-through' },
  payBtn: { marginTop: spacing.md },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // ── Payment sheet ─────────────────────────────────────────────────────────
  sheetHead: { paddingHorizontal: spacing.lg, gap: 2 },
  sheetNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  sheetScroll: { flexShrink: 1, marginTop: spacing.md, paddingHorizontal: spacing.lg },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  methodIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Form ─────────────────────────────────────────────────────────────────
  introRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  introBadge: { marginTop: spacing.xs },
  introBody: { marginTop: spacing.md },
  questionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  questionNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionBody: { marginTop: spacing.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  radio: {
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
});
