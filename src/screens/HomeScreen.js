// src/screens/HomeScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import * as RoundState from "../storage/roundState";
import { useTheme } from "../theme/ThemeProvider";

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractResumeInfo(state) {
  if (!state) return null;

  const root = state?.activeRound || state?.currentRound || state?.round || state;

  const courseName = pickFirstString(
    root?.course?.name,
    root?.courseName,
    root?.course?.title,
    root?.place?.name,
    state?.course?.name,
    state?.courseName
  );

  const holeRaw = pickFirstNumber(
    root?.holeNumber,
    root?.currentHole,
    root?.hole,
    root?.holeIndex,
    state?.holeNumber,
    state?.currentHole,
    state?.hole,
    state?.holeIndex
  );

  let holeNumber = holeRaw;

  if (holeNumber !== null && holeNumber >= 0 && holeNumber <= 17) {
    const isIndex =
      root?.holeIndex !== undefined || state?.holeIndex !== undefined || holeNumber === 0;
    if (isIndex) holeNumber = holeNumber + 1;
  }

  const isActiveExplicit =
    !!root?.isActive ||
    !!state?.isActive ||
    root?.status === "active" ||
    state?.status === "active" ||
    root?.inProgress === true ||
    state?.inProgress === true;

  const hasEnoughToShow = !!courseName || isActiveExplicit;
  if (!hasEnoughToShow) return null;

  return {
    courseName: courseName || "Current Round",
    holeNumber: holeNumber && holeNumber >= 1 && holeNumber <= 18 ? holeNumber : null,
  };
}

async function loadResumeInfoBestEffort() {
  try {
    const loaders = [
      RoundState.loadRoundState,
      RoundState.getRoundState,
      RoundState.loadState,
      RoundState.loadActiveRound,
      RoundState.getActiveRound,
      RoundState.loadCurrentRound,
      RoundState.getCurrentRound,
      RoundState.loadRound,
      RoundState.getRound,
    ].filter((fn) => typeof fn === "function");

    for (const fn of loaders) {
      try {
        const result = await fn();
        const info = extractResumeInfo(result);
        if (info) return info;
      } catch {
        // keep trying
      }
    }

    return null;
  } catch {
    return null;
  }
}

// extract full params for HOLE_VIEW, best-effort across possible stored shapes
function extractActiveRoundParams(state) {
  if (!state) return null;

  const root = state?.activeRound || state?.currentRound || state?.round || state;

  const course = root?.course || state?.course || null;
  const tee = root?.tee || state?.tee || null;
  const players = root?.players || state?.players || null;

  if (!course || !tee || !Array.isArray(players) || players.length === 0) return null;

  const holeMeta = root?.holeMeta ?? state?.holeMeta ?? null;
  const scoring = root?.scoring ?? root?.scoringType ?? state?.scoring ?? state?.scoringType ?? "net";

  const holeRaw =
    root?.holeNumber ??
    root?.currentHole ??
    root?.hole ??
    root?.holeIndex ??
    state?.holeNumber ??
    state?.currentHole ??
    state?.hole ??
    state?.holeIndex ??
    1;

  let startHole = Number(holeRaw);
  if (!Number.isFinite(startHole)) startHole = 1;

  if (startHole >= 0 && startHole <= 17) {
    const isIndex =
      root?.holeIndex !== undefined || state?.holeIndex !== undefined || startHole === 0;
    if (isIndex) startHole = startHole + 1;
  }

  if (startHole < 1 || startHole > 18) startHole = 1;

  return {
    ...root,
    course,
    tee,
    players,
    holeMeta,
    scoring,
    startHole,
  };
}

async function loadActiveRoundParamsBestEffort() {
  try {
    const loaders = [
      RoundState.loadActiveRound,
      RoundState.getActiveRound,
      RoundState.loadRoundState,
      RoundState.getRoundState,
      RoundState.loadState,
      RoundState.loadCurrentRound,
      RoundState.getCurrentRound,
      RoundState.loadRound,
      RoundState.getRound,
    ].filter((fn) => typeof fn === "function");

    for (const fn of loaders) {
      try {
        const result = await fn();
        const params = extractActiveRoundParams(result);
        if (params) return params;
      } catch {
        // keep trying
      }
    }

    return null;
  } catch {
    return null;
  }
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

  const [resumeInfo, setResumeInfo] = useState(null);

  useEffect(() => {
    let live = true;

    async function refresh() {
      const info = await loadResumeInfoBestEffort();
      if (live) setResumeInfo(info);
    }

    refresh();
    const unsub = navigation?.addListener?.("focus", refresh);

    return () => {
      live = false;
      if (typeof unsub === "function") unsub();
    };
  }, [navigation]);

  const bottomPad = useMemo(
    () => Math.max(18, (insets?.bottom || 0) + 14),
    [insets?.bottom]
  );

  async function onContinue() {
    try {
      const params = await loadActiveRoundParamsBestEffort();

      if (params) {
        navigation.navigate(ROUTES.HOLE_VIEW, params);
        return;
      }

      navigation.navigate(ROUTES.GAMES, { resume: true });
    } catch {
      navigation.navigate(ROUTES.GAMES, { resume: true });
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ImageBackground
        source={require("../../assets/landing-hero.jpg")}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={[styles.overlay, { backgroundColor: theme.heroOverlay }]} />

        <Image
          source={require("../../assets/legacy-logo-transparent.png")}
          style={[
            styles.floatingLogo,
            { top: Math.max(8, (insets?.top || 0) + 2) },
          ]}
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
            <Text style={[styles.title, { color: theme.text }]}>Legacy Golf</Text>
            <Text style={[styles.tagline, { color: theme.muted }]}>Start building your legacy</Text>
          </View>

          <View style={styles.actions}>
            {resumeInfo ? (
              <Pressable
                onPress={onContinue}
                style={({ pressed }) => [
                  styles.continueCard,
                  { borderColor: theme.border, backgroundColor: theme.card },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.continueTop}>
                  <View
                    style={[
                      styles.continueBadge,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.92)"
                          : "rgba(10,15,26,0.92)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="flag-checkered"
                      size={16}
                      color={isDark ? "#0A0F1A" : "#FFFFFF"}
                    />
                    <Text
                      style={[
                        styles.continueBadgeText,
                        { color: isDark ? "#0A0F1A" : "#FFFFFF" },
                      ]}
                    >
                      Continue
                    </Text>
                  </View>

                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={22}
                    color={
                      isDark ? "rgba(255,255,255,0.80)" : "rgba(10,15,26,0.70)"
                    }
                  />
                </View>

                <Text
                  style={[styles.continueTitle, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {resumeInfo.courseName}
                </Text>

                <Text style={[styles.continueSub, { color: theme.muted }]}>
                  {resumeInfo.holeNumber
                    ? `Resume on Hole ${resumeInfo.holeNumber}`
                    : "Resume your current round"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => navigation.navigate(ROUTES.GAMES)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.92)"
                    : "rgba(10,15,26,0.92)",
                },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.btnRow}>
                <MaterialCommunityIcons
                  name="golf-tee"
                  size={18}
                  color={isDark ? "#0A0F1A" : "#FFFFFF"}
                />
                <Text
                  style={[
                    styles.btnPrimaryText,
                    { color: isDark ? "#0A0F1A" : "#FFFFFF" },
                  ]}
                >
                  Start Round
                </Text>
              </View>
            </Pressable>

            <View
              style={[
                styles.quickCard,
                { borderColor: theme.border, backgroundColor: theme.card2 },
              ]}
            >
              <Pressable
                onPress={() => navigation.navigate(ROUTES.HISTORY)}
                style={({ pressed }) => [
                  styles.quickRow,
                  pressed && styles.pressedRow,
                ]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="history"
                      size={18}
                      color={isDark ? "#fff" : "#0A0F1A"}
                    />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>
                    History
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={
                    isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"
                  }
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.divider }]} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.PROFILE)}
                style={({ pressed }) => [
                  styles.quickRow,
                  pressed && styles.pressedRow,
                ]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account"
                      size={18}
                      color={isDark ? "#fff" : "#0A0F1A"}
                    />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>
                    Player Profile
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={
                    isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"
                  }
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.divider }]} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.BUDDIES)}
                style={({ pressed }) => [
                  styles.quickRow,
                  pressed && styles.pressedRow,
                ]}
              >
                <View style={styles.quickLeft}>
                  <View
                    style={[
                      styles.quickIcon,
                      {
                        borderColor: isDark
                          ? "rgba(255,255,255,0.14)"
                          : "rgba(10,15,26,0.10)",
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="account-multiple"
                      size={18}
                      color={isDark ? "#fff" : "#0A0F1A"}
                    />
                  </View>
                  <Text style={[styles.quickText, { color: theme.text }]}>
                    Buddy List
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={
                    isDark ? "rgba(255,255,255,0.70)" : "rgba(10,15,26,0.55)"
                  }
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
    width: 247,
    height: 247,
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
    fontWeight: "900",
    letterSpacing: 0.9,
    fontSize: 10,
  },
  toggleLabelRight: {
    position: "absolute",
    right: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    fontSize: 10,
  },

  brand: { alignItems: "center", paddingTop: 72 },

  // CHANGED: Cinzel applied
  welcome: {
    fontFamily: "Cinzel",
    fontSize: 14,
    letterSpacing: 2.6,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
  },

  // CHANGED: Cinzel applied
  title: {
    fontFamily: "Cinzel",
    fontSize: 50,
    fontWeight: Platform.select({ ios: "700", android: "700", default: "700" }),
    letterSpacing: 1.0,
    textAlign: "center",
    marginBottom: 6,
  },

  // CHANGED: Cinzel applied
  tagline: {
    fontFamily: "Cinzel",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1.25,
    textAlign: "center",
  },

  actions: { gap: 12 },

  continueCard: { borderRadius: 22, borderWidth: 1, padding: 14 },
  continueTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  continueBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
  },
  continueBadgeText: { fontWeight: "900", letterSpacing: 0.2 },
  continueTitle: { fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },
  continueSub: { marginTop: 6, fontWeight: "700" },

  btn: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnPrimaryText: { fontSize: 17, fontWeight: "900", letterSpacing: 0.5 },

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
  quickText: { fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

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
