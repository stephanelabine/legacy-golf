// src/storage/buddies.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

/**
 * Buddy List storage rule:
 * - Firestore users/{uid}/buddies is the permanent backend source.
 * - Local storage is only a per-user cache/fallback.
 * - Loading an empty Firestore result must never wipe local cache.
 * - Saving only adds/updates buddies.
 * - Deleting must be explicit through deleteBuddy(id).
 */

const LEGACY_KEY = "LEGACY_GOLF_BUDDIES_V1";
const LEGACY_SAFE_KEY = "LG_BUDDIES_SAFE_V1";

function userKeys(uid) {
  const safeUid = String(uid || "anonymous").trim() || "anonymous";
  return {
    key: `LEGACY_GOLF_BUDDIES_V1_${safeUid}`,
    safeKey: `LG_BUDDIES_SAFE_V1_${safeUid}`,
  };
}

/* ---------------- helpers ---------------- */

function clampHandicap(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  const clamped = Math.max(0, Math.min(36, v));
  return Math.round(clamped * 10) / 10;
}

function cleanPhone(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function normalizeBuddy(b) {
  const obj = b && typeof b === "object" ? b : {};
  const name = String(obj.name || obj.displayName || "").trim();
  if (!name) return null;

  return {
    id: String(obj.id || obj.buddyUid || obj.uid || `${Date.now()}-${Math.floor(Math.random() * 100000)}`),
    name,
    handicap: clampHandicap(obj.handicap ?? 0),
    phone: cleanPhone(obj.phone || ""),
    email: String(obj.email || "").trim(),
    notes: String(obj.notes || "").trim(),
  };
}

function sortByName(list) {
  return [...list].sort((a, b) =>
    String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" })
  );
}

function dedupeAndSort(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const b = normalizeBuddy(item);
    if (!b) continue;
    map.set(b.id, b);
  }
  return sortByName(Array.from(map.values()));
}

function buddiesRef(uid) {
  return collection(db, "users", uid, "buddies");
}

async function writeLocal(list, uid = auth?.currentUser?.uid || null) {
  const sorted = dedupeAndSort(list);
  const payload = JSON.stringify(sorted);
  const keys = userKeys(uid);

  await AsyncStorage.setItem(keys.key, payload);
  await AsyncStorage.setItem(keys.safeKey, payload);

  if (!uid) {
    await AsyncStorage.setItem(LEGACY_KEY, payload);
    await AsyncStorage.setItem(LEGACY_SAFE_KEY, payload);
  }
}

async function readLocal(uid = auth?.currentUser?.uid || null) {
  const keys = userKeys(uid);

  const raw =
    (await AsyncStorage.getItem(keys.key)) ||
    (await AsyncStorage.getItem(keys.safeKey)) ||
    (await AsyncStorage.getItem(LEGACY_KEY)) ||
    (await AsyncStorage.getItem(LEGACY_SAFE_KEY));

  if (!raw) return [];

  try {
    return dedupeAndSort(JSON.parse(raw));
  } catch {
    return [];
  }
}

function snapToBuddies(snap) {
  const list = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    list.push({
      id: d.id,
      name: String(data.name || data.displayName || "").trim(),
      handicap: clampHandicap(data.handicap ?? 0),
      phone: cleanPhone(data.phone || ""),
      email: String(data.email || "").trim(),
      notes: String(data.notes || "").trim(),
    });
  });
  return dedupeAndSort(list);
}

/* ---------------- realtime ---------------- */

export function subscribeBuddies(onChange) {
  const user = auth.currentUser;
  const uid = user?.uid ? String(user.uid) : null;

  readLocal(uid)
    .then((local) => {
      if (Array.isArray(local) && local.length) onChange(local);
    })
    .catch(() => { });

  if (!uid) {
    readLocal(null).then(onChange).catch(() => { });
    return () => { };
  }

  const unsub = onSnapshot(
    buddiesRef(uid),
    async (snap) => {
      const cleaned = snapToBuddies(snap);

      if (cleaned.length) {
        await writeLocal(cleaned, uid);
        onChange(cleaned);
        return;
      }

      const local = await readLocal(uid);
      if (Array.isArray(local) && local.length) {
        onChange(local);
        return;
      }

      onChange([]);
    },
    async () => {
      const local = await readLocal(uid);
      onChange(local);
    }
  );

  return unsub;
}

/* ---------------- load ---------------- */

export async function getBuddies() {
  const user = auth.currentUser;
  const uid = user?.uid ? String(user.uid) : null;

  const local = await readLocal(uid);

  if (!uid) {
    return local;
  }

  try {
    const snap = await getDocs(buddiesRef(uid));
    const cleaned = snapToBuddies(snap);

    if (cleaned.length) {
      await writeLocal(cleaned, uid);
      return cleaned;
    }

    return local;
  } catch {
    return local;
  }
}

/* ---------------- save ---------------- */

export async function saveBuddies(list) {
  const user = auth.currentUser;
  const uid = user?.uid ? String(user.uid) : null;
  const cleaned = dedupeAndSort(list);

  if (!uid) {
    await writeLocal(cleaned, null);
    return true;
  }

  if (!cleaned.length) {
    return true;
  }

  const batch = writeBatch(db);

  for (const b of cleaned) {
    const ref = doc(db, "users", uid, "buddies", b.id);
    batch.set(ref, { ...b, updatedAt: serverTimestamp() }, { merge: true });
  }

  await batch.commit();

  const local = await readLocal(uid);
  const merged = dedupeAndSort([...(Array.isArray(local) ? local : []), ...cleaned]);
  await writeLocal(merged, uid);

  return true;
}

/* ---------------- explicit delete ---------------- */

export async function deleteBuddy(id) {
  const buddyId = String(id || "").trim();
  if (!buddyId) return false;

  const user = auth.currentUser;
  const uid = user?.uid ? String(user.uid) : null;

  if (uid) {
    await deleteDoc(doc(db, "users", uid, "buddies", buddyId));
  }

  const local = await readLocal(uid);
  const next = dedupeAndSort(local.filter((b) => String(b.id) !== buddyId));
  await writeLocal(next, uid);

  return true;
}
