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
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "../components/ScreenHeader";
import { MAPBOX_TOKEN } from "../config/mapbox";
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

function buildHtml(initialCenter) {
  const initLon = Number.isFinite(initialCenter?.lon) ? initialCenter.lon : -122.9;
  const initLat = Number.isFinite(initialCenter?.lat) ? initialCenter.lat : 49.2;

  return `<!doctype html><html><head>
  <meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no"/>
  <link href="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css" rel="stylesheet"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js"></script>
  <style>
    html,body,#map{margin:0;padding:0;height:100%;background:#000}

    .dot{
      width:14px;
      height:14px;
      border-radius:999px;
      background:#2E86FF;
      border:2px solid #fff;
      box-shadow:0 8px 20px rgba(0,0,0,.35)
    }

    .hazWrap{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      transform:translateY(-6px);
    }

    .hazCircle{
      width:30px;
      height:30px;
      border-radius:999px;
      background:rgba(8,8,10,0.94);
      border:2px solid rgba(255,255,255,0.94);
      display:flex;
      align-items:center;
      justify-content:center;
      color:#fff;
      font-weight:900;
      font-size:12px;
      line-height:12px;
      box-shadow:0 10px 22px rgba(0,0,0,.34);
    }

    .hazPill{
      margin-top:4px;
      min-width:44px;
      padding:4px 8px;
      border-radius:999px;
      background:rgba(0,0,0,0.72);
      border:1px solid rgba(255,255,255,0.16);
      color:#fff;
      font-weight:900;
      font-size:11px;
      letter-spacing:.2px;
      text-align:center;
      box-shadow:0 10px 22px rgba(0,0,0,.34);
    }
  </style>
  </head>
  <body>
    <div id="map"></div>

  <script>
    mapboxgl.accessToken="${MAPBOX_TOKEN}";
    const map = new mapboxgl.Map({
      container:"map",
      style:"mapbox://styles/mapbox/satellite-streets-v12",
      center:[${initLon},${initLat}],
      zoom:17,
      pitch: 0,
      pitchWithRotate: false,
      touchPitch: false
    });

    let userMarker = null;
    let hazardMarkers = [];

    const mk = (c) => {
      const e = document.createElement("div");
      e.className = c;
      return e;
    };

    function clearHazards(){
      hazardMarkers.forEach((m) => {
        try { m.remove(); } catch(_) {}
      });
      hazardMarkers = [];
    }

    function renderHazards(items){
      clearHazards();

      (Array.isArray(items) ? items : []).forEach((h) => {
        if (!h) return;
        if (!isFinite(h.lon) || !isFinite(h.lat)) return;

        const wrap = document.createElement("div");
        wrap.className = "hazWrap";

        const circle = document.createElement("div");
        circle.className = "hazCircle";
        circle.textContent = String(h.number ?? "");

        const pill = document.createElement("div");
        pill.className = "hazPill";
        pill.textContent = String(h.yards ?? "—");

        wrap.appendChild(circle);
        wrap.appendChild(pill);

        const marker = new mapboxgl.Marker({
          element: wrap,
          anchor: "bottom"
        })
          .setLngLat([h.lon, h.lat])
          .addTo(map);

        hazardMarkers.push(marker);
      });
    }

    function bearingDeg(a,b){
      if(!a || !b) return null;
      if(!isFinite(a.lon)||!isFinite(a.lat)||!isFinite(b.lon)||!isFinite(b.lat)) return null;
      const φ1 = a.lat * Math.PI/180;
      const φ2 = b.lat * Math.PI/180;
      const Δλ = (b.lon - a.lon) * Math.PI/180;
      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
      let θ = Math.atan2(y,x) * 180/Math.PI;
      if(!isFinite(θ)) return null;
      θ = (θ + 360) % 360;
      return θ;
    }

    function frameHole(teeP, greenAim, points, bearing){
      const valid = (points || []).filter(p => p && isFinite(p.lon) && isFinite(p.lat));
      const offset = [-24, -24];

      if(teeP && greenAim && isFinite(teeP.lon) && isFinite(teeP.lat) && isFinite(greenAim.lon) && isFinite(greenAim.lat)){
        const midLon = (teeP.lon + greenAim.lon) / 2;
        const midLat = (teeP.lat + greenAim.lat) / 2;

        const dx = (greenAim.lon - teeP.lon) * 111320 * Math.cos(((teeP.lat + greenAim.lat)/2) * Math.PI/180);
        const dy = (greenAim.lat - teeP.lat) * 110540;
        const distM = Math.sqrt(dx*dx + dy*dy);

        let z = 16.5;
        if(distM > 420) z = 15.9;
        else if(distM > 320) z = 16.1;
        else if(distM > 220) z = 16.3;

        z = Math.max(15.9, Math.min(17.1, z));

        const opts = { center:[midLon, midLat], zoom:z, duration:520, offset };
        if(isFinite(bearing)) opts.bearing = bearing;
        map.easeTo(opts);
        return;
      }

      if(valid.length === 1){
        const opts = { center:[valid[0].lon, valid[0].lat], zoom:16.9, duration:450, offset };
        if(isFinite(bearing)) opts.bearing = bearing;
        map.easeTo(opts);
        return;
      }

      if(valid.length >= 2){
        let minLon=valid[0].lon, maxLon=valid[0].lon, minLat=valid[0].lat, maxLat=valid[0].lat;
        valid.forEach((p)=>{
          minLon=Math.min(minLon,p.lon); maxLon=Math.max(maxLon,p.lon);
          minLat=Math.min(minLat,p.lat); maxLat=Math.max(maxLat,p.lat);
        });

        const padding = { top: 90, bottom: 90, left: 55, right: 55 };
        const opts = { padding, duration:650, offset, maxZoom:18.6 };
        if(isFinite(bearing)) opts.bearing = bearing;

        map.fitBounds([[minLon,minLat],[maxLon,maxLat]], opts);
      }
    }

    let lastKey = "";

    function keyFrom(d){
      const p = (x)=>x && isFinite(x.lon) && isFinite(x.lat) ? (x.lon.toFixed(6)+","+x.lat.toFixed(6)) : "";
      return [
        p(d.user),
        p(d.center),
        p(d.tee),
        p(d.fairwayMid),
        p(d.green?.front),
        p(d.green?.middle),
        p(d.green?.back),
        JSON.stringify((d.hazards || []).map((h) => [h.number, h.lat, h.lon, h.yards]))
      ].join("|");
    }

    function applyPayload(d){
      if(d.user){
        if(userMarker){
          userMarker.setLngLat([d.user.lon,d.user.lat]);
        } else {
          userMarker = new mapboxgl.Marker({element:mk("dot")})
            .setLngLat([d.user.lon,d.user.lat])
            .addTo(map);
        }
      }

      renderHazards(d.hazards || []);

      const nextKey = keyFrom(d);
      const changed = nextKey !== lastKey;

      if(changed && d.fit){
        const holePts = [d.tee, d.fairwayMid, d.green?.front, d.green?.middle, d.green?.back].filter(Boolean);
        const teeP = d.tee || null;
        const greenAim = d.green?.middle || d.green?.back || d.green?.front || null;
        const brg = bearingDeg(teeP, greenAim);

        if(holePts.length){
          frameHole(teeP, greenAim, holePts, brg);
        } else {
          frameHole(null, null, [d.center].filter(Boolean), null);
        }
      }

      if(d.cmd === "recenter"){
        const holePts = [d.tee, d.fairwayMid, d.green?.front, d.green?.middle, d.green?.back].filter(Boolean);
        const teeP = d.tee || null;
        const greenAim = d.green?.middle || d.green?.back || d.green?.front || null;
        const brg = bearingDeg(teeP, greenAim);

        if(holePts.length){
          frameHole(teeP, greenAim, holePts, brg);
        } else {
          frameHole(null, null, [d.center].filter(Boolean), null);
        }
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

      try{
        if(window.ReactNativeWebView){
          window.ReactNativeWebView.postMessage(JSON.stringify({ cmd:"ready" }));
        }
      }catch(_){}
    });
  </script></body></html>`;
}

export default function HazardsScreen({ navigation, route }) {
  const params = route?.params || {};
  const insets = useSafeAreaInsets();
  const web = useRef(null);

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
  const [webReady, setWebReady] = useState(false);

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

  const initialCenter = useMemo(() => {
    if (green?.middle && Number.isFinite(green.middle?.lat) && Number.isFinite(green.middle?.lon)) {
      return { lon: green.middle.lon, lat: green.middle.lat };
    }
    if (teePoint && Number.isFinite(teePoint?.lat) && Number.isFinite(teePoint?.lon)) {
      return { lon: teePoint.lon, lat: teePoint.lat };
    }
    if (fairwayMid && Number.isFinite(fairwayMid?.lat) && Number.isFinite(fairwayMid?.lon)) {
      return { lon: fairwayMid.lon, lat: fairwayMid.lat };
    }
    if (courseCenter && Number.isFinite(courseCenter?.lat) && Number.isFinite(courseCenter?.lon)) {
      return { lon: courseCenter.lon, lat: courseCenter.lat };
    }
    return null;
  }, [green, teePoint, fairwayMid, courseCenter]);

  const postPayload = (fit = false) => {
    if (!web.current || !webReady) return;

    const payload = {
      cmd: fit ? "fit" : "update",
      user: user ? { lon: user.lon, lat: user.lat } : null,
      center: initialCenter,
      tee: teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat) ? teePoint : null,
      fairwayMid:
        fairwayMid && Number.isFinite(fairwayMid?.lon) && Number.isFinite(fairwayMid?.lat)
          ? fairwayMid
          : null,
      green: green
        ? {
          front: green.front || null,
          middle: green.middle || null,
          back: green.back || null,
          left: green.left || null,
          right: green.right || null,
        }
        : null,
      hazards: hazards.map((h) => ({
        id: h.id,
        number: h.number,
        typeKey: h.typeKey,
        typeLabel: h.typeLabel,
        lat: h.lat,
        lon: h.lon,
        yards: h.yards,
      })),
      fit,
    };

    web.current.postMessage(JSON.stringify(payload));
  };

  useEffect(() => {
    if (!webReady) return;
    if (loading) return;
    postPayload(true);
  }, [webReady, loading, holeFromParams, courseData]);

  useEffect(() => {
    if (!webReady) return;
    postPayload(false);
  }, [webReady, user, hazards]);

  const recenter = () => {
    if (!web.current || !webReady) return;

    web.current.postMessage(
      JSON.stringify({
        cmd: "recenter",
        user: user ? { lon: user.lon, lat: user.lat } : null,
        center: initialCenter,
        tee: teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat) ? teePoint : null,
        fairwayMid:
          fairwayMid && Number.isFinite(fairwayMid?.lon) && Number.isFinite(fairwayMid?.lat)
            ? fairwayMid
            : null,
        green: green
          ? {
            front: green.front || null,
            middle: green.middle || null,
            back: green.back || null,
            left: green.left || null,
            right: green.right || null,
          }
          : null,
        hazards: hazards.map((h) => ({
          id: h.id,
          number: h.number,
          typeKey: h.typeKey,
          typeLabel: h.typeLabel,
          lat: h.lat,
          lon: h.lon,
          yards: h.yards,
        })),
      })
    );
  };

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
          <WebView
            ref={web}
            source={{ html: buildHtml(initialCenter) }}
            style={styles.web}
            onLoadStart={() => setWebReady(false)}
            onMessage={(e) => {
              let msg = null;
              try {
                msg = JSON.parse(e?.nativeEvent?.data || "");
              } catch {
                msg = null;
              }

              if (msg?.cmd === "ready") {
                setWebReady(true);
              }
            }}
          />
        )}

        {!loading && !hazards.length ? (
          <View style={[styles.emptyTopNotice, { top: insets.top + 78 }]}>
            <Text style={styles.emptyTopNoticeT}>This hole has no hazards listed</Text>
          </View>
        ) : null}
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.floatingRowDual, { bottom: insets.bottom + 28 }]}
      >
        <Pressable
          onPress={() => setInfoOpen(true)}
          style={({ pressed }) => [styles.floatBtnHalf, pressed && styles.pressed]}
        >
          <Text style={styles.floatBtnT}>Hazard Info</Text>
        </Pressable>

        <Pressable
          onPress={recenter}
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

  web: {
    flex: 1,
    backgroundColor: "#000",
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

  emptyTopNotice: {
    position: "absolute",
    left: 14,
    right: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(0,0,0,0.58)",
    borderWidth: 1.25,
    borderColor: "rgba(46, 204, 113, 0.42)",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyTopNoticeT: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
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
    height: 50,
    paddingHorizontal: 18,
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