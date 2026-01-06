import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_KEY = "TEE_CACHE";

export async function getTeesForCourse(courseId) {
  const cacheRaw = await AsyncStorage.getItem(CACHE_KEY);
  const cache = cacheRaw ? JSON.parse(cacheRaw) : {};

  if (cache[courseId]) return cache[courseId];

  // MOCKED API RESPONSE SHAPE (ready for real API swap)
  const apiResponse = [
    { code: "red", name: "Red", yardage: 5200 },
    { code: "white", name: "White", yardage: 6000 },
    { code: "blue", name: "Blue", yardage: 6550 },
    { code: "gold", name: "Gold", yardage: 7000 },
  ];

  cache[courseId] = apiResponse;
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));

  return apiResponse;
}
