import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { Button, Card, Field, Text } from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { TRUST_STATS } from '@/lib/catalog';
import { isApiError, isValidPhone, MAX_FULL_NAME, sendOtp } from '@/lib/userAuth';

/** Selling points shown under the sign-in card. */
const HIGHLIGHTS = [
  { icon: 'radar', text: 'We find the nearest available expert for you' },
  { icon: 'shield-check-outline', text: 'Aadhaar and PAN verified professionals' },
  { icon: 'cash-check', text: 'Pay after the job — no advance, no hidden fees' },
] as const;

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { apiUrl, saveApiUrl } = useAppContext();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState('');

  // The API address has to be reachable before sign-in is possible at all, and
  // the Account screen that normally edits it sits behind this very screen. On a
  // fresh install with no saved address that is a dead end, so dev builds get an
  // escape hatch here.
  const [showServer, setShowServer] = useState(false);
  const [serverUrl, setServerUrl] = useState(apiUrl);
  const [serverSaved, setServerSaved] = useState(false);

  function validate() {
    const next: { name?: string; phone?: string } = {};
    // The name is optional here — it can be collected after verification instead.
    if (name.trim().length > MAX_FULL_NAME) {
      next.name = `Please keep your name under ${MAX_FULL_NAME} characters`;
    }
    if (!isValidPhone(phone)) {
      next.phone = 'Enter a valid 10-digit mobile number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleContinue() {
    if (sending) return;
    if (!validate()) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSending(true);
    setFormError('');

    try {
      const { cooldownSeconds } = await sendOtp(phone);
      // The name and optional referral code ride along to the OTP screen.
      router.push({
        pathname: '/otp',
        params: {
          phone,
          name: name.trim(),
          cooldown: String(cooldownSeconds),
          ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
        },
      });
    } catch (err) {
      if (isApiError(err) && err.retryAfterSeconds) {
        // A code is already in flight for this number — go straight to entry.
        router.push({
          pathname: '/otp',
          params: {
            phone,
            name: name.trim(),
            cooldown: String(err.retryAfterSeconds),
            ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
          },
        });
      } else if (isApiError(err) && err.status === 422) {
        setErrors({ phone: err.message });
      } else if (!isApiError(err)) {
        // No HTTP status means the request never reached a server — `fetch` only
        // says "Network request failed", which reads as a phone problem when it
        // is almost always the wrong address. Name the address so it is obvious.
        setFormError(
          `Could not reach the server at ${apiUrl}. Check that it is running and reachable from this device.`
        );
      } else {
        setFormError(err instanceof Error ? err.message : 'Could not send the code.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      >
        {/* ── Brand hero ─────────────────────────────────────────────────── */}
        <LinearGradient
          colors={[colors.heroBackground, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing['3xl'] }]}
        >
          <View style={[styles.blob, styles.blobA, { backgroundColor: colors.heroForeground }]} />
          <View style={[styles.blob, styles.blobB, { backgroundColor: colors.heroForeground }]} />

          <View style={[styles.logo, { backgroundColor: colors.heroForeground }]}>
            <MaterialCommunityIcons name="broom" size={30} color={colors.primary} />
          </View>

          <Text variant="display" tone="onHero" style={styles.brand}>
            Kaaryo
          </Text>
          <Text variant="bodyLg" tone="onHeroMuted">
            Verified home services, on demand
          </Text>

          <View style={styles.statRow}>
            {TRUST_STATS.map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 ? (
                  <View style={[styles.statDivider, { backgroundColor: colors.onHeroBorder }]} />
                ) : null}
                <View style={styles.stat}>
                  <Text variant="h3" tone="onHero">
                    {stat.value}
                  </Text>
                  <Text variant="micro" style={{ color: colors.onHeroMuted }} center>
                    {stat.label}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        </LinearGradient>

        {/* ── Sign in ────────────────────────────────────────────────────── */}
        <View style={styles.body}>
          <Card padding="xl" elevation="md" style={styles.card}>
            <Text variant="h1">Let’s get started</Text>
            <Text variant="body" tone="muted" style={styles.cardSub}>
              We’ll text you a code to confirm your number. No password to remember.
            </Text>

            <Field
              label="Full name"
              icon="account-outline"
              placeholder="e.g. Priya Sharma"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              error={errors.name}
              hint={errors.name ? undefined : 'Optional — you can add this after verifying'}
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              containerStyle={styles.field}
            />

            <Field
              label="Mobile number"
              prefix="+91"
              placeholder="10-digit mobile number"
              value={phone}
              onChangeText={(text) => {
                setPhone(text.replace(/\D/g, '').slice(0, 10));
                setErrors((prev) => ({ ...prev, phone: undefined }));
                setFormError('');
              }}
              error={errors.phone}
              keyboardType="phone-pad"
              autoComplete="tel"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              containerStyle={styles.field}
            />

            <Button
              label={sending ? 'Sending code…' : 'Send code'}
              iconRight={sending ? undefined : 'arrow-right'}
              size="lg"
              fullWidth
              loading={sending}
              onPress={handleContinue}
              style={styles.cta}
            />

            {/* Optional referral code — collapsible so it doesn't clutter new-user flow */}
            <Text
              variant="caption"
              tone="primary"
              center
              style={styles.referralToggle}
              accessibilityRole="button"
              onPress={() => setShowReferral((prev) => !prev)}
            >
              {showReferral ? 'Hide referral code' : 'Have a referral code?'}
            </Text>
            {showReferral ? (
              <Field
                label="Referral code (optional)"
                icon="ticket-account"
                placeholder="e.g. AKASH-K7A2"
                value={referralCode}
                onChangeText={(text) => setReferralCode(text.toUpperCase().trim())}
                autoCapitalize="characters"
                autoCorrect={false}
                hint="Your friend's code — you'll both get ₹150 after your first booking"
                containerStyle={styles.field}
              />
            ) : null}

            {formError ? (
              <Card tone="destructive" padding="md" style={styles.formError}>
                <View style={styles.noticeRow}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={17}
                    color={colors.destructive}
                  />
                  <Text variant="caption" style={[styles.flex, { color: colors.destructive }]}>
                    {formError}
                  </Text>
                </View>
              </Card>
            ) : (
              <Text variant="caption" tone="muted" center style={styles.disclaimer}>
                By continuing you agree to let Kaaryo use your number to dispatch and
                complete your bookings.
              </Text>
            )}
          </Card>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map((item) => (
              <View key={item.text} style={styles.highlightRow}>
                <View style={[styles.highlightIcon, { backgroundColor: colors.secondary }]}>
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={16}
                    color={colors.secondaryForeground}
                  />
                </View>
                <Text variant="body" style={styles.flex}>
                  {item.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Stripped from release builds — production talks to a fixed host. */}
          {__DEV__ ? (
            <View style={styles.server}>
              <Text
                variant="caption"
                tone="muted"
                center
                accessibilityRole="button"
                onPress={() => {
                  setServerUrl(apiUrl);
                  setServerSaved(false);
                  setShowServer((prev) => !prev);
                }}
              >
                Dev · server {apiUrl}
              </Text>

              {showServer ? (
                <Card tone="muted" padding="md" style={styles.serverCard}>
                  <Field
                    label="API base URL"
                    icon="server-network"
                    value={serverUrl}
                    onChangeText={(text) => {
                      setServerUrl(text.trim());
                      setServerSaved(false);
                    }}
                    placeholder="http://192.168.1.5:4000"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    hint="No trailing slash. Must be reachable from this device."
                  />
                  <Button
                    label={serverSaved ? 'Saved' : 'Save server'}
                    icon={serverSaved ? 'check' : 'content-save-outline'}
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={!serverUrl}
                    onPress={async () => {
                      await saveApiUrl(serverUrl);
                      setServerSaved(true);
                      setFormError('');
                    }}
                    style={styles.serverSave}
                  />
                </Card>
              ) : null}
            </View>
          ) : null}
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    overflow: 'hidden',
  },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.08 },
  blobA: { width: 240, height: 240, top: -110, right: -90 },
  blobB: { width: 170, height: 170, bottom: -80, left: -50 },
  logo: {
    width: 62,
    height: 62,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  brand: { marginBottom: 2 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: spacing['2xl'],
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 32 },
  body: { paddingHorizontal: spacing.lg },
  // Overlaps the hero's rounded bottom edge.
  card: { marginTop: -spacing['2xl'] },
  cardSub: { marginTop: 6 },
  field: { marginTop: spacing.lg },
  cta: { marginTop: spacing.xl },
  formError: { marginTop: spacing.md },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  disclaimer: { marginTop: spacing.md },
  highlights: { gap: spacing.md, marginTop: spacing.xl },
  server: { marginTop: spacing.xl },
  serverCard: { marginTop: spacing.sm },
  serverSave: { marginTop: spacing.md },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  highlightIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralToggle: { marginTop: spacing.md },
});
