// src/screens/HomeScreen.js
import React, { useMemo, useRef, useEffect, useState } from "react";
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
import Svg, { Circle, Rect, Path } from "react-native-svg";

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

function CenterBorderRing({ size, radius, strokeColor, strokeWidth, coverColor }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: -(size / 2),
        marginTop: -(size / 2),
        zIndex: 5,
        elevation: 5,
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      </Svg>
    </View>
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

  // geometry (must match styles below)
  const PAD_X = 14;
  const PAD_Y = 18;
  const GAP = 12;      // column gap
  const ROW_GAP = GAP; // row gap (must match)

  const RING_GAP = 1; // gap between circle + borders
  const RING_RADIUS = centerRadius + RING_GAP;
  const STROKE = 1.5;

  // slightly darker card borders to match the Quick Post ring
  const CARD_STROKE = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.35)";

  const [gridBox, setGridBox] = useState({ w: 0, h: 0 });
  const [tileBox, setTileBox] = useState({ w: 0, h: 0 });

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
          style={[styles.floatingLogo, { top: (insets?.top || 0) - 96 }]}
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

                      // mask radius to “carve” around the circle (uses panel background color)
                      const maskR = RING_RADIUS + STROKE + 8;

                      // divider lines stop before the ring
                      const stop = RING_RADIUS + 6;

                      const vX = PAD_X + cardW + GAP / 2;
                      const hY = PAD_Y + cardH + ROW_GAP / 2;

                      const innerTop = PAD_Y;
                      const innerBottom = gridBox.h - PAD_Y;
                      const innerLeft = PAD_X;
                      const innerRight = gridBox.w - PAD_X;

                      return (
                        <>
                          {/* 4 tile borders with inner-corner NOTCHES that wrap around the circle */}
                          {(() => {
                            const rx = 16;

                            // notch radius (slightly larger than ring radius to create a clean gap)
                            const notchR = RING_RADIUS + 10;

                            const x1L = xL;
                            const x2L = xL + cardW;
                            const x1R = xR;
                            const x2R = xR + cardW;

                            const y1T = yT;
                            const y2T = yT + cardH;

                            const y1B = yB;
                            const y2B = yB + cardH;

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

                            // TL notch at bottom-right (edges: right=x2L, bottom=y2T)
                            const tl_yOnRight = intersectV(x2L, true);
                            const tl_xOnBottom = intersectH(y2T, true);

                            // TR notch at bottom-left (edges: left=x1R, bottom=y2T)
                            const tr_yOnLeft = intersectV(x1R, true);
                            const tr_xOnBottom = intersectH(y2T, false);

                            // BL notch at top-right (edges: right=x2L, top=y1B)
                            const bl_yOnRight = intersectV(x2L, false);
                            const bl_xOnTop = intersectH(y1B, true);

                            // BR notch at top-left (edges: left=x1R, top=y1B)
                            const br_yOnLeft = intersectV(x1R, false);
                            const br_xOnTop = intersectH(y1B, false);

                            // If any intersections fail (very small screens), fall back safely
                            const TLrY = tl_yOnRight ?? y2T - rx;
                            const TLbX = tl_xOnBottom ?? x2L - rx;

                            const TRlY = tr_yOnLeft ?? y2T - rx;
                            const TRbX = tr_xOnBottom ?? x1R + rx;

                            const BLrY = bl_yOnRight ?? y1B + rx;
                            const BLtX = bl_xOnTop ?? x2L - rx;

                            const BRlY = br_yOnLeft ?? y1B + rx;
                            const BRtX = br_xOnTop ?? x1R + rx;

                            // clamp points to tile bounds
                            const tl_rightY = clamp(TLrY, y1T + rx, y2T - rx);
                            const tl_bottomX = clamp(TLbX, x1L + rx, x2L - rx);

                            const tr_leftY = clamp(TRlY, y1T + rx, y2T - rx);
                            const tr_bottomX = clamp(TRbX, x1R + rx, x2R - rx);

                            const bl_rightY = clamp(BLrY, y1B + rx, y2B - rx);
                            const bl_topX = clamp(BLtX, x1L + rx, x2L - rx);

                            const br_leftY = clamp(BRlY, y1B + rx, y2B - rx);
                            const br_topX = clamp(BRtX, x1R + rx, x2R - rx);

                            // Arc flags: we want the SMALL arc around the center.
                            // TL: from right-edge point to bottom-edge point (sweep=1)
                            // TR: from bottom-edge point to left-edge point (sweep=1)
                            // BL: from top-edge point to right-edge point (sweep=1)
                            // BR: from left-edge point to top-edge point (sweep=1)

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

                          {/* CIRCLE RING */}
                        </>
                      );
                    })()}
                  </Svg>
                </View>
              ) : null}

              {/* 2x2 cards (same actions/labels), but with icon positioning + center carve */}
              <View style={[styles.gridRow, { marginBottom: GAP }]}>
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.PROFILE)}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setTileBox({ w: width, h: height });
                  }}
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}
                >
                  {/* Player Profile icon: top-left (same) */}
                  <View style={styles.gridIconWrap}>
                    <MaterialCommunityIcons name="account" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Player Profile</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate(ROUTES.PLAYER_STATS)}
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}
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
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}
                >
                  {/* Round History icon: bottom-left */}
                  <View style={[styles.gridIconWrap, styles.iconBottomLeft]}>
                    <MaterialCommunityIcons name="history" size={22} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Round History</Text>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate(ROUTES.BUDDIES)}
                  style={({ pressed }) => [styles.gridCard, pressed && styles.pressedCard]}
                >
                  {/* Buddy List icon: bottom-right */}
                  <View style={[styles.gridIconWrap, styles.iconBottomRight]}>
                    <MaterialCommunityIcons name="account-multiple" size={16} color={isDark ? "#fff" : "#0A0F1A"} />
                  </View>
                  <Text style={[styles.gridTitle, { color: theme.text }]}>Buddy List</Text>
                </Pressable>
              </View>

              {/* (center mask removed) */}

              {/* (old CenterBorderRing removed — SVG borderOverlay now draws everything) */}

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

                    // black/silver ring
                    borderWidth: 2,
                    borderColor: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",

                    // gold flashy center (glass + glow)
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

  // icon position variants
  iconTopRight: {
    left: undefined,
    right: 8,
  },
  iconBottomLeft: {
    top: undefined,
    bottom: 8,
    left: 8,
  },
  iconBottomRight: {
    top: undefined,
    bottom: 8,
    left: undefined,
    right: 8,
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

  // (centerMask removed)

  // (corner masks removed)

  // Center Quick Post
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