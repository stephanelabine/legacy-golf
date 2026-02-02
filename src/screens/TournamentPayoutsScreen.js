// src/screens/TournamentPayoutsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, collection, onSnapshot, query, orderBy } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/* ---------------- helpers ---------------- */

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "$0";
  const fixed = Math.round(v * 100) / 100;
  return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

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

function normKey(x) {
  return String(x || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// IMPORTANT: detect “second shot kp” before “kp”
function detectFormatType(f) {
  const k = normKey(f?.key || f?.id);
  const n = normKey(f?.name);
  const s = `${k} ${n}`.trim();

  const isSecondShot =
    s.includes("secondshotkp") ||
    s.includes("secondshot") ||
    (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
    s.includes("2ndshotkp") ||
    (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

  if (isSecondShot) return "secondshotkp";
  if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";
  if (s.includes("deucepot") || (s.includes("deuce") && s.includes("pot"))) return "deucepot";
  if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "puttingcontest";
  if (s.includes("teamvsteam") || (s.includes("team") && s.includes("vs") && s.includes("team"))) return "teamvsteam";
  if (s.includes("kp")) return "kp";
  return "unknown";
}

function getKey(f) {
  return String(f?.key || f?.id || "").trim();
}

const FORMAT_ORDER = ["kp", "longdrive", "secondshotkp", "deucepot", "puttingcontest", "teamvsteam"];

/* ---------------- component ---------------- */

export default function TournamentPayoutsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [formatDocs, setFormatDocs] = useState([]);

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

    const unsub = onSnapshot(
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

  const rosterCount = useMemo(() => {
    const memberIds = Array.isArray(t?.memberIds) ? t.memberIds : [];
    const guestIds = Array.isArray(t?.guestIds) ? t.guestIds : [];
    const owner = String(t?.ownerUid || "").trim();

    const s = new Set();
    memberIds.forEach((x) => s.add(String(x)));
    guestIds.forEach((x) => s.add(String(x)));
    if (owner) s.add(owner);

    s.delete("");
    return s.size;
  }, [t]);

  const orderedFormats = useMemo(() => {
    const rank = (f) => {
      const type = detectFormatType(f);
      const idx = FORMAT_ORDER.indexOf(type);
      return idx === -1 ? 999 : idx;
    };
    return [...(formatDocs || [])].sort((a, b) => rank(a) - rank(b));
  }, [formatDocs]);

  function poolTotalForFormat(f) {
    const fee = Number(f?.entryFee);
    if (!Number.isFinite(fee) || fee <= 0) return 0;
    return fee * Math.max(0, Number(rosterCount || 0));
  }

  function countEventsForHoleFormat(f) {
    // counts total “winnable events” across all rounds based on holesByRound
    const cfg = f?.config && typeof f.config === "object" ? f.config : {};
    const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};

    let count = 0;
    for (const rk of roundKeys) {
      const list = uniqInts(hbr?.[rk] || []);
      count += list.length;
    }
    return count;
  }

  function hardReturnToOverview() {
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: returnTo, params: { tournamentId } }],
      })
    );
  }

  function onStartTournament() {
    if (!tournamentId) return;

    // Dev-safe preview: in development we do NOT lock the tournament.
    const devPreview = !!__DEV__;

    navigation.navigate(ROUTES.TOURNAMENT_START_SPLASH, {
      tournamentId,
      devPreview,
      fromOverview: true,
      returnTo,
    });
  }

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    // bronzy gold (less yellow)
    const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
    const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

    const greenRing = isDark ? "rgba(15,122,74,0.62)" : "rgba(15,122,74,0.72)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 140 },

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
        borderWidth: 2,
        borderColor: goldBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      title: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      value: { color: theme.text, fontSize: 15, fontWeight: "900" },

      sub: { marginTop: 8, color: theme.text, opacity: 0.76, fontSize: 12, fontWeight: "800", lineHeight: 16 },

      inner: {
        marginTop: 12,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      innerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      innerLabel: { color: theme.text, opacity: 0.82, fontSize: 12, fontWeight: "900" },
      innerValue: { color: theme.text, fontSize: 13, fontWeight: "900" },

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
      primaryBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
      trophyIcon: { color: "#fff", fontSize: 16, fontWeight: "900" },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      secondaryBtn: {
        marginTop: 10,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

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

  function renderPayoutCard(f) {
    const key = getKey(f);
    if (!key) return null;

    const type = detectFormatType(f);
    const name = String(f?.name || key);

    const totalPool = poolTotalForFormat(f);
    const fee = numOrZero(f?.entryFee);

    if (fee <= 0) {
      return (
        <View key={key} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.value}>No buy-in</Text>
          </View>
          <Text style={styles.sub}>Set an entry fee in Money Pools to compute payouts.</Text>
        </View>
      );
    }

    if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
      const events = countEventsForHoleFormat(f);
      const perEvent = events > 0 ? totalPool / events : 0;

      return (
        <View key={key} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.value}>{events > 0 ? `${money(perEvent)} per win` : "Needs holes"}</Text>
          </View>

          <Text style={styles.sub}>
            Pool total is entry fee x roster. Then we divide by the number of official holes selected across all rounds.
          </Text>

          <View style={styles.inner}>
            <View style={styles.innerRow}>
              <Text style={styles.innerLabel}>Entry fee</Text>
              <Text style={styles.innerValue}>{money(fee)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Roster</Text>
              <Text style={styles.innerValue}>{rosterCount || 0}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Pool total</Text>
              <Text style={styles.innerValue}>{money(totalPool)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Official holes selected</Text>
              <Text style={styles.innerValue}>{events > 0 ? String(events) : "0 (select holes in Format Details)"}</Text>
            </View>
          </View>
        </View>
      );
    }

    if (type === "deucepot") {
      return (
        <View key={key} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.value}>To be determined</Text>
          </View>

          <Text style={styles.sub}>
            This pot is split among all players who make a deuce. Exact payout is calculated after scores are entered.
          </Text>

          <View style={styles.inner}>
            <View style={styles.innerRow}>
              <Text style={styles.innerLabel}>Entry fee</Text>
              <Text style={styles.innerValue}>{money(fee)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Roster</Text>
              <Text style={styles.innerValue}>{rosterCount || 0}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Pot total</Text>
              <Text style={styles.innerValue}>{money(totalPool)}</Text>
            </View>
          </View>
        </View>
      );
    }

    if (type === "puttingcontest") {
      const first = totalPool * 0.75;
      const second = totalPool * 0.25;

      return (
        <View key={key} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.value}>
              {money(first)} / {money(second)}
            </Text>
          </View>

          <Text style={styles.sub}>Split: 1st place 75% and 2nd place 25% of the total pool.</Text>

          <View style={styles.inner}>
            <View style={styles.innerRow}>
              <Text style={styles.innerLabel}>Entry fee</Text>
              <Text style={styles.innerValue}>{money(fee)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Roster</Text>
              <Text style={styles.innerValue}>{rosterCount || 0}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Pool total</Text>
              <Text style={styles.innerValue}>{money(totalPool)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>1st place</Text>
              <Text style={styles.innerValue}>{money(first)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>2nd place</Text>
              <Text style={styles.innerValue}>{money(second)}</Text>
            </View>
          </View>
        </View>
      );
    }

    if (type === "teamvsteam") {
      const perPlayer = rosterCount > 0 ? totalPool / rosterCount : 0;

      return (
        <View key={key} style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{name}</Text>
            <Text style={styles.value}>{rosterCount > 0 ? `${money(perPlayer)} per player` : "Roster needed"}</Text>
          </View>

          <Text style={styles.sub}>
            Winning team payout is shown per player, using total pool divided by tournament roster.
          </Text>

          <View style={styles.inner}>
            <View style={styles.innerRow}>
              <Text style={styles.innerLabel}>Entry fee</Text>
              <Text style={styles.innerValue}>{money(fee)}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Roster</Text>
              <Text style={styles.innerValue}>{rosterCount || 0}</Text>
            </View>
            <View style={[styles.innerRow, { marginTop: 8 }]}>
              <Text style={styles.innerLabel}>Pool total</Text>
              <Text style={styles.innerValue}>{money(totalPool)}</Text>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View key={key} style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.value}>{money(totalPool)} (winner)</Text>
        </View>
        <Text style={styles.sub}>Default payout: a single winner takes the full pool.</Text>

        <View style={styles.inner}>
          <View style={styles.innerRow}>
            <Text style={styles.innerLabel}>Entry fee</Text>
            <Text style={styles.innerValue}>{money(fee)}</Text>
          </View>
          <View style={[styles.innerRow, { marginTop: 8 }]}>
            <Text style={styles.innerLabel}>Roster</Text>
            <Text style={styles.innerValue}>{rosterCount || 0}</Text>
          </View>
          <View style={[styles.innerRow, { marginTop: 8 }]}>
            <Text style={styles.innerLabel}>Pool total</Text>
            <Text style={styles.innerValue}>{money(totalPool)}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={styles.screen}>
        <ScreenHeader navigation={navigation} title="Tournament Payouts" subtitle="Payout details." />
        <View style={[styles.content, { paddingTop: 18 }]}>
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Organizer only</Text>
            <Text style={styles.heroSub}>Only the organizer can view setup payouts.</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Tournament Payouts"
        subtitle="Auto-calculated payouts based on roster, holes, and buy-ins."
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Pre-start</Text>
          <Text style={styles.heroTitle}>Payout Summary</Text>
          <Text style={styles.heroSub}>
            This screen calculates what each win is worth so the organizer doesn’t do the math.
            Hole-based games divide the pool by the total number of official holes selected across all rounds.
          </Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>roster: {rosterCount || 0}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>rounds: {roundsTotal}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>formats: {orderedFormats.length}</Text>
            </View>
          </View>
        </View>

        {!orderedFormats.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No formats selected</Text>
            <Text style={styles.emptySub}>Select formats first, then come back here to see payouts.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Calculated payouts</Text>
            {orderedFormats.map(renderPayoutCard)}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onStartTournament} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <View style={styles.primaryBtnInner}>
            <Text style={styles.trophyIcon}>🏆</Text>
            <Text style={styles.primaryText}>Start tournament</Text>
            <Text style={styles.trophyIcon}>🏆</Text>
          </View>
        </Pressable>

        {fromOverview ? (
          <Pressable onPress={hardReturnToOverview} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Back to overview</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
