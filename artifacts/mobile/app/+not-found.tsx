import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTheme } from '@/hooks/useColors';
import { Button, EmptyState } from '@/components/ui';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <EmptyState
          icon="compass-off-outline"
          title="This page moved"
          message="The screen you were looking for is no longer part of Kaaryo."
        >
          <Button label="Go to home" onPress={() => router.replace('/(tabs)')} />
        </EmptyState>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
});
