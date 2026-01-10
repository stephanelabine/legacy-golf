// src/storage/courseData.js
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "LEGACY_GOLF_COURSE_DATA_V1";

export async function loadAllCourseData() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function loadCourseData(courseId) {
  const all = await loadAllCourseData();
  return all?.[courseId] || null;
}

// IMPORTANT: merge with existing so we don't wipe out other saved fields (like gps) when saving holeMeta.
export async function saveCourseData(courseId, data) {
  try {
    const all = await loadAllCourseData();
    const existing = all?.[courseId] && typeof all[courseId] === "object" ? all[courseId] : {};
    all[courseId] = { ...existing, ...(data || {}) };
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
