import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getRounds, saveRound } from "../storage/rounds";
import ROUTES from "../navigation/routes";

const BG = "#0B1220";
const BORDER = "rgba(255,255,255,0.16)";
const PRIMARY = "#2E7DFF";
const TEXT = "#FFFFFF";
const SUB = "rgba(255,255,255,0.70)";

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
  const showSI = (round?.scoringMode || "gross") === "net";

  function updateScore(holeIndex, playerId, value) {
    setRound((prev) => {
      if (!prev) return prev;

      const trimmed = (value || "").trim();
      const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);

      const nextHoles = prev.holes.map((h, i) => {
        if (i !== holeIndex) return h;
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

  function RowHeader() {
    return (
      <View style={styles.headerCard}>
        <Text style={styles.title}>{round.courseName}</Text>
        <Text style={styles.subtitle}>
          {round.format} • {round.tees} • {(round.scoringMode || "gross").toUpperCase()}
        </Text>

        <View style={styles.legendRow}>
          <Text style={styles.legendHole}>Hole</Text>
          {showSI ? <Text style={styles.legendSI}>SI</Text> : null}

          <View style={styles.legendPlayers}>
            {players.map((p) => (
              <Text key={p.id} style={styles.legendPlayer} numberOfLines={1}>
                {p.name}
              </Text>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <FlatList
        data={round.holes}
        keyExtractor={(item) => String(item.hole)}
        ListHeaderComponent={<RowHeader />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <View style={styles.holeCard}>
            <Text style={styles.holeTitle}>{item.hole}</Text>

            {showSI ? (
              <Text style={styles.siCell}>
                {item.si != null ? String(item.si) : "–"}
              </Text>
            ) : null}

            <View style={styles.inputsRow}>
              {players.map((p) => (
                <TextInput
                  key={p.id}
                  style={styles.input}
                  keyboardType="number-pad"
                  value={item.scores?.[p.id] != null ? String(item.scores[p.id]) : ""}
                  onChangeText={(v) => updateScore(index, p.id, v)}
                  placeholder="–"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  maxLength={2}
                />
              ))}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.btnSecondary,
            pressed && styles.pressed,
            saving && styles.disabled,
          ]}
          onPress={saveProgress}
          disabled={saving}
        >
          <Text style={styles.btnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
          onPress={() => navigation.navigate(ROUTES.HOME)}
        >
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  loading: { color: TEXT, textAlign: "center", marginTop: 40, fontWeight: "800" },

  headerCard: {
    marginTop: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 14,
  },
  title: { color: TEXT, fontSize: 22, fontWeight: "900", letterSpacing: 0.2 },
  subtitle: { color: SUB, marginTop: 4, fontWeight: "700" },

  legendRow: { marginTop: 14, flexDirection: "row", alignItems: "center" },
  legendHole: { width: 46, color: SUB, fontWeight: "900", letterSpacing: 0.2 },
  legendSI: { width: 32, color: SUB, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },

  legendPlayers: { flex: 1, flexDirection: "row", gap: 10, justifyContent: "space-between" },
  legendPlayer: { flex: 1, color: SUB, fontWeight: "800", fontSize: 12 },

  holeCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  holeTitle: { width: 46, color: TEXT, fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },

  siCell: {
    width: 32,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "900",
    fontSize: 12,
    textAlign: "center",
  },

  inputsRow: { flex: 1, flexDirection: "row", gap: 10, justifyContent: "space-between" },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.12)",
    color: TEXT,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 2 },
    }),
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    gap: 10,
  },

  btnPrimary: {
    flex: 1,
    backgroundColor: PRIMARY,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 5 },
    }),
  },
  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: TEXT, fontWeight: "900", letterSpacing: 0.3 },

  pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.92, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.6 },
});
