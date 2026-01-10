// src/api/golfCourseApi.js
import { buildMockCourse } from "../data/courseMock";
import { canonicalCourseName, findLocalCourseByName } from "../data/coursesLocal";

// place = { id, name, center:{lat,lon} }
export async function getCourseFromPlace(place) {
  const rawName = place?.name || "Course";
  const name = canonicalCourseName(rawName);

  // If the place is a legacy name (Pagoda) or slightly different, snap to our known local coords
  const local = findLocalCourseByName(name) || findLocalCourseByName(rawName);

  const center = local
    ? { lat: local.lat, lon: local.lng }
    : place?.center || { lat: 49.2, lon: -122.9 };

  return buildMockCourse(name, center);
}
