// src/screens/TournamentTeamVsTeamPairingsOverviewScreen.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
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
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = String(route?.params?.tournamentId || "");

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);
  const [activeRound, setActiveRound] = useState(1);

  const scrollRef = useRef(null);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      setLoading(false);
      setTournament(null);
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
      (err) => {
        setLoading(false);
        Alert.alert("Tournament error", err?.message || "Could not load tournament.");
      }
    );

    return () => unsub();
  }, [tournamentId]);

  const teamVsTeam = tournament?.teamVsTeam || null;

  const totalRounds = Math.max(
    1,
    Number(
      route?.params?.totalRounds ??
      route?.params?.roundsCount ??
      route?.params?.numRounds ??
      route?.params?.roundCount ??
      tournament?.totalRounds ??
      tournament?.roundsCount ??
      tournament?.numRounds ??
      tournament?.roundCount ??
      tournament?.settings?.totalRounds ??
      tournament?.settings?.roundsCount ??
      tournament?.settings?.numRounds ??
      tournament?.settings?.roundCount ??
      tournament?.setup?.totalRounds ??
      tournament?.setup?.roundsCount ??
      tournament?.setup?.numRounds ??
      tournament?.setup?.roundCount ??
      tournament?.event?.totalRounds ??
      tournament?.event?.roundsCount ??
      tournament?.event?.numRounds ??
      tournament?.event?.roundCount ??
      1
    ) || 1
  );

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

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldRing = isDark ? "rgba(201,162,74,0.55)" : "rgba(201,162,74,0.50)";
    const cardBorder = isDark ? "rgba(255,255,255,0.10)" : "rgba(10,15,26,0.10)";

    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    return StyleSheet.create({
      root: { flex: 1, backgroundColor: theme.bg },

      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 90 },

      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: goldRing,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      heroTitle: { color: theme.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
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
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
        alignItems: "center",
        justifyContent: "center",
      },
      roundTabActive: { backgroundColor: greenBg, borderColor: greenRing },
      roundTabText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "900", textAlign: "center" },
      roundTabTextActive: { opacity: 1 },

      notice: {
        marginTop: 12,
        borderRadius: 18,
        padding: 14,
        backgroundColor: theme.card2,
        borderWidth: 1,
        borderColor: cardBorder,
      },
      noticeTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      noticeSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "700", textAlign: "center" },

      list: { marginTop: 12, gap: 12 },

      rowCard: {
        borderRadius: 18,
        padding: 14,
        backgroundColor: theme.card2,
        borderWidth: 1,
        borderColor: goldRing,
      },
      rowLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      sideLabel: { flex: 1, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "900", textAlign: "center" },
      vs: { color: theme.text, opacity: 0.70, fontSize: 12, fontWeight: "900" },

      rowLine2: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      player: { flex: 1, color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      vs2: { color: theme.text, opacity: 0.70, fontSize: 12, fontWeight: "900" },

      teePill: {
        marginTop: 12,
        alignSelf: "center",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      teeText: { color: theme.text, opacity: 0.82, fontSize: 12, fontWeight: "900" },

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
      primary: {
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
  }, [theme, isDark, footerPad]);

  return (
    <View style={styles.root}>
      <ScreenHeader navigation={navigation} title="Pairings Overview" subtitle="Quick view of who’s playing who." />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Pairings Overview</Text>
          <Text style={styles.heroSub}>Quick view of who’s playing who.</Text>

          <View style={styles.roundTabs}>
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
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
                <Text style={styles.noticeSub}>
                  Round {activeRound === 4 ? "4 is organizer-set." : "pairings are missing."}
                </Text>
              </View>
            ) : (
              matchups.map((m) => (
                <View key={m.key} style={styles.rowCard}>
                  <View style={styles.rowLine}>
                    <Text style={styles.sideLabel} numberOfLines={1}>
                      {teamAName}
                    </Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text style={styles.sideLabel} numberOfLines={1}>
                      {teamBName}
                    </Text>
                  </View>

                  <View style={styles.rowLine2}>
                    <Text style={styles.player} numberOfLines={1}>
                      {resolveName(m.aUid)}
                    </Text>
                    <Text style={styles.vs2}>vs</Text>
                    <Text style={styles.player} numberOfLines={1}>
                      {resolveName(m.bUid)}
                    </Text>
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

      <View style={styles.footer}>
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
