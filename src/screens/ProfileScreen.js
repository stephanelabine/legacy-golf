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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/firebase";
import ROUTES from "../navigation/routes";

const PROFILE_KEY = "LEGACY_GOLF_PROFILE_V1";

const ROUND_KEYS_TO_TRY = [
  "LEGACY_GOLF_ROUNDS_V1",
  "LEGACY_GOLF_ROUNDS",
  "LEGACY_GOLF_HISTORY_V1",
  "LEGACY_GOLF_HISTORY",
  "LEGACY_GOLF_SAVED_ROUNDS_V1",
  "LEGACY_GOLF_SAVED_ROUNDS",
  "LEGACY_GOLF_ROUND_HISTORY_V1",
];

const DEFAULT_PROFILE = {
  name: "Stephane L",
  homeCourse: "Green Tee Golf & Country Club",
  email: "steph@example.com",
  phone: "",
  handicap: "12.4",
  photoUri: "",

  equipmentBag: [],

  rounds: "18",
  avgScore: "85.2",
  best: "78",
  fairwaysHit: "52",
  gir: "34",
  puttsPerRound: "31.1",
  upAndDown: "18",
};

function safeParse(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function formatHandicap(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [roundsPlayed, setRoundsPlayed] = useState(0);

  const signedInEmail = auth?.currentUser?.email || "";

  const loadProfile = useCallback(async () => {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    if (parsed) setProfile({ ...DEFAULT_PROFILE, ...parsed });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  async function persist(next) {
    setProfile(next);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }

  async function onDone() {
    Keyboard.dismiss();
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setEditing(false);
    navigation.navigate(ROUTES.HOME);
  }

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

    const next = { ...profile, photoUri: uri };
    await persist(next);
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

    const next = { ...profile, photoUri: uri };
    await persist(next);
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
            // RootNavigator will route to Login automatically.
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

  const handicapDisplay = formatHandicap(profile.handicap);

  const loadRoundsPlayed = useCallback(async () => {
    for (const key of ROUND_KEYS_TO_TRY) {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      const parsed = safeParse(raw);
      if (!parsed) continue;

      if (Array.isArray(parsed)) {
        setRoundsPlayed(parsed.length);
        return;
      }

      if (parsed && typeof parsed === "object") {
        const candidates = [parsed.rounds, parsed.items, parsed.history, parsed.savedRounds, parsed.data];

        for (const c of candidates) {
          if (Array.isArray(c)) {
            setRoundsPlayed(c.length);
            return;
          }
        }

        if (typeof parsed.count === "number" && Number.isFinite(parsed.count)) {
          setRoundsPlayed(parsed.count);
          return;
        }
      }
    }

    const fallback = Number(profile.rounds);
    setRoundsPlayed(Number.isFinite(fallback) ? fallback : 0);
  }, [profile.rounds]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
      loadRoundsPlayed();
    }, [loadProfile, loadRoundsPlayed])
  );

  function goEquipment() {
    navigation.navigate(ROUTES.EQUIPMENT);
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
          paddingBottom: editing ? 140 + insets.bottom : 24 + insets.bottom,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        <View style={styles.heroCard}>
          <Pressable
            onPress={onPressAvatar}
            disabled={!editing}
            style={({ pressed }) => [
              styles.avatar,
              editing && styles.avatarEditable,
              pressed && editing && styles.pressed,
            ]}
          >
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatarImg} />
            ) : (
              <>
                <Text style={styles.avatarText}>{initials}</Text>
                {editing ? (
                  <View style={styles.avatarBadge}>
                    <MaterialCommunityIcons name="camera-plus" size={14} color="rgba(255,255,255,0.90)" />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nameBig} numberOfLines={1}>
              {profile.name || "—"}
            </Text>

            <View style={styles.rowInline}>
              <MaterialCommunityIcons name="golf" size={16} color="rgba(255,255,255,0.70)" />
              <Text style={styles.subText} numberOfLines={1}>
                {profile.homeCourse || "—"}
              </Text>
            </View>

            <Text style={styles.identityHint} numberOfLines={1}>
              {editing ? "Editing enabled" : "Your identity for every round"}
            </Text>
          </View>

          <View style={styles.hcpBox}>
            <Text style={styles.hcpLabel}>Handicap</Text>
            <Text style={styles.hcpValue}>{handicapDisplay}</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Profile Details</Text>
          <Text style={styles.sectionHint}>{editing ? "Update your info" : "Tap Edit to update"}</Text>
        </View>

        <View style={styles.formCard}>
          <Field
            icon="account"
            label="Name"
            value={profile.name}
            editing={editing}
            placeholder="Your name"
            autoCapitalize="words"
            onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
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
            value={String(profile.handicap ?? "")}
            editing={editing}
            placeholder="12.4"
            keyboardType="decimal-pad"
            autoCapitalize="none"
            onChange={(v) => setProfile((p) => ({ ...p, handicap: v }))}
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

        <View style={styles.statsGrid}>
          <StatCard icon="trophy" label="Best" value={profile.best} />
          <StatCard icon="chart-line" label="Avg Score" value={profile.avgScore} />
          <StatCard icon="golf-tee" label="Fairways" value={`${profile.fairwaysHit}%`} />
          <StatCard icon="target" label="GIR" value={`${profile.gir}%`} />
          <StatCard icon="circle-slice-6" label="Putts/Rd" value={profile.puttsPerRound} />
          <StatCard icon="check-circle" label="Up & Down" value={`${profile.upAndDown}%`} />
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionHint} numberOfLines={1}>
            {signedInEmail ? signedInEmail : "Signed in"}
          </Text>
        </View>

        <View style={styles.accountCard}>
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

          <Pressable
            onPress={onPressSignOut}
            style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="logout-variant" size={18} color="#fff" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>

          <Text style={styles.accountFootnote}>
            Signing out returns you to the login screen. Your cloud data stays tied to this account.
          </Text>
        </View>
      </ScrollView>

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

const COLORS = {
  bg: "#0B1220",
  green: "#0F7A4A",
};

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

  heroCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  avatar: {
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarEditable: { borderColor: "rgba(46,125,255,0.32)" },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  avatarBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },

  nameBig: { color: "#fff", fontSize: 18, fontWeight: "900" },
  rowInline: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8 },
  subText: { color: "rgba(255,255,255,0.78)", fontWeight: "800", flexShrink: 1 },
  identityHint: { marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800" },

  hcpBox: {
    backgroundColor: "rgba(15,122,74,0.28)",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.55)",
    alignItems: "center",
    minWidth: 120,
  },
  hcpLabel: { color: "rgba(255,255,255,0.86)", fontSize: 12, fontWeight: "900" },
  hcpValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },

  sectionHeaderRow: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionHint: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800", maxWidth: "55%" },

  roundsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  roundsPillText: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "900" },
  roundsPillValue: { color: "#fff", fontSize: 12, fontWeight: "900" },

  formCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  fieldLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", marginBottom: 8 },

  fieldShell: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    overflow: "hidden",
  },
  fieldShellEditing: { borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(0,0,0,0.22)" },
  fieldIcon: {
    width: 46,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  input: { flex: 1, paddingVertical: 13, paddingHorizontal: 12, color: "#fff", fontSize: 16, fontWeight: "900" },
  readOnlyBox: { flex: 1, paddingVertical: 13, paddingHorizontal: 12 },
  readOnlyText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },

  statCard: {
    width: "48%",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.55)",
    backgroundColor: "rgba(255,255,255,0.04)",
    shadowColor: COLORS.green,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  statTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: "900" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 10 },

  accountCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountLabel: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "900" },
  accountValue: { color: "#fff", fontSize: 16, fontWeight: "900", marginTop: 4 },

  signOutBtn: {
    marginTop: 14,
    height: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  signOutText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  accountFootnote: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800" },

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

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
