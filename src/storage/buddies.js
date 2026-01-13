// src/storage/buddies.js
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Primary key (existing)
 * - Keep this for backwards compatibility.
 */
const KEY = "LEGACY_GOLF_BUDDIES_V1";

/**
 * Secondary “safe” key (new)
 * - Intentionally does NOT start with LEGACY_ so it survives any future “clear legacy keys” logic.
 * - We always write to both keys.
 * - We always read from both keys.
 */
const SAFE_KEY = "LG_BUDDIES_SAFE_V1";

// If you ever changed keys in the past, we can safely migrate from these.
const LEGACY_KEYS = [
  KEY,
  SAFE_KEY,
  "LEGACY_GOLF_BUDDY_LIST_V1",
  "LEGACY_GOLF_BUDDY_LIST",
  "LEGACY_GOLF_BUDDIES",
  "BUDDIES_V1",
  "BUDDIES",
];

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
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
  const next = { ...a };

  // name stays as a.name, but just in case
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

    // merge by id
    if (mapById.has(idKey)) {
      mapById.set(idKey, mergeBuddy(mapById.get(idKey), b));
      continue;
    }

    // merge by name (even if id differs)
    if (mapByName.has(nameKey)) {
      const existing = mapByName.get(nameKey);
      const merged = mergeBuddy(existing, b);

      mapByName.set(nameKey, merged);
      mapById.set(merged.id, merged);

      if (existing.id !== merged.id) {
        mapById.delete(existing.id);
      }
      continue;
    }

    mapById.set(idKey, b);
    mapByName.set(nameKey, b);
  }

  // Keep stable order: newest first (best effort)
  return Array.from(mapById.values()).reverse();
}

function extractBuddyArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.buddies)) return parsed.buddies;
  return null;
}

// Read ALL candidate keys and UNION the lists into one master list.
async function readUnionListFromStorage() {
  const combined = [];

  for (const k of LEGACY_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);
      const arr = extractBuddyArray(parsed);
      if (!arr) continue;

      combined.push(...arr);
    } catch {
      // keep going
    }
  }

  return dedupeAndMerge(combined);
}

async function writeBothKeys(cleaned) {
  // Always write to both keys. This is the “never disappear” hardening.
  const payload = JSON.stringify(cleaned);

  // Write primary first, then safe. If one fails, we still try the other.
  let okA = false;
  let okB = false;

  try {
    await AsyncStorage.setItem(KEY, payload);
    okA = true;
  } catch {
    okA = false;
  }

  try {
    await AsyncStorage.setItem(SAFE_KEY, payload);
    okB = true;
  } catch {
    okB = false;
  }

  return okA || okB;
}

// Public: load
export async function getBuddies() {
  try {
    const cleaned = await readUnionListFromStorage();

    // Best-effort migrate into both keys so future loads are consistent.
    try {
      await writeBothKeys(cleaned);
    } catch {
      // ignore migration failure
    }

    return cleaned;
  } catch {
    return [];
  }
}

// Public: save (always to BOTH keys, no risky cleanup)
export async function saveBuddies(list) {
  try {
    const cleaned = dedupeAndMerge(Array.isArray(list) ? list : []);

    const ok = await writeBothKeys(cleaned);
    if (!ok) return false;

    // IMPORTANT:
    // Do NOT auto-delete “legacy” keys during save.
    // Cleanup is not worth the risk of losing data in dev / Expo Go edge cases.
    // We prefer redundant storage over accidental loss.

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
