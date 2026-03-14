// src/screens/RyderCupEventOverviewScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function RyderCupEventOverviewScreen({ navigation, route }) {
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

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const progressItems = [
        "Event Created",
        "Sessions & Dates",
        "Courses",
        "Tees",
        "Player Roster",
        "Teams",
        "Briefing",
    ];

    const styles = useMemo(() => {
        return StyleSheet.create({
            screen: {
                flex: 1,
                backgroundColor: theme.bg,
            },

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

            infoRow: {
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

            progressCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            progressRow: {
                flexDirection: "row",
                alignItems: "center",
                marginTop: 10,
            },

            progressDot: {
                width: 10,
                height: 10,
                borderRadius: 999,
                marginRight: 10,
                backgroundColor: isDark ? "rgba(255,210,92,0.92)" : "rgba(29,53,87,0.92)",
            },

            progressText: {
                color: theme.text,
                fontSize: 14,
                fontWeight: "800",
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

    function onContinue() {
        navigation.navigate(ROUTES.RYDER_CUP_SESSIONS, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Event"
                subtitle="Your event shell is ready. Continue setting it up."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>{eventName || "Ryder Cup Event"}</Text>
                    <Text style={styles.heroSub}>
                        Your event has been created and is ready for setup. Use the invite code below to identify this Ryder Cup event.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Event Overview</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Event ID</Text>
                        <Text style={styles.infoValue}>{eventId || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Invitation Code</Text>
                        <Text style={styles.infoValue}>{inviteCode || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Organizer</Text>
                        <Text style={styles.infoValue}>{organizerName || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Status</Text>
                        <Text style={styles.infoValue}>{status || "setup"}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Setup Progress</Text>

                    <View style={styles.progressCard}>
                        {progressItems.map((item) => (
                            <View key={item} style={styles.progressRow}>
                                <View style={styles.progressDot} />
                                <Text style={styles.progressText}>{item}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable onPress={onContinue} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>Continue Setup</Text>
                </Pressable>
            </View>
        </View>
    );
}