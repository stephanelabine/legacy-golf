// src/data/coursesLocal.js
// Local-only list (no database) with coordinates so we can filter within 200km.

// Canonical rename map (legacy names -> current names)
export const COURSE_NAME_ALIASES = {
  "Pagoda Ridge": "Green Tee Country Club",
  "Pagoda Ridge Golf Club": "Green Tee Country Club",
  "Pagoda Ridge Golf Course": "Green Tee Country Club",
};

export function canonicalCourseName(name = "") {
  const raw = String(name || "").trim();
  if (!raw) return raw;

  // direct alias matches
  if (COURSE_NAME_ALIASES[raw]) return COURSE_NAME_ALIASES[raw];

  // fuzzy: anything containing "pagoda" becomes Green Tee
  const lower = raw.toLowerCase();
  if (lower.includes("pagoda")) return "Green Tee Country Club";

  return raw;
}

// IMPORTANT:
// This MUST match the "old" id behavior so previously-saved AsyncStorage data
// (Pars/SI, green points, etc.) still loads.
export function courseIdForName(name = "") {
  const canon = canonicalCourseName(name);
  return String(canon || "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

// Build a list of candidate ids so we can load older saves even if ids changed.
// courseData.js calls: courseIdCandidates("", courseId)
export function courseIdCandidates(courseName = "", courseId = "") {
  const a = String(courseName || "").trim();
  const b = String(courseId || "").trim();

  const raw = b || a;
  const canonFromName = canonicalCourseName(a || raw);

  const candidates = [
    // as-is (maybe already the correct id)
    b,
    raw,

    // common id transforms
    raw.toLowerCase(),
    raw.replace(/\s+/g, "_").toLowerCase(),
    raw.replace(/\s+/g, "").toLowerCase(),
    raw.replace(/-/g, "_").toLowerCase(),
    raw.replace(/_/g, " ").trim().replace(/\s+/g, "_").toLowerCase(),

    // treat raw as a name and apply canonical mapping + old-style id rules
    courseIdForName(raw),
    courseIdForName(canonFromName),

    // explicit support for old "Pagoda" names mapping to Green Tee
    courseIdForName("Pagoda Ridge"),
    courseIdForName("Pagoda Ridge Golf Club"),
    courseIdForName("Pagoda Ridge Golf Course"),
    courseIdForName("Green Tee Country Club"),
  ];

  // unique + non-empty
  const out = [];
  const seen = new Set();
  for (const c of candidates) {
    const v = String(c || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export const COURSES_LOCAL = [
  // Green Tee coordinates (Pagoda Ridge was the old name at the same location)
  { name: "Green Tee Country Club", lat: 49.143311, lng: -122.497658 },

  { name: "Langley Golf & Banquet Center", lat: 49.1029, lng: -122.6652 },
  { name: "Redwoods Golf Course", lat: 49.1022, lng: -122.6768 },
  { name: "Morgan Creek Golf Course", lat: 49.0596, lng: -122.7332 },
  { name: "Northview Golf & Country Club", lat: 49.1162, lng: -122.6853 },
  { name: "Mayfair Lakes Golf & Country Club", lat: 49.1168, lng: -122.8787 },
  { name: "Hazelmere Golf & Tennis Club", lat: 49.0478, lng: -122.7896 },
  { name: "Surrey Golf Club", lat: 49.0875, lng: -122.8478 },
  { name: "Fraserview Golf Course", lat: 49.2194, lng: -123.049 },
  { name: "McCleery Golf Course", lat: 49.2122, lng: -123.1427 },
  { name: "University Golf Club", lat: 49.2599, lng: -123.2484 },
  { name: "Kings Links by the Sea", lat: 49.0133, lng: -123.0863 },
  { name: "Beach Grove Golf Club", lat: 49.0188, lng: -123.0868 },
  { name: "Chilliwack Golf Club", lat: 49.1779, lng: -121.9407 },
  { name: "Ledgeview Golf Club", lat: 49.0396, lng: -122.2203 },
  { name: "Sandpiper Golf Resort", lat: 49.2066, lng: -121.7636 },
  { name: "Squamish Valley Golf Club", lat: 49.7624, lng: -123.1195 },
  { name: "Whistler Golf Club", lat: 50.1146, lng: -122.9544 },
  { name: "Big Sky Golf Club", lat: 49.73, lng: -123.157 },
  { name: "Nanaimo Golf Club", lat: 49.1914, lng: -123.9764 },

  // Added: major Lower Mainland courses you named / referenced
  { name: "Swaneset Bay Resort & Country Club", lat: 49.305532, lng: -122.65788 },
  { name: "Meadow Gardens Golf Club", lat: 49.225277, lng: -122.668759 },
  { name: "Golden Eagle Golf Club", lat: 49.2934888, lng: -122.616802 },
  { name: "Fort Langley Golf Course", lat: 49.1785669, lng: -122.5968565 },

  // Added: other major nearby public courses
  { name: "Westwood Plateau Golf & Country Club", lat: 49.313897, lng: -122.786593 },
  { name: "Riverway Golf Course", lat: 49.200081, lng: -122.989658 },
  { name: "Burnaby Mountain Golf Course", lat: 49.266041, lng: -122.943621 },
  { name: "Guildford Golf & Country Club", lat: 49.1482806, lng: -122.8013565 },
];

// Helper: find a local course by canonical name (safe for place/search results)
export function findLocalCourseByName(name) {
  const canon = canonicalCourseName(name);
  return COURSES_LOCAL.find((c) => canonicalCourseName(c.name) === canon) || null;
}
