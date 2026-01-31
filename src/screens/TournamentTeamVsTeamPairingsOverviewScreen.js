// src/screens/TournamentTeamVsTeamPairingsOverviewScreen.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

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

export default function TournamentTeamVsTeamPairingsOverviewScreen({ navigation, route }) {
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

  const byRound = useMemo(() => {
    const raw = teamVsTeam?.pairingsByRound;
    if (raw && typeof raw === "object") return raw;

    // legacy fallback: treat as round 1
    const legacy = Array.isArray(teamVsTeam?.matchups) ? teamVsTeam.matchups : [];
    return { "1": { matchups: legacy } };
  }, [teamVsTeam]);

  const matchups = useMemo(() => {
    const bucket = byRound?.[String(activeRound)];
    const rows = Array.isArray(bucket?.matchups) ? bucket.matchups : [];
    return rows.map((m, idx) => ({
      key: String(idx),
      aUid: String(m?.aUid || ""),
      bUid: String(m?.bUid || ""),
      teeTime: safeStr(m?.teeTime || ""),
    }));
  }, [byRound, activeRound]);

  const canRender = !!tournamentId && !loading && !!teamVsTeam;

  const onRoundPress = (r) => {
    setActiveRound(r);
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }));
  };

  const onContinue = () => {
    navigation.navigate(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 110 + Math.max(insets.bottom, 10) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Pairings Overview</Text>
          <Text style={styles.heroSub}>Quick view of who’s playing who.</Text>

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
                  <Text style={[styles.roundTabText, active ? styles.roundTabTextActive : null]}>
                    Round {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
          <View style={styles.list}>
            {matchups.length === 0 ? (
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>No pairings for Round {activeRound}</Text>
                <Text style={styles.noticeSub}>Round {activeRound === 4 ? "4 is organizer-set." : "pairings are missing."}</Text>
              </View>
            ) : (
              matchups.map((m) => (
                <View key={m.key} style={styles.rowCard}>
                  <View style={styles.rowLine}>
                    <Text style={styles.sideLabel} numberOfLines={1}>{teamAName}</Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text style={styles.sideLabel} numberOfLines={1}>{teamBName}</Text>
                  </View>

                  <View style={styles.rowLine2}>
                    <Text style={styles.player} numberOfLines={1}>{resolveName(m.aUid)}</Text>
                    <Text style={styles.vs2}>vs</Text>
                    <Text style={styles.player} numberOfLines={1}>{resolveName(m.bUid)}</Text>
                  </View>

                  {m.teeTime ? (
                    <View style={styles.teePill}>
                      <Text style={styles.teeText}>Tee time: {m.teeTime}</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 18 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable
          onPress={onContinue}
          disabled={!canRender}
          style={({ pressed }) => [
            styles.primary,
            !canRender ? styles.disabled : null,
            pressed && canRender ? styles.pressed : null,
          ]}
        >
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const BG = "#071017";
const CARD = "#0D1A24";
const CARD2 = "#0B151E";
const TEXT = "#EAF2FF";

const GREEN_RING = "rgba(15,122,74,0.55)";
const GREEN_SOLID = "rgba(15,122,74,0.95)";

const GOLD_RING = "rgba(201,162,74,0.55)";

const styles = StyleSheet.create({
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
  heroTitle: { color: TEXT, fontSize: 24, fontWeight: "900", textAlign: "center" },
  heroSub: {
    marginTop: 8,
    color: "rgba(234,242,255,0.76)",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },

  roundTabs: { marginTop: 14, flexDirection: "row", gap: 8 },
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
    backgroundColor: "rgba(15,122,74,0.14)",
    borderColor: GREEN_RING,
  },
  roundTabText: { color: "rgba(234,242,255,0.78)", fontSize: 12, fontWeight: "900", textAlign: "center" },
  roundTabTextActive: { color: TEXT },

  notice: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  noticeTitle: { color: TEXT, fontSize: 14, fontWeight: "900", textAlign: "center" },
  noticeSub: { marginTop: 6, color: "rgba(234,242,255,0.72)", fontSize: 12, fontWeight: "700", textAlign: "center" },

  list: { marginTop: 12, gap: 12 },

  rowCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(201,162,74,0.40)",
  },
  rowLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideLabel: { flex: 1, color: "rgba(234,242,255,0.72)", fontSize: 12, fontWeight: "900", textAlign: "center" },
  vs: { color: "rgba(234,242,255,0.70)", fontSize: 12, fontWeight: "900" },

  rowLine2: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  player: { flex: 1, color: TEXT, fontSize: 14, fontWeight: "900", textAlign: "center" },
  vs2: { color: "rgba(234,242,255,0.70)", fontSize: 12, fontWeight: "900" },

  teePill: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  teeText: { color: "rgba(234,242,255,0.80)", fontSize: 12, fontWeight: "900" },

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
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  disabled: { opacity: 0.5 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.88 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
