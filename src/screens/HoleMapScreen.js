import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import ROUTES from "../navigation/routes";
import { MAPBOX_TOKEN } from "../config/mapbox";
import { getRounds } from "../storage/rounds";
import { getCourseFromPlace } from "../api/golfCourseApi";

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
    .line{position:absolute;left:0;top:0}
  </style>
  </head><body><div id="map"></div>
  <script>
    mapboxgl.accessToken="${MAPBOX_TOKEN}";
    const map = new mapboxgl.Map({
      container:"map",
      style:"mapbox://styles/mapbox/satellite-streets-v12",
      center:[-122.9,49.2],
      zoom:17,
      pitch:0,
      bearing:0
    });

    let u=null, f=null, m=null, b=null, tee=null;

    const mk=(c)=>{const e=document.createElement("div");e.className=c;return e};

    function fit(points){
      const valid = points.filter(p => p && isFinite(p.lon) && isFinite(p.lat));
      if(valid.length < 2) return;
      let minLon=valid[0].lon, maxLon=valid[0].lon, minLat=valid[0].lat, maxLat=valid[0].lat;
      valid.forEach(p=>{
        minLon=Math.min(minLon,p.lon); maxLon=Math.max(maxLon,p.lon);
        minLat=Math.min(minLat,p.lat); maxLat=Math.max(maxLat,p.lat);
      });
      map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{padding:80,duration:650});
    }

    function setLine(from,to){
      if(!from||!to) return;
      const id="line";
      const geo={type:"Feature",geometry:{type:"LineString",coordinates:[[from.lon,from.lat],[to.lon,to.lat]]}};
      if(map.getSource(id)){
        map.getSource(id).setData(geo);
      } else {
        map.addSource(id,{type:"geojson",data:geo});
        map.addLayer({
          id,
          type:"line",
          source:id,
          paint:{
            "line-color":"#ffffff",
            "line-width":3,
            "line-opacity":0.85
          }
        });
      }
    }

    map.on("load",()=>{
      window.addEventListener("message",e=>{
        let d=null;
        try{ d=JSON.parse(e.data); }catch(_){}
        if(!d) return;

        if(d.user){
          u ? u.setLngLat([d.user.lon,d.user.lat]) : u=new mapboxgl.Marker({element:mk("dot")}).setLngLat([d.user.lon,d.user.lat]).addTo(map);
        }
        if(d.tee){
          tee ? tee.setLngLat([d.tee.lon,d.tee.lat]) : tee=new mapboxgl.Marker({element:mk("pin")}).setLngLat([d.tee.lon,d.tee.lat]).addTo(map);
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
        if(d.user && d.green && d.green.middle){
          setLine(d.user, d.green.middle);
        }
        fit([d.user, d.tee, d.green?.front, d.green?.middle, d.green?.back]);
      });
    });
  </script></body></html>`;
}

export default function HoleMapScreen({ navigation, route }) {
  const roundId = route?.params?.roundId;
  const holeIndex = route?.params?.holeIndex ?? 0;

  const web = useRef(null);
  const [round, setRound] = useState(null);
  const [course, setCourse] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const all = await getRounds();
      const found = (all || []).find((r) => String(r.id) === String(roundId));
      if (!found) {
        Alert.alert("Round not found", "Go back and start a new round.");
        navigation.navigate(ROUTES.HOME);
        return;
      }
      setRound(found);

      const place = { name: found.courseName, center: found.courseCenter };
      const c = await getCourseFromPlace(place);
      setCourse(c);
    })();
  }, [roundId]);

  useEffect(() => {
    let sub = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 1 },
        (p) => setUser({ lat: p.coords.latitude, lon: p.coords.longitude })
      );
    })();
    return () => {
      if (sub) sub.remove();
    };
  }, []);

  const hole = useMemo(() => {
    if (!course?.holes?.length) return null;
    return course.holes[Math.max(0, Math.min(17, holeIndex))] || null;
  }, [course, holeIndex]);

  const dist = useMemo(() => {
    if (!user || !hole?.green) return {};
    return {
      f: haversineMeters(user, hole.green.front),
      m: haversineMeters(user, hole.green.middle),
      b: haversineMeters(user, hole.green.back),
    };
  }, [user, hole]);

  useEffect(() => {
    if (!web.current) return;
    const payload = {
      user,
      tee: hole?.tee,
      green: hole?.green,
    };
    web.current.postMessage(JSON.stringify(payload));
  }, [user, hole]);

  if (!round || !course || !hole) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <WebView ref={web} source={{ html: buildHtml() }} style={{ flex: 1 }} />

      <View style={styles.top}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn}>
          <Text style={styles.topBtnT}>Back</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{course.name}</Text>
          <Text style={styles.sub}>Hole {hole.number} • Par {hole.par}</Text>
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.distCard}>
          <Text style={styles.distTxt}>Front {yds(dist.f)} • Mid {yds(dist.m)} • Back {yds(dist.b)} YDS</Text>
        </View>

        <Pressable onPress={() => navigation.goBack()} style={styles.primary}>
          <Text style={styles.primaryT}>Back to Score</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  loading: { color: "#fff", opacity: 0.8, fontWeight: "800", marginTop: 40, textAlign: "center" },

  top: { position: "absolute", top: 14, left: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  topBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  topBtnT: { color: "#fff", fontWeight: "900" },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sub: { marginTop: 3, color: "#fff", opacity: 0.75, fontWeight: "700" },

  bottom: { position: "absolute", left: 12, right: 12, bottom: 14, gap: 10 },
  distCard: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  distTxt: { color: "#fff", fontWeight: "900" },

  primary: { height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(46,125,255,0.92)" },
  primaryT: { color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },
});
