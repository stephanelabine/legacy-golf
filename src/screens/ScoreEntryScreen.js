import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  ScrollView,
} from "react-native";

import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { loadActiveRound, saveActiveRound } from "../storage/roundState";

// Premium palette
const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const INNER = "rgba(255,255,255,0.04)";
const INNER2 = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";
const BLUE = theme?.colors?.primary || "#2E7DFF";

// Green accent
const GREEN_BORDER = "rgba(46,204,113,0.70)";
const GREEN_GLOW = "rgba(46,204,113,0.12)";
const GREEN_TINT = "rgba(46,204,113,0.12)";
const GREEN_FIELD_BORDER = "rgba(46,204,113,0.45)";

// Putts keep blue
const PUTTS_TINT = "rgba(46,125,255,0.12)";
const PUTTS_BORDER = "rgba(46,125,255,0.45)";

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

function formatHdcp(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function Seg3({ value, onChange }) {
  const opts = [
    { k: "yes", t: "Yes" },
    { k: "no", t: "No" },
    { k: "na", t: "N/A" },
  ];

  return (
    <View style={styles.segWrap}>
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <Pressable
            key={o.k}
            onPress={() => onChange(o.k)}
            style={({ pressed }) => [
              styles.segBtn,
              active && styles.segBtnActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>
              {o.t}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
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
      sandSave: "na",
      updown: "na",
    }))
  );

  const rowById = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(String(r.playerId), r));
    return m;
  }, [rows]);

  useEffect(() => {
    setRows((prev) => {
      const m = new Map(prev.map((r) => [String(r.playerId), r]));
      return normalizedPlayers.map((p) => {
        const key = String(p.id);
        return (
          m.get(key) || {
            playerId: key,
            strokes: "",
            putts: "",
            fairway: "na",
            green: "na",
            sandSave: "na",
            updown: "na",
          }
        );
      });
    });
  }, [normalizedPlayers]);

  useEffect(() => {
    let live = true;
    (async () => {
      const state = await loadActiveRound();
      if (!live) return;

      const savedHole = state?.holes?.[String(hole)]?.players || null;
      if (!savedHole) return;

      setRows((prev) =>
        prev.map((r) => {
          const saved = savedHole[String(r.playerId)];
          return saved ? { ...r, ...saved } : r;
        })
      );
    })();
    return () => {
      live = false;
    };
  }, [hole]);

  function updateRow(playerId, field, value) {
    const pid = String(playerId);
    setRows((prev) =>
      prev.map((r) => (String(r.playerId) === pid ? { ...r, [field]: value } : r))
    );
  }

  const persistHole = useCallback(async () => {
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

    state.players = normalizedPlayers;

    if (!state.holes[String(hole)]) state.holes[String(hole)] = { players: {} };

    const payload = {};
    rows.forEach((r) => {
      payload[String(r.playerId)] = {
        strokes: String(r.strokes ?? ""),
        putts: String(r.putts ?? ""),
        fairway: r.fairway ?? "na",
        green: r.green ?? "na",
        sandSave: r.sandSave ?? "na",
        updown: r.updown ?? "na",
      };
    });

    state.holes[String(hole)].players = payload;

    const ok = await saveActiveRound(state);
    if (!ok) Alert.alert("Save failed", "Could not save hole data.");
  }, [course, tee, hole, holeMeta, normalizedPlayers, rows]);

  const leavingRef = useRef(false);
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (leavingRef.current) return;
      e.preventDefault();
      leavingRef.current = true;

      (async () => {
        try {
          await persistHole();
        } catch {}
        navigation.dispatch(e.data.action);
        leavingRef.current = false;
      })();
    });

    return unsub;
  }, [navigation, persistHole]);

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

  const subtitle = `Hole ${hole} • ${course?.name || ""} • ${tee?.name || ""} Tees`;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScreenHeader navigation={navigation} title="Input Scores" subtitle={subtitle} />

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "on-drag" : "none"}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 140 }}
        >
          {normalizedPlayers.map((p, index) => {
            const r = rowById.get(String(p.id)) || {};
            return (
              <View key={String(p.id)} style={styles.greenRing}>
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(p.name)}</Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.playerTitle} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.playerSub}>
                        Player {index + 1} • HCP {formatHdcp(p.handicap)}
                      </Text>
                    </View>

                    <View style={styles.hdcpPill}>
                      <Text style={styles.hdcpText}>HCP {formatHdcp(p.handicap)}</Text>
                    </View>
                  </View>

                  <View style={styles.bigInputsRow}>
                    <View style={[styles.bigField, styles.bigFieldStrokes]}>
                      <View style={styles.fieldHeaderRow}>
                        <Text style={styles.kicker}>Strokes</Text>
                        <View style={[styles.miniChip, styles.miniChipGreen]}>
                          <Text style={styles.miniChipText}>S</Text>
                        </View>
                      </View>
                      <TextInput
                        value={r.strokes ?? ""}
                        onChangeText={(v) => updateRow(p.id, "strokes", v)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={[styles.bigInput, styles.bigInputStrokes]}
                        maxLength={2}
                      />
                    </View>

                    <View style={[styles.bigField, styles.bigFieldPutts]}>
                      <View style={styles.fieldHeaderRow}>
                        <Text style={styles.kicker}>Putts</Text>
                        <View style={[styles.miniChip, styles.miniChipBlue]}>
                          <Text style={styles.miniChipText}>P</Text>
                        </View>
                      </View>
                      <TextInput
                        value={r.putts ?? ""}
                        onChangeText={(v) => updateRow(p.id, "putts", v)}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={[styles.bigInput, styles.bigInputPutts]}
                        maxLength={2}
                      />
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.statRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statTitle}>Fairway Hit</Text>
                      <Text style={styles.statHint}>Off the tee</Text>
                    </View>
                    <Seg3 value={r.fairway ?? "na"} onChange={(v) => updateRow(p.id, "fairway", v)} />
                  </View>

                  <View style={styles.statRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statTitle}>GIR</Text>
                      <Text style={styles.statHint}>Green in regulation</Text>
                    </View>
                    <Seg3 value={r.green ?? "na"} onChange={(v) => updateRow(p.id, "green", v)} />
                  </View>

                  <View style={styles.statRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statTitle}>Sand Save</Text>
                      <Text style={styles.statHint}>Bunker save</Text>
                    </View>
                    <Seg3 value={r.sandSave ?? "na"} onChange={(v) => updateRow(p.id, "sandSave", v)} />
                  </View>

                  <View style={styles.statRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statTitle}>Up & Down</Text>
                      <Text style={styles.statHint}>Save par or better</Text>
                    </View>
                    <Seg3 value={r.updown ?? "na"} onChange={(v) => updateRow(p.id, "updown", v)} />
                  </View>
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
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  greenRing: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 26,
    padding: 2,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_GLOW,
  },

  card: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: CARD,
  },

  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: WHITE, fontWeight: "900" },

  playerTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  playerSub: { marginTop: 6, color: MUTED, fontWeight: "800", fontSize: 12 },

  hdcpPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  hdcpText: { color: WHITE, fontWeight: "900", fontSize: 12 },

  bigInputsRow: { flexDirection: "row", gap: 12 },

  bigField: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },

  bigFieldStrokes: {
    borderColor: GREEN_FIELD_BORDER,
    backgroundColor: GREEN_TINT,
  },

  bigFieldPutts: {
    borderColor: PUTTS_BORDER,
    backgroundColor: PUTTS_TINT,
  },

  fieldHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  kicker: {
    color: MUTED,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },

  miniChip: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  miniChipGreen: {
    backgroundColor: "rgba(46,204,113,0.20)",
    borderColor: "rgba(46,204,113,0.40)",
  },
  miniChipBlue: {
    backgroundColor: "rgba(46,125,255,0.18)",
    borderColor: "rgba(46,125,255,0.35)",
  },
  miniChipText: { color: WHITE, fontWeight: "900", fontSize: 12, opacity: 0.95 },

  bigInput: {
    marginTop: 10,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    color: WHITE,
    paddingHorizontal: 12,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  bigInputStrokes: {
    borderColor: "rgba(46,204,113,0.34)",
  },
  bigInputPutts: {
    borderColor: "rgba(46,125,255,0.30)",
  },

  divider: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  statRow: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: INNER,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },
  statHint: { marginTop: 5, color: MUTED, fontWeight: "800", fontSize: 12 },

  segWrap: { flexDirection: "row", gap: 8 },
  segBtn: {
    width: 60,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  segBtnActive: {
    borderColor: "rgba(46,125,255,0.65)",
    backgroundColor: "rgba(46,125,255,0.22)",
  },
  segText: { color: WHITE, fontWeight: "900", fontSize: 12, opacity: 0.85 },
  segTextActive: { opacity: 1 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footerRow: { flexDirection: "row", gap: 10 },

  secondaryBtn: {
    width: 80,
    height: 56,
    borderRadius: 999,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryText: { color: WHITE, fontWeight: "900" },

  midBtn: {
    width: 110,
    height: 56,
    borderRadius: 999,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  midText: { color: WHITE, fontWeight: "900" },

  primaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: 999,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: WHITE, fontWeight: "900" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
