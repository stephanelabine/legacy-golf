// src/storage/roundState.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

/*
  LAW (Regular Games):
  - Firestore is the single source of truth for ALL round data across devices.
  - AsyncStorage is optional cache ONLY (never authoritative).
*/

const CACHE_KEY = "LEGACY_GOLF_ACTIVE_ROUND_ID_V1";

// Firestore paths
function activeMetaRef(uid) {
  return doc(db, "users", uid, "meta", "active");
}
function roundRef(uid, roundId) {
  return doc(db, "users", uid, "rounds", String(roundId));
}

function uidOrNull() {
  return auth?.currentUser?.uid || null;
}

function nowMs() {
  return Date.now();
}

function makeRoundId() {
  // simple, readable, unique enough for now (can switch to nanoid later)
  return `r_${nowMs()}_${Math.floor(Math.random() * 1e6)}`;
}

async function cacheRoundId(roundId) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, String(roundId || ""));
  } catch { }
}

async function loadCachedRoundId() {
  try {
    const v = await AsyncStorage.getItem(CACHE_KEY);
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

// Create (or ensure) the setup round doc + set active pointer
export async function createSetupRound(initial = {}) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = makeRoundId();

  const base = {
    version: 1,

    roundId,
    status: "setup", // setup -> active later

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // core
    gameId: initial?.gameId || null,
    gameTitle: initial?.gameTitle || null,
    scoring: initial?.scoring || initial?.scoringMode || "net",

    course: initial?.course || null,
    tee: initial?.tee || null,
    holeMeta: initial?.holeMeta || null,

    playerCount: initial?.playerCount || null,
    players: Array.isArray(initial?.players) ? initial.players : null,

    // formats
    formatsSelected: Array.isArray(initial?.formatsSelected) ? initial.formatsSelected : [],

    // lobby
    joinCode: initial?.joinCode || null,

    // misc
    startHole: 1,
    currentHole: 1,
  };

  try {
    await setDoc(roundRef(uid, roundId), base, { merge: true });
    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });

    await cacheRoundId(roundId);

    // return hydrated snapshot
    const snap = await getDoc(roundRef(uid, roundId));
    return snap.exists() ? { ...(snap.data() || {}), roundId } : { ...base, roundId };
  } catch {
    return null;
  }
}

// Resolve the current active round id (cross-device)
export async function getActiveRoundId() {
  const uid = uidOrNull();
  if (!uid) return null;

  try {
    const metaSnap = await getDoc(activeMetaRef(uid));
    const meta = metaSnap.exists() ? (metaSnap.data() || {}) : {};
    const fromFs = meta?.activeRoundId ? String(meta.activeRoundId) : null;
    if (fromFs) {
      await cacheRoundId(fromFs);
      return fromFs;
    }
  } catch {
    // fallthrough to cache
  }

  const cached = await loadCachedRoundId();
  return cached || null;
}

// Load active round (Firestore)
export async function loadActiveRound(roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = roundIdArg || (await getActiveRoundId());
  if (!roundId) return null;

  try {
    const snap = await getDoc(roundRef(uid, roundId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return { ...data, roundId };
  } catch {
    return null;
  }
}

// Merge update active round (Firestore)
export async function updateActiveRound(patch, roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = roundIdArg || (await getActiveRoundId());
  if (!roundId) return null;

  try {
    const ref = roundRef(uid, roundId);

    // use updateDoc when possible; if doc missing, setDoc merge
    try {
      await updateDoc(ref, { ...(patch || {}), updatedAt: serverTimestamp() });
    } catch {
      await setDoc(ref, { ...(patch || {}), updatedAt: serverTimestamp() }, { merge: true });
    }

    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });
    await cacheRoundId(roundId);

    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ...(snap.data() || {}), roundId };
  } catch {
    return null;
  }
}

// Full replace (kept for compatibility)
export async function saveActiveRound(state, roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return false;

  const roundId = roundIdArg || state?.roundId || (await getActiveRoundId());
  if (!roundId) return false;

  try {
    await setDoc(roundRef(uid, roundId), { ...(state || {}), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });
    await cacheRoundId(roundId);
    return true;
  } catch {
    return false;
  }
}

export async function clearActiveRound() {
  const uid = uidOrNull();
  if (!uid) return false;

  try {
    await setDoc(activeMetaRef(uid), { activeRoundId: null, updatedAt: serverTimestamp() }, { merge: true });
    await AsyncStorage.removeItem(CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}
