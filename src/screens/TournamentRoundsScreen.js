// src/screens/TournamentRoundsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, getDocs, writeBatch } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

export default function TournamentRoundsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  // IMPORTANT: when opened from Overview, return by POP (goBack) so we don't stack Overview screens
  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [roundsText, setRoundsText] = useState("");

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
        if (existing > 0) setRoundsText(String(existing));
        else setRoundsText("");

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

  const parsedRounds = useMemo(() => {
    const cleaned = String(roundsText || "").replace(/[^\d]/g, "");
    const n = Number(cleaned || 0);
    return Number.isFinite(n) ? n : 0;
  }, [roundsText]);

  const isValid = parsedRounds >= 1 && parsedRounds <= 100;

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

      inputCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: softBorder,
        backgroundColor: theme.card2,
      },
      inputLabel: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      inputRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },
      input: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        paddingHorizontal: 16,
        borderWidth: 2,
        borderColor: softBorder,
        backgroundColor: softBg,
        color: theme.text,
        fontSize: 18,
        fontWeight: "900",
        letterSpacing: 0.4,
      },
      inputActive: { borderColor: blue, backgroundColor: blueBg },

      hint: { marginTop: 10, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

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

  async function seedRoundsDocs(roundsTotal) {
    const roundsRef = collection(db, "tournaments", tournamentId, "rounds");
    const snap = await getDocs(roundsRef);

    const existingById = new Map();
    snap.forEach((d) => existingById.set(d.id, d));

    const keepIds = new Set();
    for (let i = 1; i <= roundsTotal; i++) keepIds.add(`r${i}`);

    const batch = writeBatch(db);

    for (let i = 1; i <= roundsTotal; i++) {
      const id = `r${i}`;
      const ref = doc(db, "tournaments", tournamentId, "rounds", id);
      batch.set(
        ref,
        {
          roundNumber: i,
          roundIndex: i,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    existingById.forEach((d, id) => {
      if (!keepIds.has(id)) batch.delete(d.ref);
    });

    await batch.commit();
  }

  async function onSave() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can set up the tournament.");
      return;
    }

    if (!isValid) {
      Alert.alert("Rounds", "Enter a number of rounds between 1 and 100.");
      return;
    }

    setSaving(true);
    try {
      await seedRoundsDocs(parsedRounds);

      const patch = {
        roundsTotal: parsedRounds,
        roundsReady: true,
        updatedAt: serverTimestamp(),
      };

      if (!fromOverview) {
        patch.setupStep = "courses";
      }

      await updateDoc(doc(db, "tournaments", tournamentId), patch);

      // KEY FIX: do NOT navigate to overview (that stacks). POP back to it.
      if (fromOverview) {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate(returnTo, { tournamentId });
        return;
      }

      navigation.navigate(ROUTES.TOURNAMENT_COURSE, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save rounds.");
    } finally {
      setSaving(false);
    }
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Confirm & Continue";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Rounds"
        subtitle={fromOverview ? "Edit rounds, then return." : "Confirm today’s structure"}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>{fromOverview ? "Edit" : "Step 1"}</Text>
          <Text style={styles.heroTitle}>{loading ? "Loading..." : "How many rounds?"}</Text>
          <Text style={styles.heroSub}>
            {fromOverview
              ? "Update the number of rounds. Saving will return to the overview."
              : "Type the number of rounds. Next, you’ll confirm the course for each round."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Number of rounds</Text>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Type a number (1–100)</Text>

          <View style={styles.inputRow}>
            <TextInput
              value={roundsText}
              onChangeText={(txt) => {
                if (!isHost || saving) return;
                const cleaned = String(txt || "").replace(/[^\d]/g, "");
                setRoundsText(cleaned);
              }}
              editable={isHost && !saving}
              keyboardType="number-pad"
              returnKeyType="done"
              placeholder="e.g. 4"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(10,15,26,0.45)"}
              style={[styles.input, isHost && !saving && styles.inputActive, (!isHost || saving) && { opacity: 0.75 }]}
              maxLength={3}
            />
          </View>

          <Text style={styles.hint}>You can always return and reconfirm this later. Reducing rounds will remove extra rounds.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onSave}
          disabled={!isHost || saving || !isValid}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && styles.pressed,
            (!isHost || saving || !isValid) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : primaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
