import Constants from "expo-constants";

export const MAPBOX_TOKEN =
  Constants?.expoConfig?.extra?.mapboxToken ||
  Constants?.manifest?.extra?.mapboxToken ||
  "";
