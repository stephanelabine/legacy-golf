// src/storage/buddies.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

/**
 * Local keys (backup/cache)
 */
const KEY = "LEGACY_GOLF_BUDDIES_V1";
const SAFE_KEY = "LG_BUDDIES_SAFE_V1";

/**
 * Keys we read once for migration, then remove to prevent “zombie” buddies.
 */
const MIGRATION_ONLY_KEYS = [
  "LEGACY_GOLF_BUDDY_LIST_V1",
  "LEGACY_GOLF_BUDDY_LIST",
  "LEGACY_GOLF_BUDDIES",
  "BUDDIES_V1",
  "BUDDIES",
];

const CLOUD_TIMEOUT_MS = 3500;

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label || "Operation"} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

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

  if (!next.name && b.name) next.name = b.name;

  if ((next.handicap ?? 0) === 0 && (b.handicap ?? 0) > 0) next.handicap = b.handicap;

  if (!next.phone && b.phone) next.phone = b.phone;
  if (!next.email && b.email) next.email = b.email;
  if (!next.notes && b.notes) next.notes = b.notes;

  return next;
}

function dedupeAndMerge(list) {
  const mapById = new Map();
  const mapByName = new Map();

  for (const item of list) {
    const b = normalizeBuddy(item);
    if (!b) continue;

    const idKey = b.id;
    const nameKey = b.name.toLowerCase();

    if (mapById.has(idKey)) {
      mapById.set(idKey, mergeBuddy(mapById.get(idKey), b));
      continue;
    }

    if (mapByName.has(nameKey)) {
      const existing = mapByName.get(nameKey);
      const merged = mergeBuddy(existing, b);

      mapByName.set(nameKey, merged);
      mapById.set(merged.id, merged);

      if (existing.id !== merged.id) mapById.delete(existing.id);
      continue;
    }

    mapById.set(idKey, b);
    mapByName.set(nameKey, b);
  }

  return Array.from(mapById.values()).reverse();
}

function extractBuddyArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.buddies)) return parsed.buddies;
  return null;
}

async function readLocalUnion() {
  const combined = [];
  const READ_KEYS = [KEY, SAFE_KEY, ...MIGRATION_ONLY_KEYS];

  for (const k of READ_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;

      const parsed = safeJsonParse(raw);
      const arr = extractBuddyArray(parsed);
      if (!arr) continue;

      combined.push(...arr);
    } catch {
      // ignore
    }
  }

  return dedupeAndMerge(combined);
}

async function writeLocalBoth(cleaned) {
  const payload = JSON.stringify(cleaned);

  let okPrimary = false;
  let okSafe = false;

  try {
    await AsyncStorage.setItem(KEY, payload);
    okPrimary = true;
  } catch {}

  try {
    await AsyncStorage.setItem(SAFE_KEY, payload);
    okSafe = true;
  } catch {}

  return { okPrimary, okSafe };
}

async function cleanupMigrationKeys() {
  try {
    await AsyncStorage.multiRemove(MIGRATION_ONLY_KEYS);
    return true;
  } catch {
    try {
      for (const k of MIGRATION_ONLY_KEYS) {
        // eslint-disable-next-line no-await-in-loop
        await AsyncStorage.removeItem(k);
      }
      return true;
    } catch {
      return false;
    }
  }
}

function buddiesCollectionRef(uid) {
  return collection(db, "users", uid, "buddies");
}

async function getCloudBuddies(uid) {
  const snap = await withTimeout(getDocs(buddiesCollectionRef(uid)), CLOUD_TIMEOUT_MS, "Firestore getDocs");
  const list = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    list.push({
      id: d.id,
      name: String(data.name || "").trim(),
      handicap: clampHandicap(data.handicap ?? 0),
      phone: cleanPhone(data.phone || ""),
      email: String(data.email || "").trim(),
      notes: String(data.notes || "").trim(),
    });
  });
  return dedupeAndMerge(list);
}

async function saveCloudBuddies(uid, list) {
  const cleaned = dedupeAndMerge(list);

  const batch = writeBatch(db);

  for (const b of cleaned) {
    const ref = doc(db, "users", uid, "buddies", b.id);
    batch.set(ref, { ...b, updatedAt: serverTimestamp() }, { merge: true });
  }

  const userRef = doc(db, "users", uid);
  batch.set(userRef, { updatedAt: serverTimestamp() }, { merge: true });

  await withTimeout(batch.commit(), CLOUD_TIMEOUT_MS, "Firestore batch.commit");
  return cleaned;
}

// Public: load
export async function getBuddies() {
  const user = auth.currentUser;

  // Not logged in: local only
  if (!user?.uid) {
    try {
      const cleaned = await readLocalUnion();
      const { okPrimary, okSafe } = await writeLocalBoth(cleaned);
      if (okPrimary && okSafe) await cleanupMigrationKeys();
      return cleaned;
    } catch {
      return [];
    }
  }

  // Logged in: return local immediately, then attempt cloud (fast timeout)
  const local = await readLocalUnion();

  try {
    const cloud = await getCloudBuddies(user.uid);

    // Merge so local items don't disappear if cloud is slow/outdated
    const merged = dedupeAndMerge([...(cloud || []), ...(local || [])]);

    const { okPrimary, okSafe } = await writeLocalBoth(merged);
    if (okPrimary && okSafe) await cleanupMigrationKeys();

    // If cloud empty but we have local, seed cloud once (best effort)
    if ((cloud || []).length === 0 && (merged || []).length > 0) {
      try {
        await saveCloudBuddies(user.uid, merged);
      } catch {}
    }

    return merged;
  } catch {
    return local;
  }
}

// Public: save
export async function saveBuddies(list) {
  const cleaned = dedupeAndMerge(Array.isArray(list) ? list : []);
  const user = auth.currentUser;

  // Always write local cache first
  const localWrite = await writeLocalBoth(cleaned);
  if (localWrite.okPrimary && localWrite.okSafe) {
    await cleanupMigrationKeys();
  }

  // Not logged in: local is truth
  if (!user?.uid) return localWrite.okPrimary || localWrite.okSafe;

  // Logged in: attempt cloud write (short timeout), but keep local regardless
  try {
    await saveCloudBuddies(user.uid, cleaned);
    return true;
  } catch {
    return localWrite.okPrimary || localWrite.okSafe;
  }
}

// Optional helper if you ever want a hard reset button later
export async function clearBuddiesEverywhere() {
  const ALL_KEYS = [KEY, SAFE_KEY, ...MIGRATION_ONLY_KEYS];

  try {
    await AsyncStorage.multiRemove(ALL_KEYS);
    return true;
  } catch {
    try {
      for (const k of ALL_KEYS) {
        // eslint-disable-next-line no-await-in-loop
        await AsyncStorage.removeItem(k);
      }
      return true;
    } catch {
      return false;
    }
  }
}
