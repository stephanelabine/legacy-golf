import { Stack } from 'expo-router';

export default function CreateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="basics" />
      <Stack.Screen name="players" />
      <Stack.Screen name="courses" />
      <Stack.Screen name="formats" />
    </Stack>
  );
}
