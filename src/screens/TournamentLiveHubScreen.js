// src/screens/TournamentLiveHubScreen.js
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function TournamentLiveHubScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const tournamentId = route?.params?.tournamentId;

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function safeNav(name, params) {
        if (!tournamentId) {
            Alert.alert("Missing tournament", "No tournamentId provided.");
            return;
        }
        navigation.navigate(name, { tournamentId, ...(params || {}) });
    }

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";
        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
        const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: footerPad + 24 },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: goldBg,
                marginBottom: 12,
            },
            kicker: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.78,
                textTransform: "uppercase",
            },
            title: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
            sub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: theme.card2,
                marginBottom: 12,
            },
            cardTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
            cardSub: { marginTop: 6, color: theme.text, opacity: 0.74, fontSize: 12, fontWeight: "800", lineHeight: 16 },

            footer: {
                paddingHorizontal: 16,
                paddingBottom: footerPad,
                paddingTop: 12,
            },

            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
            },
            primaryBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
            icon: { color: "#fff", fontSize: 16, fontWeight: "900" },
            primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

            secondaryBtn: {
                marginTop: 10,
                height: 52,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
            },
            secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

            pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
        });
    }, [theme, isDark, footerPad]);

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Tournament Live" subtitle="Live hub (dev-safe runway)." />

            <View style={styles.content}>
                <View style={styles.hero}>
                    <Text style={styles.kicker}>live flow</Text>
                    <Text style={styles.title}>Tournament is running</Text>
                    <Text style={styles.sub}>
                        Next: each player gets a premium “welcome + briefing” moment before starting their round.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Player briefing (next)</Text>
                    <Text style={styles.cardSub}>
                        Welcome message, round info, tee time, starting hole, and group — then one big Start Round button.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Hole prompts for formats (after)</Text>
                    <Text style={styles.cardSub}>
                        If the next hole is KP / Long Drive / 2nd Shot KP, we’ll show a Legacy splash notifier before the hole.
                    </Text>
                </View>

                <View style={styles.footer}>
                    <Pressable
                        onPress={() => safeNav(ROUTES.TOURNAMENT_PLAYER_BRIEFING)}
                        style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                    >
                        <View style={styles.primaryBtnInner}>
                            <Text style={styles.icon}>✅</Text>
                            <Text style={styles.primaryText}>Continue</Text>
                            <Text style={styles.icon}>✅</Text>
                        </View>
                    </Pressable>

                    <Pressable
                        onPress={() => safeNav(ROUTES.TOURNAMENT_OVERVIEW)}
                        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.secondaryText}>Back to overview</Text>
                    </Pressable>

                    <Pressable
                        onPress={() => safeNav(ROUTES.TOURNAMENT_PAYOUTS, { fromOverview: true, returnTo: ROUTES.TOURNAMENT_OVERVIEW })}
                        style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.secondaryText}>View payouts</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}
