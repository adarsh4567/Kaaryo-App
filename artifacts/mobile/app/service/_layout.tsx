import { Stack } from 'expo-router';

export default function ServiceLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[key]" />
      <Stack.Screen name="search" options={{ animation: 'fade' }} />
    </Stack>
  );
}
