// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_COURSE_DATA_V1";

function looksLikePagodaKey(k) {
  const s = String(k || "").toLowerCase();
  return s.includes("pagoda");
}

// Hard remove any legacy Pagoda entries so they can't reappear in UI flows
function prunePagodaEntries(all) {
  if (!all || typeof all !== "object") return { next: all, changed: false };

  let changed = false;
  const next = { ...all };

  for (const k of Object.keys(next)) {
    if (looksLikePagodaKey(k)) {
      delete next[k];
      changed = true;
    }
  }

  return { next, changed };
}

export async function loadAllCourseData() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    const { next, changed } = prunePagodaEntries(parsed);

    // persist the prune so Pagoda can't "ghost" back later
    if (changed) {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    }

    return next;
  } catch {
    return {};
  }
}

export async function loadCourseData(courseId) {
  const all = await loadAllCourseData();
  return all?.[courseId] || null;
}

// IMPORTANT:
// - merge with existing so we don't wipe out other saved fields (like gps) when saving holeMeta.
// - SAFEGUARD: if gps is locked, we refuse any gps overwrites at the storage layer.
export async function saveCourseData(courseId, data) {
  try {
    // Safety: never save data under a Pagoda key
    if (looksLikePagodaKey(courseId)) return false;

    const all = await loadAllCourseData();

    const existing =
      all?.[courseId] && typeof all[courseId] === "object" ? all[courseId] : {};

    const incoming = data && typeof data === "object" ? data : {};

    const next = {
      ...existing,
      ...incoming,
    };

    // HARD SAFEGUARD:
    // If this course has gpsLocked=true, do not allow anything to overwrite gps.
    // (You can still change holeMeta, etc.)
    const gpsLocked = existing?.gpsLocked === true;
    if (gpsLocked && Object.prototype.hasOwnProperty.call(incoming, "gps")) {
      next.gps = existing.gps;
    }

    all[courseId] = next;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

// NEW: wipe everything for ONE course (pars/SI + gps points + locks)
export async function clearCourseData(courseId) {
  try {
    if (!courseId) return false;
    if (looksLikePagodaKey(courseId)) return false;

    const all = await loadAllCourseData();
    if (all && typeof all === "object" && Object.prototype.hasOwnProperty.call(all, courseId)) {
      delete all[courseId];
      await AsyncStorage.setItem(KEY, JSON.stringify(all));
    }
    return true;
  } catch {
    return false;
  }
}
