import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Alert,
} from "react-native";

import { getRounds, saveRound } from "../storage/rounds";
import { ROUTES } from "../navigation/routes";

const BG = "#0B1220";
const BORDER = "rgba(255,255,255,0.2)";
const PRIMARY = "#2E7DFF";
const TEXT = "#FFFFFF";

export default function ScoreEntryScreen({ route, navigation }) {
  const roundId = route?.params?.roundId ?? null;

  const [round, setRound] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!roundId) {
        Alert.alert("Error", "Missing round id.");
        navigation.goBack();
        return;
      }

      const rounds = await getRounds();
      const found = rounds.find((r) => r.id === roundId);

      if (!found) {
        Alert.alert("Error", "Round not found.");
        navigation.goBack();
        return;
      }

      if (mounted) setRound(found);
    }

    load();

    return () => {
      mounted = false;
    };
  }, [roundId, navigation]);

  const players = useMemo(() => round?.players || [], [round]);

  function updateScore(holeIndex, playerId, value) {
    setRound((prev) => {
      if (!prev) return prev;

      const nextHoles = prev.holes.map((h, i) => {
        if (i !== holeIndex) return h;

        const trimmed = (value || "").trim();
        const parsed =
          trimmed === "" ? null : Number.parseInt(trimmed, 10);

        return {
          ...h,
          scores: {
            ...h.scores,
            [playerId]: Number.isFinite(parsed) ? parsed : null,
          },
        };
      });

      return { ...prev, holes: nextHoles };
    });
  }

  async function saveProgress() {
    if (!round || saving) return;

    setSaving(true);
    const ok = await saveRound({
      ...round,
      updatedAt: new Date().toISOString(),
    });
    setSaving(false);

    if (!ok) {
      Alert.alert("Error", "Could not save.");
      return;
    }

    Alert.alert("Saved", "Progress saved.");
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{round.courseName}</Text>
      <Text style={styles.subtitle}>
        {round.format} • {round.tees}
      </Text>

      <FlatList
        data={round.holes}
        keyExtractor={(item) => String(item.hole)}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <View style={styles.holeCard}>
            <Text style={styles.holeTitle}>Hole {item.hole}</Text>

            {players.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={styles.playerName}>{p.name}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={item.scores?.[p.id] != null ? String(item.scores[p.id]) : ""}
                  onChangeText={(v) => updateScore(index, p.id, v)}
                  placeholder=""
                  placeholderTextColor="rgba(255,255,255,0.35)"
                />
              </View>
            ))}
          </View>
        )}
      />

      <View style={styles.footer}>
        <Pressable
          style={[styles.btnSecondary, saving && styles.disabled]}
          onPress={saveProgress}
          disabled={saving}
        >
          <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>

        <Pressable
          style={styles.btnPrimary}
          onPress={() => navigation.navigate(ROUTES.HOME)}
        >
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
    padding: 16,
  },
  loading: {
    color: TEXT,
    textAlign: "center",
    marginTop: 40,
  },
  title: {
    color: TEXT,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: TEXT,
    opacity: 0.7,
    marginBottom: 12,
  },
  holeCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  holeTitle: {
    color: TEXT,
    fontWeight: "800",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  playerName: {
    flex: 1,
    color: TEXT,
  },
  input: {
    width: 60,
    height: 36,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    color: TEXT,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    padding: 16,
    backgroundColor: BG,
    gap: 10,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: PRIMARY,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: TEXT,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.6,
  },
});
