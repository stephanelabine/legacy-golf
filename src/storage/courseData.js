// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  readCourseRemote,
  writeCourseRemote,
  wipeCourseRemote,
  isAdmin,
} from "./courseDataRemote";

// Setup-time API import (only when explicitly enabled via opts.allowApiImport)
import { getCourseDetails } from "../api/golfCourseApi";

const PREFIX = "LEGACY_GOLF_COURSE_DATA_V1:";

function key(courseId) {
  return `${PREFIX}${String(courseId)}`;
}

function courseIdFromKey(k) {
  return String(k || "").startsWith(PREFIX) ? String(k).slice(PREFIX.length) : "";
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, patch) {
  const out = isObj(base) ? { ...base } : {};
  if (!isObj(patch)) return out;

  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = out[k];

    if (isObj(pv) && isObj(bv)) out[k] = deepMerge(bv, pv);
    else out[k] = pv;
  }
  return out;
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function coerceHoleMetaFromApiDetails(details) {
  // normalizeCourseDetails in golfCourseApi returns { tees: teesFlat, raw }
  // teesFlat entries may include: total_yards, holes: [{par, yardage, handicap}, ...]
  const tees = Array.isArray(details?.tees) ? details.tees : [];

  let bestTee = null;
  let bestScore = -1;

  for (const t of tees) {
    const holes = Array.isArray(t?.holes) ? t.holes : [];
    const holeCount = holes.length;

    let hasPar = 0;
    let hasSi = 0;
    for (const h of holes) {
      if (safeNum(h?.par) != null) hasPar++;
      if (safeNum(h?.handicap) != null) hasSi++;
    }

    const score = holeCount * 10 + hasPar * 2 + hasSi;
    if (score > bestScore) {
      bestScore = score;
      bestTee = t;
    }
  }

  const holes = Array.isArray(bestTee?.holes) ? bestTee.holes : [];
  if (!holes.length) return null;

  const holeMeta = {};
  for (let i = 0; i < holes.length; i++) {
    const n = i + 1;
    const h = holes[i] || {};

    const par = safeNum(h?.par);
    const si =
      safeNum(h?.handicap) ??
      safeNum(h?.stroke_index) ??
      safeNum(h?.strokeIndex) ??
      safeNum(h?.si);

    // Only set fields we actually have; do not invent values.
    holeMeta[String(n)] = {
      ...(par != null ? { par } : {}),
      ...(si != null ? { si } : {}),
    };
  }

  return holeMeta;
}

async function tryImportCourseDataFromApi(courseId, opts = {}) {
  const cid = String(courseId || "").trim();
  if (!cid) return null;

  try {
    const details = await getCourseDetails(cid);
    if (!details) return null;

    const holeMeta = coerceHoleMetaFromApiDetails(details);

    // If API doesn’t provide holes/par/si, don’t save junk.
    const hasHoleMeta = holeMeta && Object.keys(holeMeta).length > 0;
    if (!hasHoleMeta) return null;

    const payload = {
      source: "golfcourseapi",
      importedAt: new Date().toISOString(),
      courseSummary: {
        id: details?.id || cid,
        courseName: details?.courseName || "",
        clubName: details?.clubName || "",
        city: details?.city || "",
        state: details?.state || "",
        country: details?.country || "",
      },
      holeMeta,
    };

    // Save local immediately so the app can use it.
    await saveCourseDataLocalOnly(cid, payload);

    // Optional: publish to cloud only if explicitly asked AND admin.
    if (opts?.publishIfAdmin === true && isAdmin()) {
      try {
        await writeCourseRemote(cid, payload, { merge: false });
      } catch {
        // keep local even if remote fails
      }
    }

    return payload;
  } catch {
    return null;
  }
}

export async function loadCourseDataLocalOnly(courseId) {
  try {
    const raw = await AsyncStorage.getItem(key(courseId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveCourseDataLocalOnly(courseId, data) {
  try {
    await AsyncStorage.setItem(key(courseId), JSON.stringify(data || {}));
    return true;
  } catch {
    return false;
  }
}

export async function clearCourseDataLocalOnly(courseId) {
  try {
    await AsyncStorage.removeItem(key(courseId));
    return true;
  } catch {
    return false;
  }
}

// MAIN LOAD: remote first, fallback to local
// opts:
// - allowApiImport: true/false (default false)
// - publishIfAdmin: true/false (default false) only used if allowApiImport is true
export async function loadCourseData(courseId, opts = {}) {
  const cid = String(courseId);

  try {
    const remote = await readCourseRemote(cid);
    if (remote) {
      await saveCourseDataLocalOnly(cid, remote);
      return remote;
    }
  } catch {
    // ignore remote errors; fall back to local
  }

  const local = await loadCourseDataLocalOnly(cid);
  if (local) return local;

  // IMPORTANT: Only import from API when explicitly enabled.
  if (opts?.allowApiImport === true) {
    const imported = await tryImportCourseDataFromApi(cid, opts);
    if (imported) return imported;
  }

  return null;
}

// MAIN SAVE: admin writes remote + local. guests only local is blocked by UI, but keep safe here too.
export async function saveCourseData(courseId, patchOrFull) {
  const cid = String(courseId);
  const existing = (await loadCourseDataLocalOnly(cid)) || {};
  const next = deepMerge(existing, patchOrFull || {});

  const okLocal = await saveCourseDataLocalOnly(cid, next);
  if (!okLocal) return false;

  if (isAdmin()) {
    try {
      await writeCourseRemote(cid, next, { merge: false });
    } catch {
      // keep local even if remote fails
    }
  }

  return true;
}

// WIPE: admin wipes remote + local
export async function clearCourseData(courseId) {
  const cid = String(courseId);

  await clearCourseDataLocalOnly(cid);

  if (isAdmin()) {
    try {
      await wipeCourseRemote(cid);
    } catch {
      // ignore
    }
  }

  return true;
}

// PUBLISH: take LOCAL ONLY data (the “correct” stuff on your device) and push to cloud
export async function publishLocalCourseToCloud(courseId) {
  const cid = String(courseId);
  const local = (await loadCourseDataLocalOnly(cid)) || null;
  if (!local) return { ok: false, reason: "no-local-data" };

  await writeCourseRemote(cid, local, { merge: false });
  return { ok: true };
}

// RECOVERY: list all local saved course blobs (to find where the “correct” data is hiding)
export async function listLocalCourseDataSummaries() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const courseKeys = (keys || []).filter((k) => String(k).startsWith(PREFIX));

    const out = [];
    for (const k of courseKeys) {
      let parsed = null;
      try {
        const raw = await AsyncStorage.getItem(k);
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }

      const cid = courseIdFromKey(k);

      const hole1 = parsed?.holeMeta?.["1"] || null;
      const si1 = hole1?.si ?? null;
      const par1 = hole1?.par ?? null;

      const holesObj =
        parsed?.gps?.holes && typeof parsed.gps.holes === "object" ? parsed.gps.holes : {};
      const gpsHolesCount = Object.keys(holesObj || {}).length;

      out.push({
        key: k,
        courseId: cid,
        hasHoleMeta: !!parsed?.holeMeta,
        hole1: { par: par1, si: si1 },
        gpsHolesCount,
        gpsLocked: parsed?.gpsLocked === true,
      });
    }

    // most “complete” first
    out.sort((a, b) => {
      const aw = (a.hasHoleMeta ? 100 : 0) + (a.gpsHolesCount || 0) + (a.gpsLocked ? 50 : 0);
      const bw = (b.hasHoleMeta ? 100 : 0) + (b.gpsHolesCount || 0) + (b.gpsLocked ? 50 : 0);
      return bw - aw;
    });

    return out;
  } catch {
    return [];
  }
}

// RECOVERY: copy one local blob into another courseId (so the app reads it normally)
export async function copyLocalCourseData(fromCourseId, toCourseId) {
  try {
    const raw = await AsyncStorage.getItem(key(fromCourseId));
    if (!raw) return false;
    await AsyncStorage.setItem(key(toCourseId), raw);
    return true;
  } catch {
    return false;
  }
}

// RECOVERY: publish the local blob from one courseId into another courseId in Firestore
export async function publishLocalCourseIdToCloud(fromCourseId, toCourseId) {
  if (!isAdmin()) return { ok: false, reason: "not-admin" };

  const from = String(fromCourseId);
  const to = String(toCourseId);

  const local = (await loadCourseDataLocalOnly(from)) || null;
  if (!local) return { ok: false, reason: "no-local-data" };

  await writeCourseRemote(to, local, { merge: false });
  return { ok: true };
}
