// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_COURSE_DATA_V1";

// ---------- helpers ----------
function safeParse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function normalizeId(v) {
  return String(v || "").trim();
}

function candidateIds(courseId) {
  const raw = normalizeId(courseId);
  if (!raw) return [];

  const lower = raw.toLowerCase();

  const variants = [
    raw,
    lower,
    lower.replace(/\s+/g, "_"),
    lower.replace(/\s+/g, ""),
    lower.replace(/-/g, "_"),
    lower.replace(/_/g, " "),
    lower.replace(/_/g, " ").trim().replace(/\s+/g, "_"),
  ];

  // Special compatibility: Pagoda Ridge <-> Green Tee
  const includesPagoda = lower.includes("pagoda");
  const includesGreenTee =
    lower.includes("green") && lower.includes("tee");

  const pagodaIds = [
    "pagoda_ridge",
    "pagoda_ridge_golf_club",
    "pagoda_ridge_golf_course",
    "pagodaridge",
  ];

  const greenTeeIds = [
    "green_tee_country_club",
    "green_tee",
    "green_tee_golf_course",
    "green_tee_golf_club",
    "greentee",
  ];

  if (includesPagoda) variants.push(...greenTeeIds);
  if (includesGreenTee) variants.push(...pagodaIds);

  // unique + non-empty
  const out = [];
  const seen = new Set();
  for (const x of variants) {
    const v = normalizeId(x);
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function deepEqual(a, b) {
  if (a === b) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;

    // stable compare by keys
    ak.sort();
    bk.sort();
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      const k = ak[i];
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  // number coercion for safety
  if (typeof a === "number" && typeof b === "number") return Number.isFinite(a) && Number.isFinite(b) && a === b;

  return false;
}

function asPoint(p) {
  if (!p || typeof p !== "object") return null;
  const lat = Number(p.lat ?? p.latitude);
  const lng = Number(p.lng ?? p.lon ?? p.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function extractGreens(course) {
  const greens = {};
  const holes = course?.gps?.holes;
  if (!holes || typeof holes !== "object") return greens;

  for (const hKey of Object.keys(holes)) {
    const holeObj = holes[hKey];
    const g = holeObj?.green;
    if (!g || typeof g !== "object") continue;

    const front = asPoint(g.front);
    const middle = asPoint(g.middle);
    const back = asPoint(g.back);

    // Store only valid points (keeps compare clean)
    const out = {};
    if (front) out.front = front;
    if (middle) out.middle = middle;
    if (back) out.back = back;

    if (Object.keys(out).length) greens[String(hKey)] = out;
  }

  return greens;
}

function protectedSnapshot(course) {
  return {
    holeMeta: course?.holeMeta ?? null,
    greens: extractGreens(course),
  };
}

async function loadAll() {
  const raw = await AsyncStorage.getItem(KEY);
  return safeParse(raw);
}

async function saveAll(all) {
  await AsyncStorage.setItem(KEY, JSON.stringify(all || {}));
}

function findExistingCourse(all, courseId) {
  const ids = candidateIds(courseId);
  for (const id of ids) {
    const v = all?.[id];
    if (v && typeof v === "object") return { id, value: v };
  }
  return { id: normalizeId(courseId), value: null };
}

// ---------- API ----------
export async function loadAllCourseData() {
  try {
    return await loadAll();
  } catch {
    return {};
  }
}

export async function loadCourseData(courseId) {
  try {
    const id = normalizeId(courseId);
    if (!id) return null;

    const all = await loadAll();
    const found = findExistingCourse(all, id);
    return found.value || null;
  } catch {
    return null;
  }
}

// saveCourseData(courseId, data, options?)
// options.force === true bypasses lock (only use for deliberate reset/migrations)
export async function saveCourseData(courseId, data, options = {}) {
  try {
    const id = normalizeId(courseId);
    if (!id) return false;

    const all = await loadAll();

    // Prefer the "primary" id passed in, but if data exists under an alias,
    // treat that as the existing baseline and migrate into primary.
    const primary = id;
    const found = findExistingCourse(all, primary);

    const existing =
      (all?.[primary] && typeof all[primary] === "object" ? all[primary] : null) ||
      (found.value && typeof found.value === "object" ? found.value : {}) ||
      {};

    // If existing came from an alias and primary is empty, migrate a copy to primary.
    if (!all?.[primary] && found.id && found.id !== primary && found.value) {
      all[primary] = found.value;
    }

    const next = { ...(existing || {}), ...(data || {}) };

    const locked = !!(existing?._meta && existing._meta.locked);
    if (locked && !options.force) {
      const before = protectedSnapshot(existing);
      const after = protectedSnapshot(next);

      // If green points OR hole meta changes in any way while locked, block.
      if (!deepEqual(before, after)) return false;
    }

    all[primary] = next;
    await saveAll(all);
    return true;
  } catch {
    return false;
  }
}

export async function setCourseLocked(courseId, locked) {
  try {
    const id = normalizeId(courseId);
    if (!id) return false;

    const all = await loadAll();
    const found = findExistingCourse(all, id);

    const primary = id;
    const existing =
      (all?.[primary] && typeof all[primary] === "object" ? all[primary] : null) ||
      (found.value && typeof found.value === "object" ? found.value : {}) ||
      {};

    if (!all?.[primary] && found.id && found.id !== primary && found.value) {
      all[primary] = found.value;
    }

    const nextMeta = {
      ...(existing._meta && typeof existing._meta === "object" ? existing._meta : {}),
      locked: !!locked,
      lockedAt: locked ? Date.now() : null,
    };

    all[primary] = { ...existing, _meta: nextMeta };
    await saveAll(all);
    return true;
  } catch {
    return false;
  }
}

// Wipe EVERYTHING stored for this course id (including common aliases like Pagoda/GreenTee)
export async function clearCourseData(courseId) {
  try {
    const id = normalizeId(courseId);
    if (!id) return false;

    const all = await loadAll();
    const ids = candidateIds(id);

    for (const k of ids) {
      if (all[k]) delete all[k];
    }

    await saveAll(all);
    return true;
  } catch {
    return false;
  }
}
