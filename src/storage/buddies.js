import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "legacy_buddies_v2";

function migrateBuddy(b) {
  if (!b || typeof b !== "object") return null;
  return {
    id: String(b.id || ""),
    name: String(b.name || "").trim(),
    handicap: Number.isFinite(b.handicap) ? b.handicap : 0,
    phone: typeof b.phone === "string" ? b.phone : "",
    email: typeof b.email === "string" ? b.email : "",
    notes: typeof b.notes === "string" ? b.notes : "",
  };
}

export async function getBuddies() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map(migrateBuddy).filter((x) => x && x.id && x.name);
  } catch (e) {
    return [];
  }
}

export async function saveBuddies(list) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : []));
    return true;
  } catch (e) {
    return false;
  }
}
