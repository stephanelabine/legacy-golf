// src/screens/JoinTournamentScreen.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  arrayUnion,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function normalizeCode(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

export default function JoinTournamentScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";
    const inputBorder = isDark ? "rgba(255,255,255,0.18)" : "rgba(10,15,26,0.16)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 160 },

      card: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },

      title: { color: theme.text, fontSize: 20, fontWeight: "900" },
      sub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      input: {
        marginTop: 14,
        height: 56,
        borderRadius: 18,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: inputBorder,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 18,
        fontWeight: "900",
        letterSpacing: 3,
      },

      helper: { marginTop: 10, color: theme.text, opacity: 0.6, fontSize: 12, fontWeight: "700" },

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

  async function joinTournament() {
    const u = auth.currentUser;
    if (!u) {
      Alert.alert("Sign in required", "You must be signed in to join a tournament.");
      return;
    }

    const joinCode = normalizeCode(code);
    if (joinCode.length < 4) {
      Alert.alert("Enter a valid code", "Please enter the tournament join code.");
      return;
    }

    setJoining(true);
    try {
      // Find tournament by joinCode
      const qy = query(collection(db, "tournaments"), where("joinCode", "==", joinCode), limit(1));
      const snap = await getDocs(qy);

      if (snap.empty) {
        Alert.alert("Not found", "No tournament matches that join code.");
        return;
      }

      const docSnap = snap.docs[0];
      const tournamentId = docSnap.id;
      const tData = docSnap.data() || {};

      const rosterLocked = !!tData.rosterLocked;
      const memberUids = Array.isArray(tData.memberUids) ? tData.memberUids.map((x) => String(x)) : [];
      const myUid = String(u.uid || "");
      const alreadyMember = myUid && memberUids.includes(myUid);

      if (rosterLocked && !alreadyMember) {
        Alert.alert("Roster locked", "This tournament roster is locked. Ask the host to unlock it to join.");
        return;
      }

      // Only add to the roster if not already on it
      if (!alreadyMember) {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          memberUids: arrayUnion(u.uid),
          updatedAt: serverTimestamp(),
        });
      }

      // Create/update a member doc (safe even if already member)
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", u.uid),
        {
          uid: u.uid,
          joinedAt: serverTimestamp(),
          role: "player",
        },
        { merge: true }
      );

      Keyboard.dismiss();
      setCode("");

      navigation.replace(ROUTES.TOURNAMENT_DASHBOARD, { tournamentId });
    } catch (e) {
      Alert.alert("Join failed", e?.message || "Could not join tournament.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Join Tournament" subtitle="Enter the join code from your host." />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Enter Join Code</Text>
            <Text style={styles.sub}>
              Type the 6-character code exactly. Once joined, this tournament stays synced in Firebase across devices.
            </Text>

            <TextInput
              value={code}
              onChangeText={(v) => setCode(normalizeCode(v))}
              placeholder="ABC123"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={joinTournament}
              maxLength={8}
            />

            <Text style={styles.helper}>No links. No emails. Code only.</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={joinTournament}
            disabled={joining}
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, joining && { opacity: 0.7 }]}
          >
            <Text style={styles.primaryText}>{joining ? "Joining..." : "Join"}</Text>
          </Pressable>

          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
