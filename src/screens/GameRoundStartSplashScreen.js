// src/screens/GameRoundStartSplashScreen.js
import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import { auth, db } from "../firebase/firebase";

function safeArr(v) {
    return Array.isArray(v) ? v : [];
}

function safeObj(v) {
    return v && typeof v === "object" ? v : {};
}

function normKey(x) {
    return String(x || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, "");
}

function detectFormatTypeLikeTournament(f) {
    const k = normKey(f?.key || f?.id);
    const n = normKey(f?.name);
    const s = `${k} ${n}`.trim();

    const isSecondShot =
        s.includes("secondshotkp") ||
        s.includes("secondshot") ||
        (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
        s.includes("2ndshotkp") ||
        (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

    if (isSecondShot) return "secondshotkp";
    if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";
    if (s.includes("kp") || s.includes("closesttopin") || (s.includes("closest") && s.includes("pin"))) return "kp";
    return "unknown";
}

function mapTypeToSideGameKey(type) {
    if (type === "longdrive") return "long_drive";
    if (type === "secondshotkp") return "second_shot_kp";
    if (type === "kp") return "kp";
    return "";
}

function extractSelectedFormats(roundDoc) {
    return safeArr(roundDoc?.formatsSelected)
        .map((x) => {
            if (typeof x === "string") return { key: x, name: x };
            return { key: x?.key || x?.id || "", name: x?.name || x?.label || x?.title || x?.key || x?.id || "Format" };
        })
        .filter((f) => String(f.key || "").trim());
}

function buildConfigKeyMap(formatConfig) {
    const cfg = safeObj(formatConfig);
    const out = {};
    Object.keys(cfg).forEach((k) => {
        out[normKey(k)] = k;
    });
    return out;
}

function findHole1SideGame(roundDoc) {
    const selected = extractSelectedFormats(roundDoc);
    const formatConfig = safeObj(roundDoc?.formatConfig);
    const cfgKeyMap = buildConfigKeyMap(formatConfig);

    for (const f of selected) {
        const rawKey = String(f?.key || "").trim();
        const rawNorm = normKey(rawKey);
        const cfgKey = formatConfig?.[rawKey] ? rawKey : (cfgKeyMap?.[rawNorm] || null);
        const cfg = cfgKey ? safeObj(formatConfig?.[cfgKey]) : {};

        const holes = safeArr(cfg?.holes).map((n) => Number(n)).filter((n) => Number.isFinite(n));
        const hasHole1 = holes.includes(1);
        if (!hasHole1) continue;

        const type = detectFormatTypeLikeTournament({ key: rawKey, name: f?.name });
        const sideGameKey = mapTypeToSideGameKey(type);
        if (sideGameKey) return sideGameKey;
    }

    return "";
}

export default function GameRoundStartSplashScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();

    const roundId = String(route?.params?.roundId || "");
    const ms = Number(route?.params?.ms || 3000);

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
        if (!roundId) {
            Alert.alert("Missing round", "roundId was not provided.");
            navigation.goBack();
            return;
        }

        const intro = Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
            Animated.timing(rotate, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(zoom, { toValue: 1.06, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
                Animated.timing(zoom, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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

        let cancelled = false;

        const t = setTimeout(async () => {
            try {
                const uid = auth?.currentUser?.uid || null;
                if (!uid) throw new Error("Not signed in.");

                const ref = doc(db, "users", uid, "rounds", String(roundId));
                const snap = await getDoc(ref);
                const roundDoc = snap.exists() ? (snap.data() || {}) : {};

                const sideGameKey = findHole1SideGame(roundDoc);
                const showFormatSplash = !!sideGameKey;

                if (cancelled) return;

                navigation.replace(ROUTES.HOLE_HUB, {
                    roundId,
                    hole: 1,
                    holeIndex: 0,
                    startHole: 1,
                    currentHole: 1,
                    roundNumber: 1,

                    showFormatSplash,
                    sideGameKey: sideGameKey || null,
                });
            } catch (e) {
                if (cancelled) return;
                Alert.alert("Start error", e?.message || "Could not start the round.");
                navigation.goBack();
            }
        }, Math.max(500, ms));

        return () => {
            cancelled = true;
            clearTimeout(t);
            intro.stop();
            shimmerLoop.stop();
        };
    }, [fade, zoom, rotate, shimmer, navigation, ms, roundId]);

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

                    <Text style={styles.title}>ROUND</Text>
                    <Text style={styles.subtitle}>STARTED</Text>

                    <View style={styles.badgesRow}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>LEGACY GAME</Text>
                        </View>
                        <View style={styles.badgeGold}>
                            <Text style={styles.badgeText}>GOOD LUCK</Text>
                        </View>
                    </View>

                    <Text style={styles.note}>Loading Hole 1…</Text>

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