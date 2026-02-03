// src/api/golfCourseApi.js
// Legacy Golf — GolfCourseAPI wrapper (setup-time only; never call during live play)
//
// Key rules:
// - Reads EXPO_PUBLIC_GOLFCOURSEAPI_KEY from process.env
// - Uses auth header: Authorization: Key <your API key>
// - Always returns safe data; never crashes UI
// - Mock fallback is ONLY for missing/placeholder key. If real key + request fails, return null.

const API_BASE_URL = "https://api.golfcourseapi.com";
const DEFAULT_TIMEOUT_MS = 12000;

const API_KEY = (process.env.EXPO_PUBLIC_GOLFCOURSEAPI_KEY || "").trim();

function isPlaceholderKey(k) {
  if (!k) return true;
  const upper = String(k).toUpperCase();
  return (
    upper.includes("PASTE") ||
    upper.includes("YOUR_KEY") ||
    upper.includes("PLACEHOLDER") ||
    upper.includes("REAL_KEY_VALUE_HERE")
  );
}

function buildHeaders() {
  const h = { Accept: "application/json" };

  if (!isPlaceholderKey(API_KEY)) {
    h.Authorization = `Key ${API_KEY}`;
  }

  return h;
}

async function fetchJson(
  url,
  { method = "GET", headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: { ...buildHeaders(), ...headers },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg =
        (json && (json.message || json.error)) || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.url = url;
      err.payload = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(id);
  }
}

/* ---------------------------
   Normalization helpers
---------------------------- */

function safeStr(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function normalizeCourseSummary(item) {
  const id = pickFirst(item, ["id", "_id", "courseId", "course_id"]);
  const courseName = pickFirst(item, ["course_name", "courseName", "name", "title"]);
  const clubName = pickFirst(item, ["club_name", "clubName", "club", "facility", "facility_name"]);

  const loc = item?.location || {};
  const city = pickFirst(loc, ["city", "town"]) || pickFirst(item, ["city"]) || "";
  const state =
    pickFirst(loc, ["state", "province", "region"]) ||
    pickFirst(item, ["state", "province"]) ||
    "";
  const country = pickFirst(loc, ["country"]) || pickFirst(item, ["country"]) || "";

  return {
    id: safeStr(id || ""),
    courseName: safeStr(courseName || ""),
    clubName: safeStr(clubName || ""),
    city: safeStr(city || ""),
    state: safeStr(state || ""),
    country: safeStr(country || ""),
    raw: item || null,
  };
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeTeesAnyShape(root) {
  const teesFlat = [];

  function pushArray(arr, gender) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    for (const t of arr) {
      if (gender) teesFlat.push({ ...t, gender });
      else teesFlat.push({ ...t });
    }
  }

  // 1) tees object male/female
  if (isObj(root?.tees)) {
    pushArray(root.tees.female, "female");
    pushArray(root.tees.male, "male");
  }

  // 2) tees as array
  if (Array.isArray(root?.tees)) {
    pushArray(root.tees, undefined);
  }

  // 3) alt keys as arrays
  pushArray(root?.tee_boxes, undefined);
  pushArray(root?.teeBoxes, undefined);
  pushArray(root?.tee_sets, undefined);
  pushArray(root?.teeSets, undefined);

  // 4) nested scorecard keys
  pushArray(root?.scorecard?.tees, undefined);
  pushArray(root?.scorecard?.teeBoxes, undefined);
  pushArray(root?.scorecard?.tee_boxes, undefined);

  // De-dupe rough duplicates by stable signature
  const seen = new Set();
  const out = [];
  for (const t of teesFlat) {
    const name = safeStr(t?.tee_name || t?.teeName || t?.name || t?.color || t?.code || "").trim();
    const total = safeStr(t?.total_yards ?? t?.totalYards ?? t?.yardage ?? "");
    const gender = safeStr(t?.gender || "");
    const sig = `${name}|${total}|${gender}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(t);
  }

  return out;
}

function normalizeCourseDetails(payload) {
  const root = payload?.course || payload?.data || payload?.result || payload || {};

  const id = safeStr(pickFirst(root, ["id", "_id", "courseId", "course_id"]) || "");
  const courseName = safeStr(pickFirst(root, ["course_name", "courseName", "name", "title"]) || "");
  const clubName = safeStr(
    pickFirst(root, ["club_name", "clubName", "club", "facility", "facility_name"]) || ""
  );

  const loc = root.location || {};
  const city = safeStr(pickFirst(loc, ["city", "town"]) || "");
  const state = safeStr(pickFirst(loc, ["state", "province", "region"]) || "");
  const country = safeStr(pickFirst(loc, ["country"]) || "");

  const teesFlat = normalizeTeesAnyShape(root);

  return {
    id,
    courseName,
    clubName,
    city,
    state,
    country,
    tees: teesFlat,
    raw: payload || null,
  };
}

/* ---------------------------
   Public API (real calls)
---------------------------- */

async function searchCourses(query, opts = {}) {
  const q = safeStr(query).trim();
  const limit = Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 25;

  if (isPlaceholderKey(API_KEY) || !q) {
    return mockSearchCourses(q, { limit });
  }

  const url = new URL(API_BASE_URL + "/v1/search");
  url.searchParams.set("search_query", q);
  if (limit) url.searchParams.set("limit", String(limit));

  try {
    const data = await fetchJson(url.toString());
    const list = data?.courses || data?.results || data?.data || [];
    if (!Array.isArray(list)) return [];
    return list.map(normalizeCourseSummary).filter((x) => x.id || x.courseName);
  } catch {
    return [];
  }
}

async function getCourseDetails(courseId) {
  const id = safeStr(courseId).trim();

  // Only mock when there is no real key configured
  if (!id || isPlaceholderKey(API_KEY)) {
    return mockGetCourseDetails(id);
  }

  const url = `${API_BASE_URL}/v1/courses/${encodeURIComponent(id)}`;

  try {
    const data = await fetchJson(url);
    return normalizeCourseDetails(data);
  } catch {
    // With a real key, do NOT return mock data (it causes fake tees/hole data).
    return null;
  }
}

/* ---------------------------
   Mock fallback (stable)
---------------------------- */

const MOCK_COURSES = [
  {
    id: "mock-1",
    course_name: "Sunny Hills Golf Club",
    club_name: "Sunny Hills",
    location: { city: "Vancouver", state: "BC", country: "Canada" },
  },
  {
    id: "mock-2",
    course_name: "Legacy Lakes",
    club_name: "Legacy",
    location: { city: "Langley", state: "BC", country: "Canada" },
  },
];

function mockSearchCourses(query, opts = {}) {
  const q = safeStr(query).trim().toLowerCase();
  const limit = Number.isFinite(Number(opts.limit)) ? Number(opts.limit) : 25;

  let list = MOCK_COURSES;
  if (q) {
    list = MOCK_COURSES.filter((c) => {
      const course = safeStr(c.course_name).toLowerCase();
      const club = safeStr(c.club_name).toLowerCase();
      const city = safeStr(c.location?.city).toLowerCase();
      return course.includes(q) || club.includes(q) || city.includes(q);
    });
  }

  return list.slice(0, limit).map((x) => normalizeCourseSummary(x));
}

function mockGetCourseDetails(courseId) {
  const id = safeStr(courseId || "mock-1");
  const base = MOCK_COURSES.find((c) => String(c.id) === id) || MOCK_COURSES[0];

  const holes = Array.from({ length: 18 }).map((_, i) => {
    const n = i + 1;
    const par = n % 5 === 0 ? 5 : n % 3 === 0 ? 3 : 4;
    return { par, yardage: 350 + (n % 6) * 15, handicap: n };
  });

  const teeBox = {
    tee_name: "Blue",
    course_rating: null,
    slope_rating: null,
    total_yards: holes.reduce((s, h) => s + (h.yardage || 0), 0),
    number_of_holes: 18,
    par_total: holes.reduce((s, h) => s + (h.par || 0), 0),
    holes,
  };

  return normalizeCourseDetails({
    id: base.id,
    club_name: base.club_name,
    course_name: base.course_name,
    location: base.location,
    tees: { male: [teeBox], female: [] },
  });
}

/* ---------------------------
   Compatibility exports
---------------------------- */

export { searchCourses, getCourseDetails };

export default {
  searchCourses,
  getCourseDetails,
};
