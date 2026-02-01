// src/screens/TournamentTeamVsTeamSetupScreen.js
import React, { useEffect, useMemo, useState, memo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Dimensions,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, onSnapshot as onSnapshotCol } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { db } from "../firebase/firebase";

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function getPlayerId(p) {
  return String(p?.uid || p?.id || p?._id || "");
}

function getPlayerName(p) {
  return String(p?.name || p?.displayName || p?.fullName || p?.email || "Player");
}

function getPlayerHandicap(p) {
  if (p?.handicap !== undefined) return safeNum(p.handicap, 0);
  if (p?.hcp !== undefined) return safeNum(p.hcp, 0);
  if (p?.hdcp !== undefined) return safeNum(p.hdcp, 0);
  if (p?.index !== undefined) return safeNum(p.index, 0);
  return 0;
}

function normalizeName(p) {
  return getPlayerName(p).trim().toLowerCase();
}

function sortAlpha(players) {
  return [...players].sort((a, b) => {
    const an = normalizeName(a);
    const bn = normalizeName(b);
    if (an !== bn) return an < bn ? -1 : 1;
    return getPlayerId(a).localeCompare(getPlayerId(b));
  });
}

function sortLowToHigh(players) {
  return [...players].sort((a, b) => getPlayerHandicap(a) - getPlayerHandicap(b));
}

function sumHandicap(players) {
  return players.reduce((acc, p) => acc + getPlayerHandicap(p), 0);
}

function makeMatchups1v1(teamA, teamB) {
  const a = sortLowToHigh(teamA);
  const b = sortLowToHigh(teamB);
  const max = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    out.push({
      a: a[i] || null,
      b: b[i] || null,
    });
  }
  return out;
}

/*
  Randomized balancing:
  - still greedy-balance by total handicap
  - but introduces tiny random jitter in ordering so "Regenerate Teams" produces a new split
*/
function balanceTeamsRandom(players) {
  const seeded = [...players]
    .map((p) => ({
      p,
      key: getPlayerHandicap(p) + Math.random() * 0.01, // tiny jitter
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);

  const teamA = [];
  const teamB = [];
  let totalA = 0;
  let totalB = 0;

  for (const p of seeded) {
    const h = getPlayerHandicap(p);
    if (totalA <= totalB) {
      teamA.push(p);
      totalA += h;
    } else {
      teamB.push(p);
      totalB += h;
    }
  }

  return {
    teamA: sortLowToHigh(teamA),
    teamB: sortLowToHigh(teamB),
  };
}

const TeamCard = memo(function TeamCard({ side, name, onCommitName, players, total, locked, isWide }) {
  const list = useMemo(() => sortAlpha(players), [players]);

  const inputRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(name || ""));

  useEffect(() => {
    if (!editing) setDraft(String(name || ""));
  }, [name, editing]);

  const beginEdit = () => {
    if (locked) return;
    setEditing(true);
    setDraft(""); // clear immediately so user can type without deleting
    requestAnimationFrame(() => {
      inputRef.current?.focus?.();
    });
  };

  const commitDone = () => {
    const cleaned = String(draft || "").trim();
    const next = cleaned.length ? cleaned : `Team ${side}`;
    onCommitName(next);
    setEditing(false);
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.teamCard, isWide ? styles.teamCardWide : null]}>
      <View style={styles.teamHeader}>
        <Text style={styles.teamLabel}>Team {side}</Text>

        {!editing ? (
          <Pressable
            onPress={beginEdit}
            disabled={locked}
            style={({ pressed }) => [
              styles.teamNamePress,
              locked ? styles.inputLocked : null,
              pressed && !locked ? styles.pressed : null,
            ]}
          >
            <Text style={styles.teamNameText} numberOfLines={1}>
              {String(name || `Team ${side}`)}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.editWrap}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              editable={!locked}
              placeholder={`Enter team name`}
              placeholderTextColor="rgba(234,242,255,0.45)"
              style={[styles.teamNameInput, locked ? styles.inputLocked : null]}
              textAlign="center"
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={commitDone}
            />

            <Pressable
              onPress={commitDone}
              disabled={locked}
              style={({ pressed }) => [
                styles.doneButton,
                locked ? styles.actionDisabled : null,
                pressed && !locked ? styles.pressed : null,
              ]}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.teamTotalPill}>
          <Text style={styles.teamTotalLabel}>Team total</Text>
          <Text style={styles.teamTotalValue}>{Math.round(total * 10) / 10}</Text>
        </View>
      </View>

      <View style={styles.teamList}>
        {list.map((p) => {
          const pid = getPlayerId(p);
          const h = getPlayerHandicap(p);
          return (
            <View key={pid} style={styles.playerRow}>
              <Text style={styles.playerName} numberOfLines={1}>
                {getPlayerName(p)}
              </Text>
              <View style={styles.hcpPill}>
                <Text style={styles.hcpText}>{Math.round(h * 10) / 10}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default function TournamentTeamVsTeamSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tournamentId = String(route?.params?.tournamentId || "");

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);

  const [rawMembers, setRawMembers] = useState([]);

  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");

  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);

  const [matchups, setMatchups] = useState([]);
  const [locked, setLocked] = useState(false);

  const isWide = Dimensions.get("window").width >= 720;

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

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

  useEffect(() => {
    if (!tournamentId) return;

    const mref = collection(db, "tournaments", tournamentId, "members");
    const unsub = onSnapshotCol(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRawMembers(rows);
      },
      () => {}
    );

    return () => unsub();
  }, [tournamentId]);

  const roster = useMemo(() => {
    const list = Array.isArray(rawMembers) ? rawMembers : [];
    return list
      .map((p) => {
        const uid = String(p?.uid || p?.id || "");
        if (!uid) return null;

        const name =
          String(p?.displayName || "").trim() ||
          String(p?.name || "").trim() ||
          String(p?.fullName || "").trim() ||
          String(p?.email || "").trim() ||
          "Player";

        const h = p?.handicap;
        const hNum =
          typeof h === "number"
            ? h
            : h === null || h === undefined || h === ""
            ? NaN
            : Number(String(h).trim());

        return {
          uid,
          name,
          displayName: name,
          handicap: Number.isFinite(hNum) ? Math.round(hNum * 10) / 10 : 0,
          isGuest: !!p?.isGuest,
          email: String(p?.email || "").trim(),
          phone: String(p?.phone || "").trim(),
        };
      })
      .filter(Boolean);
  }, [rawMembers]);

  useEffect(() => {
    if (!tournament) return;

    const saved = tournament?.teamVsTeam || tournament?.teamVTeam || null;

    if (saved && (Array.isArray(saved.teamA) || Array.isArray(saved.teamB))) {
      setTeamAName(String(saved.teamAName || "Team A"));
      setTeamBName(String(saved.teamBName || "Team B"));

      const savedA = Array.isArray(saved.teamA) ? saved.teamA : [];
      const savedB = Array.isArray(saved.teamB) ? saved.teamB : [];

      const byId = new Map(roster.map((p) => [getPlayerId(p), p]));
      const toPlayerObj = (x) => {
        if (!x) return null;
        if (typeof x === "string") return byId.get(x) || null;
        if (typeof x === "object") {
          const uid = getPlayerId(x);
          return (
            byId.get(uid) || {
              uid,
              name: getPlayerName(x),
              displayName: getPlayerName(x),
              handicap: getPlayerHandicap(x),
              isGuest: !!x?.isGuest,
            }
          );
        }
        return null;
      };

      const mappedA = savedA.map(toPlayerObj).filter(Boolean);
      const mappedB = savedB.map(toPlayerObj).filter(Boolean);

      setTeamA(sortLowToHigh(mappedA));
      setTeamB(sortLowToHigh(mappedB));

      const savedLocked = !!saved.locked;
      setLocked(savedLocked);

      const nextMatchups =
        Array.isArray(saved.matchups) && saved.matchups.length
          ? saved.matchups
              .map((m) => {
                const a = toPlayerObj(m?.aUid || m?.a || null);
                const b = toPlayerObj(m?.bUid || m?.b || null);
                return { a: a || null, b: b || null };
              })
              .filter((m) => m.a || m.b)
          : makeMatchups1v1(mappedA, mappedB);

      setMatchups(nextMatchups);
      return;
    }

    if (roster.length) {
      const { teamA: a, teamB: b } = balanceTeamsRandom(roster);
      setTeamA(a);
      setTeamB(b);
      setMatchups(makeMatchups1v1(a, b));
      setLocked(false);
    }
  }, [tournament, roster]);

  const totals = useMemo(() => {
    return {
      a: sumHandicap(teamA),
      b: sumHandicap(teamB),
    };
  }, [teamA, teamB]);

  const canRenderTeams = roster.length > 0;

  const onRegenerateTeams = () => {
    if (!canRenderTeams) return;
    if (locked) return;

    const { teamA: a, teamB: b } = balanceTeamsRandom(roster);
    setTeamA(a);
    setTeamB(b);
    setMatchups(makeMatchups1v1(a, b));
  };

  const saveTeamVsTeam = async (nextLocked) => {
    if (!tournamentId) return;

    const payload = {
      teamAName: String(teamAName || "Team A"),
      teamBName: String(teamBName || "Team B"),
      teamA: teamA.map((p) => ({
        uid: getPlayerId(p),
        name: getPlayerName(p),
        handicap: getPlayerHandicap(p),
        isGuest: !!p?.isGuest,
      })),
      teamB: teamB.map((p) => ({
        uid: getPlayerId(p),
        name: getPlayerName(p),
        handicap: getPlayerHandicap(p),
        isGuest: !!p?.isGuest,
      })),
      matchType: "1v1",
      matchups: (Array.isArray(matchups) ? matchups : []).map((m) => ({
        aUid: getPlayerId(m?.a),
        bUid: getPlayerId(m?.b),
      })),
      locked: !!nextLocked,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, "tournaments", tournamentId), {
      teamVsTeam: payload,
      updatedAt: serverTimestamp(),
    });
  };

  const onPrimary = async () => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId was provided.");
      return;
    }

    if (!canRenderTeams) {
      Alert.alert("Players missing", "No roster found yet. Go back, confirm players are saved, then try again.");
      return;
    }

    try {
      await saveTeamVsTeam(false);
      setLocked(false);
      navigation.navigate(ROUTES.TOURNAMENT_TEAM_VS_TEAM_PAIRINGS, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", "Could not save Team vs Team setup. Please try again.");
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader navigation={navigation} title="Team vs Team" subtitle="Build teams, rename, regenerate, then continue to pairings." />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: footerPad + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroActionsRow}>
            <Pressable
              onPress={onRegenerateTeams}
              disabled={locked || !canRenderTeams}
              style={({ pressed }) => [
                styles.actionButtonGreen,
                (locked || !canRenderTeams) && styles.actionDisabled,
                pressed && !(locked || !canRenderTeams) ? styles.pressed : null,
              ]}
            >
              <Text style={styles.actionTextGreen}>
                Regenerate{"\n"}Teams
              </Text>
            </Pressable>
          </View>

          {locked ? (
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedText}>Locked</Text>
            </View>
          ) : null}
        </View>

        {!tournamentId ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Missing tournamentId</Text>
            <Text style={styles.noticeSub}>This screen needs a tournamentId param to load/save.</Text>
          </View>
        ) : loading ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Loading…</Text>
            <Text style={styles.noticeSub}>Fetching tournament.</Text>
          </View>
        ) : !canRenderTeams ? (
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>Roster not available</Text>
            <Text style={styles.noticeSub}>
              I can’t see players here yet. Confirm players exist in tournaments/{tournamentId}/members, then return.
            </Text>
          </View>
        ) : (
          <View style={[styles.teamsWrap, isWide ? styles.teamsWide : null]}>
            <TeamCard
              side="A"
              name={teamAName}
              onCommitName={setTeamAName}
              players={teamA}
              total={totals.a}
              locked={locked}
              isWide={isWide}
            />
            <TeamCard
              side="B"
              name={teamBName}
              onCommitName={setTeamBName}
              players={teamB}
              total={totals.b}
              locked={locked}
              isWide={isWide}
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable onPress={onPrimary} style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}>
          <Text style={styles.primaryText}>Continue to pairings</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BG = "#071017";
const CARD = "#0D1A24";
const CARD2 = "#0B151E";
const TEXT = "#EAF2FF";

const GREEN_BG = "rgba(15,122,74,0.14)";
const GREEN_RING = "rgba(15,122,74,0.55)";
const GREEN_SOLID = "rgba(15,122,74,0.95)";

const GOLD_RING = "rgba(201,162,74,0.55)";
const GOLD_BG = "rgba(201,162,74,0.10)";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },

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

  heroActionsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
  },
  actionButtonGreen: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: GREEN_BG,
    borderWidth: 1,
    borderColor: GREEN_RING,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  actionTextGreen: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
    lineHeight: 14,
  },
  actionDisabled: {
    opacity: 0.45,
  },

  lockedBadge: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: GOLD_BG,
    borderWidth: 1,
    borderColor: GOLD_RING,
  },
  lockedText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
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

  teamsWrap: {
    marginTop: 12,
    gap: 12,
  },
  teamsWide: {
    flexDirection: "row",
  },

  teamCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: "rgba(201,162,74,0.40)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  teamCardWide: {
    flex: 1,
  },

  teamHeader: {
    alignItems: "center",
  },
  teamLabel: {
    color: "rgba(234,242,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },

  teamNamePress: {
    marginTop: 8,
    width: "100%",
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(201,162,74,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  teamNameText: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "900",
  },

  editWrap: {
    marginTop: 8,
    width: "100%",
    gap: 8,
  },
  teamNameInput: {
    width: "100%",
    color: TEXT,
    fontSize: 18,
    fontWeight: "900",
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: GREEN_RING,
  },
  doneButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: GREEN_BG,
    borderWidth: 1,
    borderColor: GREEN_RING,
  },
  doneText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  inputLocked: {
    opacity: 0.75,
  },

  teamTotalPill: {
    marginTop: 10,
    alignSelf: "stretch",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(201,162,74,0.10)",
    borderWidth: 1,
    borderColor: "rgba(201,162,74,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  teamTotalLabel: {
    color: "rgba(234,242,255,0.72)",
    fontSize: 11,
    fontWeight: "900",
  },
  teamTotalValue: {
    marginTop: 4,
    color: TEXT,
    fontSize: 16,
    fontWeight: "900",
  },

  teamList: {
    marginTop: 12,
    gap: 10,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.08)",
  },
  playerName: {
    flex: 1,
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
  },
  hcpPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(201,162,74,0.16)",
    borderWidth: 1,
    borderColor: "rgba(201,162,74,0.30)",
  },
  hcpText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
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
    backgroundColor: GREEN_SOLID,
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

  pressed: {
    opacity: Platform.OS === "ios" ? 0.88 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
