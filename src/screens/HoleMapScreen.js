// src/screens/HoleMapScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  Image,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { doc, getDoc } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import { auth, db } from "../firebase/firebase";
import { MAPBOX_TOKEN } from "../config/mapbox";
import { getTeesForCourse } from "../services/tees";
import { loadCourseData, saveCourseData } from "../storage/courseData";
import { isAdmin as isAdminUser } from "../storage/courseDataRemote";
import * as RoundState from "../storage/roundState";

const CLUB_ICON = require("../../assets/club-icon.jpg");
const BULLSEYE_ICON = require("../../assets/bullseye-icon.png");

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

function safeTrim(v) {
  return String(v ?? "").trim();
}

function safePlayerId(p, fallback = "") {
  return String(p?.id ?? p?.uid ?? p?.playerId ?? fallback ?? "");
}

function normalizeBag(bag) {
  const arr = Array.isArray(bag) ? bag : [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      category: safeTrim(x.category),
      model: safeTrim(x.model),
      selectedOptions: Array.isArray(x.selectedOptions)
        ? x.selectedOptions.map((v) => safeTrim(v)).filter(Boolean)
        : [],
    }))
    .filter((x) => x.category.length > 0);
}

function formatWoodLabel(option) {
  const raw = safeTrim(option);
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  const m = compact.match(/^(\d+)w$/);
  if (m) return `${m[1]}W`;
  if (/^\d+\s*wood$/i.test(raw)) {
    const n = raw.match(/(\d+)/)?.[1];
    return n ? `${n}W` : "W";
  }
  return "W";
}

function formatHybridLabel(option) {
  const raw = safeTrim(option);
  const compact = raw.toLowerCase().replace(/\s+/g, "");
  const m = compact.match(/^(\d+)h$/);
  if (m) return `${m[1]}HY`;
  if (/^\d+\s*hybrid$/i.test(raw)) {
    const n = raw.match(/(\d+)/)?.[1];
    return n ? `${n}HY` : "HY";
  }
  return "HY";
}

function clubOrderRank(label) {
  const raw = safeTrim(label).toUpperCase();

  if (raw === "DR") return 0;

  const woodMatch = raw.match(/^(\d+)W$/);
  if (woodMatch) return 10 + Number(woodMatch[1]);

  if (raw === "W") return 19;
  if (raw === "U") return 20;

  const hybridMatch = raw.match(/^(\d+)HY$/);
  if (hybridMatch) return 30 + Number(hybridMatch[1]);

  if (raw === "HY") return 39;

  const ironMatch = raw.match(/^([1-9])I$/);
  if (ironMatch) return 40 + Number(ironMatch[1]);

  if (raw === "PW") return 50;
  if (raw === "AW") return 51;
  if (raw === "GW") return 52;
  if (raw === "SW") return 53;
  if (raw === "LW") return 54;

  const loftMatch = raw.match(/^(\d{2})$/);
  if (loftMatch) return 60 + Number(loftMatch[1]);

  return 999;
}

function buildClubOptionsFromBag(bag) {
  const out = [];

  for (const item of normalizeBag(bag)) {
    const category = safeTrim(item.category);
    const categoryKey = category.toLowerCase();
    const selected = Array.isArray(item.selectedOptions)
      ? item.selectedOptions.map((v) => safeTrim(v)).filter(Boolean)
      : [];

    if (categoryKey === "driver") {
      out.push("DR");
      continue;
    }

    if (categoryKey === "woods") {
      if (selected.length) {
        selected.forEach((option) => out.push(formatWoodLabel(option)));
      } else {
        out.push("W");
      }
      continue;
    }

    if (categoryKey === "hybrids") {
      if (selected.length) {
        selected.forEach((option) => out.push(formatHybridLabel(option)));
      } else {
        out.push("HY");
      }
      continue;
    }

    if (categoryKey === "driving iron") {
      if (selected.length) {
        selected.forEach((option) => out.push(String(option).toUpperCase()));
      } else {
        out.push("U");
      }
      continue;
    }

    if (categoryKey === "irons" || categoryKey === "wedges") {
      if (selected.length) {
        selected.forEach((option) => {
          const raw = safeTrim(option).toUpperCase();
          const degreeMatch = raw.match(/^(\d{2})°$/);
          if (degreeMatch) {
            out.push(degreeMatch[1]);
            return;
          }
          out.push(raw);
        });
      }
      continue;
    }

    if (/^\d+\s*wood$/i.test(category)) {
      out.push(formatWoodLabel(category));
      continue;
    }

    if (/^\d+\s*hybrid$/i.test(category) || categoryKey === "hybrid") {
      out.push(formatHybridLabel(category));
      continue;
    }
  }

  const uniqueSorted = Array.from(new Set(out.filter(Boolean))).sort((a, b) => {
    const rankDiff = clubOrderRank(a) - clubOrderRank(b);
    if (rankDiff !== 0) return rankDiff;
    return String(a).localeCompare(String(b));
  });

  if (uniqueSorted.length <= 14) {
    return uniqueSorted;
  }

  const next = [...uniqueSorted];

  const findHighestIndex = (matcher) => {
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (matcher(next[i])) return i;
    }
    return -1;
  };

  const removeUtility = () => {
    const idx = findHighestIndex((label) => String(label).toUpperCase() === "U");
    if (idx >= 0) {
      next.splice(idx, 1);
      return true;
    }
    return false;
  };

  const removeHighestHybrid = () => {
    const idx = findHighestIndex((label) => /^\d+HY$/i.test(label) || String(label).toUpperCase() === "HY");
    if (idx >= 0) {
      next.splice(idx, 1);
      return true;
    }
    return false;
  };

  const removeHighestWood = () => {
    const idx = findHighestIndex((label) => /^\d+W$/i.test(label) || String(label).toUpperCase() === "W");
    if (idx >= 0) {
      next.splice(idx, 1);
      return true;
    }
    return false;
  };

  while (next.length > 14) {
    if (removeUtility()) continue;
    if (removeHighestHybrid()) continue;
    if (removeHighestWood()) continue;
    next.pop();
  }

  return next;
}

function resolveMyPlayerFromRoster(roster) {
  const list = Array.isArray(roster) ? roster : [];
  const meUid = safeTrim(auth?.currentUser?.uid);

  const bySource = list.find((p) => safeTrim(p?.source).toLowerCase() === "me");
  if (bySource) {
    return {
      playerId: safePlayerId(bySource),
      playerName: safeTrim(bySource?.name || bySource?.displayName || bySource?.fullName || "Player"),
    };
  }

  if (meUid) {
    const byUid = list.find((p) => safeTrim(p?.uid || p?.userId) === meUid);
    if (byUid) {
      return {
        playerId: safePlayerId(byUid),
        playerName: safeTrim(byUid?.name || byUid?.displayName || byUid?.fullName || "Player"),
      };
    }
  }

  const byMeId = list.find((p) => safeTrim(p?.id).toLowerCase() === "me");
  if (byMeId) {
    return {
      playerId: safePlayerId(byMeId),
      playerName: safeTrim(byMeId?.name || byMeId?.displayName || byMeId?.fullName || "Player"),
    };
  }

  return { playerId: "", playerName: "" };
}

function teeKeyFromParams(teeObj) {
  const rawCode = String(
    teeObj?.code || teeObj?.key || teeObj?.color || ""
  )
    .trim()
    .toUpperCase();

  if (rawCode) return rawCode;

  const rawName = String(
    teeObj?.name || teeObj?.label || ""
  )
    .trim()
    .toUpperCase();

  if (rawName) {
    return rawName.replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "WHITE";
  }

  return "WHITE";
}

function legacyTeeKeyFromCode(code) {
  const normalized = String(code || "").trim().toUpperCase();

  if (normalized === "BLACK" || normalized === "GOLD") return "gold";
  if (normalized === "BLUE") return "blue";
  if (normalized === "WHITE") return "white";
  if (normalized === "RED") return "red";
  return normalized ? normalized.toLowerCase() : "";
}

function getSavedTeePoint(teePoints, code) {
  if (!teePoints || typeof teePoints !== "object") return null;

  const normalized = String(code || "").trim().toUpperCase();
  const legacyKey = legacyTeeKeyFromCode(normalized);

  const direct =
    normalized &&
      teePoints?.[normalized] &&
      Number.isFinite(teePoints?.[normalized]?.lat) &&
      Number.isFinite(teePoints?.[normalized]?.lon)
      ? teePoints[normalized]
      : null;

  if (direct) return direct;

  const legacy =
    legacyKey &&
      teePoints?.[legacyKey] &&
      Number.isFinite(teePoints?.[legacyKey]?.lat) &&
      Number.isFinite(teePoints?.[legacyKey]?.lon)
      ? teePoints[legacyKey]
      : null;

  return legacy || null;
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
    .teeDot{width:12px;height:12px;border-radius:999px;background:#F2C94C;border:2px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,.35)}

    /* Planner target */
    .tgtWrap{width:30px;height:30px;display:flex;align-items:center;justify-content:center}
    .tgtRing{width:22px;height:22px;border-radius:999px;border:2px solid rgba(255,255,255,0.95);background:rgba(255,255,255,0.12);box-shadow:0 10px 22px rgba(0,0,0,.38)}
    .tgtCore{position:absolute;width:9px;height:9px;border-radius:999px;background:#fff;box-shadow:0 8px 18px rgba(0,0,0,.35)}

    /* Floating distance labels */
    .distLbl{
      position:absolute;
      padding:6px 10px;
      border-radius:999px;
      background:rgba(0,0,0,0.62);
      border:1px solid rgba(255,255,255,0.16);
      color:#fff;
      font-weight:900;
      font-size:12px;
      letter-spacing:.6px;
      transform:translate(-50%,-50%);
      white-space:nowrap;
      pointer-events:auto;
      box-shadow:0 10px 22px rgba(0,0,0,.35);
    }
    #lbl1,#lbl2{display:none}
  </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="lbl1" class="distLbl"></div>
    <div id="lbl2" class="distLbl"></div>

  <script>
    mapboxgl.accessToken="${MAPBOX_TOKEN}";
    const map = new mapboxgl.Map({
      container:"map",
      style:"mapbox://styles/mapbox/satellite-streets-v12",
      center:[${initLon},${initLat}],
      zoom:17
    });

    let u=null;
    const mk=(c)=>{const e=document.createElement("div");e.className=c;return e};

    // Planner state
    let plannerOn = true;
    let tgt = null;          // {lon,lat}
    let greenMid = null;     // {lon,lat}
    let userPt = null;       // {lon,lat}
    let tgtMarker = null;
    let shotArmed = false;

    // Drive measurement state
    let teeOrigin = null;    // {lon,lat}
    let teeMarker = null;

    const lbl1 = document.getElementById("lbl1");
    const lbl2 = document.getElementById("lbl2");

    function bindLabelTap(el, kind){
      if (!el || el.__lgBound) return;
      el.__lgBound = true;

      el.addEventListener("click", () => {
        try {
          if(window.ReactNativeWebView){
            window.ReactNativeWebView.postMessage(JSON.stringify({
              cmd: "tapDistanceLabel",
              kind
            }));
          }
        } catch(_) {}
      });

      el.addEventListener("touchend", (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        try {
          if(window.ReactNativeWebView){
            window.ReactNativeWebView.postMessage(JSON.stringify({
              cmd: "tapDistanceLabel",
              kind
            }));
          }
        } catch(_) {}
      }, { passive: false });
    }

    bindLabelTap(lbl1, "primary");
    bindLabelTap(lbl2, "secondary");

    function toRad(v){ return (v*Math.PI)/180; }
    function haversineM(a,b){
      if(!a||!b) return NaN;
      if(!isFinite(a.lon)||!isFinite(a.lat)||!isFinite(b.lon)||!isFinite(b.lat)) return NaN;
      const R=6371000;
      const dLat=toRad(b.lat-a.lat);
      const dLon=toRad(b.lon-a.lon);
      const s1=Math.sin(dLat/2);
      const s2=Math.sin(dLon/2);
      const x=s1*s1+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*s2*s2;
      return 2*R*Math.asin(Math.sqrt(x));
    }
    function yds(m){
      if(!isFinite(m)) return "—";
      return String(Math.round(m*1.09361));
    }

    function ensurePlannerLayers(){
      if(!map.getSource("lg_planner_line")){
        map.addSource("lg_planner_line", {
          type: "geojson",
          data: { type:"FeatureCollection", features: [] }
        });

        map.addLayer({
          id: "lg_planner_line_layer",
          type: "line",
          source: "lg_planner_line",
          paint: {
            "line-color": "#FFFFFF",
            "line-width": 3.0,
            "line-opacity": 0.95
          }
        });

        map.addLayer({
          id: "lg_planner_line_layer_glow",
          type: "line",
          source: "lg_planner_line",
          paint: {
            "line-color": "#000000",
            "line-width": 5.5,
            "line-opacity": 0.35
          }
        }, "lg_planner_line_layer");
      }

      if(!map.getSource("lg_drive_line")){
        map.addSource("lg_drive_line", {
          type: "geojson",
          data: { type:"FeatureCollection", features: [] }
        });

        map.addLayer({
          id: "lg_drive_line_layer",
          type: "line",
          source: "lg_drive_line",
          paint: {
            "line-color": "#FFFFFF",
            "line-width": 3.0,
            "line-opacity": 0.95
          }
        });

        map.addLayer({
          id: "lg_drive_line_layer_glow",
          type: "line",
          source: "lg_drive_line",
          paint: {
            "line-color": "#000000",
            "line-width": 5.5,
            "line-opacity": 0.35
          }
        }, "lg_drive_line_layer");
      }
    }

    function setPlannerLine(a,b,c){
      if(!map.getSource("lg_planner_line")) return;

      const feats = [];
      if(a && b){
        feats.push({
          type:"Feature",
          geometry:{ type:"LineString", coordinates:[[a.lon,a.lat],[b.lon,b.lat]] },
          properties:{ seg:"ab" }
        });
      }
      if(b && c){
        feats.push({
          type:"Feature",
          geometry:{ type:"LineString", coordinates:[[b.lon,b.lat],[c.lon,c.lat]] },
          properties:{ seg:"bc" }
        });
      }

      map.getSource("lg_planner_line").setData({
        type:"FeatureCollection",
        features: feats
      });
    }

    function setDriveLine(a,b){
      if(!map.getSource("lg_drive_line")) return;

      const feats = [];
      if(a && b){
        feats.push({
          type:"Feature",
          geometry:{ type:"LineString", coordinates:[[a.lon,a.lat],[b.lon,b.lat]] },
          properties:{ seg:"drive" }
        });
      }

      map.getSource("lg_drive_line").setData({
        type:"FeatureCollection",
        features: feats
      });
    }

    function ensureTeeMarker(){
      if(!teeOrigin) return;
      if(teeMarker){
        teeMarker.setLngLat([teeOrigin.lon, teeOrigin.lat]);
        return;
      }

      teeMarker = new mapboxgl.Marker({ element: mk("teeDot") })
        .setLngLat([teeOrigin.lon, teeOrigin.lat])
        .addTo(map);
    }

    function showLabels(show){
      lbl1.style.display = show ? "block" : "none";
      lbl2.style.display = show ? "block" : "none";
    }

    function posLabel(el, a, b){
      if(!a || !b) return;
      const mid = { lon:(a.lon+b.lon)/2, lat:(a.lat+b.lat)/2 };
      const p = map.project([mid.lon, mid.lat]);
      el.style.left = p.x + "px";
      el.style.top  = p.y + "px";
    }

    function updatePlannerUI(){
      const plannerOk = plannerOn && greenMid && (teeOrigin || userPt);
      const driveOk = teeOrigin && userPt;

      let teeToUserM = NaN;
      let userToGreenM = NaN;
      let userNearHoleArea = false;

      if (teeOrigin && userPt) {
        teeToUserM = haversineM(teeOrigin, userPt);
      }

      if (greenMid && userPt) {
        userToGreenM = haversineM(userPt, greenMid);
      }

      userNearHoleArea =
        !!(
          userPt &&
          (
            (isFinite(teeToUserM) && teeToUserM <= 120) ||
            (isFinite(userToGreenM) && userToGreenM <= 220)
          )
        );

      const passiveInPlay = !!(!shotArmed && userNearHoleArea && isFinite(teeToUserM) && teeToUserM > 5.5);
      const showDriveLine = !!(driveOk && shotArmed);

      lbl1.style.display = plannerOk ? "block" : "none";
      lbl2.style.display = "none";

      if(!plannerOn){
        if(tgtMarker){ try{ tgtMarker.remove(); }catch(_){ } tgtMarker=null; }
        if(teeMarker){ try{ teeMarker.remove(); }catch(_){ } teeMarker=null; }
        setPlannerLine(null,null,null);
        setDriveLine(null,null);
        showLabels(false);
        return;
      }

      if(tgt && !tgtMarker){
        ensureTargetMarker();
      }
      if(tgtMarker && tgt){
        tgtMarker.setLngLat([tgt.lon,tgt.lat]);
      }

      if (passiveInPlay && userPt && greenMid) {
        setPlannerLine(userPt, greenMid, null);
        lbl1.textContent = yds(haversineM(userPt, greenMid)) + " YDS";
        posLabel(lbl1, userPt, greenMid);
      } else if (teeOrigin && tgt && greenMid) {
        setPlannerLine(teeOrigin, tgt, greenMid);
        lbl1.textContent = yds(haversineM(teeOrigin, tgt)) + " YDS";
        posLabel(lbl1, teeOrigin, tgt);

        lbl2.style.display = "block";
        lbl2.textContent = yds(haversineM(tgt, greenMid)) + " YDS";
        posLabel(lbl2, tgt, greenMid);
      } else if (userPt && greenMid) {
        setPlannerLine(userPt, greenMid, null);
        lbl1.textContent = yds(haversineM(userPt, greenMid)) + " YDS";
        posLabel(lbl1, userPt, greenMid);
      } else {
        setPlannerLine(null,null,null);
        lbl1.style.display = "none";
        lbl2.style.display = "none";
      }

      if(!driveOk){
        if(teeMarker){ try{ teeMarker.remove(); }catch(_){ } teeMarker=null; }
        setDriveLine(null,null);
      } else {
        ensureTeeMarker();

        if (showDriveLine) {
          setDriveLine(teeOrigin, userPt);
        } else {
          setDriveLine(null, null);
        }
      }
    }

    function setPlannerImmediate(nextOn){
      plannerOn = nextOn !== false;

      if(plannerOn){
        if(!tgt && userPt && greenMid){
          tgt = {
            lon:(userPt.lon + greenMid.lon)/2,
            lat:(userPt.lat + greenMid.lat)/2
          };
        }
        if(tgt && !tgtMarker){
          ensureTargetMarker();
        }
        if(tgtMarker && tgt){
          tgtMarker.setLngLat([tgt.lon, tgt.lat]);
        }
      }

      updatePlannerUI();
    }

    window.__lgSetPlanner = setPlannerImmediate;

    function ensureTargetMarker(){
      if(tgtMarker) return;

      const wrap = document.createElement("div");
      wrap.className = "tgtWrap";

      const ring = document.createElement("div");
      ring.className = "tgtRing";
      const core = document.createElement("div");
      core.className = "tgtCore";
      wrap.appendChild(ring);
      wrap.appendChild(core);

      // iOS WebView: don't rely on Mapbox draggable markers (can be unreliable).
      // We move the marker ourselves from touch/mouse events.
      tgtMarker = new mapboxgl.Marker({ element: wrap, draggable: false })
        .setLngLat([tgt.lon, tgt.lat])
        .addTo(map);

      if (window.__lgTargetDragBound) return;
      window.__lgTargetDragBound = true;

      let dragging = false;
      const canvas = map.getCanvas();

      const clientToLngLat = (clientX, clientY) => {
        const r = canvas.getBoundingClientRect();
        const x = clientX - r.left;
        const y = clientY - r.top;
        const ll = map.unproject([x, y]);
        return { lon: ll.lng, lat: ll.lat };
      };

      const startDrag = (clientX, clientY) => {
        if (!plannerOn) return;
        dragging = true;
        try { map.dragPan.disable(); } catch(_) {}
        const ll = clientToLngLat(clientX, clientY);
        setTarget(ll.lon, ll.lat);
      };

      const moveDrag = (clientX, clientY) => {
        if (!plannerOn) return;
        if (!dragging) return;
        const ll = clientToLngLat(clientX, clientY);
        setTarget(ll.lon, ll.lat);
      };

      const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        try { map.dragPan.enable(); } catch(_) {}
        updatePlannerUI();
      };

      // Start drag ONLY when pressing on the target marker
      wrap.addEventListener("touchstart", (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        startDrag(t.clientX, t.clientY);
      }, { passive: false });

      wrap.addEventListener("mousedown", (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch(_) {}
        startDrag(e.clientX, e.clientY);
      });

      // Continue drag even if finger moves off the marker
      document.addEventListener("touchmove", (e) => {
        if (!dragging) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        try { e.preventDefault(); } catch(_) {}
        moveDrag(t.clientX, t.clientY);
      }, { passive: false });

      document.addEventListener("touchend", () => {
        endDrag();
      }, { passive: true });

      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        moveDrag(e.clientX, e.clientY);
      });

      document.addEventListener("mouseup", () => {
        endDrag();
      });
    }
    function setTarget(lon, lat){
      if(!isFinite(lon) || !isFinite(lat)) return;
      tgt = { lon, lat };
      if(!plannerOn) return;

      ensureTargetMarker();
      tgtMarker.setLngLat([lon,lat]);
      updatePlannerUI();
    }

    map.on("move", () => {
      // keep floating labels aligned while panning/zooming/rotating
      if(plannerOn) updatePlannerUI();
    });

    map.on("click", (e) => {
      if(!plannerOn) return;
      if(!e || !e.lngLat) return;
      setTarget(e.lngLat.lng, e.lngLat.lat);
    });

    let lastKey = "";
    let lastHolePoseKey = "";

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
        (d.planner && d.planner.on===false) ? "off" : "on"
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

    function applyPayload(d){
      // Blue dot
      if(d.user){
        userPt = { lon:d.user.lon, lat:d.user.lat };
        u ? u.setLngLat([d.user.lon,d.user.lat])
          : u=new mapboxgl.Marker({element:mk("dot")}).setLngLat([d.user.lon,d.user.lat]).addTo(map);
      }

      // Planner settings + green endpoint
      if(d.planner && typeof d.planner === "object"){
        plannerOn = d.planner.on !== false;
        shotArmed = d.planner.shotArmed === true;
      } else {
        plannerOn = true;
        shotArmed = false;
      }

      // Green MID endpoint for planner
      if(d.green && d.green.middle && isFinite(d.green.middle.lon) && isFinite(d.green.middle.lat)){
        greenMid = { lon:d.green.middle.lon, lat:d.green.middle.lat };
      }

      // Tee origin for drive measurement
      if(d.teeOrigin && isFinite(d.teeOrigin.lon) && isFinite(d.teeOrigin.lat)){
        teeOrigin = { lon:d.teeOrigin.lon, lat:d.teeOrigin.lat };
        ensureTeeMarker();
      } else {
        teeOrigin = null;
        if(teeMarker){ try{ teeMarker.remove(); }catch(_){ } teeMarker=null; }
      }

      // Initialize planner target from fairway dot (only when provided)
      if(d.planner && d.planner.initTarget && isFinite(d.planner.initTarget.lon) && isFinite(d.planner.initTarget.lat)){
        setTarget(d.planner.initTarget.lon, d.planner.initTarget.lat);
      } else {
        // If we have no target yet, fall back to a midpoint between user and green mid
        if(!tgt && userPt && greenMid){
          setTarget((userPt.lon + greenMid.lon)/2, (userPt.lat + greenMid.lat)/2);
        }
      }

      if(!plannerOn){
        if(tgtMarker){ try{ tgtMarker.remove(); }catch(_){ } tgtMarker=null; }
        if(teeMarker){ try{ teeMarker.remove(); }catch(_){ } teeMarker=null; }
        tgt = tgt || null;
        showLabels(false);
        setPlannerLine(null,null,null);
        setDriveLine(null,null);
      } else {
        if(tgt && !tgtMarker){
          ensureTargetMarker();
          tgtMarker.setLngLat([tgt.lon,tgt.lat]);
        }
        updatePlannerUI();
      }

      if(d.cmd === "recenter"){
        window.__lgRecenterMode = window.__lgRecenterMode || "hole";

        if(window.__lgRecenterMode === "player"){
          const holePts = [d.tee, d.fairwayMid, d.green?.front, d.green?.middle, d.green?.back].filter(Boolean);
          const holeAim = d.green?.middle || d.green?.back || d.green?.front || null;
          const holeBearing = d.tee && holeAim ? bearingDeg(d.tee, holeAim) : null;

          if(holePts.length){
            frameHole(d.tee || null, holeAim, holePts, holeBearing);
          } else if(d.center){
            frameHole(null, null, [d.center].filter(Boolean), null);
          }

          window.__lgRecenterMode = "hole";
          return;
        }

        const z = map.getZoom();
        const nextZ =
          (d.forceZoom === true) ? 18 :
          (z < 17.5 ? 18 : z);

        if(d.at && isFinite(d.at[0]) && isFinite(d.at[1])){
          map.easeTo({ center:d.at, zoom:nextZ, duration:420 });
          window.__lgRecenterMode = "player";
        } else if(d.user){
          map.easeTo({ center:[d.user.lon, d.user.lat], zoom:nextZ, duration:420 });
          window.__lgRecenterMode = "player";
        }
        return;
      }

      const nextKey = keyFrom(d);
      const changed = nextKey !== lastKey;

      if(changed && d.fit){
        const holePts = [d.tee, d.fairwayMid, d.green?.front, d.green?.middle, d.green?.back].filter(Boolean);

        const teeP = d.tee || null;
        const greenAim = d.green?.middle || d.green?.back || d.green?.front || null;
        const brg = bearingDeg(teeP, greenAim);

        const poseKey = poseKeyFrom(d);

        if(holePts.length) {
          frameHole(teeP, greenAim, holePts, brg);
        } else {
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
      ensurePlannerLayers();

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

const PLANNER_PREF_KEY = "LEGACY_GOLF_PLANNER_ON";

function makeHazardPoint(type, lat, lon, extras = {}) {
  return {
    type,
    lat,
    lon,
    createdAt: Date.now(),
    ...extras,
  };
}

function normalizeHazardPoints(hazards) {
  const arr = Array.isArray(hazards) ? hazards : [];

  return arr
    .flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];

      if (Number.isFinite(item?.lat) && Number.isFinite(item?.lon)) {
        return [
          {
            ...item,
            hazardGroupId:
              item?.hazardGroupId ??
              item?.groupId ??
              `legacy-${index}`,
            pointRole: item?.pointRole ?? "point",
          },
        ];
      }

      const points = Array.isArray(item?.points) ? item.points : [];
      const groupId =
        item?.hazardGroupId ??
        item?.groupId ??
        `group-${index}`;

      return points
        .filter(
          (pt) =>
            pt &&
            typeof pt === "object" &&
            Number.isFinite(pt?.lat) &&
            Number.isFinite(pt?.lon)
        )
        .map((pt, pointIndex) => ({
          ...pt,
          type: pt?.type || item?.type || "bunker",
          hazardGroupId: pt?.hazardGroupId ?? groupId,
          pointRole: pt?.pointRole ?? (pointIndex === 0 ? "start" : "point"),
          createdAt: pt?.createdAt ?? item?.createdAt ?? Date.now(),
        }));
    })
    .filter(
      (pt) =>
        pt &&
        Number.isFinite(pt?.lat) &&
        Number.isFinite(pt?.lon)
    );
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

  // Disable iOS swipe-back gesture on this screen (round flow safety)
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerBackButtonMenuEnabled: false,
    });
  }, [navigation]);

  const { width: screenW, height: screenH } = Dimensions.get("window");

  const yardPos = useRef(new Animated.ValueXY({ x: 0, y: -120 })).current;
  const yardDockRef = useRef("right"); // "left" | "center" | "right"
  const bullseyeScale = useRef(new Animated.Value(1)).current;
  const bullseyeRotate = useRef(new Animated.Value(0)).current;

  const [yardStacked, setYardStacked] = useState(true);

  // Default position: right-side resting slot for yardages
  useEffect(() => {
    const panelHalfW = 60; // stacked width 120
    const edgePad = 8;
    const maxX = (screenW / 2) - panelHalfW - edgePad;

    yardDockRef.current = "right";
    setYardStacked(true);
    yardPos.setValue({ x: maxX, y: 95 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenW]);

  useEffect(() => {
    const panelHalfW = 60; // stacked width 120
    const edgePad = 8;
    const maxX = (screenW / 2) - panelHalfW - edgePad;

    if (clubPickerOpen) {
      yardDockRef.current = "right";
      setYardStacked(true);
      Animated.spring(yardPos, {
        toValue: { x: maxX, y: 95 },
        useNativeDriver: false,
        speed: 18,
        bounciness: 6,
      }).start();
      return;
    }

    Animated.spring(yardPos, {
      toValue: { x: maxX, y: 95 },
      useNativeDriver: false,
      speed: 18,
      bounciness: 6,
    }).start();
  }, [clubPickerOpen, screenW, yardPos]);

  const didAutoCenterRef = useRef(false);
  const autoCenterWindowStartRef = useRef(0);
  const lastAutoCenterRef = useRef(null);

  const didInitialFrameRef = useRef(false);
  const didInitPlannerTargetRef = useRef(false);

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

  const selectedTeeCode = useMemo(() => {
    const raw =
      teeObj?.code ||
      teeObj?.key ||
      teeObj?.color ||
      teeObj?.name ||
      "";
    return String(raw).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  }, [teeObj]);

  const currentHoleYardage = useMemo(() => {
    const savedYardages =
      holeMeta?.[String(holeNumber)]?.yardages &&
        typeof holeMeta?.[String(holeNumber)]?.yardages === "object"
        ? holeMeta[String(holeNumber)].yardages
        : {};

    const savedYardage = Number(savedYardages?.[selectedTeeCode]);
    if (Number.isFinite(savedYardage) && savedYardage > 0) {
      return Math.round(savedYardage);
    }

    const holes = Array.isArray(teeObj?.holes) ? teeObj.holes : [];
    const hole = holes[holeNumber - 1] || null;
    const y =
      Number(hole?.yards) ||
      Number(hole?.yardage) ||
      Number(hole?.distance) ||
      Number(hole?.length) ||
      Number(hole?.raw?.yards) ||
      null;

    return Number.isFinite(y) && y > 0 ? Math.round(y) : null;
  }, [holeMeta, selectedTeeCode, teeObj, holeNumber]);
  const savedGps = useMemo(() => {
    const gps = courseData?.gps;
    const hole = gps?.holes?.[String(holeNumber)] || null;
    return hole;
  }, [courseData, holeNumber]);

  const green = savedGps?.green || null;

  const teePoints = savedGps?.teePoints && typeof savedGps.teePoints === "object" ? savedGps.teePoints : null;
  const teePoint =
    getSavedTeePoint(teePoints, teeKey) ||
    (savedGps?.tee && Number.isFinite(savedGps?.tee?.lat) && Number.isFinite(savedGps?.tee?.lon) ? savedGps.tee : null);

  const fairwayMid =
    savedGps?.fairway?.mid && Number.isFinite(savedGps?.fairway?.mid?.lat) && Number.isFinite(savedGps?.fairway?.mid?.lon)
      ? savedGps.fairway.mid
      : null;

  const hazardsArr = normalizeHazardPoints(savedGps?.hazards);

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

  const isNearSelectedTee = useMemo(() => {
    if (!user || !teePoint) return false;
    const meters = haversineMeters(user, teePoint);
    return Number.isFinite(meters) && meters <= 5.5;
  }, [user, teePoint]);

  const distVals = {
    front: green?.front ? yds(dist.f) : "—",
    middle: green?.middle ? yds(dist.m) : "—",
    back: green?.back ? yds(dist.b) : "—",
  };

  const greenSetFront = !!(green?.front && Number.isFinite(green?.front?.lat) && Number.isFinite(green?.front?.lon));
  const greenSetMiddle = !!(green?.middle && Number.isFinite(green?.middle?.lat) && Number.isFinite(green?.middle?.lon));
  const greenSetBack = !!(green?.back && Number.isFinite(green?.back?.lat) && Number.isFinite(green?.back?.lon));
  const greenSetLeft = !!(green?.left && Number.isFinite(green?.left?.lat) && Number.isFinite(green?.left?.lon));
  const greenSetRight = !!(green?.right && Number.isFinite(green?.right?.lat) && Number.isFinite(green?.right?.lon));

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

  const postPayload = (fit = false, forceInitTarget = false, plannerOverride = null) => {
    if (!web.current || !webReady) return;

    const plannerValue =
      typeof plannerOverride === "boolean"
        ? plannerOverride
        : plannerOn;

    const shouldSendInitTarget =
      plannerValue &&
      (forceInitTarget || !didInitPlannerTargetRef.current) &&
      fairwayMid &&
      Number.isFinite(fairwayMid?.lon) &&
      Number.isFinite(fairwayMid?.lat);

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
          left: green.left || null,
          right: green.right || null,
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

      planner: {
        on: plannerValue,
        initTarget: shouldSendInitTarget
          ? { lon: fairwayMid.lon, lat: fairwayMid.lat }
          : null,
        shotArmed: !!shotTrackingArmed,
      },
      teeOrigin:
        par && Number(par) > 3 && teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat)
          ? { lon: teePoint.lon, lat: teePoint.lat }
          : null,
      fit,
    };

    web.current.postMessage(JSON.stringify(payload));

    if (shouldSendInitTarget) {
      didInitPlannerTargetRef.current = true;
    }
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
    if (!plannerReady) return;
    postPayload(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, plannerReady]);

  // Planner toggle must push immediately into WebView
  useEffect(() => {
    if (!plannerReady) return;
    postPayload(false, plannerOn === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerOn, plannerReady]);

  function recenter() {
    if (!web.current || !webReady) return;

    const payload = {
      cmd: "recenter",
      at: user ? [user.lon, user.lat] : null,
      user: user ? { lon: user.lon, lat: user.lat } : null,
      center,
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
      planner: {
        on: plannerOn,
        initTarget:
          fairwayMid && Number.isFinite(fairwayMid?.lon) && Number.isFinite(fairwayMid?.lat)
            ? { lon: fairwayMid.lon, lat: fairwayMid.lat }
            : null,
        shotArmed: !!shotTrackingArmed,
      },
      teeOrigin:
        par && Number(par) > 3 && teePoint && Number.isFinite(teePoint?.lon) && Number.isFinite(teePoint?.lat)
          ? { lon: teePoint.lon, lat: teePoint.lat }
          : null,
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
    didInitPlannerTargetRef.current = false;
  }, [clampedHoleIndex]);

  const [setupOpen, setSetupOpen] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [equipmentBag, setEquipmentBag] = useState([]);
  const [pendingClubLabel, setPendingClubLabel] = useState("");
  const [bullseyeReady, setBullseyeReady] = useState(false);
  const [shotTrackingArmed, setShotTrackingArmed] = useState(false);
  const [courseTees, setCourseTees] = useState([]);

  // Planner: target line + draggable target
  const [plannerOn, setPlannerOn] = useState(true);
  const [plannerReady, setPlannerReady] = useState(false);

  const canSet = useMemo(() => {
    return admin && !!user && Number.isFinite(user?.lat) && Number.isFinite(user?.lon);
  }, [admin, user]);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PLANNER_PREF_KEY);
        if (!live) return;

        if (raw === "false") {
          setPlannerOn(false);
        } else {
          setPlannerOn(true);
        }
      } catch {
        if (!live) return;
        setPlannerOn(true);
      } finally {
        if (live) setPlannerReady(true);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!plannerReady) return;

    AsyncStorage.setItem(PLANNER_PREF_KEY, plannerOn ? "true" : "false").catch(() => { });
  }, [plannerOn, plannerReady]);

  useEffect(() => {
    const ready = !!pendingClubLabel;
    setBullseyeReady(ready);

    if (ready && isNearSelectedTee) {
      setShotTrackingArmed(true);
    }

    if (!ready) {
      bullseyeScale.stopAnimation();
      bullseyeRotate.stopAnimation();
      bullseyeScale.setValue(1);
      bullseyeRotate.setValue(0);
      return;
    }

    bullseyeScale.setValue(1);
    bullseyeRotate.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(bullseyeScale, {
          toValue: 1.12,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(bullseyeRotate, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(bullseyeScale, {
          toValue: 0.96,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(bullseyeRotate, {
          toValue: -1,
          duration: 110,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(bullseyeScale, {
          toValue: 1.08,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bullseyeRotate, {
          toValue: 0.75,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(bullseyeScale, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(bullseyeRotate, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [pendingClubLabel, isNearSelectedTee, bullseyeRotate, bullseyeScale]);

  useEffect(() => {
    let live = true;

    (async () => {
      const uid = safeTrim(auth?.currentUser?.uid);
      if (!uid) {
        if (live) setEquipmentBag([]);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!live) return;

        const nextBag = snap?.exists?.() ? normalizeBag(snap.data()?.equipmentBag) : [];
        setEquipmentBag(nextBag);
      } catch {
        if (!live) return;
        setEquipmentBag([]);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;

    (async () => {
      if (!courseId) {
        if (live) setCourseTees([]);
        return;
      }

      try {
        const nextTees = await getTeesForCourse(String(courseId), {
          courseName,
        });

        if (!live) return;
        setCourseTees(Array.isArray(nextTees) ? nextTees : []);
      } catch {
        if (!live) return;
        setCourseTees([]);
      }
    })();

    return () => {
      live = false;
    };
  }, [courseId, courseName]);

  const clubOptions = useMemo(() => {
    return buildClubOptionsFromBag(equipmentBag);
  }, [equipmentBag]);

  const myPlayer = useMemo(() => {
    return resolveMyPlayerFromRoster(params.players || []);
  }, [params.players]);

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

  async function setGreenPoint(pointKey) {
    if (!admin) return;
    if (!courseId) {
      Alert.alert("Set point unavailable", "No courseId in route params.");
      return;
    }
    if (!canSet) return;
    if (!pointKey) return;

    setSavingSetup(true);
    try {
      const cid = String(courseId);
      const existing = (await loadCourseData(cid)) || {};

      const gps = existing.gps && typeof existing.gps === "object" ? existing.gps : {};
      const holes = gps.holes && typeof gps.holes === "object" ? gps.holes : {};
      const hKey = String(holeNumber);
      const holeObj = holes[hKey] && typeof holes[hKey] === "object" ? holes[hKey] : {};

      const prevGreen = holeObj.green && typeof holeObj.green === "object" ? holeObj.green : {};

      const nextHoleObj = {
        ...holeObj,
        green: {
          ...prevGreen,
          [pointKey]: { lat: user.lat, lon: user.lon },
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
        Alert.alert("Saved", `${String(pointKey).toUpperCase()} saved for Hole ${holeNumber}.`);
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
      const holes = gps.holes && typeof holes === "object" ? gps.holes : {};
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

  async function addHazard(type, pointRole = "point") {
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

      const existingHaz = normalizeHazardPoints(holeObj.hazards);
      const lastHazard = existingHaz.length ? existingHaz[existingHaz.length - 1] : null;

      const nextGroupId =
        pointRole === "point" && lastHazard?.hazardGroupId && lastHazard?.type === type
          ? lastHazard.hazardGroupId
          : `haz-${Date.now()}`;

      const nextHaz = [
        ...existingHaz,
        makeHazardPoint(type, user.lat, user.lon, {
          hazardGroupId: nextGroupId,
          pointRole,
        }),
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
        Alert.alert(
          "Saved",
          pointRole === "start"
            ? `${type.toUpperCase()} hazard start saved for Hole ${holeNumber}.`
            : `${type.toUpperCase()} hazard point saved for Hole ${holeNumber}.`
        );
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
      const existingHaz = normalizeHazardPoints(holeObj.hazards);
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

  const teeSetupItems = useMemo(() => {
    const list = Array.isArray(courseTees) && courseTees.length
      ? courseTees
      : [
        { name: "Gold", code: "GOLD" },
        { name: "Blue", code: "BLUE" },
        { name: "White", code: "WHITE" },
        { name: "Red", code: "RED" },
      ];

    return list.map((tee) => {
      const code = String(tee?.code || "").trim().toUpperCase();
      const saved = !!getSavedTeePoint(teePoints, code);

      return {
        name: String(tee?.name || code || "Tee").trim(),
        code,
        saved,
      };
    });
  }, [courseTees, teePoints]);

  const fwSet = !!(fairwayMid && Number.isFinite(fairwayMid?.lat) && Number.isFinite(fairwayMid?.lon));

  const hazCounts = useMemo(() => {
    const groups = new Map();

    hazardsArr.forEach((h, index) => {
      if (!h || !h.type) return;

      const type = String(h.type || "").trim().toLowerCase();
      const groupId =
        String(h.hazardGroupId || h.groupId || `legacy-${index}`).trim() || `legacy-${index}`;

      if (!groups.has(groupId)) {
        groups.set(groupId, { type, count: 1 });
      } else {
        const prev = groups.get(groupId);
        groups.set(groupId, { ...prev, count: prev.count + 1 });
      }
    });

    const out = { bunker: 0, water: 0, ob: 0, total: 0 };

    Array.from(groups.values()).forEach((g) => {
      if (g.type === "bunker") out.bunker += 1;
      if (g.type === "water") out.water += 1;
      if (g.type === "ob") out.ob += 1;
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

            if (msg?.cmd === "ready") {
              setWebReady(true);
              return;
            }

            if (msg?.cmd === "tapDistanceLabel") {
              if (!pendingClubLabel) return;

              Alert.alert(
                "Save shot",
                `Save ${pendingClubLabel} distance from here?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Save",
                    onPress: () => {
                      setShotTrackingArmed(false);
                      setPendingClubLabel("");
                    },
                  },
                ]
              );
            }
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
            {currentHoleYardage ? ` • ${currentHoleYardage} yards` : ""}
          </Text>
        </View>

        <Pressable onPress={() => setSetupOpen(true)} style={styles.setupBtn}>
          <Text style={styles.setupBtnT}>Setup</Text>
        </Pressable>
      </View>

      <View pointerEvents="box-none" style={[styles.topChipRowWrap, { top: insets.top + 74 }]}>
        <View pointerEvents="box-none" style={styles.topChipRow}>
          <Pressable
            onPress={recenter}
            style={({ pressed }) => [styles.gpsChipTop, pressed && styles.pressed]}
          >
            <View style={styles.gpsDot} />
            <Text style={styles.gpsChipT}>GPS Re-center</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              if (!plannerReady) return;
              const next = !plannerOn;
              setPlannerOn(next);

              try {
                web.current?.injectJavaScript(`
                  try {
                    if (window.__lgSetPlanner) {
                      window.__lgSetPlanner(${next ? "true" : "false"});
                    }
                  } catch (e) {}
                  true;
                `);
              } catch { }

              postPayload(false, next === true, next);
            }}
            style={({ pressed }) => [
              styles.plannerChipTop,
              pressed && styles.pressed,
              !plannerOn && styles.plannerChipTopOff,
              !plannerReady && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.plannerChipT}>
              {plannerOn ? "Planner On" : "Planner Off"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* GPS chip moved to bottom stack (below yardage panel) */}

      <View pointerEvents="box-none" style={[styles.bottomWrap, { paddingBottom: insets.bottom + 40 }]}>
        <Animated.View
          pointerEvents="box-none"
          {...yardPan.panHandlers}
          style={[
            styles.yardPanelWrap,
            { transform: [{ translateX: yardPos.x }, { translateY: yardPos.y }] },
          ]}
        >
          <View style={styles.yardClusterRow}>
            {clubPickerOpen ? (
              <View
                pointerEvents="auto"
                style={[
                  styles.inlineClubPanel,
                  yardStacked ? styles.inlineClubPanelStacked : styles.inlineClubPanelWide,
                ]}
              >
                <View style={[styles.inlineClubGrid, !yardStacked && styles.inlineClubGridWide]}>
                  {clubOptions.map((label) => {
                    const active = pendingClubLabel === label;
                    return (
                      <Pressable
                        key={label}
                        onPress={() => {
                          setPendingClubLabel(label);
                          setClubPickerOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.inlineClubPill,
                          active && styles.inlineClubPillActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.inlineClubPillText, active && styles.inlineClubPillTextActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.yardPanel,
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
              </View>
            )}
          </View>
        </Animated.View>

        <View style={styles.bottomActionRow}>
          {!pendingClubLabel ? (
            <Pressable
              pointerEvents="auto"
              onPress={() => {
                if (!clubOptions.length) {
                  Alert.alert("No clubs found", "Add clubs in Equipment first.");
                  return;
                }

                if (!myPlayer?.playerId) {
                  Alert.alert("Player not found", "Could not resolve your player for this round.");
                  return;
                }

                setClubPickerOpen((prev) => !prev);
              }}
              style={({ pressed }) => [
                styles.yardActionBtn,
                styles.yardActionBtnLarge,
                clubPickerOpen && styles.yardActionBtnOpen,
                pressed && styles.pressed,
              ]}
            >
              <Image source={CLUB_ICON} style={styles.yardActionIconImgLarge} resizeMode="contain" />
            </Pressable>
          ) : (
            <Animated.View
              pointerEvents="box-none"
              style={{
                transform: [
                  { scale: bullseyeScale },
                  {
                    rotate: bullseyeRotate.interpolate({
                      inputRange: [-1, 0, 1],
                      outputRange: ["-10deg", "0deg", "10deg"],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                pointerEvents="auto"
                disabled={!bullseyeReady}
                onPress={() =>
                  Alert.alert(
                    "Save shot",
                    `Save ${pendingClubLabel || "shot"} distance from here?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Save",
                        onPress: () => {
                          setShotTrackingArmed(false);
                          setPendingClubLabel("");
                        },
                      },
                    ]
                  )
                }
                style={({ pressed }) => [
                  styles.yardActionBtn,
                  styles.yardActionBtnLarge,
                  styles.yardActionBtnAccent,
                  bullseyeReady ? styles.yardActionBtnReady : styles.yardActionBtnDisabled,
                  pressed && bullseyeReady && styles.pressed,
                ]}
              >
                <Image
                  source={BULLSEYE_ICON}
                  style={[styles.yardActionIconImgLarge, !bullseyeReady && styles.yardActionIconDisabled]}
                  resizeMode="contain"
                />
                <View style={styles.bullseyeClubBadge}>
                  <Text style={styles.bullseyeClubBadgeT}>{pendingClubLabel}</Text>
                </View>
              </Pressable>
            </Animated.View>
          )}
        </View>

        <Pressable
          pointerEvents="auto"
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
                    <Text style={styles.sectionSub}>
                      {teeSetupItems.map((tee) => tee.name).join(" / ")}
                    </Text>
                  </View>

                  <View style={styles.teeSetupGrid}>
                    {teeSetupItems.map((tee) => (
                      <Pressable
                        key={tee.code}
                        disabled={!canSet || savingSetup || !tee.code}
                        onPress={() => setTeeColor(tee.code)}
                        style={({ pressed }) => [
                          styles.setBtn,
                          styles.teeSetupBtn,
                          pressed && styles.pressed,
                          (!canSet || savingSetup || !tee.code) && { opacity: 0.45 },
                        ]}
                      >
                        <Text style={styles.setBtnT}>{`Set Tee (${tee.name})`}</Text>
                        <Text style={styles.setBtnS}>{tee.saved ? "Saved" : "Not set"}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.sectionTitle}>Green points</Text>
                    <Text style={styles.sectionSub}>Front / Middle / Back / Left / Right</Text>
                  </View>

                  <View style={styles.setRow2}>
                    <Pressable
                      disabled={!canSet || savingSetup || (gpsLocked && greenSetFront)}
                      onPress={() => setGreenPoint("front")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup || (gpsLocked && greenSetFront)) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Front</Text>
                      <Text style={styles.setBtnS}>{greenSetFront ? "Saved" : "Not set"}</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup || (gpsLocked && greenSetMiddle)}
                      onPress={() => setGreenPoint("middle")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup || (gpsLocked && greenSetMiddle)) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Middle</Text>
                      <Text style={styles.setBtnS}>{greenSetMiddle ? "Saved" : "Not set"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.setRow2}>
                    <Pressable
                      disabled={!canSet || savingSetup || (gpsLocked && greenSetBack)}
                      onPress={() => setGreenPoint("back")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup || (gpsLocked && greenSetBack)) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Back</Text>
                      <Text style={styles.setBtnS}>{greenSetBack ? "Saved" : "Not set"}</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup || (gpsLocked && greenSetLeft)}
                      onPress={() => setGreenPoint("left")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup || (gpsLocked && greenSetLeft)) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Left</Text>
                      <Text style={styles.setBtnS}>{greenSetLeft ? "Saved" : "Not set"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.setRow2}>
                    <Pressable
                      disabled={!canSet || savingSetup || (gpsLocked && greenSetRight)}
                      onPress={() => setGreenPoint("right")}
                      style={({ pressed }) => [styles.setBtn, pressed && styles.pressed, (!canSet || savingSetup || (gpsLocked && greenSetRight)) && { opacity: 0.45 }]}
                    >
                      <Text style={styles.setBtnT}>Set Right</Text>
                      <Text style={styles.setBtnS}>{greenSetRight ? "Saved" : "Not set"}</Text>
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
                      onPress={() => addHazard("bunker", "start")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Start Bunker</Text>
                      <Text style={styles.setBtnS}>Begins a bunker shape</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("water", "start")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Start Water</Text>
                      <Text style={styles.setBtnS}>Begins a water shape</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("ob", "start")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Start OB</Text>
                      <Text style={styles.setBtnS}>Begins an OB shape</Text>
                    </Pressable>
                  </View>

                  <View style={styles.setRow}>
                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("bunker", "point")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add Bunker Point</Text>
                      <Text style={styles.setBtnS}>Adds to current bunker</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("water", "point")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add Water Point</Text>
                      <Text style={styles.setBtnS}>Adds to current water</Text>
                    </Pressable>

                    <Pressable
                      disabled={!canSet || savingSetup}
                      onPress={() => addHazard("ob", "point")}
                      style={({ pressed }) => [
                        styles.setBtn,
                        pressed && styles.pressed,
                        (!canSet || savingSetup) && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={styles.setBtnT}>Add OB Point</Text>
                      <Text style={styles.setBtnS}>Adds to current OB</Text>
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

  topChipRowWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 60,
    elevation: 60,
  },

  topChipRow: {
    width: "92%",
    alignSelf: "center",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },

  gpsChipTop: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },

  plannerChipTop: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  plannerChipTopOff: {
    backgroundColor: "rgba(0,0,0,0.40)",
    borderColor: "rgba(255,255,255,0.14)",
  },

  plannerChipT: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.3,
  },

  yardPanelWrap: {
    alignSelf: "center",
    alignItems: "center",
  },
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

  yardActionRail: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    marginVertical: 8,
  },

  yardActionBtn: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,18,28,0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
  },

  yardActionBtnLarge: {
    width: 62,
    height: 62,
    borderRadius: 18,
  },

  yardActionBtnOpen: {
    borderColor: "rgba(46,125,255,0.75)",
    backgroundColor: "rgba(46,125,255,0.18)",
  },

  yardActionBtnActive: {
    borderColor: "rgba(242,201,76,0.92)",
    backgroundColor: "rgba(242,201,76,0.20)",
    shadowColor: "#F2C94C",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  yardActionBtnAccent: {
    backgroundColor: "rgba(20,26,36,0.96)",
    borderColor: "rgba(255,255,255,0.24)",
  },

  yardActionBtnReady: {
    borderColor: "rgba(242,201,76,0.92)",
    backgroundColor: "rgba(242,201,76,0.18)",
    shadowColor: "#F2C94C",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  yardActionBtnDisabled: {
    backgroundColor: "rgba(20,26,36,0.72)",
    borderColor: "rgba(255,255,255,0.12)",
    opacity: 0.52,
  },

  yardActionIconImg: {
    width: 30,
    height: 30,
  },

  yardActionIconImgLarge: {
    width: 38,
    height: 38,
  },

  yardActionIconDisabled: {
    opacity: 0.55,
  },

  bullseyeClubBadge: {
    position: "absolute",
    bottom: 4,
    minWidth: 28,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  bullseyeClubBadgeT: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  selectedDotBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#F2C94C",
    borderWidth: 1,
    borderColor: "#fff",
  },
  yardClusterRow: {
    alignItems: "center",
    justifyContent: "center",
  },

  inlineClubPanel: {
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },

  inlineClubPanelStacked: {
    width: 78,
  },

  inlineClubPanelWide: {
    width: "88%",
  },

  inlineClubGrid: {
    gap: 6,
  },

  inlineClubGridWide: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },

  inlineClubPill: {
    minHeight: 36,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,36,64,0.70)",
    borderWidth: 1.25,
    borderColor: "rgba(15,122,74,0.78)",
  },

  inlineClubPillActive: {
    borderColor: "rgba(242,201,76,0.85)",
    backgroundColor: "rgba(242,201,76,0.16)",
  },

  inlineClubPillText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },

  inlineClubPillTextActive: {
    color: "#fff",
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
    minHeight: 92,
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
  gpsChipS: { color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 11 },

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
  teeSetupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10,
  },
  teeSetupBtn: {
    minWidth: "48%",
  },

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