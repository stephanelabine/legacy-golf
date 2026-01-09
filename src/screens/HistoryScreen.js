import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
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
  const raw =
    round?.playedAt ||
    round?.date ||
    round?.createdAt ||
    round?.startedAt ||
    round?.timestamp;
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

export default function HistoryScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [rounds, setRounds] = useState([]);

  const load = useCallback(async () => {
    const all = await getRounds();
    setRounds(Array.isArray(all) ? all : []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const hasAny = rounds.length > 0;
  const items = useMemo(() => rounds, [rounds]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.headerRow}>
          <Pressable
            onPress={() =>
              navigation.canGoBack?.() ? navigation.goBack() : navigation.navigate(ROUTES.HOME)
            }
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>History</Text>
            <Text style={styles.headerSub}>
              {hasAny
                ? `${items.length} round${items.length === 1 ? "" : "s"}`
                : "Your rounds, beautifully organized"}
            </Text>
          </View>

          <View style={{ minWidth: 70, height: 38 }} />
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {!hasAny ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="history" size={24} color="rgba(255,255,255,0.70)" />
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyText}>Play a round and it will appear here.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((r) => {
              const course = String(r?.courseName || "Course").trim();
              const date = formatDate(r);

              const p1 = Array.isArray(r?.players) ? r.players[0] : null;
              const p1Id = p1?.id ? String(p1.id) : "p1";
              const gross = sumGross(r, p1Id);
              const net = calcNet(gross, p1?.handicap);

              const completed = isCompletedForPlayer(r, p1Id);
              const status = completed ? "COMPLETED" : "IN PROGRESS";

              const grossLabel = gross ? String(gross) : "—";
              const netLabel = gross ? String(net) : "—";

              return (
                <Pressable
                  key={String(r?.id)}
                  onPress={() =>
                    navigation.navigate({
                      name: ROUTES.ROUND_DETAILS,
                      params: { roundId: r.id },
                    })
                  }
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.course} numberOfLines={1}>
                        {course}
                      </Text>

                      <View style={[styles.statusChip, completed ? styles.statusChipDone : styles.statusChipProg]}>
                        <Text style={styles.statusText}>{status}</Text>
                      </View>
                    </View>

                    <Text style={styles.meta} numberOfLines={1}>
                      {date}
                    </Text>
                  </View>

                  <View style={styles.scorePill}>
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreKey}>gross</Text>
                      <Text style={styles.scoreVal}>{grossLabel}</Text>
                    </View>
                    <View style={styles.scoreRow}>
                      <Text style={styles.scoreKey}>net</Text>
                      <Text style={styles.scoreVal}>{netLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.chev}>
                    <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.60)" />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
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

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10 },

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
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
  headerSub: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },

  emptyCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", textAlign: "center" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  course: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },
  meta: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },

  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipDone: { borderColor: "rgba(15,122,74,0.45)", backgroundColor: "rgba(15,122,74,0.16)" },
  statusChipProg: { borderColor: "rgba(46,125,255,0.45)", backgroundColor: "rgba(46,125,255,0.14)" },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.9, opacity: 0.9 },

  scorePill: {
    minWidth: 98,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.18)",
    alignItems: "stretch",
    gap: 6,
    marginLeft: 10,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  scoreKey: { color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  scoreVal: { color: "#fff", fontSize: 16, fontWeight: "900" },

  chev: { width: 28, alignItems: "flex-end", justifyContent: "center", marginLeft: 8 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
