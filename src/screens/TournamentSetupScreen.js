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
  const [members, setMembers] = useState([]); // <-- use MEMBERS (single source of truth)

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

  // IMPORTANT: setup hub must reflect the real roster:
  // tournaments/{tournamentId}/members
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

  const formatsReady = !!t?.formatsReady;

  const allRequiredReady = roundsReady && !courseMissing && !teesMissing && playersReady && formatsReady;

  const nextStep = useMemo(() => {
    if (!roundsReady) return ROUTES.TOURNAMENT_ROUNDS;
    if (courseMissing) return ROUTES.TOURNAMENT_COURSE;
    if (teesMissing) return ROUTES.TOURNAMENT_TEES;
    if (!playersReady) return ROUTES.TOURNAMENT_PLAYERS_SETUP;
    if (!formatsReady) return ROUTES.TOURNAMENT_FORMATS;
    return null;
  }, [roundsReady, courseMissing, teesMissing, playersReady, formatsReady]);

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
      joinHint: { marginTop: 10, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 18 },

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
        marginTop: 8,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      stepCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      stepCardActive: { borderColor: blue, backgroundColor: blueBg },
      stepTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      stepTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      stepSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

      pill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      pillBad: { borderColor: softBorder, backgroundColor: softBg },
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

  function goNext() {
    if (!nextStep) {
      Alert.alert("Setup complete", "All steps are complete. Review/Start is next.");
      return;
    }
    go(nextStep);
  }

  function StepRow({ title, sub, ok, onPress, isNext }) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.stepCard, isNext && !ok && styles.stepCardActive, pressed && styles.pressed]}
      >
        <View style={styles.stepTop}>
          <Text style={styles.stepTitle}>{title}</Text>
          <View style={[styles.pill, !ok && styles.pillBad]}>
            <Text style={styles.pillText}>{ok ? "Complete" : "Missing"}</Text>
          </View>
        </View>
        <Text style={styles.stepSub}>{sub}</Text>
      </Pressable>
    );
  }

  const nextKey = nextStep;

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament Setup" subtitle="Edit any step anytime." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Setup</Text>
          <Text style={styles.heroTitle}>{tournamentName}</Text>
          <Text style={styles.heroSub}>This is your setup hub. Tap any step to edit, or continue where you left off.</Text>
        </View>

        <View style={styles.joinCard}>
          <Text style={styles.joinLabel}>Join code</Text>
          <Text style={styles.joinCode} selectable>
            {joinCode || "—"}
          </Text>
          <Text style={styles.joinHint}>Copy or share the code to invite players.</Text>

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

        <Text style={styles.sectionTitle}>Setup steps</Text>

        <StepRow
          title="Rounds"
          ok={roundsReady}
          isNext={nextKey === ROUTES.TOURNAMENT_ROUNDS}
          sub={roundsReady ? `Rounds set: ${roundsTotal}` : "Choose how many rounds this tournament has."}
          onPress={() => go(ROUTES.TOURNAMENT_ROUNDS)}
        />

        <StepRow
          title="Courses"
          ok={roundsReady && !courseMissing}
          isNext={nextKey === ROUTES.TOURNAMENT_COURSE}
          sub={roundsReady && !courseMissing ? "Courses assigned per round." : "Assign a course for each round."}
          onPress={() => go(ROUTES.TOURNAMENT_COURSE)}
        />

        <StepRow
          title="Tees"
          ok={roundsReady && !teesMissing}
          isNext={nextKey === ROUTES.TOURNAMENT_TEES}
          sub={roundsReady && !teesMissing ? "Tees selected per round." : "Select tees for each round."}
          onPress={() => go(ROUTES.TOURNAMENT_TEES)}
        />

        <StepRow
          title="Players"
          ok={playersReady}
          isNext={nextKey === ROUTES.TOURNAMENT_PLAYERS_SETUP}
          sub={playersReady ? `Players ready: ${members.length}` : "Add 2+ players and set handicaps for everyone."}
          onPress={() => go(ROUTES.TOURNAMENT_PLAYERS_SETUP)}
        />

        <StepRow
          title="Formats"
          ok={formatsReady}
          isNext={nextKey === ROUTES.TOURNAMENT_FORMATS}
          sub={formatsReady ? "Games/formats selected." : "Choose games and formats for the tournament."}
          onPress={() => go(ROUTES.TOURNAMENT_FORMATS)}
        />

        <StepRow
          title="Review & Start"
          ok={allRequiredReady}
          isNext={false}
          sub={allRequiredReady ? "Everything is ready. Review and start is next." : "Finish required steps first, then review and start."}
          onPress={() => Alert.alert("Coming next", "Review & Start will be the next premium step.")}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={goNext} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{nextStep ? "Continue Setup" : "Review & Start"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
