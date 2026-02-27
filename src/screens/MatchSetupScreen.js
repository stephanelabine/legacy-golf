// src/screens/MatchSetupScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import ScreenHeader from "../components/ScreenHeader";
import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function safeArr(x) {
    return Array.isArray(x) ? x : [];
}

function playerId(p, idx) {
    const o = p || {};
    return String(o.id ?? o.playerId ?? o.uid ?? o._uid ?? idx ?? "").trim();
}

function playerName(p, idx) {
    const o = p || {};
    const s = String(o.name || o.displayName || o.fullName || `Player ${idx + 1}`).trim();
    return s || `Player ${idx + 1}`;
}

function buildRoundRobinMatches(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            out.push({
                id: `rr_${ids[i]}_${ids[j]}`,
                leftIds: [ids[i]],
                rightIds: [ids[j]],
            });
        }
    }
    return out;
}

export default function MatchSetupScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const roundId = params?.roundId || null;

    const [roundDoc, setRoundDoc] = useState(null);
    const [saving, setSaving] = useState(false);

    const [matchType, setMatchType] = useState(null); // "1v1" | "one_vs_field" | "two_v_two" | "round_robin"

    const [pickA, setPickA] = useState(null); // for 1v1: player A; for one_vs_field: captain
    const [pickB, setPickB] = useState(null); // for 1v1: player B

    const [teamAIds, setTeamAIds] = useState([]); // for 2v2 (exactly 2)

    useEffect(() => {
        if (!roundId) return;

        const uid = auth?.currentUser?.uid || null;
        if (!uid) return;

        const ref = doc(db, "users", uid, "rounds", String(roundId));
        const unsub = onSnapshot(
            ref,
            (snap) => {
                setRoundDoc(snap?.exists() ? snap.data() : null);
            },
            () => setRoundDoc(null)
        );

        return () => unsub && unsub();
    }, [roundId]);

    const players = useMemo(() => safeArr(roundDoc?.players), [roundDoc]);
    const playerRows = useMemo(() => {
        return players.map((p, idx) => ({
            id: playerId(p, idx),
            name: playerName(p, idx),
        }));
    }, [players]);

    const gameId = String(roundDoc?.gameId || "");
    const gameTitle = String(roundDoc?.gameTitle || "Match Setup");
    const isMatchPlay = gameId === "match_play";

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    useEffect(() => {
        // Auto default type for Match Play when > 2 players: ask user (no auto)
        // For exactly 2 players, default to 1v1 and preselect both.
        if (!isMatchPlay) return;
        if (!playerRows.length) return;

        if (playerRows.length === 2) {
            setMatchType("1v1");
            setPickA(playerRows[0].id);
            setPickB(playerRows[1].id);
        }
    }, [isMatchPlay, playerRows]);

    const toggleTeamA = useCallback(
        (pid) => {
            setTeamAIds((prev) => {
                const s = new Set(prev.map(String));
                const key = String(pid);
                if (s.has(key)) s.delete(key);
                else s.add(key);
                return Array.from(s);
            });
        },
        [setTeamAIds]
    );

    const canSave = useMemo(() => {
        if (!isMatchPlay) return false;
        if (!matchType) return false;

        const n = playerRows.length;

        if (matchType === "1v1") {
            return !!pickA && !!pickB && String(pickA) !== String(pickB) && n >= 2;
        }

        if (matchType === "one_vs_field") {
            return !!pickA && n >= 3;
        }

        if (matchType === "two_v_two") {
            // v1: require exactly 4 players and exactly 2 selected for Team A
            return n === 4 && teamAIds.length === 2;
        }

        if (matchType === "round_robin") {
            return n >= 3;
        }

        return false;
    }, [isMatchPlay, matchType, pickA, pickB, playerRows.length, teamAIds.length]);

    async function saveMatchSetup() {
        if (!roundId) return;
        const uid = auth?.currentUser?.uid || null;
        if (!uid) {
            Alert.alert("Sign in required", "Please sign in to continue.");
            return;
        }
        if (!isMatchPlay) {
            Alert.alert("Not Match Play", "This setup is only for Match Play right now.");
            return;
        }
        if (!canSave) {
            Alert.alert("Finish setup", "Choose a match type and players/teams to continue.");
            return;
        }

        const ids = playerRows.map((p) => String(p.id)).filter(Boolean);

        let payload = null;

        if (matchType === "1v1") {
            payload = {
                type: "1v1",
                scoring: { basis: String(roundDoc?.scoring || "gross"), teamMode: null },
                matches: [
                    {
                        id: `m_${String(pickA)}_vs_${String(pickB)}`,
                        leftIds: [String(pickA)],
                        rightIds: [String(pickB)],
                    },
                ],
            };
        }

        if (matchType === "one_vs_field") {
            const captain = String(pickA);
            const others = ids.filter((x) => x !== captain);
            payload = {
                type: "one_vs_field",
                scoring: { basis: String(roundDoc?.scoring || "gross"), teamMode: null },
                captainId: captain,
                matches: others.map((opp) => ({
                    id: `m_${captain}_vs_${opp}`,
                    leftIds: [captain],
                    rightIds: [String(opp)],
                })),
            };
        }

        if (matchType === "two_v_two") {
            const aIds = teamAIds.map(String);
            const bIds = ids.filter((x) => !aIds.includes(String(x)));

            payload = {
                type: "two_v_two",
                scoring: { basis: String(roundDoc?.scoring || "gross"), teamMode: "best_ball" },
                teamAIds: aIds,
                teamBIds: bIds,
                matches: [
                    {
                        id: `m_teamA_vs_teamB`,
                        leftIds: aIds,
                        rightIds: bIds,
                    },
                ],
            };
        }

        if (matchType === "round_robin") {
            payload = {
                type: "round_robin",
                scoring: { basis: String(roundDoc?.scoring || "gross"), teamMode: null },
                matches: buildRoundRobinMatches(ids),
            };
        }

        if (!payload) {
            Alert.alert("Setup error", "Could not build match setup.");
            return;
        }

        try {
            setSaving(true);

            const ref = doc(db, "users", uid, "rounds", String(roundId));
            await setDoc(
                ref,
                {
                    matchPlay: payload,
                    matchPlayUpdatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            navigation.replace(ROUTES.GAME_ROUND_BRIEFING, { roundId });
        } catch (e) {
            Alert.alert("Save failed", e?.message || "Could not save match setup.");
        } finally {
            setSaving(false);
        }
    }

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";
        const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
        const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";
        const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
        const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";
        const red = isDark ? "rgba(220,52,52,0.92)" : "rgba(190,40,40,0.92)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
                marginBottom: 12,
            },
            cardOn: { borderColor: greenRing, backgroundColor: greenBg },
            cardPremium: { borderColor: goldBorder, backgroundColor: goldBg },

            sectionTitle: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.75,
                textTransform: "uppercase",
                marginTop: 4,
                marginBottom: 10,
            },

            row: {
                borderRadius: 16,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.55)",
                paddingVertical: 12,
                paddingHorizontal: 14,
                marginBottom: 10,
            },
            rowOn: { borderColor: greenRing, backgroundColor: greenBg },
            rowBad: { borderColor: red, backgroundColor: isDark ? "rgba(220,52,52,0.10)" : "rgba(190,40,40,0.08)" },

            title: { color: theme.text, fontSize: 16, fontWeight: "900" },
            sub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

            pill: {
                marginTop: 10,
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.72)",
            },
            pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.85 },

            footer: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 16,
                paddingBottom: footerPad,
                paddingTop: 12,
                backgroundColor: theme.bg,
                borderTopWidth: 1,
                borderTopColor: theme.divider,
            },

            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
            },
            primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

            pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
        });
    }, [theme, isDark, footerPad]);

    if (!roundId) {
        return (
            <View style={styles.screen}>
                <ScreenHeader navigation={navigation} title="Match Setup" subtitle="Missing round." />
            </View>
        );
    }

    const nPlayers = playerRows.length;

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Match Setup" subtitle={`Set the Match Play structure for ${gameTitle}.`} />

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>Match type</Text>

                <Pressable
                    onPress={() => setMatchType("1v1")}
                    style={({ pressed }) => [styles.card, matchType === "1v1" && styles.cardOn, pressed && styles.pressed]}
                >
                    <Text style={styles.title}>1v1</Text>
                    <Text style={styles.sub}>Pick two players. One match runs across the round.</Text>
                </Pressable>

                <Pressable
                    onPress={() => setMatchType("one_vs_field")}
                    style={({ pressed }) => [styles.card, matchType === "one_vs_field" && styles.cardOn, pressed && styles.pressed]}
                >
                    <Text style={styles.title}>1 vs Field</Text>
                    <Text style={styles.sub}>Pick one player. They play a match against every other player.</Text>
                </Pressable>

                <Pressable
                    onPress={() => setMatchType("two_v_two")}
                    style={({ pressed }) => [styles.card, matchType === "two_v_two" && styles.cardOn, pressed && styles.pressed]}
                >
                    <Text style={styles.title}>2v2</Text>
                    <Text style={styles.sub}>Two teams of two. Default team scoring: best ball match play.</Text>
                    {nPlayers !== 4 ? (
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>Requires exactly 4 players (current: {nPlayers})</Text>
                        </View>
                    ) : null}
                </Pressable>

                <Pressable
                    onPress={() => setMatchType("round_robin")}
                    style={({ pressed }) => [styles.card, matchType === "round_robin" && styles.cardOn, pressed && styles.pressed]}
                >
                    <Text style={styles.title}>Everyone vs Everyone</Text>
                    <Text style={styles.sub}>Round robin. All head-to-head matches run at once.</Text>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>Creates {nPlayers >= 2 ? (nPlayers * (nPlayers - 1)) / 2 : 0} matches</Text>
                    </View>
                </Pressable>

                {matchType === "1v1" ? (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Choose players</Text>

                        {playerRows.map((p) => {
                            const onA = String(pickA) === String(p.id);
                            const onB = String(pickB) === String(p.id);

                            return (
                                <View key={`p-${p.id}`} style={{ marginBottom: 10 }}>
                                    <Pressable
                                        onPress={() => setPickA(p.id)}
                                        style={({ pressed }) => [styles.row, onA && styles.rowOn, pressed && styles.pressed]}
                                    >
                                        <Text style={styles.title}>{p.name}</Text>
                                        <Text style={styles.sub}>Set as Player A</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setPickB(p.id)}
                                        style={({ pressed }) => [styles.row, onB && styles.rowOn, pressed && styles.pressed]}
                                    >
                                        <Text style={styles.title}>{p.name}</Text>
                                        <Text style={styles.sub}>Set as Player B</Text>
                                    </Pressable>
                                </View>
                            );
                        })}
                    </>
                ) : null}

                {matchType === "one_vs_field" ? (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Choose captain</Text>

                        {playerRows.map((p) => {
                            const on = String(pickA) === String(p.id);
                            return (
                                <Pressable
                                    key={`cap-${p.id}`}
                                    onPress={() => setPickA(p.id)}
                                    style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                                >
                                    <Text style={styles.title}>{p.name}</Text>
                                    <Text style={styles.sub}>Captain (plays every other player)</Text>
                                </Pressable>
                            );
                        })}
                    </>
                ) : null}

                {matchType === "two_v_two" ? (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Pick Team A (2 players)</Text>

                        {playerRows.map((p) => {
                            const on = teamAIds.map(String).includes(String(p.id));
                            const invalid = nPlayers !== 4;
                            const tooMany = on === false && teamAIds.length >= 2;
                            const showBad = invalid || tooMany;

                            return (
                                <Pressable
                                    key={`ta-${p.id}`}
                                    onPress={() => {
                                        if (nPlayers !== 4) return;
                                        if (!on && teamAIds.length >= 2) return;
                                        toggleTeamA(p.id);
                                    }}
                                    style={({ pressed }) => [styles.row, on && styles.rowOn, showBad && styles.rowBad, pressed && styles.pressed]}
                                >
                                    <Text style={styles.title}>{p.name}</Text>
                                    <Text style={styles.sub}>{on ? "Team A" : "Tap to add to Team A"}</Text>
                                </Pressable>
                            );
                        })}

                        {nPlayers === 4 ? (
                            <View style={styles.pill}>
                                <Text style={styles.pillText}>Team B will be the remaining 2 players</Text>
                            </View>
                        ) : null}
                    </>
                ) : null}

                {matchType === "round_robin" ? (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Summary</Text>
                        <View style={styles.cardPremium}>
                            <Text style={styles.title}>Round robin</Text>
                            <Text style={styles.sub}>
                                All players compete head-to-head simultaneously. Each pairing is tracked as its own match across the round.
                            </Text>
                        </View>
                    </>
                ) : null}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={saveMatchSetup}
                    disabled={!canSave || saving}
                    style={({ pressed }) => [styles.primaryBtn, pressed && !saving && styles.pressed, (!canSave || saving) && { opacity: 0.65 }]}
                >
                    <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Match Setup"}</Text>
                </Pressable>
            </View>
        </View>
    );
}