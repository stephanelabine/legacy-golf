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

function friendlyAuthError(err) {
  const code = String(err?.code || "");
  if (code.includes("auth/invalid-email")) return "That email address doesn’t look valid.";
  if (code.includes("auth/user-not-found")) return "No account found with that email.";
  if (code.includes("auth/wrong-password")) return "Incorrect password. Try again.";
  if (code.includes("auth/invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("auth/too-many-requests")) return "Too many attempts. Wait a bit and try again.";
  if (code.includes("auth/network-request-failed")) return "Network error. Check your connection and try again.";
  if (code.includes("auth/app-not-authorized"))
    return "This app isn’t authorized for Firebase. Check Firebase project settings.";
  if (code.includes("auth/operation-not-allowed"))
    return "Email/password sign-in is not enabled in Firebase Auth settings.";
  // IMPORTANT: don't force api-key-missing unless that is the actual code
  return String(err?.message || "Sign in failed. Please try again.");
}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [errDebug, setErrDebug] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return String(email).trim().length > 3 && String(pw).length >= 6 && !loading;
  }, [email, pw, loading]);

  async function onLogin() {
    setErr("");
    setErrDebug("");
    setLoading(true);

    try {
      const e = String(email || "").trim();
      const p = String(pw || "");
      await signInWithEmailAndPassword(auth, e, p);
      // RootNavigator will route automatically when auth state changes
    } catch (e1) {
      setErr(friendlyAuthError(e1));
      setErrDebug(`code: ${String(e1?.code || "n/a")} | msg: ${String(e1?.message || "n/a")}`);
    } finally {
      setLoading(false);
    }
  }

  async function onForgot() {
    setErr("");
    setErrDebug("");

    const e = String(email || "").trim();
    if (!e) {
      Alert.alert("Reset password", "Type your email above first, then tap Forgot password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, e);
      Alert.alert("Email sent", "Check your inbox for a password reset link.");
    } catch (e2) {
      setErr(friendlyAuthError(e2));
      setErrDebug(`code: ${String(e2?.code || "n/a")} | msg: ${String(e2?.message || "n/a")}`);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={require("../../assets/landing-page3.jpg")} resizeMode="cover" style={styles.bg}>
        <View style={styles.overlay} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
                onSubmitEditing={onLogin}
              />

              <View style={styles.linksRow}>
                <Pressable onPress={onForgot} style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}>
                  <Text style={styles.linkText}>Forgot password?</Text>
                </Pressable>
              </View>

              {!!err && (
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.error}>{err}</Text>
                  {!!errDebug && <Text style={styles.errorDebug}>{errDebug}</Text>}
                </View>
              )}

              <Pressable
                onPress={onLogin}
                disabled={!canSubmit}
                style={({ pressed }) => [styles.primaryBtn, (!canSubmit || pressed) && { opacity: 0.85 }]}
              >
                <Text style={styles.primaryBtnText}>{loading ? "Signing in..." : "Sign In"}</Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate(ROUTES.AUTH_SIGNUP)}
                style={({ pressed }) => [styles.bottomCta, pressed && { opacity: 0.75 }]}
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

const LOGO_SIZE = 320;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: C.overlay },
  scrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },

  brandBlock: { alignItems: "center", paddingTop: 6, paddingBottom: 0 },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, marginBottom: -70 },
  tagline: {
    marginTop: 0,
    width: LOGO_SIZE,
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

  error: { color: C.danger, fontSize: 13, lineHeight: 18 },
  errorDebug: { marginTop: 6, color: "rgba(247,247,247,0.65)", fontSize: 11, lineHeight: 16 },

  primaryBtn: { marginTop: 14, backgroundColor: C.gold, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { color: C.goldText, fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  bottomCta: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  bottomCtaText: { color: C.muted, fontSize: 14 },
  bottomCtaTextStrong: { color: C.text, fontSize: 14 },
});
