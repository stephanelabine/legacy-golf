import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "../components/ScreenHeader";
import { loadCourseData } from "../storage/courseData";
import * as RoundState from "../storage/roundState";

const BG = "#0B1220";
const WHITE = "#FFFFFF";
const MUTED = "rgba(255,255,255,0.68)";
const BORDER = "rgba(255,255,255,0.14)";
const CARD = "rgba(10,16,28,0.82)";

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineMeters(a, b) {
  if (!a || !b) return NaN;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) return NaN;
  if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return NaN;

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

function safeTrim(v) {
  return String(v ?? "").trim();
}

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
}

function pickCourseIdAny(stateOrParams) {
  if (!stateOrParams || typeof stateOrParams !== "object") return null;
  const c = stateOrParams?.course;
  const cid =
    stateOrParams?.courseId ??
    c?.id ??
    c?.courseId ??
    (typeof c === "string" ? c : null) ??
    null;
  return cid ? String(cid) : null;
}

function pickCourseNameAny(stateOrParams, fallback = "Course") {
  if (!stateOrParams || typeof stateOrParams !== "object") return fallback;
  const c = stateOrParams?.course;
  const name =
    stateOrParams?.courseName ??
    c?.name ??
    c?.courseName ??
    (typeof c === "string" ? c : null) ??
    null;
  return String(name || fallback);
}

function pickCourseCenterAny(stateOrParams) {
  if (!stateOrParams || typeof stateOrParams !== "object") return null;
  const c = stateOrParams?.course;
  return stateOrParams?.courseCenter ?? c?.center ?? c?.courseCenter ?? null;
}

function asPoint(p) {
  if (!p) return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  return { lat: p.lat, lon: p.lon };
}

function hazardLabel(type) {
  const raw = safeTrim(type).toLowerCase();
  if (raw === "ob") return "OB";
  if (raw === "water") return "Water";
  if (raw === "bunker") return "Bunker";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Hazard";
}

function buildNumberedHazards(arr, user, holeNumber) {
  const raw = [];

  (Array.isArray(arr) ? arr : []).forEach((h) => {
    const point = asPoint(h);
    if (!point) return;

    const typeKey = safeTrim(h?.type || "hazard").toLowerCase() || "hazard";
    const meters = user ? haversineMeters(user, point) : NaN;

    raw.push({
      typeKey,
      typeLabel: hazardLabel(typeKey),
      lat: point.lat,
      lon: point.lon,
      meters,
    });
  });

  if (!raw.length) return [];

  let display = [];

  if (Number(holeNumber) === 18) {
    const bunkers = raw.filter((h) => h.typeKey === "bunker");
    const waters = raw.filter((h) => h.typeKey === "water");
    const obs = raw.filter((h) => h.typeKey === "ob");
    const others = raw.filter(
      (h) => h.typeKey !== "bunker" && h.typeKey !== "water" && h.typeKey !== "ob"
    );

    const pushSimpleSeries = (items, typeKey) => {
      items.forEach((h) => {
        display.push({
          typeKey,
          typeLabel: hazardLabel(typeKey),
          lat: h.lat,
          lon: h.lon,
          meters: h.meters,
          yards: yds(h.meters),
        });
      });
    };

    pushSimpleSeries(bunkers, "bunker");
    pushSimpleSeries(waters, "water");

    if (obs.length) {
      const sortedByLon = [...obs].sort((a, b) => a.lon - b.lon);
      const sortedByLat = [...obs].sort((a, b) => b.lat - a.lat);

      const left = sortedByLon[0];
      const right = sortedByLon[sortedByLon.length - 1];
      const back = sortedByLat[0];

      const unique = [];
      const seen = new Set();

      [left, right, back].forEach((h) => {
        if (!h) return;
        const k = `${h.lat},${h.lon}`;
        if (seen.has(k)) return;
        seen.add(k);
        unique.push(h);
      });

      unique.forEach((h) => {
        display.push({
          typeKey: "ob",
          typeLabel: "OB",
          lat: h.lat,
          lon: h.lon,
          meters: h.meters,
          yards: yds(h.meters),
        });
      });
    }

    pushSimpleSeries(others, "hazard");
  } else {
    display = raw.map((h) => ({
      typeKey: h.typeKey,
      typeLabel: h.typeLabel,
      lat: h.lat,
      lon: h.lon,
      meters: h.meters,
      yards: yds(h.meters),
    }));
  }

  const sorted = [...display].sort((a, b) => {
    const aOk = Number.isFinite(a.meters);
    const bOk = Number.isFinite(b.meters);

    if (aOk && bOk) return a.meters - b.meters;
    if (aOk) return -1;
    if (bOk) return 1;
    return 0;
  });

  return sorted.map((h, idx) => ({
    id: `${h.typeKey}-${idx + 1}-${h.lat}-${h.lon}`,
    typeKey: h.typeKey,
    typeLabel: h.typeLabel,
    number: idx + 1,
    lat: h.lat,
    lon: h.lon,
    meters: h.meters,
    yards: h.yards,
  }));
}

function getInitialRegion(points, fallbackCenter) {
  const valid = (points || []).filter(Boolean);

  if (!valid.length) {
    if (fallbackCenter && Number.isFinite(fallbackCenter.lat) && Number.isFinite(fallbackCenter.lon)) {
      return {
        latitude: fallbackCenter.lat,
        longitude: fallbackCenter.lon,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    return {
      latitude: 49.2,
      longitude: -122.9,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
  }

  if (valid.length === 1) {
    return {
      latitude: valid[0].lat,
      longitude: valid[0].lon,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  let minLat = valid[0].lat;
  let maxLat = valid[0].lat;
  let minLon = valid[0].lon;
  let maxLon = valid[0].lon;

  valid.forEach((p) => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  });

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.45, 0.006),
    longitudeDelta: Math.max((maxLon - minLon) * 1.45, 0.006),
  };
}

export default function HazardsScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const holeFromParams = Number.isFinite(Number(params?.hole))
    ? Number(params.hole)
    : Number.isFinite(Number(params?.holeNumber))
      ? Number(params.holeNumber)
      : 1;

  const [resolvedCourseId, setResolvedCourseId] = useState(
    pickCourseIdAny(params) || pickCourseIdAny({ course: params?.course })
  );
  const [resolvedCourseName, setResolvedCourseName] = useState(
    pickCourseNameAny(params, pickCourseNameAny({ course: params?.course }, "Course"))
  );
  const [resolvedCourseCenter, setResolvedCourseCenter] = useState(
    pickCourseCenterAny(params) || pickCourseCenterAny({ course: params?.course }) || null
  );

  const [loading, setLoading] = useState(true);
  const [courseData, setCourseData] = useState(null);
  const [user, setUser] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const fitHazardsMap = () => {
    if (!mapRef.current || !framePoints.length) return;

    const coords = framePoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
    }));

    try {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 110, right: 55, bottom: 120, left: 55 },
        animated: true,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let live = true;

    (async () => {
      const cidNow = pickCourseIdAny({ courseId: resolvedCourseId, course: params?.course });
      if (cidNow) return;

      try {
        const active = await RoundState.loadActiveRound();
        if (!live) return;

        const root = unwrapRound(active);
        const cid = pickCourseIdAny(root);
        const cname = pickCourseNameAny(root, resolvedCourseName || "Course");
        const ccenter = pickCourseCenterAny(root) || null;

        if (cid) setResolvedCourseId(String(cid));
        if (cname) setResolvedCourseName(String(cname));
        if (ccenter) setResolvedCourseCenter(ccenter);
      } catch {
        // ignore
      }
    })();

    return () => {
      live = false;
    };
  }, [params?.course, resolvedCourseId, resolvedCourseName]);

  useEffect(() => {
    let live = true;

    (async () => {
      if (!resolvedCourseId) {
        if (live) {
          setCourseData(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const saved = await loadCourseData(String(resolvedCourseId));
        if (!live) return;
        setCourseData(saved || null);
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [resolvedCourseId]);

  useEffect(() => {
    let sub = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;

        const p0 = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        if (!cancelled && p0?.coords) {
          const lat = p0.coords.latitude;
          const lon = p0.coords.longitude;
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            setUser({ lat, lon });
          }
        }

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Highest,
            distanceInterval: 3,
            timeInterval: 1500,
          },
          (p) => {
            if (!p?.coords) return;
            const lat = p.coords.latitude;
            const lon = p.coords.longitude;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            setUser({ lat, lon });
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
  }, []);

  const courseCenter = useMemo(() => {
    if (
      Array.isArray(resolvedCourseCenter) &&
      resolvedCourseCenter.length === 2 &&
      Number.isFinite(resolvedCourseCenter[1]) &&
      Number.isFinite(resolvedCourseCenter[0])
    ) {
      return { lat: resolvedCourseCenter[1], lon: resolvedCourseCenter[0] };
    }

    if (
      resolvedCourseCenter &&
      typeof resolvedCourseCenter === "object" &&
      Number.isFinite(resolvedCourseCenter.lat) &&
      Number.isFinite(resolvedCourseCenter.lon)
    ) {
      return { lat: resolvedCourseCenter.lat, lon: resolvedCourseCenter.lon };
    }

    return null;
  }, [resolvedCourseCenter]);

  const holeGps = useMemo(() => {
    return courseData?.gps?.holes?.[String(holeFromParams)] || null;
  }, [courseData, holeFromParams]);

  const green = holeGps?.green || null;
  const teePoint = asPoint(holeGps?.tee);
  const fairwayMid = asPoint(holeGps?.fairway?.mid);

  const hazards = useMemo(() => {
    return buildNumberedHazards(holeGps?.hazards || [], user, holeFromParams);
  }, [holeGps?.hazards, user, holeFromParams]);

  const framePoints = useMemo(() => {
    const pts = [];

    if (teePoint) {
      pts.push(teePoint);
    }

    hazards.forEach((h) => {
      pts.push({ lat: h.lat, lon: h.lon });
    });

    if (!teePoint) {
      if (fairwayMid) pts.push(fairwayMid);
      if (asPoint(green?.front)) pts.push(asPoint(green?.front));
      if (asPoint(green?.middle)) pts.push(asPoint(green?.middle));
      if (asPoint(green?.back)) pts.push(asPoint(green?.back));
    }

    return pts;
  }, [teePoint, fairwayMid, green, hazards]);

  const initialRegion = useMemo(() => {
    return getInitialRegion(framePoints, courseCenter);
  }, [framePoints, courseCenter]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!framePoints.length) return;

    const coords = framePoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
    }));

    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 110, right: 55, bottom: 120, left: 55 },
          animated: true,
        });
      } catch {
        // ignore
      }
    }, 250);

    return () => clearTimeout(t);
  }, [framePoints]);

  const subtitle = useMemo(() => {
    const parts = [];
    if (params?.teeName) parts.push(params.teeName);
    if (holeFromParams) parts.push(`Hole ${holeFromParams}`);
    return parts.join(" • ") || "Hazards";
  }, [params?.teeName, holeFromParams]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Hazards" subtitle={subtitle} />

      <View style={styles.mapWrap}>
        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator />
            <Text style={styles.centerStateText}>Loading hazards…</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={initialRegion}
            mapType="satellite"
            showsCompass={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
          >
            {user ? (
              <Marker coordinate={{ latitude: user.lat, longitude: user.lon }} anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.userDot} />
              </Marker>
            ) : null}

            {hazards.map((h) => (
              <Marker
                key={h.id}
                coordinate={{ latitude: h.lat, longitude: h.lon }}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.hazardWrap}>
                  <View style={styles.hazardMarker}>
                    <Text style={styles.hazardMarkerT}>{h.number}</Text>
                  </View>
                  <View style={styles.hazardYardPill}>
                    <Text style={styles.hazardYardPillT}>{h.yards}</Text>
                  </View>
                </View>
              </Marker>
            ))}
          </MapView>
        )}

        {!loading && !hazards.length ? (
          <View style={styles.emptyOverlay}>
            <Text style={styles.emptyOverlayT}>No hazards mapped yet for this hole.</Text>
          </View>
        ) : null}

        <></>
      </View>
      <View pointerEvents="box-none" style={[styles.floatingRowDual, { top: insets.top + 78 }]}>
        <Pressable
          onPress={() => setInfoOpen(true)}
          style={({ pressed }) => [styles.floatBtnHalf, pressed && styles.pressed]}
        >
          <Text style={styles.floatBtnT}>Hazard Info</Text>
        </Pressable>

        <Pressable
          onPress={fitHazardsMap}
          style={({ pressed }) => [styles.floatBtnHalf, pressed && styles.pressed]}
        >
          <Text style={styles.floatBtnT}>Re-center</Text>
        </Pressable>
      </View>

      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInfoOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Hazards</Text>
              <Pressable onPress={() => setInfoOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseT}>Done</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {!hazards.length ? (
                <View style={styles.infoState}>
                  <Text style={styles.infoStateT}>No hazards mapped yet for this hole.</Text>
                </View>
              ) : (
                hazards.map((h) => (
                  <View key={h.id} style={styles.hazardRow}>
                    <View style={styles.hazardRowLeft}>
                      <View style={styles.listNumBadge}>
                        <Text style={styles.listNumBadgeT}>{h.number}</Text>
                      </View>

                      <View>
                        <Text style={styles.hazardTypeT}>{h.typeLabel}</Text>
                        <Text style={styles.hazardMetaT}>Marker {h.number}</Text>
                      </View>
                    </View>

                    <View style={styles.hazardRowRight}>
                      <Text style={styles.hazardYardsT}>{h.yards}</Text>
                      <Text style={styles.hazardUnitT}>YDS</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  mapWrap: {
    flex: 1,
    position: "relative",
  },

  map: {
    flex: 1,
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  centerStateText: {
    color: MUTED,
    fontWeight: "800",
  },

  userDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#2E86FF",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  hazardWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  hazardMarker: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(8,8,10,0.94)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },

  hazardMarkerT: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "900",
  },

  hazardYardPill: {
    marginTop: 4,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  hazardYardPillT: {
    color: WHITE,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  emptyOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 20,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
  },

  emptyOverlayT: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },

  floatingRowDual: {
    position: "absolute",
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  floatBtnHalf: {
    flex: 1,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
    borderWidth: 1.25,
    borderColor: "rgba(46, 204, 113, 0.42)",
    shadowColor: "#2ECC71",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  floatBtnT: {
    color: WHITE,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.3,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },

  modalCard: {
    width: "100%",
    maxHeight: "72%",
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },

  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    color: WHITE,
    fontSize: 18,
    fontWeight: "900",
  },

  modalClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  modalCloseT: {
    color: WHITE,
    fontWeight: "900",
  },

  modalBody: {
    flexGrow: 0,
  },

  modalBodyContent: {
    padding: 14,
    gap: 10,
  },

  infoState: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  infoStateT: {
    color: MUTED,
    fontWeight: "800",
    textAlign: "center",
  },

  hazardRow: {
    minHeight: 68,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.2,
    borderColor: "rgba(46, 204, 113, 0.34)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  hazardRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  hazardRowRight: {
    minWidth: 64,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  listNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(8,8,10,0.95)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.90)",
    alignItems: "center",
    justifyContent: "center",
  },

  listNumBadgeT: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "900",
  },

  hazardTypeT: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "900",
  },

  hazardMetaT: {
    marginTop: 3,
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
  },

  hazardYardsT: {
    color: WHITE,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 22,
  },

  hazardUnitT: {
    marginTop: 2,
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});