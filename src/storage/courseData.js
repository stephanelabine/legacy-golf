// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { courseIdCandidates } from "../data/coursesLocal";

// We keep compatibility with whatever older prefixes you may have had.
const PREFIXES = [
  "LEGACY_GOLF_COURSE_DATA_V1:",
  "LEGACY_GOLF_COURSE_DATA:",
  "COURSE_DATA_V1:",
  "COURSE_DATA:",
];

function safeJsonParse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

function normalize(v) {
  return String(v || "").trim();
}

function primaryKey(courseId) {
  const id = normalize(courseId);
  return `${PREFIXES[0]}${id}`;
}

/**
 * Build a list of AsyncStorage keys to scan.
 * IMPORTANT: Feed BOTH a "name-like" and an "id-like" input into
 * courseIdCandidates so we can recover old saves even when callers pass:
 * - a display name (e.g., "Green Tee Country Club")
 * - a canonical id (e.g., "green_tee_country_club")
 * - an older/legacy variation (e.g., pagoda ridge naming)
 */
function buildKeys(courseId, courseName) {
  const id = normalize(courseId);
  const name = normalize(courseName);

  // If caller didn’t provide a name, treat the id as a name too.
  const nameLike = name || id;

  const ids = courseIdCandidates(nameLike, id);
  const keys = [];

  for (const p of PREFIXES) {
    for (const cid of ids) {
      keys.push(`${p}${cid}`);
    }
  }

  // unique
  const out = [];
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

// Load: try candidate ids + older prefixes, then migrate to stable key.
// Backwards compatible signature: loadCourseData(courseId)
// Optional: loadCourseData(courseId, courseName)
export async function loadCourseData(courseId, courseName) {
  const id = normalize(courseId);
  if (!id) return null;

  const keys = buildKeys(id, courseName);

  for (const k of keys) {
    try {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;

      const obj = safeJsonParse(raw);
      if (!obj) continue;

      // migrate to the primary stable key if needed
      const pk = primaryKey(id);
      if (k !== pk) {
        try {
          await AsyncStorage.setItem(pk, raw);
        } catch {
          // ignore migration failure
        }
      }

      return obj;
    } catch {
      // keep scanning
    }
  }

  return null;
}

// Save: always write to the stable key
export async function saveCourseData(courseId, data) {
  const id = normalize(courseId);
  if (!id) return false;

  try {
    const pk = primaryKey(id);
    await AsyncStorage.setItem(pk, JSON.stringify(data ?? null));
    return true;
  } catch {
    return false;
  }
}

export async function updateCourseData(courseId, patch) {
  const id = normalize(courseId);
  if (!id) return null;

  try {
    const current = (await loadCourseData(id)) || {};
    const next = { ...current, ...(patch || {}) };
    await saveCourseData(id, next);
    return next;
  } catch {
    return null;
  }
}

export async function clearCourseData(courseId, courseName) {
  const id = normalize(courseId);
  if (!id) return false;

  try {
    const keys = buildKeys(id, courseName);
    await Promise.all(keys.map((k) => AsyncStorage.removeItem(k)));
    return true;
  } catch {
    return false;
  }
}
