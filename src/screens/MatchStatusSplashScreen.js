// src/screens/MatchStatusSplashScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function safeArr(v) {
    return Array.isArray(v) ? v : [];
}

function safeObj(v) {
    return v && typeof v === "object" ? v : {};
}

function playerId(p, idx) {
    const o = p && typeof p === "object" ? p : {};
    // IMPORTANT: prefer stable round player id first (e.g., "me", "p2")
    // MatchPlay matchups and holes.players keys are based on these ids.
    const id =
        o.id ||
        o.playerId ||
        o.uid ||
        o.buddyId ||
        o.email ||
        (typeof o.name === "string" && o.name.trim() ? `name:${o.name.trim()}` : "") ||
        `p${idx + 1}`;
    return String(id);
}

function playerName(p, idx) {
    const o = p && typeof p === "object" ? p : {};
    const nm = o.displayName || o.name || o.fullName || o.label || "";
    const s = String(nm || "").trim();
    if (!s) return `Player ${idx + 1}`;

    const parts = s.split(/\s+/).filter(Boolean);
    const first = parts[0] || `Player ${idx + 1}`;
    const lastInitial = parts.length > 1 ? String(parts[parts.length - 1]).slice(0, 1).toUpperCase() : "";

    // Default: just first name (premium + avoids truncation)
    return { first, lastInitial };
}

function readStroke(roundRoot, holeNumber, pid) {
    const r = safeObj(roundRoot);
    const h = safeObj(r?.holes?.[String(holeNumber)]);
    const players = safeObj(h?.players);
    const row = safeObj(players?.[String(pid)]);
    const n = Number(row?.strokes);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function bestBallStroke(roundRoot, holeNumber, ids) {
    const list = safeArr(ids).map(String).filter(Boolean);
    const strokes = list.map((pid) => readStroke(roundRoot, holeNumber, pid)).filter((x) => Number.isFinite(x));
    if (!strokes.length) return null;
    return Math.min(...strokes);
}

function computeMatchState(roundDoc, matchPlay, playersList, holeMax) {
    const roundRoot = roundDoc || {};
    const scoring = safeObj(matchPlay?.scoring);
    const type = String(matchPlay?.type || "");
    const teamMode = String(scoring?.teamMode || "");

    const players = safeArr(playersList);

    // Build display names:
    // - Prefer first name only
    // - If duplicate first names exist, use "First L."
    const nameById = {};
    const firstCounts = {};

    const parsed = players.map((p, idx) => {
        const id = playerId(p, idx);
        const out = playerName(p, idx); // { first, lastInitial }
        const first = String(out?.first || `Player ${idx + 1}`).trim();
        const lastInitial = String(out?.lastInitial || "").trim();
        return { id: String(id), first, lastInitial, idx };
    });

    parsed.forEach((x) => {
        const k = String(x.first || "").toLowerCase();
        firstCounts[k] = (firstCounts[k] || 0) + 1;
    });

    parsed.forEach((x) => {
        const k = String(x.first || "").toLowerCase();
        const dup = (firstCounts[k] || 0) > 1;
        nameById[String(x.id)] = dup && x.lastInitial ? `${x.first} ${x.lastInitial}.` : x.first;
    });

    const matches = safeArr(matchPlay?.matches);

    const results = matches.map((m) => {
        const leftIds = safeArr(m?.leftIds).map(String).filter(Boolean);
        const rightIds = safeArr(m?.rightIds).map(String).filter(Boolean);

        let leftWins = 0;
        let rightWins = 0;
        let thru = 0;

        for (let h = 1; h <= holeMax; h++) {
            let l = null;
            let r = null;

            if (type === "two_v_two" && teamMode === "best_ball") {
                l = bestBallStroke(roundRoot, h, leftIds);
                r = bestBallStroke(roundRoot, h, rightIds);
            } else {
                // default: single player side; if multiple ids, use best score (safe fallback)
                l = bestBallStroke(roundRoot, h, leftIds);
                r = bestBallStroke(roundRoot, h, rightIds);
            }

            if (!Number.isFinite(l) || !Number.isFinite(r)) continue;

            thru += 1;
            if (l < r) leftWins += 1;
            else if (r < l) rightWins += 1;
            // tie = halved
        }

        const lead = leftWins - rightWins; // + = left up, - = right up
        const shortFirst = (s) => {
            const t = String(s || "").trim();
            if (!t) return "";
            const parts = t.split(/\s+/).filter(Boolean);
            return parts[0] || t;
        };

        const authFirst = shortFirst(auth?.currentUser?.displayName || "");

        const resolveSingle = (pid, fallbackWord) => {
            const key = String(pid || "").trim();
            if (key && nameById[key]) return String(nameById[key]);
            // If we can’t resolve (common when captain id is "me"), prefer auth user name
            if (authFirst) return authFirst;
            return fallbackWord;
        };

        const leftLabel =
            leftIds.length === 1 ? resolveSingle(leftIds[0], "Left") : "Team A";
        const rightLabel =
            rightIds.length === 1 ? resolveSingle(rightIds[0], "Right") : "Team B";

        let line = "AS";
        if (lead > 0) line = `${leftLabel} ${Math.abs(lead)} up`;
        if (lead < 0) line = `${rightLabel} ${Math.abs(lead)} up`;

        return {
            id: String(m?.id || ""),
            leftLabel,
            rightLabel,
            lead,
            thru,
            line,
        };
    });

    return { results, nameById };
}

export default function MatchStatusSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const roundId = params?.roundId || null;
    const holeCompleted = Number(params?.holeCompleted || 1);
    const nextHole = Number(params?.nextHole || Math.min(18, holeCompleted + 1));

    const [roundDoc, setRoundDoc] = useState(null);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    useEffect(() => {
        if (!roundId) return;

        const uid = auth?.currentUser?.uid || null;
        if (!uid) return;

        const isShared = String(roundId).startsWith("sr_");
        const ref = isShared
            ? doc(db, "sharedRounds", String(roundId))
            : doc(db, "users", uid, "rounds", String(roundId));

        const unsub = onSnapshot(
            ref,
            (snap) => setRoundDoc(snap?.exists() ? (snap.data() || null) : null),
            (err) => Alert.alert("Round error", err?.message || "Could not load round.")
        );

        return () => unsub && unsub();
    }, [roundId]);

    const players = useMemo(() => safeArr(roundDoc?.players), [roundDoc]);
    const matchPlay = useMemo(() => safeObj(roundDoc?.matchPlay), [roundDoc]);

    const holeMax = Number.isFinite(holeCompleted) && holeCompleted > 0 ? holeCompleted : 1;

    const computed = useMemo(() => {
        return computeMatchState(roundDoc || {}, matchPlay, players, holeMax);
    }, [roundDoc, matchPlay, players, holeMax]);

    const rows = computed.results || [];
    const primary = rows[0] || null;

    const styles = useMemo(() => {
        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
        const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140 },

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
            heroTitle: { marginTop: 10, color: theme.text, fontSize: 22, fontWeight: "900" },
            heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
                marginBottom: 12,
            },

            row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 10 },
            label: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.9 },
            value: { color: theme.text, fontSize: 13, fontWeight: "900" },

            sub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

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
        });
    }, [theme, isDark, footerPad]);

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Match Play" subtitle={`Status after Hole ${holeMax}`} />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroKicker}>Match status</Text>
                    <Text style={styles.heroTitle}>{primary?.line || "AS"}</Text>
                    <Text style={styles.heroSub}>Tap Continue to proceed to Hole {nextHole}.</Text>
                </View>

                {rows.length > 1 ? (
                    <>
                        <View style={styles.card}>
                            {rows.slice(0, 8).map((r, idx) => (
                                <View key={`${r.id || idx}`} style={[styles.row, idx === 0 ? { paddingTop: 0 } : null]}>
                                    <Text style={styles.label} numberOfLines={1}>
                                        {r.leftLabel} vs {r.rightLabel}
                                    </Text>
                                    <Text style={styles.value} numberOfLines={1}>
                                        {r.line} (thru {r.thru || 0})
                                    </Text>
                                </View>
                            ))}
                            {rows.length > 8 ? <Text style={styles.sub}>More matches are tracked. Full panel coming next.</Text> : null}
                        </View>
                    </>
                ) : null}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={() => {
                        navigation.replace(ROUTES.HOLE_HUB, { roundId, hole: nextHole, holeNumber: nextHole });
                    }}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                    <Text style={styles.primaryText}>Continue</Text>
                </Pressable>
            </View>
        </View>
    );
}