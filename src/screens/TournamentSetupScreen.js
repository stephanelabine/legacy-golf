// src/screens/TournamentSetupScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { db } from "../firebase/firebase";

export default function TournamentSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [roundDocs, setRoundDocs] = useState([]);
  const [members, setMembers] = useState([]); // tournaments/{tournamentId}/members

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
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;

    const rref = collection(db, "tournaments", tournamentId, "rounds");
    const rq = query(rref, orderBy("roundIndex", "asc"));

    const unsub = onSnapshot(
      rq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRoundDocs(rows);
      },
      (err) => Alert.alert("Rounds error", err?.message || "Could not load rounds.")
    );

    return () => unsub();
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;

    const mref = collection(db, "tournaments", tournamentId, "members");
    const unsub = onSnapshot(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setMembers(rows);
      },
      (err) => Alert.alert("Players error", err?.message || "Could not load players.")
    );

    return () => unsub();
  }, [tournamentId]);

  const joinCode = String(t?.joinCode || t?.code || "").trim().toUpperCase();
  const tournamentName = String(t?.name || t?.tournamentName || "Tournament").trim();

  const roundsTotal = Math.max(1, Number(t?.roundsTotal || 1));
  const roundsReady = !!t?.roundsReady;
  const formatsReady = !!t?.formatsReady;

  const courseMissing = useMemo(() => {
    if (!roundsReady) return true;
    const byRound = new Map();
    (roundDocs || []).forEach((r) => {
      const ri = Number(r?.roundIndex || r?.id);
      if (!Number.isFinite(ri)) return;
      byRound.set(ri, String(r?.courseId || "").trim());
    });
    for (let i = 1; i <= roundsTotal; i++) {
      if (!String(byRound.get(i) || "").trim()) return true;
    }
    return false;
  }, [roundDocs, roundsReady, roundsTotal]);

  const teesMissing = useMemo(() => {
    if (!roundsReady) return true;
    const byRound = new Map();
    (roundDocs || []).forEach((r) => {
      const ri = Number(r?.roundIndex || r?.id);
      if (!Number.isFinite(ri)) return;
      byRound.set(ri, String(r?.teeCode || "").trim());
    });
    for (let i = 1; i <= roundsTotal; i++) {
      if (!String(byRound.get(i) || "").trim()) return true;
    }
    return false;
  }, [roundDocs, roundsReady, roundsTotal]);

  const missingHcpCount = useMemo(() => {
    let n = 0;
    (members || []).forEach((p) => {
      const h = p?.handicap;
      const num =
        typeof h === "number"
          ? h
          : h === null || h === undefined || h === ""
          ? NaN
          : Number(String(h).trim());
      if (!Number.isFinite(num)) n += 1;
    });
    return n;
  }, [members]);

  const playersReady = members.length >= 2 && missingHcpCount === 0;

  // “Started” signals (we show only sections that have data, per your rule)
  const coursesStarted = useMemo(() => {
    return (roundDocs || []).some((r) => String(r?.courseId || "").trim().length > 0);
  }, [roundDocs]);

  const teesStarted = useMemo(() => {
    return (roundDocs || []).some((r) => String(r?.teeCode || "").trim().length > 0);
  }, [roundDocs]);

  const playersStarted = members.length > 0;

  // If your formats are stored differently later, we can improve this “started” detector.
  const formatsStarted = !!t?.formatsReady;

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.16)";
    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const inkBtn = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 170 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 14,
      },
      heroKicker: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      joinCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: greenRing,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      joinLabel: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
        textAlign: "center",
      },
      joinCode: {
        marginTop: 10,
        color: theme.text,
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: 2.2,
        textAlign: "center",
      },
      joinHint: {
        marginTop: 10,
        color: theme.text,
        opacity: 0.7,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
        lineHeight: 18,
      },

      joinRow: { flexDirection: "row", gap: 10, marginTop: 12 },
      miniBtn: {
        flex: 1,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      miniText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

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

      card: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      cardActive: { borderColor: blue, backgroundColor: blueBg },
      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      rowTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      rowSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

      pill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },

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
        backgroundColor: inkBtn,
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad]);

  async function copyJoinCode() {
    if (!joinCode) {
      Alert.alert("No code", "This tournament does not have a join code yet.");
      return;
    }
    try {
      const Clipboard = require("expo-clipboard");
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(joinCode);
        Alert.alert("Copied", "Join code copied to clipboard.");
        return;
      }
    } catch (e) {}
    Alert.alert("Copy", "Long-press the code to copy.");
  }

  async function shareInvite() {
    if (!joinCode) {
      Alert.alert("No code", "This tournament does not have a join code yet.");
      return;
    }
    try {
      await Share.share({
        message: `You’re invited to join: ${tournamentName}\nJoin code: ${joinCode}\n\n(If you don’t have Legacy Golf yet, download it from the App Store.)`,
      });
    } catch (e) {}
  }

  function go(stepRoute) {
    navigation.navigate(stepRoute, { tournamentId });
  }

  // Phase 4.2 rule:
  // “Continue Setup” ALWAYS starts at Rounds, so the organizer re-confirms the full flow every time.
  function continueSetupFromStart() {
    go(ROUTES.TOURNAMENT_ROUNDS);
  }

  function ProgressRow({ title, sub, complete, onPress }) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle}>{title}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{complete ? "Complete" : "Saved"}</Text>
          </View>
        </View>
        <Text style={styles.rowSub}>{sub}</Text>
      </Pressable>
    );
  }

  const progressItems = useMemo(() => {
    const items = [];

    if (roundsReady) {
      items.push({
        key: "rounds",
        title: "Rounds",
        complete: true,
        sub: `Rounds set: ${roundsTotal}`,
        onPress: () => go(ROUTES.TOURNAMENT_ROUNDS),
      });
    }

    if (coursesStarted) {
      items.push({
        key: "courses",
        title: "Courses",
        complete: roundsReady && !courseMissing,
        sub: roundsReady && !courseMissing ? "Courses assigned per round." : "Courses have been started. Confirm each round.",
        onPress: () => go(ROUTES.TOURNAMENT_COURSE),
      });
    }

    if (teesStarted) {
      items.push({
        key: "tees",
        title: "Tees",
        complete: roundsReady && !teesMissing,
        sub: roundsReady && !teesMissing ? "Tees selected per round." : "Tees have been started. Confirm each round.",
        onPress: () => go(ROUTES.TOURNAMENT_TEES),
      });
    }

    if (formatsStarted) {
      items.push({
        key: "formats",
        title: "Formats",
        complete: formatsReady,
        sub: formatsReady ? "Formats selected." : "Formats have been started. Confirm selections.",
        onPress: () => go(ROUTES.TOURNAMENT_FORMATS),
      });
    }

    if (playersStarted) {
      items.push({
        key: "players",
        title: "Players",
        complete: playersReady,
        sub: playersReady
          ? `Players ready: ${members.length}`
          : `Players added: ${members.length}. Confirm handicaps for everyone.`,
        onPress: () => go(ROUTES.TOURNAMENT_PLAYERS_SETUP),
      });
    }

    return items;
  }, [
    roundsReady,
    roundsTotal,
    coursesStarted,
    teesStarted,
    formatsStarted,
    playersStarted,
    formatsReady,
    playersReady,
    members.length,
    courseMissing,
    teesMissing,
    tournamentId,
  ]);

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament Setup" subtitle="Confirm the flow from the start anytime." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Setup Home</Text>
          <Text style={styles.heroTitle}>{tournamentName}</Text>
          <Text style={styles.heroSub}>
            When you continue, you’ll confirm the setup from Round 1 so nothing gets missed.
          </Text>
        </View>

        <View style={styles.joinCard}>
          <Text style={styles.joinLabel}>Join code</Text>
          <Text style={styles.joinCode} selectable>
            {joinCode || "—"}
          </Text>
          <Text style={styles.joinHint}>Invite players when you’re ready.</Text>

          <View style={styles.joinRow}>
            <Pressable
              onPress={copyJoinCode}
              disabled={!joinCode}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed, !joinCode && { opacity: 0.6 }]}
            >
              <Text style={styles.miniText}>Copy</Text>
            </Pressable>

            <Pressable
              onPress={shareInvite}
              disabled={!joinCode}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed, !joinCode && { opacity: 0.6 }]}
            >
              <Text style={styles.miniText}>Share</Text>
            </Pressable>
          </View>
        </View>

        {progressItems.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Saved setup</Text>
            {progressItems.map((it) => (
              <ProgressRow key={it.key} title={it.title} sub={it.sub} complete={it.complete} onPress={it.onPress} />
            ))}
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Setup</Text>
            <View style={[styles.card, styles.cardActive]}>
              <Text style={styles.rowTitle}>Ready to begin</Text>
              <Text style={styles.rowSub}>Start at rounds and confirm each step in order.</Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={continueSetupFromStart} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Continue Setup</Text>
        </Pressable>
      </View>
    </View>
  );
}
