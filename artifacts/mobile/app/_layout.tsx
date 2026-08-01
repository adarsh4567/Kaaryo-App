import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { AppProvider } from '@/context/AppContext';
import { useTheme } from '@/hooks/useColors';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { colors } = useTheme();

  // Keeps the window background behind sheets and mid-push on-palette.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // Not supported on every platform — safe to ignore.
    });
  }, [colors.background]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="otp" />
      {/* Profile setup cannot be skipped, so the back gesture is disabled — the
          way out is "Use a different number", which signs out. */}
      <Stack.Screen name="name" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="service" />
      <Stack.Screen name="cart" options={{ animation: 'slide_from_bottom' }} />
      {/* Instant dispatch is in flight the moment it opens, so the only way out
          is the cancel button — a back swipe would strand a live booking. */}
      <Stack.Screen
        name="dispatch"
        options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
      />
      <Stack.Screen name="address" options={{ presentation: 'modal' }} />
      <Stack.Screen name="coupons" options={{ presentation: 'modal' }} />
      {/* Scheduled bookings, placed against the legacy endpoint. */}
      <Stack.Screen name="tracking" options={{ gestureEnabled: false }} />
      {/* Instant bookings — tracking and payment for `/api/user/service-requests`. */}
      <Stack.Screen name="request" />
      {/* Discounted trials — a separate resource with its own statuses, so its own
          stack rather than a variant of `request`. */}
      <Stack.Screen name="trial" />
      <Stack.Screen name="wallet" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AppProvider>
                <RootLayoutNav />
              </AppProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
