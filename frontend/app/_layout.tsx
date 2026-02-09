import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useTournamentStore } from '../src/store/tournamentStore';

export default function RootLayout() {
  const loadData = useTournamentStore((state) => state.loadData);

  useEffect(() => {
    loadData();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="join" options={{ presentation: 'modal' }} />
        <Stack.Screen name="create" />
        <Stack.Screen name="buddies" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tournament" />
      </Stack>
    </GestureHandlerRootView>
  );
}
