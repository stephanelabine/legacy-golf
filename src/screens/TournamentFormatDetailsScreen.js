// src/screens/TournamentFormatDetailsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, TextInput } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  collection,
  onSnapshot,
  onSnapshot as onSnapshotQuery,
  query,
  orderBy,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

const HOLE_FORMAT_KEYS = new Set(["kp", "second_shot_kp", "long_drive"]);
const TEAM_KEY = "team_vs_team";

const FORMAT_ORDER = ["kp", "long_drive", "second_shot_kp", "deuce_pot", "putting_contest", "team_vs_team"];
const HOLE_COLS = 6;

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

function getKey(f) {
  return String(f?.key || f?.id || "").trim();
}

function sortByCatalog(docs) {
  const idx = (k) => {
    const i = FORMAT_ORDER.indexOf(k);
    return i >= 0 ? i : 999;
  };
  return [...(docs || [])].sort((a, b) => idx(getKey(a)) - idx(getKey(b)));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function TournamentFormatDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [formatDocs, setFormatDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const [activeRound, setActiveRound] = useState("r1");

  const [configByKey, setConfigByKey] = useState({});
  const [teamAName, setTeamAName] = useState("Hackers");
  const [teamBName, setTeamBName] = useState("Slackers");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  function smartReturnTo(routeName, params) {
    try {
      const state = navigation.getState?.();
      const routes = state?.routes;

      if (!state || !Array.isArray(routes) || !routes.length) {
        navigation.navigate(routeName, params);
        return;
      }

      let idx = -1;
      for (let i = routes.length - 1; i >= 0; i--) {
        if (routes[i]?.name === routeName) {
          idx = i;
          break;
        }
      }

      if (idx >= 0) {
        const nextRoutes = routes.slice(0, idx + 1).map((r, i) => {
          if (i !== idx) return r;
          return { ...r, params: { ...(r?.params || {}), ...(params || {}) } };
        });

        navigation.dispatch(
          CommonActions.reset({
            index: idx,
            routes: nextRoutes,
          })
        );
        return;
      }

      navigation.navigate(routeName, params);
    } catch (e) {
      navigation.navigate(routeName, params);
    }
  }

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

  useEffect(() => {
    const next = {};
    let aName = "Hackers";
    let bName = "Slackers";

    (formatDocs || []).forEach((f) => {
      const key = getKey(f);
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

    const premiumGold = isDark ? "rgba(196, 160, 98, 0.88)" : "rgba(176, 136, 78, 0.90)";
    const premiumGoldGlow = isDark ? "rgba(196, 160, 98, 0.10)" : "rgba(176, 136, 78, 0.10)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.58)" : "rgba(255, 210, 92, 0.60)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.11)" : "rgba(255, 210, 92, 0.14)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBgStrong = isDark ? "rgba(46,125,255,0.22)" : "rgba(29,53,87,0.16)";

    const greenSectionBorder = isDark ? "rgba(90, 235, 165, 0.55)" : "rgba(42, 200, 125, 0.55)";
    const greenSectionBg = isDark ? "rgba(15, 122, 74, 0.10)" : "rgba(15, 122, 74, 0.08)";

    const greenOnBorder = isDark ? "rgba(90, 235, 165, 0.92)" : "rgba(42, 200, 125, 0.92)";
    const greenOnBg = isDark ? "rgba(90, 235, 165, 0.24)" : "rgba(42, 200, 125, 0.18)";

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
        borderRadius: 20,
        padding: 14,
        borderWidth: 3,
        borderColor: premiumGold,
        backgroundColor: theme.card2,
        marginBottom: 14,
        shadowColor: premiumGold,
        shadowOpacity: isDark ? 0.22 : 0.14,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 4,
      },
      cardInnerGlow: {
        borderRadius: 16,
        padding: 10,
        backgroundColor: premiumGoldGlow,
      },

      cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
      cardTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      cardSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

      groupBox: {
        marginTop: 12,
        borderRadius: 16,
        padding: 10,
        borderWidth: 2,
        borderColor: greenSectionBorder,
        backgroundColor: greenSectionBg,
      },

      roundRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginHorizontal: -4,
      },
      roundCell: {
        width: "25%",
        paddingHorizontal: 4,
        paddingVertical: 4,
      },
      roundChip: {
        width: "100%",
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: "transparent",
        alignItems: "center",
        justifyContent: "center",
      },
      roundChipOn: { borderColor: blue, backgroundColor: blueBgStrong },
      roundChipText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },

      holesWrap: { marginTop: 10 },
      holeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
      holeChip: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: "transparent",
      },
      holeChipOn: { borderColor: greenOnBorder, backgroundColor: greenOnBg },
      holeText: { color: theme.text, fontSize: 13, fontWeight: "900" },
      holeSpacer: { width: 44, height: 44 },

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
        marginTop: 12,
        borderRadius: 16,
        padding: 12,
        borderWidth: 2,
        borderColor: greenSectionBorder,
        backgroundColor: greenSectionBg,
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

  const orderedDocs = useMemo(() => sortByCatalog(formatDocs), [formatDocs]);

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
      const holesByRound =
        existingCfg?.holesByRound && typeof existingCfg.holesByRound === "object" ? existingCfg.holesByRound : {};

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
    const key = getKey(f);
    if (!key) return null;

    const selectedRound = activeRound;
    const hbr = getHolesByRound(key);
    const selected = uniqInts(hbr?.[selectedRound] || []);

    const holes = Array.from({ length: holeCount }, (_, i) => i + 1);
    const rows = chunk(holes, HOLE_COLS);

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardInnerGlow}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
          </View>

          <Text style={styles.cardSub}>
            Choose the official holes for this format. Later, the organizer will enter the official winner (and optional yardage for Long Drive).
          </Text>

          <Text style={[styles.cardSub, { marginTop: 10 }]}>
            Selected for {selectedRound.toUpperCase()}: {selected.length ? selected.join(", ") : "none"}
          </Text>

          <View style={styles.groupBox}>
            <View style={styles.roundRow}>
              {roundKeys.map((rk) => {
                const on = rk === activeRound;
                return (
                  <View key={rk} style={styles.roundCell}>
                    <Pressable
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
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.groupBox}>
            <View style={styles.holesWrap}>
              {rows.map((row, idx) => (
                <View key={`${key}_${selectedRound}_row_${idx}`} style={styles.holeRow}>
                  {row.map((hn) => {
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
                  {row.length < HOLE_COLS
                    ? Array.from({ length: HOLE_COLS - row.length }, (_, i) => (
                      <View key={`${key}_${selectedRound}_sp_${idx}_${i}`} style={styles.holeSpacer} />
                    ))
                    : null}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              Note: These hole-based formats are calculated later from official organizer entries (winner + optional yardage), not GPS measuring.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderInfoCard(f) {
    const key = getKey(f);
    if (!key) return null;

    if (HOLE_FORMAT_KEYS.has(key) || key === TEAM_KEY) return null;

    const sub = String(f?.blurb || "").trim();

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardInnerGlow}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
          </View>

          {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}

          <View style={styles.note}>
            <Text style={styles.noteText}>
              No extra setup needed here. This format will be calculated automatically later from tournament scoring data and rules.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function renderTeamCard(f) {
    const key = getKey(f);
    if (key !== TEAM_KEY) return null;

    return (
      <View key={key} style={styles.card}>
        <View style={styles.cardInnerGlow}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>{String(f?.name || "Team vs Team")}</Text>
          </View>

          <Text style={styles.cardSub}>
            Set team names now. Later we’ll add team member assignment + auto-balancing by handicap (ex: 4+8 vs 5+7).
          </Text>

          <View style={styles.groupBox}>
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
          </View>

          <View style={styles.note}>
            <Text style={styles.noteText}>
              Scoring foundation: win = 1, tie = 0.5, loss = 0. Team assignments and matchups will come later (after roster/handicaps).
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function validateHolesConfig() {
    const needs = (orderedDocs || []).filter((f) => HOLE_FORMAT_KEYS.has(getKey(f)));
    for (const f of needs) {
      const key = getKey(f);
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

    if (!orderedDocs.length) {
      Alert.alert("No formats", "Go back and select formats first.");
      return;
    }

    if (!validateHolesConfig()) return;

    setSaving(true);
    try {
      let teamNamesToSync = null;

      for (const f of orderedDocs || []) {
        const key = getKey(f);
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

          teamNamesToSync = { teamAName: safeA, teamBName: safeB };

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

      // key fix: also persist to tournament.teamVsTeam so other screens auto-populate
      // CRITICAL: use dot-path updates so we never overwrite teamVsTeam.pairingsByRound (tee times)
      if (teamNamesToSync) {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          "teamVsTeam.teamAName": teamNamesToSync.teamAName,
          "teamVsTeam.teamBName": teamNamesToSync.teamBName,
          updatedAt: serverTimestamp(),
        });
      }

      if (fromOverview) {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          formatDetailsReady: true,
          updatedAt: serverTimestamp(),
        });

        smartReturnTo(returnTo, { tournamentId });
        return;
      }

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

  const holeBased = useMemo(() => orderedDocs.filter((f) => HOLE_FORMAT_KEYS.has(getKey(f))), [orderedDocs]);

  const otherFormats = useMemo(
    () =>
      orderedDocs.filter((f) => {
        const k = getKey(f);
        return k && !HOLE_FORMAT_KEYS.has(k) && k !== TEAM_KEY;
      }),
    [orderedDocs]
  );

  const teamFormats = useMemo(() => orderedDocs.filter((f) => getKey(f) === TEAM_KEY), [orderedDocs]);

  const primaryLabel = fromOverview ? "Save and return to overview" : "Save & Continue to Money Pools";
  const kickerLabel = fromOverview ? "Edit" : "Step 5";

  const heroSub = fromOverview
    ? "Edit your format details. Saving will return to the overview."
    : "Hole-based games need official hole selection per round. Team vs Team stores team names now and supports auto-balancing later.";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Format Details"
        subtitle={fromOverview ? "Edit details, then return." : "Set holes and core rules (foundation only)."}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>{kickerLabel}</Text>
          <Text style={styles.heroTitle}>Details & Rules</Text>
          <Text style={styles.heroSub}>{heroSub}</Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>formats: {orderedDocs.length}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>rounds: {roundsTotal}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>holes: {holeCount}</Text>
            </View>
          </View>
        </View>

        {!orderedDocs.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No formats selected</Text>
            <Text style={styles.emptySub}>Go back and select at least one tournament side game.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Hole-based formats</Text>
            {holeBased.map(renderHolePickerCard)}

            <Text style={styles.sectionTitle}>Other formats</Text>
            {otherFormats.map(renderInfoCard)}

            <Text style={styles.sectionTitle}>Team setup</Text>
            {teamFormats.map(renderTeamCard)}
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
          <Text style={styles.primaryText}>{saving ? "Saving..." : primaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
