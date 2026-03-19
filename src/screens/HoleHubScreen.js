// src/screens/HoleHubScreen.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  FlatList,
  InteractionManager,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import { BackHandler } from "react-native";
import * as Location from "expo-location";
import { collection, doc, getDocs, onSnapshot, deleteDoc } from "firebase/firestore";

import { auth, db } from "../firebase/firebase";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { loadCourseData } from "../storage/courseData";
import * as RoundState from "../storage/roundState";
import { saveRound, deleteRound } from "../storage/rounds";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const INNER2 = "#2A4A76";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const YELLOW = "#F2C94C";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4];
const DEFAULT_SI = [10, 2, 16, 4, 12, 6, 14, 8, 18, 1, 15, 3, 11, 5, 13, 7, 17, 9];

const HOLE_PILL_SIZE = 44;
const HOLE_PILL_GAP = 8;
const HOLE_STEP = HOLE_PILL_SIZE + HOLE_PILL_GAP;

function buildDefaultHoleMeta() {
  const meta = {};
  for (let i = 1; i <= 18; i++) meta[String(i)] = { par: DEFAULT_PARS[i - 1], si: DEFAULT_SI[i - 1] };
  return meta;
}

function notesKey(courseName) {
  const safe = String(courseName || "course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return `LEGACY_YARDAGE_BOOK_${safe}`;
}

function shortCourseTitle(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Course";

  const stripped = raw
    .replace(/\s*(golf\s*&\s*country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*and\s*country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*country\s*club)\s*$/i, "")
    .replace(/\s*(country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*course)\s*$/i, "")
    .replace(/\s*(golf)\s*$/i, "")
    .replace(/\s*[-–—:,]\s*$/i, "")
    .trim();

  return stripped || raw;
}

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

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
}

function clampHole(h, startHole, endHole) {
  const n = Number(h);
  if (!Number.isFinite(n)) return startHole;
  if (n < startHole) return startHole;
  if (n > endHole) return endHole;
  return n;
}

function deriveHoleRangeFromRound(root, params) {
  const holesCountRaw = Number(
    root?.holesCount ??
    root?.totalHoles ??
    root?.holes ??
    root?.meta?.holesCount ??
    params?.holesCount ??
    params?.totalHoles ??
    18
  );

  const holesCount = holesCountRaw === 9 || holesCountRaw === 18 ? holesCountRaw : 18;

  const sideRaw = String(
    root?.holesSide ??
    root?.side ??
    root?.meta?.holesSide ??
    params?.holesSide ??
    params?.side ??
    ""
  )
    .toLowerCase()
    .trim();

  const holesSide = sideRaw === "front" || sideRaw === "back" ? sideRaw : null;

  if (holesCount === 9) {
    if (holesSide === "back") return { startHole: 10, endHole: 18, holesCount, holesSide };
    return { startHole: 1, endHole: 9, holesCount, holesSide: "front" };
  }

  return { startHole: 1, endHole: 18, holesCount, holesSide: null };
}

function pickHoleFromActive(activeState) {
  const root = unwrapRound(activeState);
  if (!root) return null;

  const holeNumberDirect = pickFirstNumber(
    root?.holeNumber,
    root?.currentHole,
    root?.hole,
    root?.lastHole,
    root?.resumeHole
  );

  let holeNumber = holeNumberDirect;

  if (holeNumber === null || holeNumber === undefined) {
    const idx = Number(root?.holeIndex);
    if (Number.isFinite(idx) && idx >= 0 && idx <= 17) holeNumber = idx + 1;
  }

  if (!Number.isFinite(holeNumber)) return null;
  if (holeNumber < 1 || holeNumber > 18) return null;
  return holeNumber;
}

function pickCourseIdAny(obj) {
  if (!obj || typeof obj !== "object") return null;
  const c = obj?.course;
  const cid =
    obj?.courseId ??
    c?.id ??
    c?.courseId ??
    (typeof c === "string" ? c : null) ??
    null;
  return cid ? String(cid) : null;
}

function pickCourseNameAny(obj, fallback = "Course") {
  if (!obj || typeof obj !== "object") return fallback;
  const c = obj?.course;
  const name =
    obj?.courseName ??
    c?.name ??
    c?.courseName ??
    (typeof c === "string" ? c : null) ??
    null;
  return String(name || fallback);
}

function pickCourseCenterAny(obj) {
  if (!obj || typeof obj !== "object") return null;
  const c = obj?.course;
  return obj?.courseCenter ?? c?.center ?? c?.courseCenter ?? null;
}

function getMissingHolesFromState(state, playersList, startHole = 1, endHole = 18) {
  const players = Array.isArray(playersList) ? playersList : [];
  const ids = players.map((p, idx) => String(p?.id ?? String(idx)));

  const s = Number(startHole);
  const e = Number(endHole);
  const start = Number.isFinite(s) ? s : 1;
  const end = Number.isFinite(e) ? e : 18;

  const missing = [];
  for (let h = start; h <= end; h++) {
    let holeOk = true;
    for (const pid of ids) {
      const strokes = state?.holes?.[String(h)]?.players?.[String(pid)]?.strokes;
      if (toInt(strokes) <= 0) {
        holeOk = false;
        break;
      }
    }
    if (!holeOk) missing.push(h);
  }
  return missing;
}

function normalizeClaimStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "carry_over") return "carryover";
  if (raw === "push") return "washed";
  return raw;
}

function getFormatConfigRoot(roundRoot) {
  if (!roundRoot || typeof roundRoot !== "object") return {};
  return (
    (roundRoot?.formatConfig && typeof roundRoot.formatConfig === "object" && roundRoot.formatConfig) ||
    (roundRoot?.configByKey && typeof roundRoot.configByKey === "object" && roundRoot.configByKey) ||
    {}
  );
}

function getFormatClaimsRoot(roundRoot) {
  if (!roundRoot || typeof roundRoot !== "object") return {};
  return (
    (roundRoot?.formatClaims && typeof roundRoot.formatClaims === "object" && roundRoot.formatClaims) ||
    {}
  );
}

function getConfiguredFormatHoles(node) {
  if (!node || typeof node !== "object") return [];
  const holes =
    (Array.isArray(node?.holesByRound?.r1) && node.holesByRound.r1) ||
    (Array.isArray(node?.holesSelected) && node.holesSelected) ||
    (Array.isArray(node?.holes) && node.holes) ||
    [];
  return holes.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 18);
}

function getUnclaimedFormatIssues(roundRoot) {
  const cfgRoot = getFormatConfigRoot(roundRoot);
  const claimsRoot = getFormatClaimsRoot(roundRoot);

  const issues = [];

  const aliasKeysForFormat = (rawKey) => {
    const k = String(rawKey || "").trim().toLowerCase();

    if (k === "kp") return ["kp"];

    if (k === "longdrive" || k === "long_drive" || k === "ld") {
      return ["longdrive", "long_drive", "ld"];
    }

    if (
      k === "secondshotkp" ||
      k === "second_shot_kp" ||
      k === "2nd_shot_kp" ||
      k === "second_shot_closest_to_pin"
    ) {
      return ["secondshotkp", "second_shot_kp", "2nd_shot_kp", "second_shot_closest_to_pin"];
    }

    return [k];
  };

  Object.keys(cfgRoot).forEach((formatKey) => {
    const cfg = cfgRoot?.[formatKey];
    const holes = getConfiguredFormatHoles(cfg);
    if (!holes.length) return;

    const normalizedKey = String(formatKey || "").trim().toLowerCase();
    const aliasKeys = aliasKeysForFormat(normalizedKey);

    const isClaimFormat =
      aliasKeys.includes("kp") ||
      aliasKeys.includes("longdrive") ||
      aliasKeys.includes("long_drive") ||
      aliasKeys.includes("ld") ||
      aliasKeys.includes("secondshotkp") ||
      aliasKeys.includes("second_shot_kp") ||
      aliasKeys.includes("2nd_shot_kp") ||
      aliasKeys.includes("second_shot_closest_to_pin");

    if (!isClaimFormat) return;

    holes.forEach((hole) => {
      const possibleClaims = aliasKeys.map((key) => claimsRoot?.[`${key}_h${String(hole)}`]).filter(Boolean);
      const claim = possibleClaims[0] || null;
      const status = normalizeClaimStatus(claim?.status);

      const resolved =
        status === "claimed" ||
        status === "washed" ||
        status === "carryover";

      if (!resolved) {
        issues.push({
          formatKey: normalizedKey,
          hole: Number(hole),
        });
      }
    });
  });

  return issues;
}

function prettyFormatLabel(formatKey) {
  const k = String(formatKey || "").trim().toLowerCase();

  if (k === "kp") return "KP";
  if (k === "longdrive" || k === "long_drive") return "Long Drive";
  if (k === "secondshotkp" || k === "second_shot_kp") return "Second Shot KP";

  return String(formatKey || "Format")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeFormatClaimStatus(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "carry_over") return "carryover";
  if (s === "push") return "washed";
  return s;
}

function normalizeFormatKeyForDocId(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "");
}

function humanFormatName(v) {
  const k = normalizeFormatKeyForDocId(v);

  if (k === "kp") return "KP";
  if (k === "longdrive" || k === "long_drive" || k === "ld") return "Long Drive";
  if (k === "secondshotkp" || k === "second_shot_kp" || k === "2ndshotkp") return "Second Shot KP";

  return String(v || "Format Hole");
}

function getOfficialClaimHolesFromRound(roundRoot) {
  const cfgRoot =
    (roundRoot?.formatConfig && typeof roundRoot.formatConfig === "object" ? roundRoot.formatConfig : null) ||
    (roundRoot?.configByKey && typeof roundRoot.configByKey === "object" ? roundRoot.configByKey : null) ||
    null;

  if (!cfgRoot) return [];

  const out = [];

  Object.keys(cfgRoot).forEach((rawKey) => {
    const node = cfgRoot?.[rawKey];
    if (!node || typeof node !== "object") return;

    const holesRaw = Array.isArray(node?.holes)
      ? node.holes
      : Array.isArray(node?.holesSelected)
        ? node.holesSelected
        : [];

    const key = normalizeFormatKeyForDocId(rawKey);
    const isClaimFormat =
      key === "kp" ||
      key === "longdrive" ||
      key === "long_drive" ||
      key === "ld" ||
      key === "secondshotkp" ||
      key === "second_shot_kp" ||
      key === "2ndshotkp";

    if (!isClaimFormat) return;

    holesRaw.forEach((h) => {
      const hole = Number(h);
      if (!Number.isFinite(hole) || hole < 1 || hole > 18) return;

      out.push({
        formatKey: key,
        formatLabel: humanFormatName(rawKey),
        hole,
        docId: `${key}_h${hole}`,
      });
    });
  });

  out.sort((a, b) => a.hole - b.hole || a.formatLabel.localeCompare(b.formatLabel));
  return out;
}

/* -------------------------- */
/* side game overlay helpers  */
/* -------------------------- */

function normalizeSideKey(x) {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getSideGameMeta(sideGameKeyRaw) {
  const k = normalizeSideKey(sideGameKeyRaw);

  if (k === "long_drive" || k === "longdrive" || k === "ld") {
    return { title: "LONG DRIVE", subtitle: "Let it rip.", icon: "🏌️‍♂️" };
  }

  if (k === "kp" || k === "closest_to_pin" || k === "closest-to-pin") {
    return { title: "KP", subtitle: "Closest to the pin.", icon: "🎯" };
  }

  if (
    k === "second_shot_kp" ||
    k === "secondshotkp" ||
    k === "2nd_shot_kp" ||
    k === "second_shot_closest_to_pin"
  ) {
    return { title: "SECOND SHOT KP", subtitle: "Closest on the second shot.", icon: "🎯" };
  }

  if (k === "putting_contest" || k === "putting" || k === "putt") {
    return { title: "PUTTING CONTEST", subtitle: "We’ll track it later.", icon: "⛳" };
  }

  return { title: "FORMAT HOLE", subtitle: "Special hole", icon: "⭐" };
}

// Compute the sideGameKey for ANY hole, based on the round doc's formatConfig holes.
// This fixes: jumping back to Hole 1 then opening Score Entry missing the banner/claim UI.
function sideGameKeyForHole(roundDoc, holeNum) {
  const h = Number(holeNum);
  if (!Number.isFinite(h) || h < 1 || h > 18) return null;

  const cfgRoot =
    (roundDoc?.formatConfig && typeof roundDoc.formatConfig === "object" ? roundDoc.formatConfig : null) ||
    (roundDoc?.configByKey && typeof roundDoc.configByKey === "object" ? roundDoc.configByKey : null) ||
    null;

  if (!cfgRoot) return null;

  function holesFor(k) {
    const node = cfgRoot?.[k];
    const arr = Array.isArray(node?.holes) ? node.holes : Array.isArray(node?.holesSelected) ? node.holesSelected : [];
    return arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }

  // priority order (only one should match on a given hole, but this is deterministic)
  if (holesFor("secondshotkp").includes(h) || holesFor("second_shot_kp").includes(h) || holesFor("2nd_kp").includes(h)) return "secondshotkp";
  if (holesFor("longdrive").includes(h) || holesFor("long_drive").includes(h) || holesFor("ld").includes(h)) return "longdrive";
  if (holesFor("kp").includes(h)) return "kp";

  return null;
}
function FrontNinePromptModal({ visible, onView, onDismiss }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={styles.modalBg} onPress={onDismiss}>
        <View style={[styles.modalWrap, { justifyContent: "center" }]}>
          <Pressable
            style={[
              styles.modalCard,
              {
                width: "92%",
                alignSelf: "center",
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 14,
                borderColor: "rgba(214, 171, 84, 0.55)",
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { fontSize: 20 }]}>You're Now At The Turn</Text>
                <Text style={[styles.modalSub, { fontSize: 18, lineHeight: 24, marginTop: 8 }]}>
                  See front nine stats
                </Text>
              </View>

              <Pressable onPress={onDismiss} style={({ pressed }) => [styles.modalX, pressed && styles.pressed]}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={onView}
              style={({ pressed }) => [
                styles.modalDone,
                { marginTop: 16, paddingVertical: 14 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modalDoneText, { fontSize: 16 }]}>See front nine stats</Text>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.modalDone,
                { marginTop: 10, paddingVertical: 14, opacity: 0.92 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modalDoneText, { fontSize: 16 }]}>Not now</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function PostHoleSplashModal({ visible, data, onDismiss }) {
  const title = String(data?.title || "Skins");
  const headline = String(data?.headline || "");
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const winnerPid = data?.holeWinnerPid ? String(data.holeWinnerPid) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={styles.modalBg} onPress={onDismiss}>
        <View style={[styles.modalWrap, { justifyContent: "center" }]}>
          <Pressable
            style={[
              styles.modalCard,
              {
                width: "92%",
                alignSelf: "center",
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 14,
                borderColor: "rgba(214, 171, 84, 0.55)",
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { fontSize: 20 }]}>{title}</Text>

                {!!headline && (
                  <Text style={[styles.modalSub, { fontSize: 18, lineHeight: 24, marginTop: 8, color: "#D6AB54" }]}>
                    {headline}
                  </Text>
                )}

                {!!rows.length && (
                  <View style={{ marginTop: 14 }}>
                    <View style={{ flexDirection: "row", paddingBottom: 8, opacity: 0.75 }}>
                      <Text style={[styles.modalSub, { flex: 1, fontSize: 14 }]}>Player</Text>
                      <Text style={[styles.modalSub, { width: 64, textAlign: "right", fontSize: 14 }]}>Skins</Text>
                      <Text style={[styles.modalSub, { width: 78, textAlign: "right", fontSize: 14 }]}>$</Text>
                    </View>

                    {rows.map((r) => {
                      const pid = String(r?.pid || "");
                      const isWinner = winnerPid && pid && pid === winnerPid;
                      const skins = Number(r?.skins || 0);
                      const amount = Number(r?.amount || 0);

                      return (
                        <View key={pid || r?.name || Math.random()} style={{ flexDirection: "row", paddingVertical: 6 }}>
                          <Text
                            style={[
                              styles.modalSub,
                              { flex: 1, fontSize: 16, lineHeight: 20 },
                              isWinner && { color: "#D6AB54" },
                            ]}
                            numberOfLines={1}
                          >
                            {String(r?.name || "")}
                          </Text>

                          <Text
                            style={[
                              styles.modalSub,
                              { width: 64, textAlign: "right", fontSize: 16, lineHeight: 20 },
                              isWinner && { color: "#D6AB54" },
                            ]}
                          >
                            {String(skins)}
                          </Text>

                          <Text
                            style={[
                              styles.modalSub,
                              { width: 78, textAlign: "right", fontSize: 16, lineHeight: 20 },
                              isWinner && { color: "#D6AB54" },
                            ]}
                          >
                            {`$${String(Math.round(amount))}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={{ width: 28 }} />
            </View>

            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.modalDone,
                { marginTop: 16, paddingVertical: 14 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modalDoneText, { fontSize: 16 }]}>Continue</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function BirdieBucketsSplashModal({ visible, data, onDismiss }) {
  const winLine = String(data?.winLine || ""); // ex: "Steph won $20"
  const potLine = String(data?.potLine || "Current Pot – $0"); // ex: "Current Pot – $20"

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={styles.modalBg} onPress={onDismiss}>
        <View style={[styles.modalWrap, { justifyContent: "center" }]}>
          <Pressable
            style={[
              styles.modalCard,
              {
                width: "92%",
                alignSelf: "center",
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 14,
                borderColor: "rgba(214, 171, 84, 0.55)",
              },
            ]}
            onPress={() => { }}
          >
            <View style={styles.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { fontSize: 20 }]}>Birdie Buckets</Text>

                {!!winLine ? (
                  <Text style={[styles.modalSub, { fontSize: 20, lineHeight: 26, marginTop: 10, color: "#D6AB54", fontWeight: "900" }]}>
                    {winLine}
                  </Text>
                ) : null}

                <Text style={[styles.modalSub, { fontSize: 18, lineHeight: 24, marginTop: winLine ? 10 : 12, opacity: 0.9 }]}>
                  {potLine}
                </Text>
              </View>

              <View style={{ width: 28 }} />
            </View>

            <Pressable
              onPress={onDismiss}
              style={({ pressed }) => [
                styles.modalDone,
                { marginTop: 16, paddingVertical: 14 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modalDoneText, { fontSize: 16 }]}>Continue</Text>
            </Pressable>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function SideGameOverlayModal({
  visible,
  meta,
  currentHole,
  roundNumber,
  holderName,
  claimStatus,
  carryIn,
  carryFromHole,
  onDismiss,
}) {
  const normalizedStatus = String(claimStatus || "").toLowerCase().trim();

  let holderLine = "Currently unclaimed";
  let badgeText = "FORMAT ACTIVE";

  if (carryIn) {
    badgeText = "CARRYOVER";
  } else if (normalizedStatus === "claimed") {
    holderLine = holderName ? `Won by ${String(holderName)}` : "Claimed";
    badgeText = "RESULT RECORDED";
  } else if (normalizedStatus === "washed" || normalizedStatus === "push") {
    holderLine = "Washed";
    badgeText = "RESULT RECORDED";
  } else if (normalizedStatus === "unclaimed") {
    holderLine = "Unclaimed";
    badgeText = "RESULT RECORDED";
  } else if (holderName) {
    holderLine = `Current holder: ${String(holderName)}`;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.sgWrap}>
        <View style={styles.sgBackdrop} />
        <View style={styles.sgCard}>
          <View style={styles.sgTopRow}>
            <View style={styles.sgIconPill}>
              <Text style={styles.sgIcon}>{meta?.icon || "⭐"}</Text>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sgKicker}>
                {Number.isFinite(Number(roundNumber)) ? `ROUND ${Number(roundNumber)}` : "ROUND"}
                {Number.isFinite(Number(currentHole)) ? `  •  HOLE ${Number(currentHole)}` : ""}
              </Text>

              <View style={{ flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" }}>
                <Text style={styles.sgTitle}>{meta?.title || "FORMAT HOLE"}</Text>

                {carryIn ? (
                  <Text style={styles.sgCarry}>
                    {"  •  "}
                    {"CARRYOVER"}
                    {Number.isFinite(Number(carryFromHole)) && Number.isFinite(Number(currentHole))
                      ? ` (H${Number(carryFromHole)}→H${Number(currentHole)})`
                      : ""}
                  </Text>
                ) : null}
              </View>

              {!!meta?.subtitle ? <Text style={styles.sgSub}>{meta.subtitle}</Text> : null}

              {carryIn ? null : <Text style={[styles.sgSub, { marginTop: 8 }]}>{holderLine}</Text>}
            </View>
          </View>

          <View style={styles.sgDivider} />

          <View style={styles.sgBottomRow}>
            <View style={styles.sgMiniPill}>
              <Text style={styles.sgMiniText}>{badgeText}</Text>
            </View>

            <Pressable onPress={onDismiss} style={({ pressed }) => [styles.sgBtn, pressed && styles.pressed]}>
              <Text style={styles.sgBtnText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function HoleHubScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};

  const courseParam = params.course;
  const teeParam = params.tee;

  const courseIdFromParams =
    params.courseId ??
    courseParam?.id ??
    courseParam?.courseId ??
    (typeof courseParam === "string" ? courseParam : null);

  const courseNameFromParams =
    params.courseName ??
    courseParam?.name ??
    courseParam?.courseName ??
    (typeof courseParam === "string" ? courseParam : "");

  const courseCenterFromParams = params.courseCenter ?? courseParam?.center ?? courseParam?.courseCenter ?? null;

  const teeFromActive = activeRoot?.tee || null;

  const teeName =
    teeParam?.name ??
    teeFromActive?.name ??
    (typeof teeParam === "string" ? teeParam : "Tees");

  const [currentHole, setCurrentHole] = useState(params.hole || 1);
  const [courseData, setCourseData] = useState(null);
  const [user, setUser] = useState(null);
  const [activeSnap, setActiveSnap] = useState(null);
  const [finishValidationBusy, setFinishValidationBusy] = useState(false);

  const activeRoot = useMemo(() => unwrapRound(activeSnap), [activeSnap]);
  const roundId = params.roundId ?? activeRoot?.id ?? activeRoot?.roundId ?? null;

  const { startHole, endHole, holesCount, holesSide } = useMemo(() => {
    const root = activeRoot || null;
    return deriveHoleRangeFromRound(root, params);
  }, [activeRoot, params]);

  // IMPORTANT: params.players is often empty in the regular flow.
  // Always fall back to active round snapshot players.
  const players =
    Array.isArray(params.players) && params.players.length
      ? params.players
      : Array.isArray(activeRoot?.players)
        ? activeRoot.players
        : [];

  const courseId = useMemo(() => {
    return courseIdFromParams ? String(courseIdFromParams) : pickCourseIdAny(activeRoot);
  }, [courseIdFromParams, activeRoot]);

  const courseName = useMemo(() => {
    const name = String(courseNameFromParams || "").trim();
    if (name) return name;
    return pickCourseNameAny(activeRoot, "Course");
  }, [courseNameFromParams, activeRoot]);

  const courseCenter = useMemo(() => {
    return courseCenterFromParams ?? pickCourseCenterAny(activeRoot) ?? null;
  }, [courseCenterFromParams, activeRoot]);

  const holeMeta = useMemo(() => {
    const root = unwrapRound(activeSnap);
    const fromRound = root?.meta?.holeMeta;
    const fromCourseData = courseData?.holeMeta;
    const direct = params?.holeMeta;

    const source =
      (fromRound && typeof fromRound === "object" && fromRound) ||
      (fromCourseData && typeof fromCourseData === "object" && fromCourseData) ||
      (direct && typeof direct === "object" && direct) ||
      null;

    if (source) {
      const out = {};
      for (let h = 1; h <= 18; h++) {
        const kStr = String(h);
        const raw = source[kStr] ?? source[h] ?? {};
        const par = Number(raw?.par);
        const si = Number(raw?.si);
        const rawYardages = raw?.yardages && typeof raw.yardages === "object" ? raw.yardages : {};

        const yardages = {};
        Object.keys(rawYardages).forEach((key) => {
          const code = String(key || "").trim().toUpperCase();
          const val = Number(rawYardages[key]);
          if (code && Number.isFinite(val) && val > 0) {
            yardages[code] = Math.round(val);
          }
        });

        out[kStr] = {
          par: Number.isFinite(par) ? par : (DEFAULT_PARS[h - 1] || 4),
          si: Number.isFinite(si) ? si : (DEFAULT_SI[h - 1] || h),
          yardages,
        };
      }
      return out;
    }

    return buildDefaultHoleMeta();
  }, [activeSnap, courseData, params?.holeMeta]);

  // Ensure currentHole is always within the selected range.
  useEffect(() => {
    setCurrentHole((prev) => clampHole(prev, startHole, endHole));
  }, [startHole, endHole]);

  // If navigation provided a hole, clamp to the range.
  useEffect(() => {
    const incoming = Number(params?.hole);
    if (Number.isFinite(incoming)) {
      const next = clampHole(incoming, startHole, endHole);
      if (next !== currentHole) setCurrentHole(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.hole, startHole, endHole]);

  const par = holeMeta?.[String(currentHole)]?.par ?? 4;

  const selectedTeeCode = useMemo(() => {
    const raw =
      teeParam?.code ||
      teeFromActive?.code ||
      teeParam?.key ||
      teeFromActive?.key ||
      teeParam?.color ||
      teeFromActive?.color ||
      teeParam?.name ||
      teeFromActive?.name ||
      "";
    return String(raw).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  }, [teeParam, teeFromActive]);

  const currentHoleYardage = useMemo(() => {
    const savedYardages =
      holeMeta?.[String(currentHole)]?.yardages &&
        typeof holeMeta?.[String(currentHole)]?.yardages === "object"
        ? holeMeta[String(currentHole)].yardages
        : {};

    const savedYardage = Number(savedYardages?.[selectedTeeCode]);
    if (Number.isFinite(savedYardage) && savedYardage > 0) {
      return Math.round(savedYardage);
    }

    const holes = Array.isArray(teeParam?.holes) ? teeParam.holes : [];
    const hole = holes[currentHole - 1] || null;
    const y =
      Number(hole?.yards) ||
      Number(hole?.yardage) ||
      Number(hole?.distance) ||
      Number(hole?.length) ||
      Number(hole?.raw?.yards) ||
      null;

    return Number.isFinite(y) && y > 0 ? Math.round(y) : null;
  }, [holeMeta, selectedTeeCode, teeParam, currentHole]);

  const headerTitle = useMemo(() => shortCourseTitle(courseName), [courseName]);

  /* -------------------------- */
  /* side game overlay behavior */
  /* -------------------------- */

  const roundNumber = params?.roundNumber;

  // Always compute the format for the CURRENT hole (so hole strip + Next Hole behave identically)
  const computedSideGameKey = useMemo(() => {
    const fromConfig = sideGameKeyForHole(activeRoot, currentHole);
    const fromParams = String(params?.sideGameKey || "").trim();
    return fromConfig || (fromParams ? fromParams : null);
  }, [activeRoot, currentHole, params?.sideGameKey]);

  const sideMeta = useMemo(() => getSideGameMeta(computedSideGameKey), [computedSideGameKey]);

  const [sgVisible, setSgVisible] = useState(false);

  const [postSplashVisible, setPostSplashVisible] = useState(false);
  const [postSplash, setPostSplash] = useState(null);

  const [bbSplashVisible, setBbSplashVisible] = useState(false);
  const [bbSplash, setBbSplash] = useState(null);

  const [showQueuedMatchStatusAfterPostSplash, setShowQueuedMatchStatusAfterPostSplash] = useState(false);
  const [showImmediateMatchStatus, setShowImmediateMatchStatus] = useState(false);

  const [turnPromptVisible, setTurnPromptVisible] = useState(false);
  const [queuedSplash, setQueuedSplash] = useState(null);

  // Turn prompt (front 9 stats) — takes priority and blocks all other splashes until handled.
  useEffect(() => {
    const wantTurnPrompt = !!params?.showFrontNineStatsPrompt;

    if (!wantTurnPrompt) return;

    setTurnPromptVisible(true);

    // If a postHoleSplash arrives at the same time, queue it and clear the param
    // so it cannot show until after the turn prompt is handled.
    if (params?.postHoleSplash) {
      setQueuedSplash(params.postHoleSplash);
      try {
        navigation.setParams({ postHoleSplash: null });
      } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.showFrontNineStatsPrompt]);

  const [showQueuedAfterTurnStats, setShowQueuedAfterTurnStats] = useState(false);

  function dismissTurnPrompt() {
    setTurnPromptVisible(false);

    try {
      navigation.setParams({ showFrontNineStatsPrompt: null });
    } catch { }

    // Not now -> show queued splash immediately.
    if (queuedSplash) {
      setPostSplash(queuedSplash);
      setPostSplashVisible(true);
      setQueuedSplash(null);
    }
  }

  function viewFrontNineStats() {
    setTurnPromptVisible(false);

    try {
      navigation.setParams({ showFrontNineStatsPrompt: null });
    } catch { }

    // View stats -> delay queued splash until user returns to HoleHub.
    if (queuedSplash) setShowQueuedAfterTurnStats(true);

    navigation.navigate(ROUTES.FRONT_NINE_STATS, { roundId });
  }

  // When we come back from FrontNineStats, show the queued splash (once).
  useFocusEffect(
    useCallback(() => {
      if (!showQueuedAfterTurnStats) return undefined;
      if (turnPromptVisible) return undefined;
      if (!queuedSplash) {
        setShowQueuedAfterTurnStats(false);
        return undefined;
      }

      setPostSplash(queuedSplash);
      setPostSplashVisible(true);
      setQueuedSplash(null);
      setShowQueuedAfterTurnStats(false);

      return () => { };
    }, [showQueuedAfterTurnStats, turnPromptVisible, queuedSplash])
  );

  // Post-hole splash (e.g., Skins result) — shown once, then cleared from params.
  // If the turn prompt is active, we queue the splash instead of showing it.
  useEffect(() => {
    const s = params?.postHoleSplash || null;
    if (!s) return;

    if (turnPromptVisible || !!params?.showFrontNineStatsPrompt) {
      setQueuedSplash(s);
      try {
        navigation.setParams({ postHoleSplash: null });
      } catch { }
      return;
    }

    setPostSplash(s);
    setPostSplashVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.postHoleSplash, turnPromptVisible, params?.showFrontNineStatsPrompt]);

  // Birdie Buckets splash — shown once, then cleared from params.
  // If the turn prompt is active, we skip showing it until prompt is handled (caller should resend if needed).
  useEffect(() => {
    const s = params?.birdieBucketsSplash || null;
    if (!s) return;

    if (turnPromptVisible || !!params?.showFrontNineStatsPrompt) {
      try {
        navigation.setParams({ birdieBucketsSplash: null });
      } catch { }
      return;
    }

    setBbSplash(s);
    setBbSplashVisible(true);

    try {
      navigation.setParams({ birdieBucketsSplash: null });
    } catch { }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.birdieBucketsSplash, turnPromptVisible, params?.showFrontNineStatsPrompt]);

  useEffect(() => {
    if (!params?.showMatchStatusSplash) return;

    const blocked =
      !!params?.postHoleSplash ||
      !!params?.birdieBucketsSplash ||
      postSplashVisible ||
      bbSplashVisible ||
      turnPromptVisible ||
      !!params?.showFrontNineStatsPrompt;

    if (blocked) return;

    setShowImmediateMatchStatus(true);
  }, [
    params?.showMatchStatusSplash,
    params?.postHoleSplash,
    params?.birdieBucketsSplash,
    params?.showFrontNineStatsPrompt,
    postSplashVisible,
    bbSplashVisible,
    turnPromptVisible,
  ]);

  function dismissPostHoleSplash() {
    setPostSplashVisible(false);
    setPostSplash(null);

    try {
      navigation.setParams({ postHoleSplash: null });
    } catch { }

    if (params?.showMatchStatusSplash) {
      setShowQueuedMatchStatusAfterPostSplash(true);
    }
  }

  function dismissBirdieBucketsSplash() {
    setBbSplashVisible(false);
    setBbSplash(null);

    try {
      navigation.setParams({ birdieBucketsSplash: null });
    } catch { }
  }

  useFocusEffect(
    useCallback(() => {
      if (!showImmediateMatchStatus) return undefined;
      if (postSplashVisible) return undefined;
      if (bbSplashVisible) return undefined;
      if (turnPromptVisible) return undefined;

      setShowImmediateMatchStatus(false);

      try {
        navigation.setParams({ showMatchStatusSplash: null });
      } catch { }

      navigation.navigate(ROUTES.MATCH_STATUS_SPLASH, {
        roundId,
        holeCompleted: Number(params?.matchStatusHoleCompleted) || Number(currentHole) || 1,
        nextHole: Number(params?.matchStatusNextHole) || Number(currentHole) || 1,
      });

      return () => { };
    }, [
      showImmediateMatchStatus,
      postSplashVisible,
      bbSplashVisible,
      turnPromptVisible,
      navigation,
      roundId,
      params?.matchStatusHoleCompleted,
      params?.matchStatusNextHole,
      currentHole,
    ])
  );

  useFocusEffect(
    useCallback(() => {
      if (!showQueuedMatchStatusAfterPostSplash) return undefined;
      if (postSplashVisible) return undefined;
      if (bbSplashVisible) return undefined;
      if (turnPromptVisible) return undefined;

      setShowQueuedMatchStatusAfterPostSplash(false);

      try {
        navigation.setParams({ showMatchStatusSplash: null });
      } catch { }

      navigation.navigate(ROUTES.MATCH_STATUS_SPLASH, {
        roundId,
        holeCompleted: Number(params?.matchStatusHoleCompleted) || Number(currentHole) || 1,
        nextHole: Number(params?.matchStatusNextHole) || Number(currentHole) || 1,
      });

      return () => { };
    }, [
      showQueuedMatchStatusAfterPostSplash,
      postSplashVisible,
      bbSplashVisible,
      turnPromptVisible,
      navigation,
      roundId,
      params?.matchStatusHoleCompleted,
      params?.matchStatusNextHole,
      currentHole,
    ])
  );

  const sgTimerRef = useRef(null);
  const sgShownKeyRef = useRef(null);

  // Regular format claims (Firestore truth)
  const [claimDoc, setClaimDoc] = useState(null);
  const [prevClaimDoc, setPrevClaimDoc] = useState(null);
  const [allFormatClaimsById, setAllFormatClaimsById] = useState({});

  const claimRef = useMemo(() => {
    const uid = auth?.currentUser?.uid || null;
    const rid = String(roundId || "").trim();
    const sg = String(computedSideGameKey || "").trim();
    const h = Number(currentHole || 1);

    if (!uid) return null;
    if (!rid) return null;
    if (!sg) return null;
    if (!Number.isFinite(h) || h < 1 || h > 18) return null;

    const docId = `${sg}_h${String(h)}`;
    return doc(db, "users", String(uid), "rounds", String(rid), "formatClaims", String(docId));
  }, [roundId, computedSideGameKey, currentHole]);

  const allClaimsCollectionRef = useMemo(() => {
    const uid = auth?.currentUser?.uid || null;
    const rid = String(roundId || "").trim();

    if (!uid) return null;
    if (!rid) return null;

    return collection(db, "users", String(uid), "rounds", String(rid), "formatClaims");
  }, [roundId]);

  const prevEligibleHole = useMemo(() => {
    const root = unwrapRound(activeSnap);
    const key = String(computedSideGameKey || "").trim();
    const cur = Number(currentHole || 1);

    if (!key) return null;
    if (!Number.isFinite(cur) || cur < 1 || cur > 18) return null;

    const cfg = root?.formatConfig?.[key] || null;
    const holes = Array.isArray(cfg?.holes) ? cfg.holes : [];
    if (!holes.length) return null;

    let prev = null;
    for (const h of holes) {
      const n = Number(h);
      if (!Number.isFinite(n)) continue;
      if (n < cur && (prev === null || n > prev)) prev = n;
    }
    return prev;
  }, [activeSnap, computedSideGameKey, currentHole]);

  const prevClaimRef = useMemo(() => {
    const uid = auth?.currentUser?.uid || null;
    const rid = String(roundId || "").trim();
    const key = String(computedSideGameKey || "").trim();
    const prev = prevEligibleHole;

    if (!uid) return null;
    if (!rid) return null;
    if (!key) return null;
    if (!Number.isFinite(prev) || prev < 1 || prev > 18) return null;

    const prevId = `${key}_h${String(prev)}`;
    return doc(db, "users", String(uid), "rounds", String(rid), "formatClaims", String(prevId));
  }, [roundId, computedSideGameKey, prevEligibleHole]);

  useEffect(() => {
    if (!sgVisible || !claimRef) {
      setClaimDoc(null);
      return;
    }

    const unsub = onSnapshot(
      claimRef,
      (snap) => setClaimDoc(snap?.exists?.() ? (snap.data() || null) : null),
      () => setClaimDoc(null)
    );

    return () => unsub();
  }, [sgVisible, claimRef]);

  useEffect(() => {
    if (!allClaimsCollectionRef) {
      setAllFormatClaimsById({});
      return;
    }

    const unsub = onSnapshot(
      allClaimsCollectionRef,
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          next[String(d.id)] = d.data() || null;
        });
        setAllFormatClaimsById(next);
      },
      () => setAllFormatClaimsById({})
    );

    return () => unsub();
  }, [allClaimsCollectionRef]);

  useEffect(() => {
    if (!sgVisible || !prevClaimRef) {
      setPrevClaimDoc(null);
      return;
    }

    const unsub = onSnapshot(
      prevClaimRef,
      (snap) => setPrevClaimDoc(snap?.exists?.() ? (snap.data() || null) : null),
      () => setPrevClaimDoc(null)
    );

    return () => unsub();
  }, [sgVisible, prevClaimRef]);

  const holderName = String(claimDoc?.claimedByPlayerName || "").trim();
  const claimStatus = String(claimDoc?.status || "").toLowerCase().trim();

  const carryIn = useMemo(() => {
    if (!prevClaimDoc) return false;

    const s = String(prevClaimDoc?.status || "").toLowerCase().trim();
    if (s === "carryover" || s === "carry_over") return true;

    if (prevClaimDoc?.carryOver === true) return true;

    return false;
  }, [prevClaimDoc]);

  function clearSgTimer() {
    if (sgTimerRef.current) {
      clearTimeout(sgTimerRef.current);
      sgTimerRef.current = null;
    }
  }

  const dismissSideGameOverlay = useCallback(() => {
    clearSgTimer();
    setSgVisible(false);
  }, []);

  // Auto-splash whenever the CURRENT hole is a format hole (once per hole+format)
  // If a post-hole splash is pending, do NOT show the generic side-game overlay (avoid stacking).
  useFocusEffect(
    useCallback(() => {
      if (params?.showFrontNineStatsPrompt || turnPromptVisible) return undefined;
      if (params?.postHoleSplash || postSplashVisible) return undefined;
      if (params?.birdieBucketsSplash || bbSplashVisible) return undefined;

      // Allow callers (ex: last-hole Save -> Finish prompt) to suppress the generic side-game splash
      if (params?.showFormatSplash === false) return undefined;

      if (!computedSideGameKey) return undefined;

      const onceKey = `${String(roundId || "r")}__${String(currentHole || "h")}__${String(computedSideGameKey)}`;
      if (sgShownKeyRef.current === onceKey) return undefined;
      sgShownKeyRef.current = onceKey;

      setSgVisible(true);
      return () => { };
    }, [computedSideGameKey, roundId, currentHole, params?.postHoleSplash, postSplashVisible, params?.birdieBucketsSplash, bbSplashVisible, params?.showFormatSplash, params?.showFrontNineStatsPrompt, turnPromptVisible])
  );

  useEffect(() => {
    return () => {
      clearSgTimer();
    };
  }, []);

  // Native-stack: disable iOS swipe-back gesture on HoleHub.
  // Exit/Home is the only way out.
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerBackButtonMenuEnabled: false,
    });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let sub = null;

      // Block hardware back from exiting the round stack.
      // We manage navigation via HoleHub controls + Home/Exit prompt only.
      const bh = BackHandler.addEventListener("hardwareBackPress", () => true);

      (async () => {
        try {
          const s = await RoundState.loadActiveRound();
          if (cancelled) return;
          setActiveSnap(s || null);

          const root = unwrapRound(s) || {};
          const range = deriveHoleRangeFromRound(root, params);

          const fromActive = pickHoleFromActive(s);
          if (fromActive) {
            const next = clampHole(fromActive, range.startHole, range.endHole);
            setCurrentHole((prev) => (next !== prev ? next : prev));
          } else {
            // If nothing persisted, default to the start of the selected range.
            setCurrentHole((prev) => clampHole(prev, range.startHole, range.endHole));
          }
        } catch {
          if (!cancelled) setActiveSnap(null);
        }

        try {
          if (courseId) {
            const saved = await loadCourseData(String(courseId));
            if (!cancelled) setCourseData(saved || null);
          } else {
            if (!cancelled) setCourseData(null);
          }
        } catch {
          if (!cancelled) setCourseData(null);
        }

        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status !== "granted") return;

          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
            (p) => {
              if (cancelled) return;
              setUser({ lat: p.coords.latitude, lon: p.coords.longitude });
            }
          );
        } catch { }
      })();

      return () => {
        cancelled = true;
        if (sub) sub.remove();
        bh.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId, startHole, endHole, holesCount, holesSide])
  );

  const savedGpsHole = useMemo(() => {
    const gps = courseData?.gps;
    const hole = gps?.holes?.[String(currentHole)] || null;
    return hole;
  }, [courseData, currentHole]);

  const green = savedGpsHole?.green || null;
  const hasGreenPoints = !!(green?.front || green?.middle || green?.back);
  const gpsLive = !!user;

  const yardages = useMemo(() => {
    if (!user || !green) return { front: "—", middle: "—", back: "—" };

    const out = { front: "—", middle: "—", back: "—" };
    if (green.front && Number.isFinite(green.front.lat) && Number.isFinite(green.front.lon)) {
      out.front = yds(haversineMeters(user, green.front));
    }
    if (green.middle && Number.isFinite(green.middle.lat) && Number.isFinite(green.middle.lon)) {
      out.middle = yds(haversineMeters(user, green.middle));
    }
    if (green.back && Number.isFinite(green.back.lat) && Number.isFinite(green.back.lon)) {
      out.back = yds(haversineMeters(user, green.back));
    }
    return out;
  }, [user, green]);

  const [yardageOpen, setYardageOpen] = useState(false);
  const [yardageText, setYardageText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(notesKey(courseName));
        if (!live) return;
        const obj = raw ? JSON.parse(raw) : {};
        const note = obj?.[String(currentHole)] || "";
        setYardageText(String(note));
      } catch {
        if (!live) return;
        setYardageText("");
      }
    })();
    return () => {
      live = false;
    };
  }, [courseName, currentHole]);

  async function saveYardageNoteAndClose() {
    setSaving(true);
    try {
      const key = notesKey(courseName);
      const raw = await AsyncStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      obj[String(currentHole)] = String(yardageText || "").trim();
      await AsyncStorage.setItem(key, JSON.stringify(obj));
    } catch { }
    setSaving(false);
    Keyboard.dismiss();
    setYardageOpen(false);
  }

  async function openScoreEntry(extra = {}) {
    const liveActive = (await RoundState.loadActiveRound(roundId)) || activeRoot || null;

    const roster =
      (Array.isArray(players) && players.length ? players : null) ||
      (Array.isArray(liveActive?.players) && liveActive.players.length ? liveActive.players : null) ||
      (Array.isArray(activeRoot?.players) && activeRoot.players.length ? activeRoot.players : null) ||
      [];

    navigation.navigate(ROUTES.SCORE_ENTRY, {
      course: courseParam ?? liveActive?.course ?? activeRoot?.course ?? { name: courseName, id: courseId },
      tee: teeParam ?? liveActive?.tee ?? activeRoot?.tee ?? { name: teeName },
      players: roster,
      hole: currentHole,
      holeMeta,
      roundId: liveActive?.id || liveActive?.roundId || activeRoot?.id || activeRoot?.roundId || roundId || null,
      courseName,
      teeName,
      courseCenter,
      courseId,

      // Always compute the format hole key for the CURRENT hole (so jumping back works correctly)
      sideGameKey: sideGameKeyForHole(liveActive || activeRoot, currentHole) || null,

      holesCount,
      holesSide,

      ...extra,
    });
  }

  function openScorecard() {
    navigation.navigate(ROUTES.SCORECARD, {
      course: courseParam ?? activeRoot?.course ?? { name: courseName, id: courseId },
      tee: teeParam ?? activeRoot?.tee ?? { name: teeName },
      players,
      holeMeta,
      roundId,
      hole: currentHole,
      holeIndex: currentHole - 1,
      courseCenter,
      courseId,
    });
  }

  function openGreenView() {
    navigation.navigate(ROUTES.TOURNAMENT_GREEN_VIEW, {
      // TournamentGreenViewScreen param shape (works for regular too)
      holeNumber: currentHole,
      hole: currentHole,
      courseId,
      courseName,
      teeName,
      roundId: activeRoot?.id || activeRoot?.roundId || roundId || "",
      // optional
      greenInfo: params?.greenInfo || null,
      yardages: params?.yardages || null,
    });
  }

  function openHazards() {
    navigation.navigate(ROUTES.HAZARDS, {
      ...params,
      course: courseParam ?? activeRoot?.course ?? { name: courseName, id: courseId, center: courseCenter },
      tee: teeParam ?? activeRoot?.tee ?? { name: teeName },
      players,
      holeMeta,
      roundId,
      hole: currentHole,
      holeIndex: currentHole - 1,
      courseName,
      teeName,
      courseCenter,
      courseId,
    });
  }

  function openHoleMap(openSetup = false) {
    const cid = courseId || pickCourseIdAny(activeRoot);
    if (!cid) {
      Alert.alert(
        "Missing courseId",
        "This screen does not have a courseId yet, so mapping cannot open.\n\nFix: start the round from a course picker that provides courseId."
      );
      return;
    }

    navigation.navigate(ROUTES.HOLE_MAP, {
      roundId,
      holeIndex: currentHole - 1,
      hole: currentHole,
      course: courseParam ?? activeRoot?.course ?? { name: courseName, id: cid, center: courseCenter },
      tee: teeParam ?? activeRoot?.tee ?? { name: teeName },
      players,
      holeMeta,
      courseName,
      courseId: String(cid),
      courseCenter,
      openSetup: !!openSetup,
    });
  }

  const [savingRound, setSavingRound] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  async function doSaveRoundNow({ status }) {
    if (savingRound) return;

    setSavingRound(true);
    try {
      const active = (await RoundState.loadActiveRound()) || {};

      const safePlayers = Array.isArray(active?.players) && active.players.length ? active.players : players;
      const safeCourse = active?.course || courseParam || { name: courseName, id: courseId, center: courseCenter };
      const safeTee = active?.tee || teeParam || { name: teeName };
      const safeHoles = active?.holes || {};

      const safeWagers = active?.wagers || params?.wagers || null;
      const safeMeta = active?.meta && typeof active.meta === "object" ? active.meta : {};
      const mergedMeta = { ...safeMeta, holeMeta };

      const id = String(active?.roundId || active?.id || roundId || "").trim();
      if (!id) {
        Alert.alert(
          "Save failed",
          "Missing roundId. Please return Home, reopen the round, then try Save & Exit again."
        );
        return { ok: false, roundId: null };
      }

      const persistedResumeHole =
        Number(active?.currentHole) ||
        Number(active?.holeNumber) ||
        Number(active?.hole) ||
        (Number.isFinite(Number(active?.holeIndex)) ? Number(active.holeIndex) + 1 : null) ||
        currentHole;

      const payload = {
        id,
        roundId: id,
        courseName: String(safeCourse?.name || courseName || "Course"),
        teeName: String(safeTee?.name || teeName || "Tees"),
        course: safeCourse,
        tee: safeTee,
        players: safePlayers,
        holes: safeHoles,
        wagers: safeWagers,
        meta: mergedMeta,
        playedAt: active?.playedAt || active?.startedAt || new Date().toISOString(),
        startedAt: active?.startedAt || new Date().toISOString(),
        status: status || "in_progress",
        currentHole: persistedResumeHole,
        holeNumber: persistedResumeHole,
        hole: persistedResumeHole,
        holeIndex: Math.max(0, Number(persistedResumeHole || 1) - 1),
        lastHole: persistedResumeHole,
      };

      const ok = await saveRound(payload);
      if (!ok) {
        Alert.alert("Save failed", "Could not save this round to history.");
        return { ok: false, roundId: id };
      }

      setSavedOpen(true);
      setTimeout(() => setSavedOpen(false), 900);
      return { ok: true, roundId: id };
    } catch {
      Alert.alert("Save failed", "Could not save this round to history.");
      return { ok: false, roundId: null };
    } finally {
      setSavingRound(false);
    }
  }

  async function onPressFinishRound() {
    if (savingRound) return;

    try {
      const active = (await RoundState.loadActiveRound()) || {};
      const missing = getMissingHolesFromState(active, players, startHole, endHole);

      if (missing.length) {
        const list = missing.join(", ");
        Alert.alert("Missing scores", `Some holes are missing strokes.\n\nMissing holes: ${list}`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Fix now",
            onPress: () => {
              const first = missing[0];
              openScoreEntry({
                hole: first,
                missingHoles: missing,
                missingIndex: 0,
                finishReturnHole: endHole,
              });
            },
          },
        ]);
        return;
      }

      const unresolvedFormats = getUnclaimedFormatIssues({
        ...active,
        formatClaims: allFormatClaimsById,
      });

      if (unresolvedFormats.length) {
        const lines = unresolvedFormats
          .map((x) => `- ${prettyFormatLabel(x.formatKey)} • Hole ${x.hole}`)
          .join("\n");

        Alert.alert(
          "Unresolved format holes",
          `The following format holes still need a result:\n\n${lines}\n\nPlease Claim, Carry Over, or Wash each one before finishing the round.`,
          [{ text: "OK", style: "default" }]
        );
        return;
      }

      navigation.dispatch(
        CommonActions.navigate({
          name: ROUTES.GAME_ROUND_CALCULATING,
          params: {
            roundId: active?.id || active?.roundId || roundId || null,
            course: active?.course || courseParam || { name: courseName, id: courseId, center: courseCenter },
            tee: active?.tee || teeParam || { name: teeName },
            players: active?.players || players,
            holeMeta: active?.meta?.holeMeta || holeMeta,
            wagers: active?.wagers || params?.wagers || null,
            courseName,
            teeName,
          },
          merge: true,
        })
      );
    } catch {
      Alert.alert("Finish failed", "Could not finish the round. Please try again.");
    }
  }

  async function wipeRoundNoSave() {
    const rid = String(activeRoot?.id || activeRoot?.roundId || roundId || "").trim();
    const uid = auth?.currentUser?.uid;

    try {
      await RoundState.clearActiveRound();
    } catch { }

    try {
      if (rid) {
        await deleteRound(rid);
      }
    } catch { }

    try {
      if (rid) {
        const isShared = String(rid).startsWith("sr_");
        if (isShared) {
          await deleteDoc(doc(db, "sharedRounds", String(rid)));
        } else if (uid) {
          await deleteDoc(doc(db, "users", String(uid), "rounds", String(rid)));
        }
      }
    } catch { }

    skipBeforeRemoveRef.current = true;
    navigation.navigate(ROUTES.HOME);
    setTimeout(() => {
      skipBeforeRemoveRef.current = false;
    }, 600);
  }

  async function saveAndExitRound() {
    if (savingRound) return;

    await doSaveRoundNow({ status: "in_progress" });

    try {
      await RoundState.clearActiveRound();
    } catch { }

    skipBeforeRemoveRef.current = true;
    navigation.navigate(ROUTES.HOME);
    setTimeout(() => {
      skipBeforeRemoveRef.current = false;
    }, 600);
  }

  function onPressHome() {
    Alert.alert("Exit round?", "What would you like to do?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit (no save)",
        style: "destructive",
        onPress: wipeRoundNoSave,
      },
      {
        text: savingRound ? "Saving…" : "Exit & Save",
        onPress: saveAndExitRound,
      },
    ]);
  }

  const currentHoleHasScores = useMemo(() => {
    const holePlayers = activeRoot?.holes?.[String(currentHole)]?.players || null;
    if (!holePlayers || typeof holePlayers !== "object") return false;

    const roster =
      (Array.isArray(players) && players.length ? players : null) ||
      (Array.isArray(activeRoot?.players) && activeRoot.players.length ? activeRoot.players : null) ||
      [];

    if (!roster.length) {
      return Object.values(holePlayers).some((p) => toInt(p?.strokes) > 0);
    }

    return roster.every((p, idx) => {
      const pid = String(p?.id ?? String(idx));
      return toInt(holePlayers?.[pid]?.strokes) > 0;
    });
  }, [activeRoot, currentHole, players]);

  const isFinalHole = currentHole === endHole;

  const missingHolesNow = useMemo(() => {
    return getMissingHolesFromState(activeRoot || {}, players, startHole, endHole);
  }, [activeRoot, players, startHole, endHole]);

  const unresolvedFormatsNow = useMemo(() => {
    return getUnclaimedFormatIssues({
      ...(activeRoot || {}),
      formatClaims: allFormatClaimsById,
    });
  }, [activeRoot, allFormatClaimsById]);

  const roundComplete =
    isFinalHole &&
    currentHoleHasScores &&
    missingHolesNow.length === 0 &&
    unresolvedFormatsNow.length === 0;

  const footerButtonLabel =
    isFinalHole && currentHoleHasScores
      ? (roundComplete ? "Finish Round" : "Check scores and formats")
      : "Input Scores";

  const footerButtonIsFinishReady = roundComplete;

  const holeListRef = useRef(null);

  const skipBeforeRemoveRef = useRef(false);
  const [holeBarWidth, setHoleBarWidth] = useState(0);

  const sidePad = useMemo(() => {
    if (!holeBarWidth) return 0;
    const pad = holeBarWidth / 2 - HOLE_PILL_SIZE / 2;
    return Math.max(0, Math.round(pad));
  }, [holeBarWidth]);

  const holesData = useMemo(() => {
    const out = [];
    for (let h = startHole; h <= endHole; h++) out.push(h);
    return out;
  }, [startHole, endHole]);

  const getItemLayout = useCallback((data, index) => {
    return { length: HOLE_STEP, offset: HOLE_STEP * index, index };
  }, []);

  const scrollHoleToCenter = useCallback(
    (h, animated = true) => {
      if (!holeListRef.current) return;

      const total = Math.max(1, holesData.length);
      const idxRaw = Number(h || startHole) - startHole;
      const idx = Math.min(total - 1, Math.max(0, idxRaw));
      const offset = HOLE_STEP * idx;

      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          holeListRef.current?.scrollToOffset?.({ offset, animated });
        });
      });
    },
    [holesData.length, startHole]
  );

  useEffect(() => {
    if (!holeBarWidth) return;
    scrollHoleToCenter(currentHole, true);
    setTimeout(() => scrollHoleToCenter(currentHole, false), 60);
    setTimeout(() => scrollHoleToCenter(currentHole, false), 180);
  }, [currentHole, holeBarWidth, scrollHoleToCenter]);

  useFocusEffect(
    useCallback(() => {
      if (!holeBarWidth) return undefined;
      const t1 = setTimeout(() => scrollHoleToCenter(currentHole, false), 40);
      const t2 = setTimeout(() => scrollHoleToCenter(currentHole, false), 160);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }, [currentHole, holeBarWidth, scrollHoleToCenter])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        navigation={navigation}
        title={headerTitle}
        subtitle={`${teeName} • Hole ${currentHole} • Par ${par}${currentHoleYardage ? ` • ${currentHoleYardage} yards` : ""}`}
        safeTop={false}
        leftLabel={currentHole <= startHole ? "Exit" : "Back"}
        onLeftPress={() => {
          if (currentHole <= startHole) {
            onPressHome();
            return;
          }
          setCurrentHole((prev) => Math.max(startHole, Number(prev || startHole) - 1));
        }}
        rightLabel="Home"
        onRightPress={onPressHome}
      />

      <FrontNinePromptModal
        visible={turnPromptVisible}
        onView={viewFrontNineStats}
        onDismiss={dismissTurnPrompt}
      />

      <PostHoleSplashModal
        visible={postSplashVisible}
        data={postSplash}
        onDismiss={dismissPostHoleSplash}
      />

      <BirdieBucketsSplashModal
        visible={bbSplashVisible}
        data={bbSplash}
        onDismiss={dismissBirdieBucketsSplash}
      />

      <SideGameOverlayModal
        visible={sgVisible}
        meta={sideMeta}
        currentHole={currentHole}
        roundNumber={roundNumber}
        holderName={holderName}
        claimStatus={claimStatus}
        carryIn={carryIn}
        carryFromHole={prevEligibleHole}
        onDismiss={dismissSideGameOverlay}
      />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.holeBarWrap} onLayout={(e) => setHoleBarWidth(e?.nativeEvent?.layout?.width || 0)}>
          <FlatList
            ref={holeListRef}
            data={holesData}
            keyExtractor={(item) => String(item)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.holePills, { paddingHorizontal: sidePad }]}
            extraData={currentHole}
            getItemLayout={getItemLayout}
            onContentSizeChange={() => {
              setTimeout(() => scrollHoleToCenter(currentHole, false), 0);
            }}
            renderItem={({ item }) => {
              const h = item;
              const active = h === currentHole;
              return (
                <Pressable
                  onPress={() => setCurrentHole(h)}
                  style={({ pressed }) => [styles.holePill, active && styles.holePillActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.holePillText, active && styles.holePillTextActive]}>{h}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <View style={styles.modeRow}>
          <Pressable onPress={openScorecard} style={[styles.modeBtn, styles.modeBtnPrimary]}>
            <Text style={[styles.modeText, styles.modeTextPrimary]}>Scorecard</Text>
          </Pressable>

          <Pressable onPress={openGreenView} style={styles.modeBtn}>
            <Text style={styles.modeText}>Green View</Text>
          </Pressable>

          <Pressable onPress={openHazards} style={styles.modeBtn}>
            <Text style={styles.modeText}>Hazards</Text>
          </Pressable>
        </View>

        <View style={styles.ybWrap}>
          <Pressable onPress={() => setYardageOpen(true)} style={({ pressed }) => [styles.ybCard, pressed && styles.pressed]}>
            <Text style={styles.ybCenterText}>Yardage Book</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => openHoleMap(false)} style={styles.mapCard}>
          <Text style={styles.mapEyebrow}>
            Hole {currentHole} - Par {par} - {currentHoleYardage ? `${currentHoleYardage} yds` : "Yardage TBD"}
          </Text>
          <Text style={styles.mapTitle}>Hole View</Text>
          <Text style={styles.mapSub}>Tap to open full-screen GPS</Text>
        </Pressable>

        <View style={styles.yardageRow}>
          {[
            ["front", "FRONT"],
            ["middle", "MIDDLE"],
            ["back", "BACK"],
          ].map(([k, label]) => (
            <View key={k} style={styles.yardCard}>
              <Text style={styles.yardLabel}>{label}</Text>
              <Text style={styles.yardValue}>{yardages[k]}</Text>
              <Text style={styles.yardUnit}>yards</Text>

              {gpsLive ? (
                <View style={styles.microRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.microText}>LIVE GPS</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {!hasGreenPoints ? (
          <View style={styles.hintCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>No green points yet</Text>
              <Text style={styles.hintSub}>Set front / mid / back once, and yardages will be perfect every round.</Text>
            </View>

            <Pressable
              onPress={() => openHoleMap(true)}
              disabled={!courseId}
              style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed, !courseId && { opacity: 0.45 }]}
            >
              <Text style={styles.hintBtnT}>Set points</Text>
              <Text style={styles.hintBtnS}>→</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
        <Pressable
          style={[
            styles.greenBtn,
            footerButtonIsFinishReady && styles.greenBtnFinish,
            savingRound && { opacity: 0.7 },
          ]}
          onPress={() => {
            if (footerButtonLabel === "Input Scores") {
              openScoreEntry();
              return;
            }

            onPressFinishRound();
          }}
          disabled={savingRound}
        >
          <Text style={[
            styles.greenText,
            footerButtonIsFinishReady && styles.greenTextFinish,
          ]}>
            {savingRound ? "Saving…" : footerButtonLabel}
          </Text>
        </Pressable>
      </View>


      <Modal visible={yardageOpen} transparent animationType="fade" onRequestClose={() => setYardageOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setYardageOpen(false)}>
          <View />
        </Pressable>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Yardage Book</Text>
                <Text style={styles.modalSub}>
                  {courseName} • Hole {currentHole}
                </Text>
              </View>

              <Pressable onPress={() => setYardageOpen(false)} style={({ pressed }) => [styles.modalX, pressed && styles.pressed]}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              value={yardageText}
              onChangeText={setYardageText}
              placeholder="Example: Wind left-to-right. Aim at right edge. Long is trouble…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.modalInput}
              multiline
              autoFocus
            />

            <Pressable
              onPress={saveYardageNoteAndClose}
              disabled={saving}
              style={({ pressed }) => [styles.modalDone, pressed && styles.pressed, saving && { opacity: 0.7 }]}
            >
              <Text style={styles.modalDoneText}>{saving ? "Saving…" : "Done"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={savedOpen} transparent animationType="fade" onRequestClose={() => setSavedOpen(false)}>
        <Pressable style={styles.confirmBg} onPress={() => setSavedOpen(false)}>
          <View />
        </Pressable>
        <View style={styles.confirmWrap}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Round saved</Text>
            <Text style={styles.confirmSub}>Saved to Round History.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 14 },

  holeBarWrap: { paddingTop: 8, paddingBottom: 6 },
  holePills: { alignItems: "center" },

  holePill: {
    width: HOLE_PILL_SIZE,
    height: HOLE_PILL_SIZE,
    borderRadius: HOLE_PILL_SIZE / 2,
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: HOLE_PILL_GAP,
  },

  holePillActive: { backgroundColor: GREEN, borderRadius: HOLE_PILL_SIZE / 2 },
  holePillText: { color: WHITE, fontWeight: "900" },
  holePillTextActive: { color: GREEN_TEXT },

  modeRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 4 },
  modeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnPrimary: {
    backgroundColor: "rgba(46,125,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  modeText: { color: WHITE, fontWeight: "900" },
  modeTextPrimary: { color: WHITE },

  ybWrap: { marginHorizontal: 16, marginTop: 8 },

  ybCard: {
    height: 84,
    borderRadius: 27,
    borderWidth: 4,
    borderColor: YELLOW,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  ybCenterText: { color: WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },

  mapCard: {
    marginHorizontal: 16,
    marginTop: 8,
    height: 210,
    borderRadius: 22,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  mapEyebrow: {
    color: WHITE,
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  mapTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },
  mapSub: { color: MUTED, marginTop: 8, fontWeight: "700", fontSize: 14 },

  yardageRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 10 },
  yardCard: { flex: 1, backgroundColor: CARD, borderRadius: 20, alignItems: "center", paddingVertical: 10 },
  yardLabel: { color: MUTED, fontSize: 11, fontWeight: "900" },
  yardValue: { color: WHITE, fontSize: 30, fontWeight: "900", marginTop: 6 },
  yardUnit: { color: MUTED, fontSize: 12, fontWeight: "700" },

  microRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(46,125,255,0.95)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
  },
  microText: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 10, letterSpacing: 0.7 },

  hintCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(46,125,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.26)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hintTitle: { color: WHITE, fontWeight: "900", fontSize: 13 },
  hintSub: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

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
  hintBtnT: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
  hintBtnS: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 14 },

  footer: {
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },

  greenBtn: {
    height: 56,
    borderRadius: 999,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  greenText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },

  greenBtnFinish: {
    backgroundColor: "rgba(255, 210, 92, 0.95)",
  },
  greenTextFinish: {
    color: "#1A1A1A",
  },

  finishBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "rgba(46,125,255,0.18)",
    borderColor: "rgba(46,125,255,0.45)",
  },
  finishBtnText: { color: WHITE, fontWeight: "900", letterSpacing: 0.25, fontSize: 13 },

  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
  modalWrap: { flex: 1, justifyContent: "center", padding: 18 },
  modalCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  modalSub: { marginTop: 5, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

  modalX: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalXText: { color: WHITE, fontWeight: "900", fontSize: 14 },

  modalInput: {
    minHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.20)",
    color: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },

  modalDone: {
    marginTop: 12,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GREEN,
  },
  modalDoneText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 16 },

  confirmBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
  confirmWrap: { flex: 1, justifyContent: "center", padding: 18 },
  confirmCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  confirmTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  confirmSub: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, lineHeight: 17 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  sgWrap: { flex: 1, justifyContent: "center", padding: 18 },
  sgBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
  sgCard: {
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 2,
    borderColor: "rgba(242,201,76,0.85)",
  },
  sgTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sgIconPill: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242,201,76,0.14)",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.40)",
  },
  sgIcon: { fontSize: 20 },
  sgKicker: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 11, letterSpacing: 1.1 },
  sgTitle: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 20, letterSpacing: 0.8 },
  sgCarry: { marginTop: 4, color: "rgba(255,255,255,0.80)", fontWeight: "900", fontSize: 18, letterSpacing: 0.3 },
  sgSub: { marginTop: 6, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 13, lineHeight: 17 },
  sgDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 12, marginBottom: 12 },
  sgBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sgMiniPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  sgMiniText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
  sgBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(242,201,76,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  sgBtnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
});