import React, { useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable } from "react-native";
import ROUTES from "../navigation/routes";
import theme from "../theme";

export default function GameSettingsScreen({ navigation, route }) {
  const gameId = route?.params?.gameId || "stroke_play";
  const gameTitle = route?.params?.gameTitle || "Stroke Play";

  const [scoringMode, setScoringMode] = useState("gross");

  const subtitle = useMemo(() => {
    if (gameId === "stroke_play") return "Enter total strokes per hole.";
    return "Configure your game.";
  }, [gameId]);

  function onContinue() {
    navigation.navigate(ROUTES.NEW_ROUND, {
      format: gameId,
      gameTitle,
      scoringMode,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.h1}>{gameTitle}</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        <Text style={styles.label}>Scoring</Text>
        <View style={styles.row}>
          <Pressable
            onPress={() => setScoringMode("gross")}
            style={[styles.opt, scoringMode === "gross" && styles.optActive]}
          >
            <Text style={styles.optT}>Gross</Text>
            <Text style={styles.optS}>Straight scores</Text>
          </Pressable>

          <Pressable
            onPress={() => setScoringMode("net")}
            style={[styles.opt, scoringMode === "net" && styles.optActive]}
          >
            <Text style={styles.optT}>Net</Text>
            <Text style={styles.optS}>Handicap applied</Text>
          </Pressable>
        </View>

        <Pressable style={styles.primary} onPress={onContinue}>
          <Text style={styles.primaryT}>Continue</Text>
        </Pressable>

        <Pressable style={styles.ghost} onPress={() => navigation.goBack()}>
          <Text style={styles.ghostT}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  wrap: { flex: 1, padding: 18, paddingTop: 22 },
  h1: { color: theme?.colors?.text || "#fff", fontSize: 34, fontWeight: "900" },
  sub: { marginTop: 8, color: theme?.colors?.text || "#fff", opacity: 0.7, fontWeight: "700" },
  label: { marginTop: 18, color: theme?.colors?.text || "#fff", opacity: 0.7, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", fontSize: 12 },
  row: { flexDirection: "row", gap: 12, marginTop: 10 },
  opt: {
    flex: 1,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: theme?.colors?.border || "rgba(255,255,255,0.18)",
    backgroundColor: theme?.colors?.card || "rgba(255,255,255,0.04)",
  },
  optActive: { borderColor: "rgba(46,125,255,0.9)", backgroundColor: "rgba(46,125,255,0.10)" },
  optT: { color: "#fff", fontWeight: "900", fontSize: 16 },
  optS: { marginTop: 6, color: "#fff", opacity: 0.7, fontWeight: "700", fontSize: 12 },

  primary: { marginTop: 18, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme?.colors?.primary || "#2E7DFF" },
  primaryT: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
  ghost: { marginTop: 12, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.04)" },
  ghostT: { color: "#fff", fontSize: 16, fontWeight: "900", opacity: 0.9 },
});
