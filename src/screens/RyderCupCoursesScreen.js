// src/screens/RyderCupCoursesScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function RyderCupCoursesScreen({ navigation, route }) {
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
    const sessions = Array.isArray(route?.params?.sessions) ? route.params.sessions : [];

    const [courseMode, setCourseMode] = useState("single");
    const [singleCourseName, setSingleCourseName] = useState("Select course");
    const [sessionCourseNames, setSessionCourseNames] = useState({
        1: "Select course",
        2: "Select course",
        3: "Select course",
        4: "Select course",
        5: "Select course",
    });

    const canContinue =
        courseMode === "single"
            ? singleCourseName !== "Select course"
            : [1, 2, 3, 4, 5].every((n) => sessionCourseNames[n] !== "Select course");

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    function cycleCourseLabel(current, sessionNumber) {
        if (current === "Select course") return sessionNumber ? `Session ${sessionNumber} Course` : "Shared Course";
        if (current === `Session ${sessionNumber} Course`) return `Session ${sessionNumber} Course Updated`;
        if (current === "Shared Course") return "Shared Course Updated";
        return sessionNumber ? `Session ${sessionNumber} Course` : "Shared Course";
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

        const sessionsWithCourses = sessions.map((session) => ({
            ...session,
            courseName: courseMode === "single"
                ? singleCourseName
                : sessionCourseNames[session.sessionNumber] || "Select course",
        }));

        navigation.navigate(ROUTES.RYDER_CUP_TEES, {
            eventId,
            eventName,
            inviteCode,
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status,
            courseMode,
            sessions: sessionsWithCourses,
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup Courses"
                subtitle="Choose where each official session will be played."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Course Setup</Text>
                    <Text style={styles.heroSub}>
                        Use one course for all sessions or assign a separate course to each Ryder Cup session.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Course Mode</Text>
                    <Text style={styles.helper}>Choose whether all five sessions share one course or each session gets its own course.</Text>

                    <View style={styles.optionRow}>
                        <Pressable
                            onPress={() => setCourseMode("single")}
                            style={({ pressed }) => [
                                styles.optionBtn,
                                courseMode === "single" && styles.optionBtnOn,
                                pressed && { opacity: 0.92 },
                            ]}
                        >
                            <Text style={styles.optionText}>One Course For All</Text>
                        </Pressable>

                        <Pressable
                            onPress={() => setCourseMode("perSession")}
                            style={({ pressed }) => [
                                styles.optionBtn,
                                courseMode === "perSession" && styles.optionBtnOn,
                                pressed && { opacity: 0.92 },
                            ]}
                        >
                            <Text style={styles.optionText}>Course Per Session</Text>
                        </Pressable>
                    </View>

                    {courseMode === "single" ? (
                        <View style={styles.pickerCard}>
                            <Text style={styles.pickerTitle}>Shared Course</Text>
                            <Text style={styles.pickerSub}>This course will be applied to all five sessions.</Text>

                            <Pressable
                                onPress={() => setSingleCourseName(cycleCourseLabel(singleCourseName))}
                                style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.92 }]}
                            >
                                <Text style={styles.pickerText}>{singleCourseName}</Text>
                            </Pressable>
                        </View>
                    ) : (
                        sessions.map((session) => (
                            <View key={`course-${session.sessionNumber}`} style={styles.pickerCard}>
                                <Text style={styles.pickerTitle}>{`Session ${session.sessionNumber} — ${session.formatType === "fourball" ? "Four-Ball" : session.formatType === "foursomes" ? "Foursomes" : "Singles"}`}</Text>
                                <Text style={styles.pickerSub}>{session.date || "No date selected"}</Text>

                                <Pressable
                                    onPress={() =>
                                        setSessionCourseNames((prev) => ({
                                            ...prev,
                                            [session.sessionNumber]: cycleCourseLabel(prev[session.sessionNumber], session.sessionNumber),
                                        }))
                                    }
                                    style={({ pressed }) => [styles.pickerBtn, pressed && { opacity: 0.92 }]}
                                >
                                    <Text style={styles.pickerText}>{sessionCourseNames[session.sessionNumber]}</Text>
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
                    <Text style={styles.primaryText}>Continue to Tees</Text>
                </Pressable>
            </View>
        </View>
    );
}