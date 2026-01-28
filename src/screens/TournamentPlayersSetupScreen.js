// src/screens/TournamentPlayersSetupScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  onSnapshot as onSnapshotQuery,
  setDoc,
  arrayUnion,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function makeGuestId() {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function TournamentPlayersSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [rawMembers, setRawMembers] = useState([]);
  const [saving, setSaving] = useState(false);

  // single modal: menu | guest | invite
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState("menu");

  // guest form
  const [guestName, setGuestName] = useState("");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // invite form (UI only for now)
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId]);

  // IMPORTANT: setup screen must use the same roster as the real Players screen:
  // tournaments/{tournamentId}/members
  useEffect(() => {
    if (!tournamentId) return;

    const mref = collection(db, "tournaments", tournamentId, "members");

    const unsub = onSnapshotQuery(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRawMembers(rows);
      },
      (err) => Alert.alert("Players error", err?.message || "Could not load players.")
    );

    return () => unsub();
  }, [tournamentId]);

  const ownerUid = String(t?.ownerUid || "");
  const u = auth.currentUser;

  const members = useMemo(() => {
    const rows = Array.isArray(rawMembers) ? [...rawMembers] : [];

    rows.sort((a, b) => {
      const au = String(a.uid || a.id || "");
      const bu = String(b.uid || b.id || "");

      const aHost = au && ownerUid && au === ownerUid ? 0 : 1;
      const bHost = bu && ownerUid && bu === ownerUid ? 0 : 1;
      if (aHost !== bHost) return aHost - bHost;

      const ag = a?.isGuest ? 1 : 0;
      const bg = b?.isGuest ? 1 : 0;
      if (ag !== bg) return ag - bg;

      const an = String(a.displayName || a.name || "").trim().toLowerCase();
      const bn = String(b.displayName || b.name || "").trim().toLowerCase();
      if (an && bn && an !== bn) return an < bn ? -1 : 1;
      if (an && !bn) return -1;
      if (!an && bn) return 1;

      return au.localeCompare(bu);
    });

    return rows;
  }, [rawMembers, ownerUid]);

  const joinCode = String(t?.joinCode || t?.code || "").trim().toUpperCase();
  const tournamentName = String(t?.name || t?.tournamentName || "Tournament").trim();

  const playerCount = members.length;

  const missingHcpCount = useMemo(() => {
    let n = 0;
    (members || []).forEach((p) => {
      const h = p?.handicap;
      const num =
        typeof h === "number"
          ? h
          : h === null || h === undefined || h === ""
          ? NaN
          : Number(String(h).trim());
      if (!Number.isFinite(num)) n += 1;
    });
    return n;
  }, [members]);

  const canContinue = playerCount >= 2 && missingHcpCount === 0;

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const green = "rgba(15,122,74,0.92)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.16)";
    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";

    const inkBtn = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

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
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      joinCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: greenRing,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      joinLabel: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
        textAlign: "center",
      },
      joinCode: {
        marginTop: 10,
        color: theme.text,
        fontSize: 22,
        fontWeight: "900",
        letterSpacing: 2.2,
        textAlign: "center",
      },
      joinHint: {
        marginTop: 10,
        color: theme.text,
        opacity: 0.7,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
        lineHeight: 18,
      },

      joinRow: { flexDirection: "row", gap: 10, marginTop: 12 },
      miniBtn: {
        flex: 1,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      miniText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

      bigAddBtn: {
        height: 60,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: green,
        borderWidth: 1,
        borderColor: greenRing,
        marginTop: 10,
        marginBottom: 14,
      },
      bigAddText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.3 },

      sectionTitle: {
        marginTop: 4,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      playerCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 10,
      },
      playerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      playerName: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      hcpPill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      hcpText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },
      playerSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },

      empty: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      emptySub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.72,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
        lineHeight: 18,
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
      footerRow: { flexDirection: "row", gap: 10 },

      secondaryBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      secondaryText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },

      primaryBtn: {
        flex: 1,
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: inkBtn,
      },
      primaryBtnDisabled: { opacity: 0.45 },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      helper: {
        marginTop: 10,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      helperText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 17, textAlign: "center" },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      // modal
      modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      },
      modalShell: {
        width: "100%",
        maxHeight: "82%",
      },
      modalCard: {
        width: "100%",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
        overflow: "hidden",
      },
      modalBody: {
        padding: 16,
      },
      modalFooter: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(14, (insets?.bottom || 0) + 10),
        borderTopWidth: 1,
        borderTopColor: theme.divider,
        backgroundColor: theme.bg,
      },

      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
      modalSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.72,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
        textAlign: "center",
      },

      choiceBtn: {
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
        marginTop: 10,
      },
      choiceBtnPrimary: { backgroundColor: green, borderColor: greenRing },
      choiceText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      choiceTextPrimary: { color: "#fff" },

      input: {
        marginTop: 12,
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

      row: { flexDirection: "row", gap: 10 },
      modalBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      modalBtnPrimary: { backgroundColor: green, borderColor: greenRing },
      modalBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },
      modalBtnTextPrimary: { color: "#fff" },

      modalSpacer: { height: 10 },
    });
  }, [theme, isDark, footerPad, insets?.bottom]);

  function closeAdd() {
    Keyboard.dismiss();
    setAddOpen(false);
    setTimeout(() => setAddMode("menu"), 0);
  }

  function openAddPlayer() {
    setAddMode("menu");
    setAddOpen(true);
  }

  function startGuest() {
    setGuestName("");
    setGuestHandicap("");
    setGuestEmail("");
    setGuestPhone("");
    setAddMode("guest");
  }

  function startInvite() {
    setInviteEmail("");
    setInvitePhone("");
    setAddMode("invite");
  }

  async function copyJoinCode() {
    if (!joinCode) {
      Alert.alert("No code", "This tournament does not have a join code yet.");
      return;
    }

    try {
      const Clipboard = require("expo-clipboard");
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(joinCode);
        Alert.alert("Copied", "Join code copied to clipboard.");
        return;
      }
    } catch (e) {}

    Alert.alert("Copy", "Long-press the code to copy.");
  }

  async function shareInvite() {
    if (!joinCode) {
      Alert.alert("No code", "This tournament does not have a join code yet.");
      return;
    }

    try {
      await Share.share({
        message: `You’re invited to join: ${tournamentName}\nJoin code: ${joinCode}\n\n(If you don’t have Legacy Golf yet, download it from the App Store.)`,
      });
    } catch (e) {}
  }

  async function addGuest() {
    const name = String(guestName || "").trim();
    const hRaw = String(guestHandicap || "").trim();

    if (!name) {
      Alert.alert("Guest name", "Type a name for the guest.");
      return;
    }
    if (!hRaw) {
      Alert.alert("Handicap required", "Enter a handicap for this guest.");
      return;
    }

    const h = Number(hRaw);
    if (!Number.isFinite(h)) {
      Alert.alert("Handicap", "Handicap must be a number (example: 12.4).");
      return;
    }

    if (!tournamentId) return;

    const email = String(guestEmail || "").trim();
    const phone = String(guestPhone || "").trim();

    const guestId = makeGuestId();

    setSaving(true);
    try {
      // Write to MEMBERS (single source of truth)
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", guestId),
        {
          uid: guestId,
          displayName: name,
          isGuest: true,
          handicap: String(h), // keep consistent with existing roster screen (string-safe)
          email: email || "",
          phone: phone || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Track guestIds on tournament doc (matches TournamentPlayersScreen behavior)
      await updateDoc(doc(db, "tournaments", tournamentId), {
        guestIds: arrayUnion(guestId),
        updatedAt: serverTimestamp(),
      });

      closeAdd();
    } catch (e) {
      Alert.alert("Add guest failed", e?.message || "Could not add guest.");
    } finally {
      setSaving(false);
    }
  }

  function addBuddyStub() {
    Alert.alert("Add Buddy", "Buddy pick is next. For now, Add Guest or Invite with code.");
  }

  async function handleContinue() {
    if (saving) return;

    if (playerCount < 2) {
      Alert.alert("Add players", "Add at least 2 players to continue.");
      return;
    }
    if (missingHcpCount > 0) {
      Alert.alert("Handicaps missing", "Every player needs a handicap before you continue.");
      return;
    }

    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        playersReady: true,
        setupStep: "formats",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {}

    navigation.navigate(ROUTES.TOURNAMENT_FORMATS, { tournamentId });
  }

  function goToSetupHub() {
    navigation.navigate(ROUTES.TOURNAMENT_SETUP, { tournamentId });
  }

  function ModalMenuBody() {
    return (
      <>
        <Text style={styles.modalTitle}>Add a player</Text>
        <Text style={styles.modalSub}>Choose how you want to add someone.</Text>

        <Pressable
          onPress={startGuest}
          disabled={saving}
          style={({ pressed }) => [
            styles.choiceBtnPrimary,
            styles.choiceBtn,
            pressed && !saving && styles.pressed,
            saving && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.choiceText, styles.choiceTextPrimary]}>Add Guest</Text>
        </Pressable>

        <Pressable
          onPress={addBuddyStub}
          disabled={saving}
          style={({ pressed }) => [styles.choiceBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.choiceText}>Add Buddy</Text>
        </Pressable>

        <Pressable
          onPress={startInvite}
          disabled={saving}
          style={({ pressed }) => [styles.choiceBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.choiceText}>Invite with code</Text>
        </Pressable>
      </>
    );
  }

  function ModalGuestBody() {
    return (
      <>
        <Text style={styles.modalTitle}>Add guest</Text>
        <Text style={styles.modalSub}>Name + handicap required. Email/phone optional.</Text>

        <TextInput
          value={guestName}
          onChangeText={setGuestName}
          placeholder="Guest name"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!saving}
          returnKeyType="next"
        />

        <TextInput
          value={guestHandicap}
          onChangeText={setGuestHandicap}
          placeholder="Handicap (required) — example: 12.4"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
          editable={!saving}
          returnKeyType="next"
        />

        <TextInput
          value={guestEmail}
          onChangeText={setGuestEmail}
          placeholder="Email (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!saving}
          returnKeyType="next"
        />

        <TextInput
          value={guestPhone}
          onChangeText={setGuestPhone}
          placeholder="Phone (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType="phone-pad"
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <View style={styles.modalSpacer} />
      </>
    );
  }

  function ModalInviteBody() {
    return (
      <>
        <Text style={styles.modalTitle}>Invite with code</Text>
        <Text style={styles.modalSub}>Share the join code. Email/phone capture is optional for now.</Text>

        <View style={[styles.joinCard, { marginTop: 12, marginBottom: 0 }]}>
          <Text style={styles.joinLabel}>Join code</Text>
          <Text style={styles.joinCode} selectable>
            {joinCode || "—"}
          </Text>

          <View style={styles.joinRow}>
            <Pressable
              onPress={copyJoinCode}
              disabled={saving || !joinCode}
              style={({ pressed }) => [
                styles.miniBtn,
                pressed && !saving && styles.pressed,
                (saving || !joinCode) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.miniText}>Copy</Text>
            </Pressable>

            <Pressable
              onPress={shareInvite}
              disabled={saving || !joinCode}
              style={({ pressed }) => [
                styles.miniBtn,
                pressed && !saving && styles.pressed,
                (saving || !joinCode) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.miniText}>Share</Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="Invite email (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!saving}
          returnKeyType="next"
        />

        <TextInput
          value={invitePhone}
          onChangeText={setInvitePhone}
          placeholder="Invite phone (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType="phone-pad"
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <View style={styles.modalSpacer} />
      </>
    );
  }

  function renderModalFooter() {
    if (addMode === "guest") {
      return (
        <View style={styles.row}>
          <Pressable
            onPress={() => setAddMode("menu")}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={styles.modalBtnText}>Cancel</Text>
          </Pressable>

          <Pressable
            onPress={addGuest}
            disabled={saving}
            style={({ pressed }) => [
              styles.modalBtn,
              styles.modalBtnPrimary,
              pressed && !saving && styles.pressed,
              saving && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{saving ? "Saving..." : "Save guest"}</Text>
          </Pressable>
        </View>
      );
    }

    if (addMode === "invite") {
      return (
        <View style={styles.row}>
          <Pressable
            onPress={() => setAddMode("menu")}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={styles.modalBtnText}>Back</Text>
          </Pressable>

          <Pressable
            onPress={closeAdd}
            disabled={saving}
            style={({ pressed }) => [
              styles.modalBtn,
              styles.modalBtnPrimary,
              pressed && !saving && styles.pressed,
              saving && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Done</Text>
          </Pressable>
        </View>
      );
    }

    // menu
    return (
      <View style={styles.row}>
        <Pressable
          onPress={closeAdd}
          disabled={saving}
          style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.modalBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  function renderModalBody() {
    if (addMode === "guest") return <ModalGuestBody />;
    if (addMode === "invite") return <ModalInviteBody />;
    return <ModalMenuBody />;
  }

  return (
    <View style={styles.screen}>
      {/* Removed top-right "Setup" button. One clear path back via footer. */}
      <ScreenHeader navigation={navigation} title="Tournament Players" subtitle="Add players, then continue." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Players</Text>
          <Text style={styles.heroTitle}>{tournamentName}</Text>
          <Text style={styles.heroSub}>Add players for this tournament. Handicap is required so results stay clean and fair.</Text>
        </View>

        <View style={styles.joinCard}>
          <Text style={styles.joinLabel}>Join code</Text>
          <Text style={styles.joinCode} selectable>
            {joinCode || "—"}
          </Text>
          <Text style={styles.joinHint}>Copy or share the code to invite others.</Text>

          <View style={styles.joinRow}>
            <Pressable
              onPress={copyJoinCode}
              disabled={!joinCode}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed, !joinCode && { opacity: 0.6 }]}
            >
              <Text style={styles.miniText}>Copy code</Text>
            </Pressable>

            <Pressable
              onPress={shareInvite}
              disabled={!joinCode}
              style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed, !joinCode && { opacity: 0.6 }]}
            >
              <Text style={styles.miniText}>Share invite</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={openAddPlayer}
          disabled={saving}
          style={({ pressed }) => [styles.bigAddBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.bigAddText}>Add a Player</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Players</Text>

        {members.length ? (
          members.map((p, idx) => {
            const uid = String(p?.uid || p?.id || "");
            const isOwner = uid && ownerUid && uid === ownerUid;

            const name = String(p?.displayName || p?.name || `Player ${idx + 1}`).trim();
            const h = p?.handicap;
            const hNum =
              typeof h === "number"
                ? h
                : h === null || h === undefined || h === ""
                ? NaN
                : Number(String(h).trim());
            const hasHcp = Number.isFinite(hNum);

            return (
              <View key={uid || p.id || `p-${idx}`} style={styles.playerCard}>
                <View style={styles.playerTop}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={styles.hcpPill}>
                    <Text style={styles.hcpText}>{hasHcp ? `HCP ${hNum}` : "HCP ?"} </Text>
                  </View>
                </View>

                <Text style={styles.playerSub}>
                  {isOwner ? "Organizer" : p?.isGuest ? "Guest" : "Player"}
                  {"  •  "}
                  {hasHcp ? "Handicap set" : "Handicap required before continuing"}
                </Text>
              </View>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No players yet</Text>
            <Text style={styles.emptySub}>Tap “Add a Player” to add guests or invite others.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Pressable
            onPress={goToSetupHub}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryText}>Tournament Setup</Text>
          </Pressable>

          <Pressable
            onPress={handleContinue}
            disabled={saving || !canContinue}
            style={({ pressed }) => [
              styles.primaryBtn,
              (saving || !canContinue) && styles.primaryBtnDisabled,
              pressed && canContinue && !saving && styles.pressed,
            ]}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </View>

        {!canContinue ? (
          <View style={styles.helper}>
            <Text style={styles.helperText}>You need 2+ players, and everyone must have a handicap before continuing.</Text>
          </View>
        ) : null}
      </View>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <Pressable style={styles.modalOverlay} onPress={closeAdd}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShell}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView
                style={{ flexGrow: 0 }}
                contentContainerStyle={styles.modalBody}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {renderModalBody()}
              </ScrollView>

              <View style={styles.modalFooter}>{renderModalFooter()}</View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
