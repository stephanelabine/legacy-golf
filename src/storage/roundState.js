// src/storage/roundState.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_ACTIVE_ROUND_V1";

// Best-effort legacy keys (safe to remove even if they don’t exist)
const LEGACY_KEYS = [
  KEY,
  "LEGACY_GOLF_ROUND_STATE_V1",
  "LEGACY_GOLF_CURRENT_ROUND_V1",
  "LEGACY_GOLF_ACTIVE_ROUND",
  "LEGACY_GOLF_ROUND",
  "LEGACY_GOLF_STATE_V1",
];

export async function loadActiveRound() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Full replace (keep for any existing callers)
export async function saveActiveRound(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state ?? null));
    return true;
  } catch {
    return false;
  }
}

// Safe merge update (new)
export async function updateActiveRound(patch) {
  try {
    const current = await loadActiveRound();
    const next = { ...(current || {}), ...(patch || {}) };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

export async function clearActiveRound() {
  try {
    await AsyncStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

// NEW: hard clear across current + legacy keys to prevent “ghost continue”
export async function clearActiveRoundEverywhere() {
  try {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
    return true;
  } catch {
    // fallback (older RN / edge cases)
    try {
      for (const k of LEGACY_KEYS) {
        // eslint-disable-next-line no-await-in-loop
        await AsyncStorage.removeItem(k);
      }
      return true;
    } catch {
      return false;
    }
  }
}
