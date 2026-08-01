import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { Button, Card, Field, Text } from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { isApiError, MAX_FULL_NAME } from '@/lib/userAuth';

/**
 * Profile setup — reached only when `profileCompleted === false`.
 *
 * There is no skip: the name is what the worker sees on every booking, and the
 * server will not accept a booking without a `customerName`. It also cannot be
 * cleared once set, so this screen is shown at most once per account.
 */
export default function NameScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { profile, setFullName, signOut } = useAppContext();

  const [name, setName] = useState(profile?.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmed = name.trim();
  const tooLong = trimmed.length > MAX_FULL_NAME;
  const canSave = trimmed.length > 0 && !tooLong;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    setError('');
    try {
      await setFullName(trimmed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err) {
      // A 401 has already signed the user out inside the context; send them back.
      if (isApiError(err) && err.isAuthFailure) {
        router.replace('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not save your name.');
      setSaving(false);
    }
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + spacing['3xl'], paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.secondary }]}>
          <MaterialCommunityIcons
            name="account-outline"
            size={28}
            color={colors.secondaryForeground}
          />
        </View>

        <Text variant="display">One last thing</Text>
        <Text variant="body" tone="muted" style={styles.subtitle}>
          What should we call you? Your expert sees this name on every booking.
        </Text>

        <Card padding="xl" elevation="md">
          <Field
            label="Full name"
            icon="account-outline"
            placeholder="e.g. Priya Sharma"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setError('');
            }}
            error={tooLong ? `Please keep it under ${MAX_FULL_NAME} characters` : undefined}
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <Button
            label={saving ? 'Saving…' : 'Continue'}
            iconRight={saving ? undefined : 'arrow-right'}
            size="lg"
            fullWidth
            loading={saving}
            disabled={!canSave}
            onPress={handleSave}
            style={styles.cta}
          />

          {error ? (
            <Card tone="destructive" padding="md" style={styles.notice}>
              <View style={styles.noticeRow}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={17}
                  color={colors.destructive}
                />
                <Text variant="caption" style={[styles.flex, { color: colors.destructive }]}>
                  {error}
                </Text>
              </View>
            </Card>
          ) : null}
        </Card>

        {/* This step cannot be skipped and the back gesture is disabled, so there
            has to be a way out for someone who signed in on the wrong number. */}
        <View style={styles.footer}>
          {profile ? (
            <Text variant="caption" tone="muted" center>
              Signed in as {profile.phoneFormatted}
            </Text>
          ) : null}
          <Button
            label="Use a different number"
            variant="ghost"
            size="sm"
            onPress={async () => {
              await signOut();
              router.replace('/login');
            }}
          />
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.lg },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  subtitle: { marginTop: 6, marginBottom: spacing.xl },
  cta: { marginTop: spacing.xl },
  notice: { marginTop: spacing.md },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  footer: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl },
});
