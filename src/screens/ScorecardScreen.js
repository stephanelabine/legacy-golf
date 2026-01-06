import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { loadActiveRound } from "../storage/roundState";

// Premium palette
const BG = "#000000";
const CARD = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";

function strokesReceivedForHole(handicap, strokeIndex) {
  const h = Number(handicap);
  const si = Number(strokeIndex);

  if (!Number.isFinite(h) || h <= 0 || !Number.isFinite(si) || si <= 0) return 0;

  const base = Math.floor(h / 18);      // 0..n
  const rem = h % 18;                   // 0..17
  const extra = rem > 0 && si <= rem ? 1 : 0;

  return base + extra;
}

export default function ScorecardScreen({ navigation, route }) {
  const { course, tee, players = [], holeMeta: holeMetaParam } = route.params;

  const normalizedPlayers = useMemo(() => {
    return (players || []).map((p, idx) => ({
      id: p.id || String(idx),
      name: p.name || `Player ${idx + 1}`,
      handicap: p.handicap ?? "0",
    }));
  }, [players]);

  const [holes, setHoles] = useState({});
  const [savedMeta, setSavedMeta] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const state = await loadActiveRound();
      if (!live) return;
      setHoles(state?.holes || {});
      setSavedMeta(state?.meta?.holeMeta || null);
    })();
    return () => {
      live = false;
    };
  }, []);

  const holeMeta = holeMetaParam || savedMeta || {};

  function getStrokesFor(playerId, holeNum) {
    const h = holes?.[String(holeNum)]?.players?.[playerId];
    const s = h?.strokes;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function grossTotalFor(playerId) {
    let t = 0;
    for (let h = 1; h <= 18; h++) {
      const v = getStrokesFor(playerId, h);
      if (v) t += v;
    }
    return t;
  }

  function netTotalFor(player) {
    let gross = 0;
    let received = 0;

    for (let h = 1; h <= 18; h++) {
      const v = getStrokesFor(player.id, h);
      if (v) {
        gross += v;
        const si = holeMeta?.[String(h)]?.si;
        received += strokesReceivedForHole(player.handicap, si);
      }
    }

    return gross - received;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Scorecard</Text>
        <Text style={styles.sub}>
          {course?.name || ""} • {tee?.name || ""} Tees
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        {/* Totals (Gross + Net) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Totals</Text>

          <View style={styles.totalsHeader}>
            <Text style={styles.totalsLeft}>Player</Text>
            <Text style={styles.totalsRight}>Gross</Text>
            <Text style={styles.totalsRight}>Net</Text>
          </View>

          {normalizedPlayers.map((p) => (
            <View key={p.id} style={styles.totalRow}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.grossVal}>{grossTotalFor(p.id)}</Text>
              <Text style={styles.netVal}>{netTotalFor(p)}</Text>
            </View>
          ))}

          <Text style={styles.note}>
            Net uses stroke index allocation (placeholder SI until course data is added).
          </Text>
        </View>

        {/* Per-hole strokes only (clean) */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Strokes by Hole</Text>

          {Array.from({ length: 18 }).map((_, i) => {
            const holeNum = i + 1;
            return (
              <View key={holeNum} style={styles.holeRow}>
                <Text style={styles.holeNum}>Hole {holeNum}</Text>

                <View style={styles.holeVals}>
                  {normalizedPlayers.map((p) => {
                    const v = getStrokesFor(p.id, holeNum);
                    return (
                      <View key={p.id} style={styles.pill}>
                        <Text style={styles.pillText}>
                          {p.name.split(" ")[0]}: {v ?? "—"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { color: WHITE, fontSize: 28, fontWeight: "900" },
  sub: { color: MUTED, marginTop: 6, fontWeight: "700" },

  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 14,
  },
  cardTitle: { color: WHITE, fontWeight: "900", marginBottom: 10 },

  totalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#2B4B79",
  },
  totalsLeft: { flex: 1, color: MUTED, fontWeight: "900", fontSize: 12 },
  totalsRight: { width: 60, textAlign: "right", color: MUTED, fontWeight: "900", fontSize: 12 },

  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#2B4B79",
  },
  name: { flex: 1, color: WHITE, fontWeight: "900" },
  grossVal: { width: 60, textAlign: "right", color: WHITE, fontWeight: "900" },
  netVal: { width: 60, textAlign: "right", color: GREEN, fontWeight: "900" },

  note: { marginTop: 10, color: MUTED, fontSize: 12, fontWeight: "700" },

  holeRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#2B4B79",
  },
  holeNum: { color: WHITE, fontWeight: "900", marginBottom: 8 },
  holeVals: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  pill: {
    backgroundColor: INNER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { color: WHITE, fontWeight: "800", fontSize: 12 },

  backBtn: {
    height: 56,
    borderRadius: 999,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 16 },
});
