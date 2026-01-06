import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard,
  Platform,
} from "react-native";

import theme from "../theme";

function clampCount(n) {
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v < 1) return null;
  if (v > 16) return 16;
  return v;
}

function pickGameLabel(params) {
  const raw =
    params?.gameFormat ||
    params?.format ||
    params?.gameType ||
    params?.game ||
    params?.mode ||
    params?.rules ||
    "";

  const s = String(raw || "").trim();
  if (!s) return "Stroke Play";

  const lower = s.toLowerCase();
  if (lower.includes("stroke")) return "Stroke Play";
  if (lower.includes("match")) return "Match Play";
  if (lower.includes("skins")) return "Skins";
  if (lower.includes("nassau")) return "Nassau";
  if (lower.includes("vegas")) return "Vegas";
  if (lower.includes("wolf")) return "Wolf";
  if (lower.includes("snake")) return "Snake";
  if (lower.includes("stableford")) return "Stableford";
  if (lower.includes("kp") || lower.includes("kps")) return "KPs";

  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function PlayerSetupScreen({ navigation, route }) {
  const params = route?.params || {};

  const course = params?.course || null;
  const tee = params?.tee || null;

  const scoringRaw = params?.scoring || params?.scoringType || "net";
  const scoring = String(scoringRaw || "net").toLowerCase() === "gross" ? "gross" : "net";

  const gameLabel = useMemo(() => pickGameLabel(params), [params]);

  const initialCount = useMemo(() => {
    const raw = Number(params?.playerCount || 4);
    return clampCount(raw) || 4;
  }, [params?.playerCount]);

  const [countText, setCountText] = useState(String(initialCount));
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        inputRef?.current?.focus?.();
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, []);

  const playerCount = useMemo(() => {
    const digits = String(countText || "").replace(/[^\d]/g, "");
    if (!digits) return null;
    return clampCount(Number(digits));
  }, [countText]);

  const canContinue = !!playerCount;

  function onDone() {
    Keyboard.dismiss();
  }

  function onContinue() {
    if (!canContinue) return;
    Keyboard.dismiss();

    navigation.navigate("PlayerEntry", {
      ...params,
      course,
      tee,
      scoring,
      playerCount,
    });
  }

  const courseName = course?.name || "Course";
  const teeName = tee?.name || "Tee";
  const teeYards = tee?.yardage ? `${tee.yardage} yds` : "";

  const summaryLine1 = `${gameLabel} • ${scoring === "gross" ? "Gross" : "Net"}`;
  const summaryLine2 = `${courseName} • ${teeName}${teeYards ? ` (${teeYards})` : ""}`;
  const summaryLine3 = `Players: ${playerCount || "—"}`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topGlowA} pointerEvents="none" />
      <View style={styles.topGlowB} pointerEvents="none" />

      <View style={styles.headerRow}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>

      <View style={styles.titleWrap}>
        <Text style={styles.h1}>How many players?</Text>
        <Text style={styles.h2}>Type the number. Then continue.</Text>
      </View>

      {/* Round Summary (emerald green) */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryKicker}>ROUND SUMMARY</Text>
        <Text style={styles.summaryTitle} numberOfLines={1}>
          {summaryLine1}
        </Text>
        <Text style={styles.summarySub} numberOfLines={1}>
          {summaryLine2}
        </Text>
        <Text style={styles.summarySub2} numberOfLines={1}>
          {summaryLine3}
        </Text>
      </View>

      <View style={styles.inputCard}>
        <Text style={styles.inputLabel}>Players</Text>

        {/* Input pill is NOT green (clean dark luxury) */}
        <View style={styles.bigPill}>
          <TextInput
            ref={inputRef}
            value={countText}
            onChangeText={setCountText}
            placeholder="4"
            placeholderTextColor="rgba(255,255,255,0.35)"
            keyboardType="number-pad"
            maxLength={2}
            style={styles.bigInput}
            selectionColor={theme?.primary || theme?.colors?.primary || "#2E7DFF"}
          />

          <Pressable onPress={onDone} style={({ pressed }) => [styles.donePill, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <Text style={styles.note}>Example: type 7. You’ll add players on the next screen.</Text>
      </View>

      <View style={styles.bottomBar}>
        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.cta,
            !canContinue && styles.ctaDisabled,
            pressed && canContinue && styles.pressed,
          ]}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const GREEN_BG = "#0F7A4A"; // premium emerald
const GREEN_BORDER = "rgba(255,255,255,0.18)";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220" },

  topGlowA: {
    position: "absolute",
    top: -90,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  backText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  titleWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  h1: { color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: 0.2, lineHeight: 40 },
  h2: { marginTop: 10, color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "800" },

  summaryCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_BG,
    padding: 14,
  },
  summaryKicker: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12, letterSpacing: 1.1 },
  summaryTitle: { marginTop: 10, color: "#fff", fontWeight: "900", fontSize: 16 },
  summarySub: { marginTop: 6, color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 13 },
  summarySub2: { marginTop: 6, color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 13 },

  inputCard: {
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 16,
  },
  inputLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", letterSpacing: 1.1, fontSize: 12 },

  bigPill: {
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bigInput: {
    flex: 1,
    color: "#fff",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: 0.5,
    paddingVertical: 6,
  },
  donePill: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  note: { marginTop: 12, color: "rgba(255,255,255,0.62)", fontWeight: "800", fontSize: 12, lineHeight: 17 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  cta: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  ctaDisabled: { opacity: 0.35 },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
