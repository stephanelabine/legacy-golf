import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";

export default function TournamentRoundStartSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params.tournamentId || null;
    const roundIndex = Number.isFinite(Number(params.roundIndex)) ? Number(params.roundIndex) : 0;
    const holeIndex = Number.isFinite(Number(params.holeIndex)) ? Number(params.holeIndex) : 0;

    // sideGameKey can be decided upstream; default to LONG_DRIVE for now (dev-friendly)
    const sideGameKey = String(params.sideGameKey || "LONG_DRIVE");

    const title = useMemo(() => {
        const roundNum = roundIndex + 1;
        return `Round ${roundNum} started`;
    }, [roundIndex]);

    const subtitle = useMemo(() => {
        const holeNum = holeIndex + 1;
        return `Get ready for Hole ${holeNum}`;
    }, [holeIndex]);

    const zoom = useRef(new Animated.Value(0)).current;
    const spin = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const zoomAnim = Animated.timing(zoom, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });

        const spinAnim = Animated.timing(spin, {
            toValue: 1,
            duration: 1400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        });

        const glowLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(glow, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        glowLoop.start();
        Animated.parallel([zoomAnim, spinAnim]).start();

        const t = setTimeout(() => {
            navigation.replace(ROUTES.TOURNAMENT_SIDEGAME_SPLASH, {
                tournamentId,
                roundIndex,
                holeIndex,
                sideGameKey,
                // Optional: let side splash know where to go next later.
                nextRoute: params.nextRoute || null,
                nextParams: params.nextParams || null,
            });
        }, 3000);

        return () => {
            clearTimeout(t);
            glowLoop.stop();
        };
    }, [navigation, zoom, spin, glow, tournamentId, roundIndex, holeIndex, sideGameKey, params.nextRoute, params.nextParams]);

    const trophyScale = zoom.interpolate({
        inputRange: [0, 1],
        outputRange: [0.18, 1],
    });

    const trophyTranslateY = zoom.interpolate({
        inputRange: [0, 1],
        outputRange: [120, 0],
    });

    const trophyRotate = spin.interpolate({
        inputRange: [0, 1],
        outputRange: ["-16deg", "0deg"],
    });

    const glowOpacity = glow.interpolate({
        inputRange: [0, 1],
        outputRange: [0.28, 0.6],
    });

    const ringScale = glow.interpolate({
        inputRange: [0, 1],
        outputRange: [0.92, 1.08],
    });

    return (
        <View style={[styles.root, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
            {/* cinematic background layers (no new libs) */}
            <View style={styles.bgBase} />
            <View style={styles.bgVignette} />
            <View style={styles.bgTopGlow} />

            <View style={styles.centerWrap}>
                <Animated.View style={[styles.ring, { opacity: glowOpacity, transform: [{ scale: ringScale }] }]} />
                <Animated.View
                    style={[
                        styles.heroCard,
                        {
                            transform: [
                                { translateY: trophyTranslateY },
                                { scale: trophyScale },
                                { rotate: trophyRotate },
                            ],
                            opacity: zoom,
                        },
                    ]}
                >
                    <View style={styles.iconWrap}>
                        <Ionicons name="trophy" size={94} color="#E7C46A" />
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>{subtitle}</Text>

                    <View style={styles.footerHint}>
                        <Text style={styles.footerHintText}>Legacy Tournament</Text>
                    </View>
                </Animated.View>
            </View>

            {/* subtle bottom “floor” shine */}
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
    ring: {
        position: "absolute",
        width: 340,
        height: 340,
        borderRadius: 170,
        borderWidth: 1,
        borderColor: "rgba(231,196,106,0.34)",
        backgroundColor: "rgba(231,196,106,0.04)",
    },
    heroCard: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 28,
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
    iconWrap: {
        width: 140,
        height: 140,
        borderRadius: 70,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(231,196,106,0.08)",
        borderWidth: 1,
        borderColor: "rgba(231,196,106,0.28)",
        marginBottom: 18,
    },
    title: {
        fontSize: 30,
        color: "#F4F6FA",
        textAlign: "center",
        letterSpacing: 0.2,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 16,
        color: "rgba(244,246,250,0.75)",
        textAlign: "center",
        letterSpacing: 0.2,
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
        letterSpacing: 0.9,
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
