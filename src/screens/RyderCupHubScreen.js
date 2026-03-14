// src/screens/RyderCupHubScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function formatLabel(type) {
    if (type === "foursomes") return "Foursomes";
    if (type === "fourball") return "Four-Ball";
    if (type === "singles") return "Singles";
    return "Session";
}

export default function RyderCupHubScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const eventId = String(route?.params?.eventId || "").trim();
    const eventName = String(route?.params?.eventName || "").trim();
    const inviteCode = String(route?.params?.inviteCode || "").trim();
    const organizerName = String(route?.params?.organizerName || "").trim();
    const status = String(route?.params?.status || "ready").trim();
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];
    const players = Array.isArray(route?.params?.players) ? route.params.players : [];
    const teamAName = String(route?.params?.teamAName || "Team A").trim();
    const teamBName = String(route?.params?.teamBName || "Team B").trim();
    const teamA = Array.isArray(route?.params?.teamA) ? route.params.teamA : [];
    const teamB = Array.isArray(route?.params?.teamB) ? route.params.teamB : [];
    const teamAPoints = Number(route?.params?.teamAPoints || 0);
    const teamBPoints = Number(route?.params?.teamBPoints || 0);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);
    const nextSession = sessions[0] || null;

    const styles = useMemo(() => {
        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },

            content: {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: footerPad + 24,
            },

            heroCard: {
                borderRadius: 22,
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

            scoreRow: {
                flexDirection: "row",
                alignItems: "stretch",
                gap: 12,
                marginTop: 16,
            },

            scoreCard: {
                flex: 1,
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
            },

            scoreCardBlue: {
                borderColor: "rgba(140,175,255,0.78)",
                backgroundColor: "rgba(40,68,145,0.18)",
            },

            scoreCardRed: {
                borderColor: "rgba(220,92,92,0.70)",
                backgroundColor: "rgba(108,42,64,0.18)",
            },

            scoreTeam: {
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: "900",
            },

            scoreValue: {
                marginTop: 10,
                color: "#FFFFFF",
                fontSize: 32,
                fontWeight: "900",
            },

            vsWrap: {
                alignItems: "center",
                justifyContent: "center",
            },

            vsText: {
                color: theme.text,
                opacity: 0.78,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.6,
                textTransform: "uppercase",
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

            infoCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            infoLabel: {
                color: theme.text,
                opacity: 0.62,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 0.8,
                textTransform: "uppercase",
            },

            infoValue: {
                marginTop: 6,
                color: theme.text,
                fontSize: 15,
                fontWeight: "800",
            },

            grid: {
                marginTop: 12,
                gap: 12,
            },

            hubBtn: {
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            hubBtnTitle: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            hubBtnSub: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            pressed: {
                opacity: 0.92,
                transform: [{ scale: 0.99 }],
            },
        });
    }, [theme, footerPad]);

    function openStandings() {
        navigation.navigate(ROUTES.RYDER_CUP_STANDINGS, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            status,
            sessions,
            players,
            teamAName,
            teamBName,
            teamA,
            teamB,
            teamAPoints,
            teamBPoints,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Hub"
                subtitle="Your event command center."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>{eventName || "Ryder Cup Event"}</Text>
                    <Text style={styles.heroSub}>
                        Official team event ready. Track sessions, teams, standings, and event progress from here.
                    </Text>

                    <View style={styles.scoreRow}>
                        <View style={[styles.scoreCard, styles.scoreCardBlue]}>
                            <Text style={styles.scoreTeam}>{teamAName}</Text>
                            <Text style={styles.scoreValue}>{teamAPoints}</Text>
                        </View>

                        <View style={styles.vsWrap}>
                            <Text style={styles.vsText}>vs</Text>
                        </View>

                        <View style={[styles.scoreCard, styles.scoreCardRed]}>
                            <Text style={styles.scoreTeam}>{teamBName}</Text>
                            <Text style={styles.scoreValue}>{teamBPoints}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Overview</Text>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Invitation Code</Text>
                        <Text style={styles.infoValue}>{inviteCode || "—"}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Organizer</Text>
                        <Text style={styles.infoValue}>{organizerName || "—"}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Status</Text>
                        <Text style={styles.infoValue}>{status || "ready"}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Next Session</Text>
                        <Text style={styles.infoValue}>
                            {nextSession
                                ? `Session ${nextSession.sessionNumber} — ${formatLabel(nextSession.formatType)}`
                                : "No sessions found"}
                        </Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Hub</Text>

                    <View style={styles.grid}>
                        <Pressable style={({ pressed }) => [styles.hubBtn, pressed && styles.pressed]}>
                            <Text style={styles.hubBtnTitle}>Sessions</Text>
                            <Text style={styles.hubBtnSub}>
                                {sessions.length} official sessions in this Ryder Cup event.
                            </Text>
                        </Pressable>

                        <Pressable style={({ pressed }) => [styles.hubBtn, pressed && styles.pressed]}>
                            <Text style={styles.hubBtnTitle}>Teams</Text>
                            <Text style={styles.hubBtnSub}>
                                {teamA.length} players on {teamAName} • {teamB.length} players on {teamBName}.
                            </Text>
                        </Pressable>

                        <Pressable onPress={openStandings} style={({ pressed }) => [styles.hubBtn, pressed && styles.pressed]}>
                            <Text style={styles.hubBtnTitle}>Standings</Text>
                            <Text style={styles.hubBtnSub}>
                                View official Ryder Cup points and event progress.
                            </Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}