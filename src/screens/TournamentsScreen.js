import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import theme from "../theme";
import ROUTES from "../navigation/routes";

const BG = theme?.colors?.bg || theme?.bg || "#0B1220";

export default function TournamentsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.safe, { backgroundColor: BG }]}>
      <View style={[styles.headerWrap, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.goBack?.() || navigation.navigate(ROUTES.GAMES)}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Tournaments</Text>
          </View>

          <View style={styles.headerRightSpacer} />
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.heroCard}>
          <View style={styles.heroBorder} pointerEvents="none" />

          <View style={styles.heroTop}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="trophy-outline" size={20} color="rgba(255,255,255,0.90)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>Tournament Hub</Text>
              <Text style={styles.h2}>Foundation screen</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.copy}>
            This module will evolve into a full tournament engine: multi-round formats, leaderboards,
            customization, exports, and advanced stats.
          </Text>

          <View style={styles.comingSoonPill}>
            <Text style={styles.comingSoonText}>Coming soon</Text>
          </View>

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Later build-out</Text>
            <Text style={styles.noteText}>
              Tournament types, scoring rules, player pools, tee sets, payouts, brackets, reporting, and mobility.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

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
    backgroundColor: "rgba(15,122,74,0.22)",
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

  body: { flex: 1, padding: 16 },

  heroCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  heroBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.45)",
  },

  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },

  h1: { color: "#fff", fontSize: 20, fontWeight: "900" },
  h2: { marginTop: 4, color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "800" },

  divider: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  copy: { marginTop: 12, color: "rgba(255,255,255,0.78)", fontSize: 13, fontWeight: "700", lineHeight: 18 },

  comingSoonPill: {
    marginTop: 14,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.50)",
    backgroundColor: "rgba(15,122,74,0.16)",
  },
  comingSoonText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  noteCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.14)",
    padding: 14,
  },
  noteTitle: { color: "#fff", fontSize: 13, fontWeight: "900" },
  noteText: { marginTop: 8, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "700", lineHeight: 17 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
