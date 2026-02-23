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

  // sizing for the carved center
  const CENTER = 88;
  const centerRadius = CENTER / 2;

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

            <Text style={[styles.title, { color: theme.text }]}>{"Legacy\u2009Golf"}</Text>

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

            <View style={[styles.gridWrap, { borderColor: theme.border, backgroundColor: theme.card2 }]}>
              {/* 2x2 cards (same actions/labels), but with icon positioning + center carve */}
              <View style={[styles.gridRow, { marginBottom: 18 }]}>
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.PROFILE)}
                  style={({ pressed }) => [styles.gridCard, { borderColor: theme.border }, pressed && styles.pressedCard]}
                >
                  {/* Player Profile icon: top-left (same) */}
                  <View style={styles.gridIconWrap}>
                    <MaterialCommunityIcons name="account" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Player Profile</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate(ROUTES.PLAYER_STATS)}
                  style={({ pressed }) => [styles.gridCard, { borderColor: theme.border }, pressed && styles.pressedCard]}
                >
                  {/* Player Stats icon: top-right */}
                  <View style={[styles.gridIconWrap, styles.iconTopRight]}>
                    <MaterialCommunityIcons name="chart-line" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Player Stats</Text>
                </Pressable>
              </View>

              <View style={styles.gridRow}>
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.HISTORY)}
                  style={({ pressed }) => [styles.gridCard, { borderColor: theme.border }, pressed && styles.pressedCard]}
                >
                  {/* Round History icon: bottom-left */}
                  <View style={[styles.gridIconWrap, styles.iconBottomLeft]}>
                    <MaterialCommunityIcons name="history" size={22} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Round History</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate(ROUTES.BUDDIES)}
                  style={({ pressed }) => [styles.gridCard, { borderColor: theme.border }, pressed && styles.pressedCard]}
                >
                  {/* Buddy List icon: bottom-right */}
                  <View style={[styles.gridIconWrap, styles.iconBottomRight]}>
                    <MaterialCommunityIcons name="account-multiple" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Buddy List</Text>
                </Pressable>
              </View>

              {/* Carve-out mask: hides the inner borders so it looks like the panel "wraps around" the circle */}
              <View
                pointerEvents="none"
                style={[
                  styles.centerMask,
                  {
                    width: CENTER + 12,
                    height: CENTER + 12,
                    borderRadius: (CENTER + 12) / 2,
                    backgroundColor: theme.card2,
                    marginLeft: -((CENTER + 12) / 2),
                    marginTop: -((CENTER + 12) / 2),
                    borderColor: theme.card2,
                  },
                ]}
              />

              {/* Center Quick Post button (transparent/glass like cards, no plus) */}
              <Pressable
                onPress={() => navigation.navigate(ROUTES.QUICK_POST)}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.quickPostCircle,
                  {
                    width: CENTER,
                    height: CENTER,
                    borderRadius: centerRadius,
                    borderColor: theme.border,
                    backgroundColor: "rgba(255,255,255,0.06)",
                  },
                  pressed && styles.pressedFab,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Quick Post"
              >
                <Text style={[styles.quickPostText, { color: theme.text }]}>Quick Post</Text>
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

  gridWrap: {
    position: "relative",
    padding: 14,
    paddingTop: 18,
    paddingBottom: 18,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "visible",
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  gridCard: {
    position: "relative",
    justifyContent: "center",
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gridIconWrap: {
    position: "absolute",
    top: 1,
    left: 1,
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // icon position variants
  iconTopRight: {
    left: undefined,
    right: 1,
  },
  iconBottomLeft: {
    top: undefined,
    bottom: 1,
    left: 1,
  },
  iconBottomRight: {
    top: undefined,
    bottom: 1,
    left: undefined,
    right: 1,
  },

  gridTitle: {
    fontFamily: "Cinzel",
    marginTop: 8,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  pressedCard: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },

  // Center carve mask (covers inner borders)
  centerMask: {
    position: "absolute",
    left: "50%",
    top: "50%",
    borderWidth: 2,
  },

  // Center Quick Post
  quickPostCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -44,
    marginTop: -44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  quickPostText: {
    fontFamily: "Cinzel",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  pressedFab: {
    opacity: Platform.OS === "ios" ? 0.86 : 0.9,
    transform: [{ scale: 0.98 }],
  },

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

  brand: { alignItems: "center", paddingTop: 112 },

  welcome: {
    fontFamily: "Cinzel",
    fontSize: 14,
    letterSpacing: 2.6,
    fontWeight: "600",
    marginBottom: 2,
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