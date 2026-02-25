// src/screens/ProfileScreen.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  Alert,
  Image,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "../firebase/firebase";
import ROUTES from "../navigation/routes";
import { getRounds } from "../storage/rounds";

const COLORS = {
  bg: "#0B1220",
  green: "#0F7A4A",
  gold: "rgba(242,201,76,0.85)",
};

const DEFAULT_PROFILE = {
  name: "",
  nickname: "",
  homeCourse: "",
  email: "",
  phone: "",
  photoUri: "",

  // Handicap single source of truth (Firestore user doc)
  handicapManual: null, // number | null
  handicapIndex: null, // number | null
  handicapSource: "manual", // "manual" | "calculated"

  equipmentBag: [],

  rounds: "18",
  avgScore: "85.2",
  best: "78",
  fairwaysHit: "52",
  gir: "34",
  puttsPerRound: "31.1",
  upAndDown: "18",
};

function formatHandicap(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function parseHandicapNumber(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [showIdentity, setShowIdentity] = useState(false);

  const signedInEmail = auth?.currentUser?.email || "";
  const uid = String(auth?.currentUser?.uid || "").trim();

  // Live user profile from Firestore (single source of truth)
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setProfile((p) => ({
            ...DEFAULT_PROFILE,
            email: signedInEmail || p.email || "",
          }));
          return;
        }

        const d = snap.data() || {};

        const dn = String(d.displayName || d.name || d.fullName || "").trim();
        const nn = String(d.nickname || d.nickName || "").trim();
        const hc = String(d.homeCourse || d.home_course || "").trim();
        const em = String(d.email || signedInEmail || "").trim();
        const ph = String(d.phone || "").trim();

        const photoUri = String(d.photoUri || d.photoURL || d.photoUrl || "").trim();

        const hIndexRaw = d.handicapIndex ?? d.handicap ?? d.handicapManual;
        const hManualRaw = d.handicapManual ?? d.handicap ?? null;

        const hIndex =
          typeof hIndexRaw === "number"
            ? hIndexRaw
            : hIndexRaw === null || hIndexRaw === undefined || hIndexRaw === ""
              ? null
              : Number(String(hIndexRaw).trim());

        const hManual =
          typeof hManualRaw === "number"
            ? hManualRaw
            : hManualRaw === null || hManualRaw === undefined || hManualRaw === ""
              ? null
              : Number(String(hManualRaw).trim());

        const safeIndex = Number.isFinite(hIndex) ? Math.round(hIndex * 10) / 10 : null;
        const safeManual = Number.isFinite(hManual) ? Math.round(hManual * 10) / 10 : null;

        const source = String(d.handicapSource || "").trim() || (safeIndex != null ? "calculated" : "manual");

        setProfile((prev) => ({
          ...DEFAULT_PROFILE,
          ...prev,

          name: dn || prev.name || "",
          nickname: nn || prev.nickname || "",
          homeCourse: hc || prev.homeCourse || "",
          email: em || prev.email || "",
          phone: ph || prev.phone || "",
          photoUri: photoUri || prev.photoUri || "",

          handicapIndex: safeIndex,
          handicapManual: safeManual,
          handicapSource: source === "calculated" ? "calculated" : "manual",

          equipmentBag: Array.isArray(d.equipmentBag) ? d.equipmentBag : prev.equipmentBag,

          rounds: String(d.rounds ?? prev.rounds ?? "18"),
          avgScore: String(d.avgScore ?? prev.avgScore ?? "85.2"),
          best: String(d.best ?? prev.best ?? "78"),
          fairwaysHit: String(d.fairwaysHit ?? prev.fairwaysHit ?? "52"),
          gir: String(d.gir ?? prev.gir ?? "34"),
          puttsPerRound: String(d.puttsPerRound ?? prev.puttsPerRound ?? "31.1"),
          upAndDown: String(d.upAndDown ?? prev.upAndDown ?? "18"),
        }));
      },
      () => {
        // leave current state
      }
    );

    return () => unsub();
  }, [uid, signedInEmail]);

  // Rounds played from Firestore rounds collection
  const loadRoundsPlayed = useCallback(async () => {
    try {
      const list = await getRounds();
      setRoundsPlayed(Array.isArray(list) ? list.length : 0);
    } catch {
      setRoundsPlayed(0);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoundsPlayed();
    }, [loadRoundsPlayed])
  );

  async function ensureImagePermissions() {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    return lib?.granted && cam?.granted;
  }

  async function pickFromLibrary() {
    const ok = await ensureImagePermissions();
    if (!ok) return;

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (res?.canceled) return;
    const uri = res?.assets?.[0]?.uri;
    if (!uri) return;

    setProfile((p) => ({ ...p, photoUri: uri }));
  }

  async function pickFromCamera() {
    const ok = await ensureImagePermissions();
    if (!ok) return;

    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (res?.canceled) return;
    const uri = res?.assets?.[0]?.uri;
    if (!uri) return;

    setProfile((p) => ({ ...p, photoUri: uri }));
  }

  function onPressAvatar() {
    if (!editing) return;
    Alert.alert("Profile Photo", "Choose a source", [
      { text: "Camera", onPress: pickFromCamera },
      { text: "Library", onPress: pickFromLibrary },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function onPressSignOut() {
    Alert.alert("Sign out", "Sign out of Legacy Golf on this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            setEditing(false);
            await signOut(auth);
          } catch (e) {
            Alert.alert("Sign out failed", String(e?.message || "Please try again."));
          }
        },
      },
    ]);
  }

  const initials = useMemo(() => {
    const n = (profile.name || "").trim();
    if (!n) return "LG";
    const parts = n.split(" ").filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
    return (a + b).toUpperCase() || "LG";
  }, [profile.name]);

  const displayName = useMemo(() => {
    const nn = String(profile.nickname || "").trim();
    if (nn) return nn;
    const full = String(profile.name || "").trim();
    return full || "—";
  }, [profile.nickname, profile.name]);

  const handicapDisplay = useMemo(() => {
    const v = profile.handicapIndex != null ? profile.handicapIndex : profile.handicapManual;
    return formatHandicap(v);
  }, [profile.handicapIndex, profile.handicapManual]);

  function openIdentity() {
    if (editing) return;
    setShowIdentity(true);
  }

  function closeIdentity() {
    setShowIdentity(false);
  }

  function goEquipment() {
    navigation.navigate(ROUTES.EQUIPMENT);
  }

  async function onDone() {
    Keyboard.dismiss();

    if (!uid) {
      Alert.alert("Not signed in", "Please sign in to save your profile.");
      return;
    }

    const n = String(profile.name || "").trim();
    const nn = String(profile.nickname || "").trim();
    const hc = String(profile.homeCourse || "").trim();
    const em = String(profile.email || "").trim();
    const ph = String(profile.phone || "").trim();

    const manual = parseHandicapNumber(profile.handicapManual);
    if (manual == null) {
      Alert.alert("Handicap required", "Please enter a valid handicap (example: 4.0).");
      return;
    }

    try {
      await setDoc(
        doc(db, "users", uid),
        {
          displayName: n,
          nickname: nn,
          homeCourse: hc,
          email: em,
          phone: ph,
          photoUri: String(profile.photoUri || "").trim(),

          // Handicap single source of truth (profile)
          handicapManual: manual,
          handicapIndex: manual,
          handicapSource: "manual",
          handicapUpdatedAt: serverTimestamp(),

          // Back-compat mirror
          handicap: manual,

          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setEditing(false);
      navigation.navigate(ROUTES.HOME);
    } catch (e) {
      Alert.alert("Save failed", String(e?.message || "Could not save profile."));
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.goBack?.() || navigation.navigate(ROUTES.HOME)}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Player Profile</Text>
          </View>

          {!editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={12}
              style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
            >
              <Text style={styles.headerPillText}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.headerRightSpacer} />
          )}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: editing ? 140 + insets.bottom : 28 + insets.bottom,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        <View style={styles.avatarRow}>
          <Pressable
            onPress={onPressAvatar}
            disabled={!editing}
            style={({ pressed }) => [
              styles.avatarLarge,
              editing && styles.avatarEditable,
              pressed && editing && styles.pressed,
            ]}
          >
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatarImg} />
            ) : (
              <>
                <Text style={styles.avatarTextLarge}>{initials}</Text>
                {editing ? (
                  <View style={styles.avatarBadgeLarge}>
                    <MaterialCommunityIcons name="camera-plus" size={16} color="rgba(255,255,255,0.92)" />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>

          {editing ? <Text style={styles.photoHint}>Tap photo to change</Text> : null}
        </View>

        <Pressable
          onPress={openIdentity}
          disabled={editing}
          style={({ pressed }) => [styles.cardStrong, styles.heroCard, !editing && pressed && styles.pressed]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nameBig} numberOfLines={1}>
              {displayName}
            </Text>

            <View style={styles.rowInline}>
              <MaterialCommunityIcons name="golf" size={16} color="rgba(255,255,255,0.72)" />
              <Text style={styles.subText} numberOfLines={1}>
                {profile.homeCourse || "—"}
              </Text>
            </View>

            <Text style={styles.identityHint} numberOfLines={1}>
              {editing ? "Editing enabled" : "Your identity for every round"}
            </Text>

            {!editing ? <Text style={styles.tapHint}>Tap to expand</Text> : null}
          </View>

          <View style={styles.hcpBox}>
            <Text style={styles.hcpLabel}>Handicap</Text>
            <Text style={styles.hcpValue}>{handicapDisplay}</Text>
          </View>
        </Pressable>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Profile Details</Text>
          <Text style={styles.sectionHint}>{editing ? "Update your info" : "Tap Edit to update"}</Text>
        </View>

        <View style={[styles.cardBase, styles.formCard]}>
          <Field
            icon="account"
            label="Name"
            value={profile.name}
            editing={editing}
            placeholder="Your full name"
            autoCapitalize="words"
            onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
          />

          <Field
            icon="account-star"
            label="Nickname"
            value={profile.nickname}
            editing={editing}
            placeholder="What friends call you"
            autoCapitalize="words"
            onChange={(v) => setProfile((p) => ({ ...p, nickname: v }))}
          />

          <Field
            icon="map-marker"
            label="Home Course"
            value={profile.homeCourse}
            editing={editing}
            placeholder="Course name"
            autoCapitalize="words"
            onChange={(v) => setProfile((p) => ({ ...p, homeCourse: v }))}
          />

          <Field
            icon="email"
            label="Email"
            value={profile.email}
            editing={editing}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
          />

          <Field
            icon="phone"
            label="Phone"
            value={profile.phone}
            editing={editing}
            placeholder="(###) ###-####"
            keyboardType="phone-pad"
            autoCapitalize="none"
            onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
          />

          <Field
            icon="percent"
            label="Handicap"
            value={String(profile.handicapManual ?? "")}
            editing={editing}
            placeholder="4.0"
            keyboardType="decimal-pad"
            autoCapitalize="none"
            onChange={(v) => setProfile((p) => ({ ...p, handicapManual: String(v || "").replace(/[^0-9.]/g, "") }))}
          />

          <EquipmentField onPress={goEquipment} />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Stats Snapshot</Text>
          <View style={styles.roundsPill}>
            <Text style={styles.roundsPillText}>Rounds Played</Text>
            <Text style={styles.roundsPillValue}>{roundsPlayed}</Text>
          </View>
        </View>

        <View style={[styles.cardBase, styles.statsCardWrap]}>
          <View style={styles.statsGrid}>
            <StatCard icon="trophy" label="Best" value={profile.best} />
            <StatCard icon="chart-line" label="Avg Score" value={profile.avgScore} />
            <StatCard icon="golf-tee" label="Fairways" value={`${profile.fairwaysHit}%`} />
            <StatCard icon="target" label="GIR" value={`${profile.gir}%`} />
            <StatCard icon="circle-slice-6" label="Putts/Rd" value={profile.puttsPerRound} />
            <StatCard icon="check-circle" label="Up & Down" value={`${profile.upAndDown}%`} />
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionHint} numberOfLines={1}>
            {signedInEmail ? signedInEmail : "Signed in"}
          </Text>
        </View>

        <View style={[styles.cardBase, styles.accountCard]}>
          <View style={styles.accountRow}>
            <View style={styles.accountIcon}>
              <MaterialCommunityIcons name="account-circle" size={18} color="rgba(255,255,255,0.88)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLabel}>Signed in as</Text>
              <Text style={styles.accountValue} numberOfLines={1}>
                {signedInEmail || "—"}
              </Text>
            </View>
          </View>

          <Pressable onPress={onPressSignOut} style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="logout-variant" size={18} color="#fff" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>

          <Text style={styles.accountFootnote}>
            Signing out returns you to the login screen. Your cloud data stays tied to this account.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={showIdentity} transparent animationType="fade" onRequestClose={closeIdentity}>
        <Pressable style={styles.modalOverlay} onPress={closeIdentity}>
          <Pressable style={[styles.modalCard, { marginTop: insets.top + 16 }]} onPress={() => { }}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Identity Card</Text>
              <Pressable
                onPress={closeIdentity}
                hitSlop={12}
                style={({ pressed }) => [styles.closePill, pressed && styles.pressed]}
              >
                <Text style={styles.closePillText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.modalDivider} />

            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Name</Text>
              <Text style={styles.modalValue}>{profile.name || "—"}</Text>
            </View>

            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Nickname</Text>
              <Text style={styles.modalValue}>{String(profile.nickname || "").trim() || "—"}</Text>
            </View>

            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Home Course</Text>
              <Text style={styles.modalValue}>{profile.homeCourse || "—"}</Text>
            </View>

            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Handicap</Text>
              <Text style={styles.modalValue}>{handicapDisplay}</Text>
            </View>

            <View style={styles.modalDivider} />

            <Text style={styles.modalNote}>This profile is your identity for every round.</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {editing ? (
        <View style={[styles.bottomBar, { paddingBottom: 14 + insets.bottom }]}>
          <Pressable onPress={onDone} style={({ pressed }) => [styles.donePill, pressed && styles.pressed]}>
            <Text style={styles.donePillText}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function EquipmentField({ onPress }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>Equipment</Text>

      <Pressable onPress={onPress} style={({ pressed }) => [styles.fieldShell, pressed && styles.pressed]}>
        <View style={styles.fieldIcon}>
          <MaterialCommunityIcons name="golf" size={18} color="rgba(255,255,255,0.78)" />
        </View>

        <View
          style={{
            flex: 1,
            paddingVertical: 13,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={styles.readOnlyText} numberOfLines={1}>
            Tap to manage your bag
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="rgba(255,255,255,0.55)" />
        </View>
      </Pressable>
    </View>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <View style={styles.statIcon}>
          <MaterialCommunityIcons name={icon} size={18} color="rgba(255,255,255,0.88)" />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
    </View>
  );
}

function Field({ icon, label, value, editing, onChange, keyboardType, autoCapitalize, placeholder }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <View style={[styles.fieldShell, editing && styles.fieldShellEditing]}>
        <View style={styles.fieldIcon}>
          <MaterialCommunityIcons name={icon} size={18} color="rgba(255,255,255,0.78)" />
        </View>

        {editing ? (
          <TextInput
            style={styles.input}
            value={value || ""}
            onChangeText={onChange}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            placeholder={placeholder || "—"}
            placeholderTextColor="rgba(255,255,255,0.35)"
            returnKeyType="done"
          />
        ) : (
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyText} numberOfLines={1}>
              {value || "—"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  headerPill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  headerPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.6 },
  headerRightSpacer: { minWidth: 70, height: 38 },

  cardBase: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.gold,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  cardStrong: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 24,
    padding: 16,
  },

  avatarRow: { alignItems: "center", marginTop: 8, marginBottom: 14 },
  photoHint: { marginTop: 10, color: "rgba(242,201,76,0.80)", fontSize: 12, fontWeight: "900" },

  avatarLarge: {
    width: 92,
    height: 92,
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarEditable: { borderColor: "rgba(46,125,255,0.32)" },
  avatarImg: { width: "100%", height: "100%" },
  avatarTextLarge: { color: "#fff", fontSize: 26, fontWeight: "900" },
  avatarBadgeLarge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroCard: {
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  nameBig: { color: "#fff", fontSize: 20, fontWeight: "900" },
  rowInline: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  subText: { color: "rgba(255,255,255,0.80)", fontWeight: "800", flexShrink: 1 },
  identityHint: { marginTop: 10, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },
  tapHint: { marginTop: 6, color: "rgba(242,201,76,0.82)", fontSize: 12, fontWeight: "900" },

  hcpBox: {
    backgroundColor: "rgba(15,122,74,0.30)",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.60)",
    alignItems: "center",
    minWidth: 104,
  },
  hcpLabel: { color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: "900" },
  hcpValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },

  sectionHeaderRow: {
    marginTop: 22,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionHint: { color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800", maxWidth: "55%" },

  roundsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  roundsPillText: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "900" },
  roundsPillValue: { color: "#fff", fontSize: 12, fontWeight: "900" },

  formCard: { marginTop: 0 },

  fieldLabel: { color: "rgba(255,255,255,0.76)", fontWeight: "900", marginBottom: 8 },

  fieldShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(15,122,74,0.70)",
    backgroundColor: "rgba(0,0,0,0.18)",
    overflow: "hidden",
  },
  fieldShellEditing: { borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(0,0,0,0.22)" },
  fieldIcon: {
    width: 46,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  input: { flex: 1, paddingVertical: 13, paddingHorizontal: 12, color: "#fff", fontSize: 16, fontWeight: "900" },
  readOnlyBox: { flex: 1, paddingVertical: 13, paddingHorizontal: 12 },
  readOnlyText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  statsCardWrap: { marginTop: 0 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  statCard: {
    width: "48%",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "rgba(15,122,74,0.75)",
    backgroundColor: "rgba(0,0,0,0.14)",
  },

  statTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { color: "rgba(255,255,255,0.80)", fontSize: 12, fontWeight: "900" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 10 },

  accountCard: { marginTop: 0 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountLabel: { color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: "900" },
  accountValue: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 4 },

  signOutBtn: {
    marginTop: 14,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.16)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  signOutText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  accountFootnote: { marginTop: 10, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(11,18,32,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  donePill: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.green,
    alignSelf: "center",
    width: "78%",
    maxWidth: 360,
  },
  donePillText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 16,
    paddingBottom: 18,
    justifyContent: "flex-start",
  },
  modalCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.gold,
    backgroundColor: "rgba(11,18,32,0.96)",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  closePill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  closePillText: { color: "#fff", fontSize: 13, fontWeight: "900" },

  modalDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 12,
  },
  modalRow: { marginTop: 10 },
  modalLabel: { color: "rgba(242,201,76,0.82)", fontSize: 12, fontWeight: "900" },
  modalValue: { marginTop: 6, color: "#fff", fontSize: 16, fontWeight: "900", lineHeight: 22 },
  modalNote: { color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: "800", lineHeight: 18 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});