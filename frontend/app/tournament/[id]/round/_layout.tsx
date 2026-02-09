import { Stack } from 'expo-router';

export default function RoundLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[roundIndex]" />
    </Stack>
  );
}
