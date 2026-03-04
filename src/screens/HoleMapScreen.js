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
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import { MAPBOX_TOKEN } from "../config/mapbox";
import { loadCourseData, saveCourseData } from "../storage/courseData";
import { isAdmin as isAdminUser } from "../storage/courseDataRemote";
import * as RoundState from "../storage/roundState";

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

function teeKeyFromParams(teeObj) {
  const raw =
    (teeObj && (teeObj.key || teeObj.color || teeObj.name || teeObj.label)) || "";
  const k = String(raw).toLowerCase().trim();
  if (k.includes("gold")) return "gold";
  if (k.includes("blue")) return "blue";
  if (k.includes("red")) return "red";
  if (k.includes("white")) return "white";
  return "white";
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
    .dot{width:12px;height:12px;border-radius:999px;background:#2E86FF;border:2px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .pin{width:10px;height:10px;border-radius:999px;background:#fff;border:2px solid #000;box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .tee{width:11px;height:11px;border-radius:999px;background:#fff;border:2px solid rgba(0,0,0,.85);box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .fw{width:11px;height:11px;border-radius:3px;background:#FFD54A;border:2px solid rgba(0,0,0,.85);box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .haz{width:11px;height:11px;border-radius:2px;border:2px solid rgba(0,0,0,.85);box-shadow:0 8px 20px rgba(0,0,0,.35)}
    .hazWater{background:#2E7DFF}
    .hazBunker{background:#E7CBA1}
    .hazOB{background:#FF4D4D}
  </style>
  </head><body><div id="map"></div>
  <script>
    mapboxgl.accessToken="${MAPBOX_TOKEN}";
    const map = new mapboxgl.Map({
      container:"map",
      style:"mapbox://styles/mapbox/satellite-streets-v12",
      center:[${initLon},${initLat}],
      zoom:17
    });

    let u=null, tee=null, f=null, m=null, b=null, fw=null;
    let hazMarkers=[];
    const mk=(c)=>{const e=document.createElement("div");e.className=c;return e};

    let lastKey = "";
    let lastHolePoseKey = "";

    function keyFrom(d){
      const p = (x)=>x && isFinite(x.lon) && isFinite(x.lat) ? (x.lon.toFixed(6)+","+x.lat.toFixed(6)) : "";
      const hz = Array.isArray(d.hazards) ? String(d.hazards.length) : "0";
      return [
        p(d.user),
        p(d.center),
        p(d.tee),
        p(d.fairwayMid),
        p(d.green?.front),
        p(d.green?.middle),
        p(d.green?.back),
        hz
      ].join("|");
    }

    function poseKeyFrom(d){
      const p = (x)=>x && isFinite(x.lon) && isFinite(x.lat) ? (x.lon.toFixed(6)+","+x.lat.toFixed(6)) : "";
      return [
        p(d.tee),
        p(d.green?.middle),
        p(d.green?.back),
        p(d.green?.front),
        p(d.fairwayMid)
      ].join("|");
    }

    function bearingDeg(a,b){
      if(!a || !b) return null;
      if(!isFinite(a.lon)||!isFinite(a.lat)||!isFinite(b.lon)||!isFinite(b.lat)) return null;
      const φ1 = a.lat * Math.PI/180;
      const φ2 = b.lat * Math.PI/180;
      const Δλ = (b.lon - a.lon) * Math.PI/180;
      const y = Math.sin(Δλ) * Math.cos(φ2);
      const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
      let θ = Math.atan2(y,x) * 180/Math.PI; // from north, clockwise
      if(!isFinite(θ)) return null;
      θ = (θ + 360) % 360;
      return θ;
    }

    function frameHole(teeP, greenAim, points, bearing){
      const valid = (points || []).filter(p => p && isFinite(p.lon) && isFinite(p.lat));
      const offset = [0, 60]; // no left/right bias; only slight down-bias so green trends higher

      // If we have tee + green, prefer midpoint framing with a controlled zoom (tighter + centered)
      if(teeP && greenAim && isFinite(teeP.lon) && isFinite(teeP.lat) && isFinite(greenAim.lon) && isFinite(greenAim.lat)){
        const midLon = (teeP.lon + greenAim.lon) / 2;
        const midLat = (teeP.lat + greenAim.lat) / 2;

        // rough distance in meters (good enough for zoom selection)
        const dx = (greenAim.lon - teeP.lon) * 111320 * Math.cos(((teeP.lat + greenAim.lat)/2) * Math.PI/180);
        const dy = (greenAim.lat - teeP.lat) * 110540;
        const distM = Math.sqrt(dx*dx + dy*dy);

        // dynamic zoom: open wider by default so the whole hole is visible on first open
        let z = 17.05;
        if(distM > 420) z = 16.45;
        else if(distM > 320) z = 16.65;
        else if(distM > 220) z = 16.85;

        // clamp (slightly tighter)
        z = Math.max(16.2, Math.min(17.4, z));

        const opts = { center:[midLon, midLat], zoom:z, duration:520, offset };
        if(isFinite(bearing)) opts.bearing = bearing;
        map.easeTo(opts);
        return;
      }

      // Fallback: fit bounds (smaller padding so we don’t zoom out too much)
      if(valid.length === 1){
        // When only one hole point exists (ex: only tee), open wider so user can see context
        const opts = { center:[valid[0].lon, valid[0].lat], zoom:16.6, duration:450, offset };
        if(isFinite(bearing)) opts.bearing = bearing;
        map.easeTo(opts);
        return;
      }

      if(valid.length >= 2){
        let minLon=valid[0].lon, maxLon=valid[0].lon, minLat=valid[0].lat, maxLat=valid[0].lat;
        valid.forEach(p=>{
          minLon=Math.min(minLon,p.lon); maxLon=Math.max(maxLon,p.lon);
          minLat=Math.min(minLat,p.lat); maxLat=Math.max(maxLat,p.lat);
        });

        const padding = { top: 90, bottom: 90, left: 55, right: 55 };
        const opts = { padding, duration:650, offset, maxZoom:18.6 };
        if(isFinite(bearing)) opts.bearing = bearing;

        map.fitBounds([[minLon,minLat],[maxLon,maxLat]], opts);
      }
    }

    function clearHaz(){
      try{
        hazMarkers.forEach(m=>m.remove());
      }catch(_){}
      hazMarkers=[];
    }

    function applyPayload(d){
      if(d.user){
        u ? u.setLngLat([d.user.lon,d.user.lat])
          : u=new mapboxgl.Marker({element:mk("dot")}).setLngLat([d.user.lon,d.user.lat]).addTo(map);
      }

      if(d.tee){
        tee ? tee.setLngLat([d.tee.lon,d.tee.lat])
          : tee=new mapboxgl.Marker({element:mk("tee")}).setLngLat([d.tee.lon,d.tee.lat]).addTo(map);
      }

      if(d.fairwayMid){
        fw ? fw.setLngLat([d.fairwayMid.lon,d.fairwayMid.lat])
          : fw=new mapboxgl.Marker({element:mk("fw")}).setLngLat([d.fairwayMid.lon,d.fairwayMid.lat]).addTo(map);
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

      if(Array.isArray(d.hazards)){
        clearHaz();
        d.hazards.forEach((h)=>{
          if(!h || !isFinite(h.lon) || !isFinite(h.lat)) return;
          let cls="haz";
          if(h.type==="water") cls="haz hazWater";
          if(h.type==="bunker") cls="haz hazBunker";
          if(h.type==="ob") cls="haz hazOB";
          const mm = new mapboxgl.Marker({element:mk(cls)}).setLngLat([h.lon,h.lat]).addTo(map);
          hazMarkers.push(mm);
        });
      }

      if(d.cmd === "recenter"){
        const z = map.getZoom();
        const nextZ =
          (d.forceZoom === true) ? 18 :
          (z < 17.5 ? 18 : z);

        if(d.at && isFinite(d.at[0]) && isFinite(d.at[1])){
          map.easeTo({ center:d.at, zoom:nextZ, duration:420 });
        } else if(d.user){
          map.easeTo({ center:[d.user.lon, d.user.lat], zoom:nextZ, duration:420 });
        }
        return;
      }

      const nextKey = keyFrom(d);
      const changed = nextKey !== lastKey;

      if(changed && d.fit){
        // Fit to hole points only (tee -> green), rotate so green is "up", and offset so green sits near top.
        const holePts = [d.tee, d.fairwayMid, d.green?.front, d.green?.middle, d.green?.back].filter(Boolean);

        const teeP = d.tee || null;
        const greenAim = d.green?.middle || d.green?.back || d.green?.front || null;
        const brg = bearingDeg(teeP, greenAim);

        const poseKey = poseKeyFrom(d);
        const poseChanged = poseKey !== lastHolePoseKey;

        if(holePts.length) {
          // Prefer tee->green midpoint framing for tight/centered open
          frameHole(teeP, greenAim, holePts, brg);
        } else {
          // Fallback if no hole points exist yet
          frameHole(null, null, [d.center].filter(Boolean), null);
        }

        lastHolePoseKey = poseKey;
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

      // Tell React Native the map is truly ready to receive messages
      try{
        if(window.ReactNativeWebView){
          window.ReactNativeWebView.postMessage(JSON.stringify({ cmd:"ready" }));
        }
      }catch(_){}
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
  const params = route?.params || {};

  const goToHoleHub = () => {
    // Never allow backing into setup screens (Formats/Add Players/etc.)
    // Always return to Hole Hub as the root of the current session.
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ROUTES.HOLE_HUB, params }],
      })
    );
  };

  const insets = useSafeAreaInsets();
  const web = useRef(null);

  const screenW = Dimensions.get("window").width;

  const yardPos = useRef(new Animated.ValueXY({ x: 0, y: -120 })).current;
  const yardDockRef = useRef("right"); // "left" | "center" | "right"

  const [yardStacked, setYardStacked] = useState(true);

  // Default position: right-docked + stacked, but still draggable
  useEffect(() => {
    const panelHalfW = 60; // stacked width 120
    const edgePad = 8;
    const maxX = (screenW / 2) - panelHalfW - edgePad;

    yardDockRef.current = "right";
    setYardStacked(true);
    yardPos.setValue({ x: maxX, y: -120 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenW]);

  const didAutoCenterRef = useRef(false);
  const autoCenterWindowStartRef = useRef(0);
  const lastAutoCenterRef = useRef(null);

  const didInitialFrameRef = useRef(false);

  const course = params.course || null;
  const teeObj = params.tee || null;
  const holeMetaParam = params.holeMeta || null;

  const teeKey = teeKeyFromParams(teeObj);

  const [resolvedCourseId, setResolvedCourseId] = useState(
    pickCourseIdAny(params) || pickCourseIdAny({ course })
  );
  const [resolvedCourseName, setResolvedCourseName] = useState(
    pickCourseNameAny(params, pickCourseNameAny({ course }, "Course"))
  );
  const [resolvedCourseCenter, setResolvedCourseCenter] = useState(
    pickCourseCenterAny(params) || pickCourseCenterAny({ course }) || null
  );

  useEffect(() => {
    let live = true;

    (async () => {
      const cidNow = pickCourseIdAny({ courseId: resolvedCourseId, course });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const courseId = resolvedCourseId ? String(resolvedCourseId) : null;
  const courseName = String(resolvedCourseName || "Course");
  const courseCenter = resolvedCourseCenter || null;

  const [holeIndex, setHoleIndex] = useState(
    Number.isFinite(params.holeIndex) ? params.holeIndex : 0
  );
  const clampedHoleIndex = Math.max(0, Math.min(17, holeIndex));
  const holeNumber = clampedHoleIndex + 1;

  const [user, setUser] = useState(null);
  const [webReady, setWebReady] = useState(false);

  const [courseData, setCourseData] = useState(null);
  const [loadingCourseData, setLoadingCourseData] = useState(true);

  const admin = isAdminUser();

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

    const inAutoCenterWindow = () => {
      if (!autoCenterWindowStartRef.current)
        autoCenterWindowStartRef.current = Date.now();
      return Date.now() - autoCenterWindowStartRef.current <= 30000; // 30s
    };

    const isUsableFix = (p) => {
      if (!p || !p.coords) return false;

      const lat = p.coords.latitude;
      const lon = p.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

      if (Math.abs(lat) < 0.0001 && Math.abs(lon) < 0.0001) return false;

      const ts = Number.isFinite(p.timestamp) ? p.timestamp : Date.now();
      const ageMs = Date.now() - ts;

      // Allow rough fixes (we still want to center on the correct general area).
      if (ageMs > 300000) return false; // 5 min

      return true;
    };

    const maybeAutoCenter = (_p) => {
      // Disabled: we do NOT auto-recenter to user on open.
      // Camera framing is hole-based (tee->green). User can tap “GPS Active” to recenter.
      return;
    };

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") return;

      if (!autoCenterWindowStartRef.current)
        autoCenterWindowStartRef.current = Date.now();

      try {
        const p0 = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });
        if (!cancelled && p0?.coords) {
          const lat0 = p0.coords.latitude;
          const lon0 = p0.coords.longitude;
          if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
            setUser({ lat: lat0, lon: lon0 });
            maybeAutoCenter(p0);
          }
        }
      } catch {
        // ignore
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          distanceInterval: 2,
          timeInterval: 1000,
        },
        (p) => {
          if (!p?.coords) return;

          const lat = p.coords.latitude;
          const lon = p.coords.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

          setUser({ lat, lon });
          maybeAutoCenter(p);
        }
      );
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [webReady]);

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

  const teePoints = savedGps?.teePoints && typeof savedGps.teePoints === "object" ? savedGps.teePoints : null;
  const teePoint =
    (teePoints && teePoints[teeKey] && Number.isFinite(teePoints[teeKey]?.lat) && Number.isFinite(teePoints[teeKey]?.lon)
      ? teePoints[teeKey]
      : null) ||
    (savedGps?.tee && Number.isFinite(savedGps?.tee?.lat) && Number.isFinite(savedGps?.tee?.lon) ? savedGps.tee : null);

  const fairwayMid =
    savedGps?.fairway?.mid && Number.isFinite(savedGps?.fairway?.mid?.lat) && Number.isFinite(savedGps?.fairway?.mid?.lon)
      ? savedGps.fairway.mid
      : null;

  const hazardsArr = Array.isArray(savedGps?.hazards) ? savedGps.hazards : [];

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

  const initialCenter = useMemo(() => {
    // Prefer hole green middle, then tee point, then fairway mid, then course center
    if (green?.middle && Number.isFinite(green.middle?.lat) && Number.isFinite(green.middle?.lon)) {
      return { lon: green.middle.lon, lat: green.middle.lat };
    }
    if (teePoint && Number.isFinite(teePoint?.lat) && Number.isFinite(teePoint?.lon)) {
      return { lon: teePoint.lon, lat: teePoint.lat };
    }
    if (fairwayMid && Number.isFinite(fairwayMid?.lat) && Number.isFinite(fairwayMid?.lon)) {
      return { lon: fairwayMid.lon, lat: fairwayMid.lat };
    }
    if (center && Number.isFinite(center?.lat) && Number.isFinite(center?.lon)) {
      return { lon: center.lon, lat: center.lat };
    }
    return null;
  }, [green, teePoint, fairwayMid, center]);

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

  const yardPan = useMemo(() => {
    const edgeSnap = 70; // px from edge to trigger left/right dock
    const stackEdge = 95; // slightly deeper edge threshold to enable stacked layout

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        yardPos.setOffset({ x: yardPos.x.__getValue(), y: yardPos.y.__getValue() });
        yardPos.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: Animated.event(
        [null, { dx: yardPos.x, dy: yardPos.y }],
        { useNativeDriver: false }
      ),

      onPanResponderRelease: (_evt, gesture) => {
        yardPos.flattenOffset();

        const currentX = yardPos.x.__getValue();
        const absX = Math.abs(currentX);

        // Decide dock target
        let dock = "center";
        if (currentX < -(screenW / 2 - edgeSnap)) dock = "left";
        if (currentX > (screenW / 2 - edgeSnap)) dock = "right";

        // Stacked only when docked left/right
        const shouldStack =
          dock === "left"
            ? currentX < -(screenW / 2 - stackEdge)
            : dock === "right"
              ? currentX > (screenW / 2 - stackEdge)
              : false;

        yardDockRef.current = dock;
        setYardStacked(!!shouldStack);

        // Snap positions
        // Clamp X so panel never goes off-screen (wide vs stacked)
        const isStack = !!shouldStack;
        const panelHalfW = isStack ? 60 : (screenW * 0.92) / 2; // stacked width 120, wide width 92%
        const edgePad = 8;
        const maxX = (screenW / 2) - panelHalfW - edgePad;

        const snapX =
          dock === "left"
            ? -maxX
            : dock === "right"
              ? maxX
              : 0;

        // Keep Y where user dropped it (float). Clamp so it stays on-screen.
        // Negative Y moves up. Positive Y moves down.
        const maxUp = -520;
        const maxDown = 40;
        const snapY = Math.max(maxUp, Math.min(maxDown, yardPos.y.__getValue()));

        Animated.spring(yardPos, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          speed: 18,
          bounciness: 6,
        }).start();
      },
    });
  }, [yardPos, screenW]);

  const postPayload = (fit = false) => {
    if (!web.current || !webReady) return;

    const payload = {
      user: user ? { lon: user.lon, lat: user.lat } : null,
      center,
      tee: teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat) ? teePoint : null,
      fairwayMid: fairwayMid && Number.isFinite(fairwayMid?.lon) && Number.isFinite(fairwayMid?.lat) ? fairwayMid : null,
      green: green
        ? {
          front: green.front || null,
          middle: green.middle || null,
          back: green.back || null,
        }
        : null,
      hazards: hazardsArr
        .map((h) => {
          if (!h) return null;
          const lat = h.lat;
          const lon = h.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          return { type: h.type || "bunker", lat, lon };
        })
        .filter(Boolean),
      fit,
    };

    web.current.postMessage(JSON.stringify(payload));
  };

  const hasHoleFramePoints = useMemo(() => {
    const tOk = !!(teePoint && Number.isFinite(teePoint?.lat) && Number.isFinite(teePoint?.lon));
    const g = green;
    const gOk = !!(
      (g?.middle && Number.isFinite(g.middle?.lat) && Number.isFinite(g.middle?.lon)) ||
      (g?.back && Number.isFinite(g.back?.lat) && Number.isFinite(g.back?.lon)) ||
      (g?.front && Number.isFinite(g.front?.lat) && Number.isFinite(g.front?.lon))
    );
    return tOk && gOk;
  }, [teePoint, green]);

  // Stability: initial frame happens exactly once, only when we have real hole points loaded.
  useEffect(() => {
    if (!webReady) return;
    if (loadingCourseData) return;
    if (!hasHoleFramePoints) return;
    if (didInitialFrameRef.current) return;

    didInitialFrameRef.current = true;
    postPayload(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webReady, loadingCourseData, hasHoleFramePoints, clampedHoleIndex]);

  // Stability: do NOT frame on webReady alone. We wait until course data + hole points exist.
  useEffect(() => {
    // no-op (framing handled by the stable initial-frame effect below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webReady, clampedHoleIndex, center, teePoint, fairwayMid, green, hazardsArr.length]);

  // User updates: update blue dot only, do not reframe camera
  useEffect(() => {
    postPayload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  function recenter() {
    if (!web.current || !webReady) return;

    const payload = {
      cmd: "recenter",
      at: user ? [user.lon, user.lat] : null,
      user: user ? { lon: user.lon, lat: user.lat } : null,
      forceZoom: true,
    };

    web.current.postMessage(JSON.stringify(payload));
  }

  useEffect(() => {
    didAutoCenterRef.current = false;
    autoCenterWindowStartRef.current = Date.now();
    lastAutoCenterRef.current = null;

    // New hole = allow one stable initial frame again
    didInitialFrameRef.current = false;
  }, [clampedHoleIndex]);

  const [setupOpen, setSetupOpen] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);

  const canSet = useMemo(() => {
    return admin && !!user && Number.isFinite(user?.lat) && Number.isFinite(user?.lon);
  }, [admin, user]);

  const currentAccuracyText = useMemo(() => {
    if (!user) return "Waiting for GPS…";
    return "GPS ready";
  }, [user]);

  async function setTeeColor(colorKey) {
    if (!admin) return;
    if (!courseId) {
      Alert.alert("Set point unavailable", "No courseId in route params.");
      return;
    }
    if (!canSet) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);
      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};

      const existingTeePoints =
        holeObj.teePoints && typeof holeObj.teePoints === "object" ? holeObj.teePoints : {};

      const nextTeePoints = {
        ...existingTeePoints,
        [colorKey]: { lat: user.lat, lon: user.lon },
      };

      const nextHoleObj = {
        ...holeObj,
        teePoints: nextTeePoints,
        // keep legacy tee populated for safety
        tee: holeObj.tee && Number.isFinite(holeObj.tee?.lat) && Number.isFinite(holeObj.tee?.lon)
          ? holeObj.tee
          : { lat: user.lat, lon: user.lon },
      };

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
        Alert.alert("Saved", `Tee (${colorKey}) saved for Hole ${holeNumber}.`);
      }
    } finally {
      setSavingSetup(false);
    }
  }

  async function setFairwayMid() {
    if (!admin) return;
    if (!courseId) {
      Alert.alert("Set point unavailable", "No courseId in route params.");
      return;
    }
    if (!canSet) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);
      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};

      const nextHoleObj = {
        ...holeObj,
        fairway: {
          ...(holeObj.fairway && typeof holeObj.fairway === "object" ? holeObj.fairway : {}),
          mid: { lat: user.lat, lon: user.lon },
        },
      };

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
        Alert.alert("Saved", `Fairway mid saved for Hole ${holeNumber}.`);
      }
    } finally {
      setSavingSetup(false);
    }
  }

  async function addHazard(type) {
    if (!admin) return;
    if (!courseId) {
      Alert.alert("Set point unavailable", "No courseId in route params.");
      return;
    }
    if (!canSet) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);
      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};

      const existingHaz = Array.isArray(holeObj.hazards) ? holeObj.hazards : [];

      const nextHaz = [
        ...existingHaz,
        { type, lat: user.lat, lon: user.lon, createdAt: Date.now() },
      ];

      const nextHoleObj = { ...holeObj, hazards: nextHaz };

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
        Alert.alert("Saved", `${type.toUpperCase()} hazard saved for Hole ${holeNumber}.`);
      }
    } finally {
      setSavingSetup(false);
    }
  }

  async function undoLastHazard() {
    if (!admin) return;
    if (!courseId) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);

      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};
      const existingHaz = Array.isArray(holeObj.hazards) ? holeObj.hazards : [];
      if (!existingHaz.length) return;

      const nextHaz = existingHaz.slice(0, -1);

      const next = {
        ...existing,
        gps: {
          ...gps,
          holes: {
            ...holes,
            [hKey]: { ...holeObj, hazards: nextHaz },
          },
        },
      };

      const ok = await saveCourseData(cid, next);
      if (ok) {
        await reloadCourseData();
        postPayload(true);
        Alert.alert("Undone", "Removed last hazard point.");
      }
    } finally {
      setSavingSetup(false);
    }
  }

  function lockGreenPoints() {
    if (!admin) return;

    if (!courseId) {
      Alert.alert("Lock unavailable", "No courseId in route params.");
      return;
    }

    if (!canLockNow) {
      Alert.alert(
        "Not ready to lock",
        "To lock green points, you must have Front/Mid/Back saved for all 18 holes."
      );
      return;
    }

    Alert.alert(
      "Lock green points?",
      "After locking, green points cannot be overwritten.\n\nIf you ever need to start over, use “Wipe this course” from Course Data.",
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

  const teeSetGold = !!(teePoints?.gold && Number.isFinite(teePoints?.gold?.lat) && Number.isFinite(teePoints?.gold?.lon));
  const teeSetBlue = !!(teePoints?.blue && Number.isFinite(teePoints?.blue?.lat) && Number.isFinite(teePoints?.blue?.lon));
  const teeSetWhite = !!(teePoints?.white && Number.isFinite(teePoints?.white?.lat) && Number.isFinite(teePoints?.white?.lon));
  const teeSetRed = !!(teePoints?.red && Number.isFinite(teePoints?.red?.lat) && Number.isFinite(teePoints?.red?.lon));

  const fwSet = !!(fairwayMid && Number.isFinite(fairwayMid?.lat) && Number.isFinite(fairwayMid?.lon));

  const hazCounts = useMemo(() => {
    const out = { bunker: 0, water: 0, ob: 0, total: 0 };
    hazardsArr.forEach((h) => {
      if (!h || !h.type) return;
      if (h.type === "bunker") out.bunker += 1;
      if (h.type === "water") out.water += 1;
      if (h.type === "ob") out.ob += 1;
      out.total += 1;
    });
    return out;
  }, [hazardsArr]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapWrap}>
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
            if (msg?.cmd === "ready") setWebReady(true);
          }}
        />
      </View>

      <View style={[styles.top, { top: insets.top + 10 }]}>
        <Pressable onPress={goToHoleHub} style={styles.topBtn}>
          <Text style={styles.topBtnT}>Back</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {courseName}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Hole {holeNumber}
            {par ? ` • Par ${par}` : ""}
            {si ? ` • SI ${si}` : ""}
          </Text>
        </View>

        <Pressable onPress={() => setSetupOpen(true)} style={styles.setupBtn}>
          <Text style={styles.setupBtnT}>Setup</Text>
        </Pressable>
      </View>

      {/* GPS chip moved to bottom stack (below yardage panel) */}

      <View style={[styles.bottomWrap, { paddingBottom: insets.bottom + 40 }]}>
        <Animated.View
          {...yardPan.panHandlers}
          style={[
            styles.yardPanel,
            { transform: [{ translateX: yardPos.x }, { translateY: yardPos.y }] },
            yardStacked ? styles.yardPanelStacked : styles.yardPanelWide,
          ]}
        >
          <View style={yardStacked ? styles.yColStackWrap : styles.yRow3}>
            <View style={[styles.yCol, yardStacked && styles.yColStack]}>
              <Text style={styles.yLabelCol}>BACK</Text>
              <Text style={styles.yValCol}>{distVals.back}</Text>
              <Text style={styles.yUnitCol}>YDS</Text>
            </View>

            <View style={[styles.yCol, yardStacked && styles.yColStack]}>
              <Text style={styles.yLabelCol}>MID</Text>
              <Text style={styles.yValCol}>{distVals.middle}</Text>
              <Text style={styles.yUnitCol}>YDS</Text>
            </View>

            <View style={[styles.yCol, yardStacked && styles.yColStack]}>
              <Text style={styles.yLabelCol}>FRONT</Text>
              <Text style={styles.yValCol}>{distVals.front}</Text>
              <Text style={styles.yUnitCol}>YDS</Text>
            </View>
          </View>

          {!green?.front && !green?.middle && !green?.back ? (
            <Text style={styles.yHint}>No green points loaded for this course.</Text>
          ) : null}
        </Animated.View>

        <Pressable onPress={recenter} style={({ pressed }) => [styles.gpsChipBottom, pressed && styles.pressed]}>
          <View style={styles.gpsDot} />
          <Text style={styles.gpsChipT}>GPS Active</Text>
          <Text style={styles.gpsChipS}>Tap to re-center</Text>
        </Pressable>

        <Pressable
          onPress={goToHoleHub}
          style={({ pressed }) => [styles.backHubBtn, pressed && styles.pressed]}
        >
          <Text style={styles.backHubBtnT}>Back to Hole Hub</Text>
        </Pressable>
      </View>

      <Modal visible={setupOpen} transparent animationType="fade" onRequestClose={() => setSetupOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSetupOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalCard}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Course Mapping Setup</Text>
              <Pressable onPress={() => setSetupOpen(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseT}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.modalSub}>
              {admin ? "Stand on the point and tap Set/Add. You can save multiple hazards per hole." : "Read-only for guests."}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holePills}>
              {Array.from({ length: 18 }).map((_, i) => {
                const h = i + 1;
                const active = h === holeNumber;
                return (
                  <Pressable
                    key={h}
                    onPress={() => setHoleIndex(h - 1)}
                    style={({ pressed }) => [styles.holePill, active && styles.holePillActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.holePillT, active && styles.holePillTActive]}>{h}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {loadingCourseData ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator />
                  <Text style={styles.modalLoadingT}>Loading course data…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.lockRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lockTitle}>{gpsLocked ? "Green points are locked" : "Green points are editable"}</Text>
                      <Text style={styles.lockSub}>
                        {!admin
                          ? "Guests cannot set or lock points."
                          : gpsLocked
                            ? "Set buttons for greens are disabled forever (safeguard)."
                            : canLockNow
                              ? "All 18 holes complete — you can lock now."
                              : "Lock becomes available after all 18 holes have Front/Mid/Back saved."}
                      </Text>
                    </View>

                    {admin && !gpsLocked ? (
                      <Pressable
                        onPress={lockGreenPoints}
                        disabled={!canLockNow}
                        style={({ pressed }) => [styles.lockBtn, pressed && styles.pressed, !canLockNow && { opacity: 0.45 }]}
                      >
                        <Text style={styles.lockBtnT}>Lock</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.lockPill}>
                        <Text style={styles.lockPillT}>{gpsLocked ? "LOCKED" : "READ ONLY"}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.gpsStatus}>{currentAccuracyText}</Text>

                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Tee points</Text>
                    <Text style={styles.sectionSub}>Gold / Blue / White / Red</Text>
                  </View>

                  <View style={styles.setRow2}>
                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => setTeeColor("gold")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Tee (Gold)</Text>
                      <Text style={styles.setBtnS}>{teeSetGold ? "Saved" : "Not set"}</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => setTeeColor("blue")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Tee (Blue)</Text>
                      <Text style={styles.setBtnS}>{teeSetBlue ? "Saved" : "Not set"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.setRow2}>
                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => setTeeColor("white")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Tee (White)</Text>
                      <Text style={styles.setBtnS}>{teeSetWhite ? "Saved" : "Not set"}</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => setTeeColor("red")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Tee (Red)</Text>
                      <Text style={styles.setBtnS}>{teeSetRed ? "Saved" : "Not set"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Fairway</Text>
                    <Text style={styles.sectionSub}>Midpoint</Text>
                  </View>

                  <Pressable
                    disabled={!canSet || savingSetup}
                    onPress={setFairwayMid}
                    style={({ pressed }) => [
                      styles.setTeeBtn,
                      pressed && styles.pressed,
                      (!canSet || savingSetup) && { opacity: 0.45 },
                    ]}
                  >
                    <Text style={styles.setTeeBtnT}>Set Fairway Mid</Text>
                    <Text style={styles.setTeeBtnS}>{fwSet ? "Saved" : "Not set"}</Text>
                  </Pressable>

                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Hazards</Text>
                    <Text style={styles.sectionSub}>
                      Bunker {hazCounts.bunker} • Water {hazCounts.water} • OB {hazCounts.ob}
                    </Text>
                  </View>

                  <View style={styles.setRow}>
                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("bunker")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add Bunker</Text>
                      <Text style={styles.setBtnS}>Adds a point</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("water")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add Water</Text>
                      <Text style={styles.setBtnS}>Adds a point</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("ob")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add OB</Text>
                      <Text style={styles.setBtnS}>Adds a point</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    disabled={!admin || savingSetup || hazCounts.total === 0}
                    onPress={undoLastHazard}
                    style={({ pressed }) => [
                      styles.undoBtn,
                      pressed && styles.pressed,
                      (!admin || savingSetup || hazCounts.total === 0) && { opacity: 0.45 },
                    ]}
                  >
                    <Text style={styles.undoBtnT}>Undo last hazard</Text>
                    <Text style={styles.undoBtnS}>{hazCounts.total ? `${hazCounts.total} total saved` : "None saved"}</Text>
                  </Pressable>

                  <Text style={styles.modalHint}>
                    Tip: tap “GPS Active” to re-center before saving points. You can add multiple hazards per hole.
                  </Text>

                  <Pressable
                    onPress={() => setSetupOpen(false)}
                    style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.closeBtnT}>Close</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
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
  mapWrap: { flex: 1, position: "relative" },
  web: { flex: 1 },

  backHubBtn: {
    width: "92%",
    alignSelf: "center",
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.52)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  backHubBtnT: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    letterSpacing: 0.5,
  },

  top: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between",
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

  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },

  setupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(46,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  setupBtnT: { color: "#fff", fontWeight: "900" },

  yardPanel: {
    alignSelf: "center",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  yardPanelWide: {
    width: "92%",
  },

  yardPanelStacked: {
    width: 120,
  },

  yColStackWrap: {
    gap: 8,
  },

  yColStack: {
    width: "100%",
  },

  yRow3: {
    flexDirection: "row",
    gap: 10,
  },

  yCol: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#2E7DFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  yLabelCol: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  yValCol: { marginTop: 6, color: "#fff", fontWeight: "900", fontSize: 22 },
  yUnitCol: {
    marginTop: 6,
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

  gpsChipWrap: { position: "absolute", left: 14, right: 14, alignItems: "center" },
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

  gpsChipBottom: {
    width: "92%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(46,125,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.26)",
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

  bottomWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 0,
    gap: 8,
    zIndex: 50,
    elevation: 50,
  },

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

  modalBody: { maxHeight: 520, paddingHorizontal: 14, paddingTop: 6 },
  modalBodyContent: { paddingBottom: 16 },
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
  setRow2: { flexDirection: "row", gap: 10, marginBottom: 10 },

  setTeeBtn: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(46, 204, 113, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.28)",
    marginBottom: 10,
  },
  setTeeBtnT: { color: "#fff", fontWeight: "900", fontSize: 16 },
  setTeeBtnS: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

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

  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, marginBottom: 8 },
  sectionTitle: { color: "#fff", fontWeight: "900" },
  sectionSub: { color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },

  undoBtn: {
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    marginTop: 10,
  },
  undoBtnT: { color: "#fff", fontWeight: "900" },
  undoBtnS: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

  modalHint: { marginTop: 12, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 17 },

  closeBtn: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  closeBtnT: { color: "#fff", fontWeight: "900", fontSize: 15 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});