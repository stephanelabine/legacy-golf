// src/storage/rounds.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "legacy_rounds_v1";

function normalizeStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "in_progress";
  if (s.includes("complete") || s.includes("finished") || s.includes("done")) return "completed";
  if (s.includes("active") || s.includes("progress") || s.includes("in_progress")) return "in_progress";
  return "in_progress";
}

export async function getRounds() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function getRoundById(roundId) {
  try {
    const id = String(roundId || "");
    if (!id) return null;
    const rounds = await getRounds();
    const found = (rounds || []).find((r) => String(r?.id) === id);
    return found || null;
  } catch {
    return null;
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

    const normalized = {
      ...safe,
      id: String(safe.id),
      players: normalizedPlayers,
      courseName: String(
        safe.courseName ||
          safe.course?.name ||
          safe.course?.courseName ||
          safe.course?.title ||
          "Course"
      ),
      teeName: String(safe.teeName || safe.tee?.name || "Tees"),
      status: normalizeStatus(safe.status),
      updatedAt: safe.updatedAt || Date.now(),
    };

    const next = [normalized, ...rounds.filter((r) => String(r?.id) !== String(normalized.id))];

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
