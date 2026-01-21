// src/storage/buddies.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "../firebase/firebase";

/**
 * Local cache keys
 */
const KEY = "LEGACY_GOLF_BUDDIES_V1";
const SAFE_KEY = "LG_BUDDIES_SAFE_V1";

/* ---------------- helpers ---------------- */

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
  const name = String(obj.name || "").trim();
  if (!name) return null;

  return {
    id: String(obj.id || `${Date.now()}-${Math.floor(Math.random() * 100000)}`),
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
  for (const item of list) {
    const b = normalizeBuddy(item);
    if (!b) continue;
    map.set(b.id, b);
  }
  return sortByName(Array.from(map.values()));
}

function buddiesRef(uid) {
  return collection(db, "users", uid, "buddies");
}

async function writeLocal(list) {
  const sorted = dedupeAndSort(list);
  const payload = JSON.stringify(sorted);
  await AsyncStorage.setItem(KEY, payload);
  await AsyncStorage.setItem(SAFE_KEY, payload);
}

async function readLocal() {
  const raw = (await AsyncStorage.getItem(KEY)) || (await AsyncStorage.getItem(SAFE_KEY));
  if (!raw) return [];
  try {
    return dedupeAndSort(JSON.parse(raw));
  } catch {
    return [];
  }
}

/* ---------------- realtime ---------------- */

export function subscribeBuddies(onChange) {
  const user = auth.currentUser;
  if (!user?.uid) {
    readLocal().then(onChange).catch(() => {});
    return () => {};
  }

  const unsub = onSnapshot(
    buddiesRef(user.uid),
    async (snap) => {
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

      const cleaned = dedupeAndSort(list);
      await writeLocal(cleaned);
      onChange(cleaned);
    },
    async () => {
      // fallback to local if snapshot fails
      const local = await readLocal();
      onChange(local);
    }
  );

  return unsub;
}

/* ---------------- load ---------------- */

export async function getBuddies() {
  const user = auth.currentUser;

  if (!user?.uid) {
    return await readLocal();
  }

  const snap = await getDocs(buddiesRef(user.uid));
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

  const cleaned = dedupeAndSort(list);
  await writeLocal(cleaned);
  return cleaned;
}

/* ---------------- save ---------------- */

export async function saveBuddies(list) {
  const user = auth.currentUser;
  const cleaned = dedupeAndSort(list);

  if (!user?.uid) {
    await writeLocal(cleaned);
    return true;
  }

  const snap = await getDocs(buddiesRef(user.uid));
  const existingIds = new Set();
  snap.forEach((d) => existingIds.add(d.id));

  const batch = writeBatch(db);

  // upsert
  for (const b of cleaned) {
    const ref = doc(db, "users", user.uid, "buddies", b.id);
    batch.set(ref, { ...b, updatedAt: serverTimestamp() }, { merge: true });
    existingIds.delete(b.id);
  }

  // delete removed
  for (const id of existingIds) {
    batch.delete(doc(db, "users", user.uid, "buddies", id));
  }

  await batch.commit();
  await writeLocal(cleaned);
  return true;
}
