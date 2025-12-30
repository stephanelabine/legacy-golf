import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, ScrollView, Alert } from "react-native";
import { saveRound } from "../storage/rounds";

export default function ScoreEntryScreen({ navigation, route }) {
  const [round, setRound] = useState(route.params?.round);

  if (!round) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#fff", fontWeight: "800" }}>No round data found.</Text>
        <Pressable onPress={() => navigation.navigate("NewRound")} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Start a new round</Text>
        </Pressable>
      </View>
    );
  }

  const holeCount = round.holes;
  const holeIndex = round.currentHoleIndex ?? 0;

  const totals = useMemo(() => {
    const out = {};
    for (const p of round.players) {
      const arr = round.scores[p.id] || [];
      out[p.id] = arr.reduce((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
    }
    return out;
  }, [round]);

  function setStroke(playerId, value) {
    const num = value === "" ? null : Number(value);
    if (value !== "" && (!Number.isFinite(num) || num < 0 || num > 25)) return;

    setRound((prev) => {
      const nextScores = { ...prev.scores };
      const arr = [...nextScores[playerId]];
      arr[holeIndex] = value === "" ? null : num;
      nextScores[playerId] = arr;
      return { ...prev, scores: nextScores };
    });
  }

  function prevHole() {
    setRound((p) => ({ ...p, currentHoleIndex: Math.max(0, holeIndex - 1) }));
  }

  function nextHole() {
    setRound((p) => ({ ...p, currentHoleIndex: Math.min(holeCount - 1, holeIndex + 1) }));
  }

  function saveToHistory() {
    Alert.alert("Save round?", "This will save the round to your phone history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Save",
        onPress: async () => {
          const toSave = { ...round, completedAt: Date.now() };
          await saveRound(toSave);
          navigation.replace("History");
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{round.name}</Text>
      <Text style={styles.sub}>
        Hole {holeIndex + 1} of {holeCount}
      </Text>

      <View style={styles.card}>
        {round.players.map((p) => {
          const value = round.scores[p.id]?.[holeIndex];
          return (
            <View key={p.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.player}>{p.name}</Text>
                <Text style={styles.mini}>Total: {totals[p.id]}</Text>
              </View>

              <TextInput
                value={value === null || value === undefined ? "" : String(value)}
                onChangeText={(t) => setStroke(p.id, t.replace(/[^\d]/g, ""))}
                keyboardType="numeric"
                placeholder="Strokes"
                placeholderTextColor="rgba(255,255,255,0.45)"
                style={styles.input}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={prevHole} disabled={holeIndex === 0} style={[styles.navBtn, holeIndex === 0 && styles.disabled]}>
          <Text style={styles.navText}>Prev</Text>
        </Pressable>

        <Pressable
          onPress={nextHole}
          disabled={holeIndex === holeCount - 1}
          style={[styles.navBtn, holeIndex === holeCount - 1 && styles.disabled]}
        >
          <Text style={styles.navText}>Next</Text>
        </Pressable>
      </View>

      <Pressable onPress={saveToHistory} style={styles.primaryBtn}>
        <Text style={styles.primaryText}>Save to history</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 52, backgroundColor: "#0b1320", flexGrow: 1 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900" },
  sub: { color: "rgba(255,255,255,0.7)", marginTop: 6, marginBottom: 14, fontWeight: "700" },

  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  player: { color: "#fff", fontWeight: "900", fontSize: 16 },
  mini: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontWeight: "700" },

  input: {
    width: 110,
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },

  navRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  navBtn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  navText: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },
  disabled: { opacity: 0.35 },

  primaryBtn: {
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  primaryText: { color: "#fff", fontWeight: "900" },
});
