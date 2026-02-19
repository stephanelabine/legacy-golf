// src/services/tees.js
//
// Tee resolver for Legacy Golf
// - Calls GolfCourseAPI for tees + total yards (setup-time) unless forceLocalOnly
// - Falls back to local special cases and then default tees
//
// Returns: [{ name, code, yardage }]

import { getCourseDetails } from "../api/golfCourseApi";

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesCourse(courseId, courseName, tokens) {
  const id = norm(courseId);
  const name = norm(courseName);
  const hay = `${id} ${name}`.trim();
  return tokens.every((t) => hay.includes(t));
}

function makeTee(name, code, yardage = null) {
  return {
    name: String(name || "").trim(),
    code: String(code || "").trim(),
    yardage: Number.isFinite(Number(yardage)) ? Number(yardage) : null,
  };
}

function toCode(name, fallback = "TEE") {
  const s = String(name || "").trim();
  if (!s) return fallback;
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function sumHoleYards(holes) {
  if (!Array.isArray(holes) || holes.length === 0) return null;
  let total = 0;
  let ok = false;

  for (const h of holes) {
    const y =
      safeNum(h?.yards) ??
      safeNum(h?.yardage) ??
      safeNum(h?.distance) ??
      safeNum(h?.length) ??
      safeNum(h?.raw?.yards);
    if (Number.isFinite(y)) {
      total += y;
      ok = true;
    }
  }
  return ok ? total : null;
}

function parseTeesFromApiDetails(details) {
  const teesFlat = Array.isArray(details?.tees) ? details.tees : [];
  if (!teesFlat.length) return null;

  const out = [];
  const seen = new Set();

  for (const t of teesFlat) {
    const name =
      String(t?.tee_name || t?.name || t?.teeName || t?.color || t?.code || "").trim() || "Tee";

    const gender = String(t?.gender || "").trim().toLowerCase(); // male/female
    const baseCode = String(t?.code || "").trim() || toCode(name);
    const code = gender ? `${baseCode}_${gender.toUpperCase()}` : baseCode;

    const yardage =
      safeNum(t?.total_yards) ??
      safeNum(t?.totalYards) ??
      safeNum(t?.yardage) ??
      sumHoleYards(t?.holes);

    if (!seen.has(code)) {
      seen.add(code);
      out.push(makeTee(name, code, yardage));
    }
  }

  out.sort((a, b) => {
    const ay = Number.isFinite(Number(a?.yardage)) ? Number(a.yardage) : -1;
    const by = Number.isFinite(Number(b?.yardage)) ? Number(b.yardage) : -1;
    return by - ay;
  });

  return out.length ? out : null;
}

// Local mappings (include Green Tee / Pagoda Ridge protection)
function getLocalTees(courseId, courseName) {
  // Green Tee / Pagoda Ridge (protected)
  if (
    matchesCourse(courseId, courseName, ["green", "tee"]) ||
    matchesCourse(courseId, courseName, ["pagoda", "ridge"])
  ) {
    return [
      makeTee("Championship", "CHAMP"),
      makeTee("Tournament", "TOURNAMENT"),
      makeTee("Blue", "BLUE"),
      makeTee("White", "WHITE"),
      makeTee("Gold", "GOLD"),
      makeTee("Red", "RED"),
    ];
  }

  if (matchesCourse(courseId, courseName, ["osoyoos", "desert"])) {
    return [
      makeTee("Gold", "GOLD"),
      makeTee("Black", "BLACK"),
      makeTee("Silver", "SILVER"),
      makeTee("Bronze", "BRONZE"),
    ];
  }

  if (matchesCourse(courseId, courseName, ["park", "meadows"])) {
    return [
      makeTee("Tournament", "TOURNAMENT"),
      makeTee("Blue", "BLUE"),
      makeTee("White", "WHITE"),
      makeTee("Red", "RED"),
    ];
  }

  return null;
}

function getDefaultTees() {
  return [
    makeTee("Championship", "CHAMP"),
    makeTee("Blue", "BLUE"),
    makeTee("White", "WHITE"),
    makeTee("Gold", "GOLD"),
    makeTee("Red", "RED"),
  ];
}

// opts:
// - courseName: string
// - forceLocalOnly: boolean (if true, skip API and only use local + default)
export async function getTeesForCourse(courseId, opts = {}) {
  const id = String(courseId || "").trim();
  const courseName = String(opts?.courseName || "");
  const forceLocalOnly = opts?.forceLocalOnly === true;

  // 0) Forced local-only (protected courses)
  if (forceLocalOnly) {
    const local = getLocalTees(id, courseName);
    if (local) return local;
    return getDefaultTees();
  }

  // 1) API details (setup-time)
  if (id) {
    try {
      const details = await getCourseDetails(id);
      const parsed = parseTeesFromApiDetails(details);
      if (parsed) return parsed;
    } catch {
      // ignore
    }
  }

  // 2) Local special cases
  const local = getLocalTees(id, courseName);
  if (local) return local;

  // 3) Default
  return getDefaultTees();
}
