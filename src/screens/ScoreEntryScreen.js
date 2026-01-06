import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { loadActiveRound, saveActiveRound } from "../storage/roundState";

// Premium palette
const BG = "#000000";
const CARD = "#1D3557";
const INNER = "#243E63";
const INNER2 = "#2A4A76";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";

function TriToggle({ label, value, onChange }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.toggleRow}>
        {[
          { k: "yes", t: "Yes" },
          { k: "no", t: "No" },
          { k: "na", t: "N/A" },
        ].map((opt) => {
          const active = value === opt.k;
          return (
            <Pressable
              key={opt.k}
              onPress={() => onChange(opt.k)}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                {opt.t}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatHdcp(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export default function ScoreEntryScreen({ navigation, route }) {
  const { course, tee, players = [], hole = 1, holeMeta } = route.params;

  const normalizedPlayers = useMemo(() => {
    return (players || []).map((p, idx) => ({
      id: p.id || String(idx),
      name: p.name || `Player ${idx + 1}`,
      handicap: p.handicap ?? 0,
    }));
  }, [players]);

  const [rows, setRows] = useState(() =>
    normalizedPlayers.map((p) => ({
      playerId: p.id,
      strokes: "",
      putts: "",
      fairway: "na",
      green: "na",
      updown: "na",
    }))
  );

  useEffect(() => {
    let live = true;
    (async () => {
      const state = await loadActiveRound();
      if (!live) return;

      const savedHole = state?.holes?.[String(hole)]?.players || null;
      if (!savedHole) return;

      setRows((prev) =>
        prev.map((r) => {
          const saved = savedHole[r.playerId];
          return saved ? { ...r, ...saved } : r;
        })
      );
    })();
    return () => {
      live = false;
    };
  }, [hole]);

  function updateRow(playerId, field, value) {
    setRows((prev) =>
      prev.map((r) => (r.playerId === playerId ? { ...r, [field]: value } : r))
    );
  }

  async function persistHole() {
    const state = (await loadActiveRound()) || {
      course,
      tee,
      players: normalizedPlayers,
      holes: {},
      meta: {},
      startedAt: new Date().toISOString(),
    };

    if (!state.holes) state.holes = {};
    if (!state.meta) state.meta = {};
    if (holeMeta && typeof holeMeta === "object") state.meta.holeMeta = holeMeta;

    // Ensure we store players (including handicap) in the active round
    state.players = normalizedPlayers;

    if (!state.holes[String(hole)]) state.holes[String(hole)] = { players: {} };

    const payload = {};
    rows.forEach((r) => {
      payload[r.playerId] = {
        strokes: String(r.strokes ?? ""),
        putts: String(r.putts ?? ""),
        fairway: r.fairway ?? "na",
        green: r.green ?? "na",
        updown: r.updown ?? "na",
      };
    });

    state.holes[String(hole)].players = payload;

    const ok = await saveActiveRound(state);
    if (!ok) Alert.alert("Save failed", "Could not save hole data.");
  }

  async function backToHole() {
    Keyboard.dismiss();
    await persistHole();
    navigation.navigate("HoleView", { course, tee, players, hole, holeMeta });
  }

  async function continueNextHole() {
    Keyboard.dismiss();
    await persistHole();
    const nextHole = hole >= 18 ? 18 : hole + 1;
    navigation.navigate("HoleView", { course, tee, players, hole: nextHole, holeMeta });
  }

  async function openScorecard() {
    Keyboard.dismiss();
    await persistHole();
    navigation.navigate("Scorecard", { course, tee, players, holeMeta });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Input Scores</Text>
            <Text style={styles.sub}>
              Hole {hole} • {course?.name || ""} • {tee?.name || ""} Tees
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            {normalizedPlayers.map((p) => {
              const r = rows.find((x) => x.playerId === p.id) || {};
              const hdcp = formatHdcp(p.handicap);

              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.playerName}>{p.name}</Text>
                    <View style={styles.hdcpPill}>
                      <Text style={styles.hdcpText}>HDCP {hdcp}</Text>
                    </View>
                  </View>

                  <View style={styles.twoColRow}>
                    <View style={styles.fieldBox}>
                      <Text style={styles.label}>Strokes</Text>
                      <TextInput
                        style={styles.input}
                        value={r.strokes ?? ""}
                        onChangeText={(v) => updateRow(p.id, "strokes", v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={MUTED}
                      />
                    </View>

                    <View style={styles.fieldBox}>
                      <Text style={styles.label}>Putts</Text>
                      <TextInput
                        style={styles.input}
                        value={r.putts ?? ""}
                        onChangeText={(v) => updateRow(p.id, "putts", v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>

                  <View style={styles.inner}>
                    <TriToggle
                      label="Fairway Hit"
                      value={r.fairway ?? "na"}
                      onChange={(v) => updateRow(p.id, "fairway", v)}
                    />
                    <TriToggle
                      label="Green in Regulation"
                      value={r.green ?? "na"}
                      onChange={(v) => updateRow(p.id, "green", v)}
                    />
                    <TriToggle
                      label="Up & Down"
                      value={r.updown ?? "na"}
                      onChange={(v) => updateRow(p.id, "updown", v)}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Pressable style={styles.secondaryBtn} onPress={backToHole}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>

              <Pressable style={styles.midBtn} onPress={openScorecard}>
                <Text style={styles.midText}>Scorecard</Text>
              </Pressable>

              <Pressable style={styles.primaryBtn} onPress={continueNextHole}>
                <Text style={styles.primaryText}>Next Hole</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
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

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },

  playerName: { color: WHITE, fontWeight: "900", fontSize: 18, flex: 1 },

  hdcpPill: {
    backgroundColor: INNER2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#365C90",
  },
  hdcpText: { color: WHITE, fontWeight: "900", fontSize: 12 },

  twoColRow: { flexDirection: "row", gap: 12 },
  fieldBox: { flex: 1 },

  label: { color: MUTED, fontSize: 12, fontWeight: "900", marginBottom: 6 },

  input: {
    height: 48,
    borderRadius: 16,
    backgroundColor: BG,
    color: WHITE,
    paddingHorizontal: 12,
    fontWeight: "800",
  },

  inner: {
    marginTop: 12,
    backgroundColor: INNER,
    borderRadius: 18,
    padding: 12,
  },

  toggleRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  toggleBtn: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnActive: { backgroundColor: GREEN },
  toggleText: { color: WHITE, fontWeight: "900" },
  toggleTextActive: { color: GREEN_TEXT },

  footer: { padding: 16, backgroundColor: BG },
  footerRow: { flexDirection: "row", gap: 10 },

  secondaryBtn: {
    width: 80,
    height: 56,
    borderRadius: 999,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { color: WHITE, fontWeight: "900" },

  midBtn: {
    width: 110,
    height: 56,
    borderRadius: 999,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  midText: { color: WHITE, fontWeight: "900" },

  primaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: 999,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: GREEN_TEXT, fontWeight: "900" },
});
