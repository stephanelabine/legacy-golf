import { buildMockCourse } from "../data/courseMock";

// place = { id, name, center:{lat,lon} }
export async function getCourseFromPlace(place) {
  const name = place?.name || "Course";
  const center = place?.center || { lat: 49.2, lon: -122.9 };
  return buildMockCourse(name, center);
}
