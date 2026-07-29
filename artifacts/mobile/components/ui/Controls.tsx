import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { fonts, radii, spacing } from '@/constants/theme';
import { Text } from './Text';
import type { MdiName } from '@/lib/catalog';

// ─── Segmented control ────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: MdiName;
}

/**
 * Two-or-three-way pill toggle (Instant / Schedule, Upcoming / Past).
 *
 * The selected segment fills with brand green so the choice reads at a glance —
 * this control carries real pricing consequences, not just a filter.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.segmentTrack,
        { backgroundColor: colors.muted, borderColor: colors.border },
        style,
      ]}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: colors.primary },
              { opacity: pressed && !active ? 0.6 : 1 },
            ]}
          >
            {opt.icon ? (
              <MaterialCommunityIcons
                name={opt.icon}
                size={15}
                color={active ? colors.primaryForeground : colors.mutedForeground}
              />
            ) : null}
            <Text
              variant="captionSemi"
              style={{ color: active ? colors.primaryForeground : colors.mutedForeground }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

/** Selectable pill — duration slots, filters, time windows. */
export function Chip({
  label,
  selected,
  onPress,
  sublabel,
  disabled,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  sublabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.secondary : colors.card,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 1.5 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text
        variant="bodySemi"
        style={{ color: selected ? colors.secondaryForeground : colors.foreground }}
      >
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption" tone={selected ? 'primary' : 'muted'}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── Quantity stepper ─────────────────────────────────────────────────────────

/** Compact −/qty/+ control used on cart lines and service tiles. */
export function Stepper({
  value,
  onIncrement,
  onDecrement,
  compact,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const btn = compact ? 26 : 32;

  return (
    <View
      style={[
        styles.stepper,
        { backgroundColor: colors.primary, borderRadius: radii.sm },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        onPress={() => {
          Haptics.selectionAsync();
          onDecrement();
        }}
        style={[styles.stepperBtn, { width: btn, height: btn }]}
      >
        <MaterialCommunityIcons
          name={value === 1 ? 'trash-can-outline' : 'minus'}
          size={compact ? 13 : 15}
          color={colors.primaryForeground}
        />
      </Pressable>
      <Text
        variant="captionSemi"
        style={{ color: colors.primaryForeground, minWidth: 14, textAlign: 'center' }}
      >
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        onPress={() => {
          Haptics.selectionAsync();
          onIncrement();
        }}
        style={[styles.stepperBtn, { width: btn, height: btn }]}
      >
        <MaterialCommunityIcons name="plus" size={compact ? 13 : 15} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

// ─── Text field ───────────────────────────────────────────────────────────────

export interface FieldProps extends TextInputProps {
  label?: string;
  icon?: MdiName;
  /** Fixed text before the input, e.g. the `+91` dial code. */
  prefix?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  icon,
  prefix,
  error,
  hint,
  containerStyle,
  style,
  multiline,
  ...rest
}: FieldProps) {
  const { colors } = useTheme();

  return (
    <View style={containerStyle}>
      {label ? (
        <Text variant="label" style={styles.fieldLabel}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.fieldBox,
          {
            backgroundColor: colors.muted,
            borderColor: error ? colors.destructive : colors.border,
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? 12 : 13,
          },
        ]}
      >
        {icon ? (
          <MaterialCommunityIcons
            name={icon}
            size={18}
            color={colors.mutedForeground}
            style={multiline ? styles.fieldIconTop : undefined}
          />
        ) : null}
        {prefix ? (
          <Text variant="bodySemi" style={{ color: colors.foreground }}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          multiline={multiline}
          style={[
            styles.fieldInput,
            { color: colors.foreground },
            multiline && styles.fieldInputMultiline,
            style,
          ]}
          {...rest}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="destructive" style={styles.fieldHelp}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.fieldHelp}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

/** Settings-style tappable row with an icon, label and trailing chevron. */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
  last,
  right,
}: {
  icon: MdiName;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  /** Suppresses the bottom hairline for the final row in a group. */
  last?: boolean;
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const fg = danger ? colors.destructive : colors.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.listRow,
        {
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.listRowIcon,
          { backgroundColor: danger ? colors.destructiveLight : colors.secondary },
        ]}
      >
        <MaterialCommunityIcons
          name={icon}
          size={17}
          color={danger ? colors.destructive : colors.secondaryForeground}
        />
      </View>
      <View style={styles.flex}>
        <Text variant="bodySemi" style={{ color: fg }}>
          {label}
        </Text>
        {value ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={colors.mutedForeground}
          />
        ) : null)}
    </Pressable>
  );
}

// ─── Star rating ──────────────────────────────────────────────────────────────

export function Rating({ value, size = 13 }: { value: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.rating} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <MaterialCommunityIcons
          key={s}
          name={value >= s ? 'star' : value >= s - 0.5 ? 'star-half-full' : 'star-outline'}
          size={size}
          color={colors.star}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmentTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radii.md,
    alignItems: 'flex-start',
    gap: 2,
  },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: { alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { marginBottom: 7 },
  fieldBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1.5,
  },
  fieldIconTop: { marginTop: 2 },
  fieldInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 0,
  },
  fieldInputMultiline: { minHeight: 96, textAlignVertical: 'top', lineHeight: 22 },
  fieldHelp: { marginTop: 5 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
  },
  listRowIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rating: { flexDirection: 'row', gap: 1 },
});
