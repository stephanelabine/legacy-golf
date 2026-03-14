// src/screens/RyderCupStandingsScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function formatLabel(type) {
    if (type === "foursomes") return "Foursomes";
    if (type === "fourball") return "Four-Ball";
    if (type === "singles") return "Singles";
    return "Session";
}

export default function RyderCupStandingsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();

    const eventName = String(route?.params?.eventName || "").trim();
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];
    const teamAName = String(route?.params?.teamAName || "Team A").trim();
    const teamBName = String(route?.params?.teamBName || "Team B").trim();
    const teamAPoints = Number(route?.params?.teamAPoints || 0);
    const teamBPoints = Number(route?.params?.teamBPoints || 0);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 24);

    const styles = useMemo(() => {
        return StyleSheet.create({
            screen: {
                flex: 1,
                backgroundColor: theme.bg,
            },

            content: {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: footerPad,
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

            sessionCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            sessionTitle: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            sessionMeta: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            helper: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },
        });
    }, [theme, footerPad]);

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Standings"
                subtitle="Official team points and session structure."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>{eventName || "Ryder Cup Event"}</Text>
                    <Text style={styles.heroSub}>
                        Track official Ryder Cup standings here as your event progresses.
                    </Text>

                    <View style={styles.scoreRow}>
                        <View style={[styles.scoreCard, styles.scoreCardBlue]}>
                            <Text style={styles.scoreTeam}>{teamAName}</Text>
                            <Text style={styles.scoreValue}>{teamAPoints}</Text>
                        </View>

                        <View style={[styles.scoreCard, styles.scoreCardRed]}>
                            <Text style={styles.scoreTeam}>{teamBName}</Text>
                            <Text style={styles.scoreValue}>{teamBPoints}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sessions</Text>

                    {sessions.length === 0 ? (
                        <Text style={styles.helper}>No sessions found.</Text>
                    ) : (
                        sessions.map((session) => (
                            <View key={`standing-session-${session.sessionNumber}`} style={styles.sessionCard}>
                                <Text style={styles.sessionTitle}>
                                    {`Session ${session.sessionNumber} — ${formatLabel(session.formatType)}`}
                                </Text>
                                <Text style={styles.sessionMeta}>
                                    {(session.date || "No date selected") +
                                        " • " +
                                        (session.courseName || "No course selected") +
                                        " • " +
                                        (session.teeName || "No tee selected")}
                                </Text>
                            </View>
                        ))
                    )}

                    <Text style={styles.helper}>
                        Official scoring: match win = 1 point, halved match = 0.5 each, and the final session is always Singles.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}