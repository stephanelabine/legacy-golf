// src/screens/GameSetupScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import gameFormats from "../data/gameFormats.json";
import ROUTES from "../navigation/routes";
import { saveWagers, clearWagers } from "../storage/wagers";

/* ───────────────── ICON MAP (colored) ───────────────── */
const ICONS = {
  legacy_card: { name: "cards-diamond", color: "rgba(255, 210, 92, 0.95)" },
  stroke_play: { name: "golf", color: "rgba(255,255,255,0.92)" },
  match_play: { name: "account-group", color: "rgba(255,255,255,0.90)" },
  kps: { name: "target", color: "rgba(255,255,255,0.90)" },
  skins: { name: "cash-multiple", color: "rgba(255,255,255,0.90)" },
  two_v_two: { name: "account-group-outline", color: "rgba(255,255,255,0.90)" },
  nassau: { name: "view-week", color: "rgba(255,255,255,0.90)" },
  stableford: { name: "plus-circle", color: "rgba(255,255,255,0.90)" },
  wolf: { name: "paw", color: "rgba(255,255,255,0.90)" },
  snake: { name: "snake", color: "rgba(255,255,255,0.90)" },
  legacy_points: { name: "trophy", color: "rgba(255,255,255,0.92)" },
};

const BG = theme?.colors?.bg || theme?.bg || "#0B1220";
const PRIMARY = theme?.colors?.primary || theme?.accent || "#2E7DFF";

const GOLD = "rgba(255, 210, 92, 0.95)";
const GOLD_SOFT = "rgba(255, 210, 92, 0.22)";

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (Number.isInteger(v)) return `$${v}`;
  return `$${v.toFixed(2)}`;
}

function buildWagerTypeChips(w) {
  if (!w?.enabled) return [];

  const chips = [];

  if (w?.skins?.enabled) chips.push({ key: "skins", label: `Skins ${formatMoney(w?.skins?.amount)}` });
  if (w?.kps?.enabled) chips.push({ key: "kps", label: `KPs ${formatMoney(w?.kps?.amount)}` });

  if (w?.nassau?.enabled) {
    const f = formatMoney(w?.nassau?.front);
    const b = formatMoney(w?.nassau?.back);
    const t = formatMoney(w?.nassau?.total);
    chips.push({ key: "nassau", label: `Nassau ${f}/${b}/${t}` });
  }

  if (w?.perStroke?.enabled) {
    const amt = formatMoney(w?.perStroke?.amount);
    chips.push({ key: "perStroke", label: `Per Stroke ${amt}/stroke` });
  }

  return chips;
}

export default function GameSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { gameId, gameTitle } = route?.params || {};

  const game = useMemo(() => {
    if (!gameId) return null;
    return gameFormats?.[gameId] || { title: gameTitle || "Game", subtitle: "" };
  }, [gameId, gameTitle]);

  const isLegacy = gameId === "legacy_card";
  const iconSpec = ICONS[gameId] || { name: "circle-small", color: "rgba(255,255,255,0.80)" };

  const [scoringMode, setScoringMode] = useState("net");

  const [wagers, setWagers] = useState(null);
  const wagersEnabled = !!wagers?.enabled;

  // KEY CHANGE:
  // Always default Wagers OFF when you arrive on this screen (no “sticky on”).
  // This runs once per mount, so returning from the Wagers screen won't wipe your selection.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    (async () => {
      setWagers(null);
      await clearWagers();
    })();
  }, []);

  // Sync route param wagers into state + persist
  useEffect(() => {
    const incoming = route?.params?.wagers;
    if (incoming === undefined) return;

    (async () => {
      if (!incoming?.enabled) {
        setWagers(null);
        await clearWagers();
        return;
      }
      setWagers(incoming);
      await saveWagers(incoming);
    })();
  }, [route?.params?.wagers]);

  function openWagers() {
    const seed =
      wagers ||
      ({
        enabled: true,
        skins: { enabled: false, amount: 0 },
        kps: { enabled: false, amount: 0 },
        nassau: { enabled: false, front: 0, back: 0, total: 0 },
        perStroke: { enabled: false, amount: 0 },
        notes: "",
      });

    navigation.navigate(ROUTES.WAGERS, { wagers: seed });
  }

  function toggleWagers() {
    if (wagersEnabled) {
      setWagers(null);
      clearWagers();
      return;
    }
    openWagers();
  }

  function goNext() {
    if (!gameId) {
      Alert.alert("Missing game selection");
      return;
    }

    navigation.navigate(ROUTES.NEW_ROUND, {
      gameId,
      gameTitle: game?.title || gameTitle || "Game",
      scoringMode,
      wagers: wagersEnabled ? wagers : null,
    });
  }

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const scoringAccent = PRIMARY;
  const wagersAccent = GOLD;

  const wagerTypeChips = buildWagerTypeChips(wagers);

  // Scrollable list box height inside the wagers card
  const chipsBoxHeight = wagersEnabled ? 190 : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      {/* TOP (unchanged) */}
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
              <Text style={[styles.badgeText, isLegacy && styles.badgeTextLegacy]}>
                GAME SETUP
              </Text>
            </View>
          </View>

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

      {/* MAIN CONTENT */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.mainContent, { paddingBottom: footerPad + 96 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* SCORING CARD */}
        <View style={styles.heroCard}>
          <View style={[styles.accentRing, { borderColor: scoringAccent }]} pointerEvents="none" />
          <View style={[styles.glowA, { backgroundColor: scoringAccent }]} pointerEvents="none" />
          <View style={[styles.glowB, { backgroundColor: scoringAccent }]} pointerEvents="none" />

          <View style={styles.innerFrame}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>Scoring</Text>
              <Text style={styles.cardHint}>Net or Gross</Text>
            </View>

            <View style={{ paddingTop: 14 }}>
              <View style={styles.seg}>
                <Pressable
                  onPress={() => setScoringMode("net")}
                  style={({ pressed }) => [
                    styles.segBtn,
                    scoringMode === "net" && styles.segBtnActiveBlue,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.segText, scoringMode === "net" && styles.segTextActive]}>
                    Net
                  </Text>
                  <Text style={[styles.segSub, scoringMode === "net" && styles.segSubActive]}>
                    Handicap adjusted
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setScoringMode("gross")}
                  style={({ pressed }) => [
                    styles.segBtn,
                    scoringMode === "gross" && styles.segBtnActiveBlue,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.segText, scoringMode === "gross" && styles.segTextActive]}>
                    Gross
                  </Text>
                  <Text style={[styles.segSub, scoringMode === "gross" && styles.segSubActive]}>
                    Raw strokes
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.divider, { marginTop: 14 }]} pointerEvents="none" />

              <Text style={styles.help}>
                {scoringMode === "net"
                  ? "Net uses handicaps for fairness. You’ll enter handicaps later."
                  : "Gross is pure strokes. No handicap adjustments."}
              </Text>
            </View>
          </View>
        </View>

        {/* WAGERS CARD */}
        <View style={styles.heroCard}>
          <View style={[styles.accentRing, { borderColor: wagersAccent }]} pointerEvents="none" />

          <View style={styles.innerFrame}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardLabel}>Wagers</Text>
              <Text style={styles.cardHint}>Optional</Text>
            </View>

            <View style={{ paddingTop: 14 }}>
              <View style={styles.wagersPanel}>
                {/* LEFT */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.wagersTitle}>{wagersEnabled ? "Wagers enabled" : "No wagers yet"}</Text>
                  <Text style={styles.wagersSub}>
                    {wagersEnabled
                      ? "Summary below. Scroll to view all wager types."
                      : "Tap Add wagers to select wager types and amounts."}
                  </Text>

                  {wagersEnabled ? (
                    <View style={[styles.typesBox, { height: chipsBoxHeight }]}>
                      <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.typesScrollContent}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {wagerTypeChips.length ? (
                          wagerTypeChips.map((c) => (
                            <View key={c.key} style={[styles.typeChip, { borderColor: "rgba(255, 210, 92, 0.24)" }]}>
                              <Text style={styles.typeChipText}>{c.label}</Text>
                            </View>
                          ))
                        ) : (
                          <View style={[styles.typeChip, { borderColor: "rgba(255,255,255,0.16)" }]}>
                            <Text style={[styles.typeChipText, { opacity: 0.75 }]}>No wager types selected</Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>

                {/* RIGHT */}
                <View style={styles.wagersRight}>
                  <View style={[styles.statusPill, wagersEnabled ? styles.statusPillOn : styles.statusPillOff]}>
                    <Text style={styles.statusText}>{wagersEnabled ? "ON" : "OFF"}</Text>
                  </View>

                  <Pressable onPress={toggleWagers} hitSlop={10} style={({ pressed }) => [pressed && styles.pressed]}>
                    <View style={[styles.switchOuter, wagersEnabled && styles.switchOuterOnGold]}>
                      <View style={[styles.switchKnob, wagersEnabled && styles.switchKnobOn]} />
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={styles.wagersActions}>
                {wagersEnabled ? (
                  <>
                    <Pressable
                      onPress={openWagers}
                      style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.secondaryText}>Configure</Text>
                    </Pressable>

                    <Pressable
                      onPress={toggleWagers}
                      style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.ghostText}>Turn off</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={openWagers}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.secondaryText}>Add wagers</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={[styles.footer, { paddingBottom: footerPad, backgroundColor: BG }]}>
        <Pressable onPress={goNext} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
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
  badgeLegacy: { borderColor: "rgba(255, 210, 92, 0.22)", backgroundColor: "rgba(255, 210, 92, 0.10)" },
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
  formatIconLegacy: { borderColor: "rgba(255, 210, 92, 0.28)", backgroundColor: "rgba(255, 210, 92, 0.10)" },

  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 0.2, lineHeight: 34 },
  h2: { marginTop: 8, color: "#fff", opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  accentLine: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },
  accentLineLegacy: { height: 2, backgroundColor: GOLD_SOFT },

  mainContent: { paddingHorizontal: 16, paddingTop: 14 },

  heroCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    marginBottom: 14,
  },

  accentRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    opacity: 0.8,
  },

  glowA: {
    position: "absolute",
    top: -90,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 260,
    opacity: 0.12,
  },
  glowB: {
    position: "absolute",
    bottom: -120,
    right: -90,
    width: 320,
    height: 320,
    borderRadius: 320,
    opacity: 0.1,
  },

  innerFrame: {
    margin: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.12)",
    padding: 16,
  },

  cardHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  cardLabel: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.2 },
  cardHint: { color: "#fff", opacity: 0.6, fontSize: 12, fontWeight: "800" },

  seg: { flexDirection: "row", gap: 12 },
  segBtn: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  segBtnActiveBlue: { borderColor: "rgba(46,125,255,0.65)", backgroundColor: "rgba(46,125,255,0.14)" },
  segText: { color: "#fff", opacity: 0.9, fontSize: 16, fontWeight: "900" },
  segTextActive: { opacity: 1 },
  segSub: { marginTop: 8, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "800" },
  segSubActive: { opacity: 0.78 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  help: { marginTop: 12, color: "#fff", opacity: 0.72, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  wagersPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  wagersTitle: { color: "#fff", fontSize: 15, fontWeight: "900" },
  wagersSub: { marginTop: 8, color: "#fff", opacity: 0.66, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  typesBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.12)",
    overflow: "hidden",
  },
  typesScrollContent: { padding: 10, gap: 8, paddingBottom: 14 },

  typeChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  typeChipText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.2, opacity: 0.92 },

  wagersRight: { alignItems: "flex-end", justifyContent: "flex-start", gap: 10, paddingTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  statusPillOn: { borderColor: "rgba(255, 210, 92, 0.40)" },
  statusPillOff: { borderColor: "rgba(255,255,255,0.16)" },
  statusText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1.0, opacity: 0.92 },

  wagersActions: { marginTop: 12, flexDirection: "row", gap: 10 },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  ghostBtn: {
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,90,90,0.30)",
    backgroundColor: "rgba(255,90,90,0.10)",
  },
  ghostText: { color: "#fff", fontWeight: "900", fontSize: 13, opacity: 0.92 },

  switchOuter: {
    width: 58,
    height: 36,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  switchOuterOnGold: { borderColor: "rgba(255, 210, 92, 0.50)", backgroundColor: "rgba(255, 210, 92, 0.16)" },
  switchKnob: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.70)",
    transform: [{ translateX: 0 }],
  },
  switchKnobOn: { backgroundColor: "rgba(255,255,255,0.92)", transform: [{ translateX: 20 }] },

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
  primaryBtn: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: PRIMARY },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
