import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, collection, getDocs, updateDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function safeStr(x) {
  return String(x ?? "");
}

function parseTeeTimeToMinutes(teeTime) {
  const s = String(teeTime || "").trim().toUpperCase();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)$/);
  if (!m) return null;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3];

  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  if (hh < 1 || hh > 12) return null;
  if (mm < 0 || mm > 59) return null;

  if (hh === 12) hh = 0;
  let minutes = hh * 60 + mm;
  if (ap === "PM") minutes += 12 * 60;
  return minutes;
}

function getPlayerId(p) {
  return String(p?.uid || p?.id || p?._id || "");
}
function getPlayerName(p) {
  return String(p?.name || p?.displayName || p?.fullName || p?.email || "Player");
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveFormatBuyIn(docData) {
  if (!docData || typeof docData !== "object") return 0;

  const candidates = [
    docData.entryFee,
    docData.buyIn,
    docData.buyInAmount,
    docData.amountPerPlayer,
    docData.perPlayer,
    docData.cost,
    docData.price,
    docData.amount,
  ];

  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "$0.00";
  return `$${x.toFixed(2)}`;
}

export default function TournamentOverviewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);

  const [membersCount, setMembersCount] = useState(0);
  const [roundsCount, setRoundsCount] = useState(0);
  const [formatsCount, setFormatsCount] = useState(0);
  const [costPerPlayer, setCostPerPlayer] = useState(0);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setT(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        Alert.alert("Tournament error", err?.message || "Could not load tournament.");
      }
    );

    return () => unsub();
  }, [tournamentId, navigation]);

  useEffect(() => {
    let cancelled = false;

    async function loadCountsAndPool() {
      if (!tournamentId) return;

      try {
        const [mSnap, rSnap, fSnap] = await Promise.all([
          getDocs(collection(db, "tournaments", tournamentId, "members")),
          getDocs(collection(db, "tournaments", tournamentId, "rounds")),
          getDocs(collection(db, "tournaments", tournamentId, "formats")),
        ]);

        if (cancelled) return;

        setMembersCount(mSnap.size || 0);
        setRoundsCount(rSnap.size || 0);
        setFormatsCount(fSnap.size || 0);

        let sum = 0;
        fSnap.forEach((d) => {
          sum += resolveFormatBuyIn(d.data());
        });
        setCostPerPlayer(sum);
      } catch (e) {
        // silent
      }
    }

    loadCountsAndPool();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  const u = auth.currentUser;

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const name = String(t?.name || "Tournament");
  const statusRaw = String(t?.status || "draft");
  const isLive = statusRaw === "live";

  const roundsReady = !!t?.roundsReady;
  const teesReady = !!t?.teesReady;

  // be tolerant of naming (some older docs used formatsReady, newer used formatsSelected)
  const formatsReady = !!t?.formatsSelected || !!t?.formatsReady;

  const poolsReady = !!t?.poolsReady;

  // Course is considered ready if Round 1 courseId exists OR coursesReady is set true
  const courseReady = !!String(t?.courseId || "").trim() || !!t?.coursesReady;

  const playersReady = membersCount > 0;

  // now includes poolsReady
  const setupReady = roundsReady && courseReady && teesReady && playersReady && formatsReady && poolsReady;

  const teamVsTeam = t?.teamVsTeam || null;

  const teamAName = safeStr(teamVsTeam?.teamAName || "Team A");
  const teamBName = safeStr(teamVsTeam?.teamBName || "Team B");

  const playersById = useMemo(() => {
    const m = new Map();
    const a = Array.isArray(teamVsTeam?.teamA) ? teamVsTeam.teamA : [];
    const b = Array.isArray(teamVsTeam?.teamB) ? teamVsTeam.teamB : [];
    for (const p of [...a, ...b]) {
      const id = getPlayerId(p);
      if (id) m.set(id, p);
    }
    return m;
  }, [teamVsTeam]);

  const resolveName = (uid) => {
    const key = String(uid || "");
    if (!key) return "—";
    const p = playersById.get(key);
    return p ? getPlayerName(p) : "—";
  };

  const round1MatchupsSorted = useMemo(() => {
    const raw = teamVsTeam?.pairingsByRound;
    let list = [];
    if (raw && typeof raw === "object") {
      const bucket = raw?.["1"];
      const rows = Array.isArray(bucket?.matchups) ? bucket.matchups : [];
      list = rows;
    } else {
      list = Array.isArray(teamVsTeam?.matchups) ? teamVsTeam.matchups : [];
    }

    const mapped = list.map((m, idx) => {
      const teeTime = safeStr(m?.teeTime || "");
      const minutes = parseTeeTimeToMinutes(teeTime);
      return {
        key: String(idx),
        aUid: String(m?.aUid || ""),
        bUid: String(m?.bUid || ""),
        teeTime,
        minutes,
      };
    });

    mapped.sort((x, y) => {
      const ax = x.minutes;
      const ay = y.minutes;
      const xValid = Number.isFinite(ax);
      const yValid = Number.isFinite(ay);
      if (xValid && yValid) return ax - ay;
      if (xValid && !yValid) return -1;
      if (!xValid && yValid) return 1;
      return x.key.localeCompare(y.key);
    });

    return mapped;
  }, [teamVsTeam]);

  const totalPot = useMemo(() => {
    return numOrZero(costPerPlayer) * numOrZero(membersCount);
  }, [costPerPlayer, membersCount]);

  const cards = useMemo(() => {
    return [
      {
        key: "rounds",
        title: "Rounds",
        ready: roundsReady,
        route: ROUTES.TOURNAMENT_ROUNDS,
        hint: roundsCount ? `${roundsCount} configured` : "Set number of rounds",
      },
      {
        key: "courses",
        title: "Courses",
        ready: courseReady,
        route: ROUTES.TOURNAMENT_COURSE,
        hint: "Assign course per round",
      },
      {
        key: "tees",
        title: "Tees",
        ready: teesReady,
        route: ROUTES.TOURNAMENT_TEES,
        hint: "Choose tees for players",
      },
      {
        key: "players",
        title: "Players",
        ready: playersReady,
        route: ROUTES.TOURNAMENT_PLAYERS,
        hint: membersCount ? `${membersCount} players` : "Add players + handicaps",
      },
      {
        key: "formats",
        title: "Formats / Games",
        ready: formatsReady,
        route: ROUTES.TOURNAMENT_FORMATS,
        hint: formatsCount ? `${formatsCount} games selected` : "Add games + buy-ins",
      },
      {
        key: "pools",
        title: "Money Pools",
        ready: poolsReady,
        route: ROUTES.TOURNAMENT_FORMAT_POOLS,
        hint: poolsReady ? "Pools configured" : "Set buy-ins for each game",
      },
    ];
  }, [roundsReady, roundsCount, courseReady, teesReady, playersReady, membersCount, formatsReady, formatsCount, poolsReady]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const green = isDark ? "rgba(15,122,74,0.92)" : "rgba(15,122,74,0.92)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const readyBg = isDark ? "rgba(15,122,74,0.14)" : "rgba(15,122,74,0.10)";
    const readyBorder = isDark ? "rgba(15,122,74,0.38)" : "rgba(15,122,74,0.34)";

    const goldBorder = isDark ? "rgba(201,162,74,0.55)" : "rgba(201,162,74,0.48)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 90 },

      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: isLive ? green : blue,
        backgroundColor: isLive ? greenBg : blueBg,
        marginBottom: 12,
      },
      heroTitle: { color: theme.text, fontSize: 22, fontWeight: "900" },
      heroSub: { marginTop: 6, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      helper: { marginTop: 10, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "700", lineHeight: 16 },

      sectionTitle: {
        marginTop: 12,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      item: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 10,
      },
      itemReady: { borderColor: readyBorder, backgroundColor: readyBg },

      row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      left: { flex: 1 },
      title: { color: theme.text, fontSize: 15, fontWeight: "900" },
      hint: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      badge: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
      },
      badgeText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },

      poolCard: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: theme.card2,
        marginBottom: 10,
      },
      poolTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      poolLabel: { color: theme.text, fontSize: 14, fontWeight: "900" },
      poolValue: { color: theme.text, fontSize: 16, fontWeight: "900" },
      poolSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "700", lineHeight: 16 },

      pairingsCard: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: theme.card2,
        marginBottom: 10,
      },
      pairingRow: { marginTop: 10, borderRadius: 14, padding: 12, backgroundColor: softBg, borderWidth: 1, borderColor: softBorder },
      pairingTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      teePill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
      },
      teeText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },
      pairingTeams: { marginTop: 8, color: theme.text, opacity: 0.86, fontSize: 12, fontWeight: "900" },
      pairingPlayers: { marginTop: 6, color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "700", lineHeight: 16 },

      footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: footerPad,
        paddingTop: 12,
        backgroundColor: theme.bg,
        borderTopWidth: 1,
        borderTopColor: theme.divider,
      },
      primaryBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
      disabled: { opacity: 0.6 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad, isLive]);

  function openSection(r) {
    if (!tournamentId) return;

    navigation.navigate(r, {
      tournamentId,
      fromOverview: true,
      returnTo: ROUTES.TOURNAMENT_OVERVIEW,
    });
  }

  function showMissingChecklist() {
    const missing = [];
    if (!roundsReady) missing.push("Rounds");
    if (!courseReady) missing.push("Courses");
    if (!teesReady) missing.push("Tees");
    if (!playersReady) missing.push("Players");
    if (!formatsReady) missing.push("Formats / Games");
    if (!poolsReady) missing.push("Money Pools");

    Alert.alert("Tournament not ready", `To continue, please complete:\n\n• ${missing.join("\n• ")}`, [{ text: "OK", style: "cancel" }]);
  }

  function goToPayouts() {
    if (!tournamentId) return;
    if (!isHost) return;

    if (!setupReady) {
      showMissingChecklist();
      return;
    }

    navigation.navigate(ROUTES.TOURNAMENT_PAYOUTS, { tournamentId });
  }

  if (!isHost && !loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader navigation={navigation} title="Overview" subtitle="Tournament details." />
        <View style={[styles.content, { paddingTop: 18 }]}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{name}</Text>
            <Text style={styles.heroSub}>Only the organizer can edit setup.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Overview" subtitle="Review the tournament setup." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : name}</Text>
          <Text style={styles.heroSub}>
            {isLive ? "Tournament is live." : "Tap any section to edit. Each section will save and return here."}
          </Text>
          {!isLive ? <Text style={styles.helper}>When you continue, you’ll review payouts and then start the tournament.</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Prize Pool</Text>
        <View style={styles.poolCard}>
          <View style={styles.poolTop}>
            <Text style={styles.poolLabel}>Cost per player</Text>
            <Text style={styles.poolValue}>{money(costPerPlayer)}</Text>
          </View>
          <Text style={styles.poolSub}>
            Total pot estimate: {money(totalPot)} ({membersCount || 0} players)
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Tournament Summary</Text>

        {cards.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => openSection(c.route)}
            style={({ pressed }) => [styles.item, c.ready && styles.itemReady, pressed && styles.pressed]}
          >
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.title}>{c.title}</Text>
                <Text style={styles.hint}>{c.hint}</Text>
              </View>

              <View style={styles.badge}>
                <Text style={styles.badgeText}>{c.ready ? "Done" : "Edit"}</Text>
              </View>
            </View>
          </Pressable>
        ))}



        {teamVsTeam ? (
          <>
            <Text style={styles.sectionTitle}>Team vs Team Pairings</Text>
            <View style={styles.pairingsCard}>
              <Text style={styles.poolLabel}>Round 1 (sorted by tee time)</Text>
              <Text style={styles.poolSub}>Earliest tee time appears first. Missing tee times appear last.</Text>

              {round1MatchupsSorted.length === 0 ? (
                <View style={[styles.pairingRow, { marginTop: 12 }]}>
                  <Text style={styles.pairingPlayers}>No pairings found for Round 1.</Text>
                </View>
              ) : (
                round1MatchupsSorted.map((m) => (
                  <View key={m.key} style={styles.pairingRow}>
                    <View style={styles.pairingTop}>
                      <View style={styles.teePill}>
                        <Text style={styles.teeText}>{m.teeTime ? m.teeTime : "Tee time: —"}</Text>
                      </View>
                      <Text style={styles.pairingTeams}>
                        {teamAName} vs {teamBName}
                      </Text>
                    </View>

                    <Text style={styles.pairingPlayers}>
                      {resolveName(m.aUid)} vs {resolveName(m.bUid)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : null}

        <View style={{ height: 18 }} />
      </ScrollView>

      {!isLive ? (
        <View style={styles.footer}>
          <Pressable
            onPress={goToPayouts}
            disabled={!setupReady || !isHost}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && setupReady && isHost && styles.pressed,
              (!setupReady || !isHost) && styles.disabled,
            ]}
          >
            <Text style={styles.primaryText}>Continue to tournament payouts</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
