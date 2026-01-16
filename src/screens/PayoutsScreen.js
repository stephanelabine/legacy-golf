// src/screens/PayoutsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

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

function sumTotal(roundRoot, playerId) {
  let total = 0;
  for (let h = 1; h <= 18; h++) {
    const n = readStroke(roundRoot, h, playerId);
    if (n > 0) total += n;
  }
  return total;
}

function dollars(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "$0";
  const asInt = Math.round(v);
  if (Math.abs(v - asInt) < 0.000001) return `$${asInt}`;
  return `$${v.toFixed(2)}`;
}

// Given balances: positive means receive, negative means pay
function settleTransactions(balances) {
  const creditors = [];
  const debtors = [];

  Object.keys(balances || {}).forEach((pid) => {
    const amt = Number(balances[pid] || 0);
    if (amt > 0.000001) creditors.push({ pid, amt });
    else if (amt < -0.000001) debtors.push({ pid, amt: -amt });
  });

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const tx = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const pay = Math.min(d.amt, c.amt);

    tx.push({ from: d.pid, to: c.pid, amount: pay });

    d.amt -= pay;
    c.amt -= pay;

    if (d.amt <= 0.000001) i += 1;
    if (c.amt <= 0.000001) j += 1;
  }

  return tx;
}

// Skins: unique low score wins; ties carry; each skin pays (N-1)*amount to winner
function calcSkins(round, players, amount) {
  const n = players.length;
  const perSkinValue = (n - 1) * Number(amount || 0);
  if (n < 2 || perSkinValue <= 0) return { balances: {}, details: [] };

  const balances = {};
  players.forEach((p) => (balances[p.id] = 0));

  let carry = 0;
  const details = [];

  for (let h = 1; h <= 18; h++) {
    const scores = players.map((p) => ({ pid: p.id, s: readStroke(round, h, p.id) }));
    if (scores.some((x) => x.s <= 0)) continue;

    scores.sort((a, b) => a.s - b.s);
    const best = scores[0].s;
    const tied = scores.filter((x) => x.s === best);
    if (tied.length === 1) {
      const winner = tied[0].pid;
      const pot = perSkinValue * (1 + carry);
      balances[winner] += pot;
      players.forEach((p) => {
        if (p.id !== winner) balances[p.id] -= Number(amount || 0) * (1 + carry);
      });

      details.push({ hole: h, winner, value: pot, carryUsed: carry });
      carry = 0;
    } else {
      carry += 1;
      details.push({ hole: h, winner: null, value: 0, carryUsed: carry });
    }
  }

  return { balances, details };
}

// Nassau (H2H): everyone vs everyone, per matchup, per segment
function calcNassauH2H(round, players, frontAmt, backAmt, totalAmt) {
  const n = players.length;
  if (n < 2) return { balances: {}, results: [] };

  const balances = {};
  players.forEach((p) => (balances[p.id] = 0));

  // generate all matchups (A vs B, A vs C, ...)
  const ids = players.map((p) => p.id);
  const matchups = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      matchups.push([ids[i], ids[j]]);
    }
  }

  function segmentTotal(pid, hFrom, hTo) {
    let t = 0;
    for (let h = hFrom; h <= hTo; h++) t += readStroke(round, h, pid);
    return t;
  }

  function runSegment(label, hFrom, hTo, amt) {
    const bet = Number(amt || 0);
    if (bet <= 0) return [];

    const seg = [];

    matchups.forEach(([aId, bId]) => {
      const aTotal = segmentTotal(aId, hFrom, hTo);
      const bTotal = segmentTotal(bId, hFrom, hTo);

      let outcome = "push";
      let winnerId = null;

      if (aTotal < bTotal) {
        outcome = "a";
        winnerId = aId;
        balances[aId] += bet;
        balances[bId] -= bet;
      } else if (bTotal < aTotal) {
        outcome = "b";
        winnerId = bId;
        balances[bId] += bet;
        balances[aId] -= bet;
      }

      seg.push({
        segment: label,
        bet,
        aId,
        bId,
        aTotal,
        bTotal,
        outcome,
        winnerId,
      });
    });

    return seg;
  }

  const results = [
    ...runSegment("Front 9", 1, 9, frontAmt),
    ...runSegment("Back 9", 10, 18, backAmt),
    ...runSegment("Total 18", 1, 18, totalAmt),
  ];

  return { balances, results };
}

// Per-stroke: everyone pays (their total - leaderTotal) * amt to the leader (ties split)
function calcPerStroke(round, players, amt) {
  const n = players.length;
  const a = Number(amt || 0);
  if (n < 2 || a <= 0) return { balances: {}, leaderIds: [], leaderTotal: 0 };

  const totals = players.map((p) => ({ pid: p.id, total: sumTotal(round, p.id) }));
  const min = Math.min(...totals.map((x) => x.total));
  const leaders = totals.filter((x) => x.total === min).map((x) => x.pid);

  const balances = {};
  players.forEach((p) => (balances[p.id] = 0));

  totals.forEach((t) => {
    const diff = t.total - min;
    if (diff <= 0) return;
    const pay = diff * a;
    balances[t.pid] -= pay;
    const share = pay / leaders.length;
    leaders.forEach((l) => (balances[l] += share));
  });

  return { balances, leaderIds: leaders, leaderTotal: min };
}

export default function PayoutsScreen({ navigation, route }) {
  const params = route?.params || {};
  const roundId = String(params.roundId || "");
  const [round, setRound] = useState(null);

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
    }));
  }, [round]);

  const wagers = useMemo(() => {
    const w = round?.wagers;
    if (!w || typeof w !== "object" || !w.enabled) return null;
    return w;
  }, [round]);

  const results = useMemo(() => {
    if (!round || !players.length || !wagers) return null;

    const balances = {};
    players.forEach((p) => (balances[p.id] = 0));

    const byGame = [];

    if (wagers?.skins?.enabled && Number(wagers?.skins?.amount || 0) > 0) {
      const skins = calcSkins(round, players, wagers.skins.amount);
      Object.keys(skins.balances || {}).forEach((pid) => (balances[pid] += skins.balances[pid] || 0));
      byGame.push({ key: "Skins", type: "skins", data: skins });
    }

    if (wagers?.nassau?.enabled) {
      const nas = calcNassauH2H(round, players, wagers.nassau.front, wagers.nassau.back, wagers.nassau.total);
      Object.keys(nas.balances || {}).forEach((pid) => (balances[pid] += nas.balances[pid] || 0));
      byGame.push({ key: "Nassau (H2H)", type: "nassau", data: nas });
    }

    if (wagers?.perStroke?.enabled && Number(wagers?.perStroke?.amount || 0) > 0) {
      const ps = calcPerStroke(round, players, wagers.perStroke.amount);
      Object.keys(ps.balances || {}).forEach((pid) => (balances[pid] += ps.balances[pid] || 0));
      byGame.push({ key: "Per stroke", type: "perStroke", data: ps });
    }

    if (wagers?.kps?.enabled && Number(wagers?.kps?.amount || 0) > 0) {
      byGame.push({
        key: "KPs",
        type: "kps",
        data: { note: "KP winners are not tracked yet, so payouts cannot be calculated." },
      });
    }

    const tx = settleTransactions(balances);

    return { balances, tx, byGame };
  }, [round, players, wagers]);

  const nameById = useMemo(() => {
    const m = {};
    players.forEach((p) => (m[p.id] = p.name));
    return m;
  }, [players]);

  const subtitle = useMemo(() => {
    const c = String(round?.courseName || round?.course?.name || "Course");
    const t = String(round?.teeName || round?.tee?.name || "Tees");
    return `${c} • ${t}`;
  }, [round]);

  if (!round) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader navigation={navigation} title="Payouts" subtitle="Loading…" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: MUTED, fontWeight: "800" }}>Round not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!wagers) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader navigation={navigation} title="Payouts" subtitle={subtitle} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 18 }}>
          <Text style={{ color: MUTED, fontWeight: "800", textAlign: "center" }}>No wagers were set for this round.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Payouts" subtitle={subtitle} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Settle up</Text>
            <Text style={styles.cardSub}>Simplified payments based on calculated balances.</Text>

            {results?.tx?.length ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                {results.tx.map((t, idx) => (
                  <View key={`${t.from}-${t.to}-${idx}`} style={styles.txRow}>
                    <Text style={styles.txText}>
                      {nameById[t.from] || "Player"} pays {nameById[t.to] || "Player"}
                    </Text>
                    <Text style={styles.txAmt}>{dollars(t.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.emptyText}>No payouts calculated yet.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Balances</Text>
            <Text style={styles.cardSub}>Positive means receive. Negative means pay.</Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {players.map((p) => {
                const amt = Number(results?.balances?.[p.id] || 0);
                return (
                  <View key={p.id} style={styles.balanceRow}>
                    <Text style={styles.balanceName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.balanceAmt}>{dollars(amt)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.greenRing}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>By game</Text>
            <Text style={styles.cardSub}>
              Premium-simple rules: Skins (carry), Nassau (H2H), Per-stroke (vs leader). KP needs winners.
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {(results?.byGame || []).map((g) => {
                if (g.type === "kps") {
                  return (
                    <View key={g.key} style={styles.greenRingSmall}>
                      <View style={styles.gameCard}>
                        <Text style={styles.gameTitle}>KPs</Text>
                        <Text style={styles.gameNote}>{g.data?.note || "Not available."}</Text>
                      </View>
                    </View>
                  );
                }

                if (g.type === "skins") {
                  const details = (g.data?.details || []).filter((d) => d.winner);
                  return (
                    <View key={g.key} style={styles.greenRingSmall}>
                      <View style={styles.gameCard}>
                        <Text style={styles.gameTitle}>Skins</Text>
                        {details.length ? (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            {details.slice(0, 8).map((d) => (
                              <View key={`skin-${d.hole}`} style={styles.smallRow}>
                                <Text style={styles.smallLeft}>
                                  Hole {d.hole}: {nameById[d.winner] || "Player"}
                                </Text>
                                <Text style={styles.smallRight}>{dollars(d.value)}</Text>
                              </View>
                            ))}
                            {details.length > 8 ? <Text style={styles.gameNote}>More skins exist. We can add “Show all” next.</Text> : null}
                          </View>
                        ) : (
                          <Text style={styles.gameNote}>No skins won (or all holes tied).</Text>
                        )}
                      </View>
                    </View>
                  );
                }

                if (g.type === "nassau") {
                  const wins = (g.data?.results || []).filter((r) => r.outcome === "a" || r.outcome === "b");

                  const frontWins = wins.filter((r) => r.segment === "Front 9");
                  const backWins = wins.filter((r) => r.segment === "Back 9");
                  const totalWins = wins.filter((r) => r.segment === "Total 18");

                  const frontShow = frontWins.slice(0, 6);
                  const backShow = backWins.slice(0, 6);
                  const totalShow = totalWins.slice(0, 6);

                  function rowText(r) {
                    const aName = nameById[r.aId] || "Player";
                    const bName = nameById[r.bId] || "Player";
                    const winnerName = r.winnerId ? nameById[r.winnerId] || "Player" : "Push";
                    return `${aName} (${r.aTotal}) vs ${bName} (${r.bTotal}) → ${winnerName}`;
                  }

                  return (
                    <View key={g.key} style={styles.greenRingSmall}>
                      <View style={styles.gameCard}>
                        <Text style={styles.gameTitle}>Nassau</Text>

                        <View style={{ marginTop: 10, gap: 12 }}>
                          <View>
                            <Text style={styles.segmentHeader}>Front 9</Text>
                            {frontShow.length ? (
                              <View style={{ marginTop: 8, gap: 8 }}>
                                {frontShow.map((r, idx) => (
                                  <View key={`nas-front-${idx}`} style={styles.smallRow}>
                                    <Text style={styles.smallLeft} numberOfLines={2}>
                                      {rowText(r)}
                                    </Text>
                                    <Text style={styles.smallRight}>{dollars(r.bet)}</Text>
                                  </View>
                                ))}
                                {frontWins.length > frontShow.length ? <Text style={styles.gameNote}>More Front 9 matchups exist.</Text> : null}
                              </View>
                            ) : (
                              <Text style={styles.gameNote}>No Front 9 wins.</Text>
                            )}
                          </View>

                          <View>
                            <Text style={styles.segmentHeader}>Back 9</Text>
                            {backShow.length ? (
                              <View style={{ marginTop: 8, gap: 8 }}>
                                {backShow.map((r, idx) => (
                                  <View key={`nas-back-${idx}`} style={styles.smallRow}>
                                    <Text style={styles.smallLeft} numberOfLines={2}>
                                      {rowText(r)}
                                    </Text>
                                    <Text style={styles.smallRight}>{dollars(r.bet)}</Text>
                                  </View>
                                ))}
                                {backWins.length > backShow.length ? <Text style={styles.gameNote}>More Back 9 matchups exist.</Text> : null}
                              </View>
                            ) : (
                              <Text style={styles.gameNote}>No Back 9 wins.</Text>
                            )}
                          </View>

                          <View>
                            <Text style={styles.segmentHeader}>Total 18</Text>
                            {totalShow.length ? (
                              <View style={{ marginTop: 8, gap: 8 }}>
                                {totalShow.map((r, idx) => (
                                  <View key={`nas-total-${idx}`} style={styles.smallRow}>
                                    <Text style={styles.smallLeft} numberOfLines={2}>
                                      {rowText(r)}
                                    </Text>
                                    <Text style={styles.smallRight}>{dollars(r.bet)}</Text>
                                  </View>
                                ))}
                                {totalWins.length > totalShow.length ? <Text style={styles.gameNote}>More Total 18 matchups exist.</Text> : null}
                              </View>
                            ) : (
                              <Text style={styles.gameNote}>No Total 18 wins.</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                }

                if (g.type === "perStroke") {
                  const leaders = g.data?.leaderIds || [];
                  return (
                    <View key={g.key} style={styles.greenRingSmall}>
                      <View style={styles.gameCard}>
                        <Text style={styles.gameTitle}>Per stroke</Text>
                        <Text style={styles.gameNote}>
                          Leader{leaders.length > 1 ? "s" : ""}:{" "}
                          {leaders.length ? leaders.map((pid) => nameById[pid] || "Player").join(", ") : "—"}
                        </Text>
                      </View>
                    </View>
                  );
                }

                return null;
              })}
            </View>
          </View>
        </View>

        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text style={styles.ctaText}>Back</Text>
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

  greenRingSmall: {
    borderRadius: 20,
    padding: 2,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: "transparent",
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

  txRow: {
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
  txText: { color: WHITE, fontWeight: "900", flex: 1, minWidth: 0 },
  txAmt: { color: WHITE, fontWeight: "900", opacity: 0.95 },

  balanceRow: {
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
  balanceName: { color: WHITE, fontWeight: "900", flex: 1, minWidth: 0 },
  balanceAmt: { color: WHITE, fontWeight: "900", opacity: 0.95 },

  gameCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
  },
  gameTitle: { color: WHITE, fontWeight: "900" },
  gameNote: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 17 },

  segmentHeader: {
    color: WHITE,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
    opacity: 0.95,
  },

  smallRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  smallLeft: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, flex: 1, minWidth: 0 },
  smallRight: { color: WHITE, fontWeight: "900", fontSize: 12 },

  emptyText: { color: MUTED, fontWeight: "800", fontSize: 12 },

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
