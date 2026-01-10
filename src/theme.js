// src/theme.js
// Token-based theming (dark + light). Keep this small and scale it screen-by-screen.

export function buildTheme(scheme = "dark") {
  const isDark = scheme === "dark";

  if (isDark) {
    return {
      scheme: "dark",

      // IMPORTANT: keep the original premium navy backdrop (was #0B1220)
      bg: "#0B1220",

      text: "#FFFFFF",
      muted: "rgba(255,255,255,0.72)",
      accent: "#2E86FF",

      // surfaces
      card: "rgba(0,0,0,0.34)",
      card2: "rgba(255,255,255,0.04)",
      border: "rgba(255,255,255,0.18)",
      divider: "rgba(255,255,255,0.10)",

      // hero-specific
      heroOverlay: "rgba(0,0,0,0.45)",
      heroPillBg: "rgba(0,0,0,0.28)",
      heroPillBorder: "rgba(255,255,255,0.18)",
      heroPillOn: "rgba(255,255,255,0.92)",
      heroPillOnText: "#0A0F1A",
      heroPillOffText: "rgba(255,255,255,0.86)",
    };
  }

  // Light theme (curated, not inverted)
  return {
    scheme: "light",
    bg: "#F7F8FA",
    text: "#0A0F1A",
    muted: "rgba(10,15,26,0.66)",
    accent: "#1D3557",

    // surfaces
    card: "rgba(255,255,255,0.82)",
    card2: "rgba(255,255,255,0.72)",
    border: "rgba(10,15,26,0.10)",
    divider: "rgba(10,15,26,0.08)",

    // hero-specific
    heroOverlay: "rgba(255,255,255,0.55)",
    heroPillBg: "rgba(255,255,255,0.60)",
    heroPillBorder: "rgba(10,15,26,0.10)",
    heroPillOn: "rgba(10,15,26,0.92)",
    heroPillOnText: "#FFFFFF",
    heroPillOffText: "rgba(10,15,26,0.82)",
  };
}
