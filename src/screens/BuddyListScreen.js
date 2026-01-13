// src/screens/BuddyListScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";

import theme from "../theme";
import ScreenHeader from "../components/ScreenHeader";
import { getBuddies, saveBuddies } from "../storage/buddies";

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function clampHandicap(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(36, n));
}

function cleanPhone(s) {
  return (s || "").replace(/[^\d]/g, "");
}

function isValidEmail(email) {
  const e = (email || "").trim();
  if (!e) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export default function BuddyListScreen({ navigation }) {
  const [buddies, setBuddies] = useState([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editHandicap, setEditHandicap] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");

  async function load() {
    try {
      const list = await getBuddies();
      setBuddies(Array.isArray(list) ? list : []);
    } catch {
      setBuddies([]);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await load();
    })();

    const unsub = navigation?.addListener?.("focus", load);

    return () => {
      mounted = false;
      if (typeof unsub === "function") unsub();
    };
  }, [navigation]);

  const canAdd = useMemo(() => (name || "").trim().length > 0, [name]);

  async function persist(next) {
    setSaving(true);
    const ok = await saveBuddies(next);
    setSaving(false);
    if (!ok) Alert.alert("Error", "Could not save buddies.");
  }

  async function onAdd() {
    const trimmed = (name || "").trim();
    if (!trimmed) return;

    if (!isValidEmail(email)) {
      Alert.alert("Email", "That email doesn't look valid.");
      return;
    }

    const exists = buddies.some((b) => (b?.name || "").toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      Alert.alert("Already added", "That buddy is already on your list.");
      return;
    }

    const h = clampHandicap(Number.parseInt((handicap || "").trim() || "0", 10));
    const p = cleanPhone(phone);
    const e = (email || "").trim();

    const next = [{ id: makeId(), name: trimmed, handicap: h, phone: p, email: e, notes: "" }, ...buddies];

    setBuddies(next);
    setName("");
    setHandicap("");
    setPhone("");
    setEmail("");
    Keyboard.dismiss();
    await persist(next);
  }

  function openEdit(buddy) {
    setEditing(buddy);
    setEditName(buddy?.name || "");
    setEditHandicap(String(buddy?.handicap ?? 0));
    setEditPhone(buddy?.phone || "");
    setEditEmail(buddy?.email || "");
    setEditNotes(buddy?.notes || "");
  }

  function closeEdit() {
    Keyboard.dismiss();
    setEditing(null);
    setEditName("");
    setEditHandicap("");
    setEditPhone("");
    setEditEmail("");
    setEditNotes("");
  }

  async function saveEdit() {
    if (!editing) return;

    const trimmed = (editName || "").trim();
    if (!trimmed) {
      Alert.alert("Name required", "Buddy name can't be blank.");
      return;
    }

    if (!isValidEmail(editEmail)) {
      Alert.alert("Email", "That email doesn't look valid.");
      return;
    }

    const h = clampHandicap(Number.parseInt((editHandicap || "").trim() || "0", 10));
    const p = cleanPhone(editPhone);
    const e = (editEmail || "").trim();
    const notes = (editNotes || "").trim();

    const next = buddies.map((b) =>
      b.id === editing.id ? { ...b, name: trimmed, handicap: h, phone: p, email: e, notes } : b
    );

    setBuddies(next);
    closeEdit();
    await persist(next);
  }

  async function onDelete(id) {
    const next = buddies.filter((b) => b.id !== id);
    setBuddies(next);
    await persist(next);
  }

  function formatPhoneForDisplay(digits) {
    const s = (digits || "").trim();
    if (!s) return "";
    if (s.length === 10) return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
    return s;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Buddies" subtitle="Your saved players" />

      <View style={styles.card}>
        <Text style={styles.label}>Add a buddy</Text>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="words"
            returnKeyType="done"
          />

          <TextInput
            style={styles.hcapInput}
            value={handicap}
            onChangeText={setHandicap}
            placeholder="HCP"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="number-pad"
            maxLength={2}
          />

          <Pressable
            onPress={onAdd}
            disabled={!canAdd || saving}
            style={({ pressed }) => [
              styles.addBtn,
              (!canAdd || saving) && styles.addBtnDisabled,
              pressed && canAdd && !saving && styles.pressed,
            ]}
          >
            <Text style={styles.addBtnText}>{saving ? "Saving…" : "Add"}</Text>
          </Pressable>
        </View>

        <View style={styles.row2}>
          <TextInput
            style={styles.input2}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone (optional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input2}
            value={email}
            onChangeText={setEmail}
            placeholder="Email (optional)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <Text style={styles.smallNote}>Tap a buddy to edit details. Handicap max 36. Phone/email optional.</Text>
      </View>

      <FlatList
        data={buddies}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openEdit(item)}
            style={({ pressed }) => [styles.buddyRow, pressed && styles.pressed]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.buddyName} numberOfLines={1}>
                {item.name}
              </Text>

              <Text style={styles.buddyMeta}>
                HCP: {item.handicap ?? 0}
                {(item.phone || item.email) ? " • " : ""}
                {item.phone ? formatPhoneForDisplay(item.phone) : ""}
                {item.phone && item.email ? " • " : ""}
                {item.email ? item.email : ""}
              </Text>

              {item.notes ? (
                <Text style={styles.buddyMeta2} numberOfLines={1}>
                  {item.notes}
                </Text>
              ) : null}
            </View>

            <Pressable
              onPress={(e) => {
                // Prevent the parent row onPress from firing.
                e?.stopPropagation?.();
                onDelete(item.id);
              }}
              style={({ pressed }) => [styles.delBtn, pressed && styles.pressed]}
            >
              <Text style={styles.delText}>Delete</Text>
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
            <Text style={styles.empty}>No buddies yet — add your first one above.</Text>
          </View>
        }
      />

      {/* Edit modal: premium keyboard-safe layout (Save/Cancel always reachable) */}
      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          {/* Backdrop closes the modal */}
          <Pressable style={styles.modalBackdrop} onPress={closeEdit} />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKav}
          >
            {/* Tapping inside card dismisses keyboard (does NOT close modal) */}
            <Pressable style={styles.modalCard} onPress={Keyboard.dismiss}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}
              >
                <Text style={styles.modalTitle}>Edit Buddy</Text>

                <TextInput
                  style={styles.modalInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Name"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="words"
                  returnKeyType="next"
                />

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    value={editHandicap}
                    onChangeText={setEditHandicap}
                    placeholder="Handicap (0–36)"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="number-pad"
                    maxLength={2}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={[styles.modalInput, { flex: 2 }]}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="Phone"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="phone-pad"
                    returnKeyType="next"
                  />
                </View>

                <TextInput
                  style={styles.modalInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                />

                <TextInput
                  style={[styles.modalInput, styles.modalNotes]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  placeholder="Notes (optional)"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  multiline
                  textAlignVertical="top"
                  returnKeyType="done"
                />

                {/* Spacer so content never sits under sticky buttons */}
                <View style={{ height: 10 }} />
              </ScrollView>

              {/* Sticky action bar (always visible above keyboard) */}
              <View style={styles.modalStickyBar}>
                <Pressable
                  onPress={closeEdit}
                  style={({ pressed }) => [styles.modalBtn, styles.modalBtnGhost, pressed && styles.pressed]}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={saveEdit}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.modalBtnText}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  card: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  label: { color: "#fff", fontWeight: "900", opacity: 0.9 },
  smallNote: { marginTop: 10, color: "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 12 },

  row: { marginTop: 10, flexDirection: "row", gap: 10 },
  row2: { marginTop: 10, flexDirection: "row", gap: 10 },

  input: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  input2: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  hcapInput: {
    width: 64,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 10,
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  addBtn: {
    width: 92,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 5 },
    }),
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: "#fff", fontWeight: "900" },

  buddyRow: {
    marginBottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  buddyName: { color: "#fff", fontWeight: "900", fontSize: 16 },
  buddyMeta: { marginTop: 4, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },
  buddyMeta2: { marginTop: 4, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 12 },

  delBtn: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  delText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  empty: { color: "rgba(255,255,255,0.6)", fontWeight: "800" },

  // Modal layout: backdrop + KAV + sticky action bar
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 16,
    justifyContent: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKav: {
    width: "100%",
  },
  modalCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#0B1220",
    overflow: "hidden",
  },
  modalContent: {
    padding: 14,
    paddingBottom: 6,
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 10 },

  modalInput: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  modalNotes: {
    height: 90,
    paddingTop: 12,
    paddingBottom: 12,
  },

  modalStickyBar: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#0B1220",
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
  },
  modalBtnGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalBtnText: { color: "#fff", fontWeight: "900" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
