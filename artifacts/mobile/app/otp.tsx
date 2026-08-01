import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { ScreenHeader } from '@/components/HeroHeader';
import { OtpInput } from '@/components/OtpInput';
import { Button, Card, Text } from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import {
  getProfile,
  isApiError,
  OTP_LENGTH,
  resendOtp,
  verifyOtp,
  type UserProfile,
} from '@/lib/userAuth';

export default function OtpScreen() {
  const { phone, name, cooldown, referralCode } = useLocalSearchParams<{
    phone: string;
    name?: string;
    cooldown?: string;
    referralCode?: string;
  }>();
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { signIn } = useAppContext();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => Number(cooldown) || 30);

  /**
   * A correct OTP is consumed server-side on first use, so a double submission
   * (double tap, or auto-submit racing the button) would see the second call fail
   * with `400 OTP expired or not requested` even though the first succeeded. This
   * latch makes verification strictly once-only.
   */
  const submittedRef = useRef(false);

  // ── Resend countdown ───────────────────────────────────────────────────────

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleVerify = useCallback(
    async (submitted: string) => {
      if (submittedRef.current || submitted.length !== OTP_LENGTH || !phone) return;
      submittedRef.current = true;
      setVerifying(true);
      setError('');

      try {
        const result = await verifyOtp(phone, submitted, name || undefined, referralCode || undefined);

        // verify-otp returns a compact user; read the full profile so the app has
        // phoneFormatted and displayInitial from the start.
        let profile: UserProfile;
        try {
          profile = await getProfile(result.token);
        } catch {
          // If that read fails, fall back to the compact user rather than
          // stranding a successfully authenticated session.
          profile = {
            id: result.user.id,
            phone: result.user.phone,
            phoneFormatted: `+91 ${result.user.phone.slice(0, 5)} ${result.user.phone.slice(5)}`,
            phoneVerified: true,
            fullName: result.user.fullName,
            displayInitial: result.user.fullName?.[0]?.toUpperCase() ?? '?',
            profileCompleted: result.user.profileCompleted,
            status: result.user.status,
            createdAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            credits: 0,
          };
        }

        await signIn(result.token, profile);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // If a referral code was sent but didn't apply, show a soft toast.
        // Never block the login flow on a referral outcome.
        if (referralCode && result.referral && !result.referral.applied) {
          // Slight delay so the navigation animation starts first.
          setTimeout(() => {
            Alert.alert(
              'Referral code note',
              "That referral code didn't work, but you're signed in! " +
              (result.referral?.reason ? `(${result.referral.reason})` : '')
            );
          }, 600);
        }

        // `profileCompleted` is the routing flag — `isNewUser` is not.
        router.replace(result.profileCompleted ? '/(tabs)' : '/name');
      } catch (err) {
        // Verification failed, so the latch reopens and the user can retry. The
        // exception is a blocked account, which is terminal.
        submittedRef.current = false;
        setVerifying(false);

        if (isApiError(err) && err.isBlocked) {
          setBlocked(true);
          setError(err.message);
          return;
        }
        setCode('');
        setError(err instanceof Error ? err.message : 'Could not verify that code.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [phone, name, referralCode, signIn]
  );

  async function handleResend() {
    if (resending || secondsLeft > 0 || !phone) return;
    setResending(true);
    setError('');
    try {
      const { cooldownSeconds } = await resendOtp(phone);
      // A resend replaces the previous code, so clear whatever was typed.
      setCode('');
      submittedRef.current = false;
      setSecondsLeft(cooldownSeconds);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      if (isApiError(err) && err.retryAfterSeconds) {
        setSecondsLeft(err.retryAfterSeconds);
      } else if (isApiError(err) && err.isBlocked) {
        setBlocked(true);
      }
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  }

  const countdown = `0:${String(Math.max(0, secondsLeft)).padStart(2, '0')}`;

  if (!phone) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <ScreenHeader
          title="Verify your number"
          topInset={insets.top}
          onBack={() => router.replace('/login')}
        />
        <View style={styles.body}>
          <Card tone="destructive" padding="md">
            <Text variant="caption" style={{ color: colors.destructive }}>
              We lost track of your number. Please start again.
            </Text>
          </Card>
          <Button
            label="Back to sign in"
            fullWidth
            style={styles.retry}
            onPress={() => router.replace('/login')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Verify your number"
        subtitle={`Sent to +91 ${phone}`}
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing['3xl'] }]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <MaterialCommunityIcons
            name="message-badge-outline"
            size={28}
            color={colors.secondaryForeground}
          />
        </View>

        <Text variant="h1" style={styles.title}>
          Enter the {OTP_LENGTH}-digit code
        </Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          We sent it to +91 {phone}.{' '}
          <Text
            variant="bodySemi"
            tone="primary"
            onPress={() => router.back()}
            accessibilityRole="link"
          >
            Change number
          </Text>
        </Text>

        <OtpInput
          value={code}
          onChange={(next) => {
            setCode(next);
            setError('');
          }}
          onComplete={handleVerify}
          length={OTP_LENGTH}
          error={!!error}
          editable={!verifying && !blocked}
        />

        {error ? (
          <Card tone={blocked ? 'destructive' : 'warning'} padding="md" style={styles.notice}>
            <View style={styles.noticeRow}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={17}
                color={blocked ? colors.destructive : colors.warning}
              />
              <Text
                variant="caption"
                style={[styles.flex, { color: blocked ? colors.destructive : colors.warning }]}
              >
                {blocked
                  ? `${error} Please contact support at care@kaaryo.in.`
                  : error}
              </Text>
            </View>
          </Card>
        ) : null}

        {/* `SMS_MODE=mock` makes every code 123456 in development. Stripped from
            release builds by the `__DEV__` guard. */}
        {__DEV__ && !error ? (
          <Card tone="muted" padding="md" style={styles.notice}>
            <View style={styles.noticeRow}>
              <MaterialCommunityIcons
                name="flask-outline"
                size={16}
                color={colors.mutedForeground}
              />
              <Text variant="caption" tone="muted" style={styles.flex}>
                Dev build — the mock OTP is 123456.
              </Text>
            </View>
          </Card>
        ) : null}

        {blocked ? null : (
          <>
            <Button
              label={verifying ? 'Verifying…' : 'Verify and continue'}
              iconRight={verifying ? undefined : 'arrow-right'}
              size="lg"
              fullWidth
              loading={verifying}
              disabled={code.length !== OTP_LENGTH}
              onPress={() => handleVerify(code)}
              style={styles.cta}
            />

            <View style={styles.resendRow}>
              {secondsLeft > 0 ? (
                <Text variant="caption" tone="muted">
                  Resend code in {countdown}
                </Text>
              ) : (
                <Button
                  label={resending ? 'Sending…' : 'Resend code'}
                  variant="ghost"
                  size="sm"
                  icon="refresh"
                  loading={resending}
                  onPress={handleResend}
                />
              )}
            </View>
          </>
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { marginBottom: 4 },
  subtitle: { marginBottom: spacing.xl },
  notice: { marginTop: spacing.lg },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cta: { marginTop: spacing.xl },
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
  retry: { marginTop: spacing.lg },
});
