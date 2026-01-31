// src/screens/TournamentOrganizerProfileScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, TextInput, KeyboardAvoidingView, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function parseHandicap(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return { ok: false, value: null };
  const num = Number(raw);
  if (!Number.isFinite(num)) return { ok: false, value: null };
  const rounded = Math.round(num * 10) / 10;
  return { ok: true, value: rounded };
}

export default function TournamentOrganizerProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const u = auth.currentUser;
  const uid = String(u?.uid || "").trim();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(String(u?.displayName || "").trim());
  const [email, setEmail] = useState(String(u?.email || "").trim());
  const [phone, setPhone] = useState("");
  const [handicap, setHandicap] = useState("");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!uid) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const d = snap.data() || {};
          const dn = String(d.displayName || d.name || d.fullName || "").trim();
          const em = String(d.email || "").trim();
          const ph = String(d.phone || "").trim();

          const h = d.handicap;
          const hNum =
            typeof h === "number"
              ? h
              : h === null || h === undefined || h === ""
              ? NaN
              : Number(String(h).trim());
          const hStr = Number.isFinite(hNum) ? String(Math.round(hNum * 10) / 10) : "";

          if (dn) setName(dn);
          if (em) setEmail(em);
          if (ph) setPhone(ph);
          if (hStr) setHandicap(hStr);
        }
      } catch (e) {
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const bronzeBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
    const bronzeBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

    const inkBtn = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: bronzeBorder,
        backgroundColor: bronzeBg,
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

      card: {
        borderRadius: 22,
        padding: 14,
        borderWidth: 2.5,
        borderColor: bronzeBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      cardTitle: {
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.2,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      cardSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 17 },

      input: {
        marginTop: 12,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
        color: theme.text,
        fontSize: 15,
        fontWeight: "800",
      },

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
      primaryBtnDisabled: { opacity: 0.65 },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      muted: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 10 },
    });
  }, [theme, isDark, footerPad]);

  async function saveAndContinue() {
    if (!uid) {
      Alert.alert("Not signed in", "Please sign in to continue.");
      return;
    }

    const n = String(name || "").trim();
    const e = String(email || "").trim();
    const p = String(phone || "").trim();
    const h = parseHandicap(handicap);

    if (!n) {
      Alert.alert("Organizer name", "Please enter your name.");
      return;
    }
    if (!h.ok) {
      Alert.alert("Handicap required", "Please enter a valid handicap (example: 12.4).");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          displayName: n,
          email: e,
          phone: p,
          handicap: h.value,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Keyboard.dismiss();
      navigation.navigate(ROUTES.TOURNAMENTS);
    } catch (err) {
      Alert.alert("Save failed", err?.message || "Could not save organizer profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Organizer" subtitle="Set your profile before entering the hub." />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>Organizer profile</Text>
            <Text style={styles.heroTitle}>Tell us who’s running this tournament</Text>
            <Text style={styles.heroSub}>
              This becomes the source of truth for Player 1 and keeps payouts, pairings, and results clean.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your details</Text>
            <Text style={styles.cardSub}>Name + handicap required. Email/phone recommended.</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              editable={!saving}
              returnKeyType="next"
            />

            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email (recommended)"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!saving}
              returnKeyType="next"
            />

            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone (recommended)"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              keyboardType="phone-pad"
              editable={!saving}
              returnKeyType="next"
            />

            <TextInput
              value={handicap}
              onChangeText={(s) => setHandicap(String(s || "").replace(/[^0-9.]/g, ""))}
              placeholder="Handicap (required) — example: 12.4"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />

            {loading ? <Text style={styles.muted}>Loading your saved profile…</Text> : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={saveAndContinue}
            disabled={saving || loading}
            style={({ pressed }) => [
              styles.primaryBtn,
              (saving || loading) && styles.primaryBtnDisabled,
              pressed && !saving && !loading && styles.pressed,
            ]}
          >
            <Text style={styles.primaryText}>{saving ? "Saving..." : "Continue to Tournament Hub"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
