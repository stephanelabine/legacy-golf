import React, { useMemo, useState, useCallback } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { loadActiveRound } from "../storage/roundState";

const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";
const INNER = "rgba(0,0,0,0.18)";

const BLUE = theme?.colors?.primary || "#2E7DFF";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function sumPlayerTotal(state, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const s = state?.holes?.[String(h)]?.players?.[String(playerId)]?.strokes;
    const n = toInt(s);
    if (n > 0) total += n;
  }
  return total;
}

function holePlayerStroke(state, holeNumber, playerId) {
  const s = state?.holes?.[String(holeNumber)]?.players?.[String(playerId)]?.strokes;
  const n = toInt(s);
  return n > 0 ? String(n) : "—";
}

export default function ScorecardScreen({ navigation, route }) {
  const params = route?.params || {};
  const [active, setActive] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const s = await loadActiveRound();
        if (!live) return;
        setActive(s || null);
      })();
      return () => {
        live = false;
      };
    }, [])
  );

  const course = params.course || active?.course || null;
  const tee = params.tee || active?.tee || null;

  const players = useMemo(() => {
    const fromParams = Array.isArray(params.players) ? params.players : [];
    if (fromParams.length) {
      return fromParams.map((p, idx) => ({
        id: p?.id ?? String(idx),
        name: p?.name ?? `Player ${idx + 1}`,
        handicap: p?.handicap ?? 0,
      }));
    }

    const fromActive = Array.isArray(active?.players) ? active.players : [];
    return fromActive.map((p, idx) => ({
      id: p?.id ?? String(idx),
      name: p?.name ?? `Player ${idx + 1}`,
      handicap: p?.handicap ?? 0,
    }));
  }, [params.players, active]);

  const subtitle = useMemo(() => {
    const parts = [];
    if (course?.name) parts.push(course.name);
    if (tee?.name) parts.push(`${tee.name} Tees`);
    return parts.join(" • ");
  }, [course?.name, tee?.name]);

  const totals = useMemo(() => {
    const s = active || {};
    return players.map((p) => ({
      id: String(p.id),
      name: String(p.name || "").trim() || "Player",
      total: sumPlayerTotal(s, String(p.id)),
    }));
  }, [active, players]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Scorecard" subtitle={subtitle} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totals</Text>
          <Text style={styles.cardSub}>Live totals are based on what’s entered so far.</Text>

          <View style={styles.strokeRow}>
            {totals.map((p) => (
              <View key={p.id} style={styles.playerStrokeBox}>
                <Text style={styles.playerStrokeName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.playerStrokeVal}>{p.total > 0 ? String(p.total) : "—"}</Text>
                <Text style={styles.playerStrokeFoot}>strokes</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Strokes by hole</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>18</Text>
            </View>
          </View>

          <Text style={[styles.cardSub, { marginTop: 8 }]}>
            Each player is shown in their own box for quick scanning.
          </Text>

          <View style={styles.divider} />

          {players.length === 0 ? (
            <Text style={styles.emptyText}>No players found for this round yet.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {Array.from({ length: 18 }).map((_, i) => {
                const holeNumber = i + 1;
                return (
                  <View key={holeNumber} style={styles.holeRow}>
                    <View style={styles.holePill}>
                      <Text style={styles.holePillText}>{holeNumber}</Text>
                    </View>

                    <View style={styles.holePlayersRow}>
                      {players.map((p) => (
                        <View key={`${holeNumber}-${p.id}`} style={styles.holePlayerBox}>
                          <Text style={styles.holePlayerName} numberOfLines={1}>
                            {String(p.name || "Player")}
                          </Text>
                          <Text style={styles.holePlayerVal}>
                            {holePlayerStroke(active || {}, holeNumber, String(p.id))}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next</Text>
          <Text style={styles.cardSub}>
            We can add par/handicap strokes and show Net totals once we confirm the handicap model you want.
          </Text>

          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    marginBottom: 12,
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  cardTitle: { color: WHITE, fontSize: 15, fontWeight: "900" },
  cardSub: { marginTop: 6, color: MUTED, fontSize: 12, fontWeight: "800", lineHeight: 17 },

  badge: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: WHITE, fontWeight: "900", fontSize: 12, opacity: 0.9 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, marginBottom: 14 },

  strokeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    flexWrap: "wrap",
  },

  playerStrokeBox: {
    minWidth: 140,
    flexGrow: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: INNER,
  },

  playerStrokeName: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.4,
  },

  playerStrokeVal: {
    marginTop: 8,
    color: WHITE,
    fontWeight: "900",
    fontSize: 24,
  },

  playerStrokeFoot: {
    marginTop: 4,
    color: "rgba(255,255,255,0.60)",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.3,
  },

  holeRow: { gap: 10 },

  holePill: {
    alignSelf: "flex-start",
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  holePillText: { color: WHITE, fontWeight: "900" },

  holePlayersRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  holePlayerBox: {
    minWidth: 140,
    flexGrow: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  holePlayerName: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.35,
  },

  holePlayerVal: {
    marginTop: 8,
    color: WHITE,
    fontWeight: "900",
    fontSize: 22,
  },

  emptyText: { color: MUTED, fontWeight: "800", fontSize: 12 },

  cta: {
    marginTop: 12,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.30)",
  },
  ctaText: { color: WHITE, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
