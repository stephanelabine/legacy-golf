import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function NewRoundScreen({ navigation }) {
  const [roundName, setRoundName] = useState("");
  const [holes, setHoles] = useState(18);
  const [gameType, setGameType] = useState("stroke");

  const [players, setPlayers] = useState([
    { id: uid(), name: "Player 1", handicap: "" },
    { id: uid(), name: "Player 2", handicap: "" },
  ]);

  const canStart = useMemo(() => {
    if (players.length < 2) return false;
    return players.every((p) => (p.name || "").trim().length > 0);
  }, [players]);

  function updatePlayer(id, patch) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPlayer() {
    if (players.length >= 4) return;
    setPlayers((prev) => [...prev, { id: uid(), name: `Player ${prev.length + 1}`, handicap: "" }]);
  }

  function removePlayer(id) {
    if (players.length <= 2) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function startRound() {
    const cleanedPlayers = players.map((p) => ({
      id: p.id,
      name: (p.name || "").trim(),
      handicap: p.handicap === "" ? null : Number(p.handicap),
    }));

    const round = {
      id: uid(),
      createdAt: Date.now(),
      name: roundName.trim() || "New Round",
      holes,
      gameType,
      players: cleanedPlayers,
      scores: Object.fromEntries(cleanedPlayers.map((p) => [p.id, Array(holes).fill(null)])),
      currentHoleIndex: 0,
    };

    navigation.navigate("ScoreEntry", { round });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New Round</Text>

      <Text style={styles.label}>Round name (optional)</Text>
      <TextInput
        value={roundName}
        onChangeText={setRoundName}
        placeholder="Saturday skins"
        placeholderTextColor="rgba(255,255,255,0.45)"
        style={styles.input}
      />

      <Text style={styles.label}>Holes</Text>
      <View style={styles.row}>
        <Pressable onPress={() => setHoles(9)} style={[styles.pill, holes === 9 && styles.pillOn]}>
          <Text style={[styles.pillText, holes === 9 && styles.pillTextOn]}>9</Text>
        </Pressable>
        <Pressable onPress={() => setHoles(18)} style={[styles.pill, holes === 18 && styles.pillOn]}>
          <Text style={[styles.pillText, holes === 18 && styles.pillTextOn]}>18</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Game</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setGameType("stroke")}
          style={[styles.pill, gameType === "stroke" && styles.pillOn]}
        >
          <Text style={[styles.pillText, gameType === "stroke" && styles.pillTextOn]}>Stroke</Text>
        </Pressable>

        <Pressable
          onPress={() => setGameType("stableford")}
          style={[styles.pill, gameType === "stableford" && styles.pillOn]}
        >
          <Text style={[styles.pillText, gameType === "stableford" && styles.pillTextOn]}>
            Stableford
          </Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Players (2–4)</Text>

      {players.map((p, idx) => (
        <View key={p.id} style={styles.playerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.playerLabel}>Player {idx + 1}</Text>
            <TextInput
              value={p.name}
              onChangeText={(t) => updatePlayer(p.id, { name: t })}
              placeholder="Name"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
            />
            <TextInput
              value={p.handicap ?? ""}
              onChangeText={(t) => updatePlayer(p.id, { handicap: t.replace(/[^\d.-]/g, "") })}
              placeholder="Handicap (optional)"
              placeholderTextColor="rgba(255,255,255,0.45)"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>

          <Pressable
            onPress={() => removePlayer(p.id)}
            disabled={players.length <= 2}
            style={[styles.smallBtn, players.length <= 2 && styles.btnDisabled]}
          >
            <Text style={styles.smallBtnText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.row}>
        <Pressable onPress={addPlayer} disabled={players.length >= 4} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Add player</Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate("History")} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>History</Text>
        </Pressable>
      </View>

      <Pressable onPress={startRound} disabled={!canStart} style={[styles.primaryBtn, !canStart && styles.btnDisabled]}>
        <Text style={styles.primaryBtnText}>Start round</Text>
      </Pressable>

      <Pressable onPress={() => navigation.goBack()} style={styles.ghostBtn}>
        <Text style={styles.ghostBtnText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 52, backgroundColor: "#0b1320", flexGrow: 1 },
  title: { color: "#fff", fontSize: 28, fontWeight: "800", marginBottom: 18 },
  label: { color: "rgba(255,255,255,0.75)", marginTop: 14, marginBottom: 8, fontSize: 13 },
  row: { flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 6 },

  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    marginBottom: 10,
  },

  pill: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillOn: { backgroundColor: "rgba(255,255,255,0.16)" },
  pillText: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  pillTextOn: { color: "#fff" },

  playerCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  playerLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginBottom: 6 },

  primaryBtn: {
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },

  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  secondaryBtnText: { color: "rgba(255,255,255,0.85)", fontWeight: "800" },

  ghostBtn: { height: 44, alignItems: "center", justifyContent: "center", marginTop: 10 },
  ghostBtnText: { color: "rgba(255,255,255,0.7)", fontWeight: "800" },

  smallBtn: {
    alignSelf: "flex-start",
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  smallBtnText: { color: "rgba(255,255,255,0.8)", fontWeight: "800", fontSize: 12 },
  btnDisabled: { opacity: 0.4 },
});
