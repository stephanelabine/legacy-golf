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

  HOLE_VIEW: "HoleView",
  HOLE_MAP: "HoleMap",

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
  BUDDIES: "Buddies",
  EQUIPMENT: "Equipment",

  WAGERS: "Wagers",

  /* ---------------- Tournaments ---------------- */

  TOURNAMENTS: "Tournaments",
  TOURNAMENT_DASHBOARD: "TournamentDashboard",
  JOIN_TOURNAMENT: "JoinTournament",

  TOURNAMENT_SETUP: "TournamentSetup",
  TOURNAMENT_OVERVIEW: "TournamentOverview",

  TOURNAMENT_COURSE: "TournamentCourse",
  TOURNAMENT_TEES: "TournamentTees",
  TOURNAMENT_PLAYERS: "TournamentPlayers",
  TOURNAMENT_PLAYERS_SETUP: "TournamentPlayersSetup",
  TOURNAMENT_FORMATS: "TournamentFormats",

  // NEW step inserted between Formats and Pools:
  TOURNAMENT_FORMAT_DETAILS: "TournamentFormatDetails",

  TOURNAMENT_FORMAT_POOLS: "TournamentFormatPools",
  TOURNAMENT_ROUNDS: "TournamentRounds",

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
