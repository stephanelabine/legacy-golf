// src/screens/TournamentDashboardScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Share, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

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
  }, [tournamentId]);

  const u = auth.currentUser;

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const rosterLocked = !!t?.rosterLocked;

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    const lockBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";
    const lockBorder = isDark ? "rgba(255, 210, 92, 0.40)" : "rgba(255, 210, 92, 0.48)";

    const dangerBg = "rgba(231,76,60,0.14)";
    const dangerBorder = "rgba(231,76,60,0.28)";

    const greenRing = isDark ? "rgba(15,122,74,0.55)" : "rgba(15,122,74,0.62)";
    const greenRingPressed = isDark ? "rgba(15,122,74,0.82)" : "rgba(15,122,74,0.86)";

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
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 22, fontWeight: "900" },
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 19,
      },
      lockPill: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: lockBg,
        borderWidth: 1,
        borderColor: lockBorder,
      },
      lockPillText: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },

      codeCard: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: blue,
        backgroundColor: blueBg,
        marginBottom: 12,
      },
      codeLabel: {
        color: theme.text,
        opacity: 0.8,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        textTransform: "uppercase",
      },
      codeValue: { marginTop: 10, color: theme.text, fontSize: 28, fontWeight: "900", letterSpacing: 4 },

      smallRow: { marginTop: 10, flexDirection: "row", gap: 10 },
      smallBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
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
        position: "relative",
        overflow: "hidden",
      },

      greenRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: greenRing,
        opacity: 0.95,
      },
      greenRingPressed: {
        borderColor: greenRingPressed,
        opacity: 0.95,
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
      primaryBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad]);

  const joinCode = (t?.joinCode || "").toUpperCase();
  const name = t?.name || "Tournament";
  const status = (t?.status || "draft").toUpperCase();
  const players = Array.isArray(t?.memberUids) ? t.memberUids.length : 1;

  const courseLine = t?.courseName ? `Selected: ${String(t.courseName)}` : "Select the course for the tournament.";
  const playersLine =
    `Roster: ${players} player${players === 1 ? "" : "s"} · Names saved in Firebase.` +
    (rosterLocked ? " · Roster locked" : "");

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

  function comingSoon(label) {
    Alert.alert(label, "Coming next: formats, rounds, and leaderboards.");
  }

  function SetupCard({ title, sub, onPress, rightTag }) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        {({ pressed }) => (
          <>
            <View pointerEvents="none" style={[styles.greenRing, pressed && styles.greenRingPressed]} />
            <Text style={styles.cardTitle}>
              {title}
              {rightTag ? `  ·  ${rightTag}` : ""}
            </Text>
            <Text style={styles.cardSub}>{sub}</Text>
          </>
        )}
      </Pressable>
    );
  }

  async function doStartNow({ lockFirst }) {
    const u2 = auth.currentUser;
    if (!u2 || !tournamentId) return;

    if (!isHost) {
      Alert.alert("Not allowed", "Only the host can start the tournament.");
      return;
    }

    const currentStatus = String(t?.status || "draft");
    if (currentStatus === "live") {
      Alert.alert("Already live", "This tournament is already started.");
      return;
    }

    setStarting(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        status: "live",
        rosterLocked: lockFirst ? true : !!t?.rosterLocked,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Start failed", e?.message || "Could not start tournament.");
    } finally {
      setStarting(false);
    }
  }

  async function startTournament() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Not allowed", "Only the host can start the tournament.");
      return;
    }

    if (!rosterLocked) {
      Alert.alert(
        "Roster not locked",
        "To prevent last-minute joiners, lock the roster before starting.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go lock it", onPress: () => navigation.navigate(ROUTES.TOURNAMENT_PLAYERS, { tournamentId }) },
          { text: "Lock & Start", style: "destructive", onPress: () => doStartNow({ lockFirst: true }) },
        ]
      );
      return;
    }

    Alert.alert("Start tournament?", "This will set the tournament to LIVE.", [
      { text: "Cancel", style: "cancel" },
      { text: "Start", style: "destructive", onPress: () => doStartNow({ lockFirst: false }) },
    ]);
  }

  async function archiveTournament() {
    if (!isHost || !tournamentId) return;

    Alert.alert(
      "Archive tournament?",
      "This hides it from your active list (you can unarchive later).",
      [
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
      ]
    );
  }

  async function deleteTournamentHard() {
    if (!isHost || !tournamentId) return;

    Alert.alert(
      "Delete tournament?",
      "This is permanent. It will remove the tournament and its roster.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            Alert.alert(
              "Confirm delete",
              "Last check — delete this tournament permanently?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete permanently",
                  style: "destructive",
                  onPress: async () => {
                    setAdminBusy(true);
                    try {
                      // delete members subcollection docs (small rosters only)
                      const msnap = await getDocs(collection(db, "tournaments", tournamentId, "members"));
                      const deletes = [];
                      msnap.forEach((d) => deletes.push(deleteDoc(d.ref)));
                      await Promise.all(deletes);

                      // delete tournament doc
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
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament" subtitle="Manage your tournament in one place." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Dashboard · {status}</Text>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : name}</Text>
          <Text style={styles.heroSub}>Players: {players} · Synced in Firebase across devices.</Text>
          {rosterLocked ? (
            <View style={styles.lockPill}>
              <Text style={styles.lockPillText}>ROSTER LOCKED</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Join Code</Text>
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

        <Text style={styles.sectionTitle}>Setup</Text>

        <SetupCard title="Course" sub={courseLine} onPress={() => navigation.navigate(ROUTES.TOURNAMENT_COURSE, { tournamentId })} />

        <SetupCard
          title="Players"
          sub={playersLine}
          onPress={() => navigation.navigate(ROUTES.TOURNAMENT_PLAYERS, { tournamentId })}
          rightTag={rosterLocked ? "LOCKED" : null}
        />

        <SetupCard
          title="Formats / Games"
          sub="Attach skins, KP’s, stableford, and more to the tournament."
          onPress={() => comingSoon("Formats / Games")}
        />

        <SetupCard
          title="Rounds"
          sub="Add rounds, start Round 1, and manage day-to-day scoring."
          onPress={() => comingSoon("Rounds")}
        />

        <SetupCard title="Leaderboard" sub="Live tournament standings (coming soon)." onPress={() => comingSoon("Leaderboard")} />

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
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={startTournament}
          disabled={starting || adminBusy || loading || !t || !isHost}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && styles.pressed,
            (starting || adminBusy || loading || !t || !isHost) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>
            {!isHost ? "Host Only" : starting ? "Starting..." : rosterLocked ? "Start Tournament" : "Start (Lock Required)"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
