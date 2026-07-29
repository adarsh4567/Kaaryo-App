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

/** Selling points shown under the sign-in card. */
const HIGHLIGHTS = [
  { icon: 'lightning-bolt', text: 'An expert at your door in 10 minutes' },
  { icon: 'shield-check-outline', text: 'Aadhaar and PAN verified professionals' },
  { icon: 'cash-check', text: 'Pay after the job — no advance, no hidden fees' },
] as const;

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { setUser } = useAppContext();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

  function validate() {
    const next: { name?: string; phone?: string } = {};
    if (!name.trim()) next.name = 'Please enter your name';
    if (!/^\d{10}$/.test(phone)) next.phone = 'Enter a valid 10-digit mobile number';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleContinue() {
    if (!validate()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    await setUser({ name: name.trim(), phone });
    setLoading(false);
    router.replace('/(tabs)');
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
            House help in 10 minutes
          </Text>

          <View style={styles.statRow}>
            {TRUST_STATS.slice(0, 3).map((stat, i) => (
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
              We only need a name and a number — no password, no OTP wait.
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
              autoCapitalize="words"
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
              }}
              error={errors.phone}
              keyboardType="phone-pad"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              containerStyle={styles.field}
            />

            <Button
              label="Continue"
              iconRight="arrow-right"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleContinue}
              style={styles.cta}
            />

            <Text variant="caption" tone="muted" center style={styles.disclaimer}>
              Your details stay on this device until you place a booking.
            </Text>
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
  disclaimer: { marginTop: spacing.md },
  highlights: { gap: spacing.md, marginTop: spacing.xl },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  highlightIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
