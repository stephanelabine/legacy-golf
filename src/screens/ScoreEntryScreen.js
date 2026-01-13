// src/screens/ScoreEntryScreen.js
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
import { CommonActions, StackActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { loadActiveRound, saveActiveRound } from "../storage/roundState";

// Premium palette
const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const INNER = "rgba(255,255,255,0.04)";
const INNER2 = "rgba(255,255,255,0.06)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";
const BLUE = theme?.colors?.primary || "#2E7DFF";

// Green accent (borders only)
const GREEN_BORDER = "rgba(46,204,113,0.70)";

// Putts keep blue
const PUTTS_TINT = "rgba(46,125,255,0.12)";
const PUTTS_BORDER = "rgba(46,125,255,0.45)";

// Strokes: border-only look
const STROKES_BORDER = "rgba(46,204,113,0.45)";

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

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
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

function getMissingHolesFromState(state, normalizedPlayers) {
  const ids = (normalizedPlayers || []).map((p) => String(p.id));
  const missing = [];

  for (let h = 1; h <= 18; h++) {
    let ok = true;
    for (const pid of ids) {
      const strokes = state?.holes?.[String(h)]?.players?.[String(pid)]?.strokes;
      if (toInt(strokes) <= 0) {
        ok = false;
        break;
      }
    }
    if (!ok) missing.push(h);
  }
  return missing;
}

export default function ScoreEntryScreen({ navigation, route }) {
  const params = route?.params || {};
  const {
    course,
    tee,
    players = [],
    hole = 1,
    holeMeta,
    roundId: roundIdParam,
    fixMissing,
    missingHoles,
    missingIndex,
    finishReturnHole,
  } = params;

  const isFixMode = !!fixMissing;

  const normalizedPlayers = useMemo(() => {
    return (players || []).map((p, idx) => ({
      id: String(p?.id ?? String(idx)),
      name: p?.name || `Player ${idx + 1}`,
      handicap: p?.handicap ?? 0,
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

  function validateStrokesForThisHole() {
    const missingPlayers = [];
    for (const p of normalizedPlayers) {
      const r = rowById.get(String(p.id)) || {};
      if (toInt(r.strokes) <= 0) missingPlayers.push(p.name || "Player");
    }

    if (missingPlayers.length) {
      Alert.alert(
        "Missing strokes",
        `Please enter strokes for:\n\n${missingPlayers.join("\n")}`,
        [{ text: "OK" }]
      );
      return false;
    }
    return true;
  }

  const persistHole = useCallback(
    async (opts = {}) => {
      const state = (await loadActiveRound()) || {
        course,
        tee,
        players: normalizedPlayers,
        holes: {},
        meta: {},
        startedAt: Date.now(),
      };

      const existingId =
        state?.id ||
        state?.roundId ||
        state?.activeRound?.id ||
        state?.round?.id ||
        roundIdParam;

      const safeId =
        String(existingId || "") ||
        (Number.isFinite(state?.startedAt) ? `r_${state.startedAt}` : `r_${Date.now()}`);

      state.id = safeId;
      state.roundId = safeId;

      state.course = state.course || course;
      state.tee = state.tee || tee;
      state.courseName = state.courseName || state.course?.name || course?.name || "Course";
      state.teeName = state.teeName || state.tee?.name || tee?.name || "Tees";
      state.players = normalizedPlayers;

      if (!state.holes) state.holes = {};
      if (!state.meta) state.meta = {};
      if (holeMeta && typeof holeMeta === "object") state.meta.holeMeta = holeMeta;

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

      state.status = "active";
      state.inProgress = true;
      state.isActive = true;
      state.updatedAt = Date.now();

      // Normal mode: update resume fields.
      // Fix mode: do NOT change resume/currentHole (we’re repairing, not advancing play).
      if (!opts?.skipResumeUpdate) {
        const nextHole = hole >= 18 ? 18 : hole + 1;
        const resumeHole = opts?.resumeHole ? Number(opts.resumeHole) : nextHole;

        state.currentHole = resumeHole;
        state.holeNumber = resumeHole;
        state.hole = resumeHole;
        state.holeIndex = resumeHole - 1;
        state.startHole = resumeHole;
      }

      const ok = await saveActiveRound(state);
      if (!ok) Alert.alert("Save failed", "Could not save hole data.");
      return { ok, roundId: safeId };
    },
    [course, tee, hole, holeMeta, normalizedPlayers, rows, roundIdParam]
  );

  const skipBeforeRemoveRef = useRef(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (skipBeforeRemoveRef.current) return;

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

  function goToHoleView(holeNumber, extraParams = {}) {
    navigation.dispatch(
      CommonActions.navigate({
        name: ROUTES.HOLE_VIEW,
        params: {
          course,
          tee,
          players,
          hole: holeNumber,
          holeMeta,
          roundId: roundIdParam || null,
          courseName: course?.name,
          teeName: tee?.name,
          ...extraParams,
        },
        merge: true,
      })
    );
  }

  async function backToHole() {
    Keyboard.dismiss();

    if (isFixMode) {
      // “Fix mode” back = return to Hole 18 (finish context)
      goToHoleView(Number(finishReturnHole || 18));
      return;
    }

    const res = await persistHole();
    goToHoleView(hole, { roundId: res?.roundId || roundIdParam || null });
  }

  async function continueNextHole() {
    Keyboard.dismiss();
    const nextHole = hole >= 18 ? 18 : hole + 1;
    const res = await persistHole({ resumeHole: nextHole });

    goToHoleView(nextHole, { roundId: res?.roundId || roundIdParam || null });
  }

  async function openScorecard() {
    Keyboard.dismiss();
    const res = await persistHole();

    navigation.navigate(ROUTES.SCORECARD, {
      course,
      tee,
      players,
      holeMeta,
      roundId: res?.roundId || roundIdParam || null,
    });
  }

  async function doneFixMode() {
    Keyboard.dismiss();

    if (!validateStrokesForThisHole()) return;

    // Save hole, but do not modify resume hole fields
    await persistHole({ skipResumeUpdate: true });

    const state = (await loadActiveRound()) || {};
    const remaining = getMissingHolesFromState(state, normalizedPlayers);

    if (!remaining.length) {
      // All fixed: return to Hole 18 and prompt to finish
      goToHoleView(Number(finishReturnHole || 18), { showFinishPrompt: true });
      return;
    }

    // Pick next missing hole in sequence if possible
    const original = Array.isArray(missingHoles) ? missingHoles : [];
    let nextHole = null;
    let nextIdx = Number.isFinite(Number(missingIndex)) ? Number(missingIndex) : -1;

    if (original.length) {
      for (let i = Math.max(0, nextIdx + 1); i < original.length; i++) {
        const h = Number(original[i]);
        if (remaining.includes(h)) {
          nextHole = h;
          nextIdx = i;
          break;
        }
      }
    }

    if (!nextHole) {
      nextHole = remaining[0];
      nextIdx = original.indexOf(nextHole);
      if (nextIdx < 0) nextIdx = 0;
    }

    // Replace this screen with the next missing hole (no stack growth)
    skipBeforeRemoveRef.current = true;
    navigation.dispatch(
      StackActions.replace(ROUTES.SCORE_ENTRY, {
        ...params,
        hole: nextHole,
        fixMissing: true,
        missingHoles: original.length ? original : remaining,
        missingIndex: nextIdx,
        finishReturnHole: Number(finishReturnHole || 18),
      })
    );

    requestAnimationFrame(() => {
      skipBeforeRemoveRef.current = false;
    });
  }

  const subtitle = isFixMode
    ? `Fix missing scores • Hole ${hole}`
    : `Hole ${hole} • ${course?.name || ""} • ${tee?.name || ""} Tees`;

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

            <Pressable
              style={styles.primaryBtn}
              onPress={isFixMode ? doneFixMode : continueNextHole}
            >
              <Text style={styles.primaryText}>{isFixMode ? "Done" : "Next Hole"}</Text>
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
    backgroundColor: "transparent",
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
    borderColor: STROKES_BORDER,
    backgroundColor: "transparent",
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
    backgroundColor: "rgba(46,204,113,0.18)",
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
