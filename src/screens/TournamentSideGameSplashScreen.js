import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";

function getSideGameVisual(sideGameKey) {
    const key = String(sideGameKey || "").toUpperCase();

    if (key === "LONG_DRIVE") {
        return {
            title: "Side game",
            big: "Long Drive",
            icon: { lib: "ion", name: "golf", color: "#E7C46A" },
            caption: "Bomb it. Fairway finds glory.",
        };
    }

    if (key === "KP") {
        return {
            title: "Side game",
            big: "KP",
            icon: { lib: "ion", name: "locate", color: "#E7C46A" },
            caption: "Closest to the pin takes it.",
        };
    }

    if (key === "SECOND_SHOT_KP") {
        return {
            title: "Side game",
            big: "Second Shot KP",
            icon: { lib: "ion", name: "navigate", color: "#E7C46A" },
            caption: "Second-shot precision wins.",
        };
    }

    return {
        title: "Side game",
        big: "In play",
        icon: { lib: "ion", name: "sparkles", color: "#E7C46A" },
        caption: "Play smart. Confirm after the hole.",
    };
}

export default function TournamentSideGameSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params.tournamentId || null;
    const roundIndex = Number.isFinite(Number(params.roundIndex)) ? Number(params.roundIndex) : 0;
    const holeIndex = Number.isFinite(Number(params.holeIndex)) ? Number(params.holeIndex) : 0;
    const sideGameKey = String(params.sideGameKey || "LONG_DRIVE");

    const visual = useMemo(() => getSideGameVisual(sideGameKey), [sideGameKey]);

    const inAnim = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;
    const sweep = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const intro = Animated.timing(inAnim, {
            toValue: 1,
            duration: 760,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });

        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        const sweepLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(sweep, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        pulseLoop.start();
        sweepLoop.start();
        intro.start();

        const t = setTimeout(() => {
            // Dev-safe default: return to Player Briefing so we can repeat quickly.
            // Later, pass nextRoute/nextParams when HoleView is ready.
            const nextRoute = params.nextRoute;
            const nextParams = params.nextParams;

            if (nextRoute) {
                navigation.replace(nextRoute, { ...(nextParams || {}), tournamentId, roundIndex, holeIndex });
                return;
            }

            navigation.replace(ROUTES.TOURNAMENT_PLAYER_BRIEFING, {
                tournamentId,
                roundIndex,
                holeIndex,
                sideGameKey,
                fromSideGameSplash: true,
            });
        }, 4500);

        return () => {
            clearTimeout(t);
            pulseLoop.stop();
            sweepLoop.stop();
        };
    }, [navigation, inAnim, pulse, sweep, params.nextRoute, params.nextParams, tournamentId, roundIndex, holeIndex, sideGameKey]);

    const cardScale = inAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
    const cardTranslateY = inAnim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
    const cardOpacity = inAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.07] });
    const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.26, 0.6] });

    const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-180, 180] });
    const sweepOpacity = sweep.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.22] });

    const holeText = useMemo(() => `Applies to Hole ${holeIndex + 1}`, [holeIndex]);

    return (
        <View style={[styles.root, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.bgBase} />
            <View style={styles.bgVignette} />
            <View style={styles.bgTopGlow} />

            <View style={styles.centerWrap}>
                <Animated.View style={[styles.pulseRing, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />

                <Animated.View
                    style={[
                        styles.heroCard,
                        {
                            opacity: cardOpacity,
                            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
                        },
                    ]}
                >
                    <View style={styles.smallPill}>
                        <Text style={styles.smallPillText}>{visual.title.toUpperCase()}</Text>
                    </View>

                    <View style={styles.iconWrap}>
                        <Ionicons name={visual.icon.name} size={92} color={visual.icon.color} />
                    </View>

                    <Text style={styles.big}>{visual.big}</Text>
                    <Text style={styles.hole}>{holeText}</Text>
                    <Text style={styles.caption}>{visual.caption}</Text>

                    <View style={styles.footerHint}>
                        <Text style={styles.footerHintText}>Auto continuing…</Text>
                    </View>

                    <Animated.View style={[styles.sweep, { opacity: sweepOpacity, transform: [{ translateX: sweepX }] }]} />
                </Animated.View>
            </View>

            <View style={styles.floorWrap}>
                <View style={styles.floorLine} />
                <View style={styles.floorGlow} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#05070C",
    },
    bgBase: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#05070C",
    },
    bgVignette: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.38)",
    },
    bgTopGlow: {
        position: "absolute",
        left: -40,
        right: -40,
        top: -120,
        height: 340,
        backgroundColor: "rgba(231,196,106,0.08)",
        borderBottomLeftRadius: 240,
        borderBottomRightRadius: 240,
        transform: [{ scaleX: 1.1 }],
    },
    centerWrap: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
    },
    pulseRing: {
        position: "absolute",
        width: 360,
        height: 360,
        borderRadius: 180,
        borderWidth: 1,
        borderColor: "rgba(231,196,106,0.32)",
        backgroundColor: "rgba(231,196,106,0.04)",
    },
    heroCard: {
        width: "100%",
        maxWidth: 440,
        borderRadius: 30,
        paddingVertical: 26,
        paddingHorizontal: 22,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(231,196,106,0.22)",
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
        overflow: Platform.OS === "android" ? "hidden" : "visible",
        alignItems: "center",
    },
    smallPill: {
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.30)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        marginBottom: 14,
    },
    smallPillText: {
        fontSize: 12,
        color: "rgba(244,246,250,0.75)",
        letterSpacing: 1.1,
    },
    iconWrap: {
        width: 152,
        height: 152,
        borderRadius: 76,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(231,196,106,0.08)",
        borderWidth: 1,
        borderColor: "rgba(231,196,106,0.28)",
        marginBottom: 14,
    },
    big: {
        fontSize: 34,
        color: "#F4F6FA",
        textAlign: "center",
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    hole: {
        fontSize: 16,
        color: "rgba(244,246,250,0.78)",
        textAlign: "center",
        letterSpacing: 0.2,
        marginBottom: 10,
    },
    caption: {
        fontSize: 14,
        color: "rgba(244,246,250,0.64)",
        textAlign: "center",
        lineHeight: 20,
    },
    footerHint: {
        marginTop: 18,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: "rgba(0,0,0,0.28)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    footerHintText: {
        fontSize: 12,
        color: "rgba(244,246,250,0.72)",
        letterSpacing: 0.3,
    },
    sweep: {
        position: "absolute",
        top: -40,
        bottom: -40,
        width: 120,
        backgroundColor: "rgba(255,255,255,0.06)",
        transform: [{ rotate: "18deg" }],
        borderRadius: 40,
    },
    floorWrap: {
        height: 56,
        alignItems: "center",
        justifyContent: "center",
    },
    floorLine: {
        width: "70%",
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
    },
    floorGlow: {
        marginTop: -1,
        width: "70%",
        height: 18,
        backgroundColor: "rgba(231,196,106,0.08)",
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 18,
    },
});
