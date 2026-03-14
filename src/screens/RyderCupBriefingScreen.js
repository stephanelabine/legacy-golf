// src/screens/RyderCupBriefingScreen.js
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

export default function RyderCupBriefingScreen({ navigation, route }) {
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
    const teamAName = String(route?.params?.teamAName || "Team A").trim();
    const teamBName = String(route?.params?.teamBName || "Team B").trim();
    const teamA = Array.isArray(route?.params?.teamA) ? route.params.teamA : [];
    const teamB = Array.isArray(route?.params?.teamB) ? route.params.teamB : [];

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

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
                backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
            },

            primaryText: {
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: 0.3,
            },

            pressed: {
                opacity: 0.92,
                transform: [{ scale: 0.99 }],
            },
        });
    }, [theme, isDark, footerPad]);

    function onStartRyderCup() {
        navigation.navigate(ROUTES.RYDER_CUP_HUB, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status: "ready",
            courseMode,
            teeMode,
            sessions,
            players,
            teamAName,
            teamBName,
            teamA,
            teamB,
            teamAPoints: 0,
            teamBPoints: 0,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Briefing"
                subtitle="Review your event before entering the Ryder Cup hub."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>{eventName || "Ryder Cup Event"}</Text>
                    <Text style={styles.heroSub}>
                        Review the official session structure, teams, and event details before you start your Ryder Cup experience.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Event</Text>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Invitation Code</Text>
                        <Text style={styles.infoValue}>{inviteCode || "—"}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Organizer</Text>
                        <Text style={styles.infoValue}>{organizerName || "—"}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Organizer Contact</Text>
                        <Text style={styles.infoValue}>
                            {organizerEmail || "—"}
                            {organizerPhone ? ` • ${organizerPhone}` : ""}
                        </Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>Organizer Handicap</Text>
                        <Text style={styles.infoValue}>{organizerHandicap || "—"}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Teams</Text>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>{teamAName}</Text>
                        <Text style={styles.infoValue}>{`${teamA.length} players`}</Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.infoLabel}>{teamBName}</Text>
                        <Text style={styles.infoValue}>{`${teamB.length} players`}</Text>
                    </View>

                    <Text style={styles.helper}>{`${players.length} total players in the event roster.`}</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Official Sessions</Text>

                    {sessions.map((session) => (
                        <View key={`briefing-session-${session.sessionNumber}`} style={styles.sessionCard}>
                            <Text style={styles.sessionTitle}>{`Session ${session.sessionNumber} — ${formatLabel(session.formatType)}`}</Text>
                            <Text style={styles.sessionMeta}>
                                {(session.date || "No date selected") +
                                    " • " +
                                    (session.courseName || "No course selected") +
                                    " • " +
                                    (session.teeName || "No tee selected")}
                            </Text>
                        </View>
                    ))}

                    <Text style={styles.helper}>
                        Official scoring: match win = 1 point, halved match = 0.5 each, and the final session is always Singles.
                    </Text>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable onPress={onStartRyderCup} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>Start Ryder Cup</Text>
                </Pressable>
            </View>
        </View>
    );
}