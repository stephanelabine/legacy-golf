// src/screens/PlayerStatsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Keyboard } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { auth } from "../firebase/firebase";
import { getRounds } from "../storage/rounds";

const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";
const INNER = "rgba(0,0,0,0.18)";

const GOLD = "rgba(242,201,76,0.85)";
const GREEN = "rgba(15,122,74,0.70)";

function toInt(v) {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function readStroke(roundRoot, holeNumber, playerId) {
    const rid = String(playerId);

    const a =
        roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
        roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
    const aInt = toInt(a);
    if (aInt > 0) return aInt;

    const holesArr = Array.isArray(roundRoot?.holes) ? roundRoot.holes : null;
    if (holesArr && holeNumber >= 1 && holeNumber <= holesArr.length) {
        const h = holesArr[holeNumber - 1];
        const b = h?.scores?.[rid] ?? h?.strokes?.[rid];
        const bInt = toInt(b);
        if (bInt > 0) return bInt;
    }

    return 0;
}

function readField(roundRoot, holeNumber, playerId, key) {
    const rid = String(playerId);
    const v =
        roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.[key] ??
        roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.stats?.[key];
    return v ?? null;
}

function sumTotal(roundRoot, playerId) {
    let total = 0;
    for (let h = 1; h <= 18; h++) {
        const n = readStroke(roundRoot, h, playerId);
        if (n > 0) total += n;
    }
    return total;
}

function fmtPct(a, b) {
    if (!b) return "—";
    const pct = Math.round((a / b) * 100);
    return `${pct}%`;
}

function toMs(x) {
    if (!x) return 0;
    try {
        // Firestore Timestamp support
        if (typeof x?.toDate === "function") return x.toDate().getTime();
        if (typeof x?.seconds === "number") return x.seconds * 1000;
    } catch { }
    const d = new Date(x);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function findMyPlayerId(rounds) {
    const uid = String(auth?.currentUser?.uid || "").trim();

    // Prefer explicit "source: me"
    for (const r of (Array.isArray(rounds) ? rounds : [])) {
        const ps = Array.isArray(r?.players) ? r.players : [];
        const hit = ps.find((p) => String(p?.source || "").toLowerCase() === "me");
        if (hit?.id) return String(hit.id);
        if (uid && String(hit?.uid || "") === uid) return String(hit.id || hit.uid);
    }

    // Prefer matching uid
    if (uid) {
        for (const r of (Array.isArray(rounds) ? rounds : [])) {
            const ps = Array.isArray(r?.players) ? r.players : [];
            const hit = ps.find((p) => String(p?.uid || "") === uid);
            if (hit?.id) return String(hit.id);
        }
    }

    // Prefer id === "me"
    for (const r of (Array.isArray(rounds) ? rounds : [])) {
        const ps = Array.isArray(r?.players) ? r.players : [];
        const hit = ps.find((p) => String(p?.id || "").toLowerCase() === "me");
        if (hit?.id) return String(hit.id);
    }

    // Fallback: first player of first round
    const first = (Array.isArray(rounds) ? rounds : [])[0];
    const p0 = Array.isArray(first?.players) ? first.players[0] : null;
    return String(p0?.id || "me");
}

export default function PlayerStatsScreen({ navigation }) {
    const [rounds, setRounds] = useState([]);
    const [activeTab, setActiveTab] = useState("stats");
    const [clubRange, setClubRange] = useState("10");

    useFocusEffect(
        useCallback(() => {
            let live = true;
            (async () => {
                const list = await getRounds();
                if (!live) return;
                setRounds(Array.isArray(list) ? list : []);
            })();
            return () => {
                live = false;
            };
        }, [])
    );

    const sortedRounds = useMemo(() => {
        const list = Array.isArray(rounds) ? [...rounds] : [];
        list.sort((a, b) => {
            const ta = toMs(a?.playedAt || a?.date || a?.updatedAt || a?.createdAt);
            const tb = toMs(b?.playedAt || b?.date || b?.updatedAt || b?.createdAt);
            return tb - ta;
        });
        return list;
    }, [rounds]);

    const myPlayerId = useMemo(() => findMyPlayerId(sortedRounds), [sortedRounds]);

    const completedRounds = useMemo(() => {
        const list = Array.isArray(sortedRounds) ? sortedRounds : [];
        return list.filter((r) => String(r?.status || "").toLowerCase() === "completed");
    }, [sortedRounds]);

    const aggregates = useMemo(() => {
        const list = completedRounds;

        let roundsCount = 0;
        let grossSum = 0;
        let grossWithTotal = 0;
        let bestGross = null;

        let puttsHoles = 0;
        let puttsTotal = 0;

        let firYes = 0;
        let firOpp = 0;

        let girYes = 0;
        let girOpp = 0;

        let upYes = 0;
        let upOpp = 0;

        let sandYes = 0;
        let sandOpp = 0;

        for (const r of list) {
            roundsCount += 1;

            const total = sumTotal(r, myPlayerId);
            if (total > 0) {
                grossSum += total;
                grossWithTotal += 1;
                if (bestGross === null || total < bestGross) bestGross = total;
            }

            for (let h = 1; h <= 18; h++) {
                // Putts: count only if the field exists and is numeric (supports "0" if saved)
                const rawPutts = readField(r, h, myPlayerId, "putts");
                const hasPutts = rawPutts !== null && rawPutts !== undefined && String(rawPutts).length > 0;
                const putts = toInt(rawPutts);
                if (hasPutts && putts >= 0) {
                    puttsHoles += 1;
                    puttsTotal += putts;
                }

                const fairway = String(readField(r, h, myPlayerId, "fairway") ?? "na");
                if (fairway !== "na") {
                    firOpp += 1;
                    if (fairway === "yes") firYes += 1;
                }

                const green = String(readField(r, h, myPlayerId, "green") ?? "na");
                if (green !== "na") {
                    girOpp += 1;
                    if (green === "yes") girYes += 1;
                }

                const updown = String(readField(r, h, myPlayerId, "updown") ?? "na");
                if (updown !== "na") {
                    upOpp += 1;
                    if (updown === "yes") upYes += 1;
                }

                const sandSave = String(readField(r, h, myPlayerId, "sandSave") ?? "na");
                if (sandSave !== "na") {
                    sandOpp += 1;
                    if (sandSave === "yes") sandYes += 1;
                }
            }
        }

        const avgGross = grossWithTotal ? Math.round(grossSum / grossWithTotal) : null;
        const avgPutts = puttsHoles ? (puttsTotal / puttsHoles).toFixed(1) : null;

        return {
            roundsCount,
            avgGross,
            bestGross,
            avgPutts,
            fir: fmtPct(firYes, firOpp),
            gir: fmtPct(girYes, girOpp),
            updown: fmtPct(upYes, upOpp),
            sand: fmtPct(sandYes, sandOpp),
        };
    }, [completedRounds, myPlayerId]);

    const recent = useMemo(() => {
        const list = completedRounds.slice(0, 12).map((r) => {
            const courseName = String(r?.courseName || r?.course?.name || "Course");
            const teeName = String(r?.teeName || r?.tee?.name || "Tees");
            const when = r?.playedAt || r?.date || r?.createdAt || r?.updatedAt || null;
            const dateLabel = when ? new Date(toMs(when)).toLocaleDateString() : "";
            const total = sumTotal(r, myPlayerId);
            return {
                id: String(r?.id || r?.roundId || ""),
                courseName,
                teeName,
                dateLabel,
                total,
            };
        });
        return list;
    }, [completedRounds, myPlayerId]);

    const empty = completedRounds.length === 0;

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.headerWrap}>
                <View style={styles.topGlowA} pointerEvents="none" />
                <View style={styles.topGlowB} pointerEvents="none" />

                <View style={styles.topRow}>
                    <Pressable onPress={() => navigation.goBack?.()} hitSlop={12} style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}>
                        <Text style={styles.headerPillText}>Back</Text>
                    </Pressable>

                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Player Stats</Text>
                        <Text style={styles.headerSubtitle}>Local round history (v1)</Text>
                    </View>

                    <View style={styles.headerRightSpacer} />
                </View>
            </View>

            <View style={styles.tabRow}>
                <Pressable
                    onPress={() => setActiveTab("stats")}
                    style={({ pressed }) => [
                        styles.tabBtn,
                        activeTab === "stats" && styles.tabBtnActive,
                        pressed && styles.pressed,
                    ]}
                >
                    <MaterialCommunityIcons
                        name="chart-box-outline"
                        size={16}
                        color={activeTab === "stats" ? WHITE : MUTED}
                    />
                    <Text style={[styles.tabBtnText, activeTab === "stats" && styles.tabBtnTextActive]}>Player Stats</Text>
                </Pressable>

                <Pressable
                    onPress={() => setActiveTab("clubs")}
                    style={({ pressed }) => [
                        styles.tabBtn,
                        activeTab === "clubs" && styles.tabBtnActive,
                        pressed && styles.pressed,
                    ]}
                >
                    <MaterialCommunityIcons
                        name="golf"
                        size={16}
                        color={activeTab === "clubs" ? WHITE : MUTED}
                    />
                    <Text style={[styles.tabBtnText, activeTab === "clubs" && styles.tabBtnTextActive]}>Club Distances</Text>
                </Pressable>
            </View>

            {activeTab === "stats" ? (
                empty ? (
                    <View style={styles.emptyWrap}>
                        <View style={styles.goldRing}>
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>No completed rounds yet</Text>
                                <Text style={styles.cardSub}>Finish a round to start building your stats. This first version reads from Round History on this device.</Text>

                                <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                                    <Text style={styles.ctaText}>Back</Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                ) : (
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                        onScrollBeginDrag={() => Keyboard.dismiss()}
                    >
                        <View style={styles.goldRing}>
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Overview</Text>
                                <Text style={styles.cardSub}>Based on completed rounds only.</Text>

                                <View style={styles.statGrid3}>
                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Rounds</Text>
                                        <Text style={styles.statBoxValue}>{String(aggregates.roundsCount || 0)}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Average Gross</Text>
                                        <Text style={styles.statBoxValue}>{aggregates.avgGross !== null ? String(aggregates.avgGross) : "—"}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Best Round</Text>
                                        <Text style={styles.statBoxValue}>{aggregates.bestGross !== null ? String(aggregates.bestGross) : "—"}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.goldRing}>
                            <View style={styles.card}>
                                <Text style={styles.cardTitle}>Stats snapshot</Text>
                                <Text style={styles.cardSub}>Only counts holes where stats were tracked (Stats ON).</Text>

                                <View style={styles.statGrid3}>
                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>FIR</Text>
                                        <Text style={styles.statBoxValueSmall}>{aggregates.fir}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>GIR</Text>
                                        <Text style={styles.statBoxValueSmall}>{aggregates.gir}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Putts</Text>
                                        <Text style={styles.statBoxValueSmall}>{aggregates.avgPutts !== null ? String(aggregates.avgPutts) : "—"}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Up & Down</Text>
                                        <Text style={styles.statBoxValueSmall}>{aggregates.updown}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Sand</Text>
                                        <Text style={styles.statBoxValueSmall}>{aggregates.sand}</Text>
                                    </View>

                                    <View style={styles.statBox}>
                                        <Text style={styles.statBoxLabel}>Rounds</Text>
                                        <Text style={styles.statBoxValueSmall}>{String(aggregates.roundsCount || 0)}</Text>
                                    </View>
                                </View>

                                <Text style={styles.foot}>Scorecard stays strokes-only. These live in the per-player stats layer.</Text>
                            </View>
                        </View>

                        <View style={styles.goldRing}>
                            <View style={styles.card}>
                                <View style={styles.recentHeaderRow}>
                                    <View style={styles.recentHeaderTextWrap}>
                                        <Text style={styles.cardTitle}>Recent completed rounds list</Text>
                                        <Text style={styles.cardSub}>Tap a row later to open round details (future).</Text>
                                    </View>

                                    <View style={styles.compactRoundsBox}>
                                        <Text style={styles.compactRoundsLabel}>Total completed rounds</Text>
                                        <Text style={styles.compactRoundsValue}>{String(aggregates.roundsCount || 0)}</Text>
                                    </View>
                                </View>

                                <View style={{ marginTop: 12, gap: 10 }}>
                                    {recent.map((r) => (
                                        <View key={r.id} style={styles.recentRow}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.recentTop} numberOfLines={1}>
                                                    {r.courseName} • {r.teeName}
                                                </Text>
                                                <Text style={styles.recentSub} numberOfLines={1}>
                                                    {r.dateLabel || "—"}
                                                </Text>
                                            </View>

                                            <View style={styles.totalBox}>
                                                <Text style={styles.totalVal}>{r.total > 0 ? String(r.total) : "—"}</Text>
                                                <Text style={styles.totalFoot}>gross</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        </View>

                        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                            <Text style={styles.ctaText}>Back</Text>
                        </Pressable>
                    </ScrollView>
                )
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={() => Keyboard.dismiss()}
                >
                    <View style={styles.goldRing}>
                        <View style={styles.card}>
                            <View style={styles.clubHeaderBlock}>
                                <Text style={styles.clubHeaderTitle}>Club Distances</Text>

                                <View style={styles.rangePillsCentered}>
                                    <Pressable
                                        onPress={() => setClubRange("10")}
                                        style={({ pressed }) => [
                                            styles.rangePill,
                                            clubRange === "10" && styles.rangePillActive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={[styles.rangePillText, clubRange === "10" && styles.rangePillTextActive]}>Last 10</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setClubRange("20")}
                                        style={({ pressed }) => [
                                            styles.rangePill,
                                            clubRange === "20" && styles.rangePillActive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={[styles.rangePillText, clubRange === "20" && styles.rangePillTextActive]}>Last 20</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setClubRange("50")}
                                        style={({ pressed }) => [
                                            styles.rangePill,
                                            clubRange === "50" && styles.rangePillActive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={[styles.rangePillText, clubRange === "50" && styles.rangePillTextActive]}>Last 50</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setClubRange("100")}
                                        style={({ pressed }) => [
                                            styles.rangePill,
                                            clubRange === "100" && styles.rangePillActive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={[styles.rangePillText, clubRange === "100" && styles.rangePillTextActive]}>Last 100</Text>
                                    </Pressable>
                                </View>
                            </View>

                            <Text style={styles.cardSub}>This view will populate as saved shot distances begin to build over time.</Text>

                            <View style={{ marginTop: 14, gap: 10 }}>
                                {[
                                    ["Driver", "—"],
                                    ["3 Wood", "—"],
                                    ["Hybrid", "—"],
                                    ["Driving Iron", "—"],
                                    ["4 Iron", "—"],
                                    ["5 Iron", "—"],
                                    ["6 Iron", "—"],
                                    ["7 Iron", "—"],
                                    ["8 Iron", "—"],
                                    ["9 Iron", "—"],
                                    ["PW", "—"],
                                    ["56°", "—"],
                                ].map(([club, value], idx) => (
                                    <View
                                        key={club}
                                        style={[
                                            styles.clubRow,
                                            idx % 3 === 0
                                                ? styles.clubRowToneA
                                                : idx % 3 === 1
                                                    ? styles.clubRowToneB
                                                    : styles.clubRowToneC,
                                        ]}
                                    >
                                        <Text style={styles.clubRowLabel}>{club}</Text>
                                        <Text style={styles.clubRowValue}>{value}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>

                    <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                        <Text style={styles.ctaText}>Back</Text>
                    </Pressable>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },

    headerWrap: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
        overflow: "hidden",
    },
    topGlowA: {
        position: "absolute",
        top: -90,
        left: -50,
        width: 300,
        height: 300,
        borderRadius: 300,
        backgroundColor: "rgba(46,125,255,0.22)",
        opacity: 0.35,
    },
    topGlowB: {
        position: "absolute",
        top: -120,
        right: -70,
        width: 340,
        height: 340,
        borderRadius: 340,
        backgroundColor: "rgba(255,255,255,0.10)",
        opacity: 0.18,
    },

    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

    headerPill: {
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 70,
    },
    headerPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

    headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
    headerTitle: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 0.6 },
    headerSubtitle: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: "800" },
    headerRightSpacer: { minWidth: 70, height: 38 },

    emptyWrap: { flex: 1, padding: 16, justifyContent: "center" },

    tabRow: {
        flexDirection: "row",
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 10,
    },
    tabBtn: {
        flex: 1,
        height: 46,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.05)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    tabBtnActive: {
        borderColor: GOLD,
        backgroundColor: "rgba(242,201,76,0.12)",
    },
    tabBtnText: {
        color: MUTED,
        fontWeight: "900",
        fontSize: 13,
    },
    tabBtnTextActive: {
        color: WHITE,
    },

    goldRing: {
        borderRadius: 24,
        padding: 2,
        borderWidth: 2,
        borderColor: GOLD,
        backgroundColor: "transparent",
        marginBottom: 12,
    },

    card: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1.5,
        borderColor: GREEN,
        backgroundColor: CARD,
    },

    cardTitle: { color: WHITE, fontSize: 15, fontWeight: "900" },
    cardSub: { marginTop: 6, color: MUTED, fontSize: 12, fontWeight: "800", lineHeight: 17 },

    row: {
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: GREEN,
        backgroundColor: "rgba(0,0,0,0.18)",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    k: { color: MUTED, fontWeight: "900" },
    v: { color: WHITE, fontWeight: "900" },

    statGrid3: {
        marginTop: 12,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    statBox: {
        width: "31.5%",
        minHeight: 88,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: GREEN,
        backgroundColor: "rgba(0,0,0,0.18)",
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    statBoxLabel: {
        color: MUTED,
        fontWeight: "900",
        fontSize: 11,
        lineHeight: 14,
        textAlign: "center",
    },
    statBoxValue: {
        marginTop: 8,
        color: WHITE,
        fontWeight: "900",
        fontSize: 28,
        lineHeight: 30,
        textAlign: "center",
    },
    statBoxValueSmall: {
        marginTop: 8,
        color: WHITE,
        fontWeight: "900",
        fontSize: 20,
        lineHeight: 22,
        textAlign: "center",
    },

    foot: { marginTop: 12, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800", lineHeight: 17 },

    recentHeaderRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
    },
    recentHeaderTextWrap: {
        flex: 1,
        minWidth: 0,
        paddingRight: 4,
    },
    compactRoundsBox: {
        width: 118,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: GREEN,
        backgroundColor: "rgba(0,0,0,0.18)",
        paddingVertical: 10,
        paddingHorizontal: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    compactRoundsLabel: {
        color: MUTED,
        fontWeight: "900",
        fontSize: 10,
        lineHeight: 13,
        textAlign: "center",
    },
    compactRoundsValue: {
        marginTop: 6,
        color: WHITE,
        fontWeight: "900",
        fontSize: 28,
        lineHeight: 30,
    },

    clubHeaderBlock: {
        alignItems: "center",
    },
    clubHeaderTitle: {
        color: WHITE,
        fontSize: 15,
        fontWeight: "900",
        textAlign: "center",
    },
    rangePillsCentered: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        justifyContent: "center",
        marginTop: 12,
    },
    rangePill: {
        minHeight: 30,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.05)",
        alignItems: "center",
        justifyContent: "center",
    },
    rangePillActive: {
        borderColor: GOLD,
        backgroundColor: "rgba(242,201,76,0.14)",
    },
    rangePillText: {
        color: MUTED,
        fontWeight: "900",
        fontSize: 11,
    },
    rangePillTextActive: {
        color: WHITE,
    },
    clubRow: {
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: GREEN,
        paddingVertical: 14,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    clubRowToneA: {
        backgroundColor: "rgba(20,36,64,0.70)",
    },
    clubRowToneB: {
        backgroundColor: "rgba(15,26,46,0.70)",
    },
    clubRowToneC: {
        backgroundColor: "rgba(28,44,74,0.70)",
    },
    clubRowLabel: {
        color: WHITE,
        fontWeight: "900",
        fontSize: 14,
    },
    clubRowValue: {
        color: WHITE,
        fontWeight: "900",
        fontSize: 20,
    },

    recentRow: {
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: GREEN,
        backgroundColor: "rgba(0,0,0,0.18)",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    recentTop: { color: WHITE, fontWeight: "900", fontSize: 14 },
    recentSub: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 11 },

    totalBox: { minWidth: 80, alignItems: "flex-end", justifyContent: "center" },
    totalVal: { color: WHITE, fontWeight: "900", fontSize: 22 },
    totalFoot: { marginTop: 2, color: MUTED, fontWeight: "800", fontSize: 11 },

    cta: {
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(46,125,255,0.16)",
        borderWidth: 1,
        borderColor: "rgba(46,125,255,0.30)",
        marginTop: 2,
    },
    ctaText: { color: WHITE, fontWeight: "900", letterSpacing: 0.4 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});