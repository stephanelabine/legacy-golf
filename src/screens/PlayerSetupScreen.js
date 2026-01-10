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
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";

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

  const scoringRaw = params?.scoring || params?.scoringType || params?.scoringMode || "net";
  const scoring = String(scoringRaw || "net").toLowerCase() === "gross" ? "gross" : "net";

  const gameLabel = useMemo(() => pickGameLabel(params), [params]);

  const initialCount = useMemo(() => {
    const raw = Number(params?.playerCount || 4);
    return clampCount(raw) || 4;
  }, [params?.playerCount]);

  // Draft input (what they are typing right now)
  const [countText, setCountText] = useState(String(initialCount));

  // Committed input (what the app considers “confirmed”)
  const [committedCount, setCommittedCount] = useState(initialCount);

  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        inputRef?.current?.focus?.();
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, []);

  const draftCount = useMemo(() => {
    const digits = String(countText || "").replace(/[^\d]/g, "");
    if (!digits) return null;
    return clampCount(Number(digits));
  }, [countText]);

  const hasValidDraft = !!draftCount;

  // Dirty means: they typed a new valid number different than the committed one
  const isDirty = hasValidDraft && Number(draftCount) !== Number(committedCount);

  // Done becomes the “call to action” ONLY when there’s a valid, changed value to confirm
  const canDone = hasValidDraft && (committedCount == null || isDirty);

  // Next is enabled only when we have a committed count AND nothing is waiting to be confirmed
  const canContinue = !!committedCount && !isDirty;

  function onDone() {
    if (!canDone) return;
    setCommittedCount(draftCount);
    Keyboard.dismiss();
  }

  function onNext() {
    if (!canContinue) return;
    Keyboard.dismiss();

    navigation.navigate(ROUTES.PLAYER_ENTRY, {
      ...params,
      course,
      tee,
      scoring,
      playerCount: committedCount,
    });
  }

  const courseName = course?.name || "Course";
  const teeName = tee?.name || "Tee";
  const teeYards = tee?.yardage ? `${tee.yardage} yds` : "";

  const summaryLine1 = `${gameLabel} • ${scoring === "gross" ? "Gross" : "Net"}`;
  const summaryLine2 = `${courseName} • ${teeName}${teeYards ? ` (${teeYards})` : ""}`;
  const summaryLine3 = `Players: ${committedCount || "—"}`;

  const primary = theme?.primary || theme?.colors?.primary || "#2E7DFF";

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Players" subtitle="How many are playing today?" />

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
            selectionColor={primary}
          />

          <Pressable
            onPress={onDone}
            disabled={!canDone}
            style={({ pressed }) => [
              styles.donePill,
              canDone && { backgroundColor: primary, borderColor: "rgba(255,255,255,0.22)" },
              !canDone && styles.donePillDisabled,
              pressed && canDone && styles.pressed,
            ]}
          >
            <Text style={[styles.doneText, canDone && { color: "#fff" }]}>Done</Text>
          </Pressable>
        </View>

        <Text style={styles.note}>
          {isDirty ? "Press Done to confirm the player count." : "Next you’ll add guests or choose buddies."}
        </Text>
      </View>

      <View style={styles.bottomBar}>
        <Pressable
          onPress={onNext}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.cta,
            !canContinue && styles.ctaDisabled,
            pressed && canContinue && styles.pressed,
          ]}
        >
          <Text style={styles.ctaText}>Next: Add Players</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const GREEN_BG = "#0F7A4A";
const GREEN_BORDER = "rgba(255,255,255,0.18)";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220" },

  summaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
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
  donePillDisabled: { opacity: 0.55 },
  doneText: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 13 },

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
