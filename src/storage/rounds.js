// src/storage/rounds.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

/*
  LAW (Regular Games):
  - Firestore is the single source of truth for round history across devices.
  - AsyncStorage is cache ONLY (never authoritative).
*/

const CACHE_KEY = "legacy_rounds_cache_v2";

function uidOrNull() {
  return auth?.currentUser?.uid || null;
}

function roundRef(uid, roundId) {
  return doc(db, "users", uid, "rounds", String(roundId));
}

function roundsCol(uid) {
  return collection(db, "users", uid, "rounds");
}

function tsToMs(v) {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (typeof v?.toMillis === "function") return v.toMillis();
  const d = new Date(v);
  const ms = d && !Number.isNaN(d.getTime()) ? d.getTime() : null;
  return ms;
}

function normalizeStatus(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "in_progress";
  if (s.includes("setup")) return "setup";
  if (s.includes("complete") || s.includes("finished") || s.includes("done")) return "completed";
  if (s.includes("active") || s.includes("progress") || s.includes("in_progress")) return "in_progress";
  return "in_progress";
}

function normalizeRoundDoc(id, data) {
  const safe = data && typeof data === "object" ? data : {};
  const createdAtMs = tsToMs(safe.createdAt) || tsToMs(safe.startedAt) || null;
  const updatedAtMs = tsToMs(safe.updatedAt) || createdAtMs || null;

  const courseName =
    String(
      safe.courseName ||
      safe.course?.name ||
      safe.course?.courseName ||
      safe.course?.title ||
      "Course"
    ) || "Course";

  const teeName = String(safe.teeName || safe.tee?.name || "Tees") || "Tees";

  // Keep fields HistoryScreen expects:
  // - id
  // - courseName / teeName
  // - createdAt / updatedAt as date-ish values
  // - status
  return {
    ...safe,
    id: String(id),
    roundId: safe.roundId ? String(safe.roundId) : String(id),
    courseName,
    teeName,
    status: normalizeStatus(safe.status),
    createdAt: createdAtMs || Date.now(),
    updatedAt: updatedAtMs || Date.now(),
  };
}

async function cacheWrite(rounds) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(Array.isArray(rounds) ? rounds : []));
  } catch { }
}

async function cacheRead() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getRounds() {
  const uid = uidOrNull();
  if (!uid) return [];

  try {
    const q = query(roundsCol(uid), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach((d) => {
      rows.push(normalizeRoundDoc(d.id, d.data()));
    });

    await cacheWrite(rows);
    return rows;
  } catch {
    // fallback to cache only (offline)
    const cached = await cacheRead();
    return cached || [];
  }
}

export async function getRoundById(roundId) {
  const uid = uidOrNull();
  if (!uid) return null;

  const id = String(roundId || "");
  if (!id) return null;

  try {
    const snap = await getDoc(roundRef(uid, id));
    if (!snap.exists()) return null;
    return normalizeRoundDoc(snap.id, snap.data());
  } catch {
    // fallback to cache
    const cached = await cacheRead();
    const found = (cached || []).find((r) => String(r?.id) === id);
    return found || null;
  }
}

/*
  saveRound:
  - kept for compatibility with older callers
  - writes to Firestore (truth) and updates cache
*/
export async function saveRound(round) {
  const uid = uidOrNull();
  if (!uid) return false;

  const safe = round && typeof round === "object" ? round : null;
  if (!safe) return false;

  const id = String(safe.id || safe.roundId || "");
  if (!id) return false;

  try {
    await setDoc(
      roundRef(uid, id),
      {
        ...safe,
        roundId: safe.roundId ? String(safe.roundId) : id,
        status: normalizeStatus(safe.status),
        updatedAt: serverTimestamp(),
        createdAt: safe.createdAt ? safe.createdAt : serverTimestamp(),
      },
      { merge: true }
    );

    // refresh cache best-effort
    try {
      const all = await getRounds();
      await cacheWrite(all);
    } catch { }

    return true;
  } catch {
    return false;
  }
}

export async function deleteRound(roundId) {
  const uid = uidOrNull();
  if (!uid) return false;

  const id = String(roundId || "");
  if (!id) return false;

  try {
    await deleteDoc(roundRef(uid, id));

    // also remove from cache best-effort
    try {
      const cached = await cacheRead();
      const next = (cached || []).filter((r) => String(r?.id) !== id);
      await cacheWrite(next);
    } catch { }

    return true;
  } catch {
    return false;
  }
}

/*
  Optional helper for callers that want to “mark” a round quickly without rewriting everything.
  (Not required, but safe.)
*/
export async function patchRound(roundId, patch) {
  const uid = uidOrNull();
  if (!uid) return false;

  const id = String(roundId || "");
  if (!id) return false;

  try {
    await updateDoc(roundRef(uid, id), { ...(patch || {}), updatedAt: serverTimestamp() });
    return true;
  } catch {
    try {
      await setDoc(roundRef(uid, id), { ...(patch || {}), updatedAt: serverTimestamp() }, { merge: true });
      return true;
    } catch {
      return false;
    }
  }
}
