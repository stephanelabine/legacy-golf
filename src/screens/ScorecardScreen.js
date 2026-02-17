// src/screens/ScorecardScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot, query, orderBy, doc } from "firebase/firestore";

import { db, auth } from "../firebase/firebase";
import ScreenHeader from "../components/ScreenHeader";
import { getRoundById } from "../storage/rounds";
import { loadActiveRound } from "../storage/roundState";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const WHITE = "#FFFFFF";

function safeStr(x, fallback = "") {
  const s = String(x ?? "");
  return s ? s : fallback;
}

function safePlayerId(p, fallback) {
  return String(p?.uid || p?.id || p?._id || p?.playerId || fallback || "");
}

function safePlayerName(p) {
  return String(p?.name || p?.displayName || p?.fullName || p?.label || "Player");
}

function uniqIds(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((x) => {
    const s = String(x || "").trim();
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function defaultRoundId(tournamentId, roundNumber) {
  const t = String(tournamentId || "").trim();
  const r = Number(roundNumber || 1);
  if (!t) return "";
  return `${t}__r${r}`;
}

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
}

// Supports BOTH shapes:
// A) holes["1"].players["pid"].strokes (RoundState / saved normal rounds)
// B) holes[0].scores["pid"] (legacy array holes)
function readStrokeAnyShape(roundRoot, holeNumber, playerId) {
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

  return null;
}

function strokeForTournament(scoresByPid, pid, hole) {
  const row = scoresByPid?.[String(pid)] || {};
  const holes = row?.holes || {};
  const v = holes?.[String(hole)]?.strokes;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sumHoles(getStroke, pid, holes) {
  let total = 0;
  let any = false;
  for (const h of holes) {
    const v = getStroke(pid, h);
    if (Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

function Pill({ text, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pillBtn, active && styles.pillBtnActive, pressed && styles.pressed]}
    >
      <Text style={[styles.pillBtnText, active && styles.pillBtnTextActive]}>{text}</Text>
    </Pressable>
  );
}

function ScoreGrid({ title, holes, showOutInLabel, totalsLabel, players, getStroke }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      <View style={styles.gridWrap}>
        <View style={styles.leftCol}>
          <View style={[styles.nameCell, styles.headerCell]}>
            <Text style={styles.headerText}>Player</Text>
          </View>

          {players.map((p) => (
            <View key={`nm-${p._pid}`} style={styles.nameCell}>
              <Text numberOfLines={1} style={styles.nameText}>
                {p._name}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rightScroll}>
          <View>
            <View style={styles.row}>
              {holes.map((h) => (
                <View key={`h-${h}`} style={[styles.cell, styles.headerCell]}>
                  <Text style={styles.headerText}>{String(h)}</Text>
                </View>
              ))}

              <View style={[styles.cell, styles.headerCell, styles.totalCell]}>
                <Text style={styles.headerText}>{showOutInLabel}</Text>
              </View>

              {totalsLabel ? (
                <View style={[styles.cell, styles.headerCell, styles.totalCell]}>
                  <Text style={styles.headerText}>{totalsLabel}</Text>
                </View>
              ) : null}
            </View>

            {players.map((p) => {
              const pid = String(p._pid);
              const segmentTotal = sumHoles(getStroke, pid, holes);
              const total18 = totalsLabel ? sumHoles(getStroke, pid, Array.from({ length: 18 }, (_, i) => i + 1)) : null;

              return (
                <View key={`rw-${pid}`} style={styles.row}>
                  {holes.map((h) => {
                    const v = getStroke(pid, h);
                    return (
                      <View key={`c-${pid}-${h}`} style={styles.cell}>
                        <Text style={styles.cellText}>{v == null ? "—" : String(v)}</Text>
                      </View>
                    );
                  })}

                  <View style={[styles.cell, styles.totalCell]}>
                    <Text style={[styles.cellText, styles.totalText]}>{segmentTotal == null ? "—" : String(segmentTotal)}</Text>
                  </View>

                  {totalsLabel ? (
                    <View style={[styles.cell, styles.totalCell]}>
                      <Text style={[styles.cellText, styles.totalText]}>{total18 == null ? "—" : String(total18)}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export default function ScorecardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};

  const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
  const roundNumber = Number(params?.roundNumber || 1);
  const isTournament = !!tournamentId;

  const meUid = String(auth?.currentUser?.uid || "");

  const roundId = useMemo(() => {
    const p = String(params?.roundId || "").trim();
    if (p) return p;
    if (isTournament) return defaultRoundId(tournamentId, roundNumber);
    return "";
  }, [params?.roundId, isTournament, tournamentId, roundNumber]);

  // tournament
  const [loading, setLoading] = useState(isTournament);
  const [players, setPlayers] = useState(() => (Array.isArray(params?.players) ? params.players : []));
  const [scoresByPid, setScoresByPid] = useState({});
  const [groupIds, setGroupIds] = useState(() => {
    const fromParams = Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds.map(String) : null;
    return fromParams && fromParams.length ? uniqIds(fromParams) : [];
  });
  const [viewMode, setViewMode] = useState("MY"); // MY | GROUP
  const [mySelectedIds, setMySelectedIds] = useState([]);
  const [mySelectionReady, setMySelectionReady] = useState(false);

  // normal rounds (prefer active round over history)
  const [localRound, setLocalRound] = useState(null);
  const [localLoading, setLocalLoading] = useState(!isTournament);

  useEffect(() => {
    if (isTournament) return;

    let live = true;
    setLocalLoading(true);

    (async () => {
      try {
        const wantedId = String(params?.roundId || "").trim();

        const activeState = await loadActiveRound();
        const activeRoot = unwrapRound(activeState);

        // 1) if we have a saved roundId in params, try history first
        if (wantedId) {
          const saved = await getRoundById(wantedId);
          if (!live) return;

          if (saved) {
            setLocalRound(saved);
            return;
          }

          // 2) fallback to active round (matches or best available)
          const activeId = String(activeRoot?.id || activeRoot?.roundId || "");
          if (activeRoot && (activeId === wantedId || !activeId)) {
            setLocalRound(activeRoot);
            return;
          }

          if (activeRoot) {
            setLocalRound(activeRoot);
            return;
          }

          setLocalRound(null);
          return;
        }

        // 3) no roundId passed => always use active
        if (activeRoot) {
          setLocalRound(activeRoot);
          return;
        }

        setLocalRound(null);
      } catch {
        if (live) setLocalRound(null);
      } finally {
        if (live) setLocalLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [isTournament, params?.roundId]);

  // Tournament: Load players (members preferred, roster fallback)
  useEffect(() => {
    if (!isTournament) return;

    const membersRef = collection(db, "tournaments", String(tournamentId), "members");
    const rosterRef = collection(db, "tournaments", String(tournamentId), "roster");

    let unsubMembers = null;
    let unsubRoster = null;

    setLoading(true);

    try {
      unsubMembers = onSnapshot(
        membersRef,
        (snap) => {
          const docs = snap?.docs || [];
          const list = docs.map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
          if (list.length) {
            setPlayers(list);
            setLoading(false);
            return;
          }

          try {
            if (!unsubRoster) {
              unsubRoster = onSnapshot(
                rosterRef,
                (snap2) => {
                  const docs2 = snap2?.docs || [];
                  const list2 = docs2.map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
                  if (list2.length) setPlayers(list2);
                  setLoading(false);
                },
                () => setLoading(false)
              );
            }
          } catch {
            setLoading(false);
          }
        },
        () => setLoading(false)
      );
    } catch {
      setLoading(false);
    }

    return () => {
      if (unsubMembers) unsubMembers();
      if (unsubRoster) unsubRoster();
    };
  }, [isTournament, tournamentId]);

  // Tournament: Resolve group ids from groups collection if not provided
  useEffect(() => {
    if (!isTournament) return;
    if (Array.isArray(groupIds) && groupIds.length) return;
    if (!meUid) return;

    const roundKey = `r${String(roundNumber)}`;
    const qy = query(collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "groups"), orderBy("orderIndex", "asc"));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const docs = snap?.docs || [];
        for (const d of docs) {
          const data = d.data ? d.data() : null;
          const ids = uniqIds(Array.isArray(data?.playerIds) ? data.playerIds.map(String) : []);
          if (ids.includes(String(meUid))) {
            setGroupIds(ids.filter(Boolean));
            return;
          }
        }
        setGroupIds([String(meUid)]);
      },
      () => setGroupIds([String(meUid)])
    );

    return () => unsub();
  }, [isTournament, tournamentId, roundNumber, meUid, groupIds]);

  // Tournament: Subscribe to MY selection (tournaments/.../scorekeepers/{meUid})
  useEffect(() => {
    if (!isTournament) return;
    if (!tournamentId) return;
    if (!meUid) return;

    setMySelectionReady(false);

    const roundKey = `r${String(roundNumber)}`;
    const ref = doc(db, "tournaments", String(tournamentId), "rounds", roundKey, "scorekeepers", String(meUid));

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap?.exists() ? (snap.data ? snap.data() : {}) : {};
        const raw = uniqIds(Array.isArray(data?.selectedPlayerIds) ? data.selectedPlayerIds : []);
        setMySelectedIds(raw);
        setMySelectionReady(true);
      },
      () => {
        setMySelectedIds([]);
        setMySelectionReady(true);
      }
    );

    return () => unsub();
  }, [isTournament, tournamentId, roundNumber, meUid]);

  // Tournament: Subscribe to scores
  useEffect(() => {
    if (!isTournament) return;
    if (!tournamentId) return;

    const roundKey = `r${String(roundNumber)}`;
    const scoresRef = collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "scores");

    const unsub = onSnapshot(
      scoresRef,
      (snap) => {
        const next = {};
        const docs = snap?.docs || [];
        for (const d of docs) next[String(d.id)] = (d.data && d.data()) || {};
        setScoresByPid(next);
      },
      () => { }
    );

    return () => unsub();
  }, [isTournament, tournamentId, roundNumber]);

  const courseName = useMemo(() => {
    if (isTournament) return safeStr(params?.courseName || params?.course?.name, "");
    return safeStr(params?.courseName || params?.course?.name || localRound?.courseName || localRound?.course?.name, "");
  }, [isTournament, params?.courseName, params?.course?.name, localRound]);

  const teeName = useMemo(() => {
    if (isTournament) return safeStr(params?.teeName || params?.tee?.name, "");
    return safeStr(params?.teeName || params?.tee?.name || localRound?.teeName || localRound?.tee?.name, "");
  }, [isTournament, params?.teeName, params?.tee?.name, localRound]);

  const playerRows = useMemo(() => {
    const list = Array.isArray(players) ? players : [];
    return list
      .map((p, idx) => {
        const pid = safePlayerId(p, String(idx));
        return { ...p, _pid: pid, _name: safePlayerName(p) };
      })
      .filter((p) => !!p._pid);
  }, [players]);

  const localPlayerRows = useMemo(() => {
    const fromParams = Array.isArray(params?.players) ? params.players : null;
    const list = fromParams && fromParams.length ? fromParams : Array.isArray(localRound?.players) ? localRound.players : [];
    return (list || [])
      .map((p, idx) => {
        const pid = safePlayerId(p, String(idx));
        return { ...p, _pid: pid, _name: safePlayerName(p) };
      })
      .filter((p) => !!p._pid);
  }, [params?.players, localRound]);

  const mySelectionIds = useMemo(() => {
    const groupSet = new Set((Array.isArray(groupIds) ? groupIds : []).map(String));
    const raw = uniqIds(mySelectedIds);
    const clamped = raw.filter((id) => groupSet.has(String(id)));
    if (clamped.length) return clamped;

    if (!mySelectionReady) return meUid ? [String(meUid)] : [];
    return meUid ? [String(meUid)] : [];
  }, [mySelectedIds, groupIds, meUid, mySelectionReady]);

  const displayIds = useMemo(() => {
    if (!isTournament) return null;

    const me = meUid ? [String(meUid)] : [];

    if (viewMode === "MY") {
      return new Set(me.map(String));
    }

    const ids =
      (Array.isArray(mySelectionIds) && mySelectionIds.length
        ? mySelectionIds
        : Array.isArray(groupIds) && groupIds.length
          ? groupIds
          : me);

    return new Set(ids.map(String));
  }, [isTournament, viewMode, groupIds, mySelectionIds, meUid]);

  const displayedPlayers = useMemo(() => {
    if (!isTournament) return localPlayerRows;

    const rows = playerRows.filter((p) => displayIds?.has(String(p._pid)));

    if (!meUid) return rows;
    const mine = rows.filter((r) => String(r._pid) === String(meUid));
    const rest = rows.filter((r) => String(r._pid) !== String(meUid));
    return [...mine, ...rest];
  }, [isTournament, playerRows, displayIds, meUid, localPlayerRows]);

  const getStroke = useMemo(() => {
    if (isTournament) return (pid, hole) => strokeForTournament(scoresByPid, pid, hole);
    return (pid, hole) => readStrokeAnyShape(localRound || {}, hole, pid);
  }, [isTournament, scoresByPid, localRound]);

  const front9 = useMemo(() => Array.from({ length: 9 }, (_, i) => i + 1), []);
  const back9 = useMemo(() => Array.from({ length: 9 }, (_, i) => i + 10), []);

  const headerSub = useMemo(() => {
    if (isTournament) return `ROUND ${roundNumber}`;
    const a = courseName ? courseName : "";
    const b = teeName ? teeName : "";
    if (a && b) return `${a} • ${b}`;
    return a || b || "";
  }, [isTournament, roundNumber, courseName, teeName]);

  const showLoading = isTournament ? loading : localLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="SCORECARD" subtitle={headerSub} safeTop={false} rightLabel={null} onRightPress={null} />

      {isTournament ? (
        <View style={styles.topPills}>
          <Pill text="MY" active={viewMode === "MY"} onPress={() => setViewMode("MY")} />
          <Pill text="GROUP" active={viewMode === "GROUP"} onPress={() => setViewMode("GROUP")} />
          <View style={styles.countPill}>
            <Text style={styles.countText}>{displayedPlayers.length ? `${displayedPlayers.length} players` : "Loading…"}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: Math.max(18, (insets?.bottom || 0) + 18) }}
        showsVerticalScrollIndicator={false}
      >
        {showLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading scorecard…</Text>
          </View>
        ) : null}

        {!isTournament && !localRound ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>No active round found. Resume a round first.</Text>
          </View>
        ) : displayedPlayers.length ? (
          <>
            <ScoreGrid title="Front 9" holes={front9} showOutInLabel="OUT" totalsLabel={null} players={displayedPlayers} getStroke={getStroke} />
            <ScoreGrid title="Back 9" holes={back9} showOutInLabel="IN" totalsLabel="TOT" players={displayedPlayers} getStroke={getStroke} />
          </>
        ) : (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>No players found for this round.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },

  topPills: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },

  pillBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillBtnActive: { backgroundColor: "rgba(242,201,76,0.18)", borderColor: "rgba(242,201,76,0.45)" },
  pillBtnText: { color: "rgba(255,255,255,0.84)", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
  pillBtnTextActive: { color: WHITE },

  countPill: {
    marginLeft: "auto",
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(46,204,113,0.10)",
    borderWidth: 1,
    borderColor: "rgba(46,204,113,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "rgba(255,255,255,0.88)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

  sectionCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: "rgba(242,201,76,0.22)", overflow: "hidden", marginBottom: 12 },
  sectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.12)" },
  sectionTitle: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.6 },

  gridWrap: { flexDirection: "row" },

  leftCol: { width: 132, backgroundColor: "rgba(0,0,0,0.10)", borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.08)" },

  rightScroll: { paddingRight: 8 },

  row: { flexDirection: "row" },

  nameCell: { height: 42, paddingHorizontal: 12, alignItems: "flex-start", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  nameText: { color: WHITE, fontWeight: "900", fontSize: 12 },

  cell: { width: 44, height: 42, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.03)" },

  headerCell: { backgroundColor: "rgba(0,0,0,0.14)" },
  headerText: { color: "rgba(255,255,255,0.80)", fontWeight: "900", fontSize: 11, letterSpacing: 0.4 },

  cellText: { color: WHITE, fontWeight: "900", fontSize: 12 },
  totalCell: { width: 54, backgroundColor: "rgba(242,201,76,0.10)", borderRightColor: "rgba(242,201,76,0.20)" },
  totalText: { color: WHITE },

  loadingCard: { marginTop: 8, backgroundColor: INNER, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText: { color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 12 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
