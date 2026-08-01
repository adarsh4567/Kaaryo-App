import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii } from '@/constants/theme';
import { MapBackdrop } from '@/components/MapBackdrop';
import { Text } from '@/components/ui';
import { leafletHtml } from './leafletHtml';
import { resolveTileSource } from './tileSource';

export interface LiveTrackingMapProps {
  height: number;
  /** Job address, GeoJSON `[lng, lat]` — same shape `UserRequest.location` uses. */
  destination?: [number, number];
  /** Worker's live position, GeoJSON `[lng, lat]`. Undefined until the first ping. */
  worker?: [number, number];
  heading?: number | null;
  arrived?: boolean;
  /** Greys the marker rather than hiding it — the fix is old, not absent. */
  locationStale?: boolean;
  caption?: string;
  /** Adds the expand control and the full-screen viewer. */
  expandable?: boolean;
  /** Shown in the full-screen viewer's header — e.g. "Arriving in ~4 min". */
  expandedTitle?: string;
}

/** Live position pushed into an already-loaded map, without reloading it. */
interface MapMarkerState {
  workerLat?: number;
  workerLng?: number;
  heading?: number | null;
  arrived?: boolean;
  locationStale?: boolean;
}

interface MapHandle {
  /** Re-fits both markers and resumes auto-follow after a manual pan. */
  recenter: () => void;
}

interface MapCanvasProps extends MapMarkerState {
  html: string;
  /** Remounts the WebView when the *document* changes — never on a position update. */
  mapKey: string;
  onReadyChange?: (ready: boolean) => void;
  onFail: () => void;
  style?: object;
}

/**
 * The WebView half, split out so the inline map and the full-screen viewer are
 * the same code rather than two drifting copies. Each instance owns its own
 * `ready` gate because they load independently.
 */
const MapCanvas = forwardRef<MapHandle, MapCanvasProps>(function MapCanvas(
  { html, mapKey, workerLat, workerLng, heading, arrived, locationStale, onFail, style },
  ref
) {
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  /**
   * Once any tile has loaded, the tile source is proven good and later
   * `tileerror`s are just gaps at the edge of coverage — common while panning a
   * big map, and not a reason to tear the map down.
   */
  const tilesProvenRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => {
        webViewRef.current?.injectJavaScript('window.recenter && window.recenter(); true;');
      },
    }),
    []
  );

  useEffect(() => {
    setReady(false);
    tilesProvenRef.current = false;
  }, [mapKey]);

  useEffect(() => {
    if (!ready || workerLat == null || workerLng == null) return;
    webViewRef.current?.injectJavaScript(
      `window.setWorker && window.setWorker(${JSON.stringify(workerLat)}, ${JSON.stringify(
        workerLng
      )}, ${JSON.stringify(heading ?? null)}, ${JSON.stringify(!!arrived)}, ${JSON.stringify(
        !!locationStale
      )}); true;`
    );
  }, [ready, workerLat, workerLng, heading, arrived, locationStale]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as { type?: string };
        if (data.type === 'ready') setReady(true);
        else if (data.type === 'tileok') tilesProvenRef.current = true;
        else if (data.type === 'tileerror' && !tilesProvenRef.current) onFail();
      } catch {
        // Malformed/foreign message — nothing to act on.
      }
    },
    [onFail]
  );

  return (
    <WebView
      key={mapKey}
      ref={webViewRef}
      source={{ html }}
      originWhitelist={['*']}
      onMessage={handleMessage}
      onError={onFail}
      onHttpError={onFail}
      // The inline map sits inside a ScrollView; letting the WebView scroll too
      // makes the two fight over the same vertical drag. Leaflet does its own
      // panning from touch events either way.
      scrollEnabled={false}
      bounces={false}
      setSupportMultipleWindows={false}
      androidLayerType="hardware"
      style={[styles.webview, style]}
      startInLoadingState
      renderLoading={() => (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapCanvas }]} />
      )}
    />
  );
});

/**
 * Real OpenStreetMap tracking view, replacing `MapBackdrop` once a request has a
 * job address and (optionally) a live worker position.
 *
 * Renders as a Leaflet map inside a WebView rather than a native map module —
 * `react-native-webview` runs inside Expo Go, so this needs no `expo prebuild` /
 * dev-client build. iOS/Android only: `react-native-webview` has no web
 * renderer, so this screen is out of scope for the web build for now.
 * See `docs/live-tracking-openstreetmap-plan.md` §0.2 for the reasoning.
 */
export function LiveTrackingMap({
  height,
  destination,
  worker,
  heading,
  arrived,
  locationStale,
  caption,
  expandable = false,
  expandedTitle,
}: LiveTrackingMapProps) {
  const { colors, isDark } = useTheme();
  const insets = useScreenInsets();
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const expandedMapRef = useRef<MapHandle>(null);

  const destLng = destination?.[0];
  const destLat = destination?.[1];

  const { tileUrl, attribution } = resolveTileSource(isDark);

  // Rebuilding the HTML on every worker ping reloads the whole WebView (a white
  // flash every few seconds) — this only changes when the things that actually
  // change the *document* change. Position updates go through `injectJavaScript`
  // instead.
  const html = useMemo(() => {
    if (destLat == null || destLng == null) return '';
    return leafletHtml({
      tileUrl,
      attribution,
      destination: [destLat, destLng],
      colors: {
        primary: colors.primary,
        onPrimary: colors.primaryForeground,
        surface: colors.mapCanvas,
        mutedForeground: colors.mutedForeground,
        arrived: colors.success,
      },
      dark: isDark,
    });
  }, [
    destLat,
    destLng,
    tileUrl,
    attribution,
    isDark,
    colors.primary,
    colors.primaryForeground,
    colors.mapCanvas,
    colors.mutedForeground,
    colors.success,
  ]);

  const mapKey = `${destLat ?? 'x'}:${destLng ?? 'x'}:${isDark ? 'd' : 'l'}:${tileUrl}`;

  useEffect(() => {
    setFailed(false);
  }, [mapKey]);

  const handleFail = useCallback(() => setFailed(true), []);

  const markerState: MapMarkerState = {
    workerLat: worker?.[1],
    workerLng: worker?.[0],
    heading,
    arrived,
    locationStale,
  };

  // `react-native-webview` ships no web renderer at all — on web it renders
  // "does not support this platform" instead of a map. This is an iOS/Android
  // component; a real web map is a separate follow-on (see the plan doc §0.2).
  if (Platform.OS === 'web' || destLat == null || destLng == null || failed) {
    return <MapBackdrop height={height} showExperts={false} caption={caption} />;
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <MapCanvas html={html} mapKey={mapKey} onFail={handleFail} {...markerState} />

      {caption ? (
        <View
          style={[styles.caption, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={13} color={colors.primary} />
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {caption}
          </Text>
        </View>
      ) : null}

      {expandable ? (
        <MapControl
          icon="arrow-expand-all"
          label="Expand map"
          style={styles.expandBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setExpanded(true);
          }}
        />
      ) : null}

      {/* A second WebView rather than reparenting the first: moving a live
          WebView between containers reloads it anyway, and this way closing the
          viewer leaves the inline map exactly as the customer left it. */}
      {expandable ? (
        <Modal
          visible={expanded}
          animationType="slide"
          onRequestClose={() => setExpanded(false)}
          statusBarTranslucent
        >
          <View style={[styles.fill, { backgroundColor: colors.mapCanvas }]}>
            <MapCanvas
              ref={expandedMapRef}
              html={html}
              mapKey={mapKey}
              onFail={handleFail}
              {...markerState}
            />

            <View style={[styles.expandedTop, { top: insets.top + 10 }]}>
              <MapControl
                icon="close"
                label="Close map"
                onPress={() => setExpanded(false)}
              />
              {expandedTitle ? (
                <View
                  style={[
                    styles.expandedTitle,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Text variant="captionSemi" numberOfLines={1}>
                    {expandedTitle}
                  </Text>
                </View>
              ) : null}
              {/* Panning stops the map auto-following the worker, so a way back
                  is mandatory once the map is big enough to get lost in. */}
              <MapControl
                icon="crosshairs-gps"
                label="Recentre map"
                onPress={() => expandedMapRef.current?.recenter()}
              />
            </View>

            {caption ? (
              <View
                style={[
                  styles.caption,
                  styles.expandedCaption,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    bottom: insets.bottom + 16,
                  },
                ]}
              >
                <MaterialCommunityIcons name="map-marker" size={13} color={colors.primary} />
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {caption}
                </Text>
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Round, card-backed control floating over the map. */
function MapControl({
  icon,
  label,
  onPress,
  style,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={19} color={colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { width: '100%', overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
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
  expandedCaption: { left: 16, right: 16, maxWidth: undefined },
  control: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  expandBtn: { position: 'absolute', top: 12, right: 12 },
  expandedTop: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandedTitle: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
