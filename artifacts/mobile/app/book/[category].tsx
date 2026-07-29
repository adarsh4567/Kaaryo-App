import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';
import { getCategoryByKey } from '@/lib/catalog';
import { createServiceRequest } from '@/lib/api';

const MAX_DESC = 500;

export default function BookingScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, addToHistory } = useAppContext();

  const cat = getCategoryByKey(category ?? '');

  const [step, setStep] = useState(0); // 0: subcategory, 1: details, 2: confirm
  const [selectedSubcat, setSelectedSubcat] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [descError, setDescError] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState('');
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  if (!cat) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Category not found.</Text>
      </View>
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSubcatSelect(key: string | null) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSubcat(key);
    setStep(1);
  }

  function goBack() {
    if (step === 0) { router.back(); return; }
    setStep(step - 1);
  }

  function validateDetails() {
    if (!description.trim()) { setDescError('Please describe the work needed.'); return false; }
    if (description.length > MAX_DESC) { setDescError(`Max ${MAX_DESC} characters.`); return false; }
    if (!location) { setLocError('Please get your location.'); return false; }
    setDescError(''); setLocError('');
    return true;
  }

  async function getLocation() {
    setLocLoading(true);
    setLocError('');
    try {
      if (Platform.OS === 'web') {
        await new Promise<void>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setAddress('My current location');
              resolve();
            },
            () => { setLocError('Could not get location. Enter address manually.'); reject(); },
            { timeout: 10000 }
          );
        });
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocError('Location permission denied. Enter address manually.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        try {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (geo) {
            const parts = [geo.streetNumber, geo.street, geo.district, geo.city, geo.region]
              .filter(Boolean);
            setAddress(parts.join(', '));
          } else {
            setAddress('My current location');
          }
        } catch {
          setAddress('My current location');
        }
      }
    } catch {
      // error already set
    } finally {
      setLocLoading(false);
    }
  }

  async function handleBook() {
    if (!user) {
      Alert.alert('Profile required', 'Go to Profile and enter your name and phone first.');
      return;
    }
    if (!location) { setLocError('Please get your location first.'); return; }
    setBooking(true);
    setBookingError('');
    try {
      const res = await createServiceRequest({
        customerName: user.name,
        customerPhone: user.phone,
        category: cat.key,
        subcategory: selectedSubcat ?? undefined,
        jobDescription: description.trim(),
        lat: location.lat,
        lng: location.lng,
        address,
      });
      await addToHistory({
        id: res.request.id,
        category: cat.key,
        categoryName: cat.name,
        createdAt: res.request.createdAt,
        status: 'searching',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/tracking/[id]', params: { id: res.request.id } });
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to book service. Check your API URL in Profile.');
      setBooking(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedSubcatName = cat.subcategories.find((s) => s.key === selectedSubcat)?.name;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable onPress={goBack} style={[styles.backBtn, { backgroundColor: colors.secondary }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{cat.name}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {step === 0 ? 'Choose a service type' : step === 1 ? 'Describe the job' : 'Review & confirm'}
          </Text>
        </View>
        <View style={[styles.catColorDot, { backgroundColor: cat.color }]} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              { backgroundColor: i <= step ? cat.color : colors.border },
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 0: Subcategory ─────────────────────────────────────────── */}
        {step === 0 && (
          <>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              What specifically do you need?
            </Text>
            <View style={styles.subcatGrid}>
              {cat.subcategories.map((sub) => (
                <TouchableOpacity
                  key={sub.key}
                  onPress={() => handleSubcatSelect(sub.key)}
                  style={[
                    styles.subcatChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.subcatText, { color: colors.foreground }]}>
                    {sub.name}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => handleSubcatSelect(null)}
                style={[styles.subcatChip, { backgroundColor: colors.muted, borderColor: colors.border }]}
                activeOpacity={0.75}
              >
                <Text style={[styles.subcatText, { color: colors.mutedForeground }]}>
                  Other / General
                </Text>
                <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step 1: Job Details ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Tell us about the job
            </Text>

            {selectedSubcatName && (
              <View style={[styles.selectedTag, { backgroundColor: cat.color + '18' }]}>
                <View style={[styles.tagDot, { backgroundColor: cat.color }]} />
                <Text style={[styles.tagText, { color: cat.color }]}>{selectedSubcatName}</Text>
              </View>
            )}

            {/* Description */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Description *
              </Text>
              <TextInput
                style={[
                  styles.textarea,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.muted,
                    borderColor: descError ? colors.destructive : colors.border,
                  },
                ]}
                value={description}
                onChangeText={(t) => { setDescription(t.slice(0, MAX_DESC)); setDescError(''); }}
                placeholder="e.g. Kitchen deep clean, chimney and slab included. 2BHK flat."
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <View style={styles.descFooter}>
                {descError ? (
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{descError}</Text>
                ) : <View />}
                <Text style={[styles.charCount, { color: description.length > MAX_DESC * 0.9 ? colors.destructive : colors.mutedForeground }]}>
                  {description.length}/{MAX_DESC}
                </Text>
              </View>
            </View>

            {/* Location */}
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
                Location *
              </Text>

              <Pressable
                onPress={getLocation}
                disabled={locLoading}
                style={[styles.locBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              >
                {locLoading ? (
                  <ActivityIndicator size="small" color={cat.color} />
                ) : (
                  <Ionicons
                    name={location ? 'location' : 'location-outline'}
                    size={20}
                    color={location ? cat.color : colors.mutedForeground}
                  />
                )}
                <Text style={[styles.locBtnText, { color: location ? cat.color : colors.mutedForeground }]}>
                  {location ? 'Location captured' : 'Use my current location'}
                </Text>
                {location && <Ionicons name="checkmark-circle" size={16} color={cat.color} />}
              </Pressable>

              {location && (
                <TextInput
                  style={[
                    styles.addressInput,
                    { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Edit address (optional)"
                  placeholderTextColor={colors.mutedForeground}
                />
              )}

              {locError ? (
                <Text style={[styles.errorText, { color: colors.destructive }]}>{locError}</Text>
              ) : null}
            </View>

            <Pressable
              onPress={() => { if (validateDetails()) setStep(2); }}
              style={[styles.nextBtn, { backgroundColor: cat.color }]}
            >
              <Text style={styles.nextBtnText}>Review Booking</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </Pressable>
          </>
        )}

        {/* ── Step 2: Confirm ─────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Review your booking
            </Text>

            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <View style={styles.confirmRow}>
                <View style={[styles.confirmIcon, { backgroundColor: cat.color + '18' }]}>
                  <Ionicons name={cat.icon as any} size={22} color={cat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.confirmCat, { color: colors.foreground }]}>
                    {cat.name}{selectedSubcatName ? ` · ${selectedSubcatName}` : ''}
                  </Text>
                  <Text style={[styles.confirmSub, { color: colors.mutedForeground }]}>
                    Indicative price · from ₹{cat.price}
                  </Text>
                </View>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.confirmDetail}>
                <Ionicons name="document-text-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.confirmDetailText, { color: colors.foreground }]}>
                  {description}
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <View style={styles.confirmDetail}>
                <Ionicons name="location-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.confirmDetailText, { color: colors.foreground }]}>
                  {address || 'Location captured'}
                </Text>
              </View>
            </View>

            <View style={[styles.priceBox, { backgroundColor: cat.color + '12', borderColor: cat.color + '30' }]}>
              <Text style={[styles.priceLabel, { color: cat.color }]}>Indicative price</Text>
              <Text style={[styles.priceValue, { color: cat.color }]}>₹{cat.price}</Text>
              <Text style={[styles.priceNote, { color: cat.color }]}>
                Exact price shown after booking. Pay cash after service.
              </Text>
            </View>

            {bookingError ? (
              <View style={[styles.errorBox, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '40' }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.destructive} />
                <Text style={[styles.errorBoxText, { color: colors.destructive }]}>{bookingError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleBook}
              disabled={booking}
              style={({ pressed }) => [
                styles.bookBtn,
                { backgroundColor: cat.color, opacity: pressed || booking ? 0.85 : 1 },
              ]}
            >
              {booking ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.bookBtnText}>Confirm Booking</Text>
                </>
              )}
            </Pressable>

            <Text style={[styles.bookNote, { color: colors.mutedForeground }]}>
              A professional near you will be notified immediately.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  catColorDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 'auto' },
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  stepDot: { flex: 1, height: 4, borderRadius: 2 },
  content: { paddingHorizontal: 16 },
  stepTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
    marginBottom: 18,
  },
  subcatGrid: { gap: 10 },
  subcatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  subcatText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 10,
  },
  textarea: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    minHeight: 120,
    borderWidth: 1.5,
    lineHeight: 22,
  },
  descFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  charCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
  },
  locBtnText: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  addressInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
    marginTop: 10,
  },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  nextBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  confirmIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCat: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  confirmSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  confirmDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  confirmDetailText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  priceBox: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  priceLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  priceValue: { fontSize: 36, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  priceNote: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  errorBoxText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  bookBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
  bookNote: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
});
