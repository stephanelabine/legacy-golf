import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_ACTIVE_ROUND_V1";

export async function loadActiveRound() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveActiveRound(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state || null));
    return true;
  } catch {
    return false;
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
