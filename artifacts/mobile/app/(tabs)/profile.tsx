import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
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
import { MAX_FULL_NAME } from '@/lib/userAuth';

export default function AccountScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const {
    profile,
    user,
    setFullName,
    signOut,
    serverSignOut,
    addresses,
    activeAddress,
    history,
    credits,
    apiUrl,
    saveApiUrl,
    isDark,
    toggleTheme,
  } = useAppContext();

  const [name, setName] = useState(user?.name ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /** The verified number, formatted by the server. Not editable here. */
  const phoneLabel = profile?.phoneFormatted ?? 'No number saved';

  const [showDevTools, setShowDevTools] = useState(false);
  const [url, setUrl] = useState(apiUrl);

  // Stats now come from the server profile.
  // Falls back to local history counting so the screen is never empty while
  // the profile is still loading on first launch.
  const serverJobsCompleted = profile?.stats?.jobsCompleted;
  const serverLifetimeSpend = profile?.stats?.lifetimeSpend;
  const localCompleted = history.filter((h) => h.status === 'completed' || h.status === 'pending_rating');
  const displayJobsCompleted = serverJobsCompleted ?? localCompleted.length;
  const displayLifetimeSpend = serverLifetimeSpend ?? localCompleted.reduce((sum, h) => sum + h.total, 0);

  /**
   * The name is the only editable field — the phone number is the account's
   * verified identity and changing it means signing in on the new number.
   */
  async function handleSaveProfile() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (name.trim().length > MAX_FULL_NAME) {
      Alert.alert('Name too long', `Please keep it under ${MAX_FULL_NAME} characters.`);
      return;
    }

    setSaving(true);
    try {
      await setFullName(name.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // A 401 has already signed the user out inside the context; the tab gate
      // picks that up and routes to login, so only the message is needed here.
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again in a moment.'
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out?', 'Your saved addresses and booking history will be cleared.', [
      { text: 'Stay signed in', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  }

  function handleSignOutAllDevices() {
    Alert.alert(
      'Sign out everywhere?',
      'This will sign you out on every device — useful if your phone is lost or stolen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out everywhere',
          style: 'destructive',
          onPress: async () => {
            await serverSignOut();
            router.replace('/login');
          },
        },
      ]
    );
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
                {profile?.displayInitial ?? 'K'}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="h1" tone="onHero" numberOfLines={1}>
                {profile?.fullName ?? 'Set your name'}
              </Text>
              <View style={styles.verifiedRow}>
                <Text variant="body" tone="onHeroMuted">
                  {phoneLabel}
                </Text>
                {profile?.phoneVerified ? (
                  <MaterialCommunityIcons
                    name="check-decagram"
                    size={15}
                    color={colors.onHeroMuted}
                  />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.heroStats}>
            <HeroStat value={String(displayJobsCompleted)} label="Jobs done" />
            <View style={[styles.heroDivider, { backgroundColor: colors.onHeroBorder }]} />
            <HeroStat value={formatPrice(credits)} label="Credits" />
            <View style={[styles.heroDivider, { backgroundColor: colors.onHeroBorder }]} />
            <HeroStat value={formatPrice(displayLifetimeSpend)} label="Lifetime spend" />
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Personal details ─────────────────────────────────────────── */}
          <SectionHeader
            title="Your details"
            actionLabel={editing ? 'Cancel' : 'Edit'}
            onAction={() => {
              setName(user?.name ?? '');
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
                error={
                  name.trim().length > MAX_FULL_NAME
                    ? `Please keep it under ${MAX_FULL_NAME} characters`
                    : undefined
                }
                hint="Your expert sees this name on every booking"
              />
              <Field
                label="Mobile number"
                prefix="+91"
                value={profile?.phone ?? ''}
                editable={false}
                hint="Verified — sign in on another number to change it"
                containerStyle={styles.field}
              />
              <Button
                label={saving ? 'Saving…' : 'Save changes'}
                icon={saving ? undefined : 'content-save-outline'}
                fullWidth
                loading={saving}
                onPress={handleSaveProfile}
                style={styles.field}
              />
            </Card>
          ) : (
            <Card padding="lg">
              <ListRow
                icon="account-outline"
                label="Name"
                value={profile?.fullName ?? 'Not set'}
              />
              <ListRow
                icon="phone-outline"
                label="Mobile"
                value={phoneLabel}
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
            {/* The trial reward lands here and nowhere else, so the wallet needs
                its own way in — a ₹40 credit the customer cannot find is a ₹40
                credit that did not happen as far as they are concerned. */}
            <ListRow
              icon="wallet-outline"
              label="Reward wallet"
              value="Cashback from trial bookings"
              onPress={() => router.push('/wallet')}
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
              value={profile?.support?.hours ?? '7 AM – 11 PM, all days'}
              onPress={() =>
                Alert.alert(
                  'Kaaryo support',
                  `Reach us at ${profile?.support?.phone ?? '1800-000-000'} or ${profile?.support?.email ?? 'care@kaaryo.in'}. Average response time under 4 minutes.`
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

          {/* ── Appearance ───────────────────────────────────────────────── */}
          <SectionHeader title="Appearance" style={styles.sectionTop} />
          <Card padding="lg">
            <View style={styles.themeRow}>
              <View
                style={[
                  styles.themeIconWrap,
                  { backgroundColor: isDark ? colors.primary : colors.secondary },
                ]}
              >
                <MaterialCommunityIcons
                  name={isDark ? 'weather-night' : 'white-balance-sunny'}
                  size={20}
                  color={isDark ? colors.primaryForeground : colors.secondaryForeground}
                />
              </View>
              <View style={styles.flex}>
                <Text variant="bodySemi">
                  {isDark ? 'Dark mode' : 'Light mode'}
                </Text>
                <Text variant="caption" tone="muted">
                  {isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
                </Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => {
                  toggleTheme();
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.card}
              />
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

          <Button
            label="Sign out on all devices"
            variant="outline"
            icon="devices"
            fullWidth
            haptic={false}
            onPress={handleSignOutAllDevices}
            style={styles.signOutAll}
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
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  themeIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOut: { marginTop: spacing['2xl'], marginBottom: spacing.sm },
  signOutAll: { marginBottom: spacing.lg },
});
