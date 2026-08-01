import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { findCategory, useServiceCatalog } from '@/hooks/useServiceCatalog';
import { useTrialOffer } from '@/hooks/useTrialOffer';
import { radii, spacing } from '@/constants/theme';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  Field,
  IconBubble,
  IconButton,
  Text,
} from '@/components/ui';
import { WorkerChoiceStep, type WorkerChoice } from '@/components/WorkerChoiceStep';
import { useAppContext } from '@/context/AppContext';
import {
  formatPrice,
  getRemoteCategory,
  getSubcategories,
  type Service,
} from '@/lib/catalog';
import { matchTrialSubcategory } from '@/lib/trialMatch';

/**
 * The server caps `jobDescription` at 500 characters and shows it to the worker
 * verbatim. The tasks the customer ticks are folded in, so the free-text box gets
 * a smaller share of the budget.
 */
const DESCRIPTION_LIMIT = 500;
const NOTE_LIMIT = 280;

/**
 * The instant-dispatch sheet.
 *
 * Instant sends one professional to the door with no cart and no checkout in
 * between, so this sheet is the only chance to pin down what the job is.
 *
 * Two lists, because two contracts meet here. `subcategory` is a single key the
 * server validates against the category, so that is a one-of choice. The tasks
 * below it are this app's own finer-grained catalog, which the server has no
 * field for — they go into the description the worker reads. Ticking "Kitchen
 * floor" and "Balcony" has to reach somebody, and the description is the only
 * channel that carries it.
 */
export function InstantBookingSheet({
  service,
  visible,
  onClose,
}: {
  service: Service;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { activeAddress, addresses, selectAddress, token } = useAppContext();
  const { categories, isLoading, error, reload } = useServiceCatalog();

  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [tasks, setTasks] = useState<string[]>([]);
  const [note, setNote] = useState('');

  /**
   * `brief` collects what the job is; `who` asks which kind of professional.
   *
   * A step inside this sheet rather than a second sheet on top of it: `BottomSheet`
   * is a platform `Modal`, and stacking two of those is unreliable on Android.
   */
  const [step, setStep] = useState<'brief' | 'who'>('brief');
  const [choice, setChoice] = useState<WorkerChoice>('experienced');
  const [trialSubcategory, setTrialSubcategory] = useState<string | null>(null);

  /** Controls the inline address-picker slide-up panel. */
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const pickerAnim = useRef(new Animated.Value(0)).current;

  function openAddressPicker() {
    setShowAddressPicker(true);
    Animated.spring(pickerAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 280,
      friction: 24,
    }).start();
  }

  function closeAddressPicker() {
    Animated.timing(pickerAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setShowAddressPicker(false));
  }

  const remoteKey = getRemoteCategory(service);
  const category = findCategory(categories, remoteKey);
  const taskOptions = useMemo(() => getSubcategories(service), [service]);

  /**
   * Trials are cleaning-only — electricians sit an in-person assessment instead,
   * so there is no electrical trial to book and no reason to spend a request
   * asking. Everything else keeps exactly the booking flow it had.
   */
  const trialEligible = remoteKey === 'cleaning';
  const { offer, isLoading: offerLoading } = useTrialOffer(
    token,
    visible && trialEligible
  );

  // A reopen is a new booking, not a resumed one — never inherit the last brief,
  // and never inherit the last choice of professional either.
  useEffect(() => {
    if (visible) {
      setSubcategory(null);
      setTasks([]);
      setNote('');
      setStep('brief');
      setChoice('experienced');
      setTrialSubcategory(null);
      setShowAddressPicker(false);
      pickerAnim.setValue(0);
    }
  }, [visible, service.key]);

  /**
   * Pre-picks the trial's own subcategory from the tapped service.
   *
   * The trial endpoint validates against its own list, which is not the rate
   * card's — `kitchen` happens to appear in both, `basic_home` and
   * `post_construction` in neither — so this cannot reuse the guess below.
   */
  useEffect(() => {
    if (!visible || !offer?.subcategories.length) return;
    setTrialSubcategory((prev) => prev ?? matchTrialSubcategory(offer.subcategories, service));
  }, [visible, offer, service]);

  /**
   * Pre-picks the subcategory whose name echoes the tapped service — tapping
   * "Kitchen cleaning" should not then ask which kind of cleaning. Deliberately
   * conservative: a near-miss guess would be worse than no guess.
   */
  useEffect(() => {
    if (!visible || !category?.subcategories.length) return;
    const target = service.name.toLowerCase();
    const hit = category.subcategories.find((sub) => {
      const name = sub.name.toLowerCase();
      const head = name.replace(/\s+(cleaning|repair|service|work)$/, '');
      return target.includes(head) || head.includes(target);
    });
    if (hit) setSubcategory(hit.key);
  }, [visible, category, service.name]);

  // Dispatch is geographic: an address with no pinned coordinates would be sent
  // to 0,0 and reach nobody, so it counts the same as having no address.
  const hasLocation =
    !!activeAddress &&
    typeof activeAddress.lat === 'number' &&
    typeof activeAddress.lng === 'number';

  const bookable = !!category && hasLocation;

  function toggleTask(task: string) {
    setTasks((prev) =>
      prev.includes(task) ? prev.filter((t) => t !== task) : [...prev, task]
    );
  }

  /**
   * The brief the worker reads. Always leads with the task the customer actually
   * tapped, because the category it bills under ("Cleaning") does not tell a
   * professional whether to bring a mop or an iron.
   */
  function buildDescription(): string {
    const parts = [service.name];
    if (tasks.length) parts.push(tasks.join(', '));
    if (note.trim()) parts.push(note.trim());
    return parts.join(' — ').slice(0, DESCRIPTION_LIMIT);
  }

  /**
   * The Book button.
   *
   * Only steps aside to ask *who* when there is a second answer worth asking
   * about. With no trial on this category — or with the offer read failing, which
   * is not the customer's problem — this stays the one-tap dispatch it always was.
   */
  function handleBook() {
    if (!hasLocation) {
      onClose();
      router.push('/address');
      return;
    }
    if (!category) return;

    // `offerLoading` counts as a reason to ask. Without it, tapping Book before
    // the offer lands would silently book an experienced professional and the
    // customer would never learn the cheaper option existed.
    if (trialEligible && (offer || offerLoading)) {
      Haptics.selectionAsync();
      setStep('who');
      return;
    }
    dispatchExperienced();
  }

  function dispatchExperienced() {
    if (!category) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    router.push({
      pathname: '/dispatch',
      params: {
        serviceKey: service.key,
        category: category.key,
        subcategory: subcategory ?? '',
        jobDescription: buildDescription(),
      },
    });
  }

  /**
   * Hands the brief to the trial dispatcher, which places the booking.
   *
   * No `category` is passed on: the trial endpoint fixes it to cleaning and 422s
   * on anything sent. The description is the same one the normal flow builds —
   * the trainee reads it verbatim, exactly as an experienced professional would.
   */
  function dispatchTrial() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    router.push({
      pathname: '/trial/dispatch',
      params: {
        serviceKey: service.key,
        subcategory: trialSubcategory ?? '',
        jobDescription: buildDescription(),
      },
    });
  }

  function handleResumeTrial(id: string) {
    onClose();
    router.push({ pathname: '/trial/track/[id]', params: { id } });
  }

  if (step === 'who' && category) {
    return (
      <BottomSheet visible={visible} onClose={onClose}>
        <WorkerChoiceStep
          categoryName={category.name}
          categoryPrice={category.price}
          choice={choice}
          onChoice={setChoice}
          offer={offer}
          offerLoading={offerLoading}
          onBack={() => setStep('brief')}
          onResumeTrial={handleResumeTrial}
          onConfirm={choice === 'trial' ? dispatchTrial : dispatchExperienced}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <IconBubble icon={service.icon} size={48} />
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={1}>
            {service.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {category ? `Billed as ${category.name}` : service.tagline}
          </Text>
        </View>
        <IconButton icon="close" accessibilityLabel="Close" size={34} onPress={onClose} />
      </View>

      <View style={styles.etaStrip}>
        <Badge label="Instant" tone="primary" icon="lightning-bolt" />
        <Text variant="caption" tone="muted">
          We start looking for a professional right away
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text variant="caption" tone="muted">
              Loading today's rates…
            </Text>
          </View>
        ) : error || !category ? (
          <View style={[styles.notice, { backgroundColor: colors.warningLight }]}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={18}
              color={colors.warning}
            />
            <View style={styles.flex}>
              <Text variant="captionSemi" tone="warning">
                {error
                  ? 'Could not reach the server'
                  : `${service.name} is not available for instant booking`}
              </Text>
              <Text variant="caption" tone="muted">
                {error ?? 'Book it as a scheduled visit instead.'}
              </Text>
            </View>
            {error ? (
              <Pressable onPress={reload} hitSlop={8} accessibilityRole="button">
                <Text variant="captionSemi" tone="primary">
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            {/* ── Server subcategory: one of, validated ────────────────────── */}
            {category.subcategories.length ? (
              <>
                <View style={styles.sectionHead}>
                  <Text variant="h3">What kind of {category.name.toLowerCase()}?</Text>
                  <Text variant="caption" tone="muted">
                    Pick one
                  </Text>
                </View>
                <View style={styles.chipWrap}>
                  {category.subcategories.map((sub) => (
                    <Chip
                      key={sub.key}
                      label={sub.name}
                      selected={subcategory === sub.key}
                      // Tapping the picked one clears it — the field is optional
                      // server-side, so "none of these" stays reachable.
                      onPress={() =>
                        setSubcategory((prev) => (prev === sub.key ? null : sub.key))
                      }
                      style={styles.chip}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* ── Local tasks: folded into the description ─────────────────── */}
            {taskOptions.length ? (
              <>
                <View style={[styles.sectionHead, styles.laterHead]}>
                  <Text variant="h3">What needs doing?</Text>
                  <Text variant="caption" tone="muted">
                    {tasks.length > 0 ? `${tasks.length} selected` : 'Optional'}
                  </Text>
                </View>
                <View style={styles.chipWrap}>
                  {taskOptions.map((task) => (
                    <Chip
                      key={task}
                      label={task}
                      selected={tasks.includes(task)}
                      onPress={() => toggleTask(task)}
                      style={styles.chip}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {/* ── Free text ────────────────────────────────────────────────── */}
            <View style={[styles.sectionHead, styles.laterHead]}>
              <Text variant="h3">Add details</Text>
              <Text variant="caption" tone="muted">
                Optional
              </Text>
            </View>
            <Field
              multiline
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_LIMIT}
              placeholder="Gate code, pets at home, which room to start with…"
              hint="Your professional reads this before they set off"
            />
          </>
        )}
      </ScrollView>

      {/* ── Where (always visible, outside the scroll) ───────────────────── */}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (hasLocation) {
            openAddressPicker();
          } else {
            onClose();
            router.push('/address');
          }
        }}
        style={({ pressed }) => [
          styles.addressRow,
          {
            backgroundColor: hasLocation ? colors.muted : colors.warningLight,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={hasLocation ? 'map-marker-outline' : 'map-marker-alert-outline'}
          size={18}
          color={hasLocation ? colors.mutedForeground : colors.warning}
        />
        <Text
          variant="caption"
          tone={hasLocation ? 'muted' : 'warning'}
          style={styles.flex}
          numberOfLines={1}
        >
          {hasLocation
            ? [activeAddress?.line, activeAddress?.locality].filter(Boolean).join(', ')
            : 'No service address pinned yet'}
        </Text>
        <Text variant="captionSemi" tone="primary">
          {hasLocation ? 'Change' : 'Add'}
        </Text>
      </Pressable>

      {/* ── Book ───────────────────────────────────────────────────────────── */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View>
          {/* The server prices the job from its own rate card — this is the
              amount the request will actually be created with, not an estimate. */}
          <Text variant="h2">{category ? formatPrice(category.price) : '—'}</Text>
          <Text variant="caption" tone="muted">
            {category ? 'Flat rate · pay after the job' : 'Rate unavailable'}
          </Text>
        </View>
        <Button
          label={hasLocation ? 'Book Worker' : 'Add service address'}
          icon={hasLocation ? 'lightning-bolt' : 'map-marker-plus-outline'}
          disabled={hasLocation && !bookable}
          style={styles.flex}
          onPress={handleBook}
        />
      </View>

      {/* ── Inline address picker ───────────────────────────────────────────── */}
      {showAddressPicker ? (
        <Animated.View
          style={[
            styles.pickerPanel,
            {
              backgroundColor: colors.muted,
              borderTopColor: colors.border,
              // Match the BottomSheet's own paddingBottom so the panel clears the safe area.
              bottom: insets.bottom + spacing.lg,
              transform: [
                {
                  translateY: pickerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [320, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Panel header */}
          <View style={[styles.pickerHeader, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
            <Text variant="h3">Choose address</Text>
            <Pressable
              onPress={closeAddressPicker}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close address picker"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Saved address list */}
          <ScrollView
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerScrollBody}
            showsVerticalScrollIndicator={false}
          >
            {addresses.map((addr) => {
              const isActive = addr.id === activeAddress?.id;
              return (
                <Pressable
                  key={addr.id}
                  accessibilityRole="button"
                  onPress={async () => {
                    Haptics.selectionAsync();
                    await selectAddress(addr.id);
                    closeAddressPicker();
                  }}
                  style={({ pressed }) => [
                    styles.pickerItem,
                    {
                      backgroundColor: isActive ? colors.muted : colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                >
                  <View style={styles.pickerItemIcon}>
                    <MaterialCommunityIcons
                      name={isActive ? 'map-marker' : 'map-marker-outline'}
                      size={20}
                      color={isActive ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text
                      variant="captionSemi"
                      style={{ color: isActive ? colors.primary : colors.foreground }}
                      numberOfLines={1}
                    >
                      {addr.label}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={2}>
                      {[addr.line, addr.locality, addr.city].filter(Boolean).join(', ')}
                    </Text>
                  </View>
                  {isActive ? (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={18}
                      color={colors.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Add new address */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              closeAddressPicker();
              onClose();
              router.push('/address');
            }}
            style={[styles.pickerAddNew, { borderTopColor: colors.border }]}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color={colors.primary} />
            <Text variant="captionSemi" tone="primary">
              Add new address
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </BottomSheet>
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
  etaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  // Shrinks so the header and the book bar stay pinned once the sheet is capped.
  scroll: { flexShrink: 1 },
  scrollBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing['2xl'] },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9 },
  laterHead: { marginTop: spacing.xl },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // ── Inline address picker ──────────────────────────────────────────────────
  pickerPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    // bottom is set dynamically from insets to sit above the safe area.
    maxHeight: 340,
    flexDirection: 'column',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerScroll: { flex: 1 },
  pickerScrollBody: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  pickerItemIcon: {
    width: 32,
    alignItems: 'center',
  },
  pickerAddNew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
