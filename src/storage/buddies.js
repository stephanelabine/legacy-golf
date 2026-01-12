// src/storage/buddies.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_BUDDIES_V1";

// If you ever changed keys in the past, we can safely migrate from these.
const LEGACY_KEYS = [
  KEY,
  "LEGACY_GOLF_BUDDY_LIST_V1",
  "LEGACY_GOLF_BUDDY_LIST",
  "LEGACY_GOLF_BUDDIES",
  "BUDDIES_V1",
  "BUDDIES",
];

function safeJsonParse(raw) {
  try {
    const v = JSON.parse(raw);
    return v;
  } catch {
    return null;
  }
}

function clampHandicap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(36, Math.round(v)));
}

function cleanPhone(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeBuddy(b) {
  const obj = b && typeof b === "object" ? b : {};
  const id = String(obj.id || "").trim() || null;

  const name = String(obj.name || "").trim();
  if (!name) return null;

  return {
    id: id || `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    name,
    handicap: clampHandicap(obj.handicap ?? 0),
    phone: cleanPhone(obj.phone || ""),
    email: String(obj.email || "").trim(),
    notes: String(obj.notes || "").trim(),
  };
}

function mergeBuddy(a, b) {
  // keep the best/most complete fields
  const next = { ...a };

  // name stays as a.name (but in case a is blank somehow)
  if (!next.name && b.name) next.name = b.name;

  // prefer non-zero handicap
  if ((next.handicap ?? 0) === 0 && (b.handicap ?? 0) > 0) next.handicap = b.handicap;

  // prefer filled contact fields
  if (!next.phone && b.phone) next.phone = b.phone;
  if (!next.email && b.email) next.email = b.email;
  if (!next.notes && b.notes) next.notes = b.notes;

  return next;
}

function dedupeAndMerge(list) {
  const mapById = new Map();
  const mapByName = new Map(); // lowercased name

  for (const item of list) {
    const b = normalizeBuddy(item);
    if (!b) continue;

    const idKey = b.id;
    const nameKey = b.name.toLowerCase();

    // first try merge by id
    if (mapById.has(idKey)) {
      mapById.set(idKey, mergeBuddy(mapById.get(idKey), b));
      continue;
    }

    // then merge by name if it exists already under another id
    if (mapByName.has(nameKey)) {
      const existing = mapByName.get(nameKey);
      const merged = mergeBuddy(existing, b);

      // replace maps
      mapByName.set(nameKey, merged);
      mapById.set(merged.id, merged);

      // also delete the old id entry if the name-map buddy had a different id
      if (existing.id !== merged.id) {
        mapById.delete(existing.id);
      }
      continue;
    }

    mapById.set(idKey, b);
    mapByName.set(nameKey, b);
  }

  // preserve a stable order: newest first if ids are time-based; otherwise keep insertion order
  return Array.from(mapById.values()).reverse();
}

// Read ALL candidate keys and UNION the lists into one master list.
async function readUnionListFromStorage() {
  const combined = [];

  for (const k of LEGACY_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);

      // Support either [ ... ] OR { buddies: [ ... ] }
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.buddies)
        ? parsed.buddies
        : null;

      if (!arr) continue;

      combined.push(...arr);
    } catch {
      // keep going
    }
  }

  const cleaned = dedupeAndMerge(combined);
  return cleaned;
}

// Public: load
export async function getBuddies() {
  try {
    const cleaned = await readUnionListFromStorage();

    // Migrate union list into the stable key so we never “fall back” again
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(cleaned));
    } catch {
      // ignore migration failure
    }

    return cleaned;
  } catch {
    return [];
  }
}

// Public: save (always to the stable key)
export async function saveBuddies(list) {
  try {
    const cleaned = dedupeAndMerge(Array.isArray(list) ? list : []);

    await AsyncStorage.setItem(KEY, JSON.stringify(cleaned));

    // Cleanup: remove older keys so we can’t accidentally read stale splits later
    try {
      const toRemove = LEGACY_KEYS.filter((k) => k !== KEY);
      await AsyncStorage.multiRemove(toRemove);
    } catch {
      // ignore cleanup failure
    }

    return true;
  } catch {
    return false;
  }
}

// Optional helper if you ever want a hard reset button later
export async function clearBuddiesEverywhere() {
  try {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
    return true;
  } catch {
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
