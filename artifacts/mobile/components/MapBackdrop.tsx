import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/** One full turn of the radar beam, in ms. */
const SWEEP_PERIOD = 2600;

/** How long a pin stays lit after the beam crosses it. */
const BLIP_RISE = 200;

/**
 * Where in the sweep the beam crosses each pin, as a 0–1 fraction of a turn.
 *
 * Pre-computed so a blip fires as the beam actually reaches that pin rather than
 * on an arbitrary stagger — that sync is the whole reason a radar reads as a
 * search rather than as decoration. The two axes are percentages of different
 * lengths, so the angle is approximate; at this scale the eye cannot tell.
 */
const PIN_PHASE: number[] = PINS.map(([left, top]) => {
  const degrees = (Math.atan2(top - 46, left - 50) * 180) / Math.PI;
  // The beam's leading edge starts due north (−90°), so shift into that frame.
  return ((((degrees + 90) % 360) + 360) % 360) / 360;
});

export function MapBackdrop({
  height,
  /** Draws the "experts near you" ellipse and pin cluster. */
  showExperts = true,
  /** Pulsing rings under the centre pin — used while dispatching. */
  pulsing = false,
  /**
   * Sweeping radar beam over the whole canvas, with the expert pins blipping as
   * it passes them. Used while the app is hunting for a worker.
   */
  radar = false,
  /** Small caption chip in the bottom-left corner. */
  caption,
  children,
}: {
  height: number;
  showExperts?: boolean;
  pulsing?: boolean;
  radar?: boolean;
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

  // ── Radar ──────────────────────────────────────────────────────────────────

  const sweepValue = useRef(new Animated.Value(0)).current;
  const blipValues = useRef(PINS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!radar) {
      sweepValue.setValue(0);
      blipValues.forEach((v) => v.setValue(0));
      return;
    }
    const nativeDriver = Platform.OS !== 'web';

    const beam = Animated.loop(
      Animated.timing(sweepValue, {
        toValue: 1,
        duration: SWEEP_PERIOD,
        easing: Easing.linear,
        useNativeDriver: nativeDriver,
      })
    );

    // Each pin loops on the beam's own period with its phase held in a leading
    // delay, so the two never drift however long the search runs.
    const blips = blipValues.map((value, i) => {
      const lead = Math.min(PIN_PHASE[i] * SWEEP_PERIOD, SWEEP_PERIOD - BLIP_RISE - 1);
      return Animated.loop(
        Animated.sequence([
          Animated.delay(lead),
          Animated.timing(value, {
            toValue: 1,
            duration: BLIP_RISE,
            easing: Easing.out(Easing.quad),
            useNativeDriver: nativeDriver,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: SWEEP_PERIOD - BLIP_RISE - lead,
            easing: Easing.in(Easing.quad),
            useNativeDriver: nativeDriver,
          }),
        ])
      );
    });

    const animation = Animated.parallel([beam, ...blips]);
    animation.start();
    return () => animation.stop();
  }, [radar, sweepValue, blipValues]);

  const beamRotate = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Overshoots the canvas so the beam sweeps corner to corner rather than
  // spinning inside a visible circle; `overflow: hidden` crops the rest.
  const discSize = useMemo(() => height * 1.9, [height]);

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

      {/* Radar sweep, under the pins so they stay legible through the beam. */}
      {radar ? (
        <View
          pointerEvents="none"
          style={[
            styles.radarWrap,
            {
              width: discSize,
              height: discSize,
              marginLeft: -discSize / 2,
              marginTop: -discSize / 2,
            },
          ]}
        >
          {RADAR_RINGS.map((fraction) => (
            <View
              key={fraction}
              style={[
                styles.radarRing,
                {
                  width: discSize * fraction,
                  height: discSize * fraction,
                  borderRadius: (discSize * fraction) / 2,
                  borderColor: colors.primary,
                },
              ]}
            />
          ))}
          <Animated.View
            style={[StyleSheet.absoluteFill, { transform: [{ rotate: beamRotate }] }]}
          >
            <LinearGradient
              colors={[
                withAlpha(colors.primary, 0.42),
                withAlpha(colors.primary, 0.1),
                withAlpha(colors.primary, 0),
              ]}
              locations={[0, 0.55, 1]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                width: discSize / 2,
                height: discSize / 2,
                borderTopLeftRadius: discSize / 2,
              }}
            />
          </Animated.View>
        </View>
      ) : null}

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
            <Animated.View
              key={`p${i}`}
              style={{
                position: 'absolute',
                left: pct(left),
                top: pct(top),
                opacity: radar
                  ? blipValues[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.25, 1],
                    })
                  : 1,
                transform: radar
                  ? [
                      {
                        scale: blipValues[i].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.86, 1.22],
                        }),
                      },
                    ]
                  : [],
              }}
            >
              <MaterialCommunityIcons name="map-marker" size={20} color={colors.primary} />
            </Animated.View>
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

/** Radii of the radar's range rings, as a fraction of the disc. */
const RADAR_RINGS = [0.4, 0.7, 1];

/**
 * `#00674F` → `rgba(0, 103, 79, 0.42)`.
 *
 * The gradient needs the brand green at several opacities, and the palette only
 * ships opaque hex. Anything that is not `#rrggbb` is passed through untouched.
 */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const [r, g, b] = match.slice(1).map((pair) => parseInt(pair, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  canvas: { width: '100%', overflow: 'hidden' },
  radarWrap: {
    position: 'absolute',
    // Anchored on the home pin, which sits at 50% / 46% of the canvas.
    left: '50%',
    top: '46%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: { position: 'absolute', borderWidth: 1, opacity: 0.16 },
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
