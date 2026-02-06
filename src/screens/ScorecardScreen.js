// src/screens/ScorecardScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot, query, orderBy, doc } from "firebase/firestore";

import { db, auth } from "../firebase/firebase";
import ScreenHeader from "../components/ScreenHeader";

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

function strokeFor(scoresByPid, pid, hole) {
  const row = scoresByPid?.[String(pid)] || {};
  const holes = row?.holes || {};
  const v = holes?.[String(hole)]?.strokes;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sumHoles(scoresByPid, pid, holes) {
  let total = 0;
  let any = false;
  for (const h of holes) {
    const v = strokeFor(scoresByPid, pid, h);
    if (Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

function Pill({ text, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pillBtn, active && styles.pillBtnActive, pressed && styles.pressed]}>
      <Text style={[styles.pillBtnText, active && styles.pillBtnTextActive]}>{text}</Text>
    </Pressable>
  );
}

function ScoreGrid({ title, holes, showOutInLabel, totalsLabel, players, scoresByPid }) {
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
              const segmentTotal = sumHoles(scoresByPid, pid, holes);
              const total18 = totalsLabel ? sumHoles(scoresByPid, pid, Array.from({ length: 18 }, (_, i) => i + 1)) : null;

              return (
                <View key={`rw-${pid}`} style={styles.row}>
                  {holes.map((h) => {
                    const v = strokeFor(scoresByPid, pid, h);
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

  const roundId = String(params?.roundId || "").trim();
  const isTournament = !!tournamentId;

  const meUid = String(auth?.currentUser?.uid || "");
  const courseName = safeStr(params?.courseName || params?.course?.name, "");

  const [loading, setLoading] = useState(isTournament);
  const [players, setPlayers] = useState(() => (Array.isArray(params?.players) ? params.players : []));
  const [scoresByPid, setScoresByPid] = useState({});
  const [groupIds, setGroupIds] = useState(() => {
    const fromParams = Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds.map(String) : null;
    return fromParams && fromParams.length ? uniqIds(fromParams) : [];
  });

  const [viewMode, setViewMode] = useState("MY"); // MY | GROUP

  // truth for MY mode (scorekeeper selection doc)
  const [mySelectedIds, setMySelectedIds] = useState([]);
  const [mySelectionReady, setMySelectionReady] = useState(false);

  // Load players (members preferred, roster fallback)
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

  // Resolve group ids from groups collection if not provided
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

  // Subscribe to MY selection (tournaments/.../scorekeepers/{meUid})
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

  // Subscribe to scores (GLOBAL rounds/{roundId}/scores)
  useEffect(() => {
    if (!isTournament) return;
    if (!roundId) return;

    const scoresRef = collection(db, "rounds", String(roundId), "scores");

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
  }, [isTournament, roundId]);

  const playerRows = useMemo(() => {
    const list = Array.isArray(players) ? players : [];
    return list
      .map((p, idx) => {
        const pid = safePlayerId(p, String(idx));
        return { ...p, _pid: pid, _name: safePlayerName(p) };
      })
      .filter((p) => !!p._pid);
  }, [players]);

  const mySelectionIds = useMemo(() => {
    // truth: Firestore scorekeepers selection (clamped to group)
    const groupSet = new Set((Array.isArray(groupIds) ? groupIds : []).map(String));

    const raw = uniqIds(mySelectedIds);
    const clamped = raw.filter((id) => groupSet.has(String(id)));

    if (clamped.length) return clamped;

    // fallback while loading / if missing
    if (!mySelectionReady) return meUid ? [String(meUid)] : [];
    return meUid ? [String(meUid)] : [];
  }, [mySelectedIds, groupIds, meUid, mySelectionReady]);

  const displayIds = useMemo(() => {
    if (!isTournament) return null;

    if (viewMode === "GROUP") {
      const ids = Array.isArray(groupIds) && groupIds.length ? groupIds : meUid ? [String(meUid)] : [];
      return new Set(ids.map(String));
    }

    return new Set(mySelectionIds.map(String));
  }, [isTournament, viewMode, groupIds, mySelectionIds, meUid]);

  const displayedPlayers = useMemo(() => {
    if (!isTournament) return playerRows;

    const rows = playerRows.filter((p) => displayIds?.has(String(p._pid)));

    if (!meUid) return rows;
    const mine = rows.filter((r) => String(r._pid) === String(meUid));
    const rest = rows.filter((r) => String(r._pid) !== String(meUid));
    return [...mine, ...rest];
  }, [isTournament, playerRows, displayIds, meUid]);

  const front9 = useMemo(() => Array.from({ length: 9 }, (_, i) => i + 1), []);
  const back9 = useMemo(() => Array.from({ length: 9 }, (_, i) => i + 10), []);

  const headerTitle = useMemo(() => {
    if (!isTournament) return "SCORECARD";
    return `ROUND ${roundNumber} • SCORECARD`;
  }, [isTournament, roundNumber]);

  const headerSub = useMemo(() => {
    return courseName ? courseName : "";
  }, [courseName]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title={headerTitle} subtitle={headerSub} safeTop={false} rightLabel={null} onRightPress={null} />

      {isTournament ? (
        <View style={styles.topPills}>
          <Pill text="MY" active={viewMode === "MY"} onPress={() => setViewMode("MY")} />
          <Pill text="GROUP" active={viewMode === "GROUP"} onPress={() => setViewMode("GROUP")} />

          <View style={styles.countPill}>
            <Text style={styles.countText}>{displayedPlayers.length ? `${displayedPlayers.length} players` : "Loading…"}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: Math.max(18, (insets?.bottom || 0) + 18) }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading scorecard…</Text>
          </View>
        ) : null}

        {!isTournament ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Non-tournament scorecard is not wired here yet.</Text>
          </View>
        ) : !roundId ? (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Missing roundId. Go back and re-enter from Hole View.</Text>
          </View>
        ) : displayedPlayers.length ? (
          <>
            <ScoreGrid title="Front 9" holes={front9} showOutInLabel="OUT" totalsLabel={null} players={displayedPlayers} scoresByPid={scoresByPid} />
            <ScoreGrid title="Back 9" holes={back9} showOutInLabel="IN" totalsLabel="TOT" players={displayedPlayers} scoresByPid={scoresByPid} />
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

  topPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },

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
  pillBtnActive: {
    backgroundColor: "rgba(242,201,76,0.18)",
    borderColor: "rgba(242,201,76,0.45)",
  },
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

  sectionCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.22)",
    overflow: "hidden",
    marginBottom: 12,
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  sectionTitle: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.6 },

  gridWrap: { flexDirection: "row" },

  leftCol: {
    width: 132,
    backgroundColor: "rgba(0,0,0,0.10)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
  },

  rightScroll: { paddingRight: 8 },

  row: { flexDirection: "row" },

  nameCell: {
    height: 42,
    paddingHorizontal: 12,
    alignItems: "flex-start",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  nameText: { color: WHITE, fontWeight: "900", fontSize: 12 },

  cell: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  headerCell: { backgroundColor: "rgba(0,0,0,0.14)" },
  headerText: { color: "rgba(255,255,255,0.80)", fontWeight: "900", fontSize: 11, letterSpacing: 0.4 },

  cellText: { color: WHITE, fontWeight: "900", fontSize: 12 },
  totalCell: {
    width: 54,
    backgroundColor: "rgba(242,201,76,0.10)",
    borderRightColor: "rgba(242,201,76,0.20)",
  },
  totalText: { color: WHITE },

  loadingCard: {
    marginTop: 8,
    backgroundColor: INNER,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: { color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 12 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
