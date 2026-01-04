import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ROUTES from "./routes";

import BootScreen from "../screens/BootScreen";
import HomeScreen from "../screens/HomeScreen";
import GamesScreen from "../screens/GamesScreen";
import GameSettingsScreen from "../screens/GameSettingsScreen";
import NewRoundScreen from "../screens/NewRoundScreen";
import ScoreHoleScreen from "../screens/ScoreHoleScreen";
import HoleMapScreen from "../screens/HoleMapScreen";
import ScoreEntryScreen from "../screens/ScoreEntryScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ProfileScreen from "../screens/ProfileScreen";
import BuddiesScreen from "../screens/BuddyListScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName={ROUTES.BOOT} screenOptions={{ headerShown: false }}>
      <Stack.Screen name={ROUTES.BOOT} component={BootScreen} />
      <Stack.Screen name={ROUTES.HOME} component={HomeScreen} />
      <Stack.Screen name={ROUTES.GAMES} component={GamesScreen} />
      <Stack.Screen name={ROUTES.GAME_SETTINGS} component={GameSettingsScreen} />
      <Stack.Screen name={ROUTES.NEW_ROUND} component={NewRoundScreen} />
      <Stack.Screen name={ROUTES.SCORE_HOLE} component={ScoreHoleScreen} />
      <Stack.Screen name={ROUTES.HOLE_MAP} component={HoleMapScreen} />
      <Stack.Screen name={ROUTES.SCORE_ENTRY} component={ScoreEntryScreen} />
      <Stack.Screen name={ROUTES.HISTORY} component={HistoryScreen} />
      <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} />
      <Stack.Screen name={ROUTES.BUDDIES} component={BuddiesScreen} />
    </Stack.Navigator>
  );
}
