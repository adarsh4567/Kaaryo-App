import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/HeroHeader';
import { MapBackdrop } from '@/components/MapBackdrop';
import {
  BottomBar,
  Button,
  Card,
  Chip,
  Field,
  IconBubble,
  Text,
} from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { CITIES } from '@/lib/catalog';

/** Tags offered for a new address; "Other" lets the user type their own. */
const LABELS = ['home', 'work', 'other'] as const;

export default function AddressScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { addresses, activeAddress, addAddress, selectAddress, removeAddress } =
    useAppContext();

  const [city, setCity] = useState(CITIES[0].city);
  const [locality, setLocality] = useState<string | null>(null);
  const [line, setLine] = useState('');
  const [label, setLabel] = useState<string>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const localities = CITIES.find((c) => c.city === city)?.localities ?? [];
  const resolvedLabel = (label === 'other' ? customLabel.trim() : label) || 'home';

  /**
   * Fills city/locality from the device GPS. Reverse geocoding can fail or return
   * a city we do not serve, so the picker stays editable either way.
   */
  async function useCurrentLocation() {
    setLocating(true);
    setNotice('');
    setError('');
    try {
      if (Platform.OS === 'web') {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 });
        });
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setNotice('Location captured. Pick your locality below.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied. Choose your locality manually.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (place) {
        const served = CITIES.find(
          (c) => c.city.toLowerCase() === (place.city ?? '').toLowerCase()
        );
        if (served) setCity(served.city);
        const street = [place.name, place.street].filter(Boolean).join(', ');
        if (street) setLine(street);
        setNotice(
          served
            ? 'Location captured. Confirm your locality below.'
            : `We do not serve ${place.city ?? 'that area'} yet — pick a nearby city.`
        );
      } else {
        setNotice('Location captured. Pick your locality below.');
      }
    } catch {
      setError('Could not read your location. Choose your locality manually.');
    } finally {
      setLocating(false);
    }
  }

  async function handleSave() {
    if (!locality) {
      setError('Select your locality.');
      return;
    }
    if (!line.trim()) {
      setError('Add your house or flat number.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addAddress({
      label: resolvedLabel,
      locality,
      city,
      line: line.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
    });
    router.back();
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Service address"
        subtitle="Where should the expert arrive?"
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <MapBackdrop height={150} showExperts={false} caption={city} />

        <View style={styles.body}>
          <Button
            label={coords ? 'Location captured' : 'Use my current location'}
            icon={coords ? 'check-circle-outline' : 'crosshairs-gps'}
            variant={coords ? 'secondary' : 'outline'}
            loading={locating}
            fullWidth
            onPress={useCurrentLocation}
            style={styles.locateBtn}
          />

          {notice ? (
            <Text variant="caption" tone="primary" style={styles.help}>
              {notice}
            </Text>
          ) : null}

          {/* ── Saved addresses ──────────────────────────────────────────── */}
          {addresses.length > 0 ? (
            <>
              <Text variant="h3" style={styles.sectionTitle}>
                Saved addresses
              </Text>
              <View style={styles.savedStack}>
                {addresses.map((address) => {
                  const selected = activeAddress?.id === address.id;
                  return (
                    <Pressable
                      key={address.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={async () => {
                        await selectAddress(address.id);
                        router.back();
                      }}
                      style={({ pressed }) => [
                        styles.savedRow,
                        {
                          backgroundColor: selected ? colors.secondary : colors.card,
                          borderColor: selected ? colors.primary : colors.border,
                          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <IconBubble
                        icon={
                          address.label === 'work'
                            ? 'briefcase-outline'
                            : address.label === 'home'
                              ? 'home-outline'
                              : 'map-marker-outline'
                        }
                        size={40}
                        tone={selected ? 'primary' : 'muted'}
                      />
                      <View style={styles.flex}>
                        <Text variant="bodySemi" style={styles.capitalize}>
                          {address.label}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {[address.line, address.locality, address.city]
                            .filter(Boolean)
                            .join(', ')}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${address.label} address`}
                        hitSlop={8}
                        onPress={() => removeAddress(address.id)}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* ── New address ──────────────────────────────────────────────── */}
          <Text variant="h3" style={styles.sectionTitle}>
            Add a new address
          </Text>

          <Text variant="label" tone="muted" style={styles.fieldLabel}>
            CITY
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.chipRow}
          >
            {CITIES.map((entry) => (
              <Chip
                key={entry.city}
                label={entry.city}
                selected={city === entry.city}
                onPress={() => {
                  setCity(entry.city);
                  setLocality(null);
                }}
              />
            ))}
          </ScrollView>

          <Text variant="label" tone="muted" style={styles.fieldLabel}>
            LOCALITY
          </Text>
          <View style={styles.wrapRow}>
            {localities.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={locality === option}
                onPress={() => setLocality(option)}
              />
            ))}
          </View>

          <Field
            label="House / flat / floor"
            icon="home-city-outline"
            placeholder="B-204, Green Meadows"
            value={line}
            onChangeText={(text) => {
              setLine(text);
              setError('');
            }}
            containerStyle={styles.field}
          />

          <Text variant="label" tone="muted" style={styles.fieldLabel}>
            SAVE AS
          </Text>
          <View style={styles.wrapRow}>
            {LABELS.map((option) => (
              <Chip
                key={option}
                label={option === 'other' ? 'Other' : option === 'home' ? 'Home' : 'Work'}
                selected={label === option}
                onPress={() => setLabel(option)}
              />
            ))}
          </View>

          {label === 'other' ? (
            <Field
              placeholder="e.g. mom's place"
              icon="tag-outline"
              value={customLabel}
              onChangeText={setCustomLabel}
              containerStyle={styles.field}
            />
          ) : null}

          {error ? (
            <Card tone="destructive" padding="md" style={styles.field}>
              <Text variant="caption" style={{ color: colors.destructive }}>
                {error}
              </Text>
            </Card>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>

      <BottomBar bottomInset={insets.bottom}>
        <Button label="Save address" icon="content-save-outline" fullWidth onPress={handleSave} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  locateBtn: { marginBottom: spacing.sm },
  help: { marginBottom: spacing.sm },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.md },
  savedStack: { gap: spacing.sm },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  capitalize: { textTransform: 'capitalize' },
  fieldLabel: { letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.md },
  bleed: { marginHorizontal: -spacing.lg },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: { marginTop: spacing.lg },
});
