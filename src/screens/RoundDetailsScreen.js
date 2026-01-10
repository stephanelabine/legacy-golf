import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { getRounds } from "../storage/rounds";

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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getRounds();
    const list = Array.isArray(all) ? all : [];
    const found = list.find((r) => String(r?.id) === String(roundId));
    setRound(found || null);
    setLoading(false);
  }, [roundId]);

  useEffect(() => {
    load();
  }, [load]);

  const players = useMemo(() => (Array.isArray(round?.players) ? round.players : []), [round]);

  const primaryPlayerId = useMemo(() => {
    const p1 = players?.[0];
    return p1?.id ? String(p1.id) : "p1";
  }, [players]);

  const completed = useMemo(() => {
    if (!round) return false;
    return isCompletedForPlayer(round, primaryPlayerId);
  }, [round, primaryPlayerId]);

  const course = useMemo(() => String(round?.courseName || "Course").trim(), [round]);
  const dateLabel = useMemo(() => (round ? formatDate(round) : "—"), [round]);

  const status = completed ? "COMPLETED" : "IN PROGRESS";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Round Details"
        subtitle={loading ? "Loading round…" : "Full history view"}
        fallbackRoute={ROUTES.HISTORY}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Loading…</Text>
            <Text style={styles.cardSub}>Just a second.</Text>
          </View>
        ) : !round ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Round not found</Text>
            <Text style={styles.cardSub}>This round may have been deleted or not saved correctly.</Text>

            <Pressable
              onPress={() => navigation.navigate(ROUTES.HISTORY)}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>Back to History</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {course}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {dateLabel}
                  </Text>
                </View>

                <View style={[styles.statusChip, completed ? styles.statusChipDone : styles.statusChipProg]}>
                  <Text style={styles.statusText}>{status}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>Players</Text>

              {players.length === 0 ? (
                <Text style={styles.cardSub}>No players saved for this round.</Text>
              ) : (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {players.map((p, idx) => {
                    const pid = p?.id ? String(p.id) : `p${idx + 1}`;
                    const name = String(p?.name || `Player ${idx + 1}`).trim();
                    const gross = sumGross(round, pid);
                    const net = calcNet(gross, p?.handicap);

                    return (
                      <View key={pid} style={styles.playerRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {name}
                          </Text>
                          <Text style={styles.playerMeta} numberOfLines={1}>
                            handicap {Number.isFinite(Number(p?.handicap)) ? String(p.handicap) : "—"}
                          </Text>
                        </View>

                        <View style={styles.scorePill}>
                          <View style={styles.scoreRow}>
                            <Text style={styles.scoreKey}>gross</Text>
                            <Text style={styles.scoreVal}>{gross ? String(gross) : "—"}</Text>
                          </View>
                          <View style={styles.scoreRow}>
                            <Text style={styles.scoreKey}>net</Text>
                            <Text style={styles.scoreVal}>{gross ? String(net) : "—"}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>Game + payouts</Text>
              <Text style={styles.cardSub}>Coming next: format, wagers, payouts, KP results, skins, Nassau, etc.</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.inlineRow}>
                <MaterialCommunityIcons name="information-outline" size={18} color="rgba(255,255,255,0.70)" />
                <Text style={styles.cardSub}>
                  This is your “full detail” round history page. We’ll progressively add more detail without clutter.
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  cardSub: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800", lineHeight: 17 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, marginBottom: 14 },
  sectionLabel: { color: "rgba(255,255,255,0.80)", fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },

  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  statusChipDone: { borderColor: "rgba(15,122,74,0.45)", backgroundColor: "rgba(15,122,74,0.16)" },
  statusChipProg: { borderColor: "rgba(46,125,255,0.45)", backgroundColor: "rgba(46,125,255,0.14)" },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.9, opacity: 0.9 },

  playerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  playerName: { color: "#fff", fontSize: 14, fontWeight: "900" },
  playerMeta: { marginTop: 4, color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "800" },

  scorePill: {
    minWidth: 108,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    gap: 6,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  scoreKey: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  scoreVal: { color: "#fff", fontSize: 16, fontWeight: "900" },

  inlineRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  primaryBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.6 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
