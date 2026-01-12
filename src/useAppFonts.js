// src/useAppFonts.js
import { useFonts } from "expo-font";

export default function useAppFonts() {
  const [fontsLoaded] = useFonts({
    Cinzel: require("../assets/fonts/Cinzel.ttf"),
  });

  return fontsLoaded;
}
