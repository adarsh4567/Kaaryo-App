import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii } from '@/constants/theme';
import { Text } from '@/components/ui/Text';

/**
 * A stylised, non-interactive map used behind the home locate view and the
 * tracking screen.
 *
 * Deliberately not a real map: it needs no API key, no network round-trip and no
 * native module, yet still communicates "experts near you". Geometry is fixed
 * (percentage-based) so it never jitters between renders.
 */

/** Roads: `[left%, top%, width%, height%, rotation°]`. */
const ROADS: [number, number, number, number, number][] = [
  [-10, 34, 130, 3.2, -8],
  [-10, 64, 130, 2.4, 6],
  [24, -20, 2.6, 140, 12],
  [62, -20, 2.2, 140, -6],
  [-20, 14, 90, 1.8, 22],
];

/** City blocks: `[left%, top%, width%, height%]`. */
const BLOCKS: [number, number, number, number][] = [
  [4, 6, 16, 20],
  [30, 8, 22, 16],
  [70, 10, 22, 22],
  [6, 44, 14, 14],
  [34, 42, 20, 14],
  [72, 44, 20, 14],
  [10, 74, 20, 16],
  [42, 74, 18, 16],
  [74, 72, 18, 18],
];

/** Nearby experts: `[left%, top%]`. */
const PINS: [number, number][] = [
  [18, 30],
  [26, 44],
  [40, 22],
  [58, 52],
  [70, 30],
  [82, 46],
  [46, 66],
  [30, 70],
];

export function MapBackdrop({
  height,
  /** Draws the "experts near you" ellipse and pin cluster. */
  showExperts = true,
  /** Pulsing rings under the centre pin — used while dispatching. */
  pulsing = false,
  /** Small caption chip in the bottom-left corner. */
  caption,
  children,
}: {
  height: number;
  showExperts?: boolean;
  pulsing?: boolean;
  caption?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  // Three independent values, started 800ms apart, so the rings trail each other.
  const ringValues = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (!pulsing) {
      ringValues.forEach((v) => v.setValue(0));
      return;
    }
    // The web driver cannot animate transforms off the JS thread. Both timings in
    // a sequence must agree on the driver, or Animated throws on the shared node.
    const nativeDriver = Platform.OS !== 'web';
    const animation = Animated.parallel(
      ringValues.map((value, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 800),
            Animated.timing(value, {
              toValue: 1,
              duration: 2400,
              easing: Easing.out(Easing.ease),
              useNativeDriver: nativeDriver,
            }),
            Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: nativeDriver }),
          ])
        )
      )
    );
    animation.start();
    return () => animation.stop();
  }, [pulsing, ringValues]);

  const rings = ringValues.map((value) => ({
    scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 3.4] }),
    opacity: value.interpolate({
      inputRange: [0, 0.15, 1],
      outputRange: [0, 0.32, 0],
    }),
  }));

  return (
    <View style={[styles.canvas, { height, backgroundColor: colors.mapCanvas }]}>
      {BLOCKS.map(([left, top, w, h], i) => (
        <View
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: pct(left),
            top: pct(top),
            width: pct(w),
            height: pct(h),
            borderRadius: 6,
            backgroundColor: colors.mapBlock,
          }}
        />
      ))}

      {ROADS.map(([left, top, w, h, rotate], i) => (
        <View
          key={`r${i}`}
          style={{
            position: 'absolute',
            left: pct(left),
            top: pct(top),
            width: pct(w),
            height: pct(h),
            backgroundColor: colors.mapRoad,
            transform: [{ rotate: `${rotate}deg` }],
          }}
        />
      ))}

      {showExperts ? (
        <>
          {/* The "experts near you" catchment ring. */}
          <View
            style={[
              styles.catchment,
              { borderColor: colors.primary, backgroundColor: colors.primary },
            ]}
          />
          {PINS.map(([left, top], i) => (
            <View
              key={`p${i}`}
              style={{ position: 'absolute', left: pct(left), top: pct(top) }}
            >
              <MaterialCommunityIcons name="map-marker" size={20} color={colors.primary} />
            </View>
          ))}
        </>
      ) : null}

      {/* Centre marker — the user's own address. */}
      <View style={styles.centreWrap} pointerEvents="none">
        {pulsing
          ? rings.map((ring, i) => (
              <Animated.View
                key={`ring${i}`}
                style={[
                  styles.ring,
                  {
                    borderColor: colors.primary,
                    opacity: ring.opacity,
                    transform: [{ scale: ring.scale }],
                  },
                ]}
              />
            ))
          : null}
        <View style={[styles.centrePin, { backgroundColor: colors.primary }]}>
          <MaterialCommunityIcons name="home-variant" size={15} color={colors.primaryForeground} />
        </View>
      </View>

      {caption ? (
        <View
          style={[
            styles.caption,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={13} color={colors.primary} />
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        </View>
      ) : null}

      {children}
    </View>
  );
}

function pct(value: number): DimensionValue {
  return `${value}%`;
}

const styles = StyleSheet.create({
  canvas: { width: '100%', overflow: 'hidden' },
  catchment: {
    position: 'absolute',
    left: '10%',
    top: '18%',
    width: '80%',
    height: '58%',
    borderRadius: 999,
    borderWidth: 1.5,
    opacity: 0.12,
  },
  centreWrap: {
    position: 'absolute',
    left: '50%',
    top: '46%',
    marginLeft: -14,
    marginTop: -14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  centrePin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '75%',
  },
});
