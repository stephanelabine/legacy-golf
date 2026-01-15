// src/screens/HomeScreen.js
import React, { useMemo, useRef, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  Pressable,
  Platform,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

const HERO_BG = require("../../assets/landing-hero.jpg");
const LOGO = require("../../assets/legacy-logo-transparent.png");

// Prevent overlay from ever being fully opaque (which makes the photo look “missing” / black)
function safeOverlayColor(input, isDark) {
  const fallback = isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)";
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return fallback;

  // If theme accidentally gives a solid color, force an alpha overlay instead.
  if (raw === "#000" || raw === "#000000" || raw.toLowerCase() === "black") return fallback;

  // If it's rgb(...) (no alpha), convert to rgba with a safe alpha.
  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(raw)) {
    const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
    return `rgba(${inner},${isDark ? "0.45" : "0.25"})`;
  }

  // If it's rgba(...), clamp alpha so it can’t hit full opacity.
  const m = raw.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i);
  if (m) {
    const r = m[1];
    const g = m[2];
    const b = m[3];
    const a = Number(m[4]);
    const safeA = Number.isFinite(a) ? Math.min(a, 0.75) : isDark ? 0.45 : 0.25;
    return `rgba(${r},${g},${b},${safeA})`;
  }

  // Otherwise trust it.
  return raw;
}

function ThemeToggle({ mode, setMode, theme }) {
  const W = 140;
  const H = 30;
  const PAD = 3;
  const KNOB = H - PAD * 2;
  const travel = W - PAD * 2 - KNOB;

  const anim = useRef(new Animated.Value(mode === "dark" ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: mode === "dark" ? 1 : 0,
      duration: 170,
      useNativeDriver: true,
    }).start();
  }, [mode, anim]);

  const knobX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  function toggle() {
    setMode(mode === "dark" ? "light" : "dark");
  }

  const leftLabel = "DARK";
  const rightLabel = "LIGHT";

  const leftActive = mode === "dark";
  const rightActive = mode === "light";

  return (
    <Pressable
      onPress={toggle}
      style={({ pressed }) => [
        styles.toggleWrap,
        {
          width: W,
          height: H,
          borderColor: theme.heroPillBorder,
          backgroundColor: theme.heroPillBg,
        },
        pressed && styles.pressedTiny,
      ]}
    >
      <Text
        style={[
          styles.toggleLabelLeft,
          {
            color: leftActive ? theme.heroPillOnText : theme.heroPillOffText,
            opacity: leftActive ? 1 : 0.55,
          },
        ]}
        numberOfLines={1}
      >
        {leftLabel}
      </Text>

      <Text
        style={[
          styles.toggleLabelRight,
          {
            color: rightActive ? theme.heroPillOnText : theme.heroPillOffText,
            opacity: rightActive ? 1 : 0.55,
          },
        ]}
        numberOfLines={1}
      >
        {rightLabel}
      </Text>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.toggleKnob,
          {
            width: KNOB,
            height: KNOB,
            borderRadius: KNOB / 2,
            backgroundColor: theme.heroPillOn,
            transform: [{ translateX: knobX }],
          },
        ]}
      />
    </Pressable>
  );
}

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { mode, scheme, theme, setMode } = useTheme();
  const isDark = scheme === "dark";

  const bottomPad = useMemo(() => Math.max(18, (insets?.bottom || 0) + 14), [insets?.bottom]);

  const overlayColor = useMemo(() => safeOverlayColor(theme?.heroOverlay, isDark), [theme?.heroOverlay, isDark]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ImageBackground
        source={HERO_BG}
        defaultSource={HERO_BG} // iOS fallback so the hero never appears “missing”
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={[styles.overlay, { backgroundColor: overlayColor }]} />

        <Image
          source={LOGO}
          style={[styles.floatingLogo, { top: Math.max(0, (insets?.top || 0) - 50) }]}
          resizeMode="contain"
          pointerEvents="none"
        />

        <View style={[styles.content, { paddingBottom: bottomPad }]}>
          <View style={styles.topRow}>
            <ThemeToggle mode={mode} setMode={setMode} theme={theme} />
            <View style={{ width: 42 }} />
          </View>

          <View style={styles.brand}>
            <Text style={[styles.welcome, { color: theme.muted }]}>WELCOME TO</Text>

            <Text style={[styles.title, { color: theme.text }]}>
              {"Legacy\u2009Golf"}
            </Text>

            <Text style={[styles.tagline, { color: theme.muted }]}>Start building your legacy</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.GAMES)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                {
                  backgroundColor: isDark ? "rgba(255,255,255,0.92)" : "rgba(10,15,26,0.92)",
                },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.btnRow}>
                <MaterialCommunityIcons name="golf-tee" size={18} color={isDark ? "#0A0F1A" : "#FFFFFF"} />
                <Text style={[styles.btnPrimaryText, { color: isDark ? "#0A0F1A" : "#FFFFFF" }]}>Start Round</Text>
              </View>
            </Pressable>

            <View style={[styles.quickCard, { borderColor: theme.border, backgroundColor: theme.card2 }]}>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.HISTORY)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressedRow]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="history" size={18} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>Round History</Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"}
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.divider }]} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.PROFILE)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressedRow]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="account" size={18} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>Player Profile</Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"}
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.divider }]} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.BUDDIES)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressedRow]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons name="account-multiple" size={18} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>Buddy List</Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bg: { flex: 1 },

  overlay: { ...StyleSheet.absoluteFillObject },

  floatingLogo: {
    position: "absolute",
    alignSelf: "center",
    width: 272,
    height: 272,
    opacity: 0.98,
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },

  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    justifyContent: "space-between",
  },

  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  toggleWrap: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toggleKnob: {
    position: "absolute",
    left: 3,
    top: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  toggleLabelLeft: {
    position: "absolute",
    left: 12,
    fontFamily: "Cinzel",
    fontWeight: "700",
    letterSpacing: 0.9,
    fontSize: 10,
  },
  toggleLabelRight: {
    position: "absolute",
    right: 12,
    fontFamily: "Cinzel",
    fontWeight: "700",
    letterSpacing: 0.9,
    fontSize: 10,
  },

  brand: { alignItems: "center", paddingTop: 92 },

  welcome: {
    fontFamily: "Cinzel",
    fontSize: 14,
    letterSpacing: 2.6,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
  },

  title: {
    fontFamily: "Cinzel",
    fontSize: 50,
    fontWeight: Platform.select({ ios: "700", android: "700", default: "700" }),
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: 6,
  },

  tagline: {
    fontFamily: "Cinzel",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1.25,
    textAlign: "center",
  },

  actions: { gap: 12 },

  btn: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnPrimaryText: {
    fontFamily: "Cinzel",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  quickCard: { borderRadius: 22, borderWidth: 1, overflow: "hidden" },
  quickRow: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
  },
  quickText: {
    fontFamily: "Cinzel",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  divider: { height: 1 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.85 : 0.9,
    transform: [{ scale: 0.99 }],
  },
  pressedRow: {
    opacity: Platform.OS === "ios" ? 0.86 : 0.9,
  },
  pressedTiny: {
    opacity: Platform.OS === "ios" ? 0.9 : 0.92,
  },
});
