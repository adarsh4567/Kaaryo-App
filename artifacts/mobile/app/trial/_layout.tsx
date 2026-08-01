import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useColors';

export default function TrialLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The trial is placed the moment this opens, so the only way out is the
          cancel button — a back swipe would strand a live booking, and a trainee
          has a 90-second offer sitting on their phone. */}
      <Stack.Screen name="dispatch" options={{ gestureEnabled: false }} />
      <Stack.Screen name="track/[id]" />
      <Stack.Screen name="feedback/[id]" />
    </Stack>
  );
}
