// src/screens/TournamentsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  Keyboard,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  addDoc,
  serverTimestamp,
  getDocs,
  limit,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function makeJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/1/0
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export default function TournamentsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;

    const qy = query(
      collection(db, "tournaments"),
      where("memberUids", "array-contains", u.uid),
      orderBy("updatedAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setItems(rows);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        Alert.alert("Tournaments error", err?.message || "Could not load tournaments.");
      }
    );

    return () => unsub();
  }, []);

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 14,
      },
      heroKicker: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 22, fontWeight: "900" },
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 19,
      },

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

      row: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      rowTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      pill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },
      rowSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.72,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
      },

      empty: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginTop: 8,
      },
      emptyTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      emptySub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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

      modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      },

      modalCard: {
        width: "100%",
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
      },

      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      modalSub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      input: {
        marginTop: 14,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 15,
        fontWeight: "800",
      },

      modalBtnRow: { marginTop: 14, flexDirection: "row", gap: 10 },
      modalBtn: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
      },
      modalBtnCancel: {
        backgroundColor: softBg,
        borderColor: softBorder,
      },
      modalBtnCreate: {
        backgroundColor: blue,
        borderColor: blue,
      },
      modalBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      modalBtnTextCreate: { color: "#fff" },
    });
  }, [theme, isDark, footerPad]);

  async function createTournament() {
    const u = auth.currentUser;
    if (!u) return;

    const cleaned = (name || "").trim();
    if (!cleaned) {
      Alert.alert("Tournament name required", "Enter a tournament name to continue.");
      return;
    }

    setSaving(true);
    try {
      let joinCode = makeJoinCode();

      // collision check
      for (let i = 0; i < 5; i++) {
        const testQ = query(collection(db, "tournaments"), where("joinCode", "==", joinCode), limit(1));
        const snap = await getDocs(testQ);
        if (snap.empty) break;
        joinCode = makeJoinCode();
      }

      const now = serverTimestamp();

      const docRef = await addDoc(collection(db, "tournaments"), {
        name: cleaned,
        status: "draft",
        ownerUid: u.uid,
        joinCode,
        memberUids: [u.uid],
        createdAt: now,
        updatedAt: now,
      });

      setCreating(false);
      setName("");
      Keyboard.dismiss();

      navigation.navigate(ROUTES.TOURNAMENT_DASHBOARD, { tournamentId: docRef.id });
    } catch (e) {
      Alert.alert("Create failed", e?.message || "Could not create tournament.");
    } finally {
      setSaving(false);
    }
  }

  function openTournament(t) {
    navigation.navigate(ROUTES.TOURNAMENT_DASHBOARD, { tournamentId: t.id });
  }

  function renderRow({ item }) {
    const status = (item.status || "draft").toUpperCase();
    const code = item.joinCode ? String(item.joinCode).toUpperCase() : "";

    return (
      <Pressable onPress={() => openTournament(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle}>{item.name || "Untitled Tournament"}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{status}</Text>
          </View>
        </View>
        <Text style={styles.rowSub}>
          Join code: {code || "—"} · Players: {Array.isArray(item.memberUids) ? item.memberUids.length : 1}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournaments" subtitle="Create tournaments, invite players, and manage the full event." />

      <FlatList
        data={[
          { _type: "hero", id: "hero" },
          { _type: "section", id: "my" },
          ...items.map((t) => ({ _type: "tournament", ...t })),
          { _type: "end", id: "end" },
        ]}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item._type === "hero") {
            return (
              <View style={styles.hero}>
                <Text style={styles.heroKicker}>Tournament Module</Text>
                <Text style={styles.heroTitle}>Tournament Hub</Text>
                <Text style={styles.heroSub}>
                  Create a tournament, then invite your players using a join code. Everything syncs through Firebase so it works across devices.
                </Text>
              </View>
            );
          }

          if (item._type === "section") {
            return <Text style={styles.sectionTitle}>My Tournaments</Text>;
          }

          if (item._type === "end") {
            if (loading) return null;

            if (!items.length) {
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No tournaments yet</Text>
                  <Text style={styles.emptySub}>
                    Tap Create Tournament to start one. You’ll get a short join code you can send to your players.
                  </Text>
                </View>
              );
            }

            return null;
          }

          return renderRow({ item });
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={() => setCreating(true)}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? "Creating..." : "Create Tournament"}</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate(ROUTES.JOIN_TOURNAMENT)}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryText}>Join with Code</Text>
        </Pressable>
      </View>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setCreating(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Create Tournament</Text>
                <Text style={styles.modalSub}>Name it now. You can add course, players, and formats from the dashboard.</Text>

                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. May Show Tournament"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={createTournament}
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setCreating(false);
                      setName("");
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={createTournament}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCreate, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextCreate]}>{saving ? "Creating..." : "Create"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
