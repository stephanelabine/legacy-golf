import React, { useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import theme from "../theme";
import gameFormats from "../data/gameFormats.json";
import ROUTES from "../navigation/routes";

/* ───────────────── ICON MAP (colored) ───────────────── */
const ICONS = {
  legacy_card: { name: "cards-diamond", color: "rgba(255, 210, 92, 0.95)" }, // gold diamond
  stroke_play: { name: "golf", color: "rgba(255,255,255,0.92)" }, // golf club/ball
  match_play: { name: "account-group", color: "rgba(255,255,255,0.90)" }, // players vs players
  kps: { name: "target", color: "rgba(255,255,255,0.90)" }, // closest to pin target
  skins: { name: "cash-multiple", color: "rgba(255,255,255,0.90)" }, // winnings
  two_v_two: { name: "account-group-outline", color: "rgba(255,255,255,0.90)" }, // teams
  nassau: { name: "view-week", color: "rgba(255,255,255,0.90)" }, // front/back/total lanes
  stableford: { name: "plus-circle", color: "rgba(255,255,255,0.90)" }, // points
  wolf: { name: "paw", color: "rgba(255,255,255,0.90)" }, // wolf
  snake: { name: "snake", color: "rgba(255,255,255,0.90)" }, // snake
  legacy_points: { name: "trophy", color: "rgba(255,255,255,0.92)" }, // points/trophy
};

export default function GameSetupScreen({ navigation, route }) {
  const { gameId, gameTitle } = route?.params || {};

  const game = useMemo(() => {
    if (!gameId) return null;
    return gameFormats?.[gameId] || { title: gameTitle || "Game", subtitle: "" };
  }, [gameId, gameTitle]);

  const isLegacy = gameId === "legacy_card";
  const iconSpec = ICONS[gameId] || { name: "circle-small", color: "rgba(255,255,255,0.80)" };

  const [scoringMode, setScoringMode] = useState("net");
  const [wagersEnabled, setWagersEnabled] = useState(false);

  function goNext() {
    if (!gameId) {
      Alert.alert("Missing game selection");
      return;
    }

    navigation.navigate(ROUTES.NEW_ROUND, {
      gameId,
      gameTitle: game?.title || gameTitle || "Game",
      scoringMode,
      wagersEnabled,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.topWrap, isLegacy && styles.topWrapLegacy]}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={[styles.top, isLegacy && styles.topLegacy]}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={({ pressed }) => [
                styles.backBtn,
                isLegacy && styles.backBtnLegacy,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <View style={[styles.badge, isLegacy && styles.badgeLegacy]}>
              <Text style={[styles.badgeText, isLegacy && styles.badgeTextLegacy]}>GAME SETUP</Text>
            </View>
          </View>

          {/* TITLE ROW (icon circle beside title) */}
          <View style={styles.titleRow}>
            <View style={[styles.formatIcon, isLegacy && styles.formatIconLegacy]}>
              <MaterialCommunityIcons name={iconSpec.name} size={20} color={iconSpec.color} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>{game?.title || "Game Setup"}</Text>
              {!!game?.subtitle && <Text style={styles.h2}>{game.subtitle}</Text>}
            </View>
          </View>

          <View style={[styles.accentLine, isLegacy && styles.accentLineLegacy]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* SCORING */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>Scoring</Text>
            <Text style={styles.cardHint}>Choose Net or Gross</Text>
          </View>

          <View style={styles.seg}>
            <Pressable
              onPress={() => setScoringMode("net")}
              style={({ pressed }) => [
                styles.segBtn,
                scoringMode === "net" && styles.segBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.segText, scoringMode === "net" && styles.segTextActive]}>Net</Text>
              <Text style={[styles.segSub, scoringMode === "net" && styles.segSubActive]}>Handicap adjusted</Text>
            </Pressable>

            <Pressable
              onPress={() => setScoringMode("gross")}
              style={({ pressed }) => [
                styles.segBtn,
                scoringMode === "gross" && styles.segBtnActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.segText, scoringMode === "gross" && styles.segTextActive]}>Gross</Text>
              <Text style={[styles.segSub, scoringMode === "gross" && styles.segSubActive]}>Raw strokes</Text>
            </Pressable>
          </View>

          <View style={styles.divider} pointerEvents="none" />
          <Text style={styles.help}>Net uses handicaps to keep it fair. Gross is the pure score.</Text>
        </View>

        {/* WAGERS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>Wagers</Text>
            <Text style={styles.cardHint}>Optional</Text>
          </View>

          <Pressable
            onPress={() => setWagersEnabled((v) => !v)}
            style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Enable wagers</Text>
              <Text style={styles.toggleSub}>Totals will be calculated at the end.</Text>
            </View>

            <View style={[styles.switchOuter, wagersEnabled && styles.switchOuterOn]}>
              <View style={[styles.switchKnob, wagersEnabled && styles.switchKnobOn]} />
            </View>
          </Pressable>
        </View>

        {/* COMING NEXT */}
        <Text style={styles.sectionTitle}>Next to build</Text>

        <View style={styles.miniCard}>
          <View style={styles.miniTop}>
            <Text style={styles.miniTitle}>Players</Text>
            <Text style={styles.miniTag}>Guests + Buddy List</Text>
          </View>
          <Text style={styles.miniBody}>Add guests, select from Buddy List, and enable QR join.</Text>
        </View>

        <View style={styles.miniCard}>
          <View style={styles.miniTop}>
            <Text style={styles.miniTitle}>Handicaps</Text>
            <Text style={styles.miniTag}>Fair play</Text>
          </View>
          <Text style={styles.miniBody}>Per-player handicap fields and tee-aware calculations.</Text>
        </View>

        <View style={styles.miniCard}>
          <View style={styles.miniTop}>
            <Text style={styles.miniTitle}>Game rules</Text>
            <Text style={styles.miniTag}>Per format</Text>
          </View>
          <Text style={styles.miniBody}>Presses, carryovers, KP holes, and format-specific options.</Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={goNext} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Next: Course Selection</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const GOLD = "rgba(255, 210, 92, 0.92)";
const GOLD_SOFT = "rgba(255, 210, 92, 0.28)";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  topWrap: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  topWrapLegacy: {
    borderBottomColor: "rgba(255, 210, 92, 0.14)",
  },

  topGlowA: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(46,125,255,0.20)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  top: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  topLegacy: {
    paddingBottom: 14,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backBtnLegacy: {
    borderColor: "rgba(255, 210, 92, 0.18)",
    backgroundColor: "rgba(255, 210, 92, 0.06)",
  },
  backText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  badgeLegacy: {
    borderColor: "rgba(255, 210, 92, 0.22)",
    backgroundColor: "rgba(255, 210, 92, 0.10)",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1.2, opacity: 0.85 },
  badgeTextLegacy: { color: GOLD, opacity: 1 },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },

  formatIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 2,
  },
  formatIconLegacy: {
    borderColor: "rgba(255, 210, 92, 0.28)",
    backgroundColor: "rgba(255, 210, 92, 0.10)",
  },

  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 0.2, lineHeight: 34 },
  h2: { marginTop: 8, color: "#fff", opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  accentLine: {
    marginTop: 14,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  accentLineLegacy: {
    height: 2,
    backgroundColor: GOLD_SOFT,
  },

  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 },

  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 12,
  },

  cardHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  cardLabel: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  cardHint: { color: "#fff", opacity: 0.55, fontSize: 12, fontWeight: "800" },

  seg: { marginTop: 14, flexDirection: "row", gap: 10 },
  segBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  segBtnActive: {
    borderColor: "rgba(46,125,255,0.65)",
    backgroundColor: "rgba(46,125,255,0.14)",
  },
  segText: { color: "#fff", opacity: 0.9, fontSize: 15, fontWeight: "900" },
  segTextActive: { opacity: 1 },
  segSub: { marginTop: 6, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "800" },
  segSubActive: { opacity: 0.78 },

  divider: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  help: { marginTop: 12, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  toggleRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  toggleTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  toggleSub: { marginTop: 6, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  switchOuter: {
    width: 56,
    height: 34,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  switchOuterOn: {
    borderColor: "rgba(46,125,255,0.55)",
    backgroundColor: "rgba(46,125,255,0.18)",
  },
  switchKnob: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.70)",
    transform: [{ translateX: 0 }],
  },
  switchKnobOn: {
    backgroundColor: "rgba(255,255,255,0.92)",
    transform: [{ translateX: 20 }],
  },

  sectionTitle: {
    marginTop: 12,
    marginBottom: 10,
    color: "#fff",
    opacity: 0.7,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },

  miniCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    marginBottom: 10,
  },
  miniTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  miniTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  miniTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
    opacity: 0.9,
  },
  miniBody: { marginTop: 10, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.colors?.bg || "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  primaryBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
