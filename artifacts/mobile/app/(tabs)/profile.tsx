import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { CartBar } from '@/components/CartBar';
import {
  Button,
  Card,
  Divider,
  Field,
  ListRow,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { formatPrice } from '@/lib/catalog';

export default function AccountScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const {
    user,
    setUser,
    signOut,
    addresses,
    activeAddress,
    history,
    credits,
    apiUrl,
    saveApiUrl,
  } = useAppContext();

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const [showDevTools, setShowDevTools] = useState(false);
  const [url, setUrl] = useState(apiUrl);

  const completed = history.filter((h) => h.status === 'completed' || h.status === 'pending_rating');
  const lifetimeSpend = completed.reduce((sum, h) => sum + h.total, 0);

  async function handleSaveProfile() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      Alert.alert('Invalid number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setUser({ name: name.trim(), phone });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'Your saved addresses and booking history will be cleared.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/onboarding');
        },
      },
    ]);
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.tabBarPadding }}
      >
        {/* ── Identity card ──────────────────────────────────────────────── */}
        <View
          style={[
            styles.hero,
            { paddingTop: insets.top + spacing.lg, backgroundColor: colors.heroBackground },
          ]}
        >
          <View style={[styles.blob, { backgroundColor: colors.primary }]} />
          <View style={styles.heroRow}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: colors.onHeroSurface, borderColor: colors.onHeroBorder },
              ]}
            >
              <Text variant="display" tone="onHero">
                {(user?.name ?? 'K')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="h1" tone="onHero" numberOfLines={1}>
                {user?.name ?? 'Set your name'}
              </Text>
              <Text variant="body" tone="onHeroMuted">
                {user?.phone ? `+91 ${user.phone}` : 'No number saved'}
              </Text>
            </View>
          </View>

          <View style={styles.heroStats}>
            <HeroStat value={String(completed.length)} label="Jobs done" />
            <View style={[styles.heroDivider, { backgroundColor: colors.onHeroBorder }]} />
            <HeroStat value={formatPrice(credits)} label="Credits" />
            <View style={[styles.heroDivider, { backgroundColor: colors.onHeroBorder }]} />
            <HeroStat value={formatPrice(lifetimeSpend)} label="Lifetime spend" />
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Personal details ─────────────────────────────────────────── */}
          <SectionHeader
            title="Your details"
            actionLabel={editing ? 'Cancel' : 'Edit'}
            onAction={() => {
              setName(user?.name ?? '');
              setPhone(user?.phone ?? '');
              setEditing((prev) => !prev);
            }}
            style={styles.sectionTop}
          />

          {editing ? (
            <Card padding="lg">
              <Field
                label="Full name"
                icon="account-outline"
                value={name}
                onChangeText={setName}
                placeholder="Your full name"
                autoCapitalize="words"
              />
              <Field
                label="Mobile number"
                prefix="+91"
                value={phone}
                onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                keyboardType="phone-pad"
                containerStyle={styles.field}
              />
              <Button
                label="Save changes"
                icon="content-save-outline"
                fullWidth
                onPress={handleSaveProfile}
                style={styles.field}
              />
            </Card>
          ) : (
            <Card padding="lg">
              <ListRow
                icon="account-outline"
                label="Name"
                value={user?.name ?? 'Not set'}
              />
              <ListRow
                icon="phone-outline"
                label="Mobile"
                value={user?.phone ? `+91 ${user.phone}` : 'Not set'}
                last
              />
              {saved ? (
                <>
                  <Divider spacingY={spacing.md} />
                  <Text variant="caption" tone="success">
                    Details saved
                  </Text>
                </>
              ) : null}
            </Card>
          )}

          {/* ── Addresses & rewards ──────────────────────────────────────── */}
          <SectionHeader title="Bookings & saved info" style={styles.sectionTop} />
          <Card padding="lg">
            <ListRow
              icon="map-marker-outline"
              label="Saved addresses"
              value={
                activeAddress
                  ? `${addresses.length} saved · using ${activeAddress.label}`
                  : 'No address yet'
              }
              onPress={() => router.push('/address')}
            />
            <ListRow
              icon="ticket-percent-outline"
              label="Offers & rewards"
              value={`${formatPrice(credits)} in credits`}
              onPress={() => router.push('/coupons')}
            />
            <ListRow
              icon="clipboard-text-outline"
              label="My bookings"
              value={`${history.length} total`}
              onPress={() => router.push('/(tabs)/bookings')}
              last
            />
          </Card>

          {/* ── Support ──────────────────────────────────────────────────── */}
          <SectionHeader title="Help & support" style={styles.sectionTop} />
          <Card padding="lg">
            <ListRow
              icon="headset"
              label="Talk to support"
              value="7 AM – 11 PM, all days"
              onPress={() =>
                Alert.alert(
                  'Kaaryo support',
                  'Reach us at 1800-000-000 or care@kaaryo.in. Average response time under 4 minutes.'
                )
              }
            />
            <ListRow
              icon="shield-check-outline"
              label="Safety & verification"
              onPress={() =>
                Alert.alert(
                  'Safety at Kaaryo',
                  'Every expert clears Aadhaar and PAN verification plus a 2-day training programme before their first booking.'
                )
              }
            />
            <ListRow
              icon="file-document-outline"
              label="Terms & privacy"
              onPress={() =>
                Alert.alert(
                  'Terms & privacy',
                  'Your name, number and address are used only to dispatch and complete your bookings.'
                )
              }
              last
            />
          </Card>

          {/* ── Appearance note ──────────────────────────────────────────── */}
          <Card tone="tint" padding="md" style={styles.sectionTop} bordered={false}>
            <View style={styles.themeRow}>
              <MaterialCommunityIcons
                name="theme-light-dark"
                size={18}
                color={colors.secondaryForeground}
              />
              <Text variant="caption" style={[styles.flex, { color: colors.secondaryForeground }]}>
                Kaaryo follows your system light or dark appearance automatically.
              </Text>
            </View>
          </Card>

          {/* ── Developer ────────────────────────────────────────────────── */}
          <SectionHeader
            title="Developer"
            subtitle="Point the app at your Kaaryo backend"
            actionLabel={showDevTools ? 'Hide' : 'Show'}
            onAction={() => setShowDevTools((prev) => !prev)}
            style={styles.sectionTop}
          />
          {showDevTools ? (
            <Card padding="lg">
              <Field
                label="API base URL"
                icon="link-variant"
                value={url}
                onChangeText={setUrl}
                placeholder="http://localhost:4000"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Button
                label="Save API URL"
                variant="secondary"
                fullWidth
                onPress={async () => {
                  await saveApiUrl(url);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                style={styles.field}
              />
            </Card>
          ) : null}

          <Button
            label="Sign out"
            variant="destructive"
            icon="logout"
            fullWidth
            haptic={false}
            onPress={handleSignOut}
            style={styles.signOut}
          />

          <Text variant="caption" tone="muted" center>
            Kaaryo v2.0.0 · Made for Indian homes
          </Text>
        </View>
      </ScrollView>

      <CartBar bottomInset={insets.bottom} />
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.heroStat}>
      <Text variant="h3" tone="onHero" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="micro" style={{ color: colors.onHeroMuted }} center>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 999,
    opacity: 0.16,
    top: -100,
    right: -60,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroStats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  body: { paddingHorizontal: spacing.lg },
  sectionTop: { marginTop: spacing['2xl'] },
  field: { marginTop: spacing.lg },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  signOut: { marginTop: spacing['2xl'], marginBottom: spacing.lg },
});
