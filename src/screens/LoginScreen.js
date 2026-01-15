// src/screens/LoginScreen.js
import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  ImageBackground,
  Image,
  Alert,
} from "react-native";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";

import ROUTES from "../navigation/routes";
import { auth } from "../firebase/firebase";

const C = {
  text: "#F7F7F7",
  muted: "rgba(247,247,247,0.72)",
  subtle: "rgba(247,247,247,0.55)",
  inputBg: "rgba(15, 18, 22, 0.55)",
  inputBorder: "rgba(247,247,247,0.18)",
  overlay: "rgba(0,0,0,0.50)",
  gold: "#F2C94C",
  goldText: "#101418",
  danger: "#FF6B6B",
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    const e = String(email || "").trim();
    const p = String(pw || "");
    return e.length > 3 && p.length >= 6 && !loading;
  }, [email, pw, loading]);

  async function onLogin() {
    if (loading) return;
    setErr("");
    setLoading(true);

    try {
      Keyboard.dismiss();
      const e = String(email || "").trim();
      const p = String(pw || "");
      await signInWithEmailAndPassword(auth, e, p);
      // RootNavigator will switch to the app when auth state changes.
    } catch (e) {
      setErr(String(e?.message || "Sign in failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function onForgot() {
    if (loading) return;
    setErr("");
    Keyboard.dismiss();

    const e = String(email || "").trim();
    if (!e) {
      Alert.alert("Reset password", "Type your email above first, then tap Forgot password.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, e);
      Alert.alert("Email sent", "Check your inbox (and spam) for a password reset link.");
    } catch (e2) {
      setErr(String(e2?.message || "Could not send reset email. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground
        source={require("../../assets/landing-page3.jpg")}
        resizeMode="cover"
        style={styles.bg}
      >
        <View style={styles.overlay} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandBlock}>
              <Image
                source={require("../../assets/legacy-logo-transparent.png")}
                resizeMode="contain"
                style={styles.logo}
              />
              <Text style={styles.tagline} numberOfLines={1} adjustsFontSizeToFit>
                BUILD YOUR LEGACY
              </Text>
            </View>

            <View style={styles.formBlock}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={C.subtle}
                style={styles.input}
                returnKeyType="next"
                editable={!loading}
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
              <TextInput
                value={pw}
                onChangeText={setPw}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor={C.subtle}
                style={styles.input}
                returnKeyType="done"
                editable={!loading}
                onSubmitEditing={onLogin}
              />

              <View style={styles.linksRow}>
                <Pressable
                  onPress={onForgot}
                  disabled={loading}
                  style={({ pressed }) => [styles.linkBtn, (pressed || loading) && { opacity: 0.75 }]}
                >
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
              </View>

              {!!err && <Text style={styles.error}>{err}</Text>}

              <Pressable
                onPress={onLogin}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!canSubmit || pressed) && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.primaryBtnText}>{loading ? "Signing in..." : "Sign In"}</Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate(ROUTES.AUTH_SIGNUP)}
                disabled={loading}
                style={({ pressed }) => [styles.bottomCta, (pressed || loading) && { opacity: 0.75 }]}
              >
                <Text style={styles.bottomCtaText}>
                  New here? <Text style={styles.bottomCtaTextStrong}>Create account</Text>
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const LOGO_SIZE = 400;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },

  brandBlock: {
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 0,
    transform: [{ translateY: -30 }],
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    marginBottom: -90,
  },
  tagline: {
    marginTop: 0,
    width: LOGO_SIZE + 40,
    textAlign: "center",
    color: C.gold,
    fontSize: 18,
    letterSpacing: 2.2,
    fontFamily: "Cinzel",
  },

  formBlock: { flex: 1, justifyContent: "flex-end", paddingBottom: 8 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: C.inputBg,
    borderColor: C.inputBorder,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: C.text,
    fontSize: 16,
  },

  linksRow: { marginTop: 10, flexDirection: "row", justifyContent: "flex-end" },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  linkText: { color: C.text, fontSize: 14 },

  error: { marginTop: 10, color: C.danger, fontSize: 13, lineHeight: 18 },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: C.gold,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryBtnText: { color: C.goldText, fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  bottomCta: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  bottomCtaText: { color: C.muted, fontSize: 14 },
  bottomCtaTextStrong: { color: C.text, fontSize: 14 },
});
