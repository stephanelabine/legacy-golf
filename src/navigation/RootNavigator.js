// src/navigation/RootNavigator.js
import React, { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged } from "firebase/auth";

import ROUTES from "./routes";
import { auth } from "../firebase/firebase";

/* ---------------- boot/auth ---------------- */

import BootScreen from "../screens/BootScreen";

import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";

/* ---------------- core app ---------------- */

import HomeScreen from "../screens/HomeScreen";
import GamesScreen from "../screens/GamesScreen";
import GameSetupScreen from "../screens/GameSetupScreen";
import NewRoundScreen from "../screens/NewRoundScreen";

import TeeSelectionScreen from "../screens/TeeSelectionScreen";
import PlayerSetupScreen from "../screens/PlayerSetupScreen";
import PlayerEntryScreen from "../screens/PlayerEntryScreen";

import HoleHubScreen from "../screens/HoleHubScreen";
import HoleMapScreen from "../screens/HoleMapScreen";
import GpsScreen from "../screens/GpsScreen";
import GreenViewScreen from "../screens/GreenViewScreen";
import HoleStrategyScreen from "../screens/HoleStrategyScreen";

// NEW: regular game score entry (tournament-style UI)
import GameScoreEntryScreen from "../screens/GameScoreEntryScreen";

import ScorecardScreen from "../screens/ScorecardScreen";

import CourseDataScreen from "../screens/CourseDataScreen";

import HistoryScreen from "../screens/HistoryScreen";
import RoundDetailsScreen from "../screens/RoundDetailsScreen";

import ProfileScreen from "../screens/ProfileScreen";
import PlayerStatsScreen from "../screens/PlayerStatsScreen";
import BuddyListScreen from "../screens/BuddyListScreen";
import EquipmentScreen from "../screens/EquipmentScreen";

import HazardsScreen from "../screens/HazardsScreen";

import GameRoundCalculatingResultsScreen from "../screens/GameRoundCalculatingResultsScreen";

// NEW: regular game formats screen (replaces Wagers in the new flow)
import GameFormatsScreen from "../screens/GameFormatsScreen";

// NEW: regular game money pools + briefing
import GameRoundBriefingScreen from "../screens/GameRoundBriefingScreen";

// NEW: regular game format details (post-select)
import GameFormatDetailsScreen from "../screens/GameFormatDetailsScreen";

// NEW: regular game money pools
import GameFormatPoolsScreen from "../screens/GameFormatPoolsScreen";

/* ---------------- tournaments ---------------- */

import TournamentsScreen from "../screens/TournamentsScreen";
import TournamentHubSplashScreen from "../screens/TournamentHubSplashScreen";
import TournamentOrganizerProfileScreen from "../screens/TournamentOrganizerProfileScreen";
import TournamentDashboardScreen from "../screens/TournamentDashboardScreen";
import JoinTournamentScreen from "../screens/JoinTournamentScreen";

import TournamentSetupScreen from "../screens/TournamentSetupScreen";
import TournamentRoundsScreen from "../screens/TournamentRoundsScreen";
import TournamentCourseScreen from "../screens/TournamentCourseScreen";
import TournamentTeesScreen from "../screens/TournamentTeesScreen";

import TournamentFormatsScreen from "../screens/TournamentFormatsScreen";
import TournamentFormatDetailsScreen from "../screens/TournamentFormatDetailsScreen";
import TournamentFormatPoolsScreen from "../screens/TournamentFormatPoolsScreen";

import TournamentPlayersSetupScreen from "../screens/TournamentPlayersSetupScreen";
import TournamentPlayersScreen from "../screens/TournamentPlayersScreen";

// NEW: format-agnostic Groups + tee times
import TournamentGroupsScreen from "../screens/TournamentGroupsScreen";

import TournamentOverviewScreen from "../screens/TournamentOverviewScreen";

import TournamentTeamVsTeamSetupScreen from "../screens/TournamentTeamVsTeamSetupScreen";
import TournamentTeamVsTeamPairingsScreen from "../screens/TournamentTeamVsTeamPairingsScreen";
import TournamentTeamVsTeamPairingsOverviewScreen from "../screens/TournamentTeamVsTeamPairingsOverviewScreen";

import TournamentPayoutsScreen from "../screens/TournamentPayoutsScreen";
import TournamentStartSplashScreen from "../screens/TournamentStartSplashScreen";
import TournamentLiveHubScreen from "../screens/TournamentLiveHubScreen";
import TournamentPlayerBriefingScreen from "../screens/TournamentPlayerBriefingScreen";

// splashes
import TournamentRoundStartSplashScreen from "../screens/TournamentRoundStartSplashScreen";
import TournamentSideGameSplashScreen from "../screens/TournamentSideGameSplashScreen";

// tournament play screens
import TournamentHoleViewScreen from "../screens/TournamentHoleViewScreen";
import TournamentScoreEntryScreen from "../screens/TournamentScoreEntryScreen";

// NEW: tournament green view
import TournamentGreenViewScreen from "../screens/TournamentGreenViewScreen";

// tournament round results (Finish Round destination)
import TournamentRoundFinalResultsScreen from "../screens/TournamentRoundFinalResultsScreen";

// NEW: tournament trophy / winner's circle screen
import TournamentTrophyScreen from "../screens/TournamentTrophyScreen";

// NEW: tournament settle payouts (post-trophy step)
import TournamentSettlePayoutsScreen from "../screens/TournamentSettlePayoutsScreen";

/* ---------------- results/payouts ---------------- */

import FinalResultsScreen from "../screens/FinalResultsScreen";
import PayoutsScreen from "../screens/PayoutsScreen";

const Stack = createNativeStackNavigator();

const SPLASH_MIN_MS = 3500;

export default function RootNavigator() {
  const [authReady, setAuthReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const readyToRoute = authReady && splashDone;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!readyToRoute ? (
        <Stack.Screen name={ROUTES.BOOT} component={BootScreen} />
      ) : !user ? (
        <>
          <Stack.Screen name={ROUTES.AUTH_LOGIN} component={LoginScreen} />
          <Stack.Screen name={ROUTES.AUTH_SIGNUP} component={SignupScreen} />
        </>
      ) : (
        <>
          {/* Core */}
          <Stack.Screen name={ROUTES.HOME} component={HomeScreen} />
          <Stack.Screen name={ROUTES.GAMES} component={GamesScreen} />
          <Stack.Screen name={ROUTES.GAME_SETUP} component={GameSetupScreen} />
          <Stack.Screen name={ROUTES.NEW_ROUND} component={NewRoundScreen} />

          <Stack.Screen name={ROUTES.TEE_SELECTION} component={TeeSelectionScreen} />
          <Stack.Screen name={ROUTES.PLAYER_SETUP} component={PlayerSetupScreen} />
          <Stack.Screen name={ROUTES.PLAYER_ENTRY} component={PlayerEntryScreen} />

          <Stack.Screen name={ROUTES.HOLE_HUB} component={HoleHubScreen} />
          <Stack.Screen name={ROUTES.HOLE_MAP} component={HoleMapScreen} />

          <Stack.Screen name={ROUTES.GPS} component={GpsScreen} />
          <Stack.Screen name={ROUTES.GREEN_VIEW} component={GreenViewScreen} />
          <Stack.Screen name={ROUTES.HOLE_STRATEGY} component={HoleStrategyScreen} />

          {/* Regular game score entry (tournament-style UI) */}
          <Stack.Screen name={ROUTES.SCORE_ENTRY} component={GameScoreEntryScreen} />

          <Stack.Screen name={ROUTES.COURSE_DATA} component={CourseDataScreen} />

          <Stack.Screen name={ROUTES.HISTORY} component={HistoryScreen} />
          <Stack.Screen name={ROUTES.ROUND_DETAILS} component={RoundDetailsScreen} />

          <Stack.Screen name={ROUTES.PROFILE} component={ProfileScreen} />
          <Stack.Screen name={ROUTES.PLAYER_STATS} component={PlayerStatsScreen} />
          <Stack.Screen name={ROUTES.BUDDIES} component={BuddyListScreen} />
          <Stack.Screen name={ROUTES.EQUIPMENT} component={EquipmentScreen} />

          {/* NEW: regular game formats (use this in the new flow) */}
          <Stack.Screen name={ROUTES.GAME_FORMATS} component={GameFormatsScreen} />

          {/* NEW: regular game format details (post-select) */}
          <Stack.Screen name={ROUTES.GAME_FORMAT_DETAILS} component={GameFormatDetailsScreen} />

          {/* NEW: regular game money pools */}
          <Stack.Screen name={ROUTES.GAME_FORMAT_POOLS} component={GameFormatPoolsScreen} />

          {/* NEW: regular game round briefing (post money pools) */}
          <Stack.Screen name={ROUTES.GAME_ROUND_BRIEFING} component={GameRoundBriefingScreen} />

          {/* Regular game finish splash */}
          <Stack.Screen name={ROUTES.GAME_ROUND_CALCULATING} component={GameRoundCalculatingResultsScreen} />

          {/* Tournaments */}
          <Stack.Screen name={ROUTES.TOURNAMENT_HUB_SPLASH} component={TournamentHubSplashScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_ORGANIZER_PROFILE} component={TournamentOrganizerProfileScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENTS} component={TournamentsScreen} />
          <Stack.Screen name={ROUTES.JOIN_TOURNAMENT} component={JoinTournamentScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_DASHBOARD} component={TournamentDashboardScreen} />

          <Stack.Screen name={ROUTES.TOURNAMENT_SETUP} component={TournamentSetupScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_ROUNDS} component={TournamentRoundsScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_COURSE} component={TournamentCourseScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_TEES} component={TournamentTeesScreen} />

          <Stack.Screen name={ROUTES.TOURNAMENT_FORMATS} component={TournamentFormatsScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_FORMAT_DETAILS} component={TournamentFormatDetailsScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_FORMAT_POOLS} component={TournamentFormatPoolsScreen} />

          <Stack.Screen name={ROUTES.TOURNAMENT_PLAYERS_SETUP} component={TournamentPlayersSetupScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_PLAYERS} component={TournamentPlayersScreen} />

          {/* NEW: Groups (tee times) - always available, format-agnostic */}
          <Stack.Screen name={ROUTES.TOURNAMENT_GROUPS} component={TournamentGroupsScreen} />

          <Stack.Screen name={ROUTES.TOURNAMENT_TEAM_VS_TEAM_SETUP} component={TournamentTeamVsTeamSetupScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_TEAM_VS_TEAM_PAIRINGS} component={TournamentTeamVsTeamPairingsScreen} />
          <Stack.Screen
            name={ROUTES.TOURNAMENT_TEAM_VS_TEAM_PAIRINGS_OVERVIEW}
            component={TournamentTeamVsTeamPairingsOverviewScreen}
          />

          <Stack.Screen name={ROUTES.TOURNAMENT_OVERVIEW} component={TournamentOverviewScreen} />

          {/* Post-setup runway */}
          <Stack.Screen name={ROUTES.TOURNAMENT_PAYOUTS} component={TournamentPayoutsScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_START_SPLASH} component={TournamentStartSplashScreen} />

          {/* Splashes */}
          <Stack.Screen name={ROUTES.TOURNAMENT_ROUND_START_SPLASH} component={TournamentRoundStartSplashScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_SIDEGAME_SPLASH} component={TournamentSideGameSplashScreen} />

          {/* tournament play screens */}
          <Stack.Screen name={ROUTES.TOURNAMENT_HOLE_VIEW} component={TournamentHoleViewScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_SCORE_ENTRY} component={TournamentScoreEntryScreen} />

          {/* NEW: tournament green view */}
          <Stack.Screen name={ROUTES.TOURNAMENT_GREEN_VIEW} component={TournamentGreenViewScreen} />

          <Stack.Screen name={ROUTES.TOURNAMENT_LIVE_HUB} component={TournamentLiveHubScreen} />
          <Stack.Screen name={ROUTES.TOURNAMENT_PLAYER_BRIEFING} component={TournamentPlayerBriefingScreen} />

          {/* NEW: Winner's Circle / Trophy */}
          <Stack.Screen name={ROUTES.TOURNAMENT_TROPHY} component={TournamentTrophyScreen} />

          {/* NEW: Settle Payouts (post-trophy step) */}
          <Stack.Screen name={ROUTES.TOURNAMENT_SETTLE_PAYOUTS} component={TournamentSettlePayoutsScreen} />

          {/* Modals */}
          <Stack.Group
            screenOptions={{
              presentation: "modal",
              animation: "slide_from_bottom",
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name={ROUTES.SCORECARD} component={ScorecardScreen} />
            <Stack.Screen name={ROUTES.HAZARDS} component={HazardsScreen} />
            <Stack.Screen name={ROUTES.FINAL_RESULTS} component={FinalResultsScreen} />

            {/* round-only tournament results */}
            <Stack.Screen name={ROUTES.TOURNAMENT_ROUND_FINAL_RESULTS} component={TournamentRoundFinalResultsScreen} />

            <Stack.Screen name={ROUTES.PAYOUTS} component={PayoutsScreen} />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
}
