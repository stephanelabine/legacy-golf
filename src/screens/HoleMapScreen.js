// src/screens/HoleMapScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import { MAPBOX_TOKEN } from "../config/mapbox";
import { loadCourseData, saveCourseData } from "../storage/courseData";

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

function buildHtml() {
  return `<!doctype html><html><head>
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
  <style>
    html,body,#map{margin:0;padding:0;height:100%;background:#000}
    .dot{width:12px;height:12px;border-radius:999px;background:#2E86FF;border:2px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .pin{width:10px;height:10px;border-radius:999px;background:#fff;border:2px solid #000;box-shadow:0 8px 20px rgba(0,0,0,.35)}
  </style>
  </head><body><div id="map"></div>
  <script>
    mapboxgl.accessToken="${MAPBOX_TOKEN}";
    const map = new mapboxgl.Map({
      container:"map",
      style:"mapbox://styles/mapbox/satellite-streets-v12",
      center:[-122.9,49.2],
      zoom:17
    });

    let u=null, tee=null, f=null, m=null, b=null;
    const mk=(c)=>{const e=document.createElement("div");e.className=c;return e};

    let lastKey = "";
    function keyFrom(d){
      const p = (x)=>x && isFinite(x.lon) && isFinite(x.lat) ? (x.lon.toFixed(6)+","+x.lat.toFixed(6)) : "";
      return [
        p(d.user),
        p(d.center),
        p(d.tee),
        p(d.green?.front),
        p(d.green?.middle),
        p(d.green?.back),
      ].join("|");
    }

    function fit(points){
      const valid = points.filter(p => p && isFinite(p.lon) && isFinite(p.lat));
      if(valid.length === 0) return;
      if(valid.length === 1){
        map.easeTo({ center:[valid[0].lon, valid[0].lat], zoom:17, duration:450 });
        return;
      }
      let minLon=valid[0].lon, maxLon=valid[0].lon, minLat=valid[0].lat, maxLat=valid[0].lat;
      valid.forEach(p=>{
        minLon=Math.min(minLon,p.lon); maxLon=Math.max(maxLon,p.lon);
        minLat=Math.min(minLat,p.lat); maxLat=Math.max(maxLat,p.lat);
      });
      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:90,duration:650});
    }

    function applyPayload(d){
      if(d.user){
        u ? u.setLngLat([d.user.lon,d.user.lat])
          : u=new mapboxgl.Marker({element:mk("dot")}).setLngLat([d.user.lon,d.user.lat]).addTo(map);
      }
      if(d.tee){
        tee ? tee.setLngLat([d.tee.lon,d.tee.lat])
          : tee=new mapboxgl.Marker({element:mk("pin")}).setLngLat([d.tee.lon,d.tee.lat]).addTo(map);
      }
      if(d.green){
        const pts=[["f",d.green.front],["m",d.green.middle],["b",d.green.back]];
        pts.forEach(([k,p])=>{
          if(!p) return;
          if(k==="f") f ? f.setLngLat([p.lon,p.lat]) : f=new mapboxgl.Marker({element:mk("pin")}).setLngLat([p.lon,p.lat]).addTo(map);
          if(k==="m") m ? m.setLngLat([p.lon,p.lat]) : m=new mapboxgl.Marker({element:mk("pin")}).setLngLat([p.lon,p.lat]).addTo(map);
          if(k==="b") b ? b.setLngLat([p.lon,p.lat]) : b=new mapboxgl.Marker({element:mk("pin")}).setLngLat([p.lon,p.lat]).addTo(map);
        });
      }

      if(d.cmd === "recenter"){
        if(d.at && isFinite(d.at[0]) && isFinite(d.at[1])){
          map.easeTo({ center:d.at, zoom:17, duration:420 });
        } else if(d.user){
          map.easeTo({ center:[d.user.lon, d.user.lat], zoom:17, duration:420 });
        }
        return;
      }

      const nextKey = keyFrom(d);
      const changed = nextKey !== lastKey;
      if(changed && d.fit){
        fit([d.user, d.center, d.tee, d.green?.front, d.green?.middle, d.green?.back]);
      }
      lastKey = nextKey;
    }

    function listen(handler){
      window.addEventListener("message", handler);
      document.addEventListener("message", handler);
    }

    map.on("load",()=>{
      listen((e)=>{
        let d=null;
        try{ d=JSON.parse(e.data); }catch(_){}
        if(!d) return;
        applyPayload(d);
      });
    });
  </script></body></html>`;
}

function hasAllGreenPoints(holeObj) {
  const g = holeObj?.green;
  return !!(g?.front && g?.middle && g?.back);
}

function all18Complete(courseData) {
  const holes = courseData?.gps?.holes;
  if (!holes || typeof holes !== "object") return false;
  for (let i = 1; i <= 18; i++) {
    const h = holes[String(i)];
    if (!hasAllGreenPoints(h)) return false;
  }
  return true;
}

export default function HoleMapScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);

  const params = route?.params || {};
  const course = params.course || null;
  const teeObj = params.tee || null;
  const players = params.players || [];
  const roundId = params.roundId ?? null;
  const holeMetaParam = params.holeMeta || null;

  const courseId = params.courseId ?? course?.id ?? (typeof course === "string" ? course : null);

  const courseName = params.courseName ?? course?.name ?? course?.courseName ?? "Course";

  const courseCenter = params.courseCenter ?? course?.center ?? course?.courseCenter ?? null;

  const [holeIndex, setHoleIndex] = useState(Number.isFinite(params.holeIndex) ? params.holeIndex : 0);
  const clampedHoleIndex = Math.max(0, Math.min(17, holeIndex));
  const holeNumber = clampedHoleIndex + 1;

  const [user, setUser] = useState(null);
  const [webReady, setWebReady] = useState(false);

  const [courseData, setCourseData] = useState(null);
  const [loadingCourseData, setLoadingCourseData] = useState(true);

  const reloadCourseData = async () => {
    if (!courseId) {
      setCourseData(null);
      setLoadingCourseData(false);
      return;
    }
    setLoadingCourseData(true);
    const saved = await loadCourseData(String(courseId));
    setCourseData(saved || null);
    setLoadingCourseData(false);
  };

  useEffect(() => {
    reloadCourseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    let sub = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") return;

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
        (p) => setUser({ lat: p.coords.latitude, lon: p.coords.longitude })
      );
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, []);

  const gpsLocked = courseData?.gpsLocked === true;
  const canLockNow = useMemo(() => all18Complete(courseData), [courseData]);

  const holeMeta = useMemo(() => {
    return holeMetaParam && typeof holeMetaParam === "object"
      ? holeMetaParam
      : courseData?.holeMeta && typeof courseData.holeMeta === "object"
      ? courseData.holeMeta
      : null;
  }, [holeMetaParam, courseData]);

  const par = holeMeta?.[String(holeNumber)]?.par ?? null;
  const si = holeMeta?.[String(holeNumber)]?.si ?? null;

  const savedGps = useMemo(() => {
    const gps = courseData?.gps;
    const hole = gps?.holes?.[String(holeNumber)] || null;
    return hole;
  }, [courseData, holeNumber]);

  const green = savedGps?.green || null;
  const teePoint = savedGps?.tee || null;

  const center = useMemo(() => {
    if (courseCenter && Array.isArray(courseCenter) && courseCenter.length === 2) {
      return { lon: courseCenter[0], lat: courseCenter[1] };
    }
    if (
      courseCenter &&
      typeof courseCenter === "object" &&
      Number.isFinite(courseCenter.lon) &&
      Number.isFinite(courseCenter.lat)
    ) {
      return courseCenter;
    }
    return null;
  }, [courseCenter]);

  const dist = useMemo(() => {
    if (!user || !green) return {};
    const out = {};
    if (green.front) out.f = haversineMeters(user, green.front);
    if (green.middle) out.m = haversineMeters(user, green.middle);
    if (green.back) out.b = haversineMeters(user, green.back);
    return out;
  }, [user, green]);

  const distVals = {
    front: green?.front ? yds(dist.f) : "—",
    middle: green?.middle ? yds(dist.m) : "—",
    back: green?.back ? yds(dist.b) : "—",
  };

  const postPayload = (fit = false) => {
    if (!web.current || !webReady) return;

    const payload = {
      user: user ? { lon: user.lon, lat: user.lat } : null,
      center,
      tee: teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat) ? teePoint : null,
      green: green
        ? {
            front: green.front || null,
            middle: green.middle || null,
            back: green.back || null,
          }
        : null,
      fit,
    };

    web.current.postMessage(JSON.stringify(payload));
  };

  useEffect(() => {
    postPayload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webReady, clampedHoleIndex, center, teePoint, green]);

  useEffect(() => {
    postPayload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function prevHole() {
    setHoleIndex((h) => Math.max(0, h - 1));
  }
  function nextHole() {
    setHoleIndex((h) => Math.min(17, h + 1));
  }

  function enterScore() {
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      course,
      tee: teeObj,
      players,
      hole: holeNumber,
      holeMeta,
      roundId,
      courseName,
      courseCenter,
    });
  }

  function recenter() {
    if (!web.current || !webReady) return;
    const payload = {
      cmd: "recenter",
      at: user ? [user.lon, user.lat] : null,
      user: user ? { lon: user.lon, lat: user.lat } : null,
    };
    web.current.postMessage(JSON.stringify(payload));
  }

  const [setupOpen, setSetupOpen] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  const canSet = useMemo(() => {
    return !!user && Number.isFinite(user?.lat) && Number.isFinite(user?.lon);
  }, [user]);

  const currentAccuracyText = useMemo(() => {
    if (!user) return "Waiting for GPS…";
    return "GPS ready";
  }, [user]);

  async function setPoint(kind) {
    if (!courseId || !canSet) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      if (existing?.gpsLocked === true) {
        Alert.alert(
          "Green points locked",
          "These green points are locked for this course and cannot be overwritten. If you truly need to start over, use “Wipe this course” from Course Data."
        );
        return;
      }

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);
      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};
      const existingGreen = holeObj.green && typeof holeObj.green === "object" ? holeObj.green : {};

      const nextGreen = {
        ...existingGreen,
        [kind]: { lat: user.lat, lon: user.lon },
      };

      const nextHoleObj = { ...holeObj, green: nextGreen };

      const next = {
        ...existing,
        gps: {
          ...gps,
          holes: {
            ...holes,
            [hKey]: nextHoleObj,
          },
        },
      };

      const ok = await saveCourseData(cid, next);
      if (ok) {
        await reloadCourseData();
        postPayload(true);
      }
    } finally {
      setSavingSetup(false);
    }
  }

  function lockGreenPoints() {
    if (!courseId) return;

    if (!canLockNow) {
      Alert.alert(
        "Not ready to lock",
        "To lock green points, you must have Front/Mid/Back saved for all 18 holes."
      );
      return;
    }

    Alert.alert(
      "Lock green points?",
      "After locking, green points cannot be overwritten. This is your safeguard once Wednesday’s full mapping is done.\n\nIf you ever need to start over, use “Wipe this course” from Course Data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Lock",
          style: "destructive",
          onPress: async () => {
            const cid = String(courseId);
            const ok = await saveCourseData(cid, { gpsLocked: true });
            if (!ok) {
              Alert.alert("Lock failed", "Could not lock green points. Try again.");
              return;
            }
            await reloadCourseData();
            Alert.alert("Locked", "Green points are now locked for this course.");
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <WebView ref={web} source={{ html: buildHtml() }} style={{ flex: 1 }} onLoadEnd={() => setWebReady(true)} />

      <View style={[styles.top, { top: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Text style={styles.topBtnT}>Back</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {courseName}
          </Text>
          <Text style={styles.sub}>
            Hole {holeNumber}
            {par ? ` • Par ${par}` : ""}
            {si ? ` • SI ${si}` : ""}
          </Text>
        </View>

        <Pressable onPress={() => setSetupOpen(true)} style={styles.setupBtn}>
          <Text style={styles.setupBtnT}>Setup</Text>
        </Pressable>
      </View>

      <View style={[styles.yardWrap, { top: insets.top + 86 }]}>
        <View style={styles.yardPanel}>
          <View style={styles.yRow}>
            <Text style={styles.yLabel}>FRONT</Text>
            <Text style={styles.yVal}>{distVals.front}</Text>
          </View>

          <View style={styles.yDivider} />

          <View style={styles.yRow}>
            <Text style={styles.yLabel}>MID</Text>
            <Text style={styles.yVal}>{distVals.middle}</Text>
          </View>

          <View style={styles.yDivider} />

          <View style={styles.yRow}>
            <Text style={styles.yLabel}>BACK</Text>
            <Text style={styles.yVal}>{distVals.back}</Text>
          </View>

          <Text style={styles.yUnit}>YDS</Text>

          {!green?.front && !green?.middle && !green?.back ? (
            <Text style={styles.yHint}>No green points loaded for this course.</Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.gpsChipWrap, { bottom: insets.bottom + 112 }]}>
        <Pressable onPress={recenter} style={({ pressed }) => [styles.gpsChip, pressed && styles.pressed]}>
          <View style={styles.gpsDot} />
          <Text style={styles.gpsChipT}>GPS Active</Text>
          <Text style={styles.gpsChipS}>Tap to re-center</Text>
        </Pressable>
      </View>

      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.dock}>
          <Pressable style={styles.square} onPress={prevHole}>
            <Text style={styles.icon}>‹</Text>
          </Pressable>

          <Pressable style={styles.primary} onPress={enterScore}>
            <Text style={styles.primaryT}>ENTER SCORE</Text>
            <Text style={styles.primaryS}>Hole {holeNumber}</Text>
          </Pressable>

          <Pressable style={styles.square} onPress={nextHole}>
            <Text style={styles.icon}>›</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={setupOpen} transparent animationType="fade" onRequestClose={() => setSetupOpen(false)}>
        <View style={styles.modalBg}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Green Points Setup</Text>
              <Pressable onPress={() => setSetupOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseT}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSub}>Select a hole, stand at the green front/mid/back, then tap Set.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holePills}>
              {Array.from({ length: 18 }).map((_, i) => {
                const h = i + 1;
                const active = h === holeNumber;
                return (
                  <Pressable
                    key={h}
                    onPress={() => setHoleIndex(h - 1)}
                    style={({ pressed }) => [
                      styles.holePill,
                      active && styles.holePillActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.holePillT, active && styles.holePillTActive]}>{h}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalBody}>
              {loadingCourseData ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator />
                  <Text style={styles.modalLoadingT}>Loading course data…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.lockRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lockTitle}>
                        {gpsLocked ? "Green points are locked" : "Green points are editable"}
                      </Text>
                      <Text style={styles.lockSub}>
                        {gpsLocked
                          ? "Set buttons are disabled forever (safeguard)."
                          : canLockNow
                          ? "All 18 holes complete — you can lock now."
                          : "Lock becomes available after all 18 holes have Front/Mid/Back saved."}
                      </Text>
                    </View>

                    {!gpsLocked ? (
                      <Pressable
                        onPress={lockGreenPoints}
                        disabled={!canLockNow}
                        style={({ pressed }) => [
                          styles.lockBtn,
                          pressed && styles.pressed,
                          !canLockNow && { opacity: 0.45 },
                        ]}
                      >
                        <Text style={styles.lockBtnT}>Lock</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.lockPill}>
                        <Text style={styles.lockPillT}>LOCKED</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.gpsStatus}>{currentAccuracyText}</Text>

                  <View style={styles.setRow}>
                    <Pressable
                      disabled={!canSet || savingSetup || gpsLocked}
                      onPress={() => setPoint("front")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup || gpsLocked) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Set Front</Text>
                      <Text style={styles.setBtnS}>
                        {gpsLocked ? "Locked" : green?.front ? "Saved" : "Not set"}
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup || gpsLocked}
                      onPress={() => setPoint("middle")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup || gpsLocked) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Set Mid</Text>
                      <Text style={styles.setBtnS}>
                        {gpsLocked ? "Locked" : green?.middle ? "Saved" : "Not set"}
                      </Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup || gpsLocked}
                      onPress={() => setPoint("back")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup || gpsLocked) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Set Back</Text>
                      <Text style={styles.setBtnS}>
                        {gpsLocked ? "Locked" : green?.back ? "Saved" : "Not set"}
                      </Text>
                    </Pressable>
                  </View>

                  <Text style={styles.modalHint}>
                    After you set points, the yardages will update live as you walk.
                  </Text>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },

  top: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  topBtnT: { color: "#fff", fontWeight: "900" },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sub: { marginTop: 3, color: "rgba(255,255,255,0.78)", fontWeight: "800" },

  setupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(46,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  setupBtnT: { color: "#fff", fontWeight: "900" },

  yardWrap: { position: "absolute", right: 12 },
  yardPanel: {
    width: 150,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  yRow: {
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  yLabel: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  yVal: { color: "#fff", fontWeight: "900", fontSize: 22 },
  yDivider: { height: 10 },
  yUnit: {
    marginTop: 10,
    textAlign: "center",
    color: "rgba(255,255,255,0.72)",
    fontWeight: "900",
    letterSpacing: 1.1,
    fontSize: 11,
  },
  yHint: {
    marginTop: 10,
    textAlign: "center",
    color: "rgba(255,255,255,0.65)",
    fontWeight: "800",
    fontSize: 11,
  },

  gpsChipWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    alignItems: "center",
  },
  gpsChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(46,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.30)",
  },
  gpsDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#2E7DFF",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
  },
  gpsChipT: { color: "#fff", fontWeight: "900" },
  gpsChipS: { color: "rgba(255,255,255,0.78)", fontWeight: "800" },

  bottomWrap: { position: "absolute", left: 14, right: 14, bottom: 0, gap: 10 },
  dock: {
    borderRadius: 22,
    flexDirection: "row",
    gap: 10,
    padding: 12,
    backgroundColor: "rgba(18,22,30,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  square: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  icon: { color: "#fff", fontSize: 28, fontWeight: "900" },

  primary: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  primaryT: { color: GREEN_TEXT, fontWeight: "900", letterSpacing: 0.6 },
  primaryS: { color: "rgba(11,31,18,0.82)", fontSize: 12, fontWeight: "900", marginTop: 2 },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.70)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(18,22,30,0.96)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalCloseT: { color: "#fff", fontWeight: "900" },
  modalSub: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "800",
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  holePills: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 },
  holePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  holePillActive: { backgroundColor: "rgba(46,125,255,0.35)", borderColor: "rgba(46,125,255,0.55)" },
  holePillT: { color: "#fff", fontWeight: "900" },
  holePillTActive: { opacity: 1 },

  modalBody: { padding: 14, paddingTop: 6, paddingBottom: 16 },
  modalLoading: { paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 10 },
  modalLoadingT: { color: "rgba(255,255,255,0.72)", fontWeight: "800" },

  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginBottom: 12,
  },
  lockTitle: { color: "#fff", fontWeight: "900" },
  lockSub: { marginTop: 4, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

  lockBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231, 76, 60, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(231, 76, 60, 0.35)",
  },
  lockBtnT: { color: "#fff", fontWeight: "900" },

  lockPill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46, 204, 113, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.28)",
  },
  lockPillT: { color: "#fff", fontWeight: "900", letterSpacing: 0.6 },

  gpsStatus: { color: "rgba(255,255,255,0.82)", fontWeight: "900", marginBottom: 10 },

  setRow: { flexDirection: "row", gap: 10 },
  setBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  setBtnT: { color: "#fff", fontWeight: "900" },
  setBtnS: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

  modalHint: { marginTop: 12, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 17 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
