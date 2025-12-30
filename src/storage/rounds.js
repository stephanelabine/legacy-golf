import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "legacyGolf.rounds.v1";

export async function getRounds() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export async function saveRound(round) {
  const rounds = await getRounds();
  const next = [round, ...rounds];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function deleteAllRounds() {
  await AsyncStorage.removeItem(KEY);
}
