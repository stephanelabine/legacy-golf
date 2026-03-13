// src/screens/FinalResultsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { saveRound, deleteRound } from "../storage/rounds";
import { clearActiveRound } from "../storage/roundState";
import { auth, db } from "../firebase/firebase";

const BG = "#06150F";
const CARD = "rgba(18,22,30,0.92)";
const ROW = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "$0";
  const fixed = Math.round(v * 100) / 100;
  return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function uniqInts(arr) {
  const s = new Set();
  (arr || []).forEach((x) => {
    const v = Number(x);
    if (Number.isFinite(v)) s.add(Math.round(v));
  });
  return Array.from(s).sort((a, b) => a - b);
}

function normKey(x) {
  return String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseHcp(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Supports BOTH storage shapes:
// A) roundState: holes["1"].players["p1"].strokes
// B) rounds.js legacy: holes[0].scores["p1"] = strokes
function readStroke(roundRoot, holeNumber, playerId) {
  const rid = String(playerId);

  const a =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
    roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
  const aInt = toInt(a);
  if (aInt > 0) return aInt;

  const holesArr = Array.isArray(roundRoot?.holes) ? roundRoot.holes : null;
  if (holesArr && holeNumber >= 1 && holeNumber <= holesArr.length) {
    const h = holesArr[holeNumber - 1];
    const b = h?.scores?.[rid] ?? h?.strokes?.[rid];
    const bInt = toInt(b);
    if (bInt > 0) return bInt;
  }

  return 0;
}

function readField(roundRoot, holeNumber, playerId, key) {
  const rid = String(playerId);
  const v =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.[key] ??
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.stats?.[key];
  return v ?? null;
}

function sumTotal(roundRoot, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const n = readStroke(roundRoot, h, playerId);
    if (n > 0) total += n;
  }
  return total;
}

function fmtPct(a, b) {
  if (!b) return "—";
  const pct = Math.round((a / b) * 100);
  return `${pct}%`;
}

// Try to read a Stroke Index/Handicap number (1-18) for a given hole.
// Supports several holeMeta shapes (array or object keyed by hole number).
function getStrokeIndex(roundRoot, holeNumber) {
  const hm = roundRoot?.holeMeta ?? roundRoot?.meta?.holeMeta ?? null;
  if (!hm) return null;

  const pick = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const raw =
      obj.strokeIndex ??
      obj.stokeIndex ??
      obj.si ??
      obj.handicap ??
      obj.hcp ??
      obj.hdcp ??
      obj.rank ??
      null;

    const n = parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 18) return null;
    return n;
  };

  if (Array.isArray(hm)) {
    const obj = hm[holeNumber - 1];
    return pick(obj);
  }

  const obj = hm?.[String(holeNumber)] ?? hm?.[holeNumber] ?? null;
  return pick(obj);
}

// Net per hole = strokes - strokesReceivedOnHole.
// strokesReceivedOnHole uses standard allocation:
// base = floor(hcp/18), extra holes = hcp % 18 on lowest strokeIndex holes.
function sumNetTotal(roundRoot, playerId, playerHcp) {
  const hcp = parseHcp(playerHcp);
  const gross = sumTotal(roundRoot, playerId);

  if (!Number.isFinite(hcp) || hcp <= 0) return gross;

  const hcRaw = Number(roundRoot?.holesCount ?? roundRoot?.meta?.holesCount);
  const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

  const sideRaw = String(roundRoot?.holesSide ?? roundRoot?.meta?.holesSide ?? "").toLowerCase().trim();
  const holesSide = sideRaw === "back" ? "back" : sideRaw === "front" ? "front" : null;

  const startHole = holesCount === 9 ? (holesSide === "back" ? 10 : 1) : 1;
  const endHole = holesCount === 9 ? (holesSide === "back" ? 18 : 9) : 18;
  const playedHoleCount = endHole - startHole + 1;

  let anyStrokeIndex = false;
  for (let h = startHole; h <= endHole; h++) {
    const si = getStrokeIndex(roundRoot, h);
    if (Number.isFinite(si)) {
      anyStrokeIndex = true;
      break;
    }
  }

  if (!anyStrokeIndex) {
    const prorated = Math.round((hcp * playedHoleCount) / 18);
    const netFallback = gross - prorated;
    return Number.isFinite(netFallback) ? netFallback : gross;
  }

  const base = Math.floor(hcp / 18);
  const extra = hcp % 18;

  let net = 0;

  for (let h = startHole; h <= endHole; h++) {
    const strokes = readStroke(roundRoot, h, playerId);
    if (strokes <= 0) continue;

    const si = getStrokeIndex(roundRoot, h);
    const getsExtra = Number.isFinite(si) && si <= extra ? 1 : 0;
    const received = base + getsExtra;

    net += strokes - received;
  }

  return net;
}

function getConfigByKeyFromRoundDoc(doc) {
  const c1 = doc?.configByKey;
  const c2 = doc?.formatConfigByKey;
  const c3 = doc?.formatDetailsByKey;
  const c4 = doc?.formatsConfigByKey;
  const c5 = doc?.formatsConfig;
  const c6 = doc?.formatConfig;
  return (
    (c1 && typeof c1 === "object" && c1) ||
    (c2 && typeof c2 === "object" && c2) ||
    (c3 && typeof c3 === "object" && c3) ||
    (c4 && typeof c4 === "object" && c4) ||
    (c5 && typeof c5 === "object" && c5) ||
    (c6 && typeof c6 === "object" && c6) ||
    {}
  );
}

function getFormatPools(roundDoc) {
  const pools =
    roundDoc?.formatPools && typeof roundDoc.formatPools === "object"
      ? roundDoc.formatPools
      : null;
  return pools || null;
}

function getIncludedPlayerIds(roundDoc, formatKey, playersList) {
  const pools = getFormatPools(roundDoc) || {};
  const excluded = Array.isArray(pools?.[formatKey]?.excludedIds)
    ? pools[formatKey].excludedIds
    : [];

  const excludedSet = new Set(excluded.map((x) => String(x)));
  const list = Array.isArray(playersList) ? playersList : [];

  return list
    .map((p) => String(p?.id ?? ""))
    .filter((id) => id && !excludedSet.has(id));
}

// IMPORTANT: detect “second shot kp” before “kp”
function detectFormatType(key, name) {
  const k = normKey(key);
  const n = normKey(name);
  const s = `${k} ${n}`.trim();

  const isSecondShot =
    s.includes("secondshotkp") ||
    s.includes("secondshot") ||
    (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
    s.includes("2ndshotkp") ||
    (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

  if (s.includes("nassau")) return "nassau";
  if (s.includes("skins")) return "skins";
  if (s.includes("stableford")) return "stableford";
  if (s.includes("birdiebuckets") || (s.includes("birdie") && s.includes("bucket"))) return "birdiebuckets";
  if (s.includes("wolf")) return "wolf";

  if (isSecondShot) return "secondshotkp";
  if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";
  if (s.includes("deucepot") || (s.includes("deuce") && s.includes("pot"))) return "deucepot";
  if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "puttingcontest";
  if (s.includes("teamvsteam") || (s.includes("team") && s.includes("vs") && s.includes("team"))) return "teamvsteam";
  if (s.includes("kp")) return "kp";
  return "unknown";
}

function formatIconName(type) {
  if (type === "kp") return "target";
  if (type === "secondshotkp") return "target-variant";
  if (type === "longdrive") return "golf";
  if (type === "puttingcontest") return "golf";
  if (type === "deucepot") return "cash";
  if (type === "teamvsteam") return "account-group";
  if (type === "nassau") return "trophy";
  if (type === "skins") return "star-four-points";
  if (type === "stableford") return "chart-line";
  if (type === "birdiebuckets") return "bucket";
  if (type === "wolf") return "paw";
  return "star-four-points";
}

function formatDisplayTitle(type, rawName) {
  if (type === "kp") return "KP";
  if (type === "longdrive") return "LONG DRIVE";
  if (type === "secondshotkp") return "SECOND SHOT KP";
  if (type === "deucepot") return "DEUCE POT";
  if (type === "puttingcontest") return "PUTTING CONTEST";
  if (type === "teamvsteam") return "TEAM VS TEAM";
  if (type === "nassau") return "NASSAU";
  if (type === "skins") return "SKINS";
  if (type === "stableford") return "STABLEFORD";
  if (type === "birdiebuckets") return "BIRDIE BUCKETS";
  if (type === "wolf") return "WOLF";
  return String(rawName || "FORMAT").toUpperCase();
}

function formatTheme(type) {
  if (type === "kp") return { accent: "#5AD7FF", bg: "rgba(90,215,255,0.10)", border: "rgba(90,215,255,0.28)" };
  if (type === "longdrive") return { accent: "#B8F37A", bg: "rgba(184,243,122,0.10)", border: "rgba(184,243,122,0.28)" };
  if (type === "secondshotkp") return { accent: "#9D7BFF", bg: "rgba(157,123,255,0.10)", border: "rgba(157,123,255,0.28)" };
  if (type === "deucepot") return { accent: "#FFCF5A", bg: "rgba(255,207,90,0.10)", border: "rgba(255,207,90,0.30)" };
  if (type === "puttingcontest") return { accent: "#FF7AC8", bg: "rgba(255,122,200,0.10)", border: "rgba(255,122,200,0.28)" };
  if (type === "teamvsteam") return { accent: "#69E6B4", bg: "rgba(105,230,180,0.10)", border: "rgba(105,230,180,0.28)" };

  if (type === "nassau") return { accent: "#FFCF5A", bg: "rgba(255,207,90,0.10)", border: "rgba(255,207,90,0.30)" };
  if (type === "skins") return { accent: "#FFCF5A", bg: "rgba(255,207,90,0.10)", border: "rgba(255,207,90,0.30)" };
  if (type === "stableford") return { accent: "#5AD7FF", bg: "rgba(90,215,255,0.10)", border: "rgba(90,215,255,0.28)" };
  if (type === "birdiebuckets") return { accent: "#69E6B4", bg: "rgba(105,230,180,0.10)", border: "rgba(105,230,180,0.28)" };
  if (type === "wolf") return { accent: "#9D7BFF", bg: "rgba(157,123,255,0.10)", border: "rgba(157,123,255,0.28)" };

  return { accent: YELLOW, bg: "rgba(242,201,76,0.08)", border: "rgba(242,201,76,0.22)" };
}

// Regular official holes from configByKey:
// - cfg.holes
// - cfg.holesSelected
// - cfg.holesByRound.r1
function getOfficialHolesForFormat(roundDoc, formatKey) {
  const cfgAll = getConfigByKeyFromRoundDoc(roundDoc);
  const cfg = cfgAll?.[String(formatKey)] || cfgAll?.[normKey(formatKey)] || null;
  if (!cfg || typeof cfg !== "object") return [];

  const holes = Array.isArray(cfg?.holes) ? cfg.holes : null;
  const holesSelected = Array.isArray(cfg?.holesSelected) ? cfg.holesSelected : null;
  const holesByRound = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : null;
  const holesR1 = holesByRound && Array.isArray(holesByRound?.r1) ? holesByRound.r1 : null;

  const list = holesR1 || holesSelected || holes || [];
  return uniqInts(list).filter((h) => h >= 1 && h <= 18);
}

function getEntryFee(roundDoc, formatKey) {
  const pools = getFormatPools(roundDoc);
  if (pools && pools?.[formatKey]) {
    const p = pools[formatKey];
    const fee =
      Number(p?.entryFee) ||
      Number(p?.buyIn) ||
      Number(p?.buyInAmount) ||
      Number(p?.amountPerHole) ||
      Number(p?.amountPerSkin) ||
      Number(p?.amountPerPoint) ||
      Number(p?.perPointValue) ||
      Number(p?.pointValue) ||
      0;
    return Number.isFinite(fee) && fee > 0 ? fee : 0;
  }

  // legacy-ish fallback
  const feeByKey = roundDoc?.feeByKey && typeof roundDoc.feeByKey === "object" ? roundDoc.feeByKey : null;
  const n = feeByKey ? Number(feeByKey?.[formatKey]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getParForHole(roundRoot, holeNumber) {
  const hm = roundRoot?.holeMeta ?? roundRoot?.meta?.holeMeta ?? null;
  if (!hm) return 4;

  const pickPar = (obj) => {
    if (!obj || typeof obj !== "object") return 4;
    const raw = obj.par ?? obj.Par ?? obj.PAR ?? 4;
    const n = parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n >= 3 && n <= 6 ? n : 4;
  };

  if (Array.isArray(hm)) return pickPar(hm[holeNumber - 1]);
  return pickPar(hm?.[String(holeNumber)] ?? hm?.[holeNumber]);
}

function stablefordPointsForDiff(diff) {
  if (diff <= -3) return 5; // albatross or better
  if (diff === -2) return 4; // eagle
  if (diff === -1) return 3; // birdie
  if (diff === 0) return 2;  // par
  if (diff === 1) return 1;  // bogey
  return 0;                  // double bogey or worse
}

function getStablefordWagerConfig(roundDoc, formatKey) {
  const pools = getFormatPools(roundDoc) || {};
  const p = pools?.[formatKey] || {};

  const modeRaw = String(
    p?.wagerMode ??
    p?.mode ??
    p?.payoutMode ??
    p?.stablefordMode ??
    ""
  ).toLowerCase().trim();

  const hasPerPointField =
    Number(p?.amountPerPoint) > 0 ||
    Number(p?.perPointValue) > 0 ||
    Number(p?.pointValue) > 0;

  let wagerMode = "total_entry";
  if (
    modeRaw.includes("point") ||
    modeRaw.includes("per_point") ||
    modeRaw.includes("perpoint") ||
    hasPerPointField
  ) {
    wagerMode = "dollar_per_point";
  }

  const totalEntry =
    Number(p?.totalEntry) ||
    Number(p?.buyIn) ||
    Number(p?.buyInAmount) ||
    Number(p?.entryFee) ||
    0;

  const perPoint =
    Number(p?.amountPerPoint) ||
    Number(p?.perPointValue) ||
    Number(p?.pointValue) ||
    Number(p?.entryFee) ||
    0;

  return {
    wagerMode,
    totalEntry: Number.isFinite(totalEntry) && totalEntry > 0 ? totalEntry : 0,
    perPoint: Number.isFinite(perPoint) && perPoint > 0 ? perPoint : 0,
  };
}

function computeStablefordRows(roundRoot, playersList, includedIds) {
  const r = roundRoot || {};
  const list = Array.isArray(playersList) ? playersList : [];
  const includeSet =
    Array.isArray(includedIds) && includedIds.length
      ? new Set(includedIds.map((x) => String(x)))
      : null;

  const basis = String(r?.scoringMode || r?.scoring || "gross").toLowerCase();
  const useNet = basis.includes("net");

  const played =
    Number(r?.holesCount ?? r?.meta?.holesCount) === 9
      ? (String(r?.holesSide ?? r?.meta?.holesSide ?? "").toLowerCase().trim() === "back"
        ? Array.from({ length: 9 }).map((_, i) => 10 + i)
        : Array.from({ length: 9 }).map((_, i) => 1 + i))
      : Array.from({ length: 18 }).map((_, i) => 1 + i);

  const rows = list
    .filter((p) => (includeSet ? includeSet.has(String(p.id)) : true))
    .map((p) => {
      let points = 0;

      for (let i = 0; i < played.length; i++) {
        const h = played[i];
        const gross = readStroke(r, h, p.id);
        if (!Number.isFinite(gross) || gross <= 0) continue;

        let scoreForPoints = gross;

        if (useNet) {
          const hcp = parseHcp(p?.handicap);
          const si = getStrokeIndex(r, h);
          if (Number.isFinite(si) && Number.isFinite(hcp) && hcp > 0) {
            const base = Math.floor(hcp / 18);
            const extra = hcp % 18;
            const getsExtra = si <= extra ? 1 : 0;
            const received = base + getsExtra;
            scoreForPoints = gross - received;
          }
        }

        const par = getParForHole(r, h);
        const diff = scoreForPoints - par;
        points += stablefordPointsForDiff(diff);
      }

      return {
        id: String(p.id),
        name: String(p.name || "Player"),
        points,
      };
    });

  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return rows;
}

export default function FinalResultsScreen({ navigation, route }) {
  const params = route?.params || {};
  const roundId = String(params.roundId || "");

  const TAB_LEADERBOARD = "leaderboard";
  const TAB_FORMATS = "formats";

  const [tab, setTab] = useState(TAB_LEADERBOARD);
  const [round, setRound] = useState(null);
  const [expanded, setExpanded] = useState({}); // playerId -> bool
  const [loading, setLoading] = useState(true);

  const [scoreMode, setScoreMode] = useState("gross"); // "gross" | "net"

  const [claimsByFormat, setClaimsByFormat] = useState({}); // normFormatKey -> { holeStr: claimDoc }
  const [showAllFormats, setShowAllFormats] = useState(true);

  const [winnerModalOpen, setWinnerModalOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(null);

  const courseName = String(round?.courseName || round?.course?.name || "Course");
  const teeName = String(round?.teeName || round?.tee?.name || "Tees");

  async function wipeRoundNoSave() {
    const rid = String(roundId || "").trim();
    const uid = auth?.currentUser?.uid;

    try {
      await clearActiveRound();
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

    navigation.navigate(ROUTES.HOME);
  }

  async function saveAndExit() {
    const rid = String(roundId || "").trim();

    // Derive endHole for 9/18 (front/back)
    const hcRaw = Number(round?.holesCount ?? round?.meta?.holesCount);
    const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

    const sideRaw = String(round?.holesSide ?? round?.meta?.holesSide ?? "").toLowerCase().trim();
    const holesSide = sideRaw === "back" ? "back" : sideRaw === "front" ? "front" : null;

    const endHole = holesCount === 9 ? (holesSide === "back" ? 18 : 9) : 18;

    try {
      const uid = auth?.currentUser?.uid;
      if (rid) {
        const isShared = String(rid).startsWith("sr_");
        const ref = isShared
          ? doc(db, "sharedRounds", String(rid))
          : (uid ? doc(db, "users", String(uid), "rounds", String(rid)) : null);

        if (ref) {
          await updateDoc(ref, {
            status: "completed",
            inProgress: false,
            isActive: false,
            currentHole: endHole,
            lastHole: endHole,
            holeNumber: endHole,
            hole: endHole,
            holeIndex: endHole - 1,
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch { }

    try {
      if (rid) {
        await saveRound({
          ...(round || {}),
          id: rid,
          roundId: rid,
          status: "completed",
          inProgress: false,
          isActive: false,
          currentHole: endHole,
          lastHole: endHole,
          holeNumber: endHole,
          hole: endHole,
          holeIndex: endHole - 1,
          completedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } catch { }

    try {
      await clearActiveRound();
    } catch { }

    navigation.navigate(ROUTES.HOME);
  }

  function onExit() {
    Alert.alert("Exit results?", "What would you like to do?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit (no save)",
        style: "destructive",
        onPress: wipeRoundNoSave,
      },
      {
        text: "Exit & Save",
        onPress: saveAndExit,
      },
    ]);
  }

  function onNextSettleUp() {
    if (!roundId) return;
    navigation.navigate(ROUTES.SETTLE_UP, { roundId });
  }

  useFocusEffect(
    useCallback(() => {
      if (!roundId) {
        setRound(null);
        setLoading(false);
        return () => { };
      }

      setLoading(true);

      const isShared = String(roundId).startsWith("sr_");
      const uid = auth?.currentUser?.uid;

      const ref = isShared
        ? doc(db, "sharedRounds", String(roundId))
        : (uid ? doc(db, "users", String(uid), "rounds", String(roundId)) : null);

      if (!ref) {
        setRound(null);
        setLoading(false);
        return () => { };
      }

      const unsub = onSnapshot(
        ref,
        (snap) => {
          setRound(snap.exists() ? (snap.data() || null) : null);
          setLoading(false);
        },
        () => {
          setRound(null);
          setLoading(false);
        }
      );

      return () => {
        try { unsub && unsub(); } catch { }
      };
    }, [roundId])
  );

  // Live claims snapshot (single source of truth):
  // shared: sharedRounds/{roundId}/formatClaims/{formatKey}_h{hole}
  // local : users/{uid}/rounds/{roundId}/formatClaims/{formatKey}_h{hole}
  useFocusEffect(
    useCallback(() => {
      const uid = auth?.currentUser?.uid;
      if (!roundId) return undefined;

      const isShared = String(roundId).startsWith("sr_");

      const ref = isShared
        ? collection(db, "sharedRounds", String(roundId), "formatClaims")
        : (uid ? collection(db, "users", String(uid), "rounds", String(roundId), "formatClaims") : null);

      if (!ref) return undefined;

      const unsub = onSnapshot(
        ref,
        (snap) => {
          const map = {};
          snap.forEach((d) => {
            const id = String(d.id || "");
            const m = id.match(/^(.*)_h(\d+)$/);
            if (!m) return;

            const rawKey = String(m[1] || "").trim();
            const hole = String(Number(m[2] || 0));
            if (!rawKey || !hole || hole === "0") return;

            const nk = normKey(rawKey);
            if (!nk) return;

            if (!map[nk]) map[nk] = {};
            map[nk][hole] = d.data() || {};
          });

          setClaimsByFormat(map);
        },
        () => setClaimsByFormat({})
      );

      return () => unsub();
    }, [roundId])
  );

  const players = useMemo(() => {
    const list = Array.isArray(round?.players) ? round.players : [];
    return list.map((p, idx) => ({
      id: String(p?.id ?? String(idx)),
      name: String(p?.name || `Player ${idx + 1}`),
      handicap: parseHcp(
        p?.handicap ??
        p?.hcp ??
        p?.handicapIndex ??
        p?.index ??
        p?.courseHandicap ??
        p?.handicapStrokes ??
        p?.strokesHdcp ??
        0
      ),
    }));
  }, [round]);

  const rosterCount = useMemo(() => (Array.isArray(players) ? players.length : 0), [players]);

  const stats = useMemo(() => {
    const r = round || {};
    const out = players.map((p) => {
      let puttsTotal = 0;

      let firYes = 0;
      let firOpp = 0;

      let girYes = 0;
      let girOpp = 0;

      let upYes = 0;
      let upOpp = 0;

      let sandYes = 0;
      let sandOpp = 0;

      for (let h = 1; h <= 18; h++) {
        const putts = toInt(readField(r, h, p.id, "putts"));
        if (putts > 0) puttsTotal += putts;

        const fairway = String(readField(r, h, p.id, "fairway") ?? "na");
        if (fairway !== "na") {
          firOpp += 1;
          if (fairway === "yes") firYes += 1;
        }

        const green = String(readField(r, h, p.id, "green") ?? "na");
        if (green !== "na") {
          girOpp += 1;
          if (green === "yes") girYes += 1;
        }

        const updown = String(readField(r, h, p.id, "updown") ?? "na");
        if (updown !== "na") {
          upOpp += 1;
          if (updown === "yes") upYes += 1;
        }

        const sandSave = String(readField(r, h, p.id, "sandSave") ?? "na");
        if (sandSave !== "na") {
          sandOpp += 1;
          if (sandSave === "yes") sandYes += 1;
        }
      }

      return {
        id: p.id,
        name: p.name,
        puttsTotal,
        fir: fmtPct(firYes, firOpp),
        gir: fmtPct(girYes, girOpp),
        updown: fmtPct(upYes, upOpp),
        sand: fmtPct(sandYes, sandOpp),
      };
    });

    return out;
  }, [round, players]);

  const leaderboard = useMemo(() => {
    const r = round || {};

    const rows = players.map((p) => {
      const gross = sumTotal(r, p.id);
      const net = sumNetTotal(r, p.id, p.handicap);

      const st = stats.find((x) => String(x.id) === String(p.id));
      const putts = Number(st?.puttsTotal || 0);

      return {
        id: p.id,
        name: p.name,
        gross,
        net,
        putts,
      };
    });

    rows.sort((a, b) => {
      const key = scoreMode === "net" ? "net" : "gross";
      const aa = Number.isFinite(Number(a[key])) ? Number(a[key]) : 999999;
      const bb = Number.isFinite(Number(b[key])) ? Number(b[key]) : 999999;
      if (aa !== bb) return aa - bb;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }, [round, players, stats, scoreMode]);

  function togglePlayer(pid) {
    setExpanded((prev) => ({ ...prev, [pid]: !prev[pid] }));
  }

  const tabs = useMemo(
    () => [
      { key: TAB_LEADERBOARD, label: "Leaderboard" },
      { key: TAB_FORMATS, label: "Formats" },
    ],
    []
  );

  const renderTabs = () => {
    return (
      <View style={styles.tabsRow}>
        {tabs.map((t) => {
          const isActive = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => [
                styles.tabPill,
                isActive ? styles.tabPillActive : styles.tabPillIdle,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextIdle]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderColumnHeader = () => {
    return (
      <View style={styles.headerRow}>
        <View style={styles.rankPillSpacer} />
        <View style={styles.headerRowMid}>
          <Text style={[styles.colText, styles.colPlayer]}>PLAYER</Text>
        </View>

        <View style={styles.numCol}>
          <Text style={[styles.colText, styles.colNum]}>{scoreMode === "gross" ? "GROSS" : "NET"}</Text>
        </View>

        <View style={styles.numCol}>
          <Text style={[styles.colText, styles.colNum]}>PUTTS</Text>
        </View>
      </View>
    );
  };

  const renderLeaderboardCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Leaderboard</Text>

          <Pressable
            onPress={() => setScoreMode((m) => (m === "gross" ? "net" : "gross"))}
            style={({ pressed }) => [styles.leaderToggle, pressed && styles.pressed]}
          >
            <Text style={styles.leaderToggleText}>{scoreMode === "gross" ? "Gross" : "Net"}</Text>
          </Pressable>
        </View>

        {renderColumnHeader()}
        <View style={styles.divider} />

        <ScrollView
          style={styles.leaderRowsScroll}
          contentContainerStyle={styles.leaderRowsContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {leaderboard.map((p, idx) => {
            const isOpen = !!expanded[p.id];

            return (
              <Pressable
                key={p.id}
                onPress={() => togglePlayer(p.id)}
                style={({ pressed }) => [
                  styles.rowCard,
                  idx > 0 && { marginTop: 10 },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>

                <View style={styles.rowMid}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.subTap}>{isOpen ? "Tap to collapse" : "Tap to expand"}</Text>
                </View>

                <View style={styles.numCol}>
                  <Text style={styles.numBig}>
                    {scoreMode === "gross"
                      ? (p.gross > 0 ? String(p.gross) : "—")
                      : (Number.isFinite(Number(p.net)) ? String(p.net) : "—")}
                  </Text>
                  <Text style={styles.numSub}>{scoreMode === "gross" ? "gross" : "net"}</Text>
                </View>

                <View style={styles.numCol}>
                  <Text style={styles.numBig2}>{p.putts > 0 ? String(p.putts) : "—"}</Text>
                  <Text style={styles.numSub}>putts</Text>
                </View>

                {isOpen ? (
                  <View style={styles.expandWrap}>
                    <View style={styles.expandDivider} />
                    <View style={styles.holesGrid}>
                      {Array.from({ length: 18 }).map((_, i) => {
                        const h = i + 1;
                        const v = readStroke(round, h, p.id);
                        return (
                          <View key={`${p.id}-${h}`} style={styles.holeChip}>
                            <Text style={styles.holeChipTop}>{h}</Text>
                            <Text style={styles.holeChipVal}>{v > 0 ? String(v) : "—"}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const selectedFormats = useMemo(() => {
    const raw = Array.isArray(round?.formatsSelected) ? round.formatsSelected : [];
    const out = raw
      .map((x) => {
        if (typeof x === "string") return { key: String(x).trim(), name: String(x).trim() };
        const k = String(x?.key || x?.id || x?.formatKey || "").trim();
        const n = String(x?.name || x?.title || k || "").trim();
        return k ? { key: k, name: n || k } : null;
      })
      .filter(Boolean);

    const ORDER = ["kp", "longdrive", "secondshotkp", "deucepot", "puttingcontest", "teamvsteam"];
    const rank = (f) => {
      const t = detectFormatType(f.key, f.name);
      const idx = ORDER.indexOf(t);
      return idx === -1 ? 999 : idx;
    };

    return [...out].sort((a, b) => rank(a) - rank(b));
  }, [round]);

  const formatsToRender = useMemo(() => {
    if (showAllFormats) return selectedFormats;
    return selectedFormats.slice(0, 3);
  }, [selectedFormats, showAllFormats]);

  const openWinnerModal = useCallback((f) => {
    setSelectedFormat(f || null);
    setWinnerModalOpen(true);
  }, []);

  const closeWinnerModal = useCallback(() => {
    setWinnerModalOpen(false);
    setSelectedFormat(null);
  }, []);

  const computePuttingLeaders = useCallback(
    (includedIds) => {
      const includeSet =
        Array.isArray(includedIds) && includedIds.length
          ? new Set(includedIds.map((x) => String(x)))
          : null;

      const rows = (stats || [])
        .map((s) => ({
          id: String(s.id),
          name: String(s.name),
          putts: Number(s.puttsTotal || 0),
        }))
        .filter((r) => Number.isFinite(r.putts) && r.putts > 0)
        .filter((r) => (includeSet ? includeSet.has(String(r.id)) : true));

      rows.sort((a, b) => a.putts - b.putts || a.name.localeCompare(b.name));
      if (!rows.length) return { first: [], second: [], third: [] };

      const firstPutts = rows[0].putts;
      const first = rows.filter((r) => r.putts === firstPutts);

      const restAfterFirst = rows.filter((r) => r.putts !== firstPutts);
      if (!restAfterFirst.length) return { first, second: [], third: [] };

      const secondPutts = restAfterFirst[0].putts;
      const second = restAfterFirst.filter((r) => r.putts === secondPutts);

      const restAfterSecond = restAfterFirst.filter((r) => r.putts !== secondPutts);
      if (!restAfterSecond.length) return { first, second, third: [] };

      const thirdPutts = restAfterSecond[0].putts;
      const third = restAfterSecond.filter((r) => r.putts === thirdPutts);

      return { first, second, third };
    },
    [stats]
  );

  const computeDeuceCounts = useCallback(
    (includedIds) => {
      const r = round || {};
      const rows = [];

      const includeSet =
        Array.isArray(includedIds) && includedIds.length
          ? new Set(includedIds.map((x) => String(x)))
          : null;

      players
        .filter((p) => (includeSet ? includeSet.has(String(p.id)) : true))
        .forEach((p) => {
          let count = 0;
          for (let h = 1; h <= 18; h++) {
            const s = readStroke(r, h, p.id);
            if (Number.isFinite(s) && s === 2) count += 1;
          }
          if (count > 0) rows.push({ id: p.id, name: p.name, deuces: count });
        });

      rows.sort((a, b) => b.deuces - a.deuces || a.name.localeCompare(b.name));
      return rows;
    },
    [round, players]
  );

  function renderFormatPayout(formatKey, type, officialHoles) {
    const includedIds = getIncludedPlayerIds(round || {}, formatKey, players);
    const playersCount = Math.max(0, includedIds.length);

    // Nassau buy-ins are stored in wagers.nassau (not formatPools)
    if (type === "nassau") {
      const w = round?.wagers?.nassau || {};
      const enabled = !!w?.enabled;
      const frontBuyIn = Number(w?.front || 0);
      const backBuyIn = Number(w?.back || 0);
      const totalBuyIn = Number(w?.total || 0);

      const anyBuyIn = (frontBuyIn > 0) || (backBuyIn > 0) || (totalBuyIn > 0);

      if (!enabled || !anyBuyIn) {
        return { headline: "No buy-in", lines: ["Set Nassau buy-ins in Money Pools to compute payouts."] };
      }

      const frontPool = frontBuyIn > 0 ? frontBuyIn * playersCount : 0;
      const backPool = backBuyIn > 0 ? backBuyIn * playersCount : 0;
      const totalPool = totalBuyIn > 0 ? totalBuyIn * playersCount : 0;

      return {
        headline: `${money(frontPool)} / ${money(backPool)} / ${money(totalPool)}`,
        lines: [
          `Front buy-in (per player): ${frontBuyIn > 0 ? money(frontBuyIn) : "—"}`,
          `Back buy-in (per player): ${backBuyIn > 0 ? money(backBuyIn) : "—"}`,
          `Overall buy-in (per player): ${totalBuyIn > 0 ? money(totalBuyIn) : "—"}`,
          `Players: ${String(playersCount)}`,
          `Pools (Front / Back / Overall): ${money(frontPool)} / ${money(backPool)} / ${money(totalPool)}`,
        ],
      };
    }

    if (type === "birdiebuckets") {
      const bb = round?.wagers?.birdieBuckets && typeof round.wagers.birdieBuckets === "object"
        ? round.wagers.birdieBuckets
        : {};

      const holesObj = bb?.holes && typeof bb.holes === "object" ? bb.holes : {};
      const holeEntries = Object.values(holesObj)
        .filter((x) => x && typeof x === "object")
        .sort((a, b) => Number(a?.hole || 0) - Number(b?.hole || 0));

      const totalWon = holeEntries.reduce((sum, h) => sum + (Number(h?.win?.amount || 0) || 0), 0);
      const resolvedWins = holeEntries.filter((h) => Number(h?.win?.amount || 0) > 0);
      const perEvent = Number(bb?.perEvent || getEntryFee(round || {}, formatKey) || 0);
      const modeRaw = String(bb?.mode || "hits_pay_all").trim();
      const modeLabel = modeRaw === "misses_pay" ? "Misses pay" : "Hits add";

      const winLines = resolvedWins.map((h) => {
        const winnerName = String(h?.win?.winnerName || "").trim() || "Player";
        const holeNum = Number(h?.hole || h?.win?.hole || 0);
        return `${winnerName} won with a birdie on hole ${holeNum}`;
      });

      return {
        headline: totalWon > 0 ? `${money(totalWon)} won` : "No bucket wins yet",
        lines: [
          `Mode: ${modeLabel}`,
          `Per event: ${perEvent > 0 ? money(perEvent) : "—"}`,
          `Birdie Buckets won: ${String(resolvedWins.length)}`,
          `Total paid out: ${money(totalWon) || "$0"}`,
          ...winLines,
        ],
      };
    }


    // For hole-based formats, this value means "$ per hole (per event) per player"
    // For round-total formats, it means "$ buy-in per player"
    const baseAmount = getEntryFee(round || {}, formatKey);

    if (baseAmount <= 0) {
      return { headline: "No buy-in", lines: ["Set a buy-in in Formats / Money Pools to compute payouts."] };
    }

    if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
      const events = Array.isArray(officialHoles) ? officialHoles.length : 0;

      const perHoleAmount = baseAmount;
      const perPlayerEntry = events > 0 ? perHoleAmount * events : 0;
      const poolTotal = perPlayerEntry > 0 ? perPlayerEntry * playersCount : 0;

      // Winner should not “pay themselves”
      const perWin = perHoleAmount * Math.max(0, playersCount - 1);

      return {
        headline: events > 0 ? `${money(perWin)} per win` : "Needs holes",
        lines: [
          `$ per hole: ${money(perHoleAmount)}`,
          `Entry fee (per player): ${money(perPlayerEntry)}`,
          `Players: ${playersCount}`,
          `Pool total: ${money(poolTotal)}`,
          `Official holes selected: ${events > 0 ? String(events) : "0 (select holes in Format Details)"}`,
        ],
      };
    }

    // Round-total formats: baseAmount is buy-in per player
    const buyIn = baseAmount;
    const poolTotal = buyIn * playersCount;

    if (type === "deucepot") {
      const r = round || {};
      let totalDeuces = 0;

      for (let i = 0; i < includedIds.length; i++) {
        const pid = includedIds[i];
        for (let h = 1; h <= 18; h++) {
          const s = readStroke(r, h, pid);
          if (Number.isFinite(s) && s === 2) totalDeuces += 1;
        }
      }

      const collectiblePool = buyIn * Math.max(0, playersCount - 1);
      const perDeuce = totalDeuces > 0 ? collectiblePool / totalDeuces : 0;

      return {
        headline: totalDeuces > 0 ? `${money(perDeuce)} per deuce` : "No deuces yet",
        lines: [
          `Buy-in (per player): ${money(buyIn)}`,
          `Players: ${playersCount}`,
          `Total pool: ${money(poolTotal)}`,
          `Collectible winnings pool: ${money(collectiblePool)}`,
          `Total deuces: ${String(totalDeuces)}`,
          `Per deuce: ${totalDeuces > 0 ? money(perDeuce) : "—"}`,
        ],
      };
    }

    if (type === "puttingcontest") {
      const pools = getFormatPools(round || {}) || {};
      const ppRaw = Number(pools?.[formatKey]?.payoutPlaces);
      const payoutPlaces = ppRaw === 2 || ppRaw === 3 ? ppRaw : 1;

      const splits =
        payoutPlaces === 3
          ? [0.6, 0.3, 0.1]
          : payoutPlaces === 2
            ? [0.75, 0.25]
            : [1];

      const collectiblePool = buyIn * Math.max(0, playersCount - 1);
      const amounts = splits.map((s) => collectiblePool * s);
      const headline = amounts.map((a) => money(a)).join(" / ");

      const splitLine =
        payoutPlaces === 3
          ? "Split: 1st 60%, 2nd 30%, 3rd 10% of collectible winnings."
          : payoutPlaces === 2
            ? "Split: 1st 75% and 2nd 25% of collectible winnings."
            : "Split: 1st place wins 100% of collectible winnings.";

      return {
        headline,
        lines: [
          `Payout places: ${String(payoutPlaces)}`,
          splitLine,
          `Buy-in (per player): ${money(buyIn)}`,
          `Players: ${playersCount}`,
          `Total pool: ${money(poolTotal)}`,
          `Collectible winnings pool: ${money(collectiblePool)}`,
        ],
      };
    }

    if (type === "teamvsteam") {
      const perPlayer = playersCount > 0 ? poolTotal / playersCount : 0;
      return {
        headline: playersCount > 0 ? `${money(perPlayer)} per player` : "Players needed",
        lines: [`Buy-in (per player): ${money(buyIn)}`, `Players: ${playersCount}`, `Pool total: ${money(poolTotal)}`],
      };
    }

    if (type === "stableford") {
      const stableRows = computeStablefordRows(round || {}, players, includedIds);
      if (!stableRows.length) {
        return {
          headline: "No Stableford scores yet",
          lines: ["Complete the round to compute Stableford payouts."],
        };
      }

      const cfg = getStablefordWagerConfig(round || {}, formatKey);
      const topPoints = Number(stableRows[0]?.points || 0);
      const winners = stableRows.filter((x) => Number(x.points) === topPoints);

      if (cfg.wagerMode === "dollar_per_point") {
        const rate = cfg.perPoint;
        if (!rate || rate <= 0) {
          return {
            headline: "No buy-in",
            lines: ["Set a dollar-per-point value in Money Pools to compute payouts."],
          };
        }

        const grossById = {};
        stableRows.forEach((x) => {
          grossById[String(x.id)] = 0;
        });

        for (let i = 0; i < stableRows.length; i++) {
          for (let j = i + 1; j < stableRows.length; j++) {
            const a = stableRows[i];
            const b = stableRows[j];
            const diff = Math.abs(Number(a.points) - Number(b.points));
            if (!diff) continue;

            const amt = diff * rate;
            if (a.points > b.points) grossById[String(a.id)] += amt;
            if (b.points > a.points) grossById[String(b.id)] += amt;
          }
        }

        const topWinner = stableRows[0];
        const topGross = Number(grossById[String(topWinner.id)] || 0);

        return {
          headline: `${money(topGross)} net`,
          lines: [
            `Wager mode: Dollar Per Point`,
            `Value per point: ${money(rate)}`,
            ...stableRows.map((x) => `${x.name}: ${x.points} pts`),
          ],
        };
      }

      const entry = cfg.totalEntry || buyIn;
      if (!entry || entry <= 0) {
        return {
          headline: "No buy-in",
          lines: ["Set a total-entry buy-in in Money Pools to compute payouts."],
        };
      }

      const winnerCount = winners.length;
      const collectiblePool = entry * Math.max(0, playersCount - winnerCount);
      const eachWinnerNet = winnerCount > 0 ? collectiblePool / winnerCount : 0;

      return {
        headline: `${money(eachWinnerNet)} net`,
        lines: [
          `Wager mode: Total Entry`,
          `Buy-in (per player): ${money(entry)}`,
          `Players: ${playersCount}`,
          `Pool total: ${money(entry * playersCount)}`,
          `Net to winner${winnerCount > 1 ? "s" : ""}: ${money(eachWinnerNet)}`,
          ...stableRows.map((x) => `${x.name}: ${x.points} pts`),
        ],
      };
    }

    return {
      headline: `${money(poolTotal)} (winner)`,
      lines: [`Buy-in (per player): ${money(buyIn)}`, `Players: ${playersCount}`, `Pool total: ${money(poolTotal)}`],
    };
  }

  const renderWinnerModal = () => {
    if (!winnerModalOpen || !selectedFormat) return null;

    const f = selectedFormat;
    const formatKey = String(f.key || "").trim();
    const rawName = String(f.name || f.key || "Format");

    const type = detectFormatType(formatKey, rawName);
    const display = formatDisplayTitle(type, rawName);
    const theme = formatTheme(type);
    const icon = formatIconName(type);

    const nk = normKey(formatKey);
    const officialHoles = getOfficialHolesForFormat(round || {}, formatKey);
    const claimsMap = claimsByFormat?.[nk] || {};

    const perHoleAmount = getEntryFee(round || {}, formatKey); // for hole formats: $ per hole (per event) per player

    const events = officialHoles.length;

    const includedIds = getIncludedPlayerIds(round || {}, formatKey, players);
    const includedCount = Math.max(0, includedIds.length);

    const perPlayerEntry = perHoleAmount > 0 && events > 0 ? perHoleAmount * events : 0;

    // Winner should not “pay themselves”:
    // payout per win = per-hole amount * (players - 1)
    const perWin = perHoleAmount > 0 ? perHoleAmount * Math.max(0, includedCount - 1) : 0;

    const isAuto = type === "deucepot" || type === "puttingcontest" || type === "nassau" || type === "skins";

    const isCarryDoc = (c) => {
      const s = String(c?.status || "").toLowerCase();
      return s === "carry_over" || s === "carryover";
    };

    const extractWinnerName = (c) => {
      const nm = String(c?.claimedByPlayerName || c?.playerName || c?.name || "").trim();
      return nm || "";
    };

    // Build resolved winners per official hole.
    // If a hole is carry over, it resolves to the next official hole that has a winner.
    const resolvedByHole = {};
    if (!isAuto) {
      for (let i = 0; i < officialHoles.length; i++) {
        const h = officialHoles[i];
        const c = claimsMap?.[String(h)] || null;

        const directWinner = extractWinnerName(c);
        if (directWinner) {
          resolvedByHole[String(h)] = { winnerName: directWinner, note: "" };
          continue;
        }

        if (c && isCarryDoc(c)) {
          // find the next official hole with a real winner
          let resolvedHole = null;
          let resolvedName = "";

          for (let j = i + 1; j < officialHoles.length; j++) {
            const h2 = officialHoles[j];
            const c2 = claimsMap?.[String(h2)] || null;
            const nm2 = extractWinnerName(c2);
            if (nm2) {
              resolvedHole = h2;
              resolvedName = nm2;
              break;
            }
          }

          if (resolvedName) {
            resolvedByHole[String(h)] = {
              winnerName: resolvedName,
              note: `Carry over → Hole ${resolvedHole}`,
            };
          } else {
            resolvedByHole[String(h)] = { winnerName: "", note: "Carry over pending" };
          }

          continue;
        }

        // no doc or no winner yet
        resolvedByHole[String(h)] = { winnerName: "", note: "" };
      }
    }

    const resolvedCount = !isAuto
      ? officialHoles.reduce((acc, h) => acc + (resolvedByHole?.[String(h)]?.winnerName ? 1 : 0), 0)
      : 0;

    const statusPill =
      type === "birdiebuckets"
        ? (() => {
          const bb =
            round?.wagers?.birdieBuckets && typeof round.wagers.birdieBuckets === "object"
              ? round.wagers.birdieBuckets
              : {};

          const holesObj = bb?.holes && typeof bb.holes === "object" ? bb.holes : {};
          const winCount = Object.values(holesObj).filter(
            (x) => x && typeof x === "object" && Number(x?.win?.amount || 0) > 0
          ).length;

          return `${winCount} ${winCount === 1 ? "WIN" : "WINS"}`;
        })()
        : isAuto
          ? "AUTO"
          : events === 0
            ? "NO HOLES SET"
            : `${resolvedCount}/${events} RESOLVED`;


    const payout = renderFormatPayout(formatKey, type, officialHoles);

    const puttingLeaders =
      isAuto && type === "puttingcontest"
        ? computePuttingLeaders(includedIds)
        : null;

    const deuceRows =
      isAuto && type === "deucepot"
        ? computeDeuceCounts(includedIds)
        : null;
    return (
      <Modal visible={winnerModalOpen} transparent animationType="fade" onRequestClose={closeWinnerModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { borderColor: theme.border }]}>
            <View style={styles.modalTop}>
              <View style={[styles.modalIconWrap, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {display} Winners
                </Text>
              </View>

              <Pressable onPress={closeWinnerModal} style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalSection}>
              <View style={styles.modalSectionRow}>
                <Text style={styles.modalSectionTitle}>Winner</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{statusPill}</Text>
                </View>
              </View>

              <View style={styles.winnerBox}>
                {type === "nassau" ? (
                  <View style={{ width: "100%", gap: 10 }}>
                    {(() => {
                      const r = round || {};
                      const w = r?.wagers?.nassau || {};
                      const frontBuyIn = Number(w?.front || 0);
                      const backBuyIn = Number(w?.back || 0);
                      const totalBuyIn = Number(w?.total || 0);

                      const hcRaw = Number(r?.holesCount ?? r?.meta?.holesCount);
                      const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

                      const sideRaw = String(r?.holesSide ?? r?.meta?.holesSide ?? "").toLowerCase().trim();
                      const holesSide = sideRaw === "back" ? "back" : "front";

                      const playedHoles =
                        holesCount === 9
                          ? (holesSide === "back"
                            ? Array.from({ length: 9 }).map((_, i) => 10 + i)
                            : Array.from({ length: 9 }).map((_, i) => 1 + i))
                          : Array.from({ length: 18 }).map((_, i) => 1 + i);

                      const frontHoles = playedHoles.filter((h) => h >= 1 && h <= 9);
                      const backHoles = playedHoles.filter((h) => h >= 10 && h <= 18);
                      const overallHoles = playedHoles;

                      const basis = String(r?.matchPlay?.scoring?.basis || r?.scoringMode || r?.scoring || "gross").toLowerCase();
                      const useNet = basis.includes("net");

                      const netStrokeForHole = (playerId, playerHcp, holeNumber) => {
                        const strokes = readStroke(r, holeNumber, playerId);
                        if (!Number.isFinite(strokes) || strokes <= 0) return 0;

                        if (!useNet) return strokes;

                        const hcp = parseHcp(playerHcp);
                        if (!Number.isFinite(hcp) || hcp <= 0) return strokes;

                        let anySI = false;
                        for (let h = 1; h <= 18; h++) {
                          const si = getStrokeIndex(r, h);
                          if (Number.isFinite(si)) { anySI = true; break; }
                        }

                        if (!anySI) return Math.max(0, strokes - hcp);

                        const base = Math.floor(hcp / 18);
                        const extra = hcp % 18;

                        const si = getStrokeIndex(r, holeNumber);
                        const getsExtra = Number.isFinite(si) && si <= extra ? 1 : 0;
                        const received = base + getsExtra;

                        return strokes - received;
                      };

                      const totalForHoles = (player, holes) => {
                        let t = 0;
                        for (let i = 0; i < holes.length; i++) {
                          t += netStrokeForHole(player.id, player.handicap, holes[i]);
                        }
                        return t;
                      };

                      const winnersFor = (holes) => {
                        if (!holes.length) return { status: "NOT_PLAYED", winners: [] };

                        const rows = players.map((p) => ({
                          id: p.id,
                          name: p.name,
                          total: totalForHoles(p, holes),
                        }));

                        rows.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
                        const best = rows[0]?.total;
                        const winners = rows.filter((x) => x.total === best);

                        return { status: winners.length > 1 ? "TIE" : "WIN", winners };
                      };

                      const frontR = winnersFor(frontHoles);
                      const backR = winnersFor(backHoles);
                      const overallR = winnersFor(overallHoles);

                      const line = (label, res, buyIn) => {
                        if (!buyIn || buyIn <= 0) return `${label}: No buy-in`;

                        if (res?.status === "NOT_PLAYED") return `${label}: Not played`;

                        const winners = res?.winners || [];
                        if (!winners.length) return `${label}: —`;

                        const names = winners.map((x) => x.name).join(", ");
                        if (!names) return `${label}: —`;

                        if (res?.status === "TIE") return `${label}: TIE (${useNet ? "net" : "gross"})`;

                        return `${label}: ${names} (${useNet ? "net" : "gross"})`;
                      };

                      return (
                        <>
                          <Text style={styles.modalLine}>{line("Front", frontR, frontBuyIn)}</Text>
                          <Text style={styles.modalLine}>{line("Back", backR, backBuyIn)}</Text>
                          <Text style={styles.modalLine}>{line("Overall", overallR, totalBuyIn)}</Text>
                        </>
                      );
                    })()}
                  </View>
                ) : type === "stableford" ? (
                  <View style={{ width: "100%", gap: 10 }}>
                    {(() => {
                      const stableRows = computeStablefordRows(round || {}, players, includedIds);
                      if (!stableRows.length) {
                        return <Text style={styles.modalLine}>No Stableford scores recorded yet.</Text>;
                      }

                      return stableRows.map((entry, idx) => (
                        <View key={`stableford-${entry.id}-${idx}`} style={styles.claimRow}>
                          <Text style={styles.claimLeft}>{idx + 1}</Text>

                          <View style={styles.claimMidBox}>
                            <Text style={styles.claimMidName} numberOfLines={1}>
                              {entry.name}
                            </Text>
                            <Text style={styles.claimMidNote} numberOfLines={1}>
                              Stableford total
                            </Text>
                          </View>

                          <View style={styles.matchPill}>
                            <Text style={styles.matchPillText}>{entry.points} pts</Text>
                          </View>
                        </View>
                      ));
                    })()}
                  </View>
                ) : isAuto ? (
                  <View style={{ width: "100%", gap: 8 }}>
                    {type === "skins" ? (
                      <>
                        {(() => {
                          const r = round || {};
                          const perSkin = getEntryFee(r, formatKey);
                          const included = includedIds || [];

                          if (!perSkin || perSkin <= 0) {
                            return <Text style={styles.modalLine}>No skins amount set.</Text>;
                          }

                          // Determine net/gross basis
                          const basis = String(r?.matchPlay?.scoring?.basis || r?.scoringMode || r?.scoring || "gross").toLowerCase();
                          const useNet = basis.includes("net");

                          // Determine played holes (9/18 front/back)
                          const hcRaw = Number(r?.holesCount ?? r?.meta?.holesCount);
                          const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

                          const sideRaw = String(r?.holesSide ?? r?.meta?.holesSide ?? "").toLowerCase().trim();
                          const holesSide = sideRaw === "back" ? "back" : sideRaw === "front" ? "front" : null;

                          const playedHoles =
                            holesCount === 9
                              ? (holesSide === "back"
                                ? Array.from({ length: 9 }).map((_, i) => 10 + i)
                                : Array.from({ length: 9 }).map((_, i) => 1 + i))
                              : Array.from({ length: 18 }).map((_, i) => 1 + i);

                          const netStrokeForHole = (playerId, playerHcp, holeNumber) => {
                            const strokes = readStroke(r, holeNumber, playerId);
                            if (!Number.isFinite(strokes) || strokes <= 0) return 0;
                            if (!useNet) return strokes;

                            const hcp = parseHcp(playerHcp);
                            if (!Number.isFinite(hcp) || hcp <= 0) return strokes;

                            let anySI = false;
                            for (let h = 1; h <= 18; h++) {
                              const si = getStrokeIndex(r, h);
                              if (Number.isFinite(si)) { anySI = true; break; }
                            }
                            if (!anySI) return Math.max(0, strokes - hcp);

                            const base = Math.floor(hcp / 18);
                            const extra = hcp % 18;

                            const si = getStrokeIndex(r, holeNumber);
                            const getsExtra = Number.isFinite(si) && si <= extra ? 1 : 0;
                            const received = base + getsExtra;

                            return strokes - received;
                          };

                          // Build player lookup
                          const pById = {};
                          players.forEach((p) => { pById[String(p.id)] = p; });

                          // Count skins & dollars per player using carry logic (ignore holes with missing strokes)
                          const skinsCountById = {};
                          const wonById = {};
                          included.forEach((pid) => {
                            skinsCountById[String(pid)] = 0;
                            wonById[String(pid)] = 0;
                          });

                          let carryUnits = 0;

                          for (let i = 0; i < playedHoles.length; i++) {
                            const h = playedHoles[i];

                            const scored = included.map((pid) => {
                              const id = String(pid);
                              const p = pById[id] || {};
                              const v = netStrokeForHole(id, p.handicap, h);
                              return { id, v };
                            });

                            if (scored.some((x) => !Number.isFinite(x.v) || x.v <= 0)) continue;

                            scored.sort((a, b) => a.v - b.v);
                            const best = scored[0]?.v;
                            if (best == null) continue;

                            const tied = scored.filter((x) => x.v === best);
                            if (tied.length === 1) {
                              const winId = String(tied[0].id);
                              const units = 1 + carryUnits;
                              carryUnits = 0;

                              skinsCountById[winId] = (skinsCountById[winId] || 0) + units;
                              wonById[winId] = (wonById[winId] || 0) + units * perSkin * Math.max(0, included.length - 1);
                            } else {
                              carryUnits += 1;
                            }
                          }

                          const rows = included
                            .map((pid) => {
                              const id = String(pid);
                              const nm = pById?.[id]?.name || "Player";
                              return {
                                id,
                                name: nm,
                                skins: Number(skinsCountById[id] || 0),
                                won: Number(wonById[id] || 0),
                              };
                            })
                            .sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));

                          return (
                            <>
                              <Text style={styles.modalLine}>Skins value: {money(perSkin)} ({useNet ? "net" : "gross"})</Text>
                              {rows.length ? rows.map((x) => (
                                <Text key={`skins-${x.id}`} style={styles.modalLine}>
                                  {x.name}: {x.skins} skin{x.skins === 1 ? "" : "s"} — {money(x.won)}
                                </Text>
                              )) : <Text style={styles.modalLine}>No skins calculated.</Text>}
                            </>
                          );
                        })()}
                      </>
                    ) : type === "puttingcontest" ? (
                      <>
                        {!puttingLeaders || (!puttingLeaders.first.length && !puttingLeaders.second.length) ? (
                          <Text style={styles.modalLine}>No putts recorded yet.</Text>
                        ) : (
                          <>
                            {(() => {
                              const pools = getFormatPools(round || {}) || {};
                              const ppRaw = Number(pools?.[formatKey]?.payoutPlaces);
                              const payoutPlaces = ppRaw === 2 || ppRaw === 3 ? ppRaw : 1;

                              return (
                                <>
                                  <Text style={styles.modalLine}>
                                    1st: {puttingLeaders.first.map((r) => `${r.name} (${r.putts})`).join(", ")}
                                  </Text>

                                  {payoutPlaces >= 2 ? (
                                    puttingLeaders.second.length ? (
                                      <Text style={styles.modalLine}>
                                        2nd: {puttingLeaders.second.map((r) => `${r.name} (${r.putts})`).join(", ")}
                                      </Text>
                                    ) : (
                                      <Text style={styles.modalLine}>2nd: —</Text>
                                    )
                                  ) : null}

                                  {payoutPlaces >= 3 ? (
                                    puttingLeaders.third && puttingLeaders.third.length ? (
                                      <Text style={styles.modalLine}>
                                        3rd: {puttingLeaders.third.map((r) => `${r.name} (${r.putts})`).join(", ")}
                                      </Text>
                                    ) : (
                                      <Text style={styles.modalLine}>3rd: —</Text>
                                    )
                                  ) : null}
                                </>
                              );
                            })()}
                          </>
                        )}
                      </>
                    ) : null}

                    {type === "deucepot" ? (
                      <>
                        {!deuceRows || deuceRows.length === 0 ? (
                          <Text style={styles.modalLine}>No deuces recorded yet.</Text>
                        ) : (
                          (() => {
                            const buyIn = getEntryFee(round || {}, formatKey);
                            const potTotal = Number.isFinite(buyIn) && buyIn > 0 ? buyIn * includedCount : 0;

                            const totalDeuces = deuceRows.reduce((acc, x) => acc + (Number(x.deuces) || 0), 0);
                            const perDeuce = totalDeuces > 0 ? potTotal / totalDeuces : 0;

                            return (
                              <>
                                <Text style={styles.modalLine}>Total deuces: {String(totalDeuces)}</Text>
                                <Text style={styles.modalLine}>Per deuce: {totalDeuces > 0 ? money(perDeuce) : "—"}</Text>

                                {deuceRows.map((r) => {
                                  const payout = perDeuce > 0 ? perDeuce * (Number(r.deuces) || 0) : 0;
                                  return (
                                    <Text key={`deuce-${r.id}`} style={styles.modalLine}>
                                      {r.name} — {r.deuces} deuce{r.deuces === 1 ? "" : "s"} — {money(payout)}
                                    </Text>
                                  );
                                })}
                              </>
                            );
                          })()
                        )}
                      </>
                    ) : null}
                  </View>
                ) : type === "birdiebuckets" ? (
                  <View style={{ width: "100%", gap: 10 }}>
                    {(() => {
                      const bb =
                        round?.wagers?.birdieBuckets && typeof round.wagers.birdieBuckets === "object"
                          ? round.wagers.birdieBuckets
                          : {};

                      const holesObj = bb?.holes && typeof bb.holes === "object" ? bb.holes : {};
                      const resolvedWins = Object.values(holesObj)
                        .filter((x) => x && typeof x === "object" && Number(x?.win?.amount || 0) > 0)
                        .sort((a, b) => Number(a?.hole || 0) - Number(b?.hole || 0));

                      if (!resolvedWins.length) {
                        return <Text style={styles.modalLine}>No Birdie Buckets wins recorded yet.</Text>;
                      }

                      return resolvedWins.map((entry, idx) => {
                        const holeNum = Number(entry?.hole || entry?.win?.hole || 0);
                        const winnerName = String(entry?.win?.winnerName || "").trim() || "Player";
                        const amount = Number(entry?.win?.amount || 0);

                        return (
                          <View key={`bb-win-${idx}-${holeNum}`} style={styles.claimRow}>
                            <Text style={styles.claimLeft}>Hole {holeNum}</Text>

                            <View style={styles.claimMidBox}>
                              <Text style={styles.claimMidName} numberOfLines={1}>
                                {winnerName}
                              </Text>
                              <Text style={styles.claimMidNote} numberOfLines={1}>
                                Won with a birdie
                              </Text>
                            </View>

                            <View style={styles.matchPill}>
                              <Text style={styles.matchPillText}>{money(amount) || "$0"}</Text>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </View>
                ) : events > 0 ? (
                  <View style={{ width: "100%", gap: 10 }}>
                    {officialHoles.map((h, i) => {
                      const key = String(h);
                      const c = claimsMap?.[key] || null;

                      const statusRaw = String(c?.status || "").toLowerCase();
                      const isCarry = statusRaw === "carry_over" || statusRaw === "carryover";

                      const directName = String(
                        c?.claimedByPlayerName ||
                        c?.playerName ||
                        c?.name ||
                        ""
                      ).trim();

                      // carryover chain: find next official hole with a real winner
                      let resolvedHole = null;
                      let resolvedName = "";

                      if (isCarry) {
                        for (let j = i + 1; j < officialHoles.length; j++) {
                          const h2 = officialHoles[j];
                          const c2 = claimsMap?.[String(h2)] || null;
                          const nm2 = String(
                            c2?.claimedByPlayerName ||
                            c2?.playerName ||
                            c2?.name ||
                            ""
                          ).trim();

                          if (nm2) {
                            resolvedHole = h2;
                            resolvedName = nm2;
                            break;
                          }
                        }
                      }

                      const winnerName = directName || resolvedName || "";
                      const note = isCarry && resolvedName ? `Carry over → Hole ${resolvedHole}` : "";

                      return (
                        <View key={`hole-${h}`} style={styles.claimRow}>
                          <Text style={styles.claimLeft}>Hole {h}</Text>

                          <View style={styles.claimMidBox}>
                            <Text style={styles.claimMidName} numberOfLines={1}>
                              {winnerName ? winnerName : "Unclaimed"}
                            </Text>
                            {note ? (
                              <Text style={styles.claimMidNote} numberOfLines={1}>
                                {note}
                              </Text>
                            ) : null}
                          </View>

                          <View style={styles.matchPill}>
                            <Text style={styles.matchPillText}>{perWin > 0 ? money(perWin) : "—"}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.modalLine}>No official holes selected yet.</Text>
                )}

                {type === "birdiebuckets" ? null : (
                  <Text style={styles.winnerSmall}>Claims are shown as pending until confirmation/override is added.</Text>
                )}

              </View>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalSection}>
              <View style={styles.modalSectionRow}>
                <Text style={styles.modalSectionTitle}>Payout</Text>
                <View style={styles.formatPill}>
                  <Text style={styles.formatPillText}>PAYOUT</Text>
                </View>
              </View>

              <Text style={styles.payoutHeadline}>{payout.headline}</Text>

              {payout.lines.map((line, idx) => (
                <Text key={`${formatKey}-p-${idx}`} style={styles.modalLine}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderFormatsCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Formats</Text>

          <Pressable onPress={() => setShowAllFormats((v) => !v)} style={({ pressed }) => [styles.leaderToggle, pressed && styles.pressed]}>
            <Text style={styles.leaderToggleText}>{showAllFormats ? "Show less" : "View all"}</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        {!formatsToRender.length ? (
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderTitle}>No formats to show</Text>
            <Text style={styles.placeholderSub}>Select formats in setup, then they will appear here.</Text>
          </View>
        ) : (
          <>
            {formatsToRender.map((f) => {
              const formatKey = String(f.key || "").trim();
              const rawName = String(f.name || f.key || "Format");

              const type = detectFormatType(formatKey, rawName);
              const display = formatDisplayTitle(type, rawName);
              const theme = formatTheme(type);
              const icon = formatIconName(type);

              return (
                <Pressable
                  key={formatKey}
                  onPress={() => openWinnerModal(f)}
                  style={({ pressed }) => [
                    styles.winnerTile,
                    { backgroundColor: theme.bg, borderColor: theme.border },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.winnerTileTop}>
                    <View style={[styles.winnerIcon, { backgroundColor: "rgba(0,0,0,0.18)", borderColor: theme.border }]}>
                      <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
                    </View>
                    <View style={styles.formatPill}>
                      <Text style={styles.formatPillText}>WINNER</Text>
                    </View>
                  </View>

                  <View style={styles.winnerTileCenter}>
                    <Text style={styles.winnerTileTitle} numberOfLines={2}>
                      {display} WINNER
                    </Text>
                    <Text style={styles.winnerTileSub} numberOfLines={1}>
                      Tap to view details
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            <View style={{ height: 2 }} />
            {renderWinnerModal()}
          </>
        )}
      </View>
    );
  };

  const renderStatsCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Stats snapshot</Text>
        </View>

        <View style={styles.divider} />

        <View style={{ gap: 10 }}>
          {stats.map((s) => (
            <View key={s.id} style={styles.statRow}>
              <Text style={styles.statName} numberOfLines={1}>
                {s.name}
              </Text>

              <View style={styles.statPills}>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>FIR</Text>
                  <Text style={styles.statV}>{s.fir}</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>GIR</Text>
                  <Text style={styles.statV}>{s.gir}</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>Putts</Text>
                  <Text style={styles.statV}>
                    {Number(s.puttsTotal) > 0 ? String(s.puttsTotal) : "—"}
                  </Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>U&amp;D</Text>
                  <Text style={styles.statV}>{s.updown}</Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>Sand</Text>
                  <Text style={styles.statV}>{s.sand}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const FOOTER_H = 96;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.bgWashA} pointerEvents="none" />
        <View style={styles.bgWashB} pointerEvents="none" />

        <ScreenHeader
          navigation={navigation}
          title="FINAL RESULTS"
          titleAutoShrink
          titleNumberOfLines={1}
          subtitle={`${courseName} • ${teeName}`}
          safeTop={false}
          leftLabel="Exit"
          onLeftPress={onExit}
          rightLabel={null}
          onRightPress={null}
        />

        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading final results…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.bgWashA} pointerEvents="none" />
        <View style={styles.bgWashB} pointerEvents="none" />

        <ScreenHeader
          navigation={navigation}
          title="FINAL RESULTS"
          titleAutoShrink
          titleNumberOfLines={1}
          subtitle="Round not found"
          safeTop={false}
          leftLabel="Exit"
          onLeftPress={onExit}
          rightLabel={null}
          onRightPress={null}
        />

        <View style={styles.cardMissing}>
          <Text style={styles.titleText}>Round not found</Text>
          <Text style={styles.subText}>This round isn’t available right now.</Text>

          <Pressable onPress={onExit} style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}>
            <Text style={styles.btnOutlineText}>Go Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const activeContent = tab === TAB_FORMATS ? renderFormatsCard() : renderLeaderboardCard();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgWashA} pointerEvents="none" />
      <View style={styles.bgWashB} pointerEvents="none" />

      <ScreenHeader
        navigation={navigation}
        title="FINAL RESULTS"
        titleAutoShrink
        titleNumberOfLines={1}
        subtitle={`${courseName} • ${teeName}`}
        safeTop={false}
        leftLabel="Exit"
        onLeftPress={onExit}
        rightLabel={null}
        onRightPress={null}
      />

      {renderTabs()}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: FOOTER_H + 24,
          paddingTop: 6,
        }}
        showsVerticalScrollIndicator={false}
      >
        {activeContent}
        <View style={{ height: 12 }} />
        {renderStatsCard()}
        <View style={{ height: 10 }} />
      </ScrollView>

      <View style={styles.footerWrap}>
        <View style={styles.footer}>
          <Pressable onPress={onNextSettleUp} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
            <Text style={styles.btnPrimaryText}>Next: Settle Up</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  bgWashA: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(46,204,113,0.10)",
  },
  bgWashB: {
    position: "absolute",
    bottom: -180,
    right: -160,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: "rgba(11,42,27,0.65)",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: MUTED, fontWeight: "800" },

  cardMissing: {
    margin: 16,
    padding: 14,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: "rgba(242,201,76,0.55)",
  },
  titleText: { color: WHITE, fontWeight: "900", fontSize: 16 },
  subText: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabPill: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  tabPillIdle: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  tabPillActive: {
    backgroundColor: "rgba(242,201,76,0.18)",
    borderColor: "rgba(242,201,76,0.55)",
  },
  tabText: { fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
  tabTextIdle: { color: WHITE },
  tabTextActive: { color: "rgba(242,201,76,0.98)" },

  leaderWrap: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: "rgba(242,201,76,0.75)",
    padding: 12,
  },

  leaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  leaderTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },

  leaderToggle: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  leaderToggleText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },

  colText: { color: "rgba(255,255,255,0.68)", fontWeight: "900", fontSize: 11, letterSpacing: 0.7 },
  colPlayer: { flex: 1 },
  colNum: { textAlign: "center" },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 10,
    marginBottom: 12,
  },

  leaderRowsScroll: { maxHeight: 520 },
  leaderRowsContent: { paddingBottom: 2 },

  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: ROW,
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.28)",
    flexWrap: "wrap",
  },

  rankPillSpacer: { width: 34, height: 34, borderRadius: 14 },

  rankPill: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: WHITE, fontWeight: "900" },

  rowMid: { flex: 1, minWidth: 0 },
  headerRowMid: { flex: 1, minWidth: 0, paddingTop: 8 },

  name: { color: WHITE, fontWeight: "900", fontSize: 14 },
  subTap: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 11 },

  numCol: { width: 64, alignItems: "center" },
  numBig: { color: WHITE, fontWeight: "900", fontSize: 18 },
  numBig2: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 17 },
  numSub: { marginTop: 2, color: MUTED, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

  expandWrap: { width: "100%", marginTop: 10 },
  expandDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginBottom: 10 },

  holesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  holeChip: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  holeChipTop: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  holeChipVal: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 14 },

  placeholderBox: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
  },
  placeholderTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },
  placeholderSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  statRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
  },
  statName: { color: WHITE, fontWeight: "900", fontSize: 14 },
  statPills: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statPill: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  statK: { color: MUTED, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  statV: { color: WHITE, fontWeight: "900", fontSize: 12 },

  footerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(6,21,15,0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footer: { paddingTop: 12 },

  btnPrimary: {
    height: 54,
    borderRadius: 18,
    backgroundColor: YELLOW,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#1A1A1A", fontWeight: "900", fontSize: 15 },

  btnOutline: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { color: WHITE, fontWeight: "900", fontSize: 15 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  winnerTile: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 12,
    marginBottom: 10,
  },
  winnerTileTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  winnerIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  winnerTileCenter: { marginTop: 12, alignItems: "center", justifyContent: "center" },
  winnerTileTitle: { color: WHITE, fontWeight: "900", fontSize: 18, textAlign: "center", letterSpacing: 0.4 },
  winnerTileSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12 },

  formatPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(242,201,76,0.16)",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  formatPillText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: "rgba(18,22,30,0.97)",
    borderWidth: 3,
    padding: 14,
  },
  modalTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  modalSub: { marginTop: 2, color: MUTED, fontWeight: "800", fontSize: 12 },
  modalClose: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: { color: WHITE, fontWeight: "900", fontSize: 12 },
  modalDivider: {
    height: 2,
    backgroundColor: "rgba(255,255,255,0.14)",
    marginTop: 14,
    marginBottom: 14,
  },
  modalSection: { marginBottom: 2 },
  modalSectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalSectionTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },

  statusPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

  winnerBox: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  winnerSmall: { marginTop: 10, color: MUTED, fontWeight: "800", fontSize: 12, textAlign: "center", lineHeight: 16 },

  payoutHeadline: { marginTop: 10, color: WHITE, fontWeight: "900", fontSize: 15 },
  modalLine: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  claimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: "100%",
  },
  claimLeft: { color: WHITE, fontWeight: "900", fontSize: 13 },

  claimMidBox: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  claimMidName: { color: WHITE, fontWeight: "900", fontSize: 13, textAlign: "center" },
  claimMidNote: { marginTop: 2, color: MUTED, fontWeight: "900", fontSize: 11, textAlign: "center" },

  matchPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(242,201,76,0.16)",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  matchPillText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
});