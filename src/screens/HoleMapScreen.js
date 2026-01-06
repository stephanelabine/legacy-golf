import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import { MAPBOX_TOKEN } from "../config/mapbox";

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

    let u=null, f=null, m=null, b=null, tee=null;
    const mk=(c)=>{const e=document.createElement("div");e.className=c;return e};

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
      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:80,duration:650});
    }

    map.on("load",()=>{
      window.addEventListener("message",e=>{
        let d=null;
        try{ d=JSON.parse(e.data); }catch(_){}
        if(!d) return;

        if(d.user){
          u ? u.setLngLat([d.user.lon,d.user.lat])
            : u=new mapboxgl.Marker({element:mk("dot")}).setLngLat([d.user.lon,d.user.lat]).addTo(map);
        }
        if(d.center){
          if(!d.user) map.easeTo({ center:[d.center.lon, d.center.lat], zoom:16, duration:450 });
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

        fit([d.user, d.center, d.tee, d.green?.front, d.green?.middle, d.green?.back]);
      });
    });
  </script></body></html>`;
}

export default function HoleMapScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);

  const params = route?.params || {};
  const course = params.course || null;
  const tee = params.tee || null;
  const players = params.players || [];
  const holeMeta = params.holeMeta || null;
  const roundId = params.roundId ?? null;

  const courseName =
    params.courseName ??
    course?.name ??
    course?.courseName ??
    "Course";

  const courseCenter =
    params.courseCenter ??
    course?.center ??
    course?.courseCenter ??
    null;

  const [holeIndex, setHoleIndex] = useState(
    Number.isFinite(params.holeIndex) ? params.holeIndex : 0
  );
  const clampedHoleIndex = Math.max(0, Math.min(17, holeIndex));
  const holeNumber = clampedHoleIndex + 1;

  const [user, setUser] = useState(null);

  const hole = useMemo(() => {
    return course?.holes?.[clampedHoleIndex] || null;
  }, [course, clampedHoleIndex]);

  const dist = useMemo(() => {
    if (!user || !hole?.green) return {};
    return {
      f: haversineMeters(user, hole.green.front),
      m: haversineMeters(user, hole.green.middle),
      b: haversineMeters(user, hole.green.back),
    };
  }, [user, hole]);

  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
        (p) => setUser({ lat: p.coords.latitude, lon: p.coords.longitude })
      );
    })();
    return () => {
      if (sub) sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!web.current) return;

    const center =
      courseCenter && Array.isArray(courseCenter) && courseCenter.length === 2
        ? { lon: courseCenter[0], lat: courseCenter[1] }
        : courseCenter &&
          typeof courseCenter === "object" &&
          Number.isFinite(courseCenter.lon) &&
          Number.isFinite(courseCenter.lat)
        ? courseCenter
        : null;

    const payload = {
      user: user ? { lon: user.lon, lat: user.lat } : null,
      center,
      tee: hole?.tee || null,
      green: hole?.green || null,
    };

    web.current.postMessage(JSON.stringify(payload));
  }, [user, hole, courseCenter]);

  function prevHole() {
    setHoleIndex((h) => Math.max(0, h - 1));
  }
  function nextHole() {
    setHoleIndex((h) => Math.min(17, h + 1));
  }

  function enterScore() {
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      course,
      tee,
      players,
      hole: holeNumber,
      holeMeta,
      roundId,
      courseName,
      courseCenter,
    });
  }

  const distVals = {
    front: hole?.green ? yds(dist.f) : "—",
    middle: hole?.green ? yds(dist.m) : "—",
    back: hole?.green ? yds(dist.b) : "—",
  };

  return (
    <SafeAreaView style={styles.safe}>
      <WebView ref={web} source={{ html: buildHtml() }} style={{ flex: 1 }} />

      <View style={[styles.top, { top: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Text style={styles.topBtnT}>Back</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {courseName}
          </Text>
          <Text style={styles.sub}>Hole {holeNumber}</Text>
        </View>
      </View>

      {/* RIGHT-SIDE YARDAGE PANEL */}
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
        </View>
      </View>

      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 12 }]}>
        {/* Bottom Floating Dock */}
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
    </SafeAreaView>
  );
}

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

  // Right-side yardages
  yardWrap: {
    position: "absolute",
    right: 12,
  },
  yardPanel: {
    width: 140,
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
    backgroundColor: "#D62828",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  primaryT: { color: "#fff", fontWeight: "900", letterSpacing: 0.6 },
  primaryS: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
});
