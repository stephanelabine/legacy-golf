// src/screens/RyderCupHubWelcomeScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function RyderCupHubWelcomeScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const eventId = String(route?.params?.eventId || "").trim();
    const organizerName = String(route?.params?.organizerName || "").trim();
    const organizerEmail = String(route?.params?.organizerEmail || "").trim();
    const organizerPhone = String(route?.params?.organizerPhone || "").trim();
    const organizerHandicap = String(route?.params?.organizerHandicap || "").trim();

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

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

            emptyCard: {
                marginTop: 12,
                borderRadius: 16,
                padding: 18,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(10,15,26,0.10)",
                backgroundColor: theme.card,
                alignItems: "center",
            },

            emptyTitle: {
                color: theme.text,
                fontSize: 17,
                fontWeight: "900",
            },

            emptySub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
                textAlign: "center",
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

    function onCreateEvent() {
        navigation.navigate(ROUTES.RYDER_CUP_CREATE_EVENT, {
            eventId,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
        });
    }

    function onExitPress() {
        Alert.alert("Exit Ryder Cup?", "What would you like to do?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "No Save - Exit",
                style: "destructive",
                onPress: () => navigation.navigate(ROUTES.HOME),
            },
            {
                text: "Save and Exit",
                onPress: () => navigation.navigate(ROUTES.HOME),
            },
        ]);
    }
    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Hub"
                subtitle="Build and manage your official Ryder Cup event."
                rightLabel="Exit"
                onRightPress={onExitPress}
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Welcome to the Ryder Cup Hub</Text>
                    <Text style={styles.heroSub}>
                        Here you can build and create your own event, just like the pros, and experience this iconic team golf competition in Legacy Golf.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Organizer</Text>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Name</Text>
                        <Text style={styles.infoValue}>{organizerName || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Email</Text>
                        <Text style={styles.infoValue}>{organizerEmail || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Phone</Text>
                        <Text style={styles.infoValue}>{organizerPhone || "—"}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Handicap</Text>
                        <Text style={styles.infoValue}>{organizerHandicap || "—"}</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Your Events</Text>

                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyTitle}>No Ryder Cup events yet</Text>
                        <Text style={styles.emptySub}>
                            Create your first Ryder Cup event to start building teams, sessions, and the full event experience.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable onPress={onCreateEvent} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                    <Text style={styles.primaryText}>Create Event</Text>
                </Pressable>
            </View>
        </View>
    );
}