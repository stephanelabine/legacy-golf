import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_ROUNDS";

export async function getRounds() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Upsert a round by id (save new OR overwrite existing)
 */
export async function saveRound(round) {
  try {
    const rounds = await getRounds();
    const idx = rounds.findIndex((r) => r.id === round.id);

    if (idx >= 0) {
      rounds[idx] = round;
    } else {
      rounds.unshift(round);
    }

    await AsyncStorage.setItem(KEY, JSON.stringify(rounds));
    return true;
  } catch (e) {
    return false;
  }
}

export async function clearRounds() {
  try {
    await AsyncStorage.removeItem(KEY);
    return true;
  } catch (e) {
    return false;
  }
}
