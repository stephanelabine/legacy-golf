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

export async function saveCourseData(courseId, data) {
  try {
    const all = await loadAllCourseData();
    all[courseId] = data;
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
