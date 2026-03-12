// src/screens/HomeScreen.js
import React, { useMemo, useRef, useState, useCallback } from "react";
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

const HERO_BG = require("../../assets/landing-hero.jpg");
const LOGO = require("../../assets/legacy-logo-transparent.png");

// Prevent overlay from ever being fully opaque (which makes the photo look “missing” / black)
function safeOverlayColor(input, isDark) {
  const fallback = isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)";
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return fallback;

  if (raw === "#000" || raw === "#000000" || raw.toLowerCase() === "black") return fallback;

  if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(raw)) {
    const inner = raw.slice(raw.indexOf("(") + 1, raw.lastIndexOf(")"));
    return `rgba(${inner},${isDark ? "0.45" : "0.25"})`;
  }

  const m = raw.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)$/i);
  if (m) {
    const r = m[1];
    const g = m[2];
    const b = m[3];
    const a = Number(m[4]);
    const safeA = Number.isFinite(a) ? Math.min(a, 0.75) : isDark ? 0.45 : 0.25;
    return `rgba(${r},${g},${b},${safeA})`;
  }

  return raw;
}

// Theme toggle removed (app is dark-first and uses OS scheme styling only)

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const [heroNonce, setHeroNonce] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setHeroNonce((n) => n + 1);
    }, [])
  );

  const bottomPad = useMemo(() => Math.max(18, (insets?.bottom || 0) + 14), [insets?.bottom]);
  const overlayColor = useMemo(() => safeOverlayColor(theme?.heroOverlay, isDark), [theme?.heroOverlay, isDark]);

  // sizing for the carved center
  const CENTER = 88;
  const centerRadius = CENTER / 2;

  // geometry (must match styles below)
  const PAD_X = 14;
  const PAD_Y = 18;
  const GAP = 12; // column gap
  const ROW_GAP = GAP; // row gap (must match)

  const RING_GAP = 1; // gap between circle + borders
  const RING_RADIUS = centerRadius + RING_GAP;
  const STROKE = 1.5;

  // slightly darker card borders to match the Quick Post ring
  const CARD_STROKE = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";

  const [gridBox, setGridBox] = useState({ w: 0, h: 0 });
  const [tileBox, setTileBox] = useState({ w: 0, h: 0 });

  // Round Mode sheet
  const [roundSheetOpen, setRoundSheetOpen] = useState(false);
  const [roundSheetStep, setRoundSheetStep] = useState("choose"); // "choose" | "join"
  const [joinCode, setJoinCode] = useState("");
  const sheetAnim = useRef(new Animated.Value(0)).current; // 0 closed, 1 open

  const SHEET_H = 390;

  function openRoundSheet() {
    setJoinCode("");
    setRoundSheetStep("choose");
    setRoundSheetOpen(true);
    requestAnimationFrame(() => {
      Animated.timing(sheetAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  }

  function closeRoundSheet() {
    Keyboard.dismiss();
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRoundSheetOpen(false);
    });
  }

  function goStartNewRound() {
    closeRoundSheet();
    navigation.navigate(ROUTES.GAMES);
  }

  function goJoinStep() {
    setRoundSheetStep("join");
    requestAnimationFrame(() => { });
  }

  function doJoinRound() {
    const code = (joinCode || "").trim().toUpperCase();
    if (!code || code.length < 4) return;

    closeRoundSheet();

    navigation.navigate(ROUTES.GAMES, {
      mode: "join",
      joinCode: code,
    });
  }

  const sheetY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_H + 40, 0],
  });

  const backdropOpacity = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const joinDisabled = (joinCode || "").trim().length < 6;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ImageBackground key={`hero-${heroNonce}`} source={HERO_BG} defaultSource={HERO_BG} style={styles.bg} resizeMode="cover">
        <View style={[styles.overlay, { backgroundColor: overlayColor }]} />

        <Image
          source={LOGO}
          style={[styles.floatingLogo, { top: (insets?.top || 0) - 96 }]}
          resizeMode="contain"
          pointerEvents="none"
        />

        <View style={[styles.content, { paddingBottom: bottomPad }]}>
          <View />

          <View style={styles.brand}>
            <Text style={[styles.welcome, { color: theme.muted }]}>WELCOME TO</Text>
            <Text style={[styles.title, { color: theme.text }]}>{"Legacy\u2009Golf"}</Text>
            <Text style={[styles.tagline, { color: theme.muted }]}>Start building your legacy</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={openRoundSheet}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                { backgroundColor: isDark ? "rgba(255,255,255,0.92)" : "rgba(10,15,26,0.92)" },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.btnRow}>
                <MaterialCommunityIcons name="golf-tee" size={18} color={isDark ? "#0A0F1A" : "#FFFFFF"} />
                <Text style={[styles.btnPrimaryText, { color: isDark ? "#0A0F1A" : "#FFFFFF" }]}>Start Round</Text>
              </View>
            </Pressable>

            <View
              style={[styles.gridWrap, { backgroundColor: "transparent" }]}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setGridBox({ w: width, h: height });
              }}
            >
              {gridBox.w > 0 && gridBox.h > 0 && tileBox.h > 0 ? (
                <View pointerEvents="none" style={styles.borderOverlay}>
                  <Svg width={gridBox.w} height={gridBox.h}>
                    {(() => {
                      const contentW = gridBox.w - PAD_X * 2;
                      const cardW = (contentW - GAP) / 2;
                      const cardH = tileBox.h;

                      const xL = PAD_X;
                      const xR = PAD_X + cardW + GAP;
                      const yT = PAD_Y;
                      const yB = PAD_Y + cardH + ROW_GAP;

                      const cx = gridBox.w / 2;
                      const cy = gridBox.h / 2;

                      const notchR = RING_RADIUS + 10;

                      function clamp(n, min, max) {
                        return Math.max(min, Math.min(max, n));
                      }

                      function intersectV(xEdge, wantUpper) {
                        const dx = xEdge - cx;
                        const inside = notchR * notchR - dx * dx;
                        if (inside <= 0) return null;
                        const dy = Math.sqrt(inside);
                        return wantUpper ? cy - dy : cy + dy;
                      }

                      function intersectH(yEdge, wantLeft) {
                        const dy = yEdge - cy;
                        const inside = notchR * notchR - dy * dy;
                        if (inside <= 0) return null;
                        const dx = Math.sqrt(inside);
                        return wantLeft ? cx - dx : cx + dx;
                      }

                      const rx = 16;

                      const x1L = xL;
                      const x2L = xL + cardW;
                      const x1R = xR;
                      const x2R = xR + cardW;

                      const y1T = yT;
                      const y2T = yT + cardH;

                      const y1B = yB;
                      const y2B = yB + cardH;

                      const tl_yOnRight = intersectV(x2L, true);
                      const tl_xOnBottom = intersectH(y2T, true);

                      const tr_yOnLeft = intersectV(x1R, true);
                      const tr_xOnBottom = intersectH(y2T, false);

                      const bl_yOnRight = intersectV(x2L, false);
                      const bl_xOnTop = intersectH(y1B, true);

                      const br_yOnLeft = intersectV(x1R, false);
                      const br_xOnTop = intersectH(y1B, false);

                      const TLrY = tl_yOnRight ?? y2T - rx;
                      const TLbX = tl_xOnBottom ?? x2L - rx;

                      const TRlY = tr_yOnLeft ?? y2T - rx;
                      const TRbX = tr_xOnBottom ?? x1R + rx;

                      const BLrY = bl_yOnRight ?? y1B + rx;
                      const BLtX = bl_xOnTop ?? x2L - rx;

                      const BRlY = br_yOnLeft ?? y1B + rx;
                      const BRtX = br_xOnTop ?? x1R + rx;

                      const tl_rightY = clamp(TLrY, y1T + rx, y2T - rx);
                      const tl_bottomX = clamp(TLbX, x1L + rx, x2L - rx);

                      const tr_leftY = clamp(TRlY, y1T + rx, y2T - rx);
                      const tr_bottomX = clamp(TRbX, x1R + rx, x2R - rx);

                      const bl_rightY = clamp(BLrY, y1B + rx, y2B - rx);
                      const bl_topX = clamp(BLtX, x1L + rx, x2L - rx);

                      const br_leftY = clamp(BRlY, y1B + rx, y2B - rx);
                      const br_topX = clamp(BRtX, x1R + rx, x2R - rx);

                      const dTL = [
                        `M ${x1L + rx} ${y1T}`,
                        `H ${x2L - rx}`,
                        `Q ${x2L} ${y1T} ${x2L} ${y1T + rx}`,
                        `V ${tl_rightY}`,
                        `A ${notchR} ${notchR} 0 0 0 ${tl_bottomX} ${y2T}`,
                        `H ${x1L + rx}`,
                        `Q ${x1L} ${y2T} ${x1L} ${y2T - rx}`,
                        `V ${y1T + rx}`,
                        `Q ${x1L} ${y1T} ${x1L + rx} ${y1T}`,
                        `Z`,
                      ].join(" ");

                      const dTR = [
                        `M ${x1R + rx} ${y1T}`,
                        `H ${x2R - rx}`,
                        `Q ${x2R} ${y1T} ${x2R} ${y1T + rx}`,
                        `V ${y2T - rx}`,
                        `Q ${x2R} ${y2T} ${x2R - rx} ${y2T}`,
                        `H ${tr_bottomX}`,
                        `A ${notchR} ${notchR} 0 0 0 ${x1R} ${tr_leftY}`,
                        `V ${y1T + rx}`,
                        `Q ${x1R} ${y1T} ${x1R + rx} ${y1T}`,
                        `Z`,
                      ].join(" ");

                      const dBL = [
                        `M ${x1L + rx} ${y1B}`,
                        `H ${bl_topX}`,
                        `A ${notchR} ${notchR} 0 0 0 ${x2L} ${bl_rightY}`,
                        `V ${y2B - rx}`,
                        `Q ${x2L} ${y2B} ${x2L - rx} ${y2B}`,
                        `H ${x1L + rx}`,
                        `Q ${x1L} ${y2B} ${x1L} ${y2B - rx}`,
                        `V ${y1B + rx}`,
                        `Q ${x1L} ${y1B} ${x1L + rx} ${y1B}`,
                        `Z`,
                      ].join(" ");

                      const dBR = [
                        `M ${br_topX} ${y1B}`,
                        `H ${x2R - rx}`,
                        `Q ${x2R} ${y1B} ${x2R} ${y1B + rx}`,
                        `V ${y2B - rx}`,
                        `Q ${x2R} ${y2B} ${x2R - rx} ${y2B}`,
                        `H ${x1R + rx}`,
                        `Q ${x1R} ${y2B} ${x1R} ${y2B - rx}`,
                        `V ${br_leftY}`,
                        `A ${notchR} ${notchR} 0 0 0 ${br_topX} ${y1B}`,
                        `Z`,
                      ].join(" ");

                      return (
                        <>
                          <Path d={dTL} fill="transparent" stroke={CARD_STROKE} strokeWidth={STROKE} />
                          <Path d={dTR} fill="transparent" stroke={CARD_STROKE} strokeWidth={STROKE} />
                          <Path d={dBL} fill="transparent" stroke={CARD_STROKE} strokeWidth={STROKE} />
                          <Path d={dBR} fill="transparent" stroke={CARD_STROKE} strokeWidth={STROKE} />
                        </>
                      );
                    })()}
                  </Svg>
                </View>
              ) : null}

              <View style={[styles.gridRow, { marginBottom: GAP }]}>
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.PROFILE)}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setTileBox({ w: width, h: height });
                  }}
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}
                >
                  <View style={styles.gridIconWrap}>
                    <MaterialCommunityIcons name="account" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Player Profile</Text>
                </Pressable>

                <Pressable onPress={() => navigation.navigate(ROUTES.PLAYER_STATS)} style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}>
                  <View style={[styles.gridIconWrap, styles.iconTopRight]}>
                    <MaterialCommunityIcons name="chart-line" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Player Stats</Text>
                </Pressable>
              </View>

              <View style={styles.gridRow}>
                <Pressable onPress={() => navigation.navigate(ROUTES.HISTORY)} style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}>
                  <View style={[styles.gridIconWrap, styles.iconBottomLeft]}>
                    <MaterialCommunityIcons name="history" size={22} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Round History</Text>
                </Pressable>

                <Pressable onPress={() => navigation.navigate(ROUTES.BUDDIES)} style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}>
                  <View style={[styles.gridIconWrap, styles.iconBottomRight]}>
                    <MaterialCommunityIcons name="account-multiple" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Buddy List</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => navigation.navigate(ROUTES.QUICK_POST)}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.quickPostCircle,
                  {
                    width: CENTER,
                    height: CENTER,
                    borderRadius: centerRadius,
                    borderWidth: 2,
                    borderColor: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
                    backgroundColor: isDark ? "rgba(242,201,76,0.18)" : "rgba(242,201,76,0.14)",
                    shadowColor: "#F2C94C",
                    shadowOpacity: isDark ? 0.55 : 0.35,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 12,
                    transform: [
                      { translateX: -centerRadius + 14.5 },
                      { translateY: -centerRadius + 18 },
                      ...(pressed ? [{ scale: 0.98 }] : []),
                    ],
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Quick Post"
              >
                <Text style={[styles.quickPostText, { color: theme.text }]}>Quick Post</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <Modal transparent visible={roundSheetOpen} animationType="none" onRequestClose={closeRoundSheet}>
          <TouchableWithoutFeedback onPress={closeRoundSheet}>
            <Animated.View style={[styles.sheetBackdrop, { opacity: backdropOpacity }]} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetKAV}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <Animated.View
                style={[
                  styles.sheetWrap,
                  {
                    transform: [{ translateY: sheetY }],
                    paddingBottom: Math.max(14, (insets?.bottom || 0) + 10),
                    backgroundColor: isDark ? "rgba(12,16,24,0.92)" : "rgba(245,246,248,0.92)",
                    borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
                  },
                ]}
              >
                <View style={[styles.sheetHandle, { backgroundColor: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.18)" }]} />

                {roundSheetStep === "choose" ? (
                  <>
                    <Text style={[styles.sheetTitle, { color: theme.text }]}>Round Mode</Text>
                    <Text style={[styles.sheetSub, { color: theme.muted }]}>Start a new round or join an existing one.</Text>

                    <Pressable
                      onPress={goStartNewRound}
                      style={({ pressed }) => [
                        styles.sheetBigBtn,
                        {
                          borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
                          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)",
                        },
                        pressed && styles.pressedRow,
                      ]}
                    >
                      <View style={styles.sheetBigLeft}>
                        <View
                          style={[
                            styles.sheetIconPill,
                            {
                              backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(10,15,26,0.08)",
                              borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
                            },
                          ]}
                        >
                          <MaterialCommunityIcons name="flag-checkered" size={18} color={theme.text} />
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={[styles.sheetBigText, { color: theme.text }]}>Start a new round</Text>
                          <Text style={[styles.sheetBigHelp, { color: theme.muted }]}>Create the round and invite players.</Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
                    </Pressable>

                    <Pressable
                      onPress={goJoinStep}
                      style={({ pressed }) => [
                        styles.sheetBigBtn,
                        {
                          borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
                          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)",
                        },
                        pressed && styles.pressedRow,
                      ]}
                    >
                      <View style={styles.sheetBigLeft}>
                        <View
                          style={[
                            styles.sheetIconPill,
                            {
                              backgroundColor: isDark ? "rgba(242,201,76,0.14)" : "rgba(242,201,76,0.12)",
                              borderColor: isDark ? "rgba(242,201,76,0.30)" : "rgba(242,201,76,0.24)",
                            },
                          ]}
                        >
                          <MaterialCommunityIcons name="account-multiple-plus" size={18} color={theme.text} />
                        </View>
                        <View style={{ gap: 2 }}>
                          <Text style={[styles.sheetBigText, { color: theme.text }]}>Join a round</Text>
                          <Text style={[styles.sheetBigHelp, { color: theme.muted }]}>Enter a code to join your group.</Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
                    </Pressable>

                    <Pressable onPress={closeRoundSheet} style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressedTiny]}>
                      <Text style={[styles.sheetCancelText, { color: theme.muted }]}>Cancel</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.sheetTopRow}>
                      <Pressable onPress={() => setRoundSheetStep("choose")} hitSlop={10} style={({ pressed }) => [styles.sheetBack, pressed && styles.pressedTiny]}>
                        <MaterialCommunityIcons name="chevron-left" size={22} color={theme.text} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sheetTitle, { color: theme.text, textAlign: "center" }]}>Join Round</Text>
                        <Text style={[styles.sheetSub, { color: theme.muted, textAlign: "center" }]}>Enter the invite code.</Text>
                      </View>
                      <View style={{ width: 34 }} />
                    </View>

                    <View
                      style={[
                        styles.codeBox,
                        {
                          borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
                          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.05)",
                        },
                      ]}
                    >
                      <TextInput
                        value={joinCode}
                        onChangeText={(t) => setJoinCode((t || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        placeholder="CODE"
                        placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
                        style={[styles.codeInput, { color: theme.text }]}
                        maxLength={8}
                        returnKeyType="done"
                        onSubmitEditing={doJoinRound}
                      />
                    </View>

                    <Pressable
                      onPress={doJoinRound}
                      disabled={joinDisabled}
                      style={({ pressed }) => [
                        styles.joinBtn,
                        {
                          backgroundColor: joinDisabled
                            ? isDark
                              ? "rgba(255,255,255,0.18)"
                              : "rgba(10,15,26,0.18)"
                            : isDark
                              ? "rgba(242,201,76,0.30)"
                              : "rgba(242,201,76,0.24)",
                          borderColor: joinDisabled
                            ? isDark
                              ? "rgba(255,255,255,0.16)"
                              : "rgba(0,0,0,0.12)"
                            : isDark
                              ? "rgba(242,201,76,0.55)"
                              : "rgba(242,201,76,0.42)",
                          opacity: joinDisabled ? 0.6 : 1,
                        },
                        pressed && !joinDisabled && styles.pressedRow,
                      ]}
                    >
                      <View style={styles.btnRow}>
                        <MaterialCommunityIcons name="key" size={18} color={theme.text} />
                        <Text style={[styles.joinBtnText, { color: theme.text }]}>Join</Text>
                      </View>
                    </Pressable>

                    <Pressable onPress={closeRoundSheet} style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressedTiny]}>
                      <Text style={[styles.sheetCancelText, { color: theme.muted }]}>Cancel</Text>
                    </Pressable>
                  </>
                )}
              </Animated.View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </Modal>
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
    borderRadius: 18,
    overflow: "visible",
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    elevation: 4,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  gridCard: {
    position: "relative",
    justifyContent: "center",
    flex: 1,
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gridIconWrap: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  iconTopRight: { left: undefined, right: 8 },
  iconBottomLeft: { top: undefined, bottom: 8, left: 8 },
  iconBottomRight: { top: undefined, bottom: 8, left: undefined, right: 8 },

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

  quickPostCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    zIndex: 6,
    elevation: 14,
  },
  quickPostText: {
    fontFamily: "Cinzel",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.7,
    textAlign: "center",
    paddingHorizontal: 10,
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

  pressed: {
    opacity: Platform.OS === "ios" ? 0.85 : 0.9,
    transform: [{ scale: 0.99 }],
  },
  pressedRow: { opacity: Platform.OS === "ios" ? 0.86 : 0.9 },
  pressedTiny: { opacity: Platform.OS === "ios" ? 0.9 : 0.92 },

  // Sheet
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheetKAV: { flex: 1, justifyContent: "flex-end" },
  sheetWrap: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  sheetTitle: {
    fontFamily: "Cinzel",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  sheetSub: {
    fontFamily: "Cinzel",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 14,
    textAlign: "center",
    opacity: 0.85,
  },
  sheetBigBtn: {
    height: 90,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetBigLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  sheetIconPill: { width: 42, height: 42, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  sheetBigText: { fontFamily: "Cinzel", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
  sheetBigHelp: { fontFamily: "Cinzel", fontSize: 11, fontWeight: "600", letterSpacing: 0.4, opacity: 0.85 },
  sheetCancel: { height: 44, alignItems: "center", justifyContent: "center", marginTop: 2, marginBottom: 8 },
  sheetCancelText: { fontFamily: "Cinzel", fontSize: 13, fontWeight: "700", letterSpacing: 0.6, opacity: 0.9 },
  sheetTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sheetBack: { width: 34, height: 34, borderRadius: 14, alignItems: "center", justifyContent: "center" },

  codeBox: {
    height: 62,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  codeInput: {
    fontFamily: "Cinzel",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 3,
    textAlign: "center",
    paddingVertical: 8,
  },
  joinBtn: {
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  joinBtnText: {
    fontFamily: "Cinzel",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});