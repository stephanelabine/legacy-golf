import { Stack } from 'expo-router';

export default function RoundIndexLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="scorecard" />
    </Stack>
  );
}
