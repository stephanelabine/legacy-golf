import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { deleteRound, getRounds } from "../storage/rounds";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function sumGross(round, playerId) {
  const holes = Array.isArray(round?.holes) ? round.holes : [];
  let total = 0;
  for (const h of holes) {
    const raw = h?.scores?.[playerId];
    if (raw === undefined || raw === null || raw === "") continue;
    total += toInt(raw);
  }
  return total > 0 ? total : 0;
}

function calcNet(gross, handicap) {
  const h = Number(handicap);
  const strokes = Number.isFinite(h) ? Math.round(h) : 0;
  if (!gross) return 0;
  return Math.max(0, gross - Math.max(0, strokes));
}

function formatDate(round) {
  const raw = round?.playedAt || round?.date || round?.createdAt || round?.startedAt || round?.timestamp;
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function isCompletedForPlayer(round, playerId) {
  const holes = Array.isArray(round?.holes) ? round.holes : [];
  if (holes.length < 18) return false;
  for (let i = 0; i < 18; i++) {
    const raw = holes?.[i]?.scores?.[playerId];
    if (raw === undefined || raw === null || String(raw).trim() === "") return false;
  }
  return true;
}

export default function RoundDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const roundId = route?.params?.roundId;

  const [round, setRound] = useState(null);

  const load = useCallback(async () => {
    const all = await getRounds();
    const found = (all || []).find((r) => String(r?.id) === String(roundId));
    setRound(found || null);
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  const course = String(round?.courseName || "Course").trim();
  const date = formatDate(round);
  const tees = String(round?.tees || "—");
  const mode = String(round?.scoringMode || "gross").toUpperCase();

  const players = useMemo(() => (Array.isArray(round?.players) ? round.players : []), [round]);
  const p1 = players?.[0] || null;
  const p1Id = p1?.id ? String(p1.id) : "p1";
  const completed = isCompletedForPlayer(round, p1Id);
  const status = completed ? "COMPLETED" : "IN PROGRESS";

  const playerRows = useMemo(() => {
    return players.map((p) => {
      const id = String(p?.id || "");
      const gross = sumGross(round, id);
      const net = calcNet(gross, p?.handicap);
      return { id, name: String(p?.name || "Player").trim(), gross, net };
    });
  }, [players, round]);

  function onDone() {
    navigation.goBack();
  }

  async function onDelete() {
    Alert.alert("Delete round?", "This will remove the round from history.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteRound(roundId);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Round Details</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {date}
            </Text>
          </View>

          <View style={{ width: 70 }} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Text style={styles.course} numberOfLines={1}>
              {course}
            </Text>

            <View style={[styles.statusChip, completed ? styles.statusChipDone : styles.statusChipProg]}>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{players.length} Players</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{tees}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{mode}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Players</Text>
          <Text style={styles.sectionHint}>Gross + Net</Text>
        </View>

        <View style={{ gap: 10 }}>
          {playerRows.map((p, idx) => (
            <View key={p.id || String(idx)} style={styles.playerRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.playerName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.playerHint} numberOfLines={1}>
                  gross {p.gross ? p.gross : "—"} • net {p.gross ? p.net : "—"}
                </Text>
              </View>

              <View style={styles.playerScoreBox}>
                <View style={styles.scoreLine}>
                  <Text style={styles.scoreKey}>gross</Text>
                  <Text style={styles.scoreVal}>{p.gross ? String(p.gross) : "—"}</Text>
                </View>
                <View style={styles.scoreLine}>
                  <Text style={styles.scoreKey}>net</Text>
                  <Text style={styles.scoreVal}>{p.gross ? String(p.net) : "—"}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Next</Text>
          <Text style={styles.sectionHint}>Coming soon</Text>
        </View>

        <View style={styles.comingCard}>
          <MaterialCommunityIcons name="trophy-outline" size={22} color="rgba(255,255,255,0.70)" />
          <Text style={styles.comingTitle}>Payouts, formats, and KP tracking</Text>
          <Text style={styles.comingText}>We’ll add these into this screen next.</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: 14 + insets.bottom }]}>
        <Pressable onPress={onDone} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>

        <Pressable onPress={onDelete} style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}>
          <Text style={styles.dangerText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },

  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10 },

  headerPill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  headerPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "900", letterSpacing: 0.6 },
  headerSub: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },

  heroCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  course: { color: "#fff", fontSize: 18, fontWeight: "900", flex: 1 },

  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusChipDone: { borderColor: "rgba(15,122,74,0.45)", backgroundColor: "rgba(15,122,74,0.16)" },
  statusChipProg: { borderColor: "rgba(46,125,255,0.45)", backgroundColor: "rgba(46,125,255,0.14)" },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.9, opacity: 0.9 },

  metaRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  metaChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  metaChipText: { color: "#fff", fontWeight: "900", fontSize: 12, opacity: 0.9 },

  sectionHeaderRow: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionHint: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800" },

  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 12,
  },
  playerName: { color: "#fff", fontSize: 15, fontWeight: "900" },
  playerHint: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800" },

  playerScoreBox: {
    minWidth: 110,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    gap: 6,
  },
  scoreLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  scoreKey: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  scoreVal: { color: "#fff", fontSize: 16, fontWeight: "900" },

  comingCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 8,
  },
  comingTitle: { color: "#fff", fontSize: 14, fontWeight: "900", textAlign: "center" },
  comingText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", textAlign: "center" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(11,18,32,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.95)",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  dangerBtn: {
    width: 120,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,90,90,0.35)",
    backgroundColor: "rgba(255,90,90,0.12)",
  },
  dangerText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
