// src/screens/TournamentSettlePayoutsScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { db } from "../firebase/firebase";
import { pickTournamentNavParams } from "../utils/tournamentNav";

/* ---------------- helpers ---------------- */

function normKey(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function money(v) {
    const n = Math.round(toNum(v) * 100) / 100;
    if (!Number.isFinite(n) || n === 0) return "$0";
    return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function uniqInts(arr) {
    const s = new Set();
    (arr || []).forEach((x) => {
        const n = parseInt(String(x ?? ""), 10);
        if (Number.isFinite(n)) s.add(n);
    });
    return Array.from(s).sort((a, b) => a - b);
}

function extractEntryFee(f) {
    if (!f) return 0;
    if (f.entryFee != null) return toNum(f.entryFee);
    if (f.buyIn != null) return toNum(f.buyIn);
    if (f.buyInAmount != null) return toNum(f.buyInAmount);
    if (f.amount != null) return toNum(f.amount);
    return 0;
}

function detectFormatType(f) {
    const t = normKey(f?.type || f?.formatType || f?.key || f?.id || "");
    const n = normKey(f?.name || f?.title || "");
    const hay = `${t} ${n}`;
    if (hay.includes("second") && hay.includes("kp")) return "secondshotkp";
    if (hay.includes("kp") || hay.includes("closest")) return "kp";
    if (hay.includes("long") && hay.includes("drive")) return "longdrive";
    if (hay.includes("deuce")) return "deucepot";
    if (hay.includes("putt")) return "puttingcontest";
    if (hay.includes("team") && hay.includes("vs")) return "teamvsteam";
    return "generic";
}

function computeSettlementPairs(netByPlayer) {
    const creditors = [];
    const debtors = [];

    Object.entries(netByPlayer || {}).forEach(([name, amt]) => {
        const v = Math.round(toNum(amt) * 100) / 100;
        if (v > 0.009) creditors.push({ name, amt: v });
        if (v < -0.009) debtors.push({ name, amt: -v }); // store positive owed
    });

    creditors.sort((a, b) => b.amt - a.amt);
    debtors.sort((a, b) => b.amt - a.amt);

    const lines = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
        const d = debtors[i];
        const c = creditors[j];
        const pay = Math.min(d.amt, c.amt);

        if (pay > 0.009) {
            lines.push({
                from: d.name,
                to: c.name,
                amount: Math.round(pay * 100) / 100,
            });
            d.amt -= pay;
            c.amt -= pay;
        }

        if (d.amt <= 0.009) i += 1;
        if (c.amt <= 0.009) j += 1;
    }

    // stable sort: biggest amounts first, then by payer name
    lines.sort((a, b) => b.amount - a.amount || String(a.from).localeCompare(String(b.from)));

    return lines;
}

/* ---------------- screen ---------------- */

export default function TournamentSettlePayoutsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const [formats, setFormats] = useState([]);
    const [scoresByPid, setScoresByPid] = useState({});
    const [roster, setRoster] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tournamentId) return;

        let alive = true;
        let fUnsub = null;
        let rUnsub = null;
        let sUnsub = null;

        const done = () => {
            if (!alive) return;
            setLoading(false);
        };

        try {
            const fRef = collection(db, "tournaments", tournamentId, "formats");
            fUnsub = onSnapshot(
                fRef,
                (snap) => {
                    const out = [];
                    snap.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
                    if (!alive) return;
                    setFormats(out);
                    done();
                },
                () => {
                    if (!alive) return;
                    setFormats([]);
                    done();
                }
            );

            const rosterRef = collection(db, "tournaments", tournamentId, "roster");
            rUnsub = onSnapshot(
                rosterRef,
                (snap) => {
                    const out = [];
                    snap.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
                    if (!alive) return;
                    setRoster(out);
                    done();
                },
                () => {
                    if (!alive) return;
                    setRoster([]);
                    done();
                }
            );

            const scoresRef = collection(db, "tournaments", tournamentId, "rounds", `r${String(roundNumber)}`, "scores");
            sUnsub = onSnapshot(
                scoresRef,
                (snap) => {
                    const map = {};
                    snap.forEach((d) => (map[String(d.id)] = d.data() || {}));
                    if (!alive) return;
                    setScoresByPid(map);
                    done();
                },
                () => {
                    if (!alive) return;
                    setScoresByPid({});
                    done();
                }
            );
        } catch (e) {
            if (!alive) return;
            setLoading(false);
        }

        return () => {
            alive = false;
            try {
                if (fUnsub) fUnsub();
                if (rUnsub) rUnsub();
                if (sUnsub) sUnsub();
            } catch (e) { }
        };
    }, [tournamentId, roundNumber]);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const gold = "rgba(242,201,76,0.95)";
        const goldBg = "rgba(242,201,76,0.10)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 110 },

            hero: {
                borderRadius: 22,
                padding: 16,
                borderWidth: 1,
                borderColor: gold,
                backgroundColor: goldBg,
                marginBottom: 12,
            },
            heroTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
            heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 18 },

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
                marginBottom: 10,
            },

            row: {
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
            },

            lineText: { color: theme.text, fontSize: 14, fontWeight: "900", flex: 1 },
            amtPill: {
                height: 30,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
                alignItems: "center",
                justifyContent: "center",
            },
            amtText: { color: theme.text, fontSize: 13, fontWeight: "900" },

            emptyTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
            emptySub: { marginTop: 8, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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
            btn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 12,
            },
            btnPrimary: { backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)" },
            btnGhost: {
                marginTop: 10,
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
            },
            btnTextPrimary: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
            btnTextGhost: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },

            pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
            loadingRow: { marginTop: 18, alignItems: "center", justifyContent: "center" },
        });
    }, [theme, isDark, footerPad]);

    const rosterCount = useMemo(() => {
        const rc = Array.isArray(roster) ? roster.length : 0;
        if (rc > 0) return rc;
        return Object.keys(scoresByPid || {}).length;
    }, [roster, scoresByPid]);

    const allPlayerNames = useMemo(() => {
        const s = new Set();

        // prefer roster names
        (Array.isArray(roster) ? roster : []).forEach((r) => {
            const nm = String(r?.name || r?.playerName || "").trim();
            if (nm) s.add(nm);
        });

        // fallback to score docs names
        Object.keys(scoresByPid || {}).forEach((pid) => {
            const d = scoresByPid[pid] || {};
            const nm = String(d?.playerName || d?.name || "").trim();
            if (nm) s.add(nm);
        });

        return Array.from(s).sort((a, b) => a.localeCompare(b));
    }, [scoresByPid, roster]);

    const settlementLines = useMemo(() => {
        const net = {};
        const ensure = (nm) => {
            const k = String(nm || "").trim();
            if (!k) return null;
            if (net[k] == null) net[k] = 0;
            return k;
        };

        allPlayerNames.forEach((nm) => ensure(nm));

        const rk = `r${String(roundNumber)}`;

        const addWin = (nm, amt) => {
            const k = ensure(nm);
            if (!k) return;
            net[k] += toNum(amt);
        };

        const addPay = (nm, amt) => {
            const k = ensure(nm);
            if (!k) return;
            net[k] -= toNum(amt);
        };

        const scoresList = Object.values(scoresByPid || {}).map((d) => ({
            name: String(d?.playerName || d?.name || "").trim(),
            holes: d?.holes || {},
        }));

        const countPutts = (holes) => {
            let t = 0;
            Object.keys(holes || {}).forEach((hk) => {
                const p = Number(holes?.[hk]?.putts);
                if (Number.isFinite(p)) t += p;
            });
            return t;
        };

        const countDeuces = (holes) => {
            let c = 0;
            Object.keys(holes || {}).forEach((hk) => {
                const s = Number(holes?.[hk]?.strokes);
                if (Number.isFinite(s) && s === 2) c += 1;
            });
            return c;
        };

        (Array.isArray(formats) ? formats : []).forEach((f) => {
            const fee = Math.max(0, extractEntryFee(f));
            if (!(fee > 0) || rosterCount <= 0) return;

            // everyone pays into the pot
            allPlayerNames.forEach((nm) => addPay(nm, fee));

            const pot = fee * rosterCount;
            const type = detectFormatType(f);

            if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                const cfg = f?.config && typeof f.config === "object" ? f.config : {};
                const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};
                const officialHoles = uniqInts(hbr?.[rk] || []);
                const events = officialHoles.length;
                if (events <= 0) return;

                const perEvent = pot / events;
                const claimsByRound = f?.claimsByRound && typeof f.claimsByRound === "object" ? f.claimsByRound : {};
                const roundClaims = claimsByRound?.[rk] && typeof claimsByRound[rk] === "object" ? claimsByRound[rk] : {};

                officialHoles.forEach((h) => {
                    const c = roundClaims?.[String(h)] || null;
                    const nm = String(c?.playerName || c?.name || "").trim();
                    if (nm) addWin(nm, perEvent);
                });

                return;
            }

            if (type === "puttingcontest") {
                const rows = scoresList
                    .filter((x) => !!x.name)
                    .map((x) => ({ name: x.name, putts: countPutts(x.holes) }))
                    .filter((x) => Number.isFinite(x.putts));

                if (rows.length === 0) return;

                rows.sort((a, b) => a.putts - b.putts || a.name.localeCompare(b.name));

                const firstPutts = rows[0].putts;
                const first = rows.filter((r) => r.putts === firstPutts);
                const rest = rows.filter((r) => r.putts !== firstPutts);

                const firstPool = pot * 0.75;
                const secondPool = pot * 0.25;

                first.forEach((r) => addWin(r.name, firstPool / first.length));

                if (rest.length > 0) {
                    const secondPutts = rest[0].putts;
                    const second = rest.filter((r) => r.putts === secondPutts);
                    second.forEach((r) => addWin(r.name, secondPool / second.length));
                }

                return;
            }

            if (type === "deucepot") {
                const rows = scoresList
                    .filter((x) => !!x.name)
                    .map((x) => ({ name: x.name, deuces: countDeuces(x.holes) }))
                    .filter((x) => Number.isFinite(x.deuces) && x.deuces > 0);

                if (rows.length === 0) return;

                const share = pot / rows.length;
                rows.forEach((r) => addWin(r.name, share));
                return;
            }

            // teamvsteam / generic: not auto-settled yet
        });

        return computeSettlementPairs(net);
    }, [formats, scoresByPid, rosterCount, roundNumber, allPlayerNames]);

    const goHomeAndFinish = useCallback(() => {
        navigation.navigate(ROUTES.HOME);
    }, [navigation]);

    const goBack = useCallback(() => {
        navigation.navigate(ROUTES.TOURNAMENT_TROPHY, pickTournamentNavParams(params));
    }, [navigation, params]);

    const hasAnyTransfers = settlementLines.length > 0;

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Settle Payouts" subtitle="Final settlement list" />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>Who pays who</Text>
                    <Text style={styles.heroSub}>
                        Use this list to settle the tournament. When done, return home (tournament complete).
                    </Text>

                    {loading ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator />
                            <Text style={[styles.heroSub, { marginTop: 10 }]}>Calculating…</Text>
                        </View>
                    ) : null}
                </View>

                {!hasAnyTransfers ? (
                    <View style={styles.card}>
                        <Text style={styles.emptyTitle}>No payments detected</Text>
                        <Text style={styles.emptySub}>
                            This usually means there are no buy-ins set, or no winners/claims recorded yet for the formats.
                        </Text>
                    </View>
                ) : (
                    settlementLines.map((x, idx) => (
                        <View key={`tx-${idx}-${x.from}-${x.to}`} style={styles.card}>
                            <View style={styles.row}>
                                <Text style={styles.lineText} numberOfLines={2}>
                                    {x.from} pays {x.to}
                                </Text>
                                <View style={styles.amtPill}>
                                    <Text style={styles.amtText}>{money(x.amount)}</Text>
                                </View>
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable onPress={goHomeAndFinish} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
                    <Text style={styles.btnTextPrimary}>Return Home</Text>
                </Pressable>

                <Pressable onPress={goBack} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
                    <Text style={styles.btnTextGhost}>Back</Text>
                </Pressable>
            </View>
        </View>
    );
}
