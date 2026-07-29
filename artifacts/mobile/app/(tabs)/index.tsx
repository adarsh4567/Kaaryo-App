import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext } from '@/context/AppContext';
import { SERVICE_CATALOG, Category } from '@/lib/catalog';

function CategoryCard({ item }: { item: Category }) {
  const colors = useColors();
  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book/[category]', params: { category: item.key } });
  }
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.catCard,
        { backgroundColor: colors.card, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <View style={[styles.catIconBg, { backgroundColor: item.color + '18' }]}>
        <Ionicons name={item.icon as any} size={28} color={item.color} />
      </View>
      <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={[styles.catPrice, { color: colors.mutedForeground }]}>
        from ₹{item.price}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoadingUser, history } = useAppContext();

  useEffect(() => {
    if (!isLoadingUser && !user) {
      router.replace('/onboarding');
    }
  }, [user, isLoadingUser]);

  if (isLoadingUser) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return null;

  const activeBooking = history.find(
    (h) => h.status === 'searching' || h.status === 'in_progress' || h.status === 'pending_rating'
  );

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: topPad + 16, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <View>
          <Text style={[styles.hi, { color: colors.mutedForeground }]}>Hello,</Text>
          <Text style={[styles.name, { color: colors.foreground }]}>
            {user?.name ?? 'there'} 👋
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/profile')}
          style={[styles.avatarBtn, { backgroundColor: colors.primary + '20' }]}
        >
          <Text style={[styles.avatarInitial, { color: colors.primary }]}>
            {(user?.name ?? 'K')[0].toUpperCase()}
          </Text>
        </Pressable>
      </View>

      {/* Active booking banner */}
      {activeBooking && (
        <Pressable
          onPress={() => router.push({ pathname: '/tracking/[id]', params: { id: activeBooking.id } })}
          style={[styles.activeBanner, { backgroundColor: colors.primary }]}
        >
          <View style={styles.activeBannerLeft}>
            <View style={styles.activeDot} />
            <View>
              <Text style={styles.activeBannerTitle}>Active Booking</Text>
              <Text style={styles.activeBannerSub}>
                {activeBooking.status === 'searching'
                  ? 'Finding a professional…'
                  : activeBooking.status === 'in_progress'
                  ? 'Professional on the way'
                  : 'Work completed — confirm'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      {/* Category section */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        What do you need?
      </Text>

      <FlatList
        data={SERVICE_CATALOG}
        keyExtractor={(item) => item.key}
        numColumns={2}
        columnWrapperStyle={styles.row}
        scrollEnabled={false}
        renderItem={({ item }) => <CategoryCard item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />

      {/* Bottom note */}
      <View style={[styles.noteRow, { borderTopColor: colors.border }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.mutedForeground} />
        <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
          Verified professionals · Cash payment after service
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16 },
  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  hi: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  name: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  avatarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  activeBannerTitle: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  activeBannerSub: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  row: { gap: 12 },
  catCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  catIconBg: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  catName: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  catPrice: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noteText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
