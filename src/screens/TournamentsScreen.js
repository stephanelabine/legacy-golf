// src/screens/TournamentsScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  setDoc,
  doc,
  updateDoc,
} from "firebase/firestore";

import PremiumSwipeRow from "../components/PremiumSwipeRow";
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

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  // keep only one swipe row open at a time
  const openSwipeRef = useRef(null);
  function closeAnyOpenSwipe() {
    try {
      if (openSwipeRef.current && openSwipeRef.current.close) openSwipeRef.current.close();
    } catch (e) {}
    openSwipeRef.current = null;
  }

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

  // Hide archived tournaments from the hub list
  const visibleItems = useMemo(() => {
    const arr = Array.isArray(items) ? [...items] : [];
    return arr.filter((t) => {
      const st = String(t?.status || "").toLowerCase();
      if (st === "archived") return false;
      if (t?.archivedAt) return false;
      return true;
    });
  }, [items]);

  const ACTION_W = 120;

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";

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
      heroTitle: {
        marginTop: 0,
        color: theme.text,
        fontSize: 22,
        fontWeight: "900",
        textAlign: "center",
        alignSelf: "center",
        width: "100%",
      },
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 19,
        textAlign: "center",
        alignSelf: "center",
        width: "100%",
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

      row: { padding: 16, backgroundColor: theme.card2 },
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
      rowSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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
      modalBtnCancel: { backgroundColor: softBg, borderColor: softBorder },
      modalBtnPrimary: { backgroundColor: blue, borderColor: blue },
      modalBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      modalBtnTextPrimary: { color: "#fff" },
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

      await setDoc(
        doc(db, "tournaments", docRef.id, "members", u.uid),
        {
          uid: u.uid,
          role: "host",
          displayName: String(u.displayName || "").trim() || "",
          joinedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

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
    closeAnyOpenSwipe();
    navigation.navigate(ROUTES.TOURNAMENT_DASHBOARD, { tournamentId: t.id });
  }

  function openEdit(t) {
    closeAnyOpenSwipe();
    setEditId(String(t?.id || ""));
    setEditName(String(t?.name || "").trim());
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId("");
    setEditName("");
    Keyboard.dismiss();
  }

  async function saveEdit() {
    const id = String(editId || "").trim();
    const cleaned = String(editName || "").trim();
    if (!id) return;

    if (!cleaned) {
      Alert.alert("Name required", "Enter a tournament name to save.");
      return;
    }

    setEditSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", id), {
        name: cleaned,
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch (e) {
      Alert.alert("Update failed", e?.message || "Could not update tournament.");
    } finally {
      setEditSaving(false);
    }
  }

  function confirmArchive(t) {
    closeAnyOpenSwipe();
    const id = String(t?.id || "");
    const title = String(t?.name || "this tournament");

    Alert.alert(
      "Delete tournament?",
      `This will remove it from your hub (archived).\n\nTournament: ${title}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "tournaments", id), {
                status: "archived",
                archivedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (e) {
              Alert.alert("Delete failed", e?.message || "Could not delete tournament.");
            }
          },
        },
      ]
    );
  }

  function TournamentRow({ item }) {
    const status = (item.status || "draft").toUpperCase();
    const code = item.joinCode ? String(item.joinCode).toUpperCase() : "";

    const deleteRed = isDark ? "rgba(220, 52, 52, 0.92)" : "rgba(190, 40, 40, 0.92)";

    return (
      <PremiumSwipeRow
        openSwipeRef={openSwipeRef}
        closeAnyOpenSwipe={closeAnyOpenSwipe}
        actionWidth={ACTION_W}
        friction={2}
        threshold={40}
        radius={18}
        borderColor={theme.border}
        backgroundColor={theme.card2}
        editColor={"rgba(15,122,74,0.92)"}
        deleteColor={deleteRed}
        onEdit={() => openEdit(item)}
        onDelete={() => confirmArchive(item)}
      >
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
      </PremiumSwipeRow>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Tournaments"
        subtitle="Create tournaments, invite players, and manage the full event."
      />

      <FlatList
        data={[
          { _type: "hero", id: "hero" },
          { _type: "section", id: "my" },
          ...visibleItems.map((t) => ({ _type: "tournament", ...t })),
          { _type: "end", id: "end" },
        ]}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item._type === "hero") {
            return (
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>Welcome to the Tournament Hub</Text>
                <Text style={styles.heroSub}>
                  Here you can create your tournament, invite players, select your courses, and set your games and
                  formats. Begin by tapping on an already existing tournament you've created, or select "create
                  tournament" tab
                </Text>
              </View>
            );
          }

          if (item._type === "section") return <Text style={styles.sectionTitle}>My Tournaments - Select Existing</Text>;

          if (item._type === "end") {
            if (loading) return null;

            if (!visibleItems.length) {
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

          return <TournamentRow item={item} />;
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            closeAnyOpenSwipe();
            setCreating(true);
          }}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? "Creating..." : "Create Tournament"}</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            closeAnyOpenSwipe();
            navigation.navigate(ROUTES.JOIN_TOURNAMENT);
          }}
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
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
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
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{saving ? "Creating..." : "Create"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            closeEdit();
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <Text style={styles.modalTitle}>Edit Tournament</Text>
                <Text style={styles.modalSub}>Rename the tournament. This updates for everyone in the roster.</Text>

                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Tournament name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={saveEdit}
                  editable={!editSaving}
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={closeEdit}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={editSaving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={saveEdit}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}
                    disabled={editSaving}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{editSaving ? "Saving..." : "Save"}</Text>
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
