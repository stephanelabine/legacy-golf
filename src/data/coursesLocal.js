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

export const COURSES_LOCAL = [
  // Green Tee coordinates (Pagoda Ridge was the old name at the same location)
  { id: "green-tee-country-club", name: "Green Tee Country Club", lat: 49.143311, lng: -122.497658 },

  { id: "langley-golf-banquet-center", name: "Langley Golf & Banquet Center", lat: 49.1029, lng: -122.6652 },
  { id: "redwoods-golf-course", name: "Redwoods Golf Course", lat: 49.1022, lng: -122.6768 },
  { id: "morgan-creek-golf-course", name: "Morgan Creek Golf Course", lat: 49.0596, lng: -122.7332 },
  { id: "northview-golf-country-club", name: "Northview Golf & Country Club", lat: 49.1162, lng: -122.6853 },
  { id: "mayfair-lakes-golf-country-club", name: "Mayfair Lakes Golf & Country Club", lat: 49.1168, lng: -122.8787 },
  { id: "hazelmere-golf-tennis-club", name: "Hazelmere Golf & Tennis Club", lat: 49.0478, lng: -122.7896 },
  { id: "surrey-golf-club", name: "Surrey Golf Club", lat: 49.0875, lng: -122.8478 },
  { id: "fraserview-golf-course", name: "Fraserview Golf Course", lat: 49.2194, lng: -123.049 },
  { id: "mccleery-golf-course", name: "McCleery Golf Course", lat: 49.2122, lng: -123.1427 },
  { id: "university-golf-club", name: "University Golf Club", lat: 49.2599, lng: -123.2484 },
  { id: "kings-links-by-the-sea", name: "Kings Links by the Sea", lat: 49.0133, lng: -123.0863 },
  { id: "beach-grove-golf-club", name: "Beach Grove Golf Club", lat: 49.0188, lng: -123.0868 },
  { id: "chilliwack-golf-club", name: "Chilliwack Golf Club", lat: 49.1779, lng: -121.9407 },
  { id: "ledgeview-golf-club", name: "Ledgeview Golf Club", lat: 49.0396, lng: -122.2203 },
  { id: "sandpiper-golf-resort", name: "Sandpiper Golf Resort", lat: 49.2066, lng: -121.7636 },
  { id: "squamish-valley-golf-club", name: "Squamish Valley Golf Club", lat: 49.7624, lng: -123.1195 },
  { id: "whistler-golf-club", name: "Whistler Golf Club", lat: 50.1146, lng: -122.9544 },
  { id: "big-sky-golf-club", name: "Big Sky Golf Club", lat: 49.73, lng: -123.157 },
  { id: "nanaimo-golf-club", name: "Nanaimo Golf Club", lat: 49.1914, lng: -123.9764 },

  // Added: major Lower Mainland courses you named / referenced
  { id: "swaneset-bay-resort-country-club", name: "Swaneset Bay Resort & Country Club", lat: 49.305532, lng: -122.65788 },
  { id: "meadow-gardens-golf-club", name: "Meadow Gardens Golf Club", lat: 49.225277, lng: -122.668759 },
  { id: "golden-eagle-golf-club", name: "Golden Eagle Golf Club", lat: 49.2934888, lng: -122.616802 },
  { id: "fort-langley-golf-course", name: "Fort Langley Golf Course", lat: 49.1785669, lng: -122.5968565 },

  // Added: other major nearby public courses
  { id: "westwood-plateau-golf-country-club", name: "Westwood Plateau Golf & Country Club", lat: 49.313897, lng: -122.786593 },
  { id: "riverway-golf-course", name: "Riverway Golf Course", lat: 49.200081, lng: -122.989658 },
  { id: "burnaby-mountain-golf-course", name: "Burnaby Mountain Golf Course", lat: 49.266041, lng: -122.943621 },
  { id: "guildford-golf-country-club", name: "Guildford Golf & Country Club", lat: 49.1482806, lng: -122.8013565 },

  // Interior BC — Osoyoos has TWO courses (choose either)
  // Same clubhouse area; coords are fine for list/search purposes
  { id: "osoyoos-desert-gold", name: "Osoyoos Golf Club — Desert Gold Course", lat: 49.0339, lng: -119.4681 },
  { id: "osoyoos-park-meadows", name: "Osoyoos Golf Club — Park Meadows Course", lat: 49.0339, lng: -119.4681 },
];

// Helper: find a local course by canonical name (safe for place/search results)
export function findLocalCourseByName(name) {
  const canon = canonicalCourseName(name);
  return COURSES_LOCAL.find((c) => canonicalCourseName(c.name) === canon) || null;
}
