// src/navigation/routes.js
const ROUTES = {
  BOOT: "Boot",

  AUTH_LOGIN: "AuthLogin",
  AUTH_SIGNUP: "AuthSignup",

  HOME: "Home",
  GAMES: "Games",
  GAME_SETUP: "GameSetup",
  NEW_ROUND: "NewRound",

  TEE_SELECTION: "TeeSelection",
  PLAYER_SETUP: "PlayerSetup",
  PLAYER_ENTRY: "PlayerEntry",

  // NEW canonical names
  HOLE_HUB: "HoleHub",
  HOLE_MAP: "HoleMap",

  // TEMP alias so older code still works (do not use going forward)
  HOLE_VIEW: "HoleHub",

  GPS: "GPS",
  GREEN_VIEW: "GreenView",
  HOLE_STRATEGY: "HoleStrategy",

  SCORE_ENTRY: "ScoreEntry",
  SCORECARD: "Scorecard",
  HAZARDS: "Hazards",

  COURSE_DATA: "CourseData",

  HISTORY: "History",
  ROUND_DETAILS: "RoundDetails",

  PROFILE: "Profile",
  PLAYER_STATS: "PlayerStats",
  BUDDIES: "Buddies",
  EQUIPMENT: "Equipment",

  WAGERS: "Wagers",

  // NEW: regular game calculating splash
  GAME_ROUND_CALCULATING: "GameRoundCalculatingResults",

  /* ---------------- Tournaments ---------------- */

  TOURNAMENTS: "Tournaments",
  TOURNAMENT_HUB_SPLASH: "TournamentHubSplash",
  TOURNAMENT_ORGANIZER_PROFILE: "TournamentOrganizerProfile",
  TOURNAMENT_DASHBOARD: "TournamentDashboard",
  JOIN_TOURNAMENT: "JoinTournament",

  TOURNAMENT_SETUP: "TournamentSetup",
  TOURNAMENT_OVERVIEW: "TournamentOverview",

  TOURNAMENT_COURSE: "TournamentCourse",
  TOURNAMENT_TEES: "TournamentTees",
  TOURNAMENT_PLAYERS: "TournamentPlayers",
  TOURNAMENT_PLAYERS_SETUP: "TournamentPlayersSetup",

  // NEW: universal groups + tee times (format-agnostic)
  TOURNAMENT_GROUPS: "TournamentGroups",

  TOURNAMENT_FORMATS: "TournamentFormats",
  TOURNAMENT_FORMAT_DETAILS: "TournamentFormatDetails",
  TOURNAMENT_FORMAT_POOLS: "TournamentFormatPools",

  TOURNAMENT_ROUNDS: "TournamentRounds",

  TOURNAMENT_TEAM_VS_TEAM_SETUP: "TournamentTeamVsTeamSetup",
  TOURNAMENT_TEAM_VS_TEAM_PAIRINGS: "TournamentTeamVsTeamPairings",
  TOURNAMENT_TEAM_VS_TEAM_PAIRINGS_OVERVIEW: "TournamentTeamVsTeamPairingsOverview",

  TOURNAMENT_PAYOUTS: "TournamentPayouts",
  TOURNAMENT_START_SPLASH: "TournamentStartSplash",

  TOURNAMENT_ROUND_START_SPLASH: "TournamentRoundStartSplash",
  TOURNAMENT_SIDEGAME_SPLASH: "TournamentSideGameSplash",

  TOURNAMENT_LIVE_HUB: "TournamentLiveHub",
  TOURNAMENT_PLAYER_BRIEFING: "TournamentPlayerBriefing",

  // tournament-first play screens
  TOURNAMENT_HOLE_VIEW: "TournamentHoleView",
  TOURNAMENT_SCORE_ENTRY: "TournamentScoreEntry",

  // tournament-only Green View
  TOURNAMENT_GREEN_VIEW: "TournamentGreenView",

  // round-only results (Finish Round goes here)
  TOURNAMENT_ROUND_FINAL_RESULTS: "TournamentRoundFinalResults",
  TOURNAMENT_TROPHY: "TournamentTrophy",
  TOURNAMENT_SETTLE_PAYOUTS: "TournamentSettlePayouts",

  // TEMP alias so nothing breaks if any old code still uses it.
  // Do not use going forward; we'll reserve "TournamentFinalResults" later for overall tournament results.
  TOURNAMENT_FINAL_RESULTS: "TournamentRoundFinalResults",

  /* ---------------- Tournaments (canonical aliases) ---------------- */

  TOURNAMENT_SPLASH: "Tournaments",
  TOURNAMENT_HUB: "TournamentDashboard",
  TOURNAMENT_SETUP_HOME: "TournamentSetup",

  TOURNAMENT_ROUNDS_STEP: "TournamentRounds",
  TOURNAMENT_COURSES_STEP: "TournamentCourse",
  TOURNAMENT_TEES_STEP: "TournamentTees",
  TOURNAMENT_FORMATS_STEP: "TournamentFormats",
  TOURNAMENT_POOLS_STEP: "TournamentFormatPools",
  TOURNAMENT_PLAYERS_STEP: "TournamentPlayers",

  TOURNAMENT_OVERVIEW_ANCHOR: "TournamentOverview",
  TOURNAMENT_JOIN: "JoinTournament",

  FINAL_RESULTS: "FinalResults",
  PAYOUTS: "Payouts",
};

export default ROUTES;
