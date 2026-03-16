// src/screens/RyderCupSessionsScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

const SESSION_OPTIONS = [
    { key: "foursomes", label: "Foursomes" },
    { key: "fourball", label: "Four-Ball" },
];

export default function RyderCupSessionsScreen({ navigation, route }) {
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

    const [session1Type, setSession1Type] = useState("");
    const [session2Type, setSession2Type] = useState("");
    const [session3Type, setSession3Type] = useState("");
    const [session4Date, setSession4Date] = useState("Select date");
    const [session5Date, setSession5Date] = useState("Select date");

    const [session1Date, setSession1Date] = useState("Select date");
    const [session2Date, setSession2Date] = useState("Select date");
    const [session3Date, setSession3Date] = useState("Select date");

    const foursomesChosen =
        [session1Type, session2Type, session3Type].filter((x) => x === "foursomes").length;
    const fourBallChosen =
        [session1Type, session2Type, session3Type].filter((x) => x === "fourball").length;

    const session4Type =
        foursomesChosen === 2 && fourBallChosen === 1
            ? "fourball"
            : foursomesChosen === 1 && fourBallChosen === 2
                ? "foursomes"
                : "";

    const validMix =
        [session1Type, session2Type, session3Type].every(Boolean) &&
        ((foursomesChosen === 2 && fourBallChosen === 1) ||
            (foursomesChosen === 1 && fourBallChosen === 2));

    const canContinue =
        validMix &&
        session1Date !== "Select date" &&
        session2Date !== "Select date" &&
        session3Date !== "Select date" &&
        session4Date !== "Select date" &&
        session5Date !== "Select date";

    function canChooseType(sessionNumber, optionKey, currentValue) {
        const selections = {
            1: session1Type,
            2: session2Type,
            3: session3Type,
        };

        const nextSelections = {
            ...selections,
            [sessionNumber]: optionKey,
        };

        const foursomesCount = Object.values(nextSelections).filter((x) => x === "foursomes").length;
        const fourBallCount = Object.values(nextSelections).filter((x) => x === "fourball").length;

        if (foursomesCount > 2) return false;
        if (fourBallCount > 2) return false;

        return true;
    }

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function cycleDate(current, sessionNumber) {
        if (current === "Select date") return `Session ${sessionNumber} Date`;
        if (current === `Session ${sessionNumber} Date`) return `Session ${sessionNumber} Date Updated`;
        return `Session ${sessionNumber} Date`;
    }

    function formatLabel(type) {
        if (type === "foursomes") return "Foursomes";
        if (type === "fourball") return "Four-Ball";
        if (type === "singles") return "Singles";
        return "Select format";
    }

    const styles = useMemo(() => {
        const optionOnBg = isDark ? "rgba(46,125,255,0.16)" : "rgba(29,53,87,0.12)";
        const optionOnBorder = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";

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

            helper: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.72,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 18,
            },

            sessionCard: {
                marginTop: 14,
                borderRadius: 18,
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

            sessionSub: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.68,
                fontSize: 13,
                fontWeight: "700",
            },

            optionRow: {
                flexDirection: "row",
                gap: 10,
                marginTop: 12,
            },

            optionBtn: {
                flex: 1,
                minHeight: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
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

            dateBtn: {
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

            dateText: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "800",
            },

            lockedCard: {
                marginTop: 14,
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,210,92,0.45)" : "rgba(255,210,92,0.62)",
                backgroundColor: isDark ? "rgba(255,210,92,0.10)" : "rgba(255,210,92,0.14)",
            },

            lockedTitle: {
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            lockedValue: {
                marginTop: 8,
                color: theme.text,
                fontSize: 15,
                fontWeight: "900",
            },

            lockedSub: {
                marginTop: 6,
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

        navigation.navigate(ROUTES.RYDER_CUP_COURSES, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status,
            sessions: [
                { sessionNumber: 1, formatType: session1Type, date: session1Date },
                { sessionNumber: 2, formatType: session2Type, date: session2Date },
                { sessionNumber: 3, formatType: session3Type, date: session3Date },
                { sessionNumber: 4, formatType: session4Type, date: session4Date },
                { sessionNumber: 5, formatType: "singles", date: session5Date },
            ],
        });
    }

    function renderSessionSelector(sessionNumber, selectedValue, setSelectedValue, dateValue, setDateValue) {
        return (
            <View style={styles.sessionCard}>
                <Text style={styles.sessionTitle}>{`Session ${sessionNumber}`}</Text>
                <Text style={styles.sessionSub}>Choose Foursomes or Four-Ball, then set the session date.</Text>

                <View style={styles.optionRow}>
                    {SESSION_OPTIONS.map((option) => {
                        const on = selectedValue === option.key;
                        const allowed = canChooseType(sessionNumber, option.key, selectedValue);

                        return (
                            <Pressable
                                key={`${sessionNumber}-${option.key}`}
                                onPress={() => {
                                    if (!allowed && !on) return;
                                    setSelectedValue(option.key);
                                }}
                                style={({ pressed }) => [
                                    styles.optionBtn,
                                    on && styles.optionBtnOn,
                                    !allowed && !on && { opacity: 0.38 },
                                    pressed && allowed && { opacity: 0.92 },
                                ]}
                            >
                                <Text style={styles.optionText}>{option.label}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                <Pressable
                    onPress={() => setDateValue(cycleDate(dateValue, sessionNumber))}
                    style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.92 }]}
                >
                    <Text style={styles.dateText}>{dateValue}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Sessions"
                subtitle="Build the official 5-session Ryder Cup structure."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Official Ryder Cup Structure</Text>
                    <Text style={styles.heroSub}>
                        Sessions 1–4 must contain exactly 2 Foursomes and 2 Four-Ball sessions. Session 5 is always Singles.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Sessions & Dates</Text>
                    <Text style={styles.helper}>
                        Choose the order of the first four official sessions and assign dates to all five sessions.
                    </Text>

                    {renderSessionSelector(1, session1Type, setSession1Type, session1Date, setSession1Date)}
                    {renderSessionSelector(2, session2Type, setSession2Type, session2Date, setSession2Date)}
                    {renderSessionSelector(3, session3Type, setSession3Type, session3Date, setSession3Date)}

                    <View style={styles.lockedCard}>
                        <Text style={styles.lockedTitle}>Session 4</Text>
                        <Text style={styles.lockedValue}>{session4Type ? formatLabel(session4Type) : "Waiting for previous selections"}</Text>
                        <Text style={styles.lockedSub}>
                            Session 4 automatically resolves to the remaining required format once Sessions 1–3 are valid.
                        </Text>

                        <Pressable
                            onPress={() => setSession4Date(cycleDate(session4Date, 4))}
                            style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.92 }]}
                        >
                            <Text style={styles.dateText}>{session4Date}</Text>
                        </Pressable>
                    </View>

                    <View style={styles.lockedCard}>
                        <Text style={styles.lockedTitle}>Session 5</Text>
                        <Text style={styles.lockedValue}>Singles</Text>
                        <Text style={styles.lockedSub}>
                            The fifth and final official Ryder Cup session is always Singles.
                        </Text>

                        <Pressable
                            onPress={() => setSession5Date(cycleDate(session5Date, 5))}
                            style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.92 }]}
                        >
                            <Text style={styles.dateText}>{session5Date}</Text>
                        </Pressable>
                    </View>
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
                    <Text style={styles.primaryText}>Continue to Courses</Text>
                </Pressable>
            </View>
        </View>
    );
}