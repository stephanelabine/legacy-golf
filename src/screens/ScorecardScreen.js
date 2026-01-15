// src/screens/ScorecardScreen.js
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
const LIVE_GREEN = "#2ECC71";
const LIVE_GREEN_SOFT = "rgba(46,204,113,0.18)";
const LIVE_GREEN_BORDER = "rgba(46,204,113,0.75)";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
}

// Supports BOTH storage shapes:
// A) roundState: holes["1"].players["p1"].stokes
// B) rounds.js legacy: holes[0].scores["p1"] = strokes
function readStroke(roundRoot, holeNumber, playerId) {
  const rid = String(playerId);

  // A) roundState shape (object keyed by hole number)
  const a =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
    roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
  const aInt = toInt(a);
  if (aInt > 0) return aInt;

  // B) legacy rounds shape (array of holes)
  const holesArr = Array.isArray(roundRoot?.holes) ? roundRoot.holes : null;
  if (holesArr && holeNumber >= 1 && holeNumber <= holesArr.length) {
    const h = holesArr[holeNumber - 1];
    const b = h?.scores?.[rid] ?? h?.strokes?.[rid];
    const bInt = toInt(b);
    if (bInt > 0) return bInt;
  }

  return 0;
}

function sumPlayerTotal(roundRoot, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const n = readStroke(roundRoot, h, playerId);
    if (n > 0) total += n;
  }
  return total;
}

function holePlayerStroke(roundRoot, holeNumber, playerId) {
  const n = readStroke(roundRoot, holeNumber, playerId);
  return n > 0 ? String(n) : "—";
}

// Model A (Stroke Index allocation)
// - A handicap of 12 gets 1 stroke on SI 1-12
// - A handicap of 20 gets 1 stroke on all 18 + 1 extra on SI 1-2
function strokesReceivedOnHole(handicap, strokeIndex) {
  const h = Math.max(0, Math.floor(Number(handicap) || 0));
  const si = Math.max(1, Math.min(18, Math.floor(Number(strokeIndex) || 18)));

  const base = Math.floor(h / 18);
  const rem = h % 18;

  // SI is 1..18, so "rem" strokes go to SI 1..rem
  const extra = si <= rem ? 1 : 0;
  return base + extra;
}

function sumPlayerNetTotal(roundRoot, playerId, handicap, holeMeta) {
  let total = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const gross = readStroke(roundRoot, hole, playerId);
    if (gross <= 0) continue;

    const si = holeMeta?.[String(hole)]?.si ?? holeMeta?.[String(hole)]?.strokeIndex ?? 18;
    const recv = strokesReceivedOnHole(handicap, si);

    // Keep net reasonable; if gross exists, net cannot go below 1.
    const net = Math.max(1, gross - recv);
    total += net;
  }

  return total;
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

  const root = useMemo(() => unwrapRound(active) || null, [active]);

  const course = params.course || root?.course || active?.course || null;
  const tee = params.tee || root?.tee || active?.tee || null;

  // Hole meta passed from HoleViewScreen (or fallback to stored)
  const holeMeta = useMemo(() => {
    const m = params?.holeMeta || root?.meta?.holeMeta || active?.meta?.holeMeta || null;
    return m && typeof m === "object" ? m : null;
  }, [params?.holeMeta, root, active]);

  const players = useMemo(() => {
    const fromParams = Array.isArray(params.players) ? params.players : [];
    if (fromParams.length) {
      return fromParams.map((p, idx) => ({
        id: p?.id ?? String(idx),
        name: p?.name ?? `Player ${idx + 1}`,
        handicap: p?.handicap ?? 0,
      }));
    }

    const fromRoot = Array.isArray(root?.players) ? root.players : [];
    if (fromRoot.length) {
      return fromRoot.map((p, idx) => ({
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
  }, [params.players, root, active]);

  const subtitle = useMemo(() => {
    const parts = [];
    if (course?.name) parts.push(course.name);
    if (tee?.name) parts.push(`${tee.name} Tees`);
    return parts.join(" • ");
  }, [course?.name, tee?.name]);

  const totals = useMemo(() => {
    const r = root || active || {};
    return players.map((p) => {
      const id = String(p.id);
      const name = String(p.name || "").trim() || "Player";
      const gross = sumPlayerTotal(r, id);

      // Only compute Net if we have holeMeta (SI per hole). Otherwise show dash.
      const net =
        holeMeta && typeof holeMeta === "object" ? sumPlayerNetTotal(r, id, p?.handicap ?? 0, holeMeta) : 0;

      return {
        id,
        name,
        handicap: Number(p?.handicap ?? 0),
        gross,
        net,
        hasMeta: !!holeMeta,
      };
    });
  }, [root, active, players, holeMeta]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Scorecard" subtitle={subtitle} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, styles.liveCard]}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Totals</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <Text style={styles.cardSub}>
            Totals update as scores are entered. Net totals use Model A (Stroke Index allocation).
          </Text>

          <View style={styles.strokeRow}>
            {totals.map((p) => (
              <View key={p.id} style={[styles.playerStrokeBox, styles.playerStrokeBoxLive]}>
                <Text style={styles.playerStrokeName} numberOfLines={1}>
                  {p.name}
                </Text>

                <Text style={styles.playerStrokeVal}>{p.gross > 0 ? String(p.gross) : "—"}</Text>
                <Text style={styles.playerStrokeFoot}>gross strokes</Text>

                <View style={styles.netRow}>
                  <Text style={styles.netLabel}>net</Text>
                  <Text style={styles.netValue}>
                    {p.hasMeta ? (p.net > 0 ? String(p.net) : "—") : "—"}
                  </Text>
                </View>
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
            Hole label is shown above the entry boxes for quick scanning.
          </Text>

          <View style={styles.divider} />

          {players.length === 0 ? (
            <Text style={styles.emptyText}>No players found for this round yet.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {Array.from({ length: 18 }).map((_, i) => {
                const holeNumber = i + 1;
                return (
                  <View key={holeNumber} style={styles.holeBlock}>
                    <Text style={styles.holeLabel}>Hole {holeNumber}</Text>

                    <View style={styles.holePlayersRow}>
                      {players.map((p) => (
                        <View key={`${holeNumber}-${p.id}`} style={styles.holePlayerBox}>
                          <Text style={styles.holePlayerName} numberOfLines={1}>
                            {String(p.name || "Player")}
                          </Text>
                          <Text style={styles.holePlayerVal}>
                            {holePlayerStroke(root || active || {}, holeNumber, String(p.id))}
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
            Next we can show Par and Net-by-hole (and later add any wager/game math using Net or Gross).
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

  liveCard: {
    borderColor: LIVE_GREEN_BORDER,
    backgroundColor: "rgba(46,204,113,0.06)",
    shadowColor: LIVE_GREEN,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  cardTitle: { color: WHITE, fontSize: 15, fontWeight: "900" },
  cardSub: { marginTop: 6, color: MUTED, fontSize: 12, fontWeight: "800", lineHeight: 17 },

  liveBadge: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LIVE_GREEN_BORDER,
    backgroundColor: LIVE_GREEN_SOFT,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: LIVE_GREEN,
  },
  liveBadgeText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },

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

  playerStrokeBoxLive: {
    borderColor: "rgba(46,204,113,0.45)",
    backgroundColor: "rgba(46,204,113,0.08)",
  },

  playerStrokeName: {
    color: "rgba(255,255,255,0.78)",
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

  netRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  netLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11, letterSpacing: 0.35 },
  netValue: { color: WHITE, fontWeight: "900", fontSize: 16 },

  holeBlock: { gap: 10 },

  holeLabel: {
    color: "rgba(255,255,255,0.80)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
    marginLeft: 2,
  },

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
