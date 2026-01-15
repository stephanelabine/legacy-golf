// src/screens/FinalResultsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect, CommonActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { getRoundById } from "../storage/rounds";

const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";
const INNER = "rgba(0,0,0,0.18)";
const BLUE = theme?.colors?.primary || "#2E7DFF";

// Green accent ring (matches ScoreEntryScreen)
const GREEN_BORDER = "rgba(46,204,113,0.70)";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function readStroke(roundRoot, holeNumber, playerId) {
  const rid = String(playerId);

  const a =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
    roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
  const aInt = toInt(a);
  if (aInt > 0) return aInt;

  const holesArr = Array.isArray(roundRoot?.holes) ? roundRoot.holes : null;
  if (holesArr && holeNumber >= 1 && holeNumber <= holesArr.length) {
    const h = holesArr[holeNumber - 1];
    const b = h?.scores?.[rid] ?? h?.strokes?.[rid];
    const bInt = toInt(b);
    if (bInt > 0) return bInt;
  }

  return 0;
}

function readField(roundRoot, holeNumber, playerId, key) {
  const rid = String(playerId);
  const v =
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.[key] ??
    roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.stats?.[key];
  return v ?? null;
}

function sumTotal(roundRoot, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const n = readStroke(roundRoot, h, playerId);
    if (n > 0) total += n;
  }
  return total;
}

function fmtPct(a, b) {
  if (!b) return "—";
  const pct = Math.round((a / b) * 100);
  return `${pct}%`;
}

export default function FinalResultsScreen({ navigation, route }) {
  const params = route?.params || {};
  const roundId = String(params.roundId || "");
  const [round, setRound] = useState(null);
  const [expanded, setExpanded] = useState({}); // playerId -> bool

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const r = roundId ? await getRoundById(roundId) : null;
        if (!live) return;
        setRound(r || null);
      })();
      return () => {
        live = false;
      };
    }, [roundId])
  );

  const players = useMemo(() => {
    const list = Array.isArray(round?.players) ? round.players : [];
    return list.map((p, idx) => ({
      id: String(p?.id ?? String(idx)),
      name: String(p?.name || `Player ${idx + 1}`),
      handicap: Number(p?.handicap ?? 0),
    }));
  }, [round]);

  const courseName = String(round?.courseName || round?.course?.name || "Course");
  const teeName = String(round?.teeName || round?.tee?.name || "Tees");
  const subtitle = `${courseName} • ${teeName}`;

  const leaderboard = useMemo(() => {
    const r = round || {};
    const rows = players.map((p) => ({
      id: p.id,
      name: p.name,
      total: sumTotal(r, p.id),
    }));
    rows.sort((a, b) => {
      const aa = a.total || 9999;
      const bb = b.total || 9999;
      if (aa !== bb) return aa - bb;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [round, players]);

  const stats = useMemo(() => {
    const r = round || {};
    const out = players.map((p) => {
      let holesWithPutts = 0;
      let puttsTotal = 0;

      let firYes = 0;
      let firOpp = 0;

      let girYes = 0;
      let girOpp = 0;

      let upYes = 0;
      let upOpp = 0;

      let sandYes = 0;
      let sandOpp = 0;

      for (let h = 1; h <= 18; h++) {
        const putts = toInt(readField(r, h, p.id, "putts"));
        if (putts > 0) {
          holesWithPutts += 1;
          puttsTotal += putts;
        }

        const fairway = String(readField(r, h, p.id, "fairway") ?? "na");
        if (fairway !== "na") {
          firOpp += 1;
          if (fairway === "yes") firYes += 1;
        }

        const green = String(readField(r, h, p.id, "green") ?? "na");
        if (green !== "na") {
          girOpp += 1;
          if (green === "yes") girYes += 1;
        }

        const updown = String(readField(r, h, p.id, "updown") ?? "na");
        if (updown !== "na") {
          upOpp += 1;
          if (updown === "yes") upYes += 1;
        }

        const sandSave = String(readField(r, h, p.id, "sandSave") ?? "na");
        if (sandSave !== "na") {
          sandOpp += 1;
          if (sandSave === "yes") sandYes += 1;
        }
      }

      const puttsAvg = holesWithPutts ? (puttsTotal / holesWithPutts).toFixed(1) : "—";

      return {
        id: p.id,
        name: p.name,
        puttsAvg,
        fir: fmtPct(firYes, firOpp),
        gir: fmtPct(girYes, girOpp),
        updown: fmtPct(upYes, upOpp),
        sand: fmtPct(sandYes, sandOpp),
      };
    });

    return out;
  }, [round, players]);

  const wagers = useMemo(() => {
    const w = round?.wagers;
    if (!w || typeof w !== "object" || !w.enabled) return null;
    return w;
  }, [round]);

  function togglePlayer(pid) {
    setExpanded((prev) => ({ ...prev, [pid]: !prev[pid] }));
  }

  function onViewPayouts() {
    if (!roundId) return;
    navigation.navigate(ROUTES.PAYOUTS, { roundId });
  }

  function onDone() {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: ROUTES.HOME }],
      })
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader navigation={navigation} title="Final Results" subtitle="Loading…" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: MUTED, fontWeight: "800" }}>Round not found.</Text>
          <Pressable onPress={onDone} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>Go Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Final Results" subtitle={subtitle} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Leaderboard</Text>
            <Text style={styles.cardSub}>Gross strokes. Tap a player to expand hole-by-hole.</Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {leaderboard.map((p, idx) => {
                const isOpen = !!expanded[p.id];
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => togglePlayer(p.id)}
                    style={({ pressed }) => [styles.leaderRow, pressed && styles.pressed]}
                  >
                    <View style={styles.rankPill}>
                      <Text style={styles.rankText}>{idx + 1}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.leaderName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.leaderSub}>{isOpen ? "Tap to collapse" : "Tap to expand"}</Text>
                    </View>

                    <View style={styles.totalBox}>
                      <Text style={styles.totalVal}>{p.total > 0 ? String(p.total) : "—"}</Text>
                      <Text style={styles.totalFoot}>strokes</Text>
                    </View>

                    {isOpen ? (
                      <View style={styles.expandWrap}>
                        <View style={styles.expandDivider} />
                        <View style={styles.holesGrid}>
                          {Array.from({ length: 18 }).map((_, i) => {
                            const h = i + 1;
                            const v = readStroke(round, h, p.id);
                            return (
                              <View key={`${p.id}-${h}`} style={styles.holeChip}>
                                <Text style={styles.holeChipTop}>{h}</Text>
                                <Text style={styles.holeChipVal}>{v > 0 ? String(v) : "—"}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stats snapshot</Text>
            <Text style={styles.cardSub}>Based on what has been tracked so far.</Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {stats.map((s) => (
                <View key={s.id} style={styles.statRow}>
                  <Text style={styles.statName} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <View style={styles.statPills}>
                    <View style={styles.statPill}>
                      <Text style={styles.statK}>FIR</Text>
                      <Text style={styles.statV}>{s.fir}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statK}>GIR</Text>
                      <Text style={styles.statV}>{s.gir}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statK}>Putts</Text>
                      <Text style={styles.statV}>{s.puttsAvg}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statK}>U&D</Text>
                      <Text style={styles.statV}>{s.updown}</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statK}>Sand</Text>
                      <Text style={styles.statV}>{s.sand}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wagers & payouts</Text>
            <Text style={styles.cardSub}>
              Wagers are attached to this round. Payouts are calculated from strokes where possible.
            </Text>

            {wagers ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                {wagers?.skins?.enabled ? (
                  <View style={styles.wagerRow}>
                    <Text style={styles.wagerName}>Skins</Text>
                    <Text style={styles.wagerVal}>${Math.round(Number(wagers.skins.amount || 0))}</Text>
                  </View>
                ) : null}

                {wagers?.kps?.enabled ? (
                  <View style={styles.wagerRow}>
                    <Text style={styles.wagerName}>KPs</Text>
                    <Text style={styles.wagerVal}>${Math.round(Number(wagers.kps.amount || 0))}</Text>
                  </View>
                ) : null}

                {wagers?.nassau?.enabled ? (
                  <View style={styles.wagerRow}>
                    <Text style={styles.wagerName}>Nassau</Text>
                    <Text style={styles.wagerVal}>
                      F ${Math.round(Number(wagers.nassau.front || 0))} • B ${Math.round(Number(wagers.nassau.back || 0))} • T $
                      {Math.round(Number(wagers.nassau.total || 0))}
                    </Text>
                  </View>
                ) : null}

                {wagers?.perStroke?.enabled ? (
                  <View style={styles.wagerRow}>
                    <Text style={styles.wagerName}>Per stroke</Text>
                    <Text style={styles.wagerVal}>${Number(wagers.perStroke.amount || 0)} / stroke</Text>
                  </View>
                ) : null}

                <Pressable onPress={onViewPayouts} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>View payouts</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.emptyText}>No wagers were set for this round.</Text>
              </View>
            )}
          </View>
        </View>

        <Pressable onPress={onDone} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>Done</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  greenRing: {
    borderRadius: 24,
    padding: 2,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: "transparent",
    marginBottom: 12,
  },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
  },

  cardTitle: { color: WHITE, fontSize: 15, fontWeight: "900" },
  cardSub: { marginTop: 6, color: MUTED, fontSize: 12, fontWeight: "800", lineHeight: 17 },

  leaderRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  rankPill: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: WHITE, fontWeight: "900" },

  leaderName: { color: WHITE, fontWeight: "900", fontSize: 15 },
  leaderSub: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 11 },

  totalBox: {
    minWidth: 80,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  totalVal: { color: WHITE, fontWeight: "900", fontSize: 22 },
  totalFoot: { marginTop: 2, color: MUTED, fontWeight: "800", fontSize: 11 },

  expandWrap: { width: "100%", marginTop: 10 },
  expandDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginBottom: 10 },

  holesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  holeChip: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: INNER,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  holeChipTop: { color: MUTED, fontWeight: "900", fontSize: 11 },
  holeChipVal: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 14 },

  statRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
  },
  statName: { color: WHITE, fontWeight: "900", fontSize: 14 },
  statPills: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statPill: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  statK: { color: MUTED, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  statV: { color: WHITE, fontWeight: "900", fontSize: 12 },

  wagerRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  wagerName: { color: WHITE, fontWeight: "900" },
  wagerVal: { color: WHITE, fontWeight: "900", opacity: 0.9 },

  emptyText: { color: MUTED, fontWeight: "800", fontSize: 12 },

  primaryBtn: {
    marginTop: 6,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
  },
  primaryText: { color: WHITE, fontWeight: "900", letterSpacing: 0.4 },

  cta: {
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.30)",
    marginTop: 2,
  },
  ctaText: { color: WHITE, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
