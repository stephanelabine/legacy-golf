import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, TextInput, Alert, Keyboard } from "react-native";
import theme from "../theme";
import ROUTES from "../navigation/routes";
import { getRounds, saveRound } from "../storage/rounds";

function clampScore(v) {
  const n = parseInt(String(v || "").replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "";
  if (n > 99) return "99";
  return String(n);
}

export default function ScoreHoleScreen({ navigation, route }) {
  const roundId = route?.params?.roundId;

  const [round, setRound] = useState(null);
  const [holeIndex, setHoleIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await getRounds();
      const found = (all || []).find((r) => String(r.id) === String(roundId));
      if (!found) {
        Alert.alert("Round not found", "Go back and start a new round.");
        navigation.navigate(ROUTES.HOME);
        return;
      }
      setRound(found);
      setHoleIndex(0);
    })();
  }, [roundId]);

  const hole = useMemo(() => {
    if (!round?.holes?.length) return null;
    return round.holes[holeIndex] || null;
  }, [round, holeIndex]);

  function setStroke(playerId, value) {
    setRound((prev) => {
      if (!prev) return prev;
      const nextHoles = prev.holes.map((h, idx) => {
        if (idx !== holeIndex) return h;
        return {
          ...h,
          scores: { ...(h.scores || {}), [playerId]: clampScore(value) },
        };
      });
      return { ...prev, holes: nextHoles };
    });
  }

  async function persist(showToast) {
    if (!round) return;
    setSaving(true);
    try {
      await saveRound(round);
      if (showToast) Alert.alert("Saved", "Round progress saved.");
    } finally {
      setSaving(false);
    }
  }

  function nextHole() {
    Keyboard.dismiss();
    setHoleIndex((i) => Math.min(i + 1, 17));
  }
  function prevHole() {
    Keyboard.dismiss();
    setHoleIndex((i) => Math.max(i - 1, 0));
  }

  if (!round || !hole) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  const title = `${round.courseName}`;
  const sub = `Hole ${hole.hole} • ${round.tees} • ${String(round.scoringMode || "gross").toUpperCase()}`;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate(ROUTES.HOME)} style={styles.homeBtn}>
          <Text style={styles.homeTxt}>Home</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
        </View>

        <Pressable onPress={() => persist(true)} disabled={saving} style={[styles.saveBtn, saving && styles.disabled]}>
          <Text style={styles.saveTxt}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.holeTop}>
          <Text style={styles.holeNum}>#{hole.hole}</Text>
          <Text style={styles.holeMeta}>PAR {hole.par || 4}</Text>
        </View>

        <View style={styles.players}>
          {round.players.map((p) => {
            const v = hole.scores?.[p.id] ?? "";
            return (
              <View key={p.id} style={styles.playerRow}>
                <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
                <TextInput
                  value={String(v)}
                  onChangeText={(t) => setStroke(p.id, t)}
                  placeholder="—"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  keyboardType="number-pad"
                  maxLength={2}
                  style={styles.scoreInput}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={() => navigation.navigate(ROUTES.HOLE_MAP, { roundId: round.id, holeIndex })} style={styles.actionBtn}>
            <Text style={styles.actionTxt}>Hole View</Text>
          </Pressable>

          <Pressable onPress={() => navigation.navigate(ROUTES.SCORE_ENTRY, { roundId: round.id })} style={styles.actionBtnGhost}>
            <Text style={styles.actionTxt}>Full Card</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.navRow}>
        <Pressable onPress={prevHole} disabled={holeIndex === 0} style={[styles.navBtn, holeIndex === 0 && styles.disabled]}>
          <Text style={styles.navTxt}>Prev</Text>
        </Pressable>

        <View style={styles.navMid}>
          <Text style={styles.navMidTxt}>Hole {hole.hole} / 18</Text>
        </View>

        <Pressable onPress={nextHole} disabled={holeIndex === 17} style={[styles.navBtn, holeIndex === 17 && styles.disabled]}>
          <Text style={styles.navTxt}>Next</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  loading: { color: "#fff", opacity: 0.8, fontWeight: "800", marginTop: 40, textAlign: "center" },

  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  homeBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  homeTxt: { color: "#fff", fontWeight: "900" },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(46,125,255,0.18)", borderWidth: 1, borderColor: "rgba(46,125,255,0.35)" },
  saveTxt: { color: "#fff", fontWeight: "900" },
  title: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sub: { marginTop: 3, color: "#fff", opacity: 0.65, fontWeight: "700", fontSize: 12 },

  card: { marginHorizontal: 16, marginTop: 6, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)", padding: 16 },
  holeTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  holeNum: { color: "#fff", fontSize: 44, fontWeight: "900", letterSpacing: 0.5 },
  holeMeta: { color: "#fff", opacity: 0.75, fontWeight: "900", letterSpacing: 1.2 },

  players: { marginTop: 10, gap: 10 },
  playerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  playerName: { flex: 1, color: "#fff", fontWeight: "900", fontSize: 16 },
  scoreInput: {
    width: 72,
    height: 52,
    borderRadius: 16,
    textAlign: "center",
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.25)",
  },

  actions: { flexDirection: "row", gap: 12, marginTop: 14 },
  actionBtn: { flex: 1, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme?.colors?.primary || "#2E7DFF" },
  actionBtnGhost: { flex: 1, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  actionTxt: { color: "#fff", fontWeight: "900", fontSize: 15 },

  navRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginTop: 16 },
  navBtn: { flex: 1, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  navTxt: { color: "#fff", fontWeight: "900", fontSize: 16 },
  navMid: { width: 120, alignItems: "center" },
  navMidTxt: { color: "#fff", opacity: 0.75, fontWeight: "900" },

  disabled: { opacity: 0.45 },
});
