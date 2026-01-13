// src/screens/HistoryScreen.js
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import { getRounds, deleteRound } from "../storage/rounds";
import { loadActiveRound, clearActiveRoundEverywhere } from "../storage/roundState";

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

  // A) roundState shape (object keyed by hole number)
  const a =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
    roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
  const aInt = toInt(a);
  if (aInt > 0) return aInt;

  // B) legacy rounds shape (array of holes)
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

function calcNet(gross, handicap) {
  const h = Number(handicap);
  const strokes = Number.isFinite(h) ? Math.round(h) : 0;
  if (!gross) return 0;
  return Math.max(0, gross - Math.max(0, strokes));
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

  const holeRaw = pickFirstNumber(
    root?.holeNumber,
    root?.currentHole,
    root?.hole,
    root?.holeIndex,
    root?.resumeHole,
    state?.holeNumber,
    state?.currentHole,
    state?.hole,
    state?.holeIndex,
    state?.resumeHole
  );

  let startHole = holeRaw ?? 1;

  if (startHole !== null && startHole >= 0 && startHole <= 17) {
    const isIndex =
      root?.holeIndex !== undefined || state?.holeIndex !== undefined || startHole === 0;
    if (isIndex) startHole = startHole + 1;
  }

  if (!Number.isFinite(startHole)) startHole = 1;
  if (startHole < 1 || startHole > 18) startHole = 1;

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

  const holeRaw = pickFirstNumber(
    root?.holeNumber,
    root?.currentHole,
    root?.hole,
    root?.holeIndex,
    root?.resumeHole,
    state?.holeNumber,
    state?.currentHole,
    state?.hole,
    state?.holeIndex,
    state?.resumeHole
  );

  let holeNumber = holeRaw;

  if (holeNumber !== null && holeNumber >= 0 && holeNumber <= 17) {
    const isIndex =
      root?.holeIndex !== undefined || state?.holeIndex !== undefined || holeNumber === 0;
    if (isIndex) holeNumber = holeNumber + 1;
  }

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
    holeNumber: holeNumber && holeNumber >= 1 && holeNumber <= 18 ? holeNumber : null,
    startedAt: root?.startedAt ?? state?.startedAt ?? null,
    root,
  };
}

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [rounds, setRounds] = useState([]);
  const [activeState, setActiveState] = useState(null);

  const [deleteMode, setDeleteMode] = useState(false);
  const [selected, setSelected] = useState({});
  const [deleting, setDeleting] = useState(false);

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

  const activeSummary = useMemo(() => extractActiveSummary(activeState), [activeState]);
  const activePinnedId = "__active__";
  const hasActive = !!activeSummary;

  const hasAnySaved = rounds.length > 0;
  const hasAny = hasActive || hasAnySaved;

  const items = useMemo(() => rounds, [rounds]);

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const selectedCount = selectedIds.length;

  function enterDeleteMode() {
    setDeleteMode(true);
    setSelected({});
  }

  function exitDeleteMode() {
    setDeleteMode(false);
    setSelected({});
  }

  function toggleSelectRound(id) {
    const rid = String(id || "");
    if (!rid) return;
    setSelected((prev) => {
      const next = { ...prev };
      next[rid] = !next[rid];
      if (!next[rid]) delete next[rid];
      return next;
    });
  }

  function onPressActivePinned() {
    if (deleteMode) {
      toggleSelectRound(activePinnedId);
      return;
    }

    const params = extractActiveRoundParams(activeState);
    if (params) {
      navigation.navigate(ROUTES.HOLE_VIEW, params);
      return;
    }

    navigation.navigate(ROUTES.GAMES, { resume: true });
  }

  function onPressRound(r) {
    if (deleteMode) {
      toggleSelectRound(r?.id);
      return;
    }
    navigation.navigate({
      name: ROUTES.ROUND_DETAILS,
      params: { roundId: r.id },
    });
  }

  async function confirmDeleteSelected() {
    if (deleting) return;
    if (selectedCount === 0) return;

    const label = selectedCount === 1 ? "this item" : `these ${selectedCount} items`;

    Alert.alert("Delete?", `Are you sure you want to delete ${label}? This can’t be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            const wantsActive = !!selected[activePinnedId];

            if (wantsActive) {
              await clearActiveRoundEverywhere();

              const rid = activeSummary?.roundId;
              if (rid) {
                await deleteRound(rid);
              }
            }

            for (const id of selectedIds) {
              if (id === activePinnedId) continue;
              // eslint-disable-next-line no-await-in-loop
              await deleteRound(id);
            }

            await load();
            exitDeleteMode();
            Alert.alert("Deleted", "Your selected item(s) have been removed.");
          } catch {
            Alert.alert("Couldn’t delete", "Please try again.");
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  const bottomPad = Math.max(14, (insets?.bottom || 0) + 12);
  const headerPadTop = insets?.top || 0;

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
              {deleteMode
                ? selectedCount > 0
                  ? `${selectedCount} selected`
                  : "Tap items to select"
                : hasAny
                ? `${(hasActive ? 1 : 0) + items.length} item${(hasActive ? 1 : 0) + items.length === 1 ? "" : "s"}`
                : "Your rounds, beautifully organized"}
            </Text>
          </View>

          <Pressable
            onPress={() => (deleteMode ? exitDeleteMode() : enterDeleteMode())}
            hitSlop={12}
            style={({ pressed }) => [
              styles.headerPill,
              deleteMode && styles.headerPillDanger,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.headerPillText}>{deleteMode ? "Done" : "Edit"}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 + bottomPad }}
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
            {deleteMode ? (
              <View style={styles.selectHint}>
                <MaterialCommunityIcons
                  name="checkbox-marked-circle-outline"
                  size={18}
                  color="rgba(255,255,255,0.78)"
                />
                <Text style={styles.selectHintText}>Select item(s) to delete. You can choose multiple.</Text>
              </View>
            ) : null}

            {/* Pinned active round */}
            {hasActive ? (
              (() => {
                const r = activeSummary?.root || unwrapRound(activeState) || {};
                const course = shortCourseTitle(String(activeSummary?.courseName || "Current Round").trim());
                const date = formatDateAny(r);

                const holeNum = activeSummary?.holeNumber || null;
                const holeBadge = holeNum ? String(holeNum) : "▶";

                const p1 = Array.isArray(r?.players) ? r.players[0] : null;
                const p1Id = p1?.id ? String(p1.id) : "p1";
                const gross = sumGrossAnyShape(r, p1Id);
                const net = calcNet(gross, p1?.handicap);

                // Not displayed, but left here for future
                void gross;
                void net;

                const isSelected = !!selected[activePinnedId];

                return (
                  <Pressable
                    key={activePinnedId}
                    onPress={onPressActivePinned}
                    style={({ pressed }) => [
                      styles.card,
                      styles.cardPinned,
                      deleteMode && isSelected && styles.cardSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    {deleteMode ? (
                      <View style={styles.selectIconWrap}>
                        <MaterialCommunityIcons
                          name={isSelected ? "check-circle" : "circle-outline"}
                          size={22}
                          color={isSelected ? "#FF4D4D" : "rgba(255,255,255,0.55)"}
                        />
                      </View>
                    ) : null}

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pinnedCourse} numberOfLines={2}>
                        {course}
                      </Text>

                      <Text style={styles.pinnedStatus}>IN PROGRESS</Text>

                      <Text style={styles.meta} numberOfLines={1}>
                        {holeNum ? `Resume on Hole ${holeNum}` : "Resume"} • {date}
                      </Text>
                    </View>

                    <View style={styles.rightWrap}>
                      <View style={styles.holeCircle}>
                        <Text style={styles.holeCircleText}>{holeBadge}</Text>
                      </View>

                      {!deleteMode ? (
                        <View style={styles.chevPinned}>
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={22}
                            color="rgba(255,255,255,0.72)"
                          />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })()
            ) : null}

            {/* Saved rounds */}
            {items.map((r) => {
              const course = shortCourseTitle(String(r?.courseName || "Course").trim());
              const date = formatDateAny(r);

              const p1 = Array.isArray(r?.players) ? r.players[0] : null;
              const p1Id = p1?.id ? String(p1.id) : "p1";
              const gross = sumGrossAnyShape(r, p1Id);
              const net = calcNet(gross, p1?.handicap);

              const completed = (() => {
                const holes = Array.isArray(r?.holes) ? r.holes : [];
                if (holes.length < 18) return false;
                for (let i = 0; i < 18; i++) {
                  const raw = holes?.[i]?.scores?.[p1Id];
                  if (raw === undefined || raw === null || String(raw).trim() === "") return false;
                }
                return true;
              })();

              const status = completed ? "COMPLETED" : "IN PROGRESS";

              const grossLabel = gross ? String(gross) : "—";
              const netLabel = gross ? String(net) : "—";

              const rid = String(r?.id);
              const isSelected = !!selected[rid];

              return (
                <Pressable
                  key={rid}
                  onPress={() => onPressRound(r)}
                  style={({ pressed }) => [
                    styles.card,
                    deleteMode && isSelected && styles.cardSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  {deleteMode ? (
                    <View style={styles.selectIconWrap}>
                      <MaterialCommunityIcons
                        name={isSelected ? "check-circle" : "circle-outline"}
                        size={22}
                        color={isSelected ? "#FF4D4D" : "rgba(255,255,255,0.55)"}
                      />
                    </View>
                  ) : null}

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.course} numberOfLines={1}>
                        {course}
                      </Text>

                      <View style={[styles.statusChip, completed ? styles.statusChipDone : styles.statusChipProg]}>
                        <Text style={styles.statusText}>{status}</Text>
                      </View>
                    </View>

                    <Text style={styles.meta} numberOfLines={1}>
                      {date}
                    </Text>
                  </View>

                  <View style={styles.scorePill}>
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreKey}>gross</Text>
                      <Text style={styles.scoreVal}>{grossLabel}</Text>
                    </View>
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreKey}>net</Text>
                      <Text style={styles.scoreVal}>{netLabel}</Text>
                    </View>
                  </View>

                  {!deleteMode ? (
                    <View style={styles.chev}>
                      <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.60)" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {hasAny ? (
        <View style={[styles.fabWrap, { paddingBottom: bottomPad }]}>
          {!deleteMode ? (
            <Pressable onPress={enterDeleteMode} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#fff" />
              <Text style={styles.fabText}>Select item(s) to delete</Text>
            </Pressable>
          ) : (
            <View style={styles.deleteDock}>
              <Pressable
                onPress={exitDeleteMode}
                style={({ pressed }) => [styles.dockBtn, pressed && styles.pressed]}
                disabled={deleting}
              >
                <Text style={styles.dockBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={confirmDeleteSelected}
                style={({ pressed }) => [
                  styles.dockBtnDanger,
                  pressed && styles.pressed,
                  (selectedCount === 0 || deleting) && { opacity: 0.45 },
                ]}
                disabled={selectedCount === 0 || deleting}
              >
                <Text style={styles.dockBtnDangerText}>{deleting ? "Deleting…" : "Confirm delete"}</Text>
                <Text style={styles.dockBtnDangerSub}>
                  {selectedCount > 0 ? `${selectedCount} selected` : "Select at least 1"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },

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
  headerPillDanger: {
    borderColor: "rgba(214,40,40,0.40)",
    backgroundColor: "rgba(214,40,40,0.16)",
  },
  headerPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
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
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", textAlign: "center" },

  selectHint: {
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(214,40,40,0.22)",
    backgroundColor: "rgba(214,40,40,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectHintText: { color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 12, flex: 1 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  cardPinned: {
    borderColor: "rgba(46,125,255,0.30)",
    backgroundColor: "rgba(46,125,255,0.10)",
  },

  cardSelected: {
    borderColor: "rgba(214,40,40,0.35)",
    backgroundColor: "rgba(214,40,40,0.12)",
  },

  selectIconWrap: {
    width: 30,
    alignItems: "flex-start",
    justifyContent: "center",
    marginRight: 8,
  },

  pinnedCourse: { color: "#fff", fontSize: 16, fontWeight: "900" },
  pinnedStatus: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  course: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  meta: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },

  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipDone: { borderColor: "rgba(15,122,74,0.45)", backgroundColor: "rgba(15,122,74,0.16)" },
  statusChipProg: { borderColor: "rgba(46,125,255,0.45)", backgroundColor: "rgba(46,125,255,0.14)" },

  statusText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.9, opacity: 0.9 },

  rightWrap: { alignItems: "center", justifyContent: "center", marginLeft: 10 },

  holeCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  holeCircleText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  scorePill: {
    minWidth: 98,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "stretch",
    gap: 6,
    marginLeft: 10,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  scoreKey: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  scoreVal: { color: "#fff", fontSize: 16, fontWeight: "900" },

  chev: { width: 28, alignItems: "flex-end", justifyContent: "center", marginLeft: 8 },
  chevPinned: { marginTop: 8 },

  fabWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 0,
  },

  fab: {
    height: 54,
    borderRadius: 999,
    backgroundColor: "rgba(214,40,40,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: Platform.OS === "ios" ? 0.18 : 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  fabText: { color: "#fff", fontWeight: "900", letterSpacing: 0.2, fontSize: 13 },

  deleteDock: {
    borderRadius: 22,
    padding: 10,
    backgroundColor: "rgba(18,22,30,0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  dockBtn: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 92,
  },
  dockBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 0.2 },

  dockBtnDanger: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    backgroundColor: "rgba(214,40,40,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  dockBtnDangerText: { color: "#fff", fontWeight: "900", letterSpacing: 0.25 },
  dockBtnDangerSub: { marginTop: 2, color: "rgba(255,255,255,0.80)", fontWeight: "800", fontSize: 11 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.86 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
