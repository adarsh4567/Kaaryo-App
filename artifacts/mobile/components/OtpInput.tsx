import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/hooks/useColors';
import { fonts, radii, spacing } from '@/constants/theme';
import { Text } from '@/components/ui/Text';

/**
 * Fixed-length code entry.
 *
 * Rendered as N boxes over a single transparent `TextInput` rather than one input
 * per box. That keeps paste, backspace and SMS autofill working exactly as the
 * platform intends — per-box inputs have to reimplement all three and get them
 * subtly wrong.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  autoFocus = true,
  editable = true,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fired once the last digit is entered, for auto-submit. */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  function handleChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  }

  return (
    <Pressable
      accessibilityRole="none"
      onPress={() => inputRef.current?.focus()}
      style={styles.wrap}
    >
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => {
          const digit = value[i] ?? '';
          // The caret box is the next empty slot, or the last one when full.
          const isCaret = focused && (i === value.length || (value.length === length && i === length - 1));
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  backgroundColor: colors.muted,
                  borderColor: error
                    ? colors.destructive
                    : isCaret
                      ? colors.primary
                      : digit
                        ? colors.border
                        : colors.border,
                  borderWidth: error || isCaret ? 1.5 : 1,
                },
              ]}
            >
              <Text variant="h2" style={{ color: colors.foreground }}>
                {digit}
              </Text>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={editable}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        maxLength={length}
        // Lets the OS offer the incoming SMS code.
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        accessibilityLabel={`Enter the ${length}-digit code`}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  box: {
    flex: 1,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Covers the boxes so a tap anywhere focuses it, but stays invisible: the
   * digits the user sees are the ones rendered above.
   */
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    fontFamily: fonts.regular,
    color: 'transparent',
  },
});
