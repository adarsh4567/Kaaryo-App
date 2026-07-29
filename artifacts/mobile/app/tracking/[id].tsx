import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';
import {
  trackRequest,
  cancelServiceRequest,
  ServiceRequest,
} from '@/lib/api';
import { getCategoryByKey } from '@/lib/catalog';

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={rating >= s ? 'star' : rating >= s - 0.5 ? 'star-half' : 'star-outline'}
          size={14}
          color="#f59e0b"
        />
      ))}
    </View>
  );
}

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { apiUrl, updateHistoryStatus } = useAppContext();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const stopFnRef = useRef<(() => void) | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const apiUrlRef = useRef(apiUrl);
  const idRef = useRef(id);

  // Animated pulse rings for searching
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const searchAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  function startSearchAnim() {
    const nd = Platform.OS !== 'web';
    const makeRing = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 2200, useNativeDriver: nd }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: nd }),
        ])
      );
    searchAnimRef.current = Animated.parallel([
      makeRing(pulse1, 0),
      makeRing(pulse2, 700),
      makeRing(pulse3, 1400),
    ]);
    searchAnimRef.current.start();
  }

  function stopSearchAnim() {
    searchAnimRef.current?.stop();
    pulse1.setValue(0);
    pulse2.setValue(0);
    pulse3.setValue(0);
  }

  useEffect(() => { apiUrlRef.current = apiUrl; }, [apiUrl]);
  useEffect(() => { idRef.current = id; }, [id]);

  function startPollerNow() {
    const reqId = idRef.current;
    if (!reqId) return;
    stopFnRef.current = trackRequest(
      apiUrlRef.current,
      reqId,
      (req) => {
        setRequest((prev) => {
          if (prev && prev.status !== req.status) {
            if (req.status === 'in_progress') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else if (req.status === 'completed' || req.status === 'pending_rating') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            updateHistoryStatus(req.id, req.status);
          }
          return req;
        });
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        setFetchError(err.message);
        setLoading(false);
      }
    );
  }

  useEffect(() => {
    startPollerNow();
    return () => {
      stopFnRef.current?.();
      stopSearchAnim();
    };
  }, []);

  useEffect(() => {
    if (request?.status === 'searching') {
      startSearchAnim();
    } else {
      stopSearchAnim();
    }
  }, [request?.status]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        stopFnRef.current?.();
        startPollerNow();
      } else if (next.match(/inactive|background/)) {
        stopFnRef.current?.();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  async function handleCancel() {
    const w = request?.worker?.name;
    Alert.alert(
      'Cancel Booking?',
      w ? `${w} is on the way. Sure you want to cancel?` : 'Cancel this booking?',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            setCancelling(true);
            try {
              const updated = await cancelServiceRequest(id);
              setRequest(updated);
              updateHistoryStatus(id, 'cancelled');
              stopFnRef.current?.();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);
  const botPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0);
  const cat = request ? getCategoryByKey(request.category) : null;

  const ringStyle = (anim: Animated.Value) => ({
    scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }),
    opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.35, 0] }),
  });
  const r1 = ringStyle(pulse1);
  const r2 = ringStyle(pulse2);
  const r3 = ringStyle(pulse3);

  // Header shared by all states
  const PageHeader = ({ title }: { title: string }) => (
    <View style={[styles.topHeader, { paddingTop: topPad + 8 }]}>
      <Pressable
        onPress={() => router.replace('/(tabs)')}
        style={[styles.backBtn, { backgroundColor: colors.secondary }]}
      >
        <Ionicons name="home-outline" size={18} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
    </View>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingSpinner, { borderTopColor: colors.primary, borderColor: colors.border }]} />
        <Text style={[styles.smallText, { color: colors.mutedForeground, marginTop: 16 }]}>
          Loading booking…
        </Text>
      </View>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (fetchError && !request) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 32 }]}>
        <Ionicons name="cloud-offline-outline" size={52} color={colors.mutedForeground} />
        <Text style={[styles.resultTitle, { color: colors.foreground, marginTop: 16 }]}>
          Could not load booking
        </Text>
        <Text style={[styles.resultSub, { color: colors.mutedForeground, textAlign: 'center' }]}>
          {fetchError}
        </Text>
        <Pressable
          onPress={() => router.replace('/(tabs)')}
          style={[styles.fullBtn, { backgroundColor: colors.primary, marginTop: 24 }]}
        >
          <Text style={styles.fullBtnText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  if (!request) return null;

  // ── SEARCHING ────────────────────────────────────────────────────────────────
  if (request.status === 'searching') {
    const color = cat?.color ?? colors.primary;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title={cat?.name ?? request.category} />
        <View style={styles.searchingBody}>
          <View style={styles.pulseWrap}>
            {[r1, r2, r3].map((r, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  {
                    borderColor: color,
                    opacity: r.opacity,
                    transform: [{ scale: r.scale }],
                  },
                ]}
              />
            ))}
            <View style={[styles.pulseCenter, { backgroundColor: color + '15', borderColor: color + '35' }]}>
              <Ionicons name="search" size={38} color={color} />
            </View>
          </View>

          <Text style={[styles.searchTitle, { color: colors.foreground }]}>
            Finding a Professional
          </Text>
          <Text style={[styles.searchSub, { color: colors.mutedForeground }]}>
            Searching within {request.radiusKm} km
          </Text>

          <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{request.wave}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Wave</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{request.workersNotified}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Notified</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.foreground }]}>{request.radiusKm} km</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Radius</Text>
            </View>
          </View>

          <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
            Professionals up to 15 km will be notified.{'\n'}This takes up to 3 minutes.
          </Text>
        </View>

        <View style={[styles.bottomActions, { paddingBottom: botPad + 16 }]}>
          <Pressable
            onPress={handleCancel}
            disabled={cancelling}
            style={[styles.cancelOutline, { borderColor: colors.destructive }]}
          >
            <Ionicons name="close" size={18} color={colors.destructive} />
            <Text style={[styles.cancelOutlineText, { color: colors.destructive }]}>
              {cancelling ? 'Cancelling…' : 'Cancel Booking'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── IN PROGRESS ──────────────────────────────────────────────────────────────
  if (request.status === 'in_progress' && request.worker) {
    const w = request.worker;
    const color = cat?.color ?? colors.primary;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title={cat?.name ?? request.category} />
        <ScrollView
          contentContainerStyle={{ paddingBottom: botPad + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Banner */}
          <View style={[styles.acceptBanner, { backgroundColor: color }]}>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.acceptBannerText}>{w.name} accepted your booking!</Text>
          </View>

          {/* Worker card */}
          <View style={styles.workerSection}>
            <View style={[styles.workerCard, { backgroundColor: colors.card }]}>
              <View style={styles.workerTop}>
                <View style={[styles.workerAvatar, { backgroundColor: color + '20' }]}>
                  <Text style={[styles.workerAvatarLetter, { color }]}>
                    {w.name[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.workerName, { color: colors.foreground }]}>{w.name}</Text>
                  <StarRating rating={w.rating} />
                  <Text style={[styles.workerMeta, { color: colors.mutedForeground }]}>
                    {w.rating.toFixed(1)} · {w.jobsCompleted} jobs completed
                  </Text>
                </View>
                <View style={[styles.distBadge, { backgroundColor: color + '15' }]}>
                  <Text style={[styles.distText, { color }]}>{w.distanceKm} km</Text>
                </View>
              </View>

              <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Linking.openURL(`tel:${w.phone}`);
                }}
                style={[styles.callBtn, { backgroundColor: color }]}
              >
                <Ionicons name="call" size={20} color="#fff" />
                <Text style={styles.callBtnText}>Call {w.name}</Text>
              </Pressable>
            </View>
          </View>

          {/* Job details */}
          <View style={[styles.detailCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.detailCardLabel, { color: colors.mutedForeground }]}>JOB DETAILS</Text>
            <Text style={[styles.detailCardText, { color: colors.foreground }]}>{request.jobDescription}</Text>
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.detailRowText, { color: colors.foreground }]}>
                {request.address || 'Location captured'}
              </Text>
            </View>
            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={colors.mutedForeground} />
              <Text style={[styles.detailRowText, { color: colors.foreground }]}>
                ₹{request.totalPrice} — Pay in Cash after service
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.bottomActions, { paddingBottom: botPad + 16 }]}>
          <Pressable
            onPress={handleCancel}
            disabled={cancelling}
            style={[styles.cancelOutline, { borderColor: colors.destructive }]}
          >
            <Ionicons name="close" size={18} color={colors.destructive} />
            <Text style={[styles.cancelOutlineText, { color: colors.destructive }]}>
              {cancelling ? 'Cancelling…' : 'Cancel Booking'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── COMPLETED / PENDING RATING ────────────────────────────────────────────
  if (request.status === 'pending_rating' || request.status === 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title="Work Completed" />
        <View style={styles.resultBody}>
          <View style={[styles.resultIconWrap, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
          </View>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Work Completed!</Text>
          <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
            {request.worker ? `${request.worker.name} has finished the job.` : 'The job has been completed.'}
          </Text>

          <View style={[styles.payCard, { backgroundColor: colors.accent + '10', borderColor: colors.accent + '30' }]}>
            <Text style={[styles.payCardLabel, { color: colors.accent }]}>Amount to Pay</Text>
            <Text style={[styles.payCardAmount, { color: colors.accent }]}>₹{request.totalPrice}</Text>
            <View style={styles.payRow}>
              <Ionicons name="cash-outline" size={16} color={colors.accent} />
              <Text style={[styles.payRowText, { color: colors.accent }]}>Pay in Cash to the professional</Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={[styles.fullBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.fullBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── CANCELLED ────────────────────────────────────────────────────────────────
  if (request.status === 'cancelled') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <PageHeader title="Booking Cancelled" />
        <View style={styles.resultBody}>
          <View style={[styles.resultIconWrap, { backgroundColor: colors.destructive + '12' }]}>
            <Ionicons name="close-circle" size={64} color={colors.destructive} />
          </View>
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>Booking Cancelled</Text>
          <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
            Your booking has been cancelled.
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={[styles.fullBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.fullBtnText}>Book Again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── EXPIRED ──────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PageHeader title="No Match Found" />
      <View style={styles.resultBody}>
        <View style={[styles.resultIconWrap, { backgroundColor: colors.muted }]}>
          <Ionicons name="time-outline" size={64} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.resultTitle, { color: colors.foreground }]}>
          No Professionals Available
        </Text>
        <Text style={[styles.resultSub, { color: colors.mutedForeground }]}>
          We couldn't find anyone within 15 km right now. Please try again later.
        </Text>
        <Pressable
          onPress={() => router.replace('/(tabs)')}
          style={[styles.fullBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.fullBtnText}>Try Again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingSpinner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
  },
  smallText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  // Searching
  searchingBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  pulseWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  pulseRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
  },
  pulseCenter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  searchTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.3, textAlign: 'center' },
  searchSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 6, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    borderRadius: 16,
    marginTop: 28,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 12 },
  hintText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomActions: { paddingHorizontal: 16, paddingTop: 12 },
  cancelOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1.5,
  },
  cancelOutlineText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  // In Progress
  acceptBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  acceptBannerText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff', flex: 1 },
  workerSection: { paddingHorizontal: 16, marginBottom: 16 },
  workerCard: {
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  workerTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  workerAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerAvatarLetter: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  workerName: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.2, marginBottom: 4 },
  workerMeta: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  distBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
  },
  distText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  cardDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  callBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  detailCard: {
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  detailCardLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 10 },
  detailCardText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailRowText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  // Result screens
  resultBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  resultIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  resultTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', letterSpacing: -0.5, textAlign: 'center' },
  resultSub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  payCard: {
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    marginBottom: 24,
    borderWidth: 1,
    width: '100%',
  },
  payCardLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  payCardAmount: { fontSize: 42, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payRowText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  fullBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    shadowColor: '#FF5533',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fullBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#fff' },
});
