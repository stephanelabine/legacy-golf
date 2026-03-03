// src/screens/FrontNineStatsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { doc, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { auth, db } from "../firebase/firebase";

function toInt(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.round(n));
}

function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function holeStrokeIndex(holeMeta, h) {
    const hm = holeMeta && typeof holeMeta === "object" ? (holeMeta[String(h)] || holeMeta[h] || {}) : {};
    const siRaw = hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? hm?.handicap ?? null;
    const si = Number(siRaw);
    return Number.isFinite(si) ? si : null;
}

function strokesReceived(hcp, strokeIndex) {
    const h = Math.max(0, Math.floor(Number(hcp) || 0));
    if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return 0;
    const base = Math.floor(h / 18);
    const extra = h % 18;
    return base + (strokeIndex <= extra ? 1 : 0);
}

export default function FrontNineStatsScreen({ navigation, route }) {
    const roundId = route?.params?.roundId || null;

    const [roundDoc, setRoundDoc] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const uid = auth?.currentUser?.uid || null;
        if (!roundId) return;

        const isShared = String(roundId).startsWith("sr_");
        const ref = isShared
            ? doc(db, "sharedRounds", String(roundId))
            : doc(db, "users", String(uid), "rounds", String(roundId));

        setLoading(true);

        const unsub = onSnapshot(
            ref,
            (snap) => {
                setRoundDoc(snap.exists() ? snap.data() : null);
                setLoading(false);
            },
            () => {
                setRoundDoc(null);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [roundId]);

    const computed = useMemo(() => {
        const rd = roundDoc && typeof roundDoc === "object" ? roundDoc : null;
        if (!rd) return { players: [], courseName: "", teeName: "" };

        const courseName = String(rd?.courseName || rd?.course?.name || "");
        const teeName = String(rd?.teeName || rd?.tee?.name || "");

        const scoringMode = String(rd?.scoringMode || rd?.scoring || "net").toLowerCase();
        const useNet = scoringMode === "net";

        const holeMeta =
            rd?.holeMeta ||
            rd?.courseData?.holeMeta ||
            rd?.course?.holeMeta ||
            rd?.course?.holes ||
            {};

        const holes = (rd?.holes && typeof rd.holes === "object") ? rd.holes : {};

        const playersRaw = Array.isArray(rd?.players) ? rd.players : (Array.isArray(rd?.participants) ? rd.participants : []);
        const players = playersRaw.map((p, idx) => {
            const pid = String(p?.id || p?.uid || p?.playerId || "");
            const name = String(p?.name || p?.displayName || `Player ${idx + 1}`);
            const handicap = Number(p?.handicap ?? 0);

            let gross = 0;
            let putts = 0;
            let hasAnyPutts = false;

            for (let h = 1; h <= 9; h++) {
                const ph = holes?.[String(h)]?.players?.[String(pid)] || holes?.[String(h)]?.players?.[pid] || null;
                const strokes = toInt(ph?.strokes);
                gross += strokes;

                const pPutts = toNum(ph?.putts);
                if (pPutts !== null) {
                    putts += toInt(pPutts);
                    hasAnyPutts = true;
                }
            }

            let net = gross;
            if (useNet) {
                let netSum = 0;
                for (let h = 1; h <= 9; h++) {
                    const si = holeStrokeIndex(holeMeta, h);
                    const ph = holes?.[String(h)]?.players?.[String(pid)] || holes?.[String(h)]?.players?.[pid] || null;
                    const strokes = toInt(ph?.strokes);
                    if (strokes <= 0) continue;
                    netSum += (strokes - strokesReceived(handicap, si));
                }
                net = netSum || 0;
            }

            return {
                pid,
                name,
                handicap,
                gross,
                putts: hasAnyPutts ? putts : null,
                net,
            };
        }).filter((p) => p.pid);

        return { players, courseName, teeName };
    }, [roundDoc]);

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title="Front 9 Stats"
                subtitle={computed.courseName ? `${computed.courseName}${computed.teeName ? ` • ${computed.teeName}` : ""}` : ""}
                safeTop={false}
                leftLabel="Back"
                onLeftPress={() => navigation.goBack()}
                rightLabel=""
                onRightPress={() => { }}
            />

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator />
                    <Text style={styles.loadingText}>Loading…</Text>
                </View>
            ) : !computed.players.length ? (
                <View style={styles.center}>
                    <Text style={styles.emptyTitle}>No stats yet</Text>
                    <Text style={styles.emptySub}>Play the front nine and we’ll show totals here.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollPad}>
                    {computed.players.map((p) => (
                        <View key={p.pid} style={styles.card}>
                            <Text style={styles.name}>{p.name}</Text>

                            <View style={styles.row}>
                                <Text style={styles.label}>Gross</Text>
                                <Text style={styles.value}>{String(p.gross)}</Text>
                            </View>

                            <View style={styles.row}>
                                <Text style={styles.label}>Putts</Text>
                                <Text style={styles.value}>{p.putts === null ? "—" : String(p.putts)}</Text>
                            </View>

                            <View style={[styles.row, { marginBottom: 0 }]}>
                                <Text style={styles.label}>Net</Text>
                                <Text style={styles.value}>{String(p.net)}</Text>
                            </View>
                        </View>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#0B0F14" },
    scrollPad: { padding: 14, paddingBottom: 24 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
    loadingText: { marginTop: 10, color: "rgba(255,255,255,0.75)" },
    emptyTitle: { color: "rgba(255,255,255,0.9)", fontSize: 18 },
    emptySub: { marginTop: 8, color: "rgba(255,255,255,0.7)", textAlign: "center" },

    card: {
        borderWidth: 1,
        borderColor: "rgba(214, 171, 84, 0.28)",
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
    },

    name: { color: "rgba(255,255,255,0.95)", fontSize: 18, marginBottom: 10 },

    row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    label: { flex: 1, color: "rgba(255,255,255,0.72)", fontSize: 15 },
    value: { color: "rgba(255,255,255,0.92)", fontSize: 16 },
});