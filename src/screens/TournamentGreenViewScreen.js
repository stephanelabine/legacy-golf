// src/screens/TournamentGreenViewScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
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

  const [selectedPin, setSelectedPin] = useState("middle"); // front | middle | back
  const [courseData, setCourseData] = useState(null);
  const [userPt, setUserPt] = useState(null);

  const greenInfo = useMemo(() => {
    return (
      params?.greenInfo ||
      "Front pin • Slight back-to-front slope • Safer miss: short-left"
    );
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

  const computedYardages = useMemo(() => {
    if (!userPt) return { front: "—", middle: "—", back: "—" };

    const out = { front: "—", middle: "—", back: "—" };
    if (gFront) out.front = yds(haversineMeters(userPt, gFront));
    if (gMiddle) out.middle = yds(haversineMeters(userPt, gMiddle));
    if (gBack) out.back = yds(haversineMeters(userPt, gBack));
    return out;
  }, [userPt, gFront, gMiddle, gBack]);

  const yardages = useMemo(() => {
    const pf = passedYardages?.front;
    const pm = passedYardages?.middle;
    const pb = passedYardages?.back;

    const looksOk = (pf && pf !== "—") || (pm && pm !== "—") || (pb && pb !== "—");

    if (looksOk) {
      return {
        front: String(pf ?? "—"),
        middle: String(pm ?? "—"),
        back: String(pb ?? "—"),
      };
    }

    return computedYardages;
  }, [passedYardages, computedYardages]);

  const toPin = useMemo(() => {
    if (selectedPin === "front") return yardages.front;
    if (selectedPin === "back") return yardages.back;
    return yardages.middle;
  }, [selectedPin, yardages]);

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

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Green View" subtitle={`Hole ${hole}`} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.wrap, { paddingBottom: 18 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.topRow}>
          <Pressable
            onPress={() => setSelectedPin("front")}
            style={({ pressed }) => [
              styles.pinCard,
              selectedPin === "front" && styles.pinCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.pinLabel}>Front</Text>
            <Text style={styles.pinValue}>{yardages.front}</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedPin("middle")}
            style={({ pressed }) => [
              styles.pinCard,
              selectedPin === "middle" && styles.pinCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.pinLabel}>Middle</Text>
            <Text style={styles.pinValue}>{yardages.middle}</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedPin("back")}
            style={({ pressed }) => [
              styles.pinCard,
              selectedPin === "back" && styles.pinCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.pinLabel}>Back</Text>
            <Text style={styles.pinValue}>{yardages.back}</Text>
          </Pressable>
        </View>

        {!hasGreenPoints ? (
          <View style={styles.hintCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>Green points not set yet</Text>
              <Text style={styles.hintSub}>
                Set front / middle / back once. Then Green View shows real numbers every
                round.
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
          <View style={styles.miniBar}>
            <View style={styles.miniRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.miniText}>To {selectedPin} pin: {toPin} yds</Text>
                <Text style={styles.miniSub}>Tap Front / Middle / Back to change pin target</Text>
              </View>

              <Pressable
                onPress={setGreenPoints}
                style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed]}
              >
                <Text style={styles.hintBtnT}>Edit points</Text>
                <Text style={styles.hintBtnS}>→</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Putting Surface</Text>
          <Text style={styles.heroSub}>
            Visual preview placeholder (next: pin position + green points visualization)
          </Text>

          <View style={styles.greenStage}>
            <View style={styles.greenShape}>
              <View style={styles.pinDot} />
              <View style={styles.slopeArrow} />
              <Text style={styles.slopeText}>slope</Text>
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={styles.legendDot} />
                <Text style={styles.legendText}>Pin</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendLine} />
                <Text style={styles.legendText}>Slope direction</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Green notes</Text>
          <Text style={styles.cardBody}>{greenInfo}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Aim point</Text>
          <Text style={styles.cardBody}>
            Default: play to center-green. Later we’ll use hazards + wind + misses.
          </Text>
        </View>

        <Pressable
          onPress={goBackToScoreEntry}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Text style={styles.backBtnText}>Back to Score Entry</Text>
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
  pinCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinCardActive: { borderColor: "rgba(242,201,76,0.55)" },
  pinLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "900" },
  pinValue: { marginTop: 8, color: "#fff", fontSize: 18, fontWeight: "900" },

  miniBar: {
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  miniText: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "900" },
  miniSub: { marginTop: 4, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

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

  heroCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  heroSub: {
    marginTop: 6,
    color: "rgba(255,255,255,0.66)",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },

  greenStage: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 14,
  },
  greenShape: {
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(46, 204, 113, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.40)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.25)",
    position: "absolute",
    top: 58,
    left: "52%",
  },
  slopeArrow: {
    width: 90,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.70)",
    transform: [{ rotate: "-18deg" }],
  },
  slopeText: {
    position: "absolute",
    marginTop: 26,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  legendRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#fff" },
  legendLine: { width: 18, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.70)" },
  legendText: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cardBody: {
    marginTop: 8,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },

  backBtn: {
    marginTop: 8,
    borderRadius: 999,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.55)",
    backgroundColor: "rgba(242,201,76,0.16)",
  },
  backBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  footerMeta: {
    textAlign: "center",
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
