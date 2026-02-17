// FEB17 NOTE: Branch = feb17-round-history-swipe-polish
// Goal: Final polish for Round History swipe rows (borders/spacing/consistency).

// src/screens/HistoryScreen.js
import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import { auth } from "../firebase/firebase";
import { getRounds, deleteRound } from "../storage/rounds";
import { loadActiveRound, clearActiveRoundEverywhere } from "../storage/roundState";
import * as RoundState from "../storage/roundState";
import PremiumSwipeRow from "../components/PremiumSwipeRow";

const BG = "#0B1220";
const WHITE = "#FFFFFF";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const MUTED = "rgba(255,255,255,0.65)";
const INNER = "rgba(0,0,0,0.18)";
const GREEN_BORDER = "rgba(46,204,113,0.70)";

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

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
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
  const raw =
    round?.playedAt ||
    round?.date ||
    round?.createdAt ||
    round?.startedAt ||
    round?.timestamp;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
  const holeRaw = pickFirstNumber(
    r?.holeNumber,
    r?.currentHole,
    r?.hole,
    r?.lastHole,
    r?.resumeHole,
    r?.holeIndex
  );

  let holeNumber = holeRaw;

  if (holeNumber !== null && holeNumber >= 0 && holeNumber <= 17) {
    const isIndex = r?.holeIndex !== undefined || holeNumber === 0;
    if (isIndex) holeNumber = holeNumber + 1;
  }

  if (!Number.isFinite(holeNumber)) return fallback;
  if (holeNumber < 1 || holeNumber > 18) return fallback;
  return holeNumber;
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

function extractActiveSummary(state) {
  const root = unwrapRound(state);
  if (!root) return null;

  const courseName = pickFirstString(
    root?.course?.name,
    root?.courseName,
    root?.course?.title,
    root?.place?.name,
    state?.course?.name,
    state?.courseName
  );

  const holeNumber = pickHoleNumberAny(root, null);

  const isActiveExplicit =
    !!root?.isActive ||
    !!state?.isActive ||
    root?.status === "active" ||
    state?.status === "active" ||
    root?.inProgress === true ||
    state?.inProgress === true;

  const hasEnoughToShow = !!courseName || isActiveExplicit || !!root?.course || !!root?.players;
  if (!hasEnoughToShow) return null;

  const roundId = root?.roundId ?? root?.id ?? state?.roundId ?? state?.id ?? null;

  return {
    roundId: roundId ? String(roundId) : null,
    courseName: courseName || "Current Round",
    holeNumber: holeNumber,
    startedAt: root?.startedAt ?? state?.startedAt ?? null,
    root,
  };
}

function extractActiveRoundParams(state) {
  const root = unwrapRound(state);
  if (!root) return null;

  const course = root?.course || state?.course || null;
  const tee = root?.tee || state?.tee || null;
  const players = root?.players || state?.players || null;

  if (!course || !tee || !Array.isArray(players) || players.length === 0) return null;

  const holeMeta =
    root?.holeMeta ??
    root?.meta?.holeMeta ??
    state?.holeMeta ??
    state?.meta?.holeMeta ??
    null;

  const scoring =
    root?.scoring ??
    root?.scoringType ??
    state?.scoring ??
    state?.scoringType ??
    "net";

  const startHole = pickHoleNumberAny(root, 1);

  const courseName = pickFirstString(course?.name, root?.courseName, state?.courseName);
  const roundId = root?.roundId ?? root?.id ?? state?.roundId ?? state?.id ?? null;

  return {
    ...root,
    course,
    tee,
    players,
    holeMeta: holeMeta && typeof holeMeta === "object" ? holeMeta : undefined,
    scoring,
    startHole,
    hole: startHole,
    holeIndex: startHole - 1,
    courseName: courseName || course?.name,
    roundId,
  };
}

function extractResumeParamsFromSavedRound(r) {
  if (!r || typeof r !== "object") return null;

  const course = r?.course || { name: r?.courseName || "Course", id: r?.courseId || r?.id || null };
  const tee = r?.tee || { name: r?.teeName || "Tees" };
  const players = Array.isArray(r?.players) ? r.players : [];
  if (!players.length) return null;

  const holeMeta = r?.holeMeta ?? r?.meta?.holeMeta ?? null;
  const startHole = pickHoleNumberAny(r, 1);

  const courseName = pickFirstString(r?.courseName, course?.name);
  const roundId = r?.id ? String(r.id) : null;

  return {
    ...r,
    course,
    tee,
    players,
    holeMeta: holeMeta && typeof holeMeta === "object" ? holeMeta : undefined,
    startHole,
    hole: startHole,
    holeIndex: startHole - 1,
    courseName: courseName || course?.name,
    roundId,
  };
}

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const openSwipeRef = useRef(null);

  const [rounds, setRounds] = useState([]);
  const [activeState, setActiveState] = useState(null);

  const load = useCallback(async () => {
    const [all, active] = await Promise.all([getRounds(), loadActiveRound()]);
    setRounds(Array.isArray(all) ? all : []);
    setActiveState(active || null);
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

  const activeSummary = useMemo(() => extractActiveSummary(activeState), [activeState]);
  const activePinnedId = "__active__";
  const hasActive = !!activeSummary;

  const items = useMemo(() => (Array.isArray(rounds) ? rounds : []), [rounds]);
  const hasAny = hasActive || items.length > 0;

  const bottomPad = Math.max(14, (insets?.bottom || 0) + 12);
  const headerPadTop = insets?.top || 0;

  async function openActivePinned() {
    closeAnyOpenSwipe();

    const params = extractActiveRoundParams(activeState);
    if (params) {
      navigation.navigate(ROUTES.HOLE_HUB, params);
      return;
    }

    navigation.navigate(ROUTES.GAMES, { resume: true });
  }

  async function openRound(r) {
    closeAnyOpenSwipe();

    const completed = isRoundCompletedAnyShape(r);

    if (completed) {
      navigation.navigate({
        name: ROUTES.ROUND_DETAILS,
        params: { roundId: r.id },
      });
      return;
    }

    const params = extractResumeParamsFromSavedRound(r);
    if (!params) {
      Alert.alert("Can’t resume", "This round is missing data needed to resume.");
      return;
    }

    try {
      if (typeof RoundState.saveActiveRound === "function") {
        await RoundState.saveActiveRound({
          ...r,
          id: String(r?.id || `r_${Date.now()}`),
          status: "in_progress",
          lastHole: pickHoleNumberAny(r, params?.hole || 1),
        });
      }
    } catch { }

    navigation.navigate(ROUTES.HOLE_HUB, params);
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
              await clearActiveRoundEverywhere();
              const rid = activeSummary?.roundId;
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
    return <View style={[styles.greenRing, pinned && styles.blueRing]}>{children}</View>;
  }

  function renderRowContent({
    courseName,
    dateText,
    statusText,
    statusKind,
    rightPrimary,
    rightSecondary,
    pinned = false,
    onPress,
  }) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.rowCard, pressed && styles.pressed]}>
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
                statusKind === "completed" ? styles.statusChipDone : styles.statusChipProg,
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

  return (
    <View style={[styles.screen, { paddingTop: headerPadTop }]}>
      <View style={styles.headerWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.headerRow}>
          <Pressable
            onPress={() =>
              navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate(ROUTES.HOME)
            }
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Round History</Text>
            <Text style={styles.headerSub}>
              {hasAny ? `${(hasActive ? 1 : 0) + items.length} item${(hasActive ? 1 : 0) + items.length === 1 ? "" : "s"}` : "Your rounds, beautifully organized"}
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
            {hasActive
              ? (() => {
                const root = activeSummary?.root || unwrapRound(activeState) || {};
                const courseName = String(activeSummary?.courseName || "Current Round").trim();
                const dateText = formatDateAny(root);
                const holeNum = activeSummary?.holeNumber || pickHoleNumberAny(root, null);

                const statusText = "In Progress";
                const rightPrimary = holeNum ? `Hole ${holeNum}` : "Resume";
                const rightSecondary = holeNum ? "Currently on" : "Tap to continue";

                return (
                  <RoundRowShell pinned>
                    <PremiumSwipeRow
                      openSwipeRef={openSwipeRef}
                      closeAnyOpenSwipe={closeAnyOpenSwipe}
                      radius={22}
                      actionWidth={120}
                      borderColor="transparent"
                      backgroundColor="transparent"
                      editLabel="Enter"
                      onEdit={openActivePinned}
                      deleteLabel="Delete"
                      onDelete={() => confirmDeleteOne({ id: activePinnedId, isActivePinned: true })}
                    >
                      {renderRowContent({
                        courseName,
                        dateText,
                        statusText,
                        statusKind: "in_progress",
                        rightPrimary,
                        rightSecondary,
                        pinned: true,
                        onPress: openActivePinned,
                      })}
                    </PremiumSwipeRow>
                  </RoundRowShell>
                );
              })()
              : null}

            {items.map((r) => {
              const rid = String(r?.id);
              const courseName = String(r?.courseName || r?.course?.name || "Course").trim();
              const dateText = formatDateAny(r);

              const completed = isRoundCompletedAnyShape(r);
              const statusText = completed ? "Completed" : "In Progress";

              const holeNum = pickHoleNumberAny(r, null);

              const userPlayer = pickUserPlayer(r);
              const userId = userPlayer?.id ? String(userPlayer.id) : "p1";
              const gross = sumGrossAnyShape(r, userId);

              const rightPrimary = completed ? (gross ? String(gross) : "—") : holeNum ? `Hole ${holeNum}` : "Resume";
              const rightSecondary = completed ? "Gross" : holeNum ? "Currently on" : "Tap to continue";

              const editLabel = completed ? "View" : "Enter";

              return (
                <RoundRowShell key={rid}>
                  <PremiumSwipeRow
                    openSwipeRef={openSwipeRef}
                    closeAnyOpenSwipe={closeAnyOpenSwipe}
                    radius={22}
                    actionWidth={120}
                    borderColor="transparent"
                    backgroundColor="transparent"
                    editLabel={editLabel}
                    onEdit={() => openRound(r)}
                    deleteLabel="Delete"
                    onDelete={() => confirmDeleteOne({ id: rid, isActivePinned: false })}
                  >
                    {renderRowContent({
                      courseName,
                      dateText,
                      statusText,
                      statusKind: completed ? "completed" : "in_progress",
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

  greenRing: {
    borderRadius: 24,
    padding: 2,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: "transparent",
  },
  blueRing: {
    borderColor: "rgba(46,125,255,0.60)",
  },

  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
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
  statusChipProg: { borderColor: "rgba(46,125,255,0.55)", backgroundColor: "rgba(46,125,255,0.16)" },
  statusChipDone: { borderColor: "rgba(46,204,113,0.60)", backgroundColor: "rgba(46,204,113,0.16)" },
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
