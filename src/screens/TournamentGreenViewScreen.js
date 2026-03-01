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

  const [activeTab, setActiveTab] = useState("pin"); // front | pin | back

  const [greenBox, setGreenBox] = useState({ w: 0, h: 0 });
  const [pinPx, setPinPx] = useState({ x: 0, y: 0 });
  const didInitPin = useRef(false);

  const scrollRef = useRef(null);
  const greenRef = useRef(null);

  const draggingRef = useRef(false);
  const [scrollLocked, setScrollLocked] = useState(false);

  // absolute rect of greenBox (window coordinates)
  const greenRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const hasRectRef = useRef(false);

  const GreenShape = useMemo(() => require("../../assets/GreenShape3.png"), []);

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

  const hasGreenPoints = !!(gFront || gMiddle || gBack);

  const passedYardages = params?.yardages && typeof params.yardages === "object" ? params.yardages : null;

  const computedEdgeYardages = useMemo(() => {
    if (!userPt) return { front: "—", back: "—" };
    const out = { front: "—", back: "—" };
    if (gFront) out.front = yds(haversineMeters(userPt, gFront));
    if (gBack) out.back = yds(haversineMeters(userPt, gBack));
    return out;
  }, [userPt, gFront, gBack]);

  const edgeYardages = useMemo(() => {
    const pf = passedYardages?.front;
    const pb = passedYardages?.back;

    const looksOk = (pf && pf !== "—") || (pb && pb !== "—");
    if (looksOk) return { front: String(pf ?? "—"), back: String(pb ?? "—") };
    return computedEdgeYardages;
  }, [passedYardages, computedEdgeYardages]);

  const pinWorld = useMemo(() => {
    if (!hasGreenPoints) return null;

    const A = gFront || gMiddle || gBack;
    const B = gBack || gMiddle || gFront;
    if (!A || !B) return gMiddle || gFront || gBack;

    const w = Number(greenBox?.w || 0);
    const h = Number(greenBox?.h || 0);
    if (!w || !h) return gMiddle || A;

    // Invert Y so dragging UP increases yardage (back of green)
    const t = clamp(1 - pinPx.y / h, 0, 1);
    const s = clamp((pinPx.x / w - 0.5) * 2, -1, 1);

    const d = latLonToMetersDelta(A, B);
    const len = Math.hypot(d.dNorth, d.dEast) || 1;

    const uN = d.dNorth / len;
    const uE = d.dEast / len;

    const pN = -uE;
    const pE = uN;

    const along = t * len;
    const lateralMeters = 10 * s;

    const north = uN * along + pN * lateralMeters;
    const east = uE * along + pE * lateralMeters;

    return offsetLatLon(A, north, east);
  }, [hasGreenPoints, gFront, gMiddle, gBack, greenBox, pinPx]);

  const pinYardage = useMemo(() => {
    if (!userPt || !pinWorld) return "—";
    return yds(haversineMeters(userPt, pinWorld));
  }, [userPt, pinWorld]);

  // Pin icon sizing + clamping
  const FLAG_W = 34;
  const FLAG_H = 48;
  const INNER_PAD = 14;

  const clampPinCenter = useCallback(
    (x, y, w, h) => {
      const minX = INNER_PAD + FLAG_W / 2;
      const maxX = w - INNER_PAD - FLAG_W / 2;
      const minY = INNER_PAD + FLAG_H / 2;
      const maxY = h - INNER_PAD - FLAG_H / 2;

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

      refreshGreenRect();
      lockScroll();
      setActiveTab("pin");

      const px = e?.nativeEvent?.pageX;
      const py = e?.nativeEvent?.pageY;
      if (Number.isFinite(px) && Number.isFinite(py)) {
        updatePinFromPageXY(px, py);
      }
    },
    [hasGreenPoints, refreshGreenRect, lockScroll, updatePinFromPageXY]
  );

  const handleMove = useCallback(
    (e) => {
      if (!hasGreenPoints) return;

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
    [hasGreenPoints, refreshGreenRect, lockScroll, updatePinFromPageXY]
  );

  function goBackToScoreEntry() {
    const TARGET = ROUTES.TOURNAMENT_SCORE_ENTRY || "TournamentScoreEntry";
    navigation.navigate(TARGET, {
      ...pickTournamentNavParams(params),
      tournamentId,
      roundNumber,
      roundId,
      holeNumber: hole,
      hole,
      courseId: courseId || null,
      courseName,
      teeName,
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
      "Putting Surface",
      "Tap or drag the flag on the green to set your pin distance (local only). Front/Back are from saved green edge points."
    );
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
            onPress={() => setActiveTab("front")}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTab === "front" && styles.topCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Front</Text>
            <Text style={styles.topValue}>{edgeYardages.front}</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("pin")}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTab === "pin" && styles.topCardActiveGold,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Pin</Text>
            <Text style={styles.topValue}>{pinYardage}</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("back")}
            style={({ pressed }) => [
              styles.topCard,
              styles.goldBorderCard,
              activeTab === "back" && styles.topCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Back</Text>
            <Text style={styles.topValue}>{edgeYardages.back}</Text>
          </Pressable>
        </View>

        {!hasGreenPoints ? (
          <View style={[styles.hintCard, styles.goldBorder]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>Green points not set yet</Text>
              <Text style={styles.hintSub}>
                Set front / middle / back once. Then you can tap/drag the pin for your own yardage.
              </Text>
            </View>

            <Pressable onPress={setGreenPoints} style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}>
              <Text style={styles.hintBtnT}>Set points</Text>
              <Text style={styles.hintBtnS}>→</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.infoCard, styles.goldBorder]}>
            <View style={styles.infoRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.infoTitle}>Pin distance is adjustable</Text>
                <Text style={styles.infoSub}>Tap or drag inside the green. Page won’t scroll while your finger is down.</Text>
              </View>

              <Pressable onPress={setGreenPoints} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
                <Text style={styles.smallBtnT}>Edit points</Text>
                <Text style={styles.smallBtnS}>→</Text>
              </Pressable>
            </View>
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
              {/* MATCH the “bar” color to the greenBox background so it looks intentional */}
              <Image source={GreenShape} style={styles.greenImage} resizeMode="cover" pointerEvents="none" />

              <View
                style={[
                  styles.flagWrap,
                  {
                    width: FLAG_W,
                    height: FLAG_H,
                    left: pinPx.x - FLAG_W / 2,
                    top: pinPx.y - FLAG_H / 2,
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.flagShadow} />
                <Text style={styles.flagIcon}>⛳</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.goldBorder]}>
          <Text style={styles.cardTitle}>Green notes</Text>
          <Text style={styles.cardBody}>{greenInfo}</Text>
        </View>

        <Pressable onPress={goBackToScoreEntry} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryBtnText}>Back to Score Entry</Text>
        </Pressable>

        <Text style={styles.footerMeta}>
          {courseName} • {teeName}
        </Text>
      </ScrollView>
    </View>
  );
}

const GOLD = "rgba(242,201,76,0.85)";
const GOLD_SOFT = "rgba(242,201,76,0.60)";

// Use SAME dark as greenBox for any “letterbox” area
const GREEN_BOX_BG = "#0E1A14";

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  scroll: { flex: 1 },
  wrap: { padding: 16, gap: 12 },

  topRow: { flexDirection: "row", gap: 10 },
  topCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
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

  infoCard: { borderRadius: 22, padding: 12, backgroundColor: "rgba(255,255,255,0.04)" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  infoTitle: { color: "rgba(255,255,255,0.90)", fontSize: 13, fontWeight: "900" },
  infoSub: { marginTop: 4, color: "rgba(255,255,255,0.68)", fontWeight: "800", fontSize: 12 },

  smallBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  smallBtnT: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
  smallBtnS: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 14 },

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
    backgroundColor: GREEN_BOX_BG, // fills letterbox area same as box
  },

  flagWrap: { position: "absolute", alignItems: "center", justifyContent: "center" },
  flagShadow: { position: "absolute", bottom: 6, width: 16, height: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.32)" },
  flagIcon: { fontSize: 26, lineHeight: 28 },

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

  footerMeta: { textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: "800", marginTop: 2 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});