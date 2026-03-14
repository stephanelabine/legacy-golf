// src/screens/RyderCupTeamsScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function toNumber(value) {
    const n = Number(String(value || "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function buildBalancedTeams(players) {
    const sorted = [...players].sort((a, b) => toNumber(a.handicap) - toNumber(b.handicap));
    const teamA = [];
    const teamB = [];
    let totalA = 0;
    let totalB = 0;

    sorted.forEach((player) => {
        const hdcp = toNumber(player.handicap);
        if (totalA <= totalB) {
            teamA.push(player);
            totalA += hdcp;
        } else {
            teamB.push(player);
            totalB += hdcp;
        }
    });

    return { teamA, teamB };
}

export default function RyderCupTeamsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const eventId = String(route?.params?.eventId || "").trim();
    const eventName = String(route?.params?.eventName || "").trim();
    const inviteCode = String(route?.params?.inviteCode || "").trim();
    const organizerName = String(route?.params?.organizerName || "").trim();
    const organizerEmail = String(route?.params?.organizerEmail || "").trim();
    const organizerPhone = String(route?.params?.organizerPhone || "").trim();
    const organizerHandicap = String(route?.params?.organizerHandicap || "").trim();
    const status = String(route?.params?.status || "setup").trim();
    const courseMode = String(route?.params?.courseMode || "single").trim();
    const teeMode = String(route?.params?.teeMode || "single").trim();
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];
    const players = Array.isArray(route?.params?.players) ? route.params.players : [];

    const [teamAName, setTeamAName] = useState("Team A");
    const [teamBName, setTeamBName] = useState("Team B");
    const [teamA, setTeamA] = useState([]);
    const [teamB, setTeamB] = useState([]);

    const assignedIds = new Set([...teamA, ...teamB].map((p) => p.id));
    const unassignedPlayers = players.filter((p) => !assignedIds.has(p.id));

    const canAutoGenerate = players.length >= 2;
    const canContinue = teamA.length > 0 && teamB.length > 0 && unassignedPlayers.length === 0;

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function autoGenerateTeams() {
        if (!canAutoGenerate) return;
        const balanced = buildBalancedTeams(players);
        setTeamA(balanced.teamA);
        setTeamB(balanced.teamB);
    }

    function assignPlayer(player, teamKey) {
        setTeamA((prev) => prev.filter((p) => p.id !== player.id));
        setTeamB((prev) => prev.filter((p) => p.id !== player.id));

        if (teamKey === "A") {
            setTeamA((prev) => [...prev, player]);
        } else {
            setTeamB((prev) => [...prev, player]);
        }
    }

    function removePlayer(playerId) {
        setTeamA((prev) => prev.filter((p) => p.id !== playerId));
        setTeamB((prev) => prev.filter((p) => p.id !== playerId));
    }

    function teamTotal(team) {
        return team.reduce((sum, player) => sum + toNumber(player.handicap), 0);
    }

    function teamAverage(team) {
        if (!team.length) return 0;
        return teamTotal(team) / team.length;
    }

    const styles = useMemo(() => {
        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },

            content: {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 140,
            },

            heroCard: {
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: "rgba(140,175,255,0.78)",
                backgroundColor: "rgba(40,68,145,0.28)",
            },

            heroTitle: {
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: "900",
            },

            heroSub: {
                marginTop: 8,
                color: "rgba(255,255,255,0.86)",
                fontSize: 14,
                fontWeight: "700",
                lineHeight: 20,
            },

            section: {
                marginTop: 16,
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
            },

            sectionTitle: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.1,
                textTransform: "uppercase",
                opacity: 0.82,
            },

            helper: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            row: {
                flexDirection: "row",
                gap: 12,
                marginTop: 14,
            },

            teamCard: {
                flex: 1,
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            teamCardBlue: {
                borderColor: "rgba(140,175,255,0.78)",
                backgroundColor: "rgba(40,68,145,0.18)",
            },

            teamCardRed: {
                borderColor: "rgba(220,92,92,0.70)",
                backgroundColor: "rgba(108,42,64,0.18)",
            },

            teamName: {
                color: theme.text,
                fontSize: 18,
                fontWeight: "900",
            },

            teamMeta: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            actionBtn: {
                marginTop: 14,
                height: 48,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "rgba(255,210,92,0.92)" : "rgba(255,210,92,1)",
            },

            actionBtnText: {
                color: "rgba(10,15,26,0.92)",
                fontSize: 14,
                fontWeight: "900",
                letterSpacing: 0.3,
            },

            playerCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            playerName: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            playerMeta: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
            },

            assignRow: {
                flexDirection: "row",
                gap: 10,
                marginTop: 12,
            },

            assignBtn: {
                flex: 1,
                minHeight: 42,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
            },

            assignBtnBlue: {
                borderColor: "rgba(140,175,255,0.78)",
                backgroundColor: "rgba(40,68,145,0.18)",
            },

            assignBtnRed: {
                borderColor: "rgba(220,92,92,0.70)",
                backgroundColor: "rgba(108,42,64,0.18)",
            },

            assignText: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
            },

            removeBtn: {
                marginTop: 10,
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
            },

            removeText: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
            },

            footer: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: footerPad,
                backgroundColor: theme.bg,
                borderTopWidth: 1,
                borderTopColor: theme.divider,
            },

            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: canContinue
                    ? (isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)")
                    : (isDark ? "rgba(255,255,255,0.10)" : "rgba(10,15,26,0.08)"),
                borderWidth: canContinue ? 0 : 1,
                borderColor: canContinue ? "transparent" : theme.border,
            },

            primaryBtnDisabled: {
                opacity: 0.72,
            },

            primaryText: {
                color: canContinue ? "#FFFFFF" : theme.text,
                opacity: canContinue ? 1 : 0.48,
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: 0.3,
            },

            pressed: {
                opacity: 0.92,
                transform: [{ scale: 0.99 }],
            },
        });
    }, [theme, isDark, footerPad, canContinue]);

    function onContinue() {
        if (!canContinue) return;

        navigation.navigate(ROUTES.RYDER_CUP_BRIEFING, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status,
            courseMode,
            teeMode,
            sessions,
            players,
            teamAName,
            teamBName,
            teamA,
            teamB,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Teams"
                subtitle="Build the two Ryder Cup teams from your player roster."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Team Setup</Text>
                    <Text style={styles.heroSub}>
                        Auto-generate balanced teams by handicap or manually assign each player to one side.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Teams</Text>

                    <View style={styles.row}>
                        <View style={[styles.teamCard, styles.teamCardBlue]}>
                            <Text style={styles.teamName}>{teamAName}</Text>
                            <Text style={styles.teamMeta}>
                                {`${teamA.length} players • total hdcp ${teamTotal(teamA).toFixed(1)} • avg ${teamAverage(teamA).toFixed(1)}`}
                            </Text>
                        </View>

                        <View style={[styles.teamCard, styles.teamCardRed]}>
                            <Text style={styles.teamName}>{teamBName}</Text>
                            <Text style={styles.teamMeta}>
                                {`${teamB.length} players • total hdcp ${teamTotal(teamB).toFixed(1)} • avg ${teamAverage(teamB).toFixed(1)}`}
                            </Text>
                        </View>
                    </View>

                    <Pressable onPress={autoGenerateTeams} disabled={!canAutoGenerate} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
                        <Text style={styles.actionBtnText}>Auto-Generate Teams</Text>
                    </Pressable>

                    <Text style={styles.helper}>
                        Assign every player to one team before continuing.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Unassigned Players</Text>

                    {unassignedPlayers.length === 0 ? (
                        <Text style={styles.helper}>All players are assigned.</Text>
                    ) : (
                        unassignedPlayers.map((player) => (
                            <View key={player.id} style={styles.playerCard}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerMeta}>{player.handicap ? `Hdcp ${player.handicap}` : "No handicap"}</Text>

                                <View style={styles.assignRow}>
                                    <Pressable onPress={() => assignPlayer(player, "A")} style={({ pressed }) => [styles.assignBtn, styles.assignBtnBlue, pressed && styles.pressed]}>
                                        <Text style={styles.assignText}>{`Add to ${teamAName}`}</Text>
                                    </Pressable>

                                    <Pressable onPress={() => assignPlayer(player, "B")} style={({ pressed }) => [styles.assignBtn, styles.assignBtnRed, pressed && styles.pressed]}>
                                        <Text style={styles.assignText}>{`Add to ${teamBName}`}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{teamAName}</Text>

                    {teamA.length === 0 ? (
                        <Text style={styles.helper}>No players assigned yet.</Text>
                    ) : (
                        teamA.map((player) => (
                            <View key={player.id} style={styles.playerCard}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerMeta}>{player.handicap ? `Hdcp ${player.handicap}` : "No handicap"}</Text>
                                <Pressable onPress={() => removePlayer(player.id)} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
                                    <Text style={styles.removeText}>Remove</Text>
                                </Pressable>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{teamBName}</Text>

                    {teamB.length === 0 ? (
                        <Text style={styles.helper}>No players assigned yet.</Text>
                    ) : (
                        teamB.map((player) => (
                            <View key={player.id} style={styles.playerCard}>
                                <Text style={styles.playerName}>{player.name}</Text>
                                <Text style={styles.playerMeta}>{player.handicap ? `Hdcp ${player.handicap}` : "No handicap"}</Text>
                                <Pressable onPress={() => removePlayer(player.id)} style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}>
                                    <Text style={styles.removeText}>Remove</Text>
                                </Pressable>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={onContinue}
                    disabled={!canContinue}
                    style={({ pressed }) => [
                        styles.primaryBtn,
                        !canContinue && styles.primaryBtnDisabled,
                        pressed && canContinue && styles.pressed,
                    ]}
                >
                    <Text style={styles.primaryText}>Continue to Briefing</Text>
                </Pressable>
            </View>
        </View>
    );
}