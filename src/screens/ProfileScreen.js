import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PROFILE_KEY = "LEGACY_GOLF_PROFILE_V1";

const DEFAULT_PROFILE = {
  name: "Steph",
  homeCourse: "Green Tee Golf & Country Club",
  email: "steph@example.com",
  handicap: "12.4",

  // Stats
  rounds: "18",
  avgScore: "85.2",
  best: "78",
  fairwaysHit: "52",
  gir: "34",
  puttsPerRound: "31.1",
  upAndDown: "18",
};

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (raw) setProfile(JSON.parse(raw));
    })();
  }, []);

  async function saveProfile(next) {
    setProfile(next);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  }

  async function onDone() {
    setEditing(false);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  async function onReset() {
    setEditing(false);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(DEFAULT_PROFILE));
    setProfile(DEFAULT_PROFILE);
  }

  const initials = useMemo(() => {
    const n = (profile.name || "").trim();
    if (!n) return "LG";
    const parts = n.split(" ").filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    return (a + b).toUpperCase() || "LG";
  }, [profile.name]);

  const handicapNumber = Number(profile.handicap);
  const handicapDisplay = Number.isFinite(handicapNumber)
    ? handicapNumber.toFixed(1)
    : profile.handicap || "—";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.navigate("Home")}
            activeOpacity={0.8}
            style={styles.logoBox}
          >
            <Text style={styles.logoText}>LG</Text>
          </TouchableOpacity>

          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitle}>Player Profile</Text>
            <Text style={styles.headerSub}>
              {editing ? "Editing… (saves when you tap Done)" : "Your stats & equipment"}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {editing ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={onDone}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setEditing(true)}>
              <Text style={styles.primaryBtnText}>Edit</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.ghostBtn} onPress={onReset}>
            <Text style={styles.ghostBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.nameBig}>{profile.name || "—"}</Text>
            <Text style={styles.subText}>Home course: {profile.homeCourse || "—"}</Text>
          </View>

          <View style={styles.handicapBox}>
            <Text style={styles.handicapLabel}>Handicap</Text>
            <Text style={styles.handicapValue}>{handicapDisplay}</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <StatCard label="Rounds" value={profile.rounds} />
          <StatCard label="Avg Score" value={profile.avgScore} />
          <StatCard label="Best" value={profile.best} />
          <StatCard label="Fairways" value={`${profile.fairwaysHit}%`} />
          <StatCard label="GIR" value={`${profile.gir}%`} />
          <StatCard label="Putts/Rd" value={profile.puttsPerRound} />
          <StatCard label="Up & Down" value={`${profile.upAndDown}%`} />
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <Field
            label="Name"
            value={profile.name}
            editing={editing}
            onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
          />

          <Field
            label="Home Course"
            value={profile.homeCourse}
            editing={editing}
            onChange={(v) => setProfile((p) => ({ ...p, homeCourse: v }))}
          />

          <Field
            label="Email"
            value={profile.email}
            editing={editing}
            keyboardType="email-address"
            autoCapitalize="none"
            onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
          />

          <Field
            label="Handicap"
            value={profile.handicap}
            editing={editing}
            keyboardType="decimal-pad"
            onChange={(v) => setProfile((p) => ({ ...p, handicap: v }))}
          />

          {editing ? (
            <TouchableOpacity
              style={[styles.saveInlineBtn, { marginTop: 14 }]}
              onPress={async () => saveProfile(profile)}
            >
              <Text style={styles.saveInlineText}>Save Now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  keyboardType,
  autoCapitalize,
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editing ? (
        <TextInput
          style={styles.input}
          value={value || ""}
          onChangeText={onChange}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholder="—"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
      ) : (
        <View style={styles.readOnlyBox}>
          <Text style={styles.readOnlyText}>{value || "—"}</Text>
        </View>
      )}
    </View>
  );
}

const COLORS = {
  bg: "#0E3A5A",
  card: "#133E5E",
  line: "rgba(255,255,255,0.10)",
  white: "#FFFFFF",
  sub: "rgba(255,255,255,0.78)",
  green: "#1E7F4F",
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.72)", marginTop: 3, fontSize: 12 },

  primaryBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  ghostBtn: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },

  topCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  nameBig: { color: "#fff", fontSize: 18, fontWeight: "900" },
  subText: { color: COLORS.sub, marginTop: 4 },

  handicapBox: {
    backgroundColor: "rgba(30,127,79,0.35)",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(30,127,79,0.55)",
    alignItems: "center",
    minWidth: 90,
  },
  handicapLabel: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "800" },
  handicapValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 2 },

  statsGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statCard: {
    width: "48%",
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  statLabel: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "700" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 8 },

  sectionCard: {
    marginTop: 14,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
  },
  sectionTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },

  fieldLabel: { color: "rgba(255,255,255,0.75)", marginTop: 10, marginBottom: 8 },

  input: {
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: "#fff",
    fontSize: 16,
  },

  readOnlyBox: {
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  readOnlyText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  saveInlineBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveInlineText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
