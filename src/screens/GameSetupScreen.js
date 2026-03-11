// src/screens/GameSetupScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import gameFormats from "../data/gameFormats.json";
import ROUTES from "../navigation/routes";

import { loadActiveRound, updateActiveRound } from "../storage/roundState";

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

  const params = route?.params || {};
  const roundId = params?.roundId ? String(params.roundId) : null;

  const paramGameId = params?.gameId || null;
  const paramGameTitle = params?.gameTitle || null;

  const [fsGameId, setFsGameId] = useState(null);
  const [fsGameTitle, setFsGameTitle] = useState(null);
  const [roundLoading, setRoundLoading] = useState(!!roundId);

  const didWriteParamsToFsRef = useRef(false);

  async function hydrateFromFirestore() {
    if (!roundId) return;
    setRoundLoading(true);
    try {
      const r = await loadActiveRound(roundId);
      setFsGameId(r?.gameId || null);
      setFsGameTitle(r?.gameTitle || null);

      const h = Number(r?.holesCount);
      if (h === 9 || h === 18) {
        setHolesCount(h);
      } else {
        setHolesCount(null);
      }

      const sideRaw = String(r?.holesSide || "").toLowerCase();
      const side = sideRaw === "front" || sideRaw === "back" ? sideRaw : null;
      if (h === 9) {
        setHolesSide(side);
      } else {
        setHolesSide(null);
      }

      const s = String(r?.scoringMode || r?.scoring || "").toLowerCase();
      if (s === "gross" || s === "net") {
        setScoringMode(s);
      }
    } catch {
      // non-blocking
    } finally {
      setRoundLoading(false);
    }
  }

  useEffect(() => {
    hydrateFromFirestore();

    const unsub = navigation?.addListener?.("focus", () => {
      hydrateFromFirestore();
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  // If we arrived from normal flow with params, persist them once so History reset works everywhere.
  useEffect(() => {
    if (!roundId) return;
    if (didWriteParamsToFsRef.current) return;

    const gid = String(paramGameId || "").trim();
    if (!gid) return;

    didWriteParamsToFsRef.current = true;

    updateActiveRound(
      {
        gameId: gid,
        gameTitle: String(paramGameTitle || "").trim() || (gameFormats?.[gid]?.title || "Game"),
        updatedAt: Date.now(),
      },
      roundId
    ).catch(() => {
      // non-blocking
    });
  }, [roundId, paramGameId, paramGameTitle]);

  const effectiveGameId = paramGameId || fsGameId || null;
  const effectiveGameTitle =
    paramGameTitle ||
    fsGameTitle ||
    (effectiveGameId ? gameFormats?.[effectiveGameId]?.title : null) ||
    null;

  const game = useMemo(() => {
    if (!effectiveGameId) return null;
    return gameFormats?.[effectiveGameId] || { title: effectiveGameTitle || "Game", subtitle: "" };
  }, [effectiveGameId, effectiveGameTitle]);

  const isPremiumGold = effectiveGameId === "legacy_card";
  const iconSpec =
    ICONS[effectiveGameId] || { name: "circle-small", color: "rgba(255,255,255,0.80)" };

  const [scoringMode, setScoringMode] = useState("net");
  const [holesCount, setHolesCount] = useState(null); // null | 9 | 18
  const [holesSide, setHolesSide] = useState(null); // null | "front" | "back" (only used when holesCount === 9)
  const [nineSideModalOpen, setNineSideModalOpen] = useState(false);

  function openNineSideModal() {
    setNineSideModalOpen(true);
  }

  function closeNineSideModal() {
    setNineSideModalOpen(false);
  }

  function chooseFrontNine() {
    setHolesCount(9);
    setHolesSide("front");
  }

  function chooseBackNine() {
    setHolesCount(9);
    setHolesSide("back");
  }

  function chooseEighteen() {
    setHolesCount(18);
    setHolesSide(null);
  }
  async function goNext() {
    if (roundLoading) return;

    if (!effectiveGameId) {
      Alert.alert("Missing game selection");
      return;
    }

    if (holesCount !== 9 && holesCount !== 18) {
      Alert.alert("Select round length", "Choose 9 holes or 18 holes to continue.");
      return;
    }

    if (holesCount === 9 && holesSide !== "front" && holesSide !== "back") {
      Alert.alert("Select which 9", "Choose front 9 or back 9 to continue.");
      return;
    }

    // Persist scoringMode + holesCount (+ holesSide) so History reset stacks are stable across devices.
    if (roundId) {
      try {
        await updateActiveRound({ scoringMode, holesCount, holesSide: holesCount === 9 ? holesSide : null, updatedAt: Date.now() }, roundId);
      } catch {
        // non-blocking
      }
    }

    // Next step is Course Selection
    navigation.navigate(ROUTES.NEW_ROUND, {
      roundId,
      gameId: effectiveGameId,
      gameTitle: game?.title || effectiveGameTitle || "Game",
      scoringMode, // "net" or "gross"
      holesCount, // 9 or 18
      holesSide: holesCount === 9 ? holesSide : null, // "front" | "back" | null
    });
  }

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const isGross = scoringMode === "gross";
  const isNet = scoringMode === "net";

  const is9 = holesCount === 9;
  const is18 = holesCount === 18;

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
                <View style={{ width: "100%", alignItems: "center", marginBottom: 8 }}>
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

                <Text
                  style={[styles.choiceTitle, isGross && styles.choiceTitleActive, { textAlign: "center", width: "100%" }]}
                  numberOfLines={1}
                >
                  Gross
                </Text>

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
                <View style={{ width: "100%", alignItems: "center", marginBottom: 8 }}>
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

                <Text
                  style={[styles.choiceTitle, isNet && styles.choiceTitleActive, { textAlign: "center", width: "100%" }]}
                  numberOfLines={1}
                >
                  Net
                </Text>

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

        {/* ROUND LENGTH selector (required) */}
        <View style={styles.goldHero}>
          <View style={styles.goldHeroInner}>
            <Text style={styles.goldKicker}>ROUND LENGTH</Text>
            <Text style={styles.goldTitle}>9 or 18 Holes</Text>
            <Text style={styles.goldSub}>Choose how many holes you’re playing.</Text>

            <View style={styles.choiceWrap}>
              {/* 9 HOLES */}
              <Pressable
                onPress={openNineSideModal}
                style={({ pressed }) => [
                  styles.choiceBox,
                  !is9 && styles.choiceBoxDim,
                  is9 && styles.choiceBoxActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={{ width: "100%", alignItems: "center", marginBottom: 8 }}>
                  {is9 ? (
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

                <Text
                  style={[styles.choiceTitle, is9 && styles.choiceTitleActive, { textAlign: "center", width: "100%" }]}
                  numberOfLines={1}
                >
                  9 Holes
                </Text>
                <Text style={[styles.choiceDesc, is9 && styles.choiceDescActive]}>
                  Front nine
                </Text>
              </Pressable>

              {/* 18 HOLES */}
              <Pressable
                onPress={chooseEighteen}
                style={({ pressed }) => [
                  styles.choiceBox,
                  !is18 && styles.choiceBoxDim,
                  is18 && styles.choiceBoxActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={{ width: "100%", alignItems: "center", marginBottom: 8 }}>
                  {is18 ? (
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

                <Text
                  style={[styles.choiceTitle, is18 && styles.choiceTitleActive, { textAlign: "center", width: "100%" }]}
                  numberOfLines={1}
                >
                  18 Holes
                </Text>

                <Text style={[styles.choiceDesc, is18 && styles.choiceDescActive]}>
                  Full round
                </Text>
              </Pressable>
            </View>

            <View style={styles.microNoteWrap}>
              <Text style={styles.microNote}>
                {holesCount === 9
                  ? holesSide === "front"
                    ? "This round will run the front 9."
                    : holesSide === "back"
                      ? "This round will run the back 9."
                      : "Choose front 9 or back 9 to continue."
                  : holesCount === 18
                    ? "This round will run 18 holes."
                    : "Selection is required to continue."}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={nineSideModalOpen} transparent animationType="fade" onRequestClose={closeNineSideModal}>
        <Pressable style={styles.modalOverlay} onPress={closeNineSideModal}>
          <Pressable style={styles.modalCard} onPress={() => { }}>
            <Text style={styles.modalKicker}>9 HOLE ROUND</Text>
            <Text style={styles.modalTitle}>Which 9?</Text>
            <Text style={styles.modalSub}>Choose front nine or back nine.</Text>

            <View style={styles.modalRow}>
              <Pressable
                onPress={chooseFrontNine}
                style={({ pressed }) => [
                  styles.modalBtn,
                  holesSide === "front" && styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={holesSide === "front" ? styles.modalBtnTextPrimary : styles.modalBtnText}>Front 9</Text>
              </Pressable>



              <Pressable
                onPress={chooseBackNine}
                style={({ pressed }) => [
                  styles.modalBtn,
                  holesSide === "back" && styles.modalBtnPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={holesSide === "back" ? styles.modalBtnTextPrimary : styles.modalBtnText}>Back 9</Text>
              </Pressable>


            </View>

            <View style={styles.modalFooterCol}>
              <Pressable onPress={closeNineSideModal} style={({ pressed }) => [styles.modalCloseFull, pressed && styles.pressed]}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={closeNineSideModal}
                disabled={holesSide !== "front" && holesSide !== "back"}
                style={({ pressed }) => [
                  styles.modalContinueFull,
                  (holesSide !== "front" && holesSide !== "back") && { opacity: 0.45 },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalContinueText}>Continue</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255, 210, 92, 0.82)",
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
    marginBottom: 14,
  },
  goldHeroInner: {
    margin: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.18)",
    backgroundColor: "rgba(0,0,0,0.12)",
    padding: 10,
    alignItems: "center",
  },

  goldKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  goldTitle: {
    marginTop: 6,
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.13,
  },
  goldSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.70)",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 14,
  },

  choiceWrap: {
    marginTop: 9,
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },

  choiceBox: {
    flex: 1,
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: GREEN_BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 12,
    paddingHorizontal: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.85)",
    backgroundColor: "rgba(255, 210, 92, 0.22)",
  },

  selectedPillText: {
    color: "rgba(255, 210, 92, 0.95)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.75,
  },

  unselectedPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(46,204,113,0.45)",
    backgroundColor: "rgba(46,204,113,0.10)",
  },

  unselectedPillText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.75,
  },

  choiceTitle: { color: "#fff", fontSize: 16, fontWeight: "900", opacity: 0.9 },
  choiceTitleActive: { opacity: 1 },

  choiceDesc: { marginTop: 4, color: "rgba(255,255,255,0.70)", fontSize: 11, fontWeight: "800" },
  choiceDescActive: { color: "rgba(255,255,255,0.82)" },

  microNoteWrap: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    width: "100%",
  },
  microNote: { color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "700", textAlign: "center" },

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

  modalOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(255, 210, 92, 0.72)",
    backgroundColor: "rgba(10,14,22,0.985)",
    padding: 16,
    overflow: "hidden",
  },
  modalKicker: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
    textAlign: "center",
  },
  modalTitle: {
    marginTop: 10,
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  modalSub: {
    marginTop: 8,
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 18,
  },
  modalRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    height: 92,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.32)",
    backgroundColor: "rgba(46,125,255,0.10)",
    paddingHorizontal: 10,
  },

  modalBtnPrimary: {
    borderColor: "rgba(255, 210, 92, 0.90)",
    backgroundColor: "rgba(255, 210, 92, 0.18)",
  },

  modalBtnText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  modalBtnTextPrimary: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  modalFooterCol: {
    marginTop: 12,
    gap: 12,
  },


  modalCloseFull: {
    width: "100%",
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  modalContinueFull: {
    width: "100%",
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.72)",
    backgroundColor: "rgba(15,122,74,0.28)",
  },

  modalCloseText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  modalContinueText: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});