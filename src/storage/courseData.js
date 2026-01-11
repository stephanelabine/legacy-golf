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

function buildKeys(courseId) {
  const ids = courseIdCandidates("", courseId);
  const keys = [];

  for (const p of PREFIXES) {
    for (const id of ids) {
      keys.push(`${p}${id}`);
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

function primaryKey(courseId) {
  const id = String(courseId || "").trim();
  return `${PREFIXES[0]}${id}`;
}

// Load: try candidate ids + older prefixes, then migrate to stable key.
export async function loadCourseData(courseId) {
  const id = String(courseId || "").trim();
  if (!id) return null;

  const keys = buildKeys(id);

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
  const id = String(courseId || "").trim();
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
  const id = String(courseId || "").trim();
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

export async function clearCourseData(courseId) {
  const id = String(courseId || "").trim();
  if (!id) return false;

  try {
    // remove every candidate key (old ids + old prefixes) to fully reset if needed
    const keys = buildKeys(id);
    await Promise.all(keys.map((k) => AsyncStorage.removeItem(k)));
    return true;
  } catch {
    return false;
  }
}
