import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { getRounds, deleteAllRounds } from "../storage/rounds";

function formatDate(ms) {
  const d = new Date(ms);
  return d.toLocaleString();
}

export default function HistoryScreen({ navigation }) {
  const [rounds, setRounds] = useState([]);

  async function load() {
    const r = await getRounds();
    setRounds(r);
  }

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>History</Text>

      {rounds.length === 0 ? (
        <Text style={styles.empty}>No saved rounds yet.</Text>
      ) : (
        rounds.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => navigation.navigate("ScoreEntry", { round: r })}
            style={styles.card}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{r.name}</Text>
              <Text style={styles.meta}>
                {r.gameType} • {r.holes} holes
              </Text>
              <Text style={styles.meta}>{formatDate(r.createdAt)}</Text>
            </View>
            <Text style={styles.open}>Open</Text>
          </Pressable>
        ))
      )}

      <View style={styles.row}>
        <Pressable onPress={() => navigation.navigate("NewRound")} style={styles.btn}>
          <Text style={styles.btnText}>New round</Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate("Home")} style={styles.btn}>
          <Text style={styles.btnText}>Home</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={async () => {
          await deleteAllRounds();
          await load();
        }}
        style={styles.danger}
      >
        <Text style={styles.dangerText}>Delete all rounds</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 52, backgroundColor: "#0b1320", flexGrow: 1 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900", marginBottom: 14 },
  empty: { color: "rgba(255,255,255,0.65)", marginTop: 10, fontWeight: "700" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 10,
  },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  meta: { color: "rgba(255,255,255,0.65)", marginTop: 4, fontWeight: "700", fontSize: 12 },
  open: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },

  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnText: { color: "rgba(255,255,255,0.85)", fontWeight: "900" },

  danger: { marginTop: 16, height: 44, alignItems: "center", justifyContent: "center" },
  dangerText: { color: "rgba(255,120,120,0.9)", fontWeight: "900" },
});
