import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ROUTES from "./routes";

import BootScreen from "../screens/BootScreen";
import HomeScreen from "../screens/HomeScreen";
import GamesScreen from "../screens/GamesScreen";
import GameSetupScreen from "../screens/GameSetupScreen";
import NewRoundScreen from "../screens/NewRoundScreen";

import TeeSelectionScreen from "../screens/TeeSelectionScreen";
import PlayerSetupScreen from "../screens/PlayerSetupScreen";
import PlayerEntryScreen from "../screens/PlayerEntryScreen";

import HoleViewScreen from "../screens/HoleViewScreen";
import HoleMapScreen from "../screens/HoleMapScreen";
import GpsScreen from "../screens/GpsScreen";
import GreenViewScreen from "../screens/GreenViewScreen";
import HoleStrategyScreen from "../screens/HoleStrategyScreen";

import ScoreEntryScreen from "../screens/ScoreEntryScreen";
import ScorecardScreen from "../screens/ScorecardScreen";

import CourseDataScreen from "../screens/CourseDataScreen";

import HistoryScreen from "../screens/HistoryScreen";
import RoundDetailsScreen from "../screens/RoundDetailsScreen";
import ProfileScreen from "../screens/ProfileScreen";
import BuddyListScreen from "../screens/BuddyListScreen";
import EquipmentScreen from "../screens/EquipmentScreen";

import WagersScreen from "../screens/WagersScreen";

import HazardsScreen from "../screens/HazardsScreen";

import TournamentsScreen from "../screens/TournamentsScreen";

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName={ROUTES.BOOT} screenOptions={{ headerShown: false }}>
      <Stack.Screen name={ROUTES.BOOT} component={BootScreen} />

      <Stack.Screen name={ROUTES.HOME} component={HomeScreen} />
      <Stack.Screen name={ROUTES.GAMES} component={GamesScreen} />
      <Stack.Screen name={ROUTES.GAME_SETUP} component={GameSetupScreen} />
      <Stack.Screen name={ROUTES.NEW_ROUND} component={NewRoundScreen} />

      <Stack.Screen name={ROUTES.TEE_SELECTION} component={TeeSelectionScreen} />
      <Stack.Screen name={ROUTES.PLAYER_SETUP} component={PlayerSetupScreen} />
      <Stack.Screen name={ROUTES.PLAYER_ENTRY} component={PlayerEntryScreen} />

      <Stack.Screen name={ROUTES.HOLE_VIEW} component={HoleViewScreen} />
      <Stack.Screen name={ROUTES.HOLE_MAP} component={HoleMapScreen} />

      <Stack.Screen name={ROUTES.GPS} component={GpsScreen} />
      <Stack.Screen name={ROUTES.GREEN_VIEW} component={GreenViewScreen} />
      <Stack.Screen name={ROUTES.HOLE_STRATEGY} component={HoleStrategyScreen} />

      <Stack.Screen name={ROUTES.SCORE_ENTRY} component={ScoreEntryScreen} />

      <Stack.Screen name={ROUTES.COURSE_DATA} component={CourseDataScreen} />

      <Stack.Screen name={ROUTES.HISTORY} component={HistoryScreen} />
      <Stack.Screen name={ROUTES.ROUND_DETAILS} component={RoundDetailsScreen} />

      <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} />
      <Stack.Screen name={ROUTES.BUDDIES} component={BuddyListScreen} />

      <Stack.Screen name={ROUTES.EQUIPMENT} component={EquipmentScreen} />

      <Stack.Screen name={ROUTES.WAGERS} component={WagersScreen} />

      <Stack.Screen name={ROUTES.TOURNAMENTS} component={TournamentsScreen} />

      <Stack.Group
        screenOptions={{
          presentation: "modal",
          animation: "slide_from_bottom",
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name={ROUTES.SCORECARD} component={ScorecardScreen} />
        <Stack.Screen name={ROUTES.HAZARDS} component={HazardsScreen} />
      </Stack.Group>
    </Stack.Navigator>
  );
}
