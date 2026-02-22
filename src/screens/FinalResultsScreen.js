// src/screens/FinalResultsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, CommonActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { getRoundById } from "../storage/rounds";

const BG = "#06150F";
const CARD = "rgba(18,22,30,0.92)";
const ROW = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// Supports BOTH storage shapes:
// A) roundState: holes["1"].players["p1"].strokes
// B) rounds.js legacy: holes[0].scores["p1"] = strokes
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

function parseHcp(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v).trim();
  if (!s) return 0;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Try to read a Stroke Index/Handicap number (1-18) for a given hole.
// Supports several holeMeta shapes (array or object keyed by hole number).
function getStrokeIndex(roundRoot, holeNumber) {
  const hm = roundRoot?.holeMeta ?? roundRoot?.meta?.holeMeta ?? null;
  if (!hm) return null;

  const pick = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    const raw =
      obj.strokeIndex ??
      obj.stokeIndex ??
      obj.si ??
      obj.handicap ??
      obj.hcp ??
      obj.hdcp ??
      obj.rank ??
      null;

    const n = parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 18) return null;
    return n;
  };

  // array shape: holeMeta[0] is hole 1
  if (Array.isArray(hm)) {
    const obj = hm[holeNumber - 1];
    return pick(obj);
  }

  // object keyed by hole number (string)
  const obj = hm?.[String(holeNumber)] ?? hm?.[holeNumber] ?? null;
  return pick(obj);
}

// Net per hole = strokes - strokesReceivedOnHole.
// strokesReceivedOnHole uses standard allocation:
// base = floor(hcp/18), extra holes = hcp % 18 on lowest strokeIndex holes.
function sumNetTotal(roundRoot, playerId, playerHcp) {
  const hcp = parseHcp(playerHcp);
  const gross = sumTotal(roundRoot, playerId);

  if (!Number.isFinite(hcp) || hcp <= 0) return gross;

  let anyStrokeIndex = false;
  for (let h = 1; h <= 18; h++) {
    const si = getStrokeIndex(roundRoot, h);
    if (Number.isFinite(si)) {
      anyStrokeIndex = true;
      break;
    }
  }

  // fallback if we don't have stroke index info
  if (!anyStrokeIndex) {
    const netFallback = gross - hcp;
    return Number.isFinite(netFallback) ? netFallback : gross;
  }

  const base = Math.floor(hcp / 18);
  const extra = hcp % 18;

  let net = 0;

  for (let h = 1; h <= 18; h++) {
    const strokes = readStroke(roundRoot, h, playerId);
    if (strokes <= 0) continue;

    const si = getStrokeIndex(roundRoot, h);
    const getsExtra = Number.isFinite(si) && si <= extra ? 1 : 0;
    const received = base + getsExtra;

    const holeNet = strokes - received;
    net += holeNet;
  }

  return net;
}

export default function FinalResultsScreen({ navigation, route }) {
  const params = route?.params || {};
  const roundId = String(params.roundId || "");

  const TAB_LEADERBOARD = "leaderboard";
  const TAB_FORMATS = "formats";

  const [tab, setTab] = useState(TAB_LEADERBOARD);
  const [round, setRound] = useState(null);
  const [expanded, setExpanded] = useState({}); // playerId -> bool
  const [loading, setLoading] = useState(true);

  const [scoreMode, setScoreMode] = useState("gross"); // "gross" | "net"

  const courseName = String(round?.courseName || round?.course?.name || "Course");
  const teeName = String(round?.teeName || round?.tee?.name || "Tees");

  function onExit() {
    Alert.alert("Exit results?", "Return to Home?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit",
        style: "destructive",
        onPress: () => {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: ROUTES.HOME }],
            })
          );
        },
      },
    ]);
  }

  function onNextSettleUp() {
    if (!roundId) return;
    navigation.navigate(ROUTES.SETTLE_UP, { roundId });
  }

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setLoading(true);

      (async () => {
        try {
          const r = roundId ? await getRoundById(roundId) : null;
          if (!live) return;
          setRound(r || null);
        } catch {
          if (!live) return;
          setRound(null);
        } finally {
          if (live) setLoading(false);
        }
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
      handicap: parseHcp(
        p?.handicap ??
        p?.hcp ??
        p?.handicapIndex ??
        p?.index ??
        p?.courseHandicap ??
        p?.handicapStrokes ??
        p?.strokesHdcp ??
        0
      ),
    }));
  }, [round]);

  const stats = useMemo(() => {
    const r = round || {};
    const out = players.map((p) => {
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
        if (putts > 0) puttsTotal += putts;

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

      return {
        id: p.id,
        name: p.name,
        puttsTotal,
        fir: fmtPct(firYes, firOpp),
        gir: fmtPct(girYes, girOpp),
        updown: fmtPct(upYes, upOpp),
        sand: fmtPct(sandYes, sandOpp),
      };
    });

    return out;
  }, [round, players]);

  const leaderboard = useMemo(() => {
    const r = round || {};

    const rows = players.map((p) => {
      const gross = sumTotal(r, p.id);
      const net = sumNetTotal(r, p.id, p.handicap);

      const st = stats.find((x) => String(x.id) === String(p.id));
      const putts = Number(st?.puttsTotal || 0);

      return {
        id: p.id,
        name: p.name,
        gross,
        net,
        putts,
      };
    });

    rows.sort((a, b) => {
      const key = scoreMode === "net" ? "net" : "gross";
      const aa = Number.isFinite(Number(a[key])) ? Number(a[key]) : 999999;
      const bb = Number.isFinite(Number(b[key])) ? Number(b[key]) : 999999;
      if (aa !== bb) return aa - bb;
      return a.name.localeCompare(b.name);
    });

    return rows;
  }, [round, players, stats, scoreMode]);

  function togglePlayer(pid) {
    setExpanded((prev) => ({ ...prev, [pid]: !prev[pid] }));
  }

  const tabs = useMemo(
    () => [
      { key: TAB_LEADERBOARD, label: "Leaderboard" },
      { key: TAB_FORMATS, label: "Formats" },
    ],
    []
  );

  const renderTabs = () => {
    return (
      <View style={styles.tabsRow}>
        {tabs.map((t) => {
          const isActive = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={({ pressed }) => [
                styles.tabPill,
                isActive ? styles.tabPillActive : styles.tabPillIdle,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextIdle]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderColumnHeader = () => {
    return (
      <View style={styles.headerRow}>
        <View style={styles.rankPillSpacer} />
        <View style={styles.headerRowMid}>
          <Text style={[styles.colText, styles.colPlayer]}>PLAYER</Text>
        </View>

        <View style={styles.numCol}>
          <Text style={[styles.colText, styles.colNum]}>{scoreMode === "gross" ? "GROSS" : "NET"}</Text>
        </View>

        <View style={styles.numCol}>
          <Text style={[styles.colText, styles.colNum]}>PUTTS</Text>
        </View>
      </View>
    );
  };

  const renderLeaderboardCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Leaderboard</Text>

          <Pressable
            onPress={() => setScoreMode((m) => (m === "gross" ? "net" : "gross"))}
            style={({ pressed }) => [styles.leaderToggle, pressed && styles.pressed]}
          >
            <Text style={styles.leaderToggleText}>{scoreMode === "gross" ? "Gross" : "Net"}</Text>
          </Pressable>
        </View>

        {renderColumnHeader()}
        <View style={styles.divider} />

        <ScrollView
          style={styles.leaderRowsScroll}
          contentContainerStyle={styles.leaderRowsContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {leaderboard.map((p, idx) => {
            const isOpen = !!expanded[p.id];

            return (
              <Pressable
                key={p.id}
                onPress={() => togglePlayer(p.id)}
                style={({ pressed }) => [
                  styles.rowCard,
                  idx > 0 && { marginTop: 10 },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>{idx + 1}</Text>
                </View>

                <View style={styles.rowMid}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.subTap}>{isOpen ? "Tap to collapse" : "Tap to expand"}</Text>
                </View>

                <View style={styles.numCol}>
                  <Text style={styles.numBig}>
                    {scoreMode === "gross"
                      ? (p.gross > 0 ? String(p.gross) : "—")
                      : (Number.isFinite(Number(p.net)) ? String(p.net) : "—")}
                  </Text>
                  <Text style={styles.numSub}>{scoreMode === "gross" ? "gross" : "net"}</Text>
                </View>
                <View style={styles.numCol}>
                  <Text style={styles.numBig2}>{p.putts > 0 ? String(p.putts) : "—"}</Text>
                  <Text style={styles.numSub}>putts</Text>
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
        </ScrollView>
      </View>
    );
  };

  const renderFormatsCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Formats</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderTitle}>Coming next</Text>
          <Text style={styles.placeholderSub}>This tab will show format winners + details.</Text>
        </View>
      </View>
    );
  };

  const renderStatsCard = () => {
    return (
      <View style={styles.leaderWrap}>
        <View style={styles.leaderTopRow}>
          <Text style={styles.leaderTitle}>Stats snapshot</Text>
        </View>

        <View style={styles.divider} />

        <View style={{ gap: 10 }}>
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
                  <Text style={styles.statV}>
                    {Number(s.puttsTotal) > 0 ? String(s.puttsTotal) : "—"}
                  </Text>
                </View>
                <View style={styles.statPill}>
                  <Text style={styles.statK}>U&amp;D</Text>
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
    );
  };

  const FOOTER_H = 96;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.bgWashA} pointerEvents="none" />
        <View style={styles.bgWashB} pointerEvents="none" />

        <ScreenHeader
          navigation={navigation}
          title="FINAL RESULTS"
          titleAutoShrink
          titleNumberOfLines={1}
          subtitle={`${courseName} • ${teeName}`}
          safeTop={false}
          leftLabel="Exit"
          onLeftPress={onExit}
          rightLabel={null}
          onRightPress={null}
        />

        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading final results…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!round) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.bgWashA} pointerEvents="none" />
        <View style={styles.bgWashB} pointerEvents="none" />

        <ScreenHeader
          navigation={navigation}
          title="FINAL RESULTS"
          titleAutoShrink
          titleNumberOfLines={1}
          subtitle="Round not found"
          safeTop={false}
          leftLabel="Exit"
          onLeftPress={onExit}
          rightLabel={null}
          onRightPress={null}
        />

        <View style={styles.cardMissing}>
          <Text style={styles.titleText}>Round not found</Text>
          <Text style={styles.subText}>This round isn’t available right now.</Text>

          <Pressable onPress={onExit} style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}>
            <Text style={styles.btnOutlineText}>Go Home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const activeContent = tab === TAB_FORMATS ? renderFormatsCard() : renderLeaderboardCard();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.bgWashA} pointerEvents="none" />
      <View style={styles.bgWashB} pointerEvents="none" />

      <ScreenHeader
        navigation={navigation}
        title="FINAL RESULTS"
        titleAutoShrink
        titleNumberOfLines={1}
        subtitle={`${courseName} • ${teeName}`}
        safeTop={false}
        leftLabel="Exit"
        onLeftPress={onExit}
        rightLabel={null}
        onRightPress={null}
      />

      {renderTabs()}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: FOOTER_H + 24,
          paddingTop: 6,
        }}
        showsVerticalScrollIndicator={false}
      >
        {activeContent}
        <View style={{ height: 12 }} />
        {renderStatsCard()}
        <View style={{ height: 10 }} />
      </ScrollView>

      <View style={styles.footerWrap}>
        <View style={styles.footer}>
          <Pressable onPress={onNextSettleUp} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
            <Text style={styles.btnPrimaryText}>Next: Settle Up</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  bgWashA: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(46,204,113,0.10)",
  },
  bgWashB: {
    position: "absolute",
    bottom: -180,
    right: -160,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: "rgba(11,42,27,0.65)",
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: MUTED, fontWeight: "800" },

  cardMissing: {
    margin: 16,
    padding: 14,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: "rgba(242,201,76,0.55)",
  },
  titleText: { color: WHITE, fontWeight: "900", fontSize: 16 },
  subText: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  tabsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  tabPill: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  tabPillIdle: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  tabPillActive: {
    backgroundColor: "rgba(242,201,76,0.18)",
    borderColor: "rgba(242,201,76,0.55)",
  },
  tabText: { fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
  tabTextIdle: { color: WHITE },
  tabTextActive: { color: "rgba(242,201,76,0.98)" },

  leaderWrap: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: "rgba(242,201,76,0.75)",
    padding: 12,
  },

  leaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  leaderTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },

  leaderToggle: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  leaderToggleText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
  },

  colText: { color: "rgba(255,255,255,0.68)", fontWeight: "900", fontSize: 11, letterSpacing: 0.7 },
  colPlayer: { flex: 1 },
  colNum: { textAlign: "center" },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginTop: 10,
    marginBottom: 12,
  },

  leaderRowsScroll: { maxHeight: 520 },
  leaderRowsContent: { paddingBottom: 2 },

  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: ROW,
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.28)",
    flexWrap: "wrap",
  },
  rankPillSpacer: { width: 34, height: 34, borderRadius: 14 },

  rankPill: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: WHITE, fontWeight: "900" },

  rowMid: { flex: 1, minWidth: 0 },
  headerRowMid: { flex: 1, minWidth: 0, paddingTop: 8 },

  name: { color: WHITE, fontWeight: "900", fontSize: 14 },
  subTap: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 11 },

  numCol: { width: 64, alignItems: "center" },
  numBig: { color: WHITE, fontWeight: "900", fontSize: 18 },
  numBig2: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 17 },
  numSub: { marginTop: 2, color: MUTED, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

  expandWrap: { width: "100%", marginTop: 10 },
  expandDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginBottom: 10 },

  holesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  holeChip: {
    width: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  holeChipTop: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 11 },
  holeChipVal: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 14 },

  placeholderBox: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    padding: 12,
  },
  placeholderTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },
  placeholderSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

  statRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
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
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  statK: { color: MUTED, fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },
  statV: { color: WHITE, fontWeight: "900", fontSize: 12 },

  footerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(6,21,15,0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footer: { paddingTop: 12 },

  btnPrimary: {
    height: 54,
    borderRadius: 18,
    backgroundColor: YELLOW,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: { color: "#1A1A1A", fontWeight: "900", fontSize: 15 },

  btnOutline: {
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(242,201,76,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { color: WHITE, fontWeight: "900", fontSize: 15 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});