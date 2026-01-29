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

  /* ---------------- Tournaments (existing routes) ---------------- */

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
  TOURNAMENT_ROUNDS: "TournamentRounds",

  /* ---------------- Tournaments (canonical aliases) ----------------
     These are the new “clear names” we’ll use going forward.
     They map to the exact same route strings as the existing ones.
     No behavior changes.
  */

  TOURNAMENT_SPLASH: "Tournaments", // existing: TOURNAMENTS
  TOURNAMENT_HUB: "TournamentDashboard", // existing: TOURNAMENT_DASHBOARD
  TOURNAMENT_SETUP_HOME: "TournamentSetup", // existing: TOURNAMENT_SETUP

  TOURNAMENT_ROUNDS_STEP: "TournamentRounds", // existing: TOURNAMENT_ROUNDS
  TOURNAMENT_COURSES_STEP: "TournamentCourse", // existing: TOURNAMENT_COURSE
  TOURNAMENT_TEES_STEP: "TournamentTees", // existing: TOURNAMENT_TEES
  TOURNAMENT_FORMATS_STEP: "TournamentFormats", // existing: TOURNAMENT_FORMATS
  TOURNAMENT_PLAYERS_STEP: "TournamentPlayers", // existing: TOURNAMENT_PLAYERS

  TOURNAMENT_OVERVIEW_ANCHOR: "TournamentOverview", // existing: TOURNAMENT_OVERVIEW
  TOURNAMENT_JOIN: "JoinTournament", // existing: JOIN_TOURNAMENT

  FINAL_RESULTS: "FinalResults",
  PAYOUTS: "Payouts",
};

export default ROUTES;
