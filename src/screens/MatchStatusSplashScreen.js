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

function parseHandicap(v) {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;

    const s = String(v).trim();
    if (!s) return 0;

    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return 0;

    const n = Number(m[0]);
    return Number.isFinite(n) ? Math.round(n) : 0;
}

function strokeIndexForHole(roundRoot, holeNumber) {
    const metaHole = safeObj(roundRoot?.meta?.holeMeta);
    const holeMeta = safeObj(roundRoot?.holeMeta);
    const row = safeObj(metaHole?.[String(holeNumber)] || holeMeta?.[String(holeNumber)]);

    const raw =
        row?.si ??
        row?.strokeIndex ??
        row?.SI ??
        row?.handicap ??
        row?.hcp ??
        row?.hdcp ??
        row?.rank ??
        null;

    const n = parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) && n >= 1 && n <= 18 ? n : 99;
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

    const matchScoring = String(scoring?.matchScoring || "").toLowerCase() === "net" ? "net" : "gross";
    const handicapMethod = String(scoring?.handicapMethod || "").toLowerCase() === "full" ? "full" : "difference";

    const players = safeArr(playersList);

    const hcpById = {};
    players.forEach((p, idx) => {
        const id = String(playerId(p, idx));
        const raw = p && typeof p === "object"
            ? (
                p.handicap ??
                p.hcp ??
                p.handicapIndex ??
                p.index ??
                p.courseHandicap ??
                p.handicapStrokes ??
                p.strokesHdcp ??
                0
            )
            : 0;

        hcpById[id] = parseHandicap(raw);
    });

    const siByHole = {};
    for (let h = 1; h <= 18; h++) {
        siByHole[h] = strokeIndexForHole(roundRoot, h);
    }

    const holesCountRaw =
        Number(roundRoot?.holesCount) ||
        Number(roundRoot?.totalHoles) ||
        Number(roundRoot?.holesToPlay) ||
        Number(roundRoot?.holeCount) ||
        Number(roundRoot?.numHoles) ||
        18;

    const capCount = holesCountRaw === 9 ? 9 : 18;

    const modeRaw = String(roundRoot?.holesMode || roundRoot?.holesSelection || roundRoot?.holes || "").toLowerCase();
    const holesSide = String(roundRoot?.holesSide || "").toLowerCase();
    const isBack = holesSide === "back" || modeRaw.includes("back");

    const startHole = capCount === 9 && isBack ? 10 : 1;
    const holeCap = Math.min(18, startHole + capCount - 1);
    const effectiveMax = Math.max(startHole, Math.min(Number(holeMax) || startHole, holeCap));

    const holesInPlay = [];
    for (let h = startHole; h <= holeCap; h++) holesInPlay.push(h);

    const nameById = {};
    const firstCounts = {};

    const parsed = players.map((p, idx) => {
        const id = playerId(p, idx);
        const out = playerName(p, idx);
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
        if (authFirst) return authFirst;
        return fallbackWord;
    };

    const sideHcp = (ids) => {
        const list = safeArr(ids).map(String).filter(Boolean);
        if (!list.length) return 0;

        const vals = list.map((id) => Number(hcpById[id] || 0)).filter((n) => Number.isFinite(n));
        if (!vals.length) return 0;
        return Math.min(...vals);
    };

    const buildSideStrokesByHole = (higherSideGets, diff) => {
        const strokes = {};
        holesInPlay.forEach((h) => (strokes[h] = 0));
        if (!higherSideGets || !Number.isFinite(diff) || diff <= 0) return strokes;

        const ranked = holesInPlay
            .slice()
            .sort((a, b) => (siByHole[a] || 99) - (siByHole[b] || 99));

        for (let k = 1; k <= diff; k++) {
            const idx = (k - 1) % ranked.length;
            const h = ranked[idx];
            strokes[h] = (strokes[h] || 0) + 1;
        }

        return strokes;
    };

    const bestBallSideScore = (roundRoot2, holeNumber, ids, sideStrokeCount) => {
        const list = safeArr(ids).map(String).filter(Boolean);
        const scores = list
            .map((pid) => {
                const g = readStroke(roundRoot2, holeNumber, pid);
                if (!Number.isFinite(g)) return null;
                const net = Number(g) - Number(sideStrokeCount || 0);
                return Number.isFinite(net) ? net : null;
            })
            .filter((x) => Number.isFinite(x));

        if (!scores.length) return null;
        return Math.min(...scores);
    };

    const matches = safeArr(matchPlay?.matches);

    const results = matches.map((m) => {
        const leftIds = safeArr(m?.leftIds).map(String).filter(Boolean);
        const rightIds = safeArr(m?.rightIds).map(String).filter(Boolean);

        let leftWins = 0;
        let rightWins = 0;
        let thru = 0;
        let clinchedLead = null;
        let clinchedHolesRemaining = null;

        const leftH = sideHcp(leftIds);
        const rightH = sideHcp(rightIds);

        let leftStrokesByHole = {};
        let rightStrokesByHole = {};

        if (matchScoring === "net") {
            if (handicapMethod === "full") {
                leftStrokesByHole = buildSideStrokesByHole(true, Math.max(0, Math.round(leftH)));
                rightStrokesByHole = buildSideStrokesByHole(true, Math.max(0, Math.round(rightH)));
            } else {
                const diff = Math.max(0, Math.round(Math.abs(leftH - rightH)));
                const leftGets = leftH > rightH;
                const rightGets = rightH > leftH;

                leftStrokesByHole = buildSideStrokesByHole(leftGets, diff);
                rightStrokesByHole = buildSideStrokesByHole(rightGets, diff);
            }
        } else {
            leftStrokesByHole = buildSideStrokesByHole(false, 0);
            rightStrokesByHole = buildSideStrokesByHole(false, 0);
        }

        for (let h = startHole; h <= effectiveMax; h++) {
            let l = null;
            let r = null;

            const lStrokeAdj = matchScoring === "net" ? (leftStrokesByHole[h] || 0) : 0;
            const rStrokeAdj = matchScoring === "net" ? (rightStrokesByHole[h] || 0) : 0;

            if (type === "two_v_two" && teamMode === "best_ball") {
                l = matchScoring === "net" ? bestBallSideScore(roundRoot, h, leftIds, lStrokeAdj) : bestBallStroke(roundRoot, h, leftIds);
                r = matchScoring === "net" ? bestBallSideScore(roundRoot, h, rightIds, rStrokeAdj) : bestBallStroke(roundRoot, h, rightIds);
            } else {
                l = matchScoring === "net" ? bestBallSideScore(roundRoot, h, leftIds, lStrokeAdj) : bestBallStroke(roundRoot, h, leftIds);
                r = matchScoring === "net" ? bestBallSideScore(roundRoot, h, rightIds, rStrokeAdj) : bestBallStroke(roundRoot, h, rightIds);
            }

            if (!Number.isFinite(l) || !Number.isFinite(r)) continue;

            thru += 1;
            if (l < r) leftWins += 1;
            else if (r < l) rightWins += 1;

            const liveLead = leftWins - rightWins;
            const liveHolesRemaining = Math.max(0, holeCap - (startHole + thru - 1));

            if (clinchedLead == null && Math.abs(liveLead) > liveHolesRemaining) {
                clinchedLead = liveLead;
                clinchedHolesRemaining = liveHolesRemaining;
                break;
            }
        }

        const lead = clinchedLead != null ? clinchedLead : (leftWins - rightWins);

        const leftLabel = leftIds.length === 1 ? resolveSingle(leftIds[0], "Left") : "Team A";
        const rightLabel = rightIds.length === 1 ? resolveSingle(rightIds[0], "Right") : "Team B";

        const holesRemaining = clinchedHolesRemaining != null
            ? clinchedHolesRemaining
            : Math.max(0, holeCap - (startHole + thru - 1));

        let line = "AS";
        if (Math.abs(lead) > holesRemaining) {
            const winnerLabel = lead > 0 ? leftLabel : rightLabel;
            line = `${winnerLabel} won ${Math.abs(lead)} and ${holesRemaining}`;
        } else if (lead > 0) {
            line = `${leftLabel} ${Math.abs(lead)} up`;
        } else if (lead < 0) {
            line = `${rightLabel} ${Math.abs(lead)} up`;
        }

        const basisLabel = matchScoring === "net" ? "net" : "gross";

        return {
            id: String(m?.id || ""),
            leftLabel,
            rightLabel,
            lead,
            thru,
            line,
            metaLine: `L HCP ${leftH} • R HCP ${rightH} • ${basisLabel}`,
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
            heroSub: {
                marginTop: 12,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
            },

            heroMatchStack: {
                marginTop: 12,
                gap: 10,
            },
            heroMatchCard: {
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.45)",
            },
            heroMatchLabel: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                opacity: 0.9,
            },
            heroMatchValue: {
                marginTop: 6,
                color: theme.text,
                fontSize: 17,
                fontWeight: "900",
            },

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
                marginBottom: 12,
            },

            matchCard: {
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(10,15,26,0.03)",
            },

            row: {
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
            },
            label: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.9 },
            value: { color: theme.text, fontSize: 13, fontWeight: "900" },

            sub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.72,
                fontSize: 12,
                fontWeight: "800",
                lineHeight: 18,
            },

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

                    <View style={styles.heroMatchStack}>
                        {rows.slice(0, 8).map((r, idx) => (
                            <View key={`hero_${r.id || idx}`} style={styles.heroMatchCard}>
                                <Text style={styles.heroMatchLabel} numberOfLines={1}>
                                    {r.leftLabel} vs {r.rightLabel}
                                </Text>
                                <Text style={styles.heroMatchValue} numberOfLines={1}>
                                    {r.line}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <Text style={styles.heroSub}>Tap Continue to proceed to Hole {nextHole}.</Text>
                </View>

                {rows.length > 0 ? (
                    <View style={styles.card}>
                        {rows.slice(0, 8).map((r, idx) => (
                            <View
                                key={`${r.id || idx}`}
                                style={[
                                    styles.matchCard,
                                    idx > 0 ? { marginTop: 10 } : null,
                                ]}
                            >
                                <View style={styles.row}>
                                    <Text style={styles.label} numberOfLines={1}>
                                        {r.leftLabel} vs {r.rightLabel}
                                    </Text>
                                    <Text style={styles.value} numberOfLines={1}>
                                        {r.line} (thru {r.thru || 0})
                                    </Text>
                                </View>

                                {!!r.metaLine ? (
                                    <Text style={styles.sub}>{r.metaLine}</Text>
                                ) : null}
                            </View>
                        ))}

                        {rows.length > 8 ? <Text style={styles.sub}>More matches are tracked. Full panel coming next.</Text> : null}
                    </View>
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