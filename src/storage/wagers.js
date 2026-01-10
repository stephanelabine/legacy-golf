// src/storage/wagers.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_WAGERS_V1";

export async function loadWagers() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.enabled) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export async function saveWagers(wagers) {
  try {
    if (!wagers || typeof wagers !== "object" || !wagers.enabled) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(wagers));
  } catch (e) {
    // ignore
  }
}

export async function clearWagers() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    // ignore
  }
}
