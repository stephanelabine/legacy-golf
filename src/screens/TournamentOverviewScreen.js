// src/screens/TournamentOverviewScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, collection, getDocs } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

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

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
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
      } catch (e) {
        // Silent; overview still works without counts
      }
    }

    loadCounts();
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
  const rosterLocked = !!t?.rosterLocked;
  const formatsReady = !!t?.formatsReady;
  const courseReady = !!String(t?.courseId || "").trim() || !!t?.coursesReady;

  const checklist = [
    { key: "rounds", title: "Rounds", ready: roundsReady, route: ROUTES.TOURNAMENT_ROUNDS, hint: roundsCount ? `${roundsCount} configured` : "Set number of rounds" },
    { key: "courses", title: "Courses", ready: courseReady, route: ROUTES.TOURNAMENT_COURSE, hint: "Assign course per round" },
    { key: "tees", title: "Tees", ready: !!t?.teesReady, route: ROUTES.TOURNAMENT_TEES, hint: "Choose tees for players" },
    { key: "players", title: "Players", ready: membersCount > 0, route: ROUTES.TOURNAMENT_PLAYERS, hint: membersCount ? `${membersCount} players` : "Add players + handicaps" },
    { key: "formats", title: "Formats / Games", ready: formatsReady, route: ROUTES.TOURNAMENT_FORMATS, hint: formatsCount ? `${formatsCount} games` : "Add games + buy-ins" },
    { key: "lock", title: "Roster Lock", ready: rosterLocked, route: ROUTES.TOURNAMENT_PLAYERS, hint: rosterLocked ? "Locked" : "Lock to finalize roster" },
  ];

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const green = isDark ? "rgba(15,122,74,0.92)" : "rgba(15,122,74,0.92)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const readyBg = isDark ? "rgba(15,122,74,0.14)" : "rgba(15,122,74,0.10)";
    const readyBorder = isDark ? "rgba(15,122,74,0.38)" : "rgba(15,122,74,0.34)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 16 },

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

      sectionTitle: {
        marginTop: 10,
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

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad]);

  function openSection(r) {
    if (!tournamentId) return;
    navigation.navigate(r, { tournamentId });
  }

  if (!isHost && !loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader navigation={navigation} title="Overview" subtitle="Tournament details." />
        <View style={[styles.content, { paddingTop: 18 }]}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{name}</Text>
            <Text style={styles.heroSub}>Only the organizer can edit setup. You can view details in the tournament screens.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Overview" subtitle="Review and edit tournament setup." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : name}</Text>
          <Text style={styles.heroSub}>
            {isLive
              ? "Tournament is live. Overview is for review (editing rules will be enforced later)."
              : "Jump to any section to edit while you build. Nothing gets hidden behind setup steps."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Setup Checklist</Text>

        {checklist.map((c) => (
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
      </ScrollView>
    </View>
  );
}
