// src/screens/RyderCupTeesScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function RyderCupTeesScreen({ navigation, route }) {
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
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];

    const [teeMode, setTeeMode] = useState("single");
    const [sharedTeeName, setSharedTeeName] = useState("Select tee");
    const [sessionTeeNames, setSessionTeeNames] = useState({
        1: "Select tee",
        2: "Select tee",
        3: "Select tee",
        4: "Select tee",
        5: "Select tee",
    });

    const canContinue =
        teeMode === "single"
            ? sharedTeeName !== "Select tee"
            : [1, 2, 3, 4, 5].every((n) => sessionTeeNames[n] !== "Select tee");

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function cycleTeeLabel(current, sessionNumber) {
        if (current === "Select tee") return sessionNumber ? `Session ${sessionNumber} Tee` : "Shared Tee";
        if (current === `Session ${sessionNumber} Tee`) return `Session ${sessionNumber} Tee Updated`;
        if (current === "Shared Tee") return "Shared Tee Updated";
        return sessionNumber ? `Session ${sessionNumber} Tee` : "Shared Tee";
    }

    function formatLabel(type) {
        if (type === "foursomes") return "Foursomes";
        if (type === "fourball") return "Four-Ball";
        if (type === "singles") return "Singles";
        return "Session";
    }

    const styles = useMemo(() => {
        const optionOnBg = isDark ? "rgba(46,125,255,0.16)" : "rgba(29,53,87,0.12)";
        const optionOnBorder = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";

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

            optionRow: {
                flexDirection: "row",
                gap: 10,
                marginTop: 14,
            },

            optionBtn: {
                flex: 1,
                minHeight: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 10,
            },

            optionBtnOn: {
                borderColor: optionOnBorder,
                backgroundColor: optionOnBg,
            },

            optionText: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
            },

            pickerCard: {
                marginTop: 14,
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
            },

            pickerTitle: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            pickerSub: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.68,
                fontSize: 13,
                fontWeight: "700",
            },

            pickerBtn: {
                marginTop: 12,
                minHeight: 48,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 12,
            },

            pickerText: {
                color: theme.text,
                fontSize: 13,
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

        const sessionsWithTees = sessions.map((session) => ({
            ...session,
            teeName:
                teeMode === "single"
                    ? sharedTeeName
                    : sessionTeeNames[session.sessionNumber] || "Select tee",
        }));

        navigation.navigate(ROUTES.RYDER_CUP_PLAYERS, {
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
            sessions: sessionsWithTees,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Tees"
                subtitle="Choose the tees for each official session."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Tee Setup</Text>
                    <Text style={styles.heroSub}>
                        Use one tee for all sessions or assign tees separately for each Ryder Cup session.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tee Mode</Text>
                    <Text style={styles.helper}>Choose whether all five sessions share one tee or each session gets its own tee.</Text>

                    <View style={styles.optionRow}>
                        <Pressable
                            onPress={() => setTeeMode("single")}
                            style={({ pressed }) => [
                                styles.optionBtn,
                                teeMode === "single" && styles.optionBtnOn,
                                pressed && { opacity: 0.92 },
                            ]}
                        >
                            <Text style={styles.optionText}>One Tee For All</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => setTeeMode("perSession")}
                            style={({ pressed }) => [
                                styles.optionBtn,
                                teeMode === "perSession" && styles.optionBtnOn,
                                pressed && { opacity: 0.92 },
                            ]}
                        >
                            <Text style={styles.optionText}>Tee Per Session</Text>
                        </Pressable>
                    </View>

                    {teeMode === "single" ? (
                        <View style={styles.pickerCard}>
                            <Text style={styles.pickerTitle}>Shared Tee</Text>
                            <Text style={styles.pickerSub}>This tee will be applied to all five sessions.</Text>

                            <Pressable
                                onPress={() => setSharedTeeName(cycleTeeLabel(sharedTeeName))}
                                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.92 }]}
                            >
                                <Text style={styles.pickerText}>{sharedTeeName}</Text>
                            </Pressable>
                        </View>
                    ) : (
                        sessions.map((session) => (
                            <View key={`tee-${session.sessionNumber}`} style={styles.pickerCard}>
                                <Text style={styles.pickerTitle}>{`Session ${session.sessionNumber} — ${formatLabel(session.formatType)}`}</Text>
                                <Text style={styles.pickerSub}>
                                    {(session.courseName || "No course selected") + " • " + (session.date || "No date selected")}
                                </Text>

                                <Pressable
                                    onPress={() =>
                                        setSessionTeeNames((prev) => ({
                                            ...prev,
                                            [session.sessionNumber]: cycleTeeLabel(prev[session.sessionNumber], session.sessionNumber),
                                        }))
                                    }
                                    style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.92 }]}
                                >
                                    <Text style={styles.pickerText}>{sessionTeeNames[session.sessionNumber]}</Text>
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
                    <Text style={styles.primaryText}>Continue to Players</Text>
                </Pressable>
            </View>
        </View>
    );
}