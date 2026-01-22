// src/screens/TournamentDashboardScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Share, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

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

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    // Green separation ring (subtle, premium)
    const greenRing = isDark ? "rgba(15,122,74,0.55)" : "rgba(15,122,74,0.62)";
    const greenRingPressed = isDark ? "rgba(15,122,74,0.82)" : "rgba(15,122,74,0.86)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140 },

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

      // Cards
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

      // Green separation ring overlay
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

  function comingSoon(label) {
    Alert.alert(label, "Coming next: course selection, player management, formats, rounds, and leaderboards.");
  }

  function SetupCard({ title, sub, onPress }) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        {({ pressed }) => (
          <>
            <View pointerEvents="none" style={[styles.greenRing, pressed && styles.greenRingPressed]} />
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSub}>{sub}</Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament" subtitle="Manage your tournament in one place." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Dashboard · {status}</Text>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : name}</Text>
          <Text style={styles.heroSub}>
            Players: {players} · This tournament is synced in Firebase, so it stays available across devices.
          </Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Join Code</Text>
          <Text style={styles.codeValue}>{joinCode || "—"}</Text>

          <View style={styles.smallRow}>
            <Pressable onPress={shareInvite} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Text style={styles.smallBtnText}>Share Invite</Text>
            </Pressable>

            <Pressable onPress={() => comingSoon("Copy Code")} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
              <Text style={styles.smallBtnText}>Copy (next)</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Setup</Text>

        <SetupCard
          title="Course"
          sub="Select the course for the tournament. Later: tees per player."
          onPress={() => comingSoon("Course")}
        />

        <SetupCard
          title="Players"
          sub="Add players (Buddy List integration next). Manage groups and pairings later."
          onPress={() => comingSoon("Players")}
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

        <SetupCard
          title="Leaderboard"
          sub="Live tournament standings (coming soon)."
          onPress={() => comingSoon("Leaderboard")}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={() => comingSoon("Start Tournament")} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Start Tournament (next)</Text>
        </Pressable>
      </View>
    </View>
  );
}
