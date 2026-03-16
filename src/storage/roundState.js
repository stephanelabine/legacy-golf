// src/storage/roundState.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  arrayUnion,
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
function sharedRoundRef(roundId) {
  return doc(db, "sharedRounds", String(roundId));
}
function sharedRoundCodeRef(code) {
  return doc(db, "sharedRoundCodes", String(code));
}

function uidOrNull() {
  return auth?.currentUser?.uid || null;
}

function nowMs() {
  return Date.now();
}

function makeRoundId() {
  // existing solo rounds (under users/{uid}/rounds/{roundId})
  return `r_${nowMs()}_${Math.floor(Math.random() * 1e6)}`;
}

function makeSharedRoundId() {
  // shared multiplayer rounds (under sharedRounds/{roundId})
  return `sr_${nowMs()}_${Math.floor(Math.random() * 1e6)}`;
}

function makeJoinCode() {
  // 6-char code, avoids confusing chars (I/O/1/0)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeJoinCode(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim()
    .slice(0, 8);
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

// Create (or ensure) the setup round doc + set active pointer (SOLO)
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
    startedAt: nowMs(),
    timestamp: nowMs(),
    startedAt: nowMs(),
    timestamp: nowMs(),
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

    // lobby (legacy / optional)
    joinCode: initial?.joinCode || null,

    // misc
    startHole: 1,
    currentHole: 1,
  };

  try {
    await setDoc(roundRef(uid, roundId), base, { merge: true });
    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });

    await cacheRoundId(roundId);

    const snap = await getDoc(roundRef(uid, roundId));
    return snap.exists() ? { ...(snap.data() || {}), roundId } : { ...base, roundId };
  } catch {
    return null;
  }
}

// Create shared multiplayer setup round (SHARED)
export async function createSharedSetupRound(initial = {}) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = makeSharedRoundId();
  const joinCode = normalizeJoinCode(initial?.joinCode || makeJoinCode());

  const participantUidsRaw = Array.isArray(initial?.participantUids) ? initial.participantUids : [];
  const participantUids = Array.from(new Set([uid, ...participantUidsRaw.map((x) => String(x || "").trim()).filter(Boolean)]));

  const base = {
    version: 1,

    roundId,
    isShared: true,

    joinCode,
    hostUid: uid,
    participantUids,

    status: "setup",

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    // core
    gameId: initial?.gameId || null,
    gameTitle: initial?.gameTitle || null,
    scoring: initial?.scoring || initial?.scoringMode || "net",

    course: initial?.course || null,
    tee: initial?.tee || null,
    holeMeta: initial?.holeMeta || null,

    // 9/18
    holesCount: initial?.holesCount || null,
    holesSide: initial?.holesSide || null,

    playerCount: initial?.playerCount || null,
    players: Array.isArray(initial?.players) ? initial.players : null,

    formatsSelected: Array.isArray(initial?.formatsSelected) ? initial.formatsSelected : [],

    startHole: 1,
    currentHole: 1,
  };

  try {
    // shared round doc
    await setDoc(sharedRoundRef(roundId), base, { merge: true });

    // join-code lookup doc (readable by signed-in users)
    await setDoc(
      sharedRoundCodeRef(joinCode),
      {
        roundId,
        hostUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // active pointer for host
    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });
    await cacheRoundId(roundId);

    const snap = await getDoc(sharedRoundRef(roundId));
    return snap.exists() ? { ...(snap.data() || {}), roundId } : { ...base, roundId };
  } catch {
    return null;
  }
}

// Find a shared round by join code (via sharedRoundCodes/{CODE})
export async function findSharedRoundByJoinCode(codeRaw) {
  const uid = uidOrNull();
  if (!uid) return null;

  const code = normalizeJoinCode(codeRaw);
  if (!code) return null;

  try {
    const snap = await getDoc(sharedRoundCodeRef(code));
    if (!snap.exists()) return null;

    const data = snap.data() || {};
    const roundId = String(data.roundId || "");
    if (!roundId) return null;

    return { ...data, roundId, joinCode: code };
  } catch {
    return null;
  }
}

// Join a shared round by code (adds current user to participantUids)
export async function joinSharedRoundByCode(codeRaw) {
  const uid = uidOrNull();
  if (!uid) return null;

  const found = await findSharedRoundByJoinCode(codeRaw);
  if (!found?.roundId) return null;

  try {
    // join update (allowed by rules even before participant)
    await updateDoc(sharedRoundRef(found.roundId), {
      participantUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });

    // set active pointer for joiner
    await setDoc(activeMetaRef(uid), { activeRoundId: found.roundId, updatedAt: serverTimestamp() }, { merge: true });
    await cacheRoundId(found.roundId);

    // now that we are a participant, we can read the round doc
    const snap = await getDoc(sharedRoundRef(found.roundId));

    if (snap.exists()) {
      const data = snap.data() || {};

      // Ensure this joiner is represented in players[] with uid so briefing/buy-ins can map correctly.
      const meUid = uid;
      const meName =
        String(auth?.currentUser?.displayName || "").trim() ||
        String((auth?.currentUser?.email || "").split("@")[0] || "").trim() ||
        "Player";

      const players = Array.isArray(data?.players) ? data.players.slice() : [];
      const playerCountRaw = Number(data?.playerCount);
      const playerCount =
        Number.isFinite(playerCountRaw) && playerCountRaw >= 1 && playerCountRaw <= 16
          ? playerCountRaw
          : null;

      const already = players.some((p) => String(p?.uid || "").trim() === String(meUid));
      if (!already) {
        const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const meKey = norm(meName);

        // Try to attach uid to an existing slot that matches name and has no uid yet
        let attached = false;
        for (let i = 0; i < players.length; i++) {
          const p = players[i] || {};
          const puid = String(p?.uid || "").trim();
          const pname = String(p?.name || p?.displayName || p?.fullName || "").trim();

          if (!puid && pname && meKey && norm(pname) === meKey) {
            players[i] = { ...p, uid: meUid, source: p?.source || "remote" };
            attached = true;
            break;
          }
        }

        // If no name match and the roster is already "full", claim the first open slot (no uid)
        if (!attached) {
          const isFull = playerCount ? players.length >= playerCount : false;

          if (isFull) {
            for (let i = 0; i < players.length; i++) {
              const p = players[i] || {};
              const puid = String(p?.uid || "").trim();
              const pid = String(p?.id || "").trim();

              // don't hijack host "me" slot
              if (!puid && pid !== "me") {
                players[i] = { ...p, uid: meUid, source: p?.source || "remote" };
                attached = true;
                break;
              }
            }
          }
        }

        // Only append if there is room (or no playerCount is set yet)
        if (!attached) {
          const hasRoom = playerCount ? players.length < playerCount : true;

          if (hasRoom) {
            players.push({
              id: String(meUid),
              uid: meUid,
              name: meName,
              handicap: 0,
              source: "remote",
              trackStats: true,
            });
            attached = true;
          }
        }

        if (attached) {
          try {
            await updateDoc(sharedRoundRef(found.roundId), {
              players,
              updatedAt: serverTimestamp(),
            });
          } catch {
            // non-blocking
          }
        }
      }

      // Re-read once after patch attempt (so caller gets updated players)
      const snap2 = await getDoc(sharedRoundRef(found.roundId));
      const data2 = snap2.exists() ? (snap2.data() || {}) : data;

      return { ...data2, roundId: found.roundId };
    }

    return { ...found, roundId: found.roundId };
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

// Load active round (Firestore) - SOLO or SHARED (based on roundId prefix)
export async function loadActiveRound(roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = roundIdArg || (await getActiveRoundId());
  if (!roundId) return null;

  const isShared = String(roundId).startsWith("sr_");
  const ref = isShared ? sharedRoundRef(roundId) : roundRef(uid, roundId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return { ...data, roundId };
  } catch {
    return null;
  }
}

// Merge update active round (Firestore) - SOLO or SHARED (based on roundId prefix)
export async function updateActiveRound(patch, roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return null;

  const roundId = roundIdArg || (await getActiveRoundId());
  if (!roundId) return null;

  const isShared = String(roundId).startsWith("sr_");
  const ref = isShared ? sharedRoundRef(roundId) : roundRef(uid, roundId);

  try {
    try {
      await updateDoc(ref, { ...(patch || {}), updatedAt: serverTimestamp() });
    } catch {
      await setDoc(ref, { ...(patch || {}), updatedAt: serverTimestamp() }, { merge: true });
    }

    // Always keep this user’s active pointer in sync (even for shared rounds)
    await setDoc(activeMetaRef(uid), { activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });
    await cacheRoundId(roundId);

    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ...(snap.data() || {}), roundId };
  } catch {
    return null;
  }
}

// Full replace (kept for compatibility) - SOLO or SHARED (based on roundId prefix)
export async function saveActiveRound(state, roundIdArg) {
  const uid = uidOrNull();
  if (!uid) return false;

  const roundId = roundIdArg || state?.roundId || (await getActiveRoundId());
  if (!roundId) return false;

  const isShared = String(roundId).startsWith("sr_");
  const ref = isShared ? sharedRoundRef(roundId) : roundRef(uid, roundId);

  try {
    await setDoc(ref, { ...(state || {}), updatedAt: serverTimestamp() }, { merge: true });
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