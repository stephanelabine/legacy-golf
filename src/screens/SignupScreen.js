// src/screens/SignupScreen.js
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
import { createUserWithEmailAndPassword } from "firebase/auth";
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

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    const e = String(email).trim().length > 3;
    const p = String(pw).trim().length >= 6;
    const match = String(pw) === String(pw2);
    return e && p && match && !loading;
  }, [email, pw, pw2, loading]);

  async function onSignup() {
    setErr("");
    setLoading(true);
    try {
      const e = String(email || "").trim();
      const p = String(pw || "").trim();
      await createUserWithEmailAndPassword(auth, e, p);
    } catch (e) {
      setErr(String(e?.message || "Sign up failed. Please try again."));
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
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Your Legacy Golf data will follow you on any device</Text>

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
                placeholder="Min 6 characters"
                placeholderTextColor={C.muted}
                style={styles.input}
                returnKeyType="next"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Confirm password</Text>
              <TextInput
                value={pw2}
                onChangeText={setPw2}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                placeholder="Repeat password"
                placeholderTextColor={C.muted}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={onSignup}
              />

              {!!err && <Text style={styles.error}>{err}</Text>}

              <Pressable
                onPress={onSignup}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!canSubmit || pressed) && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.primaryBtnText}>{loading ? "Creating..." : "Create Account"}</Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate(ROUTES.AUTH_LOGIN)}
                style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.linkText}>Back to sign in</Text>
              </Pressable>
            </View>
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
  title: { fontSize: 28, color: C.text, marginBottom: 6, fontWeight: "700" },
  subtitle: { fontSize: 14, color: C.muted, marginBottom: 18, lineHeight: 18 },
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
});
