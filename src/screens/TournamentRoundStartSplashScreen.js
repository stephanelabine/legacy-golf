// src/screens/TournamentRoundStartSplashScreen.js
import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ROUTES from "../navigation/routes";

export default function TournamentRoundStartSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();

    const tournamentId = String(route?.params?.tournamentId || "");
    const roundNumber = Number(route?.params?.roundNumber || 1);
    const holeNumber = Number(route?.params?.holeNumber || 1);

    // IMPORTANT: default to empty. Only show format UI if caller sets it.
    const sideGameKey = String(route?.params?.sideGameKey || "");
    const ms = Number(route?.params?.ms || 3000);

    // Pass-through optional context if provided (course/tee/meta/players)
    const course = route?.params?.course;
    const tee = route?.params?.tee;
    const courseId = route?.params?.courseId;
    const courseName = route?.params?.courseName;
    const teeName = route?.params?.teeName;
    const holeMeta = route?.params?.holeMeta;
    const players = route?.params?.players;

    const fade = useRef(new Animated.Value(0)).current;
    const zoom = useRef(new Animated.Value(0.08)).current;
    const rotate = useRef(new Animated.Value(0)).current;
    const shimmer = useRef(new Animated.Value(0)).current;

    const rotDeg = useMemo(() => {
        return rotate.interpolate({
            inputRange: [0, 1],
            outputRange: ["-40deg", "0deg"],
        });
    }, [rotate]);

    const shimmerX = useMemo(() => {
        return shimmer.interpolate({
            inputRange: [0, 1],
            outputRange: [-180, 220],
        });
    }, [shimmer]);

    useEffect(() => {
        const intro = Animated.parallel([
            Animated.timing(fade, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true,
            }),
            Animated.timing(rotate, {
                toValue: 1,
                duration: 900,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.timing(zoom, {
                    toValue: 1.06,
                    duration: 1000,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(zoom, {
                    toValue: 1,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]),
        ]);

        const shimmerLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        intro.start();
        shimmerLoop.start();

        const t = setTimeout(() => {
            navigation.replace(ROUTES.TOURNAMENT_HOLE_VIEW, {
                tournamentId,
                roundNumber,
                holeNumber,

                // Only show overlay if a real sideGameKey exists and showFormatSplash true
                sideGameKey,
                showFormatSplash: true,

                // Pass-through (so TournamentHoleView can forward to HoleMap without breaking)
                course,
                tee,
                courseId,
                courseName,
                teeName,
                holeMeta,
                players,
            });
        }, Math.max(500, ms));

        return () => {
            clearTimeout(t);
            intro.stop();
            shimmerLoop.stop();
        };
    }, [
        fade,
        zoom,
        rotate,
        shimmer,
        navigation,
        ms,
        tournamentId,
        roundNumber,
        holeNumber,
        sideGameKey,
        course,
        tee,
        courseId,
        courseName,
        teeName,
        holeMeta,
        players,
    ]);

    return (
        <View style={[styles.root, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={styles.bgGlow1} pointerEvents="none" />
            <View style={styles.bgGlow2} pointerEvents="none" />
            <View style={styles.stars} pointerEvents="none" />

            <Animated.View style={[styles.heroWrap, { opacity: fade }]}>
                <Animated.View style={[styles.hero, { transform: [{ scale: zoom }, { rotate: rotDeg }] }]}>
                    <View style={styles.heroRingOuter} />
                    <View style={styles.heroRingInner} />

                    <View style={styles.trophyWrap}>
                        <Text style={styles.trophy}>🏆</Text>
                    </View>

                    <Text style={styles.title}>ROUND {roundNumber}</Text>
                    <Text style={styles.subtitle}>STARTED</Text>

                    <View style={styles.badgesRow}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>LEGACY TOURNAMENT</Text>
                        </View>
                        <View style={styles.badgeGold}>
                            <Text style={styles.badgeText}>CONTINUING</Text>
                        </View>
                    </View>

                    <Text style={styles.note}>{tournamentId ? "Loading Tournament Hole…" : "Loading…"}</Text>

                    <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerX }, { rotate: "-18deg" }] }]} pointerEvents="none" />
                </Animated.View>
            </Animated.View>
        </View>
    );
}

const BG = "#071017";
const TEXT = "#EAF2FF";
const GOLD = "rgba(201,162,74,0.95)";
const GOLD_SOFT = "rgba(201,162,74,0.12)";
const CARD = "#0B151E";

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
        alignItems: "center",
        justifyContent: "center",
    },

    bgGlow1: {
        position: "absolute",
        width: 520,
        height: 520,
        borderRadius: 520,
        backgroundColor: "rgba(201,162,74,0.16)",
        top: -120,
        left: -140,
    },
    bgGlow2: {
        position: "absolute",
        width: 680,
        height: 680,
        borderRadius: 680,
        backgroundColor: "rgba(46,125,255,0.10)",
        bottom: -220,
        right: -220,
    },
    stars: {
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        opacity: 0.25,
        backgroundColor: "transparent",
    },

    heroWrap: {
        width: "100%",
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
    },

    hero: {
        width: "100%",
        maxWidth: 520,
        borderRadius: 28,
        paddingVertical: 34,
        paddingHorizontal: 18,
        backgroundColor: CARD,
        borderWidth: 2,
        borderColor: "rgba(201,162,74,0.65)",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 16 },
        elevation: 10,
    },

    heroRingOuter: {
        position: "absolute",
        width: 360,
        height: 360,
        borderRadius: 360,
        borderWidth: 2,
        borderColor: "rgba(201,162,74,0.30)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    heroRingInner: {
        position: "absolute",
        width: 260,
        height: 260,
        borderRadius: 260,
        borderWidth: 1,
        borderColor: "rgba(234,242,255,0.10)",
        backgroundColor: GOLD_SOFT,
    },

    trophyWrap: {
        width: 132,
        height: 132,
        borderRadius: 132,
        backgroundColor: "rgba(255,255,255,0.03)",
        borderWidth: 2,
        borderColor: GOLD,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
        marginBottom: 18,
    },
    trophy: { fontSize: 56 },

    title: {
        color: TEXT,
        fontSize: 18,
        fontWeight: "900",
        letterSpacing: 3.2,
        textAlign: "center",
        opacity: 0.92,
    },
    subtitle: {
        marginTop: 6,
        color: TEXT,
        fontSize: 34,
        fontWeight: "900",
        letterSpacing: 1.0,
        textAlign: "center",
    },

    badgesRow: {
        marginTop: 18,
        flexDirection: "row",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
    },
    badge: {
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(234,242,255,0.12)",
    },
    badgeGold: {
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "rgba(201,162,74,0.12)",
        borderWidth: 1,
        borderColor: "rgba(201,162,74,0.65)",
    },
    badgeText: {
        color: TEXT,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 0.8,
    },

    note: {
        marginTop: 18,
        color: "rgba(234,242,255,0.60)",
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
    },

    shimmer: {
        position: "absolute",
        top: -40,
        width: 120,
        height: 420,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 18,
    },
});
