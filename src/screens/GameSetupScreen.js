// src/screens/GameSetupScreen.js
import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import gameFormats from "../data/gameFormats.json";
import ROUTES from "../navigation/routes";

/* ───────────────── ICON MAP (colored) ───────────────── */
const ICONS = {
  legacy_card: { name: "cards-diamond", color: "rgba(255, 210, 92, 0.95)" },

  stroke_play: { name: "golf", color: "rgba(255,255,255,0.92)" },
  match_play: { name: "trophy-outline", color: "rgba(255,255,255,0.90)" },

  one_v_one: { name: "account", color: "rgba(255,255,255,0.92)" },
  two_v_two: { name: "account-group-outline", color: "rgba(255,255,255,0.90)" },
  team_vs_team: { name: "account-group", color: "rgba(255,255,255,0.90)" },

  nassau: { name: "view-week", color: "rgba(255,255,255,0.90)" },
  stableford: { name: "plus-circle", color: "rgba(255,255,255,0.90)" },
  wolf: { name: "paw", color: "rgba(255,255,255,0.90)" },

  birdie_buckets: { name: "bucket-outline", color: "rgba(255,255,255,0.90)" },

  skins: { name: "cash-multiple", color: "rgba(255,255,255,0.90)" },
  kps: { name: "target", color: "rgba(255,255,255,0.90)" },

  // NOTE: snake stays a "format"/side-game concept later — not a main game tile
  snake: { name: "snake", color: "rgba(255,255,255,0.90)" },

  legacy_points: { name: "trophy", color: "rgba(255,255,255,0.92)" },
};

const BG = theme?.colors?.bg || theme?.bg || "#0B1220";
const PRIMARY = theme?.colors?.primary || theme?.accent || "#2E7DFF";

const GOLD = "rgba(255, 210, 92, 0.95)";
const GOLD_SOFT = "rgba(255, 210, 92, 0.22)";
const GREEN_BORDER = "rgba(46,204,113,0.70)";

export default function GameSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { gameId, gameTitle } = route?.params || {};

  const game = useMemo(() => {
    if (!gameId) return null;
    return gameFormats?.[gameId] || { title: gameTitle || "Game", subtitle: "" };
  }, [gameId, gameTitle]);

  const isPremiumGold = gameId === "legacy_card";
  const iconSpec =
    ICONS[gameId] || { name: "circle-small", color: "rgba(255,255,255,0.80)" };

  const [scoringMode, setScoringMode] = useState("net");

  function goNext() {
    if (!gameId) {
      Alert.alert("Missing game selection");
      return;
    }

    navigation.navigate(ROUTES.NEW_ROUND, {
      gameId,
      gameTitle: game?.title || gameTitle || "Game",
      scoringMode, // "net" or "gross"
      wagers: null, // explicitly none (regular games will mirror tournaments)
    });
  }

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const isGross = scoringMode === "gross";
  const isNet = scoringMode === "net";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <View style={[styles.topWrap, isPremiumGold && styles.topWrapLegacy]}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={[styles.top, isPremiumGold && styles.topLegacy]}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              style={({ pressed }) => [
                styles.backBtn,
                isPremiumGold && styles.backBtnLegacy,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <View style={[styles.badge, isPremiumGold && styles.badgeLegacy]}>
              <Text
                style={[
                  styles.badgeText,
                  isPremiumGold && styles.badgeTextLegacy,
                ]}
              >
                GAME SETUP
              </Text>
            </View>
          </View>

          <View style={styles.titleRow}>
            <View style={[styles.formatIcon, isPremiumGold && styles.formatIconLegacy]}>
              <MaterialCommunityIcons
                name={iconSpec.name}
                size={20}
                color={iconSpec.color}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>{game?.title || "Game Setup"}</Text>
              {!!game?.subtitle && <Text style={styles.h2}>{game.subtitle}</Text>}
            </View>
          </View>

          <View style={[styles.accentLine, isPremiumGold && styles.accentLineLegacy]} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.mainContent,
          { paddingBottom: footerPad + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* SINGLE premium box with thick gold border, centered Net/Gross choices */}
        <View style={styles.goldHero}>
          <View style={styles.goldHeroInner}>
            <Text style={styles.goldKicker}>SCORING MODE</Text>
            <Text style={styles.goldTitle}>Net or Gross</Text>
            <Text style={styles.goldSub}>Choose whether handicaps apply.</Text>

            <View style={styles.choiceWrap}>
              {/* GROSS */}
              <Pressable
                onPress={() => setScoringMode("gross")}
                style={({ pressed }) => [
                  styles.choiceBox,
                  !isGross && styles.choiceBoxDim,
                  isGross && styles.choiceBoxActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.choiceTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.choiceTitle, isGross && styles.choiceTitleActive]}>
                      Gross
                    </Text>
                  </View>

                  {isGross ? (
                    <View style={styles.selectedPill}>
                      <MaterialCommunityIcons
                        name="check"
                        size={14}
                        color={GOLD}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.selectedPillText}>SELECTED</Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedPill}>
                      <Text style={styles.unselectedPillText}>TAP</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.choiceDesc, isGross && styles.choiceDescActive]}>
                  Raw strokes
                </Text>
              </Pressable>

              {/* NET */}
              <Pressable
                onPress={() => setScoringMode("net")}
                style={({ pressed }) => [
                  styles.choiceBox,
                  !isNet && styles.choiceBoxDim,
                  isNet && styles.choiceBoxActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.choiceTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.choiceTitle, isNet && styles.choiceTitleActive]}>
                      Net
                    </Text>
                  </View>

                  {isNet ? (
                    <View style={styles.selectedPill}>
                      <MaterialCommunityIcons
                        name="check"
                        size={14}
                        color={GOLD}
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.selectedPillText}>SELECTED</Text>
                    </View>
                  ) : (
                    <View style={styles.unselectedPill}>
                      <Text style={styles.unselectedPillText}>TAP</Text>
                    </View>
                  )}
                </View>

                <Text style={[styles.choiceDesc, isNet && styles.choiceDescActive]}>
                  Handicap adjusted
                </Text>
              </Pressable>
            </View>

            <View style={styles.microNoteWrap}>
              <Text style={styles.microNote}>
                {scoringMode === "net"
                  ? "Net uses handicaps for fairness."
                  : "Gross is pure strokes (no handicaps)."}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPad, backgroundColor: BG }]}>
        <Pressable
          onPress={goNext}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Next: Course Selection</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  topWrap: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  topWrapLegacy: { borderBottomColor: "rgba(255, 210, 92, 0.14)" },

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

  top: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  topLegacy: { paddingBottom: 14 },

  topRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },

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

  accentLine: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },
  accentLineLegacy: { height: 2, backgroundColor: GOLD_SOFT },

  mainContent: { paddingHorizontal: 16, paddingTop: 14 },

  goldHero: {
    borderRadius: 24,
    borderWidth: 5,
    borderColor: "rgba(255, 210, 92, 0.92)",
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    marginBottom: 14,
  },
  goldHeroInner: {
    margin: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.22)",
    backgroundColor: "rgba(0,0,0,0.12)",
    padding: 18,
    alignItems: "center",
  },

  goldKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  goldTitle: {
    marginTop: 10,
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  goldSub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 17,
  },

  choiceWrap: {
    marginTop: 18,
    width: "100%",
    gap: 12,
  },

  choiceBox: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: GREEN_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  choiceBoxDim: {
    opacity: 0.74,
  },

  choiceBoxActive: {
    borderColor: "rgba(255, 210, 92, 0.95)",
    backgroundColor: "rgba(255, 210, 92, 0.22)",
    opacity: 1,
  },

  choiceTopRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectedPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.85)",
    backgroundColor: "rgba(255, 210, 92, 0.22)",
  },

  selectedPillText: {
    color: "rgba(255, 210, 92, 0.95)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  unselectedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(46,204,113,0.45)",
    backgroundColor: "rgba(46,204,113,0.10)",
  },

  unselectedPillText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
  },

  choiceTitle: { color: "#fff", fontSize: 18, fontWeight: "900", opacity: 0.9 },
  choiceTitleActive: { opacity: 1 },

  choiceDesc: { marginTop: 8, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },
  choiceDescActive: { color: "rgba(255,255,255,0.82)" },

  microNoteWrap: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    width: "100%",
  },
  microNote: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700", textAlign: "center" },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  primaryBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
