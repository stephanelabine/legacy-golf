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
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import ROUTES from "../navigation/routes";
import { auth } from "../firebase/firebase";

const C = {
  bg: "#0b0f14",
  card: "#111826",
  inputBg: "#0b0f14",
  text: "#ffffff",
  muted: "#b4b4b4",
  primary: "#2bd4a4",
  danger: "#ff6b6b",
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return String(email).trim().length > 3 && String(pw).trim().length >= 6 && !loading;
  }, [email, pw, loading]);

  async function onLogin() {
    setErr("");
    setLoading(true);
    try {
      const e = String(email || "").trim();
      const p = String(pw || "").trim();
      await signInWithEmailAndPassword(auth, e, p);
    } catch (e) {
      setErr(String(e?.message || "Login failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
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
          <View style={styles.wrap}>
            <Text style={styles.title}>Legacy Golf</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <View style={styles.card}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={C.muted}
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
                placeholderTextColor={C.muted}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={onLogin}
              />

              {!!err && <Text style={styles.error}>{err}</Text>}

              <Pressable
                onPress={onLogin}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!canSubmit || pressed) && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.primaryBtnText}>{loading ? "Signing in..." : "Sign In"}</Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate(ROUTES.AUTH_SIGNUP)}
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.linkText}>Create an account</Text>
              </Pressable>
            </View>

            <Text style={styles.footerNote}>
              Your data is tied to your account and available on any device you sign into.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 18, paddingVertical: 18 },
  wrap: { width: "100%" },
  title: { fontSize: 34, color: C.text, marginBottom: 6, fontWeight: "700" },
  subtitle: { fontSize: 16, color: C.muted, marginBottom: 18 },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 16 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: C.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: C.text,
    fontSize: 16,
  },
  error: { marginTop: 12, color: C.danger, fontSize: 13 },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#08110f", fontSize: 16, fontWeight: "700" },
  linkBtn: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  linkText: { color: C.text, fontSize: 15 },
  footerNote: { marginTop: 14, color: C.muted, fontSize: 12, lineHeight: 16 },
});
