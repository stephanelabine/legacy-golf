// src/screens/TournamentGreenViewScreen.js
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

import theme from "../theme";
import ScreenHeader from "../components/ScreenHeader";
import ROUTES from "../navigation/routes";
import { loadCourseData } from "../storage/courseData";
import { pickTournamentNavParams } from "../utils/tournamentNav";

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const x = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function yds(m) {
  if (!Number.isFinite(m)) return "—";
  return String(Math.round(m * 1.09361));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function normPoint(pt) {
  if (!pt) return null;

  const lat =
    pt.lat ??
    pt.latitude ??
    pt?.coords?.latitude ??
    (Array.isArray(pt) ? pt[0] : undefined);

  const lon =
    pt.lon ??
    pt.lng ??
    pt.longitude ??
    pt?.coords?.longitude ??
    (Array.isArray(pt) ? pt[1] : undefined);

  const latN = Number(lat);
  const lonN = Number(lon);

  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return null;
  return { lat: latN, lon: lonN };
}

function latLonToMetersDelta(a, b) {
  const latMid = (a.lat + b.lat) * 0.5;
  const mPerDegLat = 111111;
  const mPerDegLon = 111111 * Math.cos(toRad(latMid));
  const dNorth = (b.lat - a.lat) * mPerDegLat;
  const dEast = (b.lon - a.lon) * mPerDegLon;
  return { dNorth, dEast };
}

function offsetLatLon(base, northMeters, eastMeters) {
  const mPerDegLat = 111111;
  const mPerDegLon = 111111 * Math.cos(toRad(base.lat));
  return {
    lat: base.lat + northMeters / mPerDegLat,
    lon: base.lon + eastMeters / mPerDegLon,
  };
}

export default function TournamentGreenViewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};

  const hole = Number(params?.holeNumber ?? params?.hole ?? 1);
  const courseId = params?.courseId ? String(params.courseId) : null;
  const courseName = String(params?.courseName || params?.course?.name || "Course");
  const teeName = String(params?.teeName || params?.tee?.name || "Tees");

  const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
  const roundNumber = Number(params?.roundNumber || 1);
  const roundId = String(params?.roundId || "");

  const [courseData, setCourseData] = useState(null);
  const [userPt, setUserPt] = useState(null);

  const [activeTarget, setActiveTarget] = useState("middle"); // front | middle | back
  const [pinMode, setPinMode] = useState(false);

  const [greenBox, setGreenBox] = useState({ w: 0, h: 0 });
  const [pinPx, setPinPx] = useState({ x: 0, y: 0 });
  const didInitPin = useRef(false);

  const scrollRef = useRef(null);
  const greenRef = useRef(null);

  const draggingRef = useRef(false);
  const [scrollLocked, setScrollLocked] = useState(false);

  const greenRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const hasRectRef = useRef(false);

  const GreenShape = useMemo(() => require("../../assets/GreenShape3.jpg"), []);

  const greenInfo = useMemo(() => {
    return params?.greenInfo || "Green notes can be added later (optional).";
  }, [params?.greenInfo]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          if (!courseId) {
            if (!cancelled) setCourseData(null);
            return;
          }
          const saved = await loadCourseData(String(courseId));
          if (!cancelled) setCourseData(saved || null);
        } catch {
          if (!cancelled) setCourseData(null);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [courseId])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let sub = null;

      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status !== "granted") return;

          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
            (p) => {
              if (cancelled) return;
              setUserPt({ lat: p.coords.latitude, lon: p.coords.longitude });
            }
          );
        } catch {
          // ignore
        }
      })();

      return () => {
        cancelled = true;
        if (sub) sub.remove();
      };
    }, [])
  );

  const savedGpsHole = useMemo(() => {
    const gps = courseData?.gps;
    const h = gps?.holes?.[String(hole)] || null;
    return h;
  }, [courseData, hole]);

  const green = savedGpsHole?.green || null;

  const gFront = useMemo(() => normPoint(green?.front), [green?.front]);
  const gMiddle = useMemo(() => normPoint(green?.middle), [green?.middle]);
  const gBack = useMemo(() => normPoint(green?.back), [green?.back]);
  const gLeft = useMemo(() => normPoint(green?.left), [green?.left]);
  const gRight = useMemo(() => normPoint(green?.right), [green?.right]);

  const hasGreenPoints = !!(gFront || gMiddle || gBack);
  const hasLateralGreenPoints = !!(gLeft && gRight);

  const passedYardages = params?.yardages && typeof params.yardages === "object" ? params.yardages : null;

  const computedTargetYardages = useMemo(() => {
    if (!userPt) return { front: "—", middle: "—", back: "—" };

    return {
      front: gFront ? yds(haversineMeters(userPt, gFront)) : "—",
      middle: gMiddle ? yds(haversineMeters(userPt, gMiddle)) : "—",
      back: gBack ? yds(haversineMeters(userPt, gBack)) : "—",
    };
  }, [userPt, gFront, gMiddle, gBack]);

  const targetYardages = useMemo(() => {
    const pf = passedYardages?.front;
    const pm = passedYardages?.middle ?? passedYardages?.center ?? passedYardages?.pin;
    const pb = passedYardages?.back;

    const looksOk = (pf && pf !== "—") || (pm && pm !== "—") || (pb && pb !== "—");
    if (looksOk) {
      return {
        front: String(pf ?? "—"),
        middle: String(pm ?? "—"),
        back: String(pb ?? "—"),
      };
    }

    return computedTargetYardages;
  }, [passedYardages, computedTargetYardages]);

  const pinWorld = useMemo(() => {
    if (!hasGreenPoints) return null;

    const frontBackStart = gFront || gMiddle || gBack;
    const frontBackEnd = gBack || gMiddle || gFront;
    if (!frontBackStart || !frontBackEnd) return gMiddle || gFront || gBack;

    const w = Number(greenBox?.w || 0);
    const h = Number(greenBox?.h || 0);
    if (!w || !h) return gMiddle || frontBackStart;

    const t = clamp(1 - pinPx.y / h, 0, 1);
    const s = clamp((pinPx.x / w - 0.5) * 2, -1, 1);

    const fb = latLonToMetersDelta(frontBackStart, frontBackEnd);
    const fbLen = Math.hypot(fb.dNorth, fb.dEast) || 1;

    const uN = fb.dNorth / fbLen;
    const uE = fb.dEast / fbLen;

    const pN = -uE;
    const pE = uN;

    const along = t * fbLen;

    let lateralMeters = 0;

    if (hasLateralGreenPoints) {
      const lr = latLonToMetersDelta(gLeft, gRight);
      const lrWidth = Math.hypot(lr.dNorth, lr.dEast) || 0;
      lateralMeters = (lrWidth * 0.5) * s;
    } else {
      lateralMeters = 12 * s;
    }

    return offsetLatLon(
      frontBackStart,
      uN * along + pN * lateralMeters,
      uE * along + pE * lateralMeters
    );
  }, [hasGreenPoints, hasLateralGreenPoints, gFront, gMiddle, gBack, gLeft, gRight, greenBox, pinPx]);

  const pinYardage = useMemo(() => {
    if (!userPt || !pinWorld) return "—";
    return yds(haversineMeters(userPt, pinWorld));
  }, [userPt, pinWorld]);

  const selectedTargetLabel = useMemo(() => {
    if (pinMode) return "Local pin estimate";
    if (activeTarget === "front") return "Front";
    if (activeTarget === "back") return "Back";
    return "Middle";
  }, [pinMode, activeTarget]);

  const selectedTargetYardage = useMemo(() => {
    if (pinMode) return pinYardage;
    if (activeTarget === "front") return targetYardages.front;
    if (activeTarget === "back") return targetYardages.back;
    return targetYardages.middle;
  }, [pinMode, activeTarget, pinYardage, targetYardages]);

  const FLAG_W = 34;
  const FLAG_H = 48;
  const INNER_PAD_X = 42;
  const INNER_PAD_Y = 52;

  const clampPinCenter = useCallback(
    (x, y, w, h) => {
      const minX = INNER_PAD_X + FLAG_W / 2;
      const maxX = w - INNER_PAD_X - FLAG_W / 2;
      const minY = INNER_PAD_Y + FLAG_H / 2;
      const maxY = h - INNER_PAD_Y - FLAG_H / 2;

      return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
      };
    },
    [FLAG_W, FLAG_H]
  );

  const initOrClampPin = useCallback(
    (w, h) => {
      if (!w || !h) return;

      if (!didInitPin.current) {
        didInitPin.current = true;
        setPinPx(clampPinCenter(Math.round(w * 0.5), Math.round(h * 0.5), w, h));
        return;
      }

      setPinPx((p) => clampPinCenter(p.x, p.y, w, h));
    },
    [clampPinCenter]
  );

  const refreshGreenRect = useCallback(() => {
    try {
      if (!greenRef.current || !greenRef.current.measureInWindow) return;

      greenRef.current.measureInWindow((x, y, w, h) => {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return;
        greenRectRef.current = { x, y, w, h };
        hasRectRef.current = !!(w && h);
      });
    } catch {
      // ignore
    }
  }, []);

  const lockScroll = useCallback(() => {
    draggingRef.current = true;
    setScrollLocked(true);
    if (scrollRef.current && scrollRef.current.setNativeProps) {
      scrollRef.current.setNativeProps({ scrollEnabled: false });
    }
  }, []);

  const unlockScroll = useCallback(() => {
    draggingRef.current = false;
    setScrollLocked(false);
    if (scrollRef.current && scrollRef.current.setNativeProps) {
      scrollRef.current.setNativeProps({ scrollEnabled: true });
    }
  }, []);

  const updatePinFromPageXY = useCallback(
    (pageX, pageY) => {
      const rect = greenRectRef.current;
      const w = Number(greenBox?.w || 0);
      const h = Number(greenBox?.h || 0);
      if (!hasRectRef.current || !w || !h) return;

      const localX = pageX - rect.x;
      const localY = pageY - rect.y;

      if (!Number.isFinite(localX) || !Number.isFinite(localY)) return;

      setPinPx(clampPinCenter(localX, localY, w, h));
    },
    [greenBox, clampPinCenter]
  );

  const handleGrant = useCallback(
    (e) => {
      if (!hasGreenPoints) return;

      if (!pinMode) setPinMode(true);

      refreshGreenRect();
      lockScroll();

      const px = e?.nativeEvent?.pageX;
      const py = e?.nativeEvent?.pageY;
      if (Number.isFinite(px) && Number.isFinite(py)) {
        updatePinFromPageXY(px, py);
      }
    },
    [hasGreenPoints, pinMode, refreshGreenRect, lockScroll, updatePinFromPageXY]
  );

  const handleMove = useCallback(
    (e) => {
      if (!hasGreenPoints) return;

      if (!pinMode) setPinMode(true);

      if (!draggingRef.current) {
        refreshGreenRect();
        lockScroll();
      }

      const px = e?.nativeEvent?.pageX;
      const py = e?.nativeEvent?.pageY;
      if (Number.isFinite(px) && Number.isFinite(py)) {
        updatePinFromPageXY(px, py);
      }
    },
    [hasGreenPoints, pinMode, refreshGreenRect, lockScroll, updatePinFromPageXY]
  );

  function goBackToScoreEntry() {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    const isTournamentFlow = !!(params?.tournamentId || tournamentId);

    if (isTournamentFlow) {
      const TARGET = ROUTES.TOURNAMENT_SCORE_ENTRY || "TournamentScoreEntry";

      navigation.navigate(TARGET, {
        ...params,
        ...pickTournamentNavParams(params),
        tournamentId: params?.tournamentId ?? tournamentId,
        roundNumber: params?.roundNumber ?? roundNumber,
        roundId: params?.roundId ?? roundId,
        holeNumber: params?.holeNumber ?? hole,
        hole: params?.hole ?? hole,
        totalHoles: params?.totalHoles,
        groupPlayerIds: params?.groupPlayerIds,
        sideGameKey: params?.sideGameKey,
        courseId: params?.courseId ?? courseId ?? null,
        courseName: params?.courseName ?? courseName,
        teeName: params?.teeName ?? teeName,
      });
      return;
    }

    const TARGET = ROUTES.GAME_SCORE_ENTRY || "GameScoreEntry";

    navigation.navigate(TARGET, {
      ...params,
      holeNumber: params?.holeNumber ?? hole,
      hole: params?.hole ?? hole,
      courseId: params?.courseId ?? courseId ?? null,
      courseName: params?.courseName ?? courseName,
      teeName: params?.teeName ?? teeName,
    });
  }

  function setGreenPoints() {
    if (!courseId) {
      Alert.alert("Missing course", "This tournament round doesn’t have a courseId yet.");
      return;
    }

    navigation.navigate(ROUTES.HOLE_MAP, {
      ...params,
      ...pickTournamentNavParams(params),
      tournamentId,
      roundNumber,
      roundId,
      holeNumber: hole,
      hookup: "green",
      hole,
      holeIndex: hole - 1,
      courseId,
      courseName,
      teeName,
      openSetup: true,
    });
  }

  function showGreenHelp() {
    Alert.alert(
      "Green View",
      "Front, middle, and back come from saved green points. If left and right are also saved, drag estimates use that width too for a better back-left / front-right target estimate."
    );
  }

  function togglePinMode() {
    if (!hasGreenPoints) return;
    setPinMode((v) => !v);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Green View" subtitle={`Hole ${hole}`} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        scrollEnabled={!scrollLocked}
        bounces={false}
        alwaysBounceVertical={false}
        contentContainerStyle={[styles.wrap, { paddingBottom: 18 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => {
              setPinMode(false);
              setActiveTarget("front");
            }}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTarget === "front" && !pinMode && styles.topCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Front</Text>
            <Text style={styles.topValue}>{targetYardages.front}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setPinMode(false);
              setActiveTarget("middle");
            }}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTarget === "middle" && !pinMode && styles.topCardActiveGold,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Middle</Text>
            <Text style={styles.topValue}>{targetYardages.middle}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setPinMode(false);
              setActiveTarget("back");
            }}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTarget === "back" && !pinMode && styles.topCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Back</Text>
            <Text style={styles.topValue}>{targetYardages.back}</Text>
          </Pressable>
        </View>

        {!hasGreenPoints ? (
          <View style={[styles.hintCard, styles.goldBorder]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>Green points not set yet</Text>
              <Text style={styles.hintSub}>
                Set front / middle / back once. These are the trusted distances used by Green View.
              </Text>
            </View>

            <Pressable onPress={setGreenPoints} style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}>
              <Text style={styles.hintBtnT}>Set points</Text>
              <Text style={styles.hintBtnS}>→</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.playRow}>
            <View style={[styles.topCard, styles.goldBorderCard, styles.playCardMatch]}>
              <Text style={[styles.topLabel, styles.greenNotesText]}>Green</Text>
              <Text style={[styles.topLabel, styles.greenNotesText]}>Notes</Text>
            </View>

            <View
              style={[
                styles.topCard,
                styles.goldBorderCard,
                styles.topCardActiveGold,
                styles.playCardMatch,
                styles.playBoxYardage,
              ]}
            >
              <Text style={styles.topLabel}>{pinMode ? "Target" : selectedTargetLabel}</Text>
              <Text style={styles.topValue}>{selectedTargetYardage}</Text>
              <Text style={styles.playBoxUnit}>YDS</Text>
            </View>

            <Pressable
              onPress={goBackToScoreEntry}
              style={({ pressed }) => [
                styles.topCard,
                styles.goldBorderCard,
                styles.playCardMatch,
                styles.playBoxButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.topLabel, styles.returnText]}>Back to</Text>
              <Text style={[styles.topLabel, styles.returnText]}>Score Entry</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.card, styles.goldBorderBig]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Putting Surface</Text>
            <Pressable onPress={showGreenHelp} style={({ pressed }) => [styles.infoIconBtn, pressed && styles.pressed]}>
              <Text style={styles.infoIcon}>ⓘ</Text>
            </Pressable>
          </View>

          <View style={styles.greenStage}>
            <View
              ref={greenRef}
              style={styles.greenBox}
              onLayout={(e) => {
                const w = e?.nativeEvent?.layout?.width || 0;
                const h = e?.nativeEvent?.layout?.height || 0;
                if (!w || !h) return;

                setGreenBox({ w, h });
                initOrClampPin(w, h);

                requestAnimationFrame(() => refreshGreenRect());
              }}
              onStartShouldSetResponderCapture={() => hasGreenPoints}
              onMoveShouldSetResponderCapture={() => hasGreenPoints}
              onResponderGrant={handleGrant}
              onResponderMove={handleMove}
              onResponderRelease={unlockScroll}
              onResponderTerminate={unlockScroll}
              onResponderTerminationRequest={() => false}
              onTouchEnd={unlockScroll}
              onTouchCancel={unlockScroll}
            >
              <Image source={GreenShape} style={styles.greenImage} resizeMode="cover" pointerEvents="none" />

              <View style={styles.greenGuideOverlay} pointerEvents="none">
                <View style={styles.greenBandTop} />
                <View style={styles.greenBandMid} />
                <View style={styles.greenBandBot} />
              </View>

              <View
                style={[
                  styles.flagWrap,
                  {
                    width: FLAG_W,
                    height: FLAG_H,
                    left: pinPx.x - FLAG_W / 2,
                    top: pinPx.y - FLAG_H / 2,
                    opacity: pinMode ? 1 : 0.55,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.flagShadow} />
                <Text style={styles.flagIcon}>⛳</Text>
              </View>

              <View style={styles.pinHintBadge} pointerEvents="none">
                <Text style={styles.pinHintBadgeText}>Drag the flag to estimate yardage to your target</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footerMeta}>
          {courseName} • {teeName}
        </Text>
      </ScrollView>
    </View>
  );
}

const GOLD = "rgba(242,201,76,0.85)";
const GOLD_SOFT = "rgba(242,201,76,0.60)";
const GREEN_BOX_BG = "#0E1A14";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  scroll: { flex: 1 },
  wrap: { padding: 16, gap: 12 },

  topRow: { flexDirection: "row", gap: 8 },
  topCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.040)",
    alignItems: "center",
    justifyContent: "center",
  },
  goldBorderCard: { borderWidth: 2, borderColor: GOLD_SOFT },
  topCardActive: {
    borderColor: GOLD,
    borderWidth: 2.5,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  topCardActiveGold: {
    borderColor: GOLD,
    borderWidth: 3,
    backgroundColor: "rgba(242,201,76,0.14)",
  },
  topLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "900" },
  topValue: { marginTop: 8, color: "#fff", fontSize: 18, fontWeight: "900" },

  goldBorder: { borderWidth: 2, borderColor: GOLD_SOFT },
  goldBorderBig: { borderWidth: 3, borderColor: GOLD },

  hintCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(46,125,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hintTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  hintSub: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 16 },
  hintBtn: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  hintBtnT: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
  hintBtnS: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 14 },

  playRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "stretch",
  },
  playCardMatch: {
    minHeight: 74,
    paddingVertical: 8,
  },
  playBoxYardage: {
    backgroundColor: "rgba(242,201,76,0.10)",
  },
  playBoxButton: {
    alignItems: "center",
  },
  playBoxUnit: {
    marginTop: 2,
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  greenNotesText: {
    color: "#2ECC71",
  },
  returnText: {
    color: "#FF6B3D",
  },

  card: { borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.04)" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cardBody: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "800", lineHeight: 18 },

  infoIconBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIcon: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 16 },

  greenStage: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#0B1411",
    padding: 0,
  },
  greenBox: {
    height: 440,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: GREEN_BOX_BG,
    position: "relative",
  },
  greenImage: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    opacity: 0.98,
    backgroundColor: GREEN_BOX_BG,
  },

  greenGuideOverlay: {
    position: "absolute",
    left: 42,
    right: 42,
    top: 52,
    bottom: 52,
    borderRadius: 140,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
  },
  greenBandTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "33.333%",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  greenBandMid: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "33.333%",
    height: "33.333%",
    backgroundColor: "rgba(255,255,255,0.01)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  greenBandBot: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "33.333%",
    backgroundColor: "rgba(255,255,255,0.02)",
  },

  flagWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  flagShadow: {
    position: "absolute",
    bottom: 6,
    width: 16,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  flagIcon: { fontSize: 26, lineHeight: 28 },

  pinHintBadge: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 38,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(11,18,32,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinHintBadgeText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  primaryBtn: {
    marginTop: 4,
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: "rgba(242,201,76,0.16)",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  footerMeta: {
    textAlign: "center",
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});