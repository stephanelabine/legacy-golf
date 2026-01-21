// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readCourseRemote, writeCourseRemote, wipeCourseRemote, isAdmin } from "./courseDataRemote";

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
export async function loadCourseData(courseId) {
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

  return await loadCourseDataLocalOnly(cid);
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

      const holesObj = parsed?.gps?.holes && typeof parsed.gps.holes === "object" ? parsed.gps.holes : {};
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
