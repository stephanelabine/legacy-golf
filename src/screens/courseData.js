// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readCourseRemote, writeCourseRemote, wipeCourseRemote, isAdmin } from "./courseDataRemote";

function key(courseId) {
  return `LEGACY_GOLF_COURSE_DATA_V1:${String(courseId)}`;
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
