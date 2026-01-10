// src/theme/ThemeProvider.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildTheme } from "../theme";

const KEY = "LEGACY_GOLF_THEME_MODE_V1"; // we will always force this to "dark" on boot

const ThemeContext = createContext({
  mode: "dark",
  scheme: "dark",
  theme: buildTheme("dark"),
  setMode: async () => {},
});

export function ThemeProvider({ children }) {
  // ALWAYS start in dark
  const [mode, setModeState] = useState("dark");

  // On every boot, force persisted value to dark (so QR scan / restart always lands dark)
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem(KEY, "dark");
      } catch {
        // ignore
      }
    })();
  }, []);

  // Scheme is just the mode (we are not honoring system for now)
  const scheme = useMemo(() => (mode === "light" ? "light" : "dark"), [mode]);
  const theme = useMemo(() => buildTheme(scheme), [scheme]);

  // Allow in-session switching, but DO NOT persist the user's choice
  // (because we want every boot to start dark)
  async function setMode(next) {
    const safe = next === "light" || next === "dark" ? next : "dark";
    setModeState(safe);
  }

  const value = useMemo(() => ({ mode, scheme, theme, setMode }), [mode, scheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
