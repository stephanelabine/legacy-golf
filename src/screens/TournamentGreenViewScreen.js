import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import ScreenHeader from "../components/ScreenHeader";

export default function TournamentGreenViewScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();

    const hole = route?.params?.hole ?? route?.params?.holeNumber ?? 1;

    // We keep this simple + bulletproof:
    // TournamentHoleViewScreen should pass these yardages in params when navigating here.
    const yardages = useMemo(() => {
        const y = route?.params?.yardages || route?.params?.greenYardages || null;
        if (!y) return { front: null, middle: null, back: null };

        return {
            front: typeof y.front === "number" ? y.front : null,
            middle: typeof y.middle === "number" ? y.middle : null,
            back: typeof y.back === "number" ? y.back : null,
        };
    }, [route?.params?.yardages, route?.params?.greenYardages]);

    const greenInfo = useMemo(() => {
        return (
            route?.params?.greenInfo ||
            "Front pin • Slight back-to-front slope • Safer miss: short-left"
        );
    }, [route?.params?.greenInfo]);

    const goBackToScoreEntry = () => {
        // Prefer explicit route if provided
        const scoreRoute =
            route?.params?.scoreEntryRouteName ||
            route?.params?.scoreRouteName ||
            null;

        const params = { ...(route?.params || {}) };

        if (scoreRoute) {
            navigation.navigate(scoreRoute, params);
            return;
        }

        // Try common names (keeps us moving even if your route name differs slightly)
        const tryNames = [
            "TournamentScoreEntry",
            "TournamentScoreEntryScreen",
            "TournamentScores",
            "TournamentScoresScreen",
        ];

        for (const name of tryNames) {
            try {
                navigation.navigate(name, params);
                return;
            } catch (e) { }
        }

        // Final fallback
        navigation.goBack();
    };

    const fmt = (v) => (typeof v === "number" ? `${v} yd` : "—");

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Green View"
                subtitle={`Hole ${hole}`}
            />

            <View style={[styles.wrap, { paddingBottom: 18 + insets.bottom }]}>
                <View style={styles.yardageRow}>
                    <View style={styles.yCard}>
                        <Text style={styles.yLabel}>Front</Text>
                        <Text style={styles.yValue}>{fmt(yardages.front)}</Text>
                    </View>

                    <View style={styles.yCardCenter}>
                        <Text style={styles.yLabel}>Middle</Text>
                        <Text style={styles.yValue}>{fmt(yardages.middle)}</Text>
                    </View>

                    <View style={styles.yCard}>
                        <Text style={styles.yLabel}>Back</Text>
                        <Text style={styles.yValue}>{fmt(yardages.back)}</Text>
                    </View>
                </View>

                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Putting Surface</Text>
                    <Text style={styles.heroSub}>
                        Visual preview placeholder (we’ll swap in real green shapes when we wire course data)
                    </Text>

                    <View style={styles.greenStage}>
                        <View style={styles.greenShape}>
                            <View style={styles.pinDot} />
                            <View style={styles.slopeArrow} />
                            <Text style={styles.slopeText}>slope</Text>
                        </View>

                        <View style={styles.legendRow}>
                            <View style={styles.legendItem}>
                                <View style={styles.legendDot} />
                                <Text style={styles.legendText}>Pin</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={styles.legendLine} />
                                <Text style={styles.legendText}>Slope direction</Text>
                            </View>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Green notes</Text>
                    <Text style={styles.cardBody}>{greenInfo}</Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Aim point</Text>
                    <Text style={styles.cardBody}>
                        Default: play to center-green. We’ll calculate “safe side” and misses from hazards + wind later.
                    </Text>
                </View>

                <Pressable onPress={goBackToScoreEntry} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>Back to Score Entry</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
    wrap: { flex: 1, padding: 16, gap: 12 },

    yardageRow: { flexDirection: "row", gap: 10 },
    yCard: {
        flex: 1,
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
    },
    yCardCenter: {
        flex: 1,
        borderRadius: 18,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: "rgba(212,175,55,0.35)",
        backgroundColor: "rgba(212,175,55,0.10)",
        alignItems: "center",
        justifyContent: "center",
    },
    yLabel: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "900" },
    yValue: { marginTop: 6, color: "#fff", fontSize: 16, fontWeight: "900" },

    heroCard: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
    },
    heroTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
    heroSub: {
        marginTop: 6,
        color: "rgba(255,255,255,0.66)",
        fontSize: 12,
        fontWeight: "800",
        lineHeight: 17,
    },

    greenStage: {
        marginTop: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(0,0,0,0.18)",
        padding: 14,
    },

    greenShape: {
        height: 180,
        borderRadius: 999,
        backgroundColor: "rgba(46, 204, 113, 0.22)",
        borderWidth: 1,
        borderColor: "rgba(46, 204, 113, 0.40)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },

    pinDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: "#fff",
        borderWidth: 2,
        borderColor: "rgba(0,0,0,0.25)",
        position: "absolute",
        top: 58,
        left: "52%",
    },

    slopeArrow: {
        width: 90,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.70)",
        transform: [{ rotate: "-18deg" }],
    },
    slopeText: {
        position: "absolute",
        marginTop: 26,
        color: "rgba(255,255,255,0.65)",
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 0.3,
    },

    legendRow: {
        flexDirection: "row",
        gap: 14,
        marginTop: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
    legendDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#fff" },
    legendLine: {
        width: 18,
        height: 3,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.70)",
    },
    legendText: { color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },

    card: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
    },
    cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
    cardBody: {
        marginTop: 8,
        color: "rgba(255,255,255,0.72)",
        fontSize: 13,
        fontWeight: "800",
        lineHeight: 18,
    },

    primaryBtn: {
        marginTop: 6,
        borderRadius: 18,
        paddingVertical: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(212,175,55,0.20)",
        borderWidth: 1,
        borderColor: "rgba(212,175,55,0.35)",
    },
    primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
});
