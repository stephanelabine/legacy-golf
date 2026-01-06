import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "legacy_rounds_v1";

export async function getRounds() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function saveRound(round) {
  try {
    const rounds = await getRounds();
    const safe = round && typeof round === "object" ? round : null;
    if (!safe || !safe.id) return false;

    const normalizedPlayers = Array.isArray(safe.players)
      ? safe.players.map((p, idx) => ({
          id: String(p?.id || `p${idx + 1}`),
          name: String(p?.name || (idx === 0 ? "Me" : `Player ${idx + 1}`)),
          handicap: Number.isFinite(p?.handicap) ? p.handicap : 0,
          buddyId: p?.buddyId ? String(p.buddyId) : null,
        }))
      : [];

    const next = [
      { ...safe, players: normalizedPlayers },
      ...rounds.filter((r) => r.id !== safe.id),
    ];

    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (e) {
    return false;
  }
}

export async function deleteRound(roundId) {
  try {
    const id = String(roundId || "");
    if (!id) return false;
    const rounds = await getRounds();
    const next = (rounds || []).filter((r) => String(r?.id) !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (e) {
    return false;
  }
}
