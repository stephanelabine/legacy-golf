// src/screens/TournamentFormatDetailsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, collection, onSnapshot, onSnapshot as onSnapshotQuery, query, orderBy, setDoc, serverTimestamp, updateDoc } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

const HOLE_FORMAT_KEYS = new Set(["kp", "second_shot_kp", "long_drive"]);
const TEAM_KEY = "team_vs_team";

function clampInt(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  const x = Math.round(v);
  return Math.max(min, Math.min(max, x));
}

function uniqInts(arr) {
  const s = new Set();
  (arr || []).forEach((x) => {
    const v = Number(x);
    if (Number.isFinite(v)) s.add(Math.round(v));
  });
  return Array.from(s).sort((a, b) => a - b);
}

export default function TournamentFormatDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [formatDocs, setFormatDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const [activeRound, setActiveRound] = useState("r1");

  // local config state per format key
  const [configByKey, setConfigByKey] = useState({});
  const [teamAName, setTeamAName] = useState("Hackers");
  const [teamBName, setTeamBName] = useState("Slackers");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId, navigation]);

  useEffect(() => {
    if (!tournamentId) return;

    const fref = collection(db, "tournaments", tournamentId, "formats");
    const fq = query(fref, orderBy("createdAt", "asc"));

    const unsub = onSnapshotQuery(
      fq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setFormatDocs(rows);
      },
      (err) => Alert.alert("Formats error", err?.message || "Could not load formats.")
    );

    return () => unsub();
  }, [tournamentId]);

  const u = auth.currentUser;
  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const roundsTotal = useMemo(() => clampInt(t?.roundsTotal || 1, 1, 10), [t]);
  const roundKeys = useMemo(() => Array.from({ length: roundsTotal }, (_, i) => `r${i + 1}`), [roundsTotal]);

  useEffect(() => {
    if (!roundKeys.includes(activeRound)) setActiveRound(roundKeys[0] || "r1");
  }, [roundKeys, activeRound]);

  const holeCount = useMemo(() => {
    const n = Number(t?.holesCount);
    return Number.isFinite(n) && n >= 9 && n <= 27 ? Math.round(n) : 18;
  }, [t]);

  // hydrate local config from firestore once formats load
  useEffect(() => {
    const next = {};
    let aName = "Hackers";
    let bName = "Slackers";

    (formatDocs || []).forEach((f) => {
      const key = String(f?.key || f?.id || "").trim();
      if (!key) return;

      const cfg = f?.config && typeof f.config === "object" ? f.config : {};
      next[key] = cfg;

      if (key === TEAM_KEY) {
        const teamA = cfg?.teams?.teamA?.name;
        const teamB = cfg?.teams?.teamB?.name;
        if (typeof teamA === "string" && teamA.trim()) aName = teamA.trim();
        if (typeof teamB === "string" && teamB.trim()) bName = teamB.trim();
      }
    });

    setConfigByKey(next);
    setTeamAName(aName);
    setTeamBName(bName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatDocs?.length]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
      },
      heroKicker: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      pillRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
      pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: softBg, borderWidth: 1, borderColor: softBorder },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },

      sectionTitle: {
        marginTop: 14,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      card: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
      cardTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      cardHint: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },
      cardSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

      roundRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
      roundChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: softBorder, backgroundColor: softBg },
      roundChipOn: { borderColor: blue, backgroundColor: blueBg },
      roundChipText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },

      holeGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
      holeChip: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      holeChipOn: { borderColor: greenRing, backgroundColor: greenBg },
      holeText: { color: theme.text, fontSize: 13, fontWeight: "900" },

      inlineRow: { marginTop: 12, flexDirection: "row", gap: 10 },
      input: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 16,
        fontWeight: "900",
      },

      note: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginTop: 10,
      },
      noteText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 18 },

      footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: footerPad,
        paddingTop: 12,
        backgroundColor: theme.bg,
        borderTopWidth: 1,
        borderTopColor: theme.divider,
      },
      primaryBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      empty: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      emptySub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 18 },
    });
  }, [theme, isDark, footerPad]);

  function getHolesByRound(key) {
    const cfg = configByKey?.[key] && typeof configByKey[key] === "object" ? configByKey[key] : {};
    const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};
    return hbr;
  }

  function toggleHole(formatKey, roundKey, holeNum) {
    if (!isHost || saving) return;

    const hn = clampInt(holeNum, 1, holeCount);

    setConfigByKey((prev) => {
      const base = prev && typeof prev === "object" ? prev : {};
      const existingCfg = base[formatKey] && typeof base[formatKey] === "object" ? base[formatKey] : {};
      const holesByRound = existingCfg?.holesByRound && typeof existingCfg.holesByRound === "object" ? existingCfg.holesByRound : {};

      const current = uniqInts(holesByRound?.[roundKey] || []);
      const has = current.includes(hn);
      const nextArr = has ? current.filter((x) => x !== hn) : uniqInts([...current, hn]);

      const nextCfg = {
        ...existingCfg,
        holesByRound: {
          ...holesByRound,
          [roundKey]: nextArr,
        },
      };

      return { ...base, [formatKey]: nextCfg };
    });
  }

  function renderHolePickerCard(f) {
    const key = String(f?.key || f?.id || "").trim();
    if (!key) return null;

    const selectedRound = activeRound;
    const hbr = getHolesByRound(key);
    const selected = uniqInts(hbr?.[selectedRound] || []);

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
          <Text style={styles.cardHint}>holes per round</Text>
        </View>

        <Text style={styles.cardSub}>
          Choose the official holes for this format. Later, the organizer will enter the official winner (and optional yardage for Long Drive).
        </Text>

        <Text style={[styles.cardSub, { marginTop: 10 }]}>
          Selected for {selectedRound.toUpperCase()}: {selected.length ? selected.join(", ") : "none"}
        </Text>

        <View style={styles.roundRow}>
          {roundKeys.map((rk) => {
            const on = rk === activeRound;
            return (
              <Pressable
                key={rk}
                onPress={() => setActiveRound(rk)}
                disabled={saving || !isHost}
                style={({ pressed }) => [
                  styles.roundChip,
                  on && styles.roundChipOn,
                  pressed && !saving && isHost && styles.pressed,
                  (!isHost || saving) && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.roundChipText}>{rk.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.holeGrid}>
          {Array.from({ length: holeCount }, (_, i) => i + 1).map((hn) => {
            const on = selected.includes(hn);
            return (
              <Pressable
                key={`${key}_${selectedRound}_${hn}`}
                onPress={() => toggleHole(key, selectedRound, hn)}
                disabled={saving || !isHost}
                style={({ pressed }) => [
                  styles.holeChip,
                  on && styles.holeChipOn,
                  pressed && !saving && isHost && styles.pressed,
                  (!isHost || saving) && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.holeText}>{hn}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Note: These hole-based formats are calculated later from official organizer entries (winner + optional yardage), not GPS measuring.
          </Text>
        </View>
      </View>
    );
  }

  function renderTeamCard(f) {
    const key = String(f?.key || f?.id || "").trim();
    if (key !== TEAM_KEY) return null;

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{String(f?.name || "Team vs Team")}</Text>
          <Text style={styles.cardHint}>event-wide</Text>
        </View>

        <Text style={styles.cardSub}>
          Set team names now. Later we’ll add team member assignment + auto-balancing by handicap (ex: 4+8 vs 5+7).
        </Text>

        <View style={styles.inlineRow}>
          <TextInput
            value={teamAName}
            onChangeText={(s) => setTeamAName(String(s || "").slice(0, 24))}
            editable={!saving && isHost}
            placeholder="Team A"
            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
            style={[styles.input, (!isHost || saving) && { opacity: 0.7 }]}
            returnKeyType="done"
          />
          <TextInput
            value={teamBName}
            onChangeText={(s) => setTeamBName(String(s || "").slice(0, 24))}
            editable={!saving && isHost}
            placeholder="Team B"
            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
            style={[styles.input, (!isHost || saving) && { opacity: 0.7 }]}
            returnKeyType="done"
          />
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Scoring foundation: win = 1, tie = 0.5, loss = 0. Team assignments and matchups will come later (after roster/handicaps).
          </Text>
        </View>
      </View>
    );
  }

  function renderInfoCard(f) {
    const key = String(f?.key || f?.id || "").trim();
    if (!key) return null;

    if (HOLE_FORMAT_KEYS.has(key) || key === TEAM_KEY) return null;

    const hint = f?.needsHoles ? "holes per round" : "event-wide";
    const sub = String(f?.blurb || "").trim();

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
          <Text style={styles.cardHint}>{hint}</Text>
        </View>
        {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            No extra setup needed here. This format will be calculated automatically later from tournament scoring data and rules.
          </Text>
        </View>
      </View>
    );
  }

  function validateHolesConfig() {
    const needs = (formatDocs || []).filter((f) => HOLE_FORMAT_KEYS.has(String(f?.key || f?.id || "").trim()));
    for (const f of needs) {
      const key = String(f?.key || f?.id || "").trim();
      const hbr = getHolesByRound(key);
      for (const rk of roundKeys) {
        const list = uniqInts(hbr?.[rk] || []);
        if (!list.length) {
          Alert.alert("Holes required", `${String(f?.name || key)} needs hole selection for ${rk.toUpperCase()}.`);
          return false;
        }
      }
    }
    return true;
  }

  async function saveDetails() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit format details.");
      return;
    }

    if (!formatDocs.length) {
      Alert.alert("No formats", "Go back and select formats first.");
      return;
    }

    if (!validateHolesConfig()) return;

    setSaving(true);
    try {
      for (const f of formatDocs || []) {
        const key = String(f?.key || f?.id || "").trim();
        if (!key) continue;

        const isHoleFormat = HOLE_FORMAT_KEYS.has(key);
        const isTeam = key === TEAM_KEY;

        let config = configByKey?.[key] && typeof configByKey[key] === "object" ? configByKey[key] : {};

        if (isHoleFormat) {
          const hbr = getHolesByRound(key);
          const normalized = {};
          roundKeys.forEach((rk) => {
            normalized[rk] = uniqInts(hbr?.[rk] || []).filter((n) => n >= 1 && n <= holeCount);
          });
          config = { ...config, holesByRound: normalized };
        }

        if (isTeam) {
          const safeA = String(teamAName || "Hackers").trim() || "Hackers";
          const safeB = String(teamBName || "Slackers").trim() || "Slackers";
          config = {
            ...config,
            teams: {
              teamA: {
                name: safeA,
                memberUids: Array.isArray(config?.teams?.teamA?.memberUids) ? config.teams.teamA.memberUids : [],
              },
              teamB: {
                name: safeB,
                memberUids: Array.isArray(config?.teams?.teamB?.memberUids) ? config.teams.teamB.memberUids : [],
              },
            },
            matchupsByRound: config?.matchupsByRound && typeof config.matchupsByRound === "object" ? config.matchupsByRound : {},
            scoring: { win: 1, tie: 0.5, loss: 0 },
          };
        }

        // eslint-disable-next-line no-await-in-loop
        await setDoc(
          doc(db, "tournaments", tournamentId, "formats", key),
          { config, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      // NEXT STEP IS POOLS
      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "pools",
        formatDetailsReady: true,
        updatedAt: serverTimestamp(),
      });

      navigation.navigate(ROUTES.TOURNAMENT_FORMAT_POOLS, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save format details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Format Details" subtitle="Set holes and core rules (foundation only)." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Step 5</Text>
          <Text style={styles.heroTitle}>Details & Rules</Text>
          <Text style={styles.heroSub}>
            Hole-based games need official hole selection per round. Team vs Team stores team names now and supports auto-balancing later.
          </Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>formats: {formatDocs.length}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>rounds: {roundsTotal}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>holes: {holeCount}</Text>
            </View>
          </View>
        </View>

        {!formatDocs.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No formats selected</Text>
            <Text style={styles.emptySub}>Go back and select at least one tournament side game.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Hole-based formats</Text>
            {(formatDocs || [])
              .filter((f) => HOLE_FORMAT_KEYS.has(String(f?.key || f?.id || "").trim()))
              .map(renderHolePickerCard)}

            <Text style={styles.sectionTitle}>Team setup</Text>
            {(formatDocs || [])
              .filter((f) => String(f?.key || f?.id || "").trim() === TEAM_KEY)
              .map(renderTeamCard)}

            <Text style={styles.sectionTitle}>Other formats</Text>
            {(formatDocs || []).map(renderInfoCard)}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={saveDetails}
          disabled={saving || !isHost}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !isHost) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Save & Continue to Money Pools"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
