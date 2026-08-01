import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { radii } from '@/constants/theme';
import { MapBackdrop } from '@/components/MapBackdrop';
import { Text } from '@/components/ui';
import { pickerHtml } from './pickerHtml';
import { resolveTileSource } from './tileSource';

export interface AddressPickerMapProps {
  height: number;
  /** Where the pin sits. Changing this moves and recentres the map. */
  value: { lat: number; lng: number };
  /** Fires when the customer drags the pin or taps the map — never on `value` changes. */
  onChange: (next: { lat: number; lng: number }) => void;
  caption?: string;
}

/**
 * A real OpenStreetMap the customer drops a pin on, for the address form.
 *
 * The coordinate this produces is what dispatch searches around and what the
 * tracking map later shows as the destination, so it is worth a deliberate tap
 * rather than whatever the GPS guessed.
 */
export function AddressPickerMap({ height, value, onChange, caption }: AddressPickerMapProps) {
  const { colors, isDark } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const tilesProvenRef = useRef(false);

  const { tileUrl, attribution } = resolveTileSource(isDark);

  // Read as primitives: callers build `value` inline, so the object identity
  // changes on every render and would re-run the effects below each time.
  const lat = value.lat;
  const lng = value.lng;

  /**
   * The pin position the WebView already has. Guards the sync effect below from
   * echoing a customer's own drag straight back at them mid-gesture, which
   * would fight the drag and snap the pin.
   */
  const appliedRef = useRef<{ lat: number; lng: number } | null>(null);

  /**
   * The centre the document is built with.
   *
   * The document is built once — rebuilding it per pin move would reload the
   * WebView and flash the map white on every tap — so until it has actually
   * loaded, keep adopting a newer `value`. A parent that resolves its location
   * asynchronously (saved addresses hydrating from storage) would otherwise
   * paint the wrong city on first frame and visibly jump.
   */
  const [center, setCenter] = useState({ lat, lng });

  useEffect(() => {
    if (ready) return;
    setCenter((current) =>
      current.lat === lat && current.lng === lng ? current : { lat, lng }
    );
  }, [ready, lat, lng]);

  const html = useMemo(
    () =>
      pickerHtml({
        tileUrl,
        attribution,
        center: [center.lat, center.lng],
        colors: { primary: colors.primary, surface: colors.mapCanvas },
      }),
    [tileUrl, attribution, center, colors.primary, colors.mapCanvas]
  );

  const mapKey = `${isDark ? 'd' : 'l'}:${tileUrl}`;

  useEffect(() => {
    setReady(false);
    setFailed(false);
    tilesProvenRef.current = false;
  }, [mapKey]);

  useEffect(() => {
    if (!ready) return;
    const applied = appliedRef.current;
    // Sub-metre differences are the round-trip of the customer's own gesture.
    if (applied && Math.abs(applied.lat - lat) < 1e-6 && Math.abs(applied.lng - lng) < 1e-6) {
      return;
    }
    appliedRef.current = { lat, lng };
    webViewRef.current?.injectJavaScript(
      `window.setPin && window.setPin(${JSON.stringify(lat)}, ${JSON.stringify(
        lng
      )}, true); true;`
    );
  }, [ready, lat, lng]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          lat?: number;
          lng?: number;
        };
        if (data.type === 'ready') setReady(true);
        else if (data.type === 'tileok') tilesProvenRef.current = true;
        else if (data.type === 'tileerror' && !tilesProvenRef.current) setFailed(true);
        else if (data.type === 'pick' && data.lat != null && data.lng != null) {
          appliedRef.current = { lat: data.lat, lng: data.lng };
          onChange({ lat: data.lat, lng: data.lng });
        }
      } catch {
        // Malformed/foreign message — nothing to act on.
      }
    },
    [onChange]
  );

  // `react-native-webview` has no web renderer — see LiveTrackingMap for why
  // this screen keeps the placeholder there.
  if (Platform.OS === 'web' || failed) {
    return <MapBackdrop height={height} showExperts={false} caption={caption} />;
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        key={mapKey}
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
        onMessage={handleMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        scrollEnabled={false}
        bounces={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.mapCanvas }]} />
        )}
      />

      <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MaterialCommunityIcons name="gesture-tap" size={13} color={colors.primary} />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {caption ? `${caption} · tap to adjust` : 'Tap or drag the pin'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  hint: {
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
    maxWidth: '80%',
  },
});
