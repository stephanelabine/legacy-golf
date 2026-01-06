import Constants from "expo-constants";

export const MAPBOX_TOKEN =
  Constants?.expoConfig?.extra?.MAPBOX_TOKEN ||
  Constants?.manifest?.extra?.MAPBOX_TOKEN ||
  "";
