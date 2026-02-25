// src/screens/HistoryScreen.js
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import { auth } from "../firebase/firebase";
import { getRounds, deleteRound } from "../storage/rounds";
import { loadActiveRound, updateActiveRound, clearActiveRound } from "../storage/roundState";
import PremiumSwipeRow from "../components/PremiumSwipeRow";

const BG = "#0B1220";
const WHITE = "#FFFFFF";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const INNER = "rgba(0,0,0,0.18)";
const GREEN_BORDER = "rgba(46,204,113,0.70)";

// Quick Post accent (subtle orange)
const QUICKPOST_BORDER = "rgba(255, 168, 76, 0.78)";

const HOLE_FORMAT_KEYS = new Set(["kp", "longdrive", "secondshotkp"]);

function pickFirstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
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

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
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

function sumGrossAnyShape(roundRoot, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const n = readStroke(roundRoot, h, playerId);
    if (n > 0) total += n;
  }
  return total > 0 ? total : 0;
}

function formatDateAny(round) {
  const raw = round?.playedAt || round?.date || round?.createdAt || round?.startedAt || round?.timestamp;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isRoundCompletedAnyShape(r) {
  const s = String(r?.status || "").trim().toLowerCase();
  if (s.includes("complete") || s.includes("finished") || s.includes("done")) return true;
  if (s.includes("in_progress") || s.includes("active") || s.includes("progress")) return false;

  const players = Array.isArray(r?.players) ? r.players : [];
  const ids = players.map((p, idx) => String(p?.id ?? String(idx)));
  if (!ids.length) return false;

  for (let h = 1; h <= 18; h++) {
    for (const pid of ids) {
      const v = readStroke(r, h, pid);
      if (toInt(v) <= 0) return false;
    }
  }
  return true;
}

function pickHoleNumberAny(r, fallback = null) {
  const holeRaw = pickFirstNumber(r?.holeNumber, r?.currentHole, r?.hole, r?.lastHole, r?.resumeHole, r?.holeIndex);

  let holeNumber = holeRaw;

  if (holeNumber !== null && holeNumber >= 0 && holeNumber <= 17) {
    const isIndex = r?.holeIndex !== undefined || holeNumber === 0;
    if (isIndex) holeNumber = holeNumber + 1;
  }

  if (!Number.isFinite(holeNumber)) return fallback;
  if (holeNumber < 1 || holeNumber > 18) return fallback;
  return holeNumber;
}

function holesLabelAny(r) {
  const hcRaw = Number(r?.holesCount ?? r?.totalHoles ?? r?.holes ?? r?.meta?.holesCount);
  const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

  if (holesCount === 9) {
    const sideRaw = String(r?.holesSide ?? r?.side ?? r?.meta?.holesSide ?? "").toLowerCase().trim();
    const side = sideRaw === "back" ? "Back" : "Front";
    return `9 (${side})`;
  }

  return "18 holes";
}

function getSignedInUserKey() {
  const uid = auth?.currentUser?.uid;
  return uid ? String(uid) : null;
}

function pickUserPlayer(roundRoot) {
  const players = Array.isArray(roundRoot?.players) ? roundRoot.players : [];
  if (!players.length) return null;

  const uid = getSignedInUserKey();

  if (uid) {
    const byUid = players.find((p) => String(p?.uid || p?.userId || p?.firebaseUid || "") === uid);
    if (byUid) return byUid;
  }

  const byFlag = players.find((p) => p?.isYou === true || p?.isMe === true || p?.me === true);
  if (byFlag) return byFlag;

  return players[0];
}

function normalizeKey(k) {
  return String(k || "").trim().toLowerCase();
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

function getFeeByKeyFromRoundDoc(doc) {
  const a = doc?.feeByKey;
  const b = doc?.poolsByKey;
  const c = doc?.moneyPools?.feeByKey;
  const d = doc?.moneyPools?.poolsByKey;
  const e = doc?.money?.feeByKey;
  return (
    (a && typeof a === "object" && a) ||
    (b && typeof b === "object" && b) ||
    (c && typeof c === "object" && c) ||
    (d && typeof d === "object" && d) ||
    (e && typeof e === "object" && e) ||
    {}
  );
}

function hasAnyFeeForSelectedFormats(roundDoc) {
  const selected = Array.isArray(roundDoc?.formatsSelected) ? roundDoc.formatsSelected : [];
  if (!selected.length) return false;

  // NEW canonical: formatPools (regular games)
  const pools = roundDoc?.formatPools && typeof roundDoc.formatPools === "object" ? roundDoc.formatPools : null;
  if (pools) {
    for (const raw of selected) {
      const key =
        typeof raw === "string"
          ? String(raw).trim()
          : String(raw?.key || raw?.id || "").trim();

      if (!key) continue;

      const p = pools?.[key];
      const amt =
        Number(p?.amountPerHole) ||
        Number(p?.entryFee) ||
        Number(p?.amountPerSkin);

      if (Number.isFinite(amt) && amt > 0) return true;
    }
  }

  // Legacy shapes
  const feeByKey = getFeeByKeyFromRoundDoc(roundDoc);
  for (const raw of selected) {
    const key =
      typeof raw === "string"
        ? String(raw).trim()
        : String(raw?.key || raw?.id || "").trim();

    if (!key) continue;

    const n = Number(feeByKey?.[key]);
    if (Number.isFinite(n) && n > 0) return true;
  }

  return false;
}

function needsHoleDetails(roundDoc) {
  const selected = Array.isArray(roundDoc?.formatsSelected) ? roundDoc.formatsSelected : [];
  if (!selected.length) return false;

  const configByKey = getConfigByKeyFromRoundDoc(roundDoc);

  for (const rawKey of selected) {
    const key = normalizeKey(rawKey);
    if (!HOLE_FORMAT_KEYS.has(key)) continue;

    const cfg = configByKey?.[key];

    const holes = Array.isArray(cfg?.holes) ? cfg.holes : null;
    const holesSelected = Array.isArray(cfg?.holesSelected) ? cfg.holesSelected : null;
    const holesByRound = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : null;
    const holesR1 = holesByRound && Array.isArray(holesByRound?.r1) ? holesByRound.r1 : null;

    const any = (holes && holes.length) || (holesSelected && holesSelected.length) || (holesR1 && holesR1.length);

    if (!any) return true;
  }

  return false;
}

function buildHoleHubParamsFromRoundDoc(roundDoc, rid) {
  const course = roundDoc?.course || null;
  const tee = roundDoc?.tee || null;
  const players = Array.isArray(roundDoc?.players) ? roundDoc.players : null;
  if (!course || !tee || !players || !players.length) return null;

  const scoring = roundDoc?.scoring || roundDoc?.scoringType || "net";

  const hcRaw = Number(roundDoc?.holesCount ?? roundDoc?.totalHoles ?? roundDoc?.holes ?? roundDoc?.meta?.holesCount);
  const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

  const sideRaw = String(roundDoc?.holesSide ?? roundDoc?.side ?? roundDoc?.meta?.holesSide ?? "").toLowerCase().trim();
  const holesSide = holesCount === 9 && (sideRaw === "front" || sideRaw === "back") ? sideRaw : null;

  const derivedStartHole = holesCount === 9 ? (holesSide === "back" ? 10 : 1) : 1;

  const courseName = pickFirstString(roundDoc?.courseName, course?.name);
  const holeMeta = roundDoc?.holeMeta ?? roundDoc?.meta?.holeMeta ?? null;

  return {
    ...roundDoc,
    course,
    tee,
    players,
    holeMeta: holeMeta && typeof holeMeta === "object" ? holeMeta : undefined,
    scoring,
    holesCount,
    holesSide,
    startHole: derivedStartHole,
    hole: derivedStartHole,
    holeIndex: derivedStartHole - 1,
    courseName: courseName || course?.name,
    roundId: rid || roundDoc?.roundId || roundDoc?.id || null,
  };
}

function buildHydrationPatchFromLocal(localRound, rid) {
  if (!localRound || typeof localRound !== "object") return {};

  const course = localRound?.course || (localRound?.courseName ? { name: localRound.courseName } : null);
  const tee = localRound?.tee || (localRound?.teeName ? { name: localRound.teeName } : null);
  const players = Array.isArray(localRound?.players) ? localRound.players : null;

  const holeMeta = localRound?.holeMeta ?? localRound?.meta?.holeMeta ?? null;
  const scoring = localRound?.scoring || localRound?.scoringType || "net";

  const courseName = pickFirstString(localRound?.courseName, course?.name);
  const teeName = pickFirstString(localRound?.teeName, tee?.name);

  const currentHole = pickHoleNumberAny(localRound, 1);

  const patch = {
    roundId: rid || localRound?.roundId || localRound?.id || null,

    course: course || null,
    tee: tee || null,
    players: players || null,
    holeMeta: holeMeta || null,

    courseName: courseName || null,
    teeName: teeName || null,

    scoring,

    currentHole,
    startHole: localRound?.startHole ? Number(localRound.startHole) : 1,

    // keep formats if they exist locally
    formatsSelected: Array.isArray(localRound?.formatsSelected) ? localRound.formatsSelected : undefined,
    configByKey: localRound?.configByKey && typeof localRound.configByKey === "object" ? localRound.configByKey : undefined,
    feeByKey: localRound?.feeByKey && typeof localRound.feeByKey === "object" ? localRound.feeByKey : undefined,

    // status normalization: setup / active / in_progress
    status: String(localRound?.status || "setup").toLowerCase().includes("active")
      ? "active"
      : String(localRound?.status || "").toLowerCase().includes("progress")
        ? "in_progress"
        : String(localRound?.status || "").toLowerCase().includes("in_progress")
          ? "in_progress"
          : "setup",
  };

  // remove undefined keys so merge is clean
  Object.keys(patch).forEach((k) => {
    if (patch[k] === undefined) delete patch[k];
  });

  return patch;
}

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const openSwipeRef = useRef(null);

  const [rounds, setRounds] = useState([]);
  const [activeFsRound, setActiveFsRound] = useState(null);

  const load = useCallback(async () => {
    const [all, active] = await Promise.all([getRounds(), loadActiveRound()]);
    setRounds(Array.isArray(all) ? all : []);
    setActiveFsRound(active || null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function closeAnyOpenSwipe() {
    try {
      if (openSwipeRef.current && typeof openSwipeRef.current.close === "function") {
        openSwipeRef.current.close();
      }
    } catch { }
    openSwipeRef.current = null;
  }

  const hasActive = !!activeFsRound?.roundId;
  const activePinnedId = "__active__";

  const items = useMemo(() => {
    const list = Array.isArray(rounds) ? rounds : [];
    const activeId = activeFsRound?.roundId ? String(activeFsRound.roundId) : null;
    if (!activeId) return list;

    return list.filter((r) => {
      const rid = String(r?.id || r?.roundId || "").trim();
      return rid && rid !== activeId;
    });
  }, [rounds, activeFsRound?.roundId]);

  const hasAny = hasActive || items.length > 0;

  const bottomPad = Math.max(14, (insets?.bottom || 0) + 12);
  const headerPadTop = insets?.top || 0;

  async function routeIntoRoundById(roundId, localFallback) {
    const rid = String(roundId || "").trim();
    if (!rid) {
      Alert.alert("Can’t open round", "Missing round id.");
      return;
    }

    // point “active” at this roundId first
    try {
      await updateActiveRound({}, rid);
    } catch { }

    // load Firestore doc
    let fsRound = null;
    try {
      fsRound = await loadActiveRound(rid);
    } catch { }

    // if Firestore is missing core setup, hydrate from local round (AsyncStorage)
    const hasCourse = !!fsRound?.course;
    const hasTee = !!fsRound?.tee;
    const hasPlayers = Array.isArray(fsRound?.players) && fsRound.players.length > 0;

    if ((!fsRound || !hasCourse || !hasTee || !hasPlayers) && localFallback) {
      try {
        const patch = buildHydrationPatchFromLocal(localFallback, rid);
        await updateActiveRound(patch, rid);
        fsRound = await loadActiveRound(rid);
      } catch { }
    }

    if (!fsRound) {
      Alert.alert("Round not found", "This round isn’t available in Firestore. It may have been deleted or not synced.");
      return;
    }

    // IMPORTANT: completion wins over status (status may be wrong)
    if (isRoundCompletedAnyShape(fsRound)) {
      navigation.navigate({ name: ROUTES.FINAL_RESULTS, params: { roundId: rid } });
      return;
    }

    const status = String(fsRound?.status || "").toLowerCase();

    // if active / in-progress, go straight to Hole Hub
    if (status === "active" || status.includes("in_progress") || status.includes("progress")) {
      const params = buildHoleHubParamsFromRoundDoc(fsRound, rid);
      if (params) {
        navigation.navigate(ROUTES.HOLE_HUB, params);
        return;
      }

      Alert.alert("Round incomplete", "This round is missing setup details. Please open it from setup and try again.");
      return;
    }

    // setup routing (HISTORY -> rebuild stack so Back behaves like normal setup flow)
    const statusNorm = String(fsRound?.status || "").trim().toLowerCase();
    const hasGame = !!(fsRound?.gameId || fsRound?.gameTitle);
    const hasCourse2 = !!fsRound?.course;
    const hasTee2 = !!fsRound?.tee;
    const hasPlayers2 = Array.isArray(fsRound?.players) && fsRound.players.length > 0;

    // Build base stack that always matches the normal setup sequence.
    const routes = [
      { name: ROUTES.HISTORY },
      { name: ROUTES.GAME_SETUP, params: { roundId: rid } },
      { name: ROUTES.NEW_ROUND, params: { roundId: rid } },
      { name: ROUTES.TEE_SELECTION, params: { roundId: rid } },
      { name: ROUTES.PLAYER_ENTRY, params: { roundId: rid } },
    ];

    // If any core setup step is missing, land on that step (last incomplete).
    if (!hasGame) {
      navigation.reset({ index: 1, routes });
      return;
    }
    if (!hasCourse2) {
      navigation.reset({ index: 2, routes });
      return;
    }
    if (!hasTee2) {
      navigation.reset({ index: 3, routes });
      return;
    }
    if (!hasPlayers2) {
      navigation.reset({ index: 4, routes });
      return;
    }

    // Formats flow
    const selected = Array.isArray(fsRound?.formatsSelected) ? fsRound.formatsSelected : [];
    const needDetails = !!selected.length && needsHoleDetails(fsRound);

    const poolsReady = fsRound?.poolsReady === true;
    const hasFees = !!selected.length && hasAnyFeeForSelectedFormats(fsRound);

    // Always include Formats so Back works predictably.
    routes.push({ name: ROUTES.GAME_FORMATS, params: { roundId: rid } });

    // If no formats chosen, land on Formats.
    if (!selected.length) {
      navigation.reset({ index: routes.length - 1, routes });
      return;
    }

    // If details are needed, include Details and land there.
    if (needDetails) {
      routes.push({ name: ROUTES.GAME_FORMAT_DETAILS, params: { roundId: rid } });
      navigation.reset({ index: routes.length - 1, routes });
      return;
    }

    // If any fees exist, Pools must be part of the stack.
    if (hasFees) {
      routes.push({ name: ROUTES.GAME_FORMAT_POOLS, params: { roundId: rid } });

      // If pools are complete, include Briefing and land there.
      if (poolsReady) {
        routes.push({ name: ROUTES.GAME_ROUND_BRIEFING, params: { roundId: rid } });
        navigation.reset({ index: routes.length - 1, routes });
        return;
      }

      // Pools not complete -> land on Pools.
      navigation.reset({ index: routes.length - 1, routes });
      return;
    }

    // No fees -> go straight to Briefing.
    routes.push({ name: ROUTES.GAME_ROUND_BRIEFING, params: { roundId: rid } });
    navigation.reset({ index: routes.length - 1, routes });
  }

  async function openActivePinned() {
    closeAnyOpenSwipe();

    const rid = activeFsRound?.roundId ? String(activeFsRound.roundId) : "";
    if (!rid) {
      Alert.alert("No active round", "There is no active round to open right now.");
      return;
    }

    await routeIntoRoundById(rid, null);
  }

  async function openRound(localRound) {
    closeAnyOpenSwipe();

    const rid = String(localRound?.id || localRound?.roundId || "").trim();
    if (!rid) {
      Alert.alert("Can’t open round", "Missing round id.");
      return;
    }

    const completedLocal = isRoundCompletedAnyShape(localRound);
    if (completedLocal) {
      navigation.navigate({ name: ROUTES.FINAL_RESULTS, params: { roundId: rid } });
      return;
    }

    await routeIntoRoundById(rid, localRound);
  }

  function confirmDeleteOne({ id, isActivePinned }) {
    closeAnyOpenSwipe();

    Alert.alert("Delete round?", "This will permanently remove this round from this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            if (isActivePinned) {
              try {
                await clearActiveRound();
              } catch { }
              const rid = activeFsRound?.roundId;
              if (rid) await deleteRound(rid);
            } else {
              await deleteRound(String(id));
            }
            await load();
          } catch {
            Alert.alert("Couldn’t delete", "Please try again.");
          }
        },
      },
    ]);
  }

  function RoundRowShell({ pinned, children }) {
    return <View style={{}}>{children}</View>;
  }

  function renderRowContent({ courseName, dateText, statusText, statusKind, rightPrimary, rightSecondary, onPress }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.rowCard,
          pressed && styles.pressed,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.course} numberOfLines={2}>
            {shortCourseTitle(courseName)}
          </Text>

          <Text style={styles.date} numberOfLines={1}>
            {dateText}
          </Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusChip,
                statusKind === "quick_post"
                  ? styles.statusChipQuickPost
                  : statusKind === "complete"
                    ? styles.statusChipComplete
                    : statusKind === "setup"
                      ? styles.statusChipSetup
                      : styles.statusChipProgress,
              ]}
            >
              <Text style={styles.statusText}>{statusText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.rightBox}>
          <Text style={styles.rightPrimary} numberOfLines={1}>
            {rightPrimary}
          </Text>
          <Text style={styles.rightSecondary} numberOfLines={1}>
            {rightSecondary}
          </Text>
        </View>

        <View style={styles.chev}>
          <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.60)" />
        </View>
      </Pressable>
    );
  }

  // active row display values (from Firestore active doc)
  const activeCourseName = pickFirstString(activeFsRound?.courseName, activeFsRound?.course?.name, "Current Round");
  const activeDateText = formatDateAny(activeFsRound || {});
  const activeHoleNum = pickHoleNumberAny(activeFsRound || {}, null);

  const activeStatusText = (() => {
    const completed = isRoundCompletedAnyShape(activeFsRound);
    if (completed) return "Complete";
    const s = String(activeFsRound?.status || "").trim().toLowerCase();
    if (s === "setup") return "In Setup";
    if (s === "in_progress" || s.includes("progress") || s === "active") return "In Progress";
    return "In Setup";
  })();
  const activeRightPrimary = (() => {
    const completed = isRoundCompletedAnyShape(activeFsRound);
    if (completed) {
      const grossFromHoles = sumGrossAnyShape(activeFsRound || {}, pickUserPlayer(activeFsRound || {})?.id ? String(pickUserPlayer(activeFsRound || {})?.id) : "p1");
      const grossFromTotal = Number(activeFsRound?.grossTotal);
      const gross = grossFromHoles || (Number.isFinite(grossFromTotal) && grossFromTotal > 0 ? grossFromTotal : 0);
      return gross ? String(gross) : "—";
    }
    return activeHoleNum ? `Hole ${activeHoleNum}` : "Resume";
  })();

  const activeRightSecondary = (() => {
    return holesLabelAny(activeFsRound || {});
  })();

  return (
    <View style={[styles.screen, { paddingTop: headerPadTop }]}>
      <View style={styles.headerWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.headerRow}>
          <Pressable
            onPress={() => (navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate(ROUTES.HOME))}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Round History</Text>
            <Text style={styles.headerSub}>
              {hasAny
                ? `${(hasActive ? 1 : 0) + items.length} item${(hasActive ? 1 : 0) + items.length === 1 ? "" : "s"}`
                : "Your rounds, beautifully organized"}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              closeAnyOpenSwipe();
              navigation.navigate(ROUTES.GAMES);
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>New</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 + bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {!hasAny ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="history" size={24} color="rgba(255,255,255,0.70)" />
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyText}>Play a round and it will appear here.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {hasActive ? (
              <RoundRowShell pinned>
                <PremiumSwipeRow
                  openSwipeRef={openSwipeRef}
                  closeAnyOpenSwipe={closeAnyOpenSwipe}
                  radius={22}
                  actionWidth={120}
                  borderWidth={2}
                  borderColor={(() => {
                    const completed = isRoundCompletedAnyShape(activeFsRound);
                    if (completed) return "rgba(255, 210, 92, 0.92)"; // GOLD
                    const s = String(activeFsRound?.status || "").trim().toLowerCase();
                    if (String(activeFsRound?.entrySource || "").toLowerCase() === "quick_post") return "rgba(255, 168, 76, 0.92)"; // ORANGE
                    if (s === "setup") return "rgba(46,204,113,0.92)"; // GREEN
                    return "rgba(46,125,255,0.92)"; // BLUE
                  })()}
                  backgroundColor="transparent"
                  editLabel="Enter"
                  onEdit={openActivePinned}
                  deleteLabel="Delete"
                  onDelete={() => confirmDeleteOne({ id: activePinnedId, isActivePinned: true })}
                >
                  {renderRowContent({
                    courseName: activeCourseName,
                    dateText: activeDateText,
                    statusText: activeStatusText,
                    statusKind: (() => {
                      const completed = isRoundCompletedAnyShape(activeFsRound);
                      if (completed) return "complete";
                      const s = String(activeFsRound?.status || "").trim().toLowerCase();
                      if (s === "setup") return "setup";
                      if (s === "in_progress" || s.includes("progress") || s === "active") return "in_progress";
                      return "setup";
                    })(),
                    rightPrimary: activeRightPrimary,
                    rightSecondary: activeRightSecondary,
                    onPress: openActivePinned,
                  })}
                </PremiumSwipeRow>
              </RoundRowShell>
            ) : null}

            {items.map((r) => {
              const rid = String(r?.id || r?.roundId || "");
              const courseName = String(r?.courseName || r?.course?.name || "Course").trim();
              const dateText = formatDateAny(r);

              const completed = isRoundCompletedAnyShape(r);
              const status = String(r?.status || "").trim().toLowerCase();
              const statusText = completed ? "Complete" : status === "setup" ? "In Setup" : "In Progress";

              const holeNum = pickHoleNumberAny(r, null);

              const userPlayer = pickUserPlayer(r);
              const userId = userPlayer?.id ? String(userPlayer.id) : "p1";

              const grossFromHoles = sumGrossAnyShape(r, userId);
              const grossFromTotal = Number(r?.grossTotal);
              const gross = grossFromHoles || (Number.isFinite(grossFromTotal) && grossFromTotal > 0 ? grossFromTotal : 0);

              const isQuickPost = String(r?.entrySource || "").toLowerCase() === "quick_post";

              const hasFormats =
                (Array.isArray(r?.formatsSelected) && r.formatsSelected.length > 0) ||
                Number(r?.formatsSelectedCount || 0) > 0;

              const rightPrimary = completed ? (gross ? String(gross) : "—") : holeNum ? `Hole ${holeNum}` : "Resume";
              const rightSecondary = holesLabelAny(r || {});

              const editLabel = completed ? "View" : "Enter";

              return (
                <RoundRowShell key={rid}>
                  <PremiumSwipeRow
                    openSwipeRef={openSwipeRef}
                    closeAnyOpenSwipe={closeAnyOpenSwipe}
                    radius={22}
                    actionWidth={120}
                    borderWidth={2}
                    borderColor={
                      completed && isQuickPost
                        ? "rgba(255, 168, 76, 0.92)"    // ORANGE
                        : completed
                          ? "rgba(255, 210, 92, 0.92)"  // GOLD
                          : status === "setup"
                            ? "rgba(46,204,113,0.92)"   // GREEN
                            : "rgba(46,125,255,0.92)"   // BLUE
                    }
                    backgroundColor="transparent"
                    editLabel={editLabel}
                    onEdit={() => openRound(r)}
                    deleteLabel="Delete"
                    onDelete={() => confirmDeleteOne({ id: rid, isActivePinned: false })}
                  >
                    {renderRowContent({
                      courseName,
                      dateText,
                      statusText: completed && String(r?.entrySource || "").toLowerCase() === "quick_post" ? "Quick Post" : statusText,
                      statusKind: completed && String(r?.entrySource || "").toLowerCase() === "quick_post" ? "quick_post" : completed ? "complete" : status === "setup" ? "setup" : "in_progress",
                      rightPrimary,
                      rightSecondary,
                      onPress: () => openRound(r),
                    })}
                  </PremiumSwipeRow>
                </RoundRowShell>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    gap: 10,
  },

  headerPill: {
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
  headerPillText: { color: WHITE, fontWeight: "900", fontSize: 13 },

  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
  headerSub: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },

  emptyCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  emptyTitle: { color: WHITE, fontSize: 14, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", textAlign: "center" },

  // (removed outer ring wrapper; swipe rows now own the single border)

  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 14,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: CARD,
  },

  course: { color: WHITE, fontSize: 16, fontWeight: "900" },
  date: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },

  statusRow: { marginTop: 8, flexDirection: "row", alignItems: "center" },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipSetup: { borderColor: "rgba(46,204,113,0.70)", backgroundColor: "rgba(46,204,113,0.16)" },
  statusChipProgress: { borderColor: "rgba(46,125,255,0.70)", backgroundColor: "rgba(46,125,255,0.16)" },
  statusChipComplete: { borderColor: "rgba(255, 210, 92, 0.75)", backgroundColor: "rgba(255, 210, 92, 0.16)" },
  statusChipQuickPost: { borderColor: QUICKPOST_BORDER, backgroundColor: "rgba(255, 168, 76, 0.16)" },
  statusText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.9, opacity: 0.92 },

  rightBox: {
    minWidth: 112,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: INNER,
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
    marginLeft: 10,
  },
  rightPrimary: { color: WHITE, fontSize: 18, fontWeight: "900" },
  rightSecondary: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  chev: { width: 28, alignItems: "flex-end", justifyContent: "center", marginLeft: 8 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.86 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
