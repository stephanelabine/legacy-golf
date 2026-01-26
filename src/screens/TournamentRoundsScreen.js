// src/screens/TournamentRoundsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  writeBatch,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

export default function TournamentRoundsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState(null);

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
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setT(data);
        const existing = Number(data?.roundsTotal || 0);
        setSelected(existing > 0 ? existing : null);
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

  const styles = useMemo(() => {
    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 170 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
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

      grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

      pill: {
        width: "31%",
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      pillActive: { borderColor: blue, backgroundColor: blueBg },
      pillText: { color: theme.text, fontSize: 16, fontWeight: "900" },

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

  const options = [1, 2, 3, 4, 5, 6];

  async function seedRoundsDocs(roundsTotal) {
    // Create rounds docs r1..rN if missing, and delete extras if rounds reduced.
    const roundsRef = collection(db, "tournaments", tournamentId, "rounds");
    const snap = await getDocs(roundsRef);

    const existingById = new Map();
    snap.forEach((d) => existingById.set(d.id, d));

    const keepIds = new Set();
    for (let i = 1; i <= roundsTotal; i++) keepIds.add(`r${i}`);

    const batch = writeBatch(db);

    // Upsert needed docs
    for (let i = 1; i <= roundsTotal; i++) {
      const id = `r${i}`;
      const ref = doc(db, "tournaments", tournamentId, "rounds", id);
      batch.set(
        ref,
        {
          roundNumber: i,
          courseId: null,
          courseName: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Delete extras
    existingById.forEach((d, id) => {
      if (!keepIds.has(id)) batch.delete(d.ref);
    });

    await batch.commit();
  }

  async function onNext() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can set up the tournament.");
      return;
    }

    const n = Number(selected || 0);
    if (!n || n < 1) {
      Alert.alert("Select rounds", "Choose how many rounds this tournament has.");
      return;
    }

    setSaving(true);
    try {
      await seedRoundsDocs(n);

      await updateDoc(doc(db, "tournaments", tournamentId), {
        roundsTotal: n,
        roundsReady: true,
        setupStep: "courses",
        updatedAt: serverTimestamp(),
      });

      navigation.navigate(ROUTES.TOURNAMENT_COURSE, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save rounds.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Rounds" subtitle="Select how many rounds this tournament has." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Step 1</Text>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : "How many rounds?"}</Text>
          <Text style={styles.heroSub}>
            Pick the number of rounds. Next you’ll assign a course for each round.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Select rounds</Text>

        <View style={styles.grid}>
          {options.map((n) => {
            const active = Number(selected) === n;
            return (
              <Pressable
                key={String(n)}
                onPress={() => (isHost && !saving ? setSelected(n) : null)}
                disabled={!isHost || saving}
                style={({ pressed }) => [
                  styles.pill,
                  active && styles.pillActive,
                  pressed && isHost && !saving && styles.pressed,
                  (!isHost || saving) && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.pillText}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onNext}
          disabled={!isHost || saving || !selected}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && styles.pressed,
            (!isHost || saving || !selected) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Next"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
