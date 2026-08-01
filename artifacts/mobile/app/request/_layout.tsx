import { Stack } from 'expo-router';
import { useTheme } from '@/hooks/useColors';

export default function RequestLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
