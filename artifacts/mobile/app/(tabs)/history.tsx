import React from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppContext, HistoryEntry } from '@/context/AppContext';

const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  searching: { label: 'Searching', color: '#f59e0b', icon: 'search-outline' },
  in_progress: { label: 'In Progress', color: '#3b82f6', icon: 'construct-outline' },
  pending_rating: { label: 'Completed', color: '#10b981', icon: 'checkmark-circle-outline' },
  completed: { label: 'Completed', color: '#10b981', icon: 'checkmark-circle-outline' },
  cancelled: { label: 'Cancelled', color: '#ef4444', icon: 'close-circle-outline' },
  expired: { label: 'Expired', color: '#7A7A96', icon: 'time-outline' },
};

function BookingItem({ item }: { item: HistoryEntry }) {
  const colors = useColors();
  const meta = STATUS_META[item.status] ?? STATUS_META.expired;
  const date = new Date(item.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  function handlePress() {
    router.push({ pathname: '/tracking/[id]', params: { id: item.id } });
  }

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.bookingCard,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.bookingLeft}>
        <View style={[styles.bookingIcon, { backgroundColor: meta.color + '18' }]}>
          <Ionicons name={meta.icon as any} size={22} color={meta.color} />
        </View>
        <View>
          <Text style={[styles.bookingCategory, { color: colors.foreground }]}>
            {item.categoryName}
          </Text>
          <Text style={[styles.bookingDate, { color: colors.mutedForeground }]}>
            {date}
          </Text>
        </View>
      </View>
      <View style={styles.bookingRight}>
        <View style={[styles.statusBadge, { backgroundColor: meta.color + '18' }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { history } = useAppContext();
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Bookings</Text>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
        ]}
        renderItem={({ item }) => <BookingItem item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={52} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No bookings yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Your service requests will appear here
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)')}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.emptyBtnText}>Book a Service</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  bookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bookingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bookingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingCategory: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  bookingDate: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  bookingRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
