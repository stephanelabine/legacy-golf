// src/screens/TournamentRoundsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

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

  const [roundsText, setRoundsText] = useState("1");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const u = auth.currentUser;

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
        setLoading(false);
        const rt = Number(data?.roundsTotal || 1);
        setRoundsText(String(rt));
      },
      (err) => {
        setLoading(false);
        Alert.alert("Tournament error", err?.message || "Could not load tournament.");
      }
    );

    return () => unsub();
  }, [tournamentId]);

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const roundsReady = !!t?.roundsReady;

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 160 },

      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
      },
      heroTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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

      input: {
        marginTop: 14,
        height: 56,
        borderRadius: 18,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 18,
        fontWeight: "900",
      },

      pill: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: blueBg,
        borderWidth: 1,
        borderColor: blue,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900" },

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
        backgroundColor: blue,
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      secondaryBtn: {
        marginTop: 10,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
    });
  }, [theme, isDark, footerPad]);

  async function saveRounds() {
    if (!tournamentId || !isHost) return;

    const n = Number(String(roundsText || "").trim());
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      Alert.alert("Invalid rounds", "Enter a number between 1 and 10.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        roundsTotal: n,
        roundsReady: true,
        updatedAt: serverTimestamp(),
      });
      Keyboard.dismiss();
      Alert.alert("Saved", "Rounds set.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save rounds.");
    } finally {
      setSaving(false);
    }
  }

  async function clearRoundsReady() {
    if (!tournamentId || !isHost) return;

    Alert.alert("Mark not ready?", "This will block Start Tournament until rounds are set again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark not ready",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await updateDoc(doc(db, "tournaments", tournamentId), {
              roundsReady: false,
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            Alert.alert("Update failed", e?.message || "Could not update rounds.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Rounds" subtitle="Set how many rounds your tournament has." />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{loading ? "Loading..." : "Rounds Setup"}</Text>
            <Text style={styles.heroSub}>This is the “ready gate” for now. Later we’ll add Round 1 start + per-round scoring.</Text>
            {roundsReady ? (
              <View style={styles.pill}>
                <Text style={styles.pillText}>ROUNDS READY</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Number of Rounds</Text>
            <Text style={styles.cardSub}>Typical tournaments are 1–3 rounds. We’ll support multi-round leaderboards later.</Text>

            <TextInput
              value={roundsText}
              onChangeText={setRoundsText}
              placeholder="1"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={saveRounds}
              editable={isHost}
            />
          </View>

          {isHost && roundsReady ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Need to change later?</Text>
              <Text style={styles.cardSub}>You can mark rounds “not ready” to force re-check before starting.</Text>
              <Pressable onPress={clearRoundsReady} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Mark Not Ready</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={saveRounds}
            disabled={!isHost || saving}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, (!isHost || saving) && { opacity: 0.7 }]}
          >
            <Text style={styles.primaryText}>{!isHost ? "Host Only" : saving ? "Saving..." : "Save Rounds"}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
