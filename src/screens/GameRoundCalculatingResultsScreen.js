// src/screens/GameRoundCalculatingResultsScreen.js
import React, { useEffect, useRef } from "react";
import { SafeAreaView, View, Text, StyleSheet, Animated, Easing } from "react-native";
import { CommonActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import * as RoundState from "../storage/roundState";
import { saveRound } from "../storage/rounds";

const BG = "#0B1220";
const WHITE = "#FFFFFF";

const MIN_SPLASH_MS = 3000;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export default function GameRoundCalculatingResultsScreen({ navigation, route }) {
    const params = route?.params || {};
    const spin = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(spin, {
                toValue: 1,
                duration: 950,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();
        return () => loop.stop();
    }, [spin]);

    useEffect(() => {
        let alive = true;

        (async () => {
            const t0 = Date.now();

            try {
                const active = (await RoundState.loadActiveRound()) || {};

                const safePlayers = Array.isArray(active?.players) && active.players.length ? active.players : params.players || [];
                const safeCourse = active?.course || params.course || null;
                const safeTee = active?.tee || params.tee || null;
                const safeHoles = active?.holes || {};

                const safeWagers = active?.wagers || params?.wagers || null;
                const safeMeta = active?.meta && typeof active.meta === "object" ? active.meta : {};
                const holeMeta = params?.holeMeta || safeMeta?.holeMeta || null;
                const mergedMeta = holeMeta ? { ...safeMeta, holeMeta } : { ...safeMeta };

                const id = String(active?.id || active?.roundId || params?.roundId || `r_${Date.now()}`);

                const payload = {
                    id,
                    courseName: String(safeCourse?.name || params?.courseName || "Course"),
                    teeName: String(safeTee?.name || params?.teeName || "Tees"),
                    course: safeCourse,
                    tee: safeTee,
                    players: safePlayers,
                    holes: safeHoles,
                    wagers: safeWagers,
                    meta: mergedMeta,
                    playedAt: active?.playedAt || active?.startedAt || new Date().toISOString(),
                    startedAt: active?.startedAt || new Date().toISOString(),
                    status: "completed",
                    currentHole: active?.currentHole ?? active?.holeNumber ?? active?.hole ?? active?.lastHole ?? 1,
                    lastHole: active?.lastHole ?? active?.currentHole ?? active?.holeNumber ?? active?.hole ?? 1,
                };

                await saveRound(payload);

                try {
                    await RoundState.clearActiveRoundEverywhere();
                } catch { }

                const elapsed = Date.now() - t0;
                const remain = Math.max(0, MIN_SPLASH_MS - elapsed);
                await sleep(remain);

                if (!alive) return;

                navigation.dispatch(
                    CommonActions.navigate({
                        name: ROUTES.FINAL_RESULTS,
                        params: {
                            roundId: id,
                            course: payload.course,
                            tee: payload.tee,
                            players: payload.players,
                            holeMeta: mergedMeta?.holeMeta || holeMeta || null,
                            wagers: payload.wagers || null,
                            courseName: payload.courseName,
                            teeName: payload.teeName,
                        },
                        merge: true,
                    })
                );
            } catch {
                const elapsed = Date.now() - t0;
                const remain = Math.max(0, MIN_SPLASH_MS - elapsed);
                await sleep(remain);

                if (!alive) return;
                navigation.goBack();
            }
        })();

        return () => {
            alive = false;
        };
    }, [navigation, params]);

    const rot = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.card}>
                <Animated.View style={[styles.ring, { transform: [{ rotate: rot }] }]} />
                <Text style={styles.title}>Calculating Results</Text>
                <Text style={styles.sub}>Hang tight — building the leaderboard.</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 18 },

    card: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 26,
        padding: 18,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
    },

    ring: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 6,
        borderColor: "rgba(255,255,255,0.14)",
        borderTopColor: "rgba(46,125,255,0.95)",
        marginBottom: 16,
    },

    title: { color: WHITE, fontSize: 18, fontWeight: "900", letterSpacing: 0.4 },
    sub: { marginTop: 10, color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: "800", textAlign: "center" },
});
