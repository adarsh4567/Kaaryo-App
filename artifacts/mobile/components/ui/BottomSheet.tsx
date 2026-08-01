import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';

const ENTER_MS = 280;
const EXIT_MS = 200;

/**
 * A sheet that rises from the bottom edge over a dimmed backdrop.
 *
 * Built on the platform `Modal` rather than an in-tree overlay so it sits above
 * the floating tab bar and the cart bar — both of which are absolutely
 * positioned and would otherwise punch through the scrim.
 *
 * The slide distance is the sheet's own measured height, so a short sheet does
 * not travel the full screen to get on stage. Until that first measurement lands
 * the sheet is held invisible, which costs one frame and avoids a flash of the
 * content sitting in its final position before the animation starts.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  /** Cap on how much of the screen the sheet may take, as a fraction. */
  maxHeightRatio = 0.9,
  style,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, shadow } = useTheme();
  const insets = useScreenInsets();

  // Kept mounted through the exit animation — unmounting on `visible` alone
  // would snap the sheet away instead of letting it slide out.
  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  useEffect(() => {
    if (!visible || !sheetHeight) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, sheetHeight, progress]);

  function handleLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.height);
    // Re-measuring on every keyboard nudge would restart nothing but does churn
    // the interpolation, so only a real size change is worth recording.
    setSheetHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight || 600, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.overlay, opacity: progress },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.stage}
        >
          <Animated.View
            onLayout={handleLayout}
            style={[
              styles.sheet,
              shadow.lg,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + spacing.lg,
                maxHeight: `${maxHeightRatio * 100}%`,
                opacity: sheetHeight ? 1 : 0,
                transform: [{ translateY }],
              },
              style,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // Must fill the root: `maxHeightRatio` is a percentage, and a percentage of a
  // content-sized parent resolves to nothing.
  stage: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    marginBottom: spacing.md,
  },
});
