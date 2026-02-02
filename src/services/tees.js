// src/services/tees.js

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

// Temporary local mappings (API-ready later)
function getLocalTees(courseId, courseName) {
  // Osoyoos Desert (your note: "dessert" course)
  if (matchesCourse(courseId, courseName, ["osoyoos", "desert"])) {
    return [
      makeTee("Gold", "GOLD"),
      makeTee("Black", "BLACK"),
      makeTee("Silver", "SILVER"),
      makeTee("Bronze", "BRONZE"),
    ];
  }

  // Park Meadows
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

// Default fallback tees (keeps the app usable for all other courses)
function getDefaultTees() {
  return [
    makeTee("Championship", "CHAMP"),
    makeTee("Blue", "BLUE"),
    makeTee("White", "WHITE"),
    makeTee("Gold", "GOLD"),
    makeTee("Red", "RED"),
  ];
}

// Public API (later you can swap this to a real API call)
export async function getTeesForCourse(courseId, opts = {}) {
  const courseName = String(opts?.courseName || "");

  const local = getLocalTees(courseId, courseName);
  if (local) return local;

  return getDefaultTees();
}
