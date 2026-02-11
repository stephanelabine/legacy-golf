// src/screens/TournamentGreenViewScreen.js
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  PanResponder,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

import theme from "../theme";
import ScreenHeader from "../components/ScreenHeader";
import ROUTES from "../navigation/routes";
import { loadCourseData } from "../storage/courseData";
import { pickTournamentNavParams } from "../utils/tournamentNav";

// Put your PNG here: src/assets/greens/GreenShape1.png
import GreenShape1 from "../assets/greens/GreenShape1.png";

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

  const [scrollEnabled, setScrollEnabled] = useState(true);

  // UI highlight only (does NOT move the pin)
  const [activeTab, setActiveTab] = useState("pin"); // front | pin | back

  // green layout + pin position in pixels (local only)
  const [greenBox, setGreenBox] = useState({ w: 0, h: 0 });
  const [pinPx, setPinPx] = useState({ x: 0, y: 0 });
  const didInitPin = useRef(false);

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

  const passedYardages =
    params?.yardages && typeof params.yardages === "object" ? params.yardages : null;

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

  // pin world point from green edge points + local pixel position (simple A->B axis + lateral)
  const pinWorld = useMemo(() => {
    if (!hasGreenPoints) return null;

    const A = gFront || gMiddle || gBack;
    const B = gBack || gMiddle || gFront;
    if (!A || !B) return gMiddle || gFront || gBack;

    const w = Number(greenBox?.w || 0);
    const h = Number(greenBox?.h || 0);
    if (!w || !h) return gMiddle || A;

    const t = clamp(pinPx.y / h, 0, 1);
    const s = clamp((pinPx.x / w - 0.5) * 2, -1, 1); // -1..1 lateral

    const d = latLonToMetersDelta(A, B);
    const len = Math.hypot(d.dNorth, d.dEast) || 1;

    const uN = d.dNorth / len;
    const uE = d.dEast / len;

    const pN = -uE;
    const pE = uN;

    const along = t * len;
    const lateralMeters = 10 * s; // +/- ~10m across green

    const north = uN * along + pN * lateralMeters;
    const east = uE * along + pE * lateralMeters;

    return offsetLatLon(A, north, east);
  }, [hasGreenPoints, gFront, gMiddle, gBack, greenBox, pinPx]);

  const pinYardage = useMemo(() => {
    if (!userPt || !pinWorld) return "—";
    return yds(haversineMeters(userPt, pinWorld));
  }, [userPt, pinWorld]);

  const initOrClampPin = useCallback((w, h) => {
    if (!w || !h) return;

    // padding so the flag never gets clipped
    const PAD_X = 22;
    const PAD_Y = 34;

    if (!didInitPin.current) {
      didInitPin.current = true;
      setPinPx({
        x: Math.round(w * 0.5),
        y: Math.round(h * 0.5),
      });
      return;
    }

    setPinPx((p) => ({
      x: clamp(p.x, PAD_X, w - PAD_X),
      y: clamp(p.y, PAD_Y, h - PAD_Y),
    }));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => hasGreenPoints,
      onMoveShouldSetPanResponder: (_, g) =>
        hasGreenPoints && (Math.abs(g.dx) > 1 || Math.abs(g.dy) > 1),

      onStartShouldSetPanResponderCapture: () => hasGreenPoints,
      onMoveShouldSetPanResponderCapture: () => hasGreenPoints,

      onPanResponderGrant: (evt) => {
        if (!hasGreenPoints) return;

        setScrollEnabled(false);
        setActiveTab("pin");

        const w = Number(greenBox?.w || 0);
        const h = Number(greenBox?.h || 0);
        if (!w || !h) return;

        const PAD_X = 22;
        const PAD_Y = 34;

        const x = clamp(evt.nativeEvent.locationX, PAD_X, w - PAD_X);
        const y = clamp(evt.nativeEvent.locationY, PAD_Y, h - PAD_Y);
        setPinPx({ x, y });
      },

      onPanResponderMove: (evt) => {
        if (!hasGreenPoints) return;

        const w = Number(greenBox?.w || 0);
        const h = Number(greenBox?.h || 0);
        if (!w || !h) return;

        const PAD_X = 22;
        const PAD_Y = 34;

        const x = clamp(evt.nativeEvent.locationX, PAD_X, w - PAD_X);
        const y = clamp(evt.nativeEvent.locationY, PAD_Y, h - PAD_Y);
        setPinPx({ x, y });
      },

      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => setScrollEnabled(true),
      onPanResponderTerminate: () => setScrollEnabled(true),
    })
  ).current;

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
      "Drag the flag on the green to set your own pin distance (local only). Front/Back are from saved green edge points."
    );
  }

  // flag sizing + safe positioning (prevents clipping)
  const FLAG_W = 32;
  const FLAG_H = 46;

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Green View" subtitle={`Hole ${hole}`} />

      <ScrollView
        style={styles.scroll}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={[styles.wrap, { paddingBottom: 18 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            onPress={() => setActiveTab("front")}
            style={({ pressed }) => [
              styles.topCard,
              activeTab === "front" && styles.topCardActiveSoft,
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
              activeTab === "back" && styles.topCardActiveSoft,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.topLabel}>Back</Text>
            <Text style={styles.topValue}>{edgeYardages.back}</Text>
          </Pressable>
        </View>

        {!hasGreenPoints ? (
          <View style={styles.hintCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>Green points not set yet</Text>
              <Text style={styles.hintSub}>
                Set front / middle / back once. Then you can drag the pin for your own yardage.
              </Text>
            </View>

            <Pressable
              onPress={setGreenPoints}
              style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}
            >
              <Text style={styles.hintBtnT}>Set points</Text>
              <Text style={styles.hintBtnS}>→</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.infoTitle}>Pin distance is adjustable</Text>
                <Text style={styles.infoSub}>Drag inside the green. Page won’t scroll while dragging.</Text>
              </View>

              <Pressable
                onPress={setGreenPoints}
                style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
              >
                <Text style={styles.smallBtnT}>Edit points</Text>
                <Text style={styles.smallBtnS}>→</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Putting Surface</Text>
            <Pressable
              onPress={showGreenHelp}
              style={({ pressed }) => [styles.infoIconBtn, pressed && styles.pressed]}
            >
              <Text style={styles.infoIcon}>ⓘ</Text>
            </Pressable>
          </View>

          <View style={styles.greenStage}>
            <View
              style={styles.greenBox}
              onLayout={(e) => {
                const w = e?.nativeEvent?.layout?.width || 0;
                const h = e?.nativeEvent?.layout?.height || 0;
                if (!w || !h) return;

                setGreenBox({ w, h });
                initOrClampPin(w, h);
              }}
              {...panResponder.panHandlers}
            >
              {/* Use your PNG as the green shape */}
              <Image
                source={GreenShape1}
                style={styles.greenImage}
                resizeMode="contain"
                pointerEvents="none"
              />

              <Text style={styles.edgeLabelTop} pointerEvents="none">
                BACK
              </Text>
              <Text style={styles.edgeLabelBot} pointerEvents="none">
                FRONT
              </Text>

              {/* flag */}
              <View
                style={[
                  styles.flagWrap,
                  {
                    width: FLAG_W,
                    height: FLAG_H,
                    left: clamp(pinPx.x - FLAG_W / 2, 0, Math.max(0, greenBox.w - FLAG_W)),
                    top: clamp(pinPx.y - FLAG_H * 0.78, 0, Math.max(0, greenBox.h - FLAG_H)),
                  },
                ]}
                pointerEvents="none"
              >
                <View style={styles.flagShadow} />
                <Text style={styles.flagIcon}>⛳</Text>
              </View>
            </View>

            <View style={styles.pinReadoutRow}>
              <Text style={styles.pinReadoutText}>Pin: {pinYardage} yds</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Green notes</Text>
          <Text style={styles.cardBody}>{greenInfo}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aim point</Text>
          <Text style={styles.cardBody}>Default: play to center-green.</Text>
        </View>

        <Pressable
          onPress={goBackToScoreEntry}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryBtnText}>Back to Score Entry</Text>
        </Pressable>

        <Text style={styles.footerMeta}>
          {courseName} • {teeName}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  scroll: { flex: 1 },
  wrap: { padding: 16, gap: 12 },

  topRow: { flexDirection: "row", gap: 10 },
  topCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.040)",
    alignItems: "center",
    justifyContent: "center",
  },
  topCardActiveSoft: {
    borderColor: "rgba(255,255,255,0.30)",
    backgroundColor: "rgba(255,255,255,0.065)",
  },
  topCardActiveGold: {
    borderColor: "rgba(242,201,76,0.75)",
    backgroundColor: "rgba(242,201,76,0.14)",
  },
  topLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "900" },
  topValue: { marginTop: 8, color: "#fff", fontSize: 18, fontWeight: "900" },

  hintCard: {
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(46,125,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.26)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hintTitle: { color: "#fff", fontWeight: "900", fontSize: 13 },
  hintSub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.70)",
    fontWeight: "800",
    fontSize: 12,
    lineHeight: 16,
  },
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

  infoCard: {
    borderRadius: 22,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
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

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cardBody: {
    marginTop: 8,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },

  infoIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoIcon: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 16 },

  greenStage: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 12,
  },
  greenBox: {
    height: 320,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.14)",
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
    opacity: 0.95,
  },

  edgeLabelTop: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  edgeLabelBot: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  flagWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  flagShadow: {
    position: "absolute",
    bottom: 6,
    width: 16,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  flagIcon: { fontSize: 26, lineHeight: 28 },

  pinReadoutRow: { marginTop: 12, alignItems: "center" },
  pinReadoutText: {
    color: "rgba(255,255,255,0.85)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },

  primaryBtn: {
    marginTop: 4,
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.55)",
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
