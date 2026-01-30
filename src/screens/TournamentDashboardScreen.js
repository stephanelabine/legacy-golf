// src/screens/TournamentDashboardScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Share, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc, collection, getDocs } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

export default function TournamentDashboardScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [beginBusy, setBeginBusy] = useState(false);

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

  const u = auth.currentUser;

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const joinCode = (t?.joinCode || "").toUpperCase();
  const name = t?.name || "Tournament";

  const statusRaw = String(t?.status || "draft");
  const isLive = statusRaw === "live";

  const setupStep = String(t?.setupStep || "welcome"); // welcome | rounds | courses | players | formats | tees | review | done
  const roundsReady = !!t?.roundsReady;
  const rosterLocked = !!t?.rosterLocked;
  const formatsReady = !!t?.formatsReady;

  const courseReady = !!String(t?.courseId || "").trim() || !!t?.coursesReady;

  const setupReady = roundsReady && rosterLocked && formatsReady && courseReady;

  const inWelcome = !isLive && setupStep === "welcome";
  const setupInProgress = !isLive && !setupReady && setupStep !== "welcome";
  const showOverview = isLive || setupReady;

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const green = isDark ? "rgba(15,122,74,0.92)" : "rgba(15,122,74,0.92)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const dangerBg = "rgba(231,76,60,0.14)";
    const dangerBorder = "rgba(231,76,60,0.28)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 90 },

      welcomeKicker: {
        color: theme.text,
        fontSize: 16,
        fontWeight: "900",
        letterSpacing: 2.0,
        opacity: 0.78,
        textTransform: "uppercase",
        marginBottom: 10,
        textAlign: "center",
      },

      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: green,
        backgroundColor: greenBg,
        marginBottom: 12,
        alignItems: "center",
      },

      heroTitle: { color: theme.text, fontSize: 26, fontWeight: "900", textAlign: "center" },
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
        textAlign: "center",
      },

      progressPill: {
        marginTop: 12,
        alignSelf: "center",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      progressPillText: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2, opacity: 0.9 },

      heroBtn: {
        marginTop: 12,
        height: 52,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
        alignSelf: "stretch",
      },
      heroBtnText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

      codeCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: blue,
        backgroundColor: blueBg,
        marginBottom: 12,
        alignItems: "center",
      },
      codeLabel: {
        color: theme.text,
        opacity: 0.8,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        textAlign: "center",
      },
      codeValue: {
        marginTop: 8,
        color: theme.text,
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: 4,
        textAlign: "center",
      },

      smallRow: { marginTop: 10, flexDirection: "row", gap: 10, alignSelf: "stretch" },
      smallBtn: {
        flex: 1,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      smallBtnText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },

      sectionTitle: {
        marginTop: 14,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      card: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      cardTitle: { color: theme.text, fontSize: 17, fontWeight: "900" },
      cardSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      adminRow: { flexDirection: "row", gap: 10, marginTop: 10 },
      adminBtn: {
        flex: 1,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      adminBtnText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
      adminBtnDanger: { backgroundColor: dangerBg, borderColor: dangerBorder },

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

      // FULL-WIDTH STACKED BUTTONS
      footerRow: { flexDirection: "column", gap: 10 },

      footerBtn: {
        width: "100%",
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      },

      primaryBtn: { backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)" },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      // Match the soft "status pill" look
      secondaryBtn: { backgroundColor: blueBg, borderWidth: 1, borderColor: blue },

      secondaryText: {
        color: theme.text,
        fontSize: 15,
        fontWeight: "900",
        letterSpacing: 0.2,
        textAlign: "center",
        includeFontPadding: false,
        textAlignVertical: "center",
      },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad]);

  async function shareInvite() {
    if (!joinCode) return;

    const message =
      `Legacy Golf Tournament Invite\n\n` +
      `Tournament: ${name}\n` +
      `Join code: ${joinCode}\n\n` +
      `Open Legacy Golf → Games → Tournaments → Join with Code → enter: ${joinCode}`;

    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Share failed", e?.message || "Could not open share sheet.");
    }
  }

  async function copyCode() {
    try {
      const { setStringAsync } = await import("expo-clipboard");
      if (!joinCode) return;
      await setStringAsync(joinCode);
      Alert.alert("Copied", "Join code copied.");
    } catch (e) {
      Alert.alert("Copy failed", e?.message || "Could not copy join code.");
    }
  }

  async function beginSetup() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can begin tournament setup.");
      return;
    }

    setBeginBusy(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "rounds",
        updatedAt: serverTimestamp(),
      });
      navigation.navigate(ROUTES.TOURNAMENT_ROUNDS, { tournamentId });
    } catch (e) {
      Alert.alert("Begin failed", e?.message || "Could not begin setup.");
    } finally {
      setBeginBusy(false);
    }
  }

  function showMissingChecklist() {
    const missing = [];
    if (!roundsReady) missing.push("Rounds");
    if (!courseReady) missing.push("Round Courses");
    if (!rosterLocked) missing.push("Roster Lock");
    if (!formatsReady) missing.push("Formats / Games");

    Alert.alert("Tournament not ready", `To start, please complete:\n\n• ${missing.join("\n• ")}`, [{ text: "OK", style: "cancel" }]);
  }

  async function doStartNow() {
    if (!isHost || !tournamentId) return;

    if (!setupReady) {
      showMissingChecklist();
      return;
    }

    setStarting(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        status: "live",
        startedAt: serverTimestamp(),
        setupStep: "done",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Start failed", e?.message || "Could not start tournament.");
    } finally {
      setStarting(false);
    }
  }

  async function startTournament() {
    if (!isHost || !tournamentId) return;

    if (!setupReady) {
      showMissingChecklist();
      return;
    }

    Alert.alert("Start tournament?", "This will set the tournament to LIVE.", [
      { text: "Cancel", style: "cancel" },
      { text: "Start", style: "destructive", onPress: doStartNow },
    ]);
  }

  async function restartSetupFromRounds() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "The host is setting this tournament up.");
      return;
    }
    if (beginBusy || starting || adminBusy || loading) return;

    setBeginBusy(true);
    try {
      // Force replay from rounds (never resume mid-flow)
      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "rounds",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      // Non-blocking: still navigate so the host can continue setup
    } finally {
      setBeginBusy(false);
    }

    navigation.navigate(ROUTES.TOURNAMENT_ROUNDS, { tournamentId });
  }

  async function continueSetup() {
    await restartSetupFromRounds();
  }

  async function archiveTournament() {
    if (!isHost || !tournamentId) return;

    Alert.alert("Archive tournament?", "This hides it from your active list (you can unarchive later).", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Archive",
        style: "destructive",
        onPress: async () => {
          setAdminBusy(true);
          try {
            await updateDoc(doc(db, "tournaments", tournamentId), {
              archivedAt: serverTimestamp(),
              status: "archived",
              updatedAt: serverTimestamp(),
            });
            Alert.alert("Archived", "Tournament archived.");
            navigation.goBack();
          } catch (e) {
            Alert.alert("Archive failed", e?.message || "Could not archive tournament.");
          } finally {
            setAdminBusy(false);
          }
        },
      },
    ]);
  }

  async function deleteTournamentHard() {
    if (!isHost || !tournamentId) return;

    Alert.alert("Delete tournament?", "This is permanent. It will remove the tournament and its data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          Alert.alert("Confirm delete", "Last check — delete this tournament permanently?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete permanently",
              style: "destructive",
              onPress: async () => {
                setAdminBusy(true);
                try {
                  const msnap = await getDocs(collection(db, "tournaments", tournamentId, "members"));
                  const mdeletes = [];
                  msnap.forEach((d) => mdeletes.push(deleteDoc(d.ref)));
                  await Promise.all(mdeletes);

                  const fsnap = await getDocs(collection(db, "tournaments", tournamentId, "formats"));
                  const fdeletes = [];
                  fsnap.forEach((d) => fdeletes.push(deleteDoc(d.ref)));
                  await Promise.all(fdeletes);

                  const rsnap = await getDocs(collection(db, "tournaments", tournamentId, "rounds"));
                  const rdeletes = [];
                  rsnap.forEach((d) => rdeletes.push(deleteDoc(d.ref)));
                  await Promise.all(rdeletes);

                  await deleteDoc(doc(db, "tournaments", tournamentId));

                  Alert.alert("Deleted", "Tournament deleted.");
                  navigation.goBack();
                } catch (e) {
                  Alert.alert("Delete failed", e?.message || "Could not delete tournament.");
                } finally {
                  setAdminBusy(false);
                }
              },
            },
          ]);
        },
      },
    ]);
  }

  async function footerContinue() {
    if (!t || loading) return;
    if (!isHost) return;

    if (isLive) {
      navigation.navigate(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId });
      return;
    }

    // Always replay setup from rounds (never resume mid-flow)
    await restartSetupFromRounds();
  }

  const heroSubtitle = useMemo(() => {
    if (!isHost) return "Invite players with the code below.";
    if (inWelcome) return "Invite players with the code below, then continue setup.";
    if (setupInProgress) return "Invite players with the code below, then continue setup.";
    if (setupReady && !isLive) return "Invite players with the code below. Setup is complete.";
    if (isLive) return "Invite players with the code below. Tournament is live.";
    return "Invite players with the code below.";
  }, [isHost, inWelcome, setupInProgress, setupReady, isLive]);

  const primaryLabel = (() => {
    if (!t) return "Loading...";
    if (!isHost) return "Host Only";
    if (beginBusy) return "Working...";
    if (inWelcome) return "Continue Setup";
    if (setupInProgress) return "Continue Setup";
    if (setupReady && !isLive) return starting ? "Starting..." : "Start Tournament";
    if (isLive) return "Tournament Live";
    return "Continue Setup";
  })();

  const primaryAction = (() => {
    if (!t) return null;
    if (!isHost) return null;
    if (inWelcome) return beginSetup;
    if (setupInProgress) return continueSetup;
    if (setupReady && !isLive) return startTournament;
    return continueSetup;
  })();

  const primaryDisabled = beginBusy || starting || adminBusy || loading || !t || !isHost || (isHost && isLive);

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament" subtitle="Setup, invite, and run your tournament." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.welcomeKicker}>Welcome to</Text>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : name}</Text>
          <Text style={styles.heroSub}>{heroSubtitle}</Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Invite Players (Join Code)</Text>
          <Text style={styles.codeValue}>{joinCode || "—"}</Text>

          <View style={styles.smallRow}>
            <Pressable onPress={shareInvite} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Text style={styles.smallBtnText}>Share Invite</Text>
            </Pressable>

            <Pressable onPress={copyCode} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Text style={styles.smallBtnText}>Copy Code</Text>
            </Pressable>
          </View>
        </View>

        {showOverview ? (
          <>
            <Text style={styles.sectionTitle}>Tournament Overview</Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Setup complete</Text>
              <Text style={styles.cardSub}>
                This tournament is ready. Next: start the tournament, then we’ll show live standings and side-game winners.
              </Text>
            </View>

            {isHost ? (
              <>
                <Text style={styles.sectionTitle}>Host Admin</Text>

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Tournament Admin</Text>
                  <Text style={styles.cardSub}>Archive to hide it, or delete permanently.</Text>

                  <View style={styles.adminRow}>
                    <Pressable
                      onPress={archiveTournament}
                      disabled={adminBusy}
                      style={({ pressed }) => [styles.adminBtn, pressed && styles.pressed, adminBusy && { opacity: 0.7 }]}
                    >
                      <Text style={styles.adminBtnText}>{adminBusy ? "Working..." : "Archive"}</Text>
                    </Pressable>

                    <Pressable
                      onPress={deleteTournamentHard}
                      disabled={adminBusy}
                      style={({ pressed }) => [
                        styles.adminBtn,
                        styles.adminBtnDanger,
                        pressed && styles.pressed,
                        adminBusy && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.adminBtnText}>{adminBusy ? "Working..." : "Delete"}</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {isHost ? (
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId })}
              style={({ pressed }) => [styles.footerBtn, styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>Tournament Overview</Text>
            </Pressable>

            <Pressable
              onPress={footerContinue}
              style={({ pressed }) => [styles.footerBtn, styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
