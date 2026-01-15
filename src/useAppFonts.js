// src/useAppFonts.js
import { useFonts } from "expo-font";

export default function useAppFonts() {
  const [fontsLoaded] = useFonts({
    Cinzel: require("../assets/Cinzel.ttf"),
  });

  return fontsLoaded;
}
