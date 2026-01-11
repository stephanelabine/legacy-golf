// src/screens/GpsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MapView from "react-native-maps";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { loadActiveRound } from "../storage/roundState";
import { loadCourseData } from "../storage/courseData";
import { haversineKm } from "../utils/distance";

const FALLBACK_CENTER = { lat: 49.1044, lng: -122.6609 };

function kmToYards(km) {
  const n = Number(km);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1093.6133);
}

function findHoleMeta(holeMeta, hole) {
  if (!holeMeta) return null;

  // array[0..17]
  if (Array.isArray(holeMeta)) return holeMeta[hole - 1] || null;

  // object keyed by number or string
  if (typeof holeMeta === "object") {
    return holeMeta[hole] || holeMeta[String(hole)] || holeMeta[hole - 1] || null;
  }

  return null;
}

function findGreenPoints(saved, hole) {
  if (!saved || typeof saved !== "object") return null;

  // Try a few likely shapes
  const candidates = [
    saved?.greens?.[hole],
    saved?.greens?.[String(hole)],
    saved?.greenPoints?.[hole],
    saved?.greenPoints?.[String(hole)],
    saved?.holeMeta?.greens?.[hole],
    saved?.holeMeta?.greens?.[String(hole)],
  ];

  for (const g of candidates) {
    if (g && typeof g === "object") {
      // expected: { front:{lat,lng}, middle:{lat,lng}, back:{lat,lng} }
      if (g.front && g.middle && g.back) return g;

      // sometimes: { f:{lat,lng}, m:{lat,lng}, b:{lat,lng} }
      if (g.f && g.m && g.b) return { front: g.f, middle: g.m, back: g.b };

      // sometimes: { center:{lat,lng} } -> use same for all
      if (g.center) return { front: g.center, middle: g.center, back: g.center };
    }
  }

  // Sometimes stored directly on a hole meta record
  const hm = findHoleMeta(saved?.holeMeta, hole);
  if (hm && typeof hm === "object") {
    const front = hm?.front || hm?.greenFront || hm?.green_front;
    const middle = hm?.middle || hm?.greenMiddle || hm?.green_middle || hm?.center || hm?.greenCenter;
    const back = hm?.back || hm?.greenBack || hm?.green_back;

    const asPoint = (p) => {
      if (!p) return null;
      const lat = Number(p.lat ?? p.latitude);
      const lng = Number(p.lng ?? p.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };

    const f = asPoint(front);
    const m = asPoint(middle);
    const b = asPoint(back);

    if (f && m && b) return { front: f, middle: m, back: b };
    if (m && !f && !b) return { front: m, middle: m, back: m };
  }

  return null;
}

export default function GPSScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const initialHole = typeof route?.params?.hole === "number" ? route.params.hole : 1;
  const [hole, setHole] = useState(Math.min(18, Math.max(1, Math.round(initialHole))));
  const [isSatellite, setIsSatellite] = useState(false);

  const [userPos, setUserPos] = useState(null);
  const [savedCourse, setSavedCourse] = useState(null);
  const [activeRound, setActiveRound] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ar = await loadActiveRound();
      if (!alive) return;
      setActiveRound(ar || null);

      const courseId = ar?.course?.id || route?.params?.course?.id || "";
      if (courseId) {
        const saved = await loadCourseData(courseId);
        if (!alive) return;
        setSavedCourse(saved || null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let sub = null;
    let alive = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status !== "granted") return;

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 3 },
          (pos) => {
            setUserPos({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          }
        );
      } catch {
        // ignore
      }
    })();

    return () => {
      alive = false;
      try {
        sub?.remove?.();
      } catch {}
    };
  }, []);

  const holeMeta = savedCourse?.holeMeta || null;
  const hm = useMemo(() => findHoleMeta(holeMeta, hole), [holeMeta, hole]);

  const par = Number(hm?.par ?? route?.params?.par ?? 4);
  const si = Number(hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? route?.params?.si ?? 10);

  const green = useMemo(() => findGreenPoints(savedCourse, hole), [savedCourse, hole]);

  const yardages = useMemo(() => {
    // If we have user location + green points -> compute live
    if (userPos && green?.front && green?.middle && green?.back) {
      const frontY = kmToYards(haversineKm(userPos, green.front));
      const midY = kmToYards(haversineKm(userPos, green.middle));
      const backY = kmToYards(haversineKm(userPos, green.back));
      return {
        front: frontY ?? "—",
        middle: midY ?? "—",
        back: backY ?? "—",
      };
    }

    // fallback to any route-provided yardages if they exist
    const y = route?.params?.yardages;
    if (y && typeof y === "object") {
      return {
        front: y.front ?? "—",
        middle: y.middle ?? "—",
        back: y.back ?? "—",
      };
    }

    // final fallback (neutral placeholders)
    return { front: "—", middle: "—", back: "—" };
  }, [userPos, green, route?.params?.yardages]);

  const region = useMemo(() => {
    const lng =
      typeof route?.params?.centerLng === "number"
        ? route.params.centerLng
        : activeRound?.course?.lng ?? FALLBACK_CENTER.lng;

    const lat =
      typeof route?.params?.centerLat === "number"
        ? route.params.centerLat
        : activeRound?.course?.lat ?? FALLBACK_CENTER.lat;

    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [route?.params?.centerLng, route?.params?.centerLat, activeRound?.course?.lat, activeRound?.course?.lng]);

  const goPrev = () => setHole((h) => Math.max(1, h - 1));
  const goNext = () => setHole((h) => Math.min(18, h + 1));

  function openScore() {
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      ...(route?.params || {}),
      hole,
      par,
      si,
    });
  }

  const right = (
    <Pressable
      onPress={() => setIsSatellite((s) => !s)}
      hitSlop={12}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Text style={styles.headerActionText}>{isSatellite ? "Map" : "Sat"}</Text>
    </Pressable>
  );

  const greenLoaded = !!(green?.front && green?.middle && green?.back);

  return (
    <View style={styles.root}>
      <MapView
        style={styles.map}
        initialRegion={region}
        mapType={isSatellite ? "satellite" : "standard"}
        showsUserLocation
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
      />

      <View pointerEvents="box-none" style={styles.overlay}>
        <ScreenHeader
          navigation={navigation}
          title={`Hole ${hole}`}
          subtitle={`Par ${Number.isFinite(par) ? par : 4} • SI ${Number.isFinite(si) ? si : 10}${greenLoaded ? "" : " • No green points loaded"}`}
          right={right}
        />

        {/* Right yardage capsule */}
        <View pointerEvents="none" style={[styles.yardWrap, { top: insets.top + 92 }]}>
          <BlurView intensity={28} tint="dark" style={styles.yardBlur}>
            <View style={styles.yardTint} />
            <View style={styles.yardInner}>
              {[
                ["FRONT", yardages.front],
                ["MID", yardages.middle],
                ["BACK", yardages.back],
              ].map(([label, val]) => (
                <View key={label} style={styles.yBubble}>
                  <Text style={styles.yLabel}>{label}</Text>
                  <Text style={styles.yValue}>{val}</Text>
                  <Text style={styles.yUnit}>yd</Text>
                </View>
              ))}
            </View>
          </BlurView>
        </View>

        {/* Bottom dock */}
        <View style={[styles.dockWrap, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <BlurView intensity={32} tint="dark" style={styles.dockBlur}>
            <View style={styles.dockTint} />

            <View style={styles.dockRow}>
              <Pressable onPress={goPrev} style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}>
                <Text style={styles.squareIcon}>‹</Text>
              </Pressable>

              <Pressable onPress={openScore} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                <Text style={styles.primaryTitle}>GPS ACTIVE</Text>
                <Text style={styles.primarySub}>Tap to enter score • Hole {hole}</Text>
              </Pressable>

              <Pressable onPress={goNext} style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}>
                <Text style={styles.squareIcon}>›</Text>
              </Pressable>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },

  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, elevation: 999 },

  headerAction: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  headerActionText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  yardWrap: { position: "absolute", right: 14, zIndex: 999, elevation: 999 },
  yardBlur: {
    width: 104,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  yardTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 18, 22, 0.38)" },
  yardInner: { padding: 10, gap: 8 },

  yBubble: {
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  yLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  yValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 4 },
  yUnit: { color: "rgba(255,255,255,0.60)", fontSize: 10, fontWeight: "900", marginTop: 2 },

  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    zIndex: 999,
    elevation: 999,
  },
  dockBlur: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dockTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 18, 22, 0.38)" },
  dockRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },

  squareBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  squareIcon: { color: "#fff", fontSize: 28, lineHeight: 28, marginTop: -1 },

  primaryBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  primarySub: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 2, letterSpacing: 0.2, fontWeight: "800" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
