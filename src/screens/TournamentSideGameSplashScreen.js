// src/screens/TournamentSideGameSplashScreen.js
import React, { useEffect, useMemo, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
    ImageBackground,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ROUTES from "../navigation/routes";

function labelForSideGame(key) {
    const k = String(key || "").toUpperCase();
    if (k.includes("LONG")) return { title: "LONG DRIVE", sub: "Let it rip. Fairway first." };
    if (k.includes("SECOND")) return { title: "2ND SHOT KP", sub: "Precision wins. Land it tight." };
    if (k.includes("KP") || k.includes("CLOSE")) return { title: "CLOSEST TO PIN", sub: "Dial it in. Stick it close." };
    return { title: "SIDE GAME", sub: "Special scoring is active on this hole." };
}

function iconForSideGame(key) {
    const k = String(key || "").toUpperCase();
    if (k.includes("LONG")) return "🏌️‍♂️";
    if (k.includes("SECOND")) return "🎯";
    if (k.includes("KP") || k.includes("CLOSE")) return "⛳️";
    return "⭐";
}

export default function TournamentSideGameSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const p = route?.params || {};

    const tournamentId = String(p.tournamentId || "");
    const roundIndex = Number.isFinite(Number(p.roundIndex)) ? Number(p.roundIndex) : null;
    const holeIndex = Number.isFinite(Number(p.holeIndex)) ? Number(p.holeIndex) : null;

    // Accept both “new” and “old” param shapes (dev-safe)
    const roundNumber = Number.isFinite(Number(p.roundNumber))
        ? Number(p.roundNumber)
        : Number.isFinite(roundIndex)
            ? roundIndex + 1
            : 1;

    const holeNumber = Number.isFinite(Number(p.holeNumber))
        ? Number(p.holeNumber)
        : Number.isFinite(holeIndex)
            ? holeIndex + 1
            : 1;

    const sideGameKey = String(p.sideGameKey || "LONG_DRIVE");
    const ms = Number(p.ms || 4200);

    // Optional: background image (either a URI string or { uri })
    const bg = p?.bgImageUri ? { uri: String(p.bgImageUri) } : (p?.bgImage || null);

    const { title, sub } = useMemo(() => labelForSideGame(sideGameKey), [sideGameKey]);
    const icon = useMemo(() => iconForSideGame(sideGameKey), [sideGameKey]);

    const fade = useRef(new Animated.Value(0)).current;
    const zoom = useRef(new Animated.Value(0.92)).current;
    const pop = useRef(new Animated.Value(0.86)).current;
    const sweep = useRef(new Animated.Value(0)).current;

    const sweepX = useMemo(() => {
        return sweep.interpolate({
            inputRange: [0, 1],
            outputRange: [-260, 320],
        });
    }, [sweep]);

    useEffect(() => {
        const intro = Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(zoom, { toValue: 1.03, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(zoom, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(pop, { toValue: 1.04, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
            // Keep current dev flow stable for now
            const nextRoute = p.nextRoute;
            const nextParams = p.nextParams;

            if (nextRoute) {
                navigation.replace(nextRoute, { ...(nextParams || {}), tournamentId, roundIndex: roundNumber - 1, holeIndex: holeNumber - 1 });
                return;
            }

            navigation.replace(ROUTES.TOURNAMENT_PLAYER_BRIEFING, {
                tournamentId,
                roundIndex: roundNumber - 1,
                holeIndex: holeNumber - 1,
                sideGameKey,
                fromSideGameSplash: true,
            });
        }, Math.max(900, ms));

        return () => {
            clearTimeout(t);
            intro.stop();
            sweepLoop.stop();
        };
    }, [fade, zoom, pop, sweep, navigation, ms, tournamentId, roundNumber, holeNumber, sideGameKey, p.nextRoute, p.nextParams]);

    const Root = bg ? ImageBackground : View;
    const rootProps = bg ? { source: bg, resizeMode: "cover" } : {};

    return (
        <Root style={[styles.root, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 14) }]} {...rootProps}>
            {/* If there’s an image, add a cinematic dark overlay so text stays premium/legible */}
            <View style={styles.imageOverlay} pointerEvents="none" />

            {/* glows */}
            <View style={styles.bgGlowGold} pointerEvents="none" />
            <View style={styles.bgGlowBlue} pointerEvents="none" />

            <Animated.View style={[styles.center, { opacity: fade, transform: [{ scale: zoom }] }]}>
                <View style={styles.hero}>
                    <View style={styles.ringOuter} pointerEvents="none" />
                    <View style={styles.ringInner} pointerEvents="none" />

                    <Animated.View style={[styles.iconWrap, { transform: [{ scale: pop }] }]}>
                        <Text style={styles.icon}>{icon}</Text>
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
                </View>
            </Animated.View>
        </Root>
    );
}

const BG = "#071017";
const TEXT = "#EAF2FF";
const CARD = "rgba(11,21,30,0.92)";
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

    imageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(7,16,23,0.64)",
    },

    bgGlowGold: {
        position: "absolute",
        width: 760,
        height: 760,
        borderRadius: 760,
        backgroundColor: "rgba(201,162,74,0.18)",
        top: -260,
        right: -260,
    },
    bgGlowBlue: {
        position: "absolute",
        width: 760,
        height: 760,
        borderRadius: 760,
        backgroundColor: BLUE_GLOW,
        bottom: -260,
        left: -260,
    },

    center: {
        width: "100%",
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
    },

    // Fill more of the screen (premium / immersive)
    hero: {
        width: "100%",
        maxWidth: 560,
        minHeight: 520,
        borderRadius: 30,
        paddingVertical: 40,
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
        borderColor: "rgba(201,162,74,0.30)",
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

    // Bigger icon (your request)
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
    icon: { fontSize: 84 },

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
        paddingHorizontal: 10,
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
        height: 700,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 18,
    },
});
