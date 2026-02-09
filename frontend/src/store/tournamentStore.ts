import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface Player {
  id: string;
  name: string;
}

export interface Buddy {
  id: string;
  name: string;
}

export interface Round {
  roundIndex: number;
  courseName: string;
  teeName: string;
  formatsByHole: Record<string, string>;
  scores: Record<string, Record<string, number>>;
  currentHole: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  location: string;
  joinCode: string;
  roundsCount: number;
  holesPerRound: number;
  players: Player[];
  rounds: Round[];
  updatedAt: string;
}

interface TournamentStore {
  tournaments: Tournament[];
  buddies: Buddy[];
  activeTournamentId: string | null;
  activeRoundIndex: number;
  activeHole: number;
  isLoading: boolean;
  
  // Actions
  loadData: () => Promise<void>;
  saveTournaments: (tournaments: Tournament[]) => Promise<void>;
  saveBuddies: (buddies: Buddy[]) => Promise<void>;
  
  // Tournament actions
  createTournament: (tournament: Omit<Tournament, 'id' | 'joinCode' | 'updatedAt'>) => Promise<Tournament>;
  updateTournament: (id: string, updates: Partial<Tournament>) => Promise<void>;
  deleteTournament: (id: string) => Promise<void>;
  setActiveTournament: (id: string | null) => Promise<void>;
  getTournamentByCode: (code: string) => Tournament | undefined;
  
  // Buddy actions
  addBuddy: (name: string) => Promise<void>;
  updateBuddy: (id: string, name: string) => Promise<void>;
  deleteBuddy: (id: string) => Promise<void>;
  
  // Round/Scoring actions
  setActiveRound: (index: number) => Promise<void>;
  setActiveHole: (hole: number) => Promise<void>;
  updateScore: (tournamentId: string, roundIndex: number, playerId: string, hole: string, score: number) => Promise<void>;
  advanceHole: (tournamentId: string, roundIndex: number) => Promise<void>;
}

// Storage keys
const STORAGE_KEYS = {
  TOURNAMENTS: 'lg_tournaments',
  BUDDIES: 'lg_buddies',
  ACTIVE_TOURNAMENT: 'lg_activeTournamentId',
  ACTIVE_ROUND: 'lg_activeRoundIndex',
  ACTIVE_HOLE: 'lg_activeHole',
};

// Generate join code
const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Demo data
const createDemoTournament = (): Tournament => {
  const formatsByHole: Record<string, string> = {};
  for (let i = 1; i <= 18; i++) {
    formatsByHole[i.toString()] = i === 3 || i === 7 || i === 15 ? 'Poker' : 'Scorecard';
  }
  
  return {
    id: uuidv4(),
    name: 'Summer Classic 2025',
    date: new Date().toISOString().split('T')[0],
    location: 'Pine Valley Golf Club',
    joinCode: 'DEMO25',
    roundsCount: 1,
    holesPerRound: 18,
    players: [
      { id: uuidv4(), name: 'John Smith' },
      { id: uuidv4(), name: 'Mike Johnson' },
      { id: uuidv4(), name: 'David Williams' },
    ],
    rounds: [
      {
        roundIndex: 0,
        courseName: 'Pine Valley',
        teeName: 'Championship',
        formatsByHole,
        scores: {},
        currentHole: 1,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
};

const createDemoBuddies = (): Buddy[] => [
  { id: uuidv4(), name: 'John Smith' },
  { id: uuidv4(), name: 'Mike Johnson' },
  { id: uuidv4(), name: 'David Williams' },
  { id: uuidv4(), name: 'Chris Davis' },
];

export const useTournamentStore = create<TournamentStore>((set, get) => ({
  tournaments: [],
  buddies: [],
  activeTournamentId: null,
  activeRoundIndex: 0,
  activeHole: 1,
  isLoading: true,

  loadData: async () => {
    try {
      const [tournamentsJson, buddiesJson, activeId, activeRound, activeHole] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.TOURNAMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.BUDDIES),
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_TOURNAMENT),
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_ROUND),
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_HOLE),
      ]);

      let tournaments = tournamentsJson ? JSON.parse(tournamentsJson) : null;
      let buddies = buddiesJson ? JSON.parse(buddiesJson) : null;

      // Seed demo data if first time
      if (!tournaments || tournaments.length === 0) {
        tournaments = [createDemoTournament()];
        await AsyncStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(tournaments));
      }

      if (!buddies || buddies.length === 0) {
        buddies = createDemoBuddies();
        await AsyncStorage.setItem(STORAGE_KEYS.BUDDIES, JSON.stringify(buddies));
      }

      set({
        tournaments,
        buddies,
        activeTournamentId: activeId || null,
        activeRoundIndex: activeRound ? parseInt(activeRound) : 0,
        activeHole: activeHole ? parseInt(activeHole) : 1,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      set({ isLoading: false });
    }
  },

  saveTournaments: async (tournaments) => {
    await AsyncStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(tournaments));
    set({ tournaments });
  },

  saveBuddies: async (buddies) => {
    await AsyncStorage.setItem(STORAGE_KEYS.BUDDIES, JSON.stringify(buddies));
    set({ buddies });
  },

  createTournament: async (tournamentData) => {
    const tournament: Tournament = {
      ...tournamentData,
      id: uuidv4(),
      joinCode: generateJoinCode(),
      updatedAt: new Date().toISOString(),
    };
    const { tournaments, saveTournaments } = get();
    await saveTournaments([...tournaments, tournament]);
    return tournament;
  },

  updateTournament: async (id, updates) => {
    const { tournaments, saveTournaments } = get();
    const updatedTournaments = tournaments.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    await saveTournaments(updatedTournaments);
  },

  deleteTournament: async (id) => {
    const { tournaments, saveTournaments, activeTournamentId } = get();
    const filtered = tournaments.filter((t) => t.id !== id);
    await saveTournaments(filtered);
    if (activeTournamentId === id) {
      await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
      set({ activeTournamentId: null });
    }
  },

  setActiveTournament: async (id) => {
    if (id) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_TOURNAMENT, id);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_TOURNAMENT);
    }
    set({ activeTournamentId: id });
  },

  getTournamentByCode: (code) => {
    return get().tournaments.find((t) => t.joinCode.toUpperCase() === code.toUpperCase());
  },

  addBuddy: async (name) => {
    const { buddies, saveBuddies } = get();
    const newBuddy: Buddy = { id: uuidv4(), name };
    await saveBuddies([...buddies, newBuddy]);
  },

  updateBuddy: async (id, name) => {
    const { buddies, saveBuddies } = get();
    const updated = buddies.map((b) => (b.id === id ? { ...b, name } : b));
    await saveBuddies(updated);
  },

  deleteBuddy: async (id) => {
    const { buddies, saveBuddies } = get();
    await saveBuddies(buddies.filter((b) => b.id !== id));
  },

  setActiveRound: async (index) => {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_ROUND, index.toString());
    set({ activeRoundIndex: index });
  },

  setActiveHole: async (hole) => {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_HOLE, hole.toString());
    set({ activeHole: hole });
  },

  updateScore: async (tournamentId, roundIndex, playerId, hole, score) => {
    const { tournaments, saveTournaments } = get();
    const updatedTournaments = tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      const updatedRounds = [...t.rounds];
      const round = { ...updatedRounds[roundIndex] };
      round.scores = {
        ...round.scores,
        [playerId]: {
          ...(round.scores[playerId] || {}),
          [hole]: score,
        },
      };
      updatedRounds[roundIndex] = round;
      return { ...t, rounds: updatedRounds, updatedAt: new Date().toISOString() };
    });
    await saveTournaments(updatedTournaments);
  },

  advanceHole: async (tournamentId, roundIndex) => {
    const { tournaments, saveTournaments, setActiveHole } = get();
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!tournament) return;
    
    const currentHole = tournament.rounds[roundIndex].currentHole;
    const nextHole = Math.min(currentHole + 1, tournament.holesPerRound);
    
    const updatedTournaments = tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      const updatedRounds = [...t.rounds];
      updatedRounds[roundIndex] = {
        ...updatedRounds[roundIndex],
        currentHole: nextHole,
      };
      return { ...t, rounds: updatedRounds, updatedAt: new Date().toISOString() };
    });
    
    await saveTournaments(updatedTournaments);
    await setActiveHole(nextHole);
  },
}));
