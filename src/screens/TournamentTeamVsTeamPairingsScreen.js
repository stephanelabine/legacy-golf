// src/screens/TournamentTeamVsTeamPairingsScreen.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import { db } from "../firebase/firebase";

function safeStr(x) {
  return String(x ?? "");
}

function getPlayerId(p) {
  return String(p?.uid || p?.id || p?._id || "");
}
function getPlayerName(p) {
  return String(p?.name || p?.displayName || p?.fullName || p?.email || "Player");
}

function sortLowToHigh(players) {
  const arr = Array.isArray(players) ? [...players] : [];
  return arr.sort((a, b) => Number(a?.handicap || 0) - Number(b?.handicap || 0));
}

function shuffleCopy(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function makeRoundMatchups1v1(teamA, teamB, roundNumber) {
  const a = sortLowToHigh(teamA);
  const baseB = sortLowToHigh(teamB);

  const b = roundNumber === 1 ? baseB : shuffleCopy(baseB);

  const max = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    out.push({
      aUid: getPlayerId(a[i] || null),
      bUid: getPlayerId(b[i] || null),
      teeTime: "",
    });
  }
  return out;
}

export default function TournamentTeamVsTeamPairingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tournamentId = String(route?.params?.tournamentId || "");

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);

  const [activeRound, setActiveRound] = useState(1);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!tournamentId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setTournament(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [tournamentId]);

  const teamVsTeam = tournament?.teamVsTeam || null;

  const teamAName = safeStr(teamVsTeam?.teamAName || "Team A");
  const teamBName = safeStr(teamVsTeam?.teamBName || "Team B");

  const teamAList = useMemo(() => (Array.isArray(teamVsTeam?.teamA) ? teamVsTeam.teamA : []), [teamVsTeam]);
  const teamBList = useMemo(() => (Array.isArray(teamVsTeam?.teamB) ? teamVsTeam.teamB : []), [teamVsTeam]);

  const playersById = useMemo(() => {
    const m = new Map();
    for (const p of [...teamAList, ...teamBList]) {
      const id = getPlayerId(p);
      if (id) m.set(id, p);
    }
    return m;
  }, [teamAList, teamBList]);

  const resolvePlayerByUid = (uid) => {
    const key = String(uid || "");
    if (!key) return null;
    return playersById.get(key) || { uid: key, name: "Player" };
  };

  const savedByRound = useMemo(() => {
    const raw = teamVsTeam?.pairingsByRound;
    return raw && typeof raw === "object" ? raw : null;
  }, [teamVsTeam]);

  const [localByRound, setLocalByRound] = useState({ 1: [], 2: [], 3: [], 4: [] });

  useEffect(() => {
    if (!teamVsTeam) return;

    const next = { 1: [], 2: [], 3: [], 4: [] };

    if (savedByRound) {
      for (const r of [1, 2, 3, 4]) {
        const bucket = savedByRound[String(r)];
        const matchups = Array.isArray(bucket?.matchups) ? bucket.matchups : [];
        next[r] = matchups.map((m) => ({
          aUid: String(m?.aUid || ""),
          bUid: String(m?.bUid || ""),
          teeTime: safeStr(m?.teeTime || ""),
        }));
      }
      setLocalByRound(next);
      return;
    }

    const legacy = Array.isArray(teamVsTeam?.matchups) ? teamVsTeam.matchups : [];
    const round1 =
      legacy.length > 0
        ? legacy.map((m) => ({
            aUid: String(m?.aUid || ""),
            bUid: String(m?.bUid || ""),
            teeTime: safeStr(m?.teeTime || ""),
          }))
        : makeRoundMatchups1v1(teamAList, teamBList, 1);

    next[1] = round1;
    next[2] = makeRoundMatchups1v1(teamAList, teamBList, 2);
    next[3] = makeRoundMatchups1v1(teamAList, teamBList, 3);
    next[4] = [];

    setLocalByRound(next);
  }, [teamVsTeam, savedByRound, teamAList, teamBList]);

  const activeMatchups = useMemo(() => {
    const rows = localByRound?.[activeRound] || [];
    return Array.isArray(rows) ? rows : [];
  }, [localByRound, activeRound]);

  const setTeeTime = (index, val) => {
    setLocalByRound((prev) => {
      const next = { ...prev };
      const rows = Array.isArray(next[activeRound]) ? [...next[activeRound]] : [];
      const row = rows[index] || { aUid: "", bUid: "", teeTime: "" };
      rows[index] = { ...row, teeTime: val };
      next[activeRound] = rows;
      return next;
    });
  };

  const ensureRound4Placeholders = () => {
    if (activeRound !== 4) return;
    setLocalByRound((prev) => {
      const curr = Array.isArray(prev[4]) ? prev[4] : [];
      if (curr.length > 0) return prev;

      const max = Math.max(teamAList.length, teamBList.length);
      const rows = [];
      for (let i = 0; i < max; i += 1) rows.push({ aUid: "", bUid: "", teeTime: "" });
      return { ...prev, 4: rows };
    });
  };

  useEffect(() => {
    if (activeRound === 4) ensureRound4Placeholders();
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }));
  }, [activeRound]);

  const onRoundPress = (r) => {
    Keyboard.dismiss();
    setActiveRound(r);
  };

  const canRender = !!tournamentId && !loading && !!teamVsTeam;

  const onSaveAndContinue = async () => {
    if (!tournamentId) return;
    if (!teamVsTeam) {
      Alert.alert("Missing data", "Go back and build teams first.");
      return;
    }

    try {
      const pairingsByRound = {
        "1": { matchups: (localByRound[1] || []).map((m) => ({ aUid: String(m.aUid || ""), bUid: String(m.bUid || ""), teeTime: safeStr(m.teeTime || "") })) },
        "2": { matchups: (localByRound[2] || []).map((m) => ({ aUid: String(m.aUid || ""), bUid: String(m.bUid || ""), teeTime: safeStr(m.teeTime || "") })) },
        "3": { matchups: (localByRound[3] || []).map((m) => ({ aUid: String(m.aUid || ""), bUid: String(m.bUid || ""), teeTime: safeStr(m.teeTime || "") })) },
        "4": { matchups: (localByRound[4] || []).map((m) => ({ aUid: String(m.aUid || ""), bUid: String(m.bUid || ""), teeTime: safeStr(m.teeTime || "") })) },
      };

      const payload = {
        ...(teamVsTeam || {}),
        matchType: "1v1",
        pairingsByRound,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "tournaments", tournamentId), {
        teamVsTeam: payload,
        updatedAt: serverTimestamp(),
      });

      navigation.navigate(ROUTES.TOURNAMENT_TEAM_VS_TEAM_PAIRINGS_OVERVIEW, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", "Could not save pairings.");
    }
  };

  const renderGrouped = () => {
    // Group every 2 matchups into a foursome container
    const groups = [];
    for (let i = 0; i < activeMatchups.length; i += 2) {
      groups.push({ start: i, rows: activeMatchups.slice(i, i + 2) });
    }

    return (
      <View style={styles.list}>
        {groups.map((g, gi) => {
          const showGroupLabel = activeMatchups.length > 1;
          return (
            <View key={`g-${gi}`} style={styles.foursomeWrap}>
              {showGroupLabel ? (
                <View style={styles.foursomeHeader}>
                  <Text style={styles.foursomeHeaderText}>Group {gi + 1}</Text>
                  <Text style={styles.foursomeHeaderSub}>Foursome</Text>
                </View>
              ) : null}

              <View style={styles.foursomeInner}>
                {g.rows.map((m, idx) => {
                  const rowIndex = g.start + idx;
                  const a = resolvePlayerByUid(m?.aUid);
                  const b = resolvePlayerByUid(m?.bUid);

                  return (
                    <View
                      key={`${activeRound}-${rowIndex}`}
                      style={[
                        styles.matchCard,
                        idx === 0 ? styles.matchCardTop : null,
                        idx === 1 ? styles.matchCardBottom : null,
                      ]}
                    >
                      <View style={styles.matchHeaderRow}>
                        <View style={[styles.teamHeaderPill, styles.teamHeaderPillA]}>
                          <Text style={styles.teamHeaderText} numberOfLines={1}>
                            {teamAName}
                          </Text>
                        </View>

                        <Text style={styles.vs}>vs</Text>

                        <View style={[styles.teamHeaderPill, styles.teamHeaderPillB]}>
                          <Text style={styles.teamHeaderText} numberOfLines={1}>
                            {teamBName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.playersRow}>
                        <View style={[styles.playerSide, styles.playerSideA]}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {a ? getPlayerName(a) : "—"}
                          </Text>
                        </View>

                        <View style={[styles.playerSide, styles.playerSideB]}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {b ? getPlayerName(b) : "—"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.teeRow}>
                        <Text style={styles.teeLabel}>Tee time</Text>
                        <TextInput
                          value={safeStr(m?.teeTime || "")}
                          onChangeText={(v) => setTeeTime(rowIndex, v)}
                          placeholder="e.g. 9:10"
                          placeholderTextColor="rgba(234,242,255,0.40)"
                          style={styles.teeInput}
                          autoCapitalize="none"
                          autoCorrect={false}
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>

                      {activeRound === 4 ? (
                        <View style={styles.round4Note}>
                          <Text style={styles.round4NoteText}>
                            Round 4 opponents are set by the organizer after Round 3.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.content, { paddingBottom: 120 + Math.max(insets.bottom, 10) }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Pairings</Text>
            <Text style={styles.heroSub}>Round-by-round 1v1 matchups, grouped as foursomes.</Text>

            <View style={styles.roundTabs}>
              {[1, 2, 3, 4].map((r) => {
                const active = r === activeRound;
                return (
                  <Pressable
                    key={String(r)}
                    onPress={() => onRoundPress(r)}
                    style={({ pressed }) => [
                      styles.roundTab,
                      active ? styles.roundTabActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.roundTabText, active ? styles.roundTabTextActive : null]}>Round {r}</Text>
                  </Pressable>
                );
              })}
            </View>

            {activeRound === 4 ? (
              <View style={styles.noteBadge}>
                <Text style={styles.noteText}>Round 4 is organizer-set (not auto-generated).</Text>
              </View>
            ) : null}
          </View>

          {!tournamentId ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Missing tournamentId</Text>
              <Text style={styles.noticeSub}>This screen needs a tournamentId param.</Text>
            </View>
          ) : loading ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Loading…</Text>
              <Text style={styles.noticeSub}>Fetching tournament.</Text>
            </View>
          ) : !teamVsTeam ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>No Team vs Team data</Text>
              <Text style={styles.noticeSub}>Go back and build teams first.</Text>
            </View>
          ) : (
            renderGrouped()
          )}

          <View style={{ height: 18 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            onPress={onSaveAndContinue}
            disabled={!canRender}
            style={({ pressed }) => [
              styles.primary,
              !canRender ? styles.disabled : null,
              pressed && canRender ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryText}>Save and Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const BG = "#071017";
const CARD = "#0D1A24";
const CARD2 = "#0B151E";
const TEXT = "#EAF2FF";

const GREEN_BG = "rgba(15,122,74,0.14)";
const GREEN_RING = "rgba(15,122,74,0.55)";
const GREEN_SOFT = "rgba(15,122,74,0.10)";

const GOLD_RING = "rgba(201,162,74,0.55)";
const GOLD_SOFT = "rgba(201,162,74,0.10)";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: BG },

  content: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },

  hero: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: GOLD_RING,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  heroSub: {
    marginTop: 8,
    color: "rgba(234,242,255,0.76)",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },

  roundTabs: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  roundTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundTabActive: {
    backgroundColor: GREEN_BG,
    borderColor: GREEN_RING,
  },
  roundTabText: {
    color: "rgba(234,242,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  roundTabTextActive: { color: TEXT },

  noteBadge: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.12)",
  },
  noteText: {
    color: "rgba(234,242,255,0.86)",
    fontSize: 12,
    fontWeight: "900",
  },

  notice: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  noticeTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  noticeSub: {
    marginTop: 6,
    color: "rgba(234,242,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },

  list: { marginTop: 12, gap: 12 },

  foursomeWrap: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(201,162,74,0.40)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 10,
  },
  foursomeHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  foursomeHeaderText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  foursomeHeaderSub: {
    color: "rgba(234,242,255,0.68)",
    fontSize: 12,
    fontWeight: "900",
  },
  foursomeInner: {
    gap: 10,
  },

  matchCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  matchCardTop: {},
  matchCardBottom: {},

  matchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamHeaderPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  teamHeaderPillA: {
    backgroundColor: GREEN_SOFT,
    borderColor: GREEN_RING,
  },
  teamHeaderPillB: {
    backgroundColor: GOLD_SOFT,
    borderColor: GOLD_RING,
  },
  teamHeaderText: {
    color: "rgba(234,242,255,0.88)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  vs: {
    color: "rgba(234,242,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
  },

  playersRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  playerSide: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  playerSideA: {
    backgroundColor: "rgba(15,122,74,0.06)",
    borderColor: "rgba(15,122,74,0.28)",
  },
  playerSideB: {
    backgroundColor: "rgba(201,162,74,0.06)",
    borderColor: "rgba(201,162,74,0.28)",
  },
  playerName: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  teeRow: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.14)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teeLabel: { color: "rgba(234,242,255,0.74)", fontSize: 12, fontWeight: "900" },
  teeInput: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
    paddingVertical: Platform.OS === "ios" ? 6 : 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.12)",
    textAlign: "center",
  },

  round4Note: {
    marginTop: 10,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  round4NoteText: {
    color: "rgba(234,242,255,0.72)",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "rgba(7,16,23,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(234,242,255,0.10)",
  },
  primary: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,122,74,0.95)",
    borderWidth: 1,
    borderColor: GREEN_RING,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.5 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.88 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
