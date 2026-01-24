// src/screens/TournamentPlayersScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Share,
  Platform,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayRemove,
} from "firebase/firestore";

import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function initialsFromName(name, fallback) {
  const s = String(name || "").trim();
  if (!s) return String(fallback || "?").slice(0, 2).toUpperCase();
  const parts = s.split(" ").filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || "";
  return (a + b).toUpperCase();
}

export default function TournamentPlayersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [rawMembers, setRawMembers] = useState([]);
  const [loadingT, setLoadingT] = useState(true);
  const [loadingM, setLoadingM] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editUid, setEditUid] = useState(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const tref = doc(db, "tournaments", tournamentId);
    const unsubT = onSnapshot(
      tref,
      (snap) => {
        setT(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoadingT(false);
      },
      (err) => {
        setLoadingT(false);
        Alert.alert("Tournament error", err?.message || "Could not load tournament.");
      }
    );

    const mref = collection(db, "tournaments", tournamentId, "members");
    const unsubM = onSnapshot(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRawMembers(rows);
        setLoadingM(false);
      },
      (err) => {
        setLoadingM(false);
        Alert.alert("Players error", err?.message || "Could not load players.");
      }
    );

    return () => {
      unsubT();
      unsubM();
    };
  }, [tournamentId]);

  const u = auth.currentUser;

  const ownerUid = String(t?.ownerUid || "");
  const rosterLocked = !!t?.rosterLocked;

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const joinCode = String(t?.joinCode || "").toUpperCase();
  const tournamentName = String(t?.name || "Tournament");

  const members = useMemo(() => {
    const rows = Array.isArray(rawMembers) ? [...rawMembers] : [];
    rows.sort((a, b) => {
      const au = String(a.uid || a.id || "");
      const bu = String(b.uid || b.id || "");

      const aHost = au && ownerUid && au === ownerUid ? 0 : 1;
      const bHost = bu && ownerUid && bu === ownerUid ? 0 : 1;
      if (aHost !== bHost) return aHost - bHost;

      const an = String(a.displayName || a.name || "").trim().toLowerCase();
      const bn = String(b.displayName || b.name || "").trim().toLowerCase();
      if (an && bn && an !== bn) return an < bn ? -1 : 1;
      if (an && !bn) return -1;
      if (!an && bn) return 1;

      return au.localeCompare(bu);
    });
    return rows;
  }, [rawMembers, ownerUid]);

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    const lockBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";
    const lockBorder = isDark ? "rgba(255, 210, 92, 0.40)" : "rgba(255, 210, 92, 0.48)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 160 },

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

      lockPill: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: lockBg,
        borderWidth: 1,
        borderColor: lockBorder,
      },
      lockPillText: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },

      codeCard: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: blue,
        backgroundColor: blueBg,
        marginBottom: 12,
      },
      codeLabel: {
        color: theme.text,
        opacity: 0.8,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        textTransform: "uppercase",
      },
      codeValue: { marginTop: 10, color: theme.text, fontSize: 26, fontWeight: "900", letterSpacing: 4 },

      smallRow: { marginTop: 10, flexDirection: "row", gap: 10 },
      smallBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      smallBtnText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },

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
        padding: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },

      avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      avatarText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.6 },

      rowTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
      rowSub: { marginTop: 4, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800" },

      pill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      rowActions: { marginTop: 12, flexDirection: "row", gap: 10 },
      actionBtn: {
        flex: 1,
        height: 46,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      actionText: { color: theme.text, fontSize: 13, fontWeight: "900" },
      actionBtnDanger: { backgroundColor: "rgba(231,76,60,0.14)", borderColor: "rgba(231,76,60,0.28)" },

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

      footerRow: { flexDirection: "row", gap: 10 },
      footerBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
      },

      primaryBtn: {
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      secondaryBtn: {
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
      modalBtnSave: { backgroundColor: blue, borderColor: blue },
      modalBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      modalBtnTextSave: { color: "#fff" },
    });
  }, [theme, isDark, footerPad]);

  async function shareInvite() {
    if (!joinCode) return;

    const message =
      `Legacy Golf Tournament Invite\n\n` +
      `Tournament: ${tournamentName}\n` +
      `Join code: ${joinCode}\n\n` +
      `Open Legacy Golf → Games → Tournaments → Join with Code → enter: ${joinCode}`;

    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Share failed", e?.message || "Could not open share sheet.");
    }
  }

  async function toggleRosterLock() {
    if (!isHost || !tournamentId) return;

    const next = !rosterLocked;

    Alert.alert(
      next ? "Lock roster?" : "Unlock roster?",
      next
        ? "This will prevent new players from joining and disable removals until you unlock it."
        : "This will allow new players to join again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: next ? "Lock" : "Unlock",
          style: next ? "destructive" : "default",
          onPress: async () => {
            setSaving(true);
            try {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                rosterLocked: next,
                updatedAt: serverTimestamp(),
              });
            } catch (e) {
              Alert.alert("Update failed", e?.message || "Could not update roster lock.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  function openEdit(member) {
    const uid = String(member?.uid || member?.id || "");
    if (!uid) return;

    const meUid = String(u?.uid || "");
    const canEdit = isHost || (!rosterLocked && uid === meUid);

    if (!canEdit) {
      Alert.alert("Roster locked", "Only the host can edit names while the roster is locked.");
      return;
    }

    setEditUid(uid);
    setEditName(String(member?.displayName || ""));
    setEditOpen(true);
  }

  async function saveName() {
    if (!tournamentId || !editUid) return;

    const cleaned = String(editName || "").trim();
    if (!cleaned) {
      Alert.alert("Name required", "Enter a name to save.");
      return;
    }

    const meUid = String(u?.uid || "");
    const canSave = isHost || (!rosterLocked && editUid === meUid);

    if (!canSave) {
      Alert.alert("Roster locked", "Only the host can edit names while the roster is locked.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", editUid),
        {
          uid: editUid,
          displayName: cleaned,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setEditOpen(false);
      setEditUid(null);
      setEditName("");
      Keyboard.dismiss();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save player name.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(member) {
    if (!isHost) return;

    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to remove players.");
      return;
    }

    const uid = String(member?.uid || member?.id || "");
    if (!uid) return;

    if (uid === ownerUid) {
      Alert.alert("Not allowed", "You can’t remove the host.");
      return;
    }

    Alert.alert(
      "Remove player?",
      "This will remove the player from the tournament roster. They can re-join using the join code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                memberUids: arrayRemove(uid),
                updatedAt: serverTimestamp(),
              });
              await deleteDoc(doc(db, "tournaments", tournamentId, "members", uid));
            } catch (e) {
              Alert.alert("Remove failed", e?.message || "Could not remove player.");
            }
          },
        },
      ]
    );
  }

  function renderRow({ item }) {
    const uid = String(item?.uid || item?.id || "");
    const isOwner = uid && ownerUid && uid === ownerUid;
    const me = uid && String(u?.uid || "") === uid;

    const displayName = String(item?.displayName || "").trim();
    const sub = isOwner ? "Host" : me ? "You" : uid ? `uid: ${uid.slice(0, 10)}…` : "";

    const canEdit = isHost || (!rosterLocked && me);

    return (
      <View style={styles.row}>
        <View style={styles.rowTop}>
          <View style={styles.rowLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsFromName(displayName, isOwner ? "H" : "P")}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {displayName || (isOwner ? "Host (name not set)" : "Player (name not set)")}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {sub}
              </Text>
            </View>
          </View>

          <View style={styles.pill}>
            <Text style={styles.pillText}>{isOwner ? "HOST" : "PLAYER"}</Text>
          </View>
        </View>

        <View style={styles.rowActions}>
          <Pressable
            onPress={() => openEdit(item)}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && styles.pressed,
              (!canEdit || saving) && { opacity: 0.6 },
            ]}
            disabled={!canEdit || saving}
          >
            <Text style={styles.actionText}>{canEdit ? "Edit Name" : "View"}</Text>
          </Pressable>

          {isHost && !isOwner ? (
            <Pressable
              onPress={() => removePlayer(item)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.actionBtnDanger,
                pressed && styles.pressed,
                (rosterLocked || saving) && { opacity: 0.55 },
              ]}
              disabled={rosterLocked || saving}
            >
              <Text style={styles.actionText}>{rosterLocked ? "Locked" : "Remove"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const count = members.length || (Array.isArray(t?.memberUids) ? t.memberUids.length : 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Players" subtitle="Manage the tournament roster." />

      <FlatList
        data={[
          { _type: "hero", key: "hero" },
          { _type: "code", key: "code" },
          { _type: "section", key: "section" },
          ...members.map((m) => ({ _type: "member", key: `m:${m.uid || m.id}`, ...m })),
          { _type: "end", key: "end" },
        ]}
        keyExtractor={(x) => x.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item._type === "hero") {
            return (
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>
                  {loadingT ? "Loading..." : `Roster · ${count} player${count === 1 ? "" : "s"}`}
                </Text>
                <Text style={styles.heroSub}>
                  Players join via join code. Names are saved in Firebase.
                </Text>

                {rosterLocked ? (
                  <View style={styles.lockPill}>
                    <Text style={styles.lockPillText}>ROSTER LOCKED</Text>
                  </View>
                ) : null}
              </View>
            );
          }

          if (item._type === "code") {
            return (
              <View style={styles.codeCard}>
                <Text style={styles.codeLabel}>Join Code</Text>
                <Text style={styles.codeValue}>{joinCode || "—"}</Text>

                <View style={styles.smallRow}>
                  <Pressable onPress={shareInvite} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
                    <Text style={styles.smallBtnText}>Share Invite</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => Alert.alert("Tip", "Have players open Legacy Golf → Games → Tournaments → Join with Code.")}
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.smallBtnText}>How to Join</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          if (item._type === "section") {
            return <Text style={styles.sectionTitle}>Players</Text>;
          }

          if (item._type === "end") {
            if (loadingM) return null;

            if (!members.length) {
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No players yet</Text>
                  <Text style={styles.emptySub}>Share the join code so players can join this tournament.</Text>
                </View>
              );
            }
            return null;
          }

          return renderRow({ item });
        }}
      />

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          {isHost ? (
            <Pressable
              onPress={toggleRosterLock}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.secondaryBtn,
                pressed && styles.pressed,
                saving && { opacity: 0.7 },
              ]}
              disabled={saving}
            >
              <Text style={styles.secondaryText}>{rosterLocked ? "Unlock Roster" : "Lock Roster"}</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.primaryBtn,
              pressed && styles.pressed,
              saving && { opacity: 0.7 },
            ]}
            disabled={saving}
          >
            <Text style={styles.primaryText}>Back</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setEditOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <Text style={styles.modalTitle}>Player Name</Text>
                <Text style={styles.modalSub}>Set the display name shown in this tournament.</Text>

                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="e.g. Steph, Kim, Dave..."
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setEditOpen(false);
                      setEditUid(null);
                      setEditName("");
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={saveName}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>{saving ? "Saving..." : "Save"}</Text>
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
