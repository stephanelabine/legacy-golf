// src/screens/TournamentTrophyScreen.js
import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { pickTournamentNavParams } from "../utils/tournamentNav";

function safeString(v) {
    return String(v == null ? "" : v).trim();
}

function computeChampionName(params) {
    const rows = Array.isArray(params?.leaderboardRows) ? params.leaderboardRows : [];
    const top = rows.length ? rows[0] : null;

    const fromRow =
        safeString(top?.name) ||
        safeString(top?.playerName) ||
        safeString(top?.displayName);

    const fromParams =
        safeString(params?.winnerName) ||
        safeString(params?.championName) ||
        safeString(params?.overallWinnerName) ||
        safeString(params?.leaderName);

    return fromRow || fromParams || "Winner";
}

export default function TournamentTrophyScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const tournamentName = String(params?.tournamentName || params?.name || "Tournament");
    const winnerName = computeChampionName(params);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const gold = "rgba(242,201,76,0.95)";
        const goldBg = "rgba(242,201,76,0.12)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },

            content: {
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: footerPad + 120,
            },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: gold,
                backgroundColor: goldBg,
                marginBottom: 12,
                alignItems: "center",
            },

            heroKicker: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 2.0,
                opacity: 0.75,
                textTransform: "uppercase",
                textAlign: "center",
            },

            trophy: {
                marginTop: 12,
                fontSize: 64,
                lineHeight: 72,
                textAlign: "center",
            },

            heroTitle: {
                marginTop: 10,
                color: theme.text,
                fontSize: 26,
                fontWeight: "900",
                textAlign: "center",
            },

            heroWinner: {
                marginTop: 10,
                color: theme.text,
                fontSize: 20,
                fontWeight: "900",
                textAlign: "center",
            },

            heroSub: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.78,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
                textAlign: "center",
            },

            pillRow: {
                marginTop: 12,
                flexDirection: "row",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
            },
            pill: {
                height: 30,
                paddingHorizontal: 12,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },

            card: {
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
                marginBottom: 12,
            },

            cardTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
            cardSub: {
                marginTop: 8,
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
                paddingBottom: footerPad,
                paddingTop: 12,
                backgroundColor: theme.bg,
                borderTopWidth: 1,
                borderTopColor: theme.divider,
            },

            footerRow: { flexDirection: "column", gap: 10 },

            btn: {
                width: "100%",
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 12,
            },

            btnPrimary: {
                height: 56,
                backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
            },

            btnGhost: {
                height: 52,
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
            },

            btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
            btnGhostText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.2 },

            pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
        });
    }, [theme, isDark, footerPad]);

    const goSettlePayouts = useCallback(() => {
        navigation.navigate(ROUTES.TOURNAMENT_SETTLE_PAYOUTS, pickTournamentNavParams(params));
    }, [navigation, params]);

    const goHome = useCallback(() => {
        navigation.navigate(ROUTES.HOME);
    }, [navigation]);

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Winner’s Circle"
                subtitle="Tournament complete. Celebrate, then settle payouts."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroKicker}>{tournamentName}</Text>
                    <Text style={styles.trophy}>🏆</Text>
                    <Text style={styles.heroTitle}>Champion</Text>
                    <Text style={styles.heroWinner}>{winnerName}</Text>
                    <Text style={styles.heroSub}>Next step: settle who pays who. Then close the tournament.</Text>

                    <View style={styles.pillRow}>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>LOW NET</Text>
                        </View>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>OFFICIAL</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Next</Text>
                    <Text style={styles.cardSub}>
                        Tap “Settle payouts” to see the final settlement list (who owes who what). After that, you’ll close the
                        tournament and return home.
                    </Text>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <View style={styles.footerRow}>
                    <Pressable
                        onPress={goSettlePayouts}
                        style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
                    >
                        <Text style={styles.btnPrimaryText}>Settle payouts</Text>
                    </Pressable>

                    <Pressable
                        onPress={goHome}
                        style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                    >
                        <Text style={styles.btnGhostText}>Return Home</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}
