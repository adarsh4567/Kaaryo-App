import React, { useEffect, useRef, useState } from 'react';
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
import { AddressPickerMap } from '@/components/map/AddressPickerMap';
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
  /** Set once the customer picks a city themselves, which stops the seed below. */
  const [cityChosen, setCityChosen] = useState(false);
  /** Guards the one-shot seed in the effect below. */
  const seededRef = useRef(false);

  /**
   * Open on the address the customer is actually using, not on whichever city
   * happens to be first in the catalog.
   *
   * This has to be an effect rather than a `useState` initialiser: addresses
   * hydrate from storage after the first render, so at mount `activeAddress` is
   * still null and a lazy initialiser would lock in the wrong city forever.
   *
   * It runs at most once. Seeding again later could swap the city out from under
   * a locality the customer had already picked, leaving a Gurugram locality
   * filed under Hyderabad.
   */
  useEffect(() => {
    if (seededRef.current || !activeAddress) return;
    const served = CITIES.find(
      (entry) => entry.city.toLowerCase() === activeAddress.city.toLowerCase()
    );
    // Not a city we serve: leave the flag down so a later address can still
    // seed, and let the map fall back to the raw coordinate below.
    if (!served) return;
    seededRef.current = true;
    setCity(served.city);
    setLocality(
      served.localities.includes(activeAddress.locality) ? activeAddress.locality : null
    );
  }, [activeAddress]);

  const cityEntry = CITIES.find((c) => c.city === city) ?? CITIES[0];
  const localities = cityEntry.localities;
  const resolvedLabel = (label === 'other' ? customLabel.trim() : label) || 'home';

  /**
   * The active address's own coordinate, used to open the map on the customer's
   * actual doorstep — including when their city is one the catalog doesn't list,
   * where it is the only accurate view available.
   *
   * It stops applying the moment they pick a city themselves, so the map follows
   * the chips rather than staying pinned to a different state.
   */
  const seededCoords =
    !cityChosen && activeAddress?.lat != null && activeAddress?.lng != null
      ? { lat: activeAddress.lat, lng: activeAddress.lng }
      : null;

  /**
   * Where the pin sits. `coords` means "the customer has chosen a coordinate for
   * *this* address" — from GPS or by placing the pin — and it is the only one
   * that gets saved. The seed and the city centroid are opening views only: a
   * neighbouring address's coordinate is not this address's, and a city centroid
   * is nobody's doorstep.
   */
  const pin = coords ?? seededCoords ?? { lat: cityEntry.center[0], lng: cityEntry.center[1] };

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
        if (served) {
          setCity(served.city);
          // A GPS fix outranks the saved-address seed — don't let it snap back.
          setCityChosen(true);
        }
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
        <AddressPickerMap
          height={200}
          value={pin}
          onChange={(next) => {
            setCoords(next);
            setNotice('Pin placed. This is where your expert will be sent.');
            setError('');
          }}
          caption={[locality, city].filter(Boolean).join(', ')}
        />

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
                  setCityChosen(true);
                  setLocality(null);
                  // A coordinate captured in the previous city does not describe
                  // this one. Dropping it moves the map to the new city and puts
                  // the locate button honestly back to "not captured yet".
                  setCoords(null);
                  setNotice('');
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
