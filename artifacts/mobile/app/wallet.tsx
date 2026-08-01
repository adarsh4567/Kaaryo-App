import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useColors';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { radii, spacing } from '@/constants/theme';
import { Button, Card, Divider, EmptyState, IconBubble, Text } from '@/components/ui';
import { useAppContext } from '@/context/AppContext';
import { formatPrice } from '@/lib/catalog';
import { fetchWallet, type Wallet, type WalletTransaction } from '@/lib/userTrials';

/**
 * The reward wallet — balance and statement for `GET /api/user/wallet`.
 *
 * **There is no redemption control**, and that is not an omission: spending the
 * balance has no endpoint behind it. The screen branches on the server's
 * `redeemable` flag rather than hardcoding the absence, so it lights up on its own
 * the day redemption ships — but until then it says so plainly instead of showing
 * a button that would fail.
 */
export default function WalletScreen() {
  const { colors } = useTheme();
  const insets = useScreenInsets();
  const { token } = useAppContext();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!token) {
        setError('You are signed out. Please sign in again.');
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      try {
        const next = await fetchWallet(token);
        setWallet(next);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your wallet.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load('initial');
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text variant="body" tone="muted" style={styles.loadingText}>
          Loading your rewards…
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <WalletHeader topInset={insets.top} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load('refresh')}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!wallet ? (
          <EmptyState
            icon="cloud-off-outline"
            title="Could not load your wallet"
            message={error || 'Please try again in a moment.'}
          >
            <Button label="Retry" icon="refresh" onPress={() => load('refresh')} />
          </EmptyState>
        ) : (
          <>
            {/* ── Balance ──────────────────────────────────────────────────── */}
            <Card tone="hero" padding="xl">
              <Text variant="caption" tone="onHeroMuted">
                REWARD BALANCE
              </Text>
              <Text variant="display" tone="onHero" style={styles.balance}>
                {formatPrice(wallet.balance)}
              </Text>
              <Text variant="caption" tone="onHeroMuted" style={styles.balanceNote}>
                {wallet.redeemable
                  ? 'Use this against any booking.'
                  : 'Earned from discounted trial bookings. Spending it is coming soon.'}
              </Text>
            </Card>

            {/* ── Statement ────────────────────────────────────────────────── */}
            <View style={styles.sectionHead}>
              <Text variant="h3">Statement</Text>
              <Text variant="caption" tone="muted">
                {wallet.transactions.length}{' '}
                {wallet.transactions.length === 1 ? 'entry' : 'entries'}
              </Text>
            </View>

            {wallet.transactions.length === 0 ? (
              <Card padding="lg">
                <View style={styles.emptyRow}>
                  <IconBubble icon="wallet-outline" size={44} tone="muted" />
                  <View style={styles.flex}>
                    <Text variant="bodySemi">No rewards yet</Text>
                    <Text variant="caption" tone="muted">
                      Book a discounted trial and 40% of what you pay comes back here.
                    </Text>
                  </View>
                </View>
              </Card>
            ) : (
              <Card padding="lg">
                {wallet.transactions.map((entry, i) => (
                  <React.Fragment key={entry.id}>
                    {i > 0 ? <Divider spacingY={spacing.md} /> : null}
                    <TransactionRow entry={entry} />
                  </React.Fragment>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function TransactionRow({ entry }: { entry: WalletTransaction }) {
  const { colors } = useTheme();
  const credit = entry.type === 'credit';

  return (
    <View style={styles.txRow}>
      <View
        style={[
          styles.txIcon,
          { backgroundColor: credit ? colors.successLight : colors.muted },
        ]}
      >
        <MaterialCommunityIcons
          name={credit ? 'arrow-down-thin' : 'arrow-up-thin'}
          size={18}
          color={credit ? colors.success : colors.mutedForeground}
        />
      </View>
      <View style={styles.flex}>
        <Text variant="bodySemi" numberOfLines={2}>
          {entry.note || (credit ? 'Reward credited' : 'Reward used')}
        </Text>
        <Text variant="caption" tone="muted">
          {formatDate(entry.createdAt)}
        </Text>
      </View>
      <Text variant="bodySemi" tone={credit ? 'success' : 'default'}>
        {credit ? '+' : '−'}
        {formatPrice(entry.amount)}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function WalletHeader({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + spacing.sm,
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.headerBtn,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={19} color={colors.foreground} />
      </Pressable>
      <View style={styles.flex}>
        <Text variant="h3">Reward wallet</Text>
        <Text variant="caption" tone="muted">
          Trial rewards and statement
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  balance: { marginTop: spacing.xs },
  balanceNote: { marginTop: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing['2xl'],
    marginBottom: spacing.md,
  },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
