// src/screens/TournamentSideGameSplashScreen.js
import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ROUTES from "../navigation/routes";

function labelForSideGame(key) {
    const k = String(key || "").toUpperCase();
    if (k.includes("LONG")) return { title: "LONG DRIVE", sub: "Let it rip. Fairway first." };
    if (k.includes("KP") || k.includes("CLOSE")) return { title: "CLOSEST TO PIN", sub: "Dial it in. Stick it close." };
    if (k.includes("SECOND")) return { title: "2ND SHOT KP", sub: "Precision wins. Land it tight." };
    return { title: "SIDE GAME", sub: "Special scoring is active on this hole." };
}

function iconForSideGame(key) {
    const k = String(key || "").toUpperCase();
    if (k.includes("LONG")) return "🏌️‍♂️";
    if (k.includes("KP") || k.includes("CLOSE")) return "⛳️";
    if (k.includes("SECOND")) return "🎯";
    return "⭐";
}

export default function TournamentSideGameSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();

    const tournamentId = String(route?.params?.tournamentId || "");
    const roundNumber = Number(route?.params?.roundNumber || 1);
    const sideGameKey = String(route?.params?.sideGameKey || "LONG_DRIVE");
    const holeNumber = Number(route?.params?.holeNumber || 1);

    const ms = Number(route?.params?.ms || 4200);

    const fade = useRef(new Animated.Value(0)).current;
    const zoom = useRef(new Animated.Value(0.08)).current;
    const pop = useRef(new Animated.Value(0.86)).current;
    const sweep = useRef(new Animated.Value(0)).current;

    const sweepX = useMemo(() => {
        return sweep.interpolate({
            inputRange: [0, 1],
            outputRange: [-240, 300],
        });
    }, [sweep]);

    const { title, sub } = useMemo(() => labelForSideGame(sideGameKey), [sideGameKey]);
    const icon = useMemo(() => iconForSideGame(sideGameKey), [sideGameKey]);

    const heroMinHeight = useMemo(() => {
        const h = Dimensions.get("window").height;
        // push the card to fill more of the screen
        return Math.max(520, Math.floor(h * 0.72));
    }, []);

    const bigIconSize = useMemo(() => {
        // make LONG DRIVE noticeably bigger than the others
        const k = String(sideGameKey || "").toUpperCase();
        if (k.includes("LONG")) return 92;
        return 74;
    }, [sideGameKey]);

    useEffect(() => {
        const intro = Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(zoom, { toValue: 1.10, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(zoom, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(pop, { toValue: 1.04, duration: 560, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
        ]);

        const sweepLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(sweep, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            ])
        );

        intro.start();
        sweepLoop.start();

        const t = setTimeout(() => {
            // keep behavior dev-safe for now (no writes). We’ll decide the “real next screen” next.
            navigation.replace(ROUTES.TOURNAMENT_LIVE_HUB, { tournamentId, roundNumber, holeNumber, sideGameKey, devPreview: true });
        }, Math.max(900, ms));

        return () => {
            clearTimeout(t);
            intro.stop();
            sweepLoop.stop();
        };
    }, [fade, zoom, pop, sweep, navigation, ms, tournamentId, roundNumber, holeNumber, sideGameKey]);

    return (
        <View style={[styles.root, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) }]}>
            {/* golf/green mood background */}
            <View style={styles.bgGlowGold} pointerEvents="none" />
            <View style={styles.bgGlowBlue} pointerEvents="none" />
            <View style={styles.bgGreenLeft} pointerEvents="none" />
            <View style={styles.bgGreenRight} pointerEvents="none" />

            <Animated.View style={[styles.center, { opacity: fade }]}>
                <Animated.View style={[styles.hero, { minHeight: heroMinHeight, transform: [{ scale: zoom }] }]}>
                    <View style={styles.ringOuter} />
                    <View style={styles.ringInner} />

                    <Animated.View style={[styles.iconWrap, { transform: [{ scale: pop }] }]}>
                        <Text style={[styles.icon, { fontSize: bigIconSize }]}>{icon}</Text>
                    </Animated.View>

                    <Text style={styles.kicker}>HOLE {holeNumber}</Text>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.sub}>{sub}</Text>

                    <View style={styles.badgesRow}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>ROUND {roundNumber}</Text>
                        </View>
                        <View style={styles.badgeGold}>
                            <Text style={styles.badgeText}>SPECIAL SCORING</Text>
                        </View>
                    </View>

                    <Text style={styles.note}>Auto continuing…</Text>

                    <Animated.View style={[styles.sweep, { transform: [{ translateX: sweepX }, { rotate: "-18deg" }] }]} pointerEvents="none" />
                </Animated.View>
            </Animated.View>
        </View>
    );
}

const BG = "#071017";
const TEXT = "#EAF2FF";
const CARD = "#0B151E";
const GOLD = "rgba(201,162,74,0.95)";
const GOLD_RING = "rgba(201,162,74,0.65)";
const BLUE_GLOW = "rgba(46,125,255,0.12)";

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: BG,
        alignItems: "center",
        justifyContent: "center",
    },

    bgGlowGold: {
        position: "absolute",
        width: 680,
        height: 680,
        borderRadius: 680,
        backgroundColor: "rgba(201,162,74,0.16)",
        top: -220,
        right: -220,
    },
    bgGlowBlue: {
        position: "absolute",
        width: 680,
        height: 680,
        borderRadius: 680,
        backgroundColor: BLUE_GLOW,
        bottom: -220,
        left: -220,
    },

    bgGreenLeft: {
        position: "absolute",
        width: 520,
        height: 520,
        borderRadius: 520,
        backgroundColor: "rgba(26, 182, 108, 0.10)",
        top: 40,
        left: -220,
    },
    bgGreenRight: {
        position: "absolute",
        width: 520,
        height: 520,
        borderRadius: 520,
        backgroundColor: "rgba(26, 182, 108, 0.08)",
        bottom: 40,
        right: -220,
    },

    center: {
        width: "100%",
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
    },

    hero: {
        width: "100%",
        maxWidth: 560,
        borderRadius: 28,
        paddingVertical: 34,
        paddingHorizontal: 18,
        backgroundColor: CARD,
        borderWidth: 2,
        borderColor: GOLD_RING,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 16 },
        elevation: 10,
    },

    ringOuter: {
        position: "absolute",
        width: 420,
        height: 420,
        borderRadius: 420,
        borderWidth: 2,
        borderColor: "rgba(201,162,74,0.28)",
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    ringInner: {
        position: "absolute",
        width: 300,
        height: 300,
        borderRadius: 300,
        borderWidth: 1,
        borderColor: "rgba(234,242,255,0.10)",
        backgroundColor: "rgba(201,162,74,0.10)",
    },

    iconWrap: {
        width: 190,
        height: 190,
        borderRadius: 190,
        backgroundColor: "rgba(255,255,255,0.03)",
        borderWidth: 2,
        borderColor: GOLD,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 18,
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 8,
    },
    icon: { color: TEXT },

    kicker: {
        color: "rgba(234,242,255,0.80)",
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 3.2,
        textAlign: "center",
    },
    title: {
        marginTop: 10,
        color: TEXT,
        fontSize: 34,
        fontWeight: "900",
        letterSpacing: 0.8,
        textAlign: "center",
    },
    sub: {
        marginTop: 12,
        color: "rgba(234,242,255,0.74)",
        fontSize: 13,
        fontWeight: "800",
        lineHeight: 19,
        textAlign: "center",
        paddingHorizontal: 12,
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

    sweep: {
        position: "absolute",
        top: -60,
        width: 140,
        height: 640,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 18,
    },
});
