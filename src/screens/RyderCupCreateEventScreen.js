// src/screens/RyderCupCreateEventScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function makeInviteCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 6; i += 1) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
}

function makeEventId() {
    return `rc_${Date.now()}`;
}

export default function RyderCupCreateEventScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const organizerName = String(route?.params?.organizerName || "").trim();
    const organizerEmail = String(route?.params?.organizerEmail || "").trim();
    const organizerPhone = String(route?.params?.organizerPhone || "").trim();
    const organizerHandicap = String(route?.params?.organizerHandicap || "").trim();

    const [eventName, setEventName] = useState("");

    const canContinue = eventName.trim().length > 0;
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

            fieldBlock: {
                marginTop: 14,
            },

            label: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 0.5,
                opacity: 0.82,
                marginBottom: 8,
                textTransform: "uppercase",
            },

            input: {
                height: 54,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card,
                paddingHorizontal: 14,
                color: theme.text,
                fontSize: 15,
                fontWeight: "700",
            },

            helper: {
                marginTop: 10,
                color: theme.text,
                opacity: 0.68,
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

    function onCreateEvent() {
        if (!canContinue) return;

        navigation.navigate(ROUTES.RYDER_CUP_EVENT_OVERVIEW, {
            eventId: makeEventId(),
            eventName: eventName.trim(),
            inviteCode: makeInviteCode(),
            organizerName,
            organizerEmail,
            organizerPhone,
            organizerHandicap,
            status: "setup",
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Create Ryder Cup"
                subtitle="Name your event and create the Ryder Cup shell."
            />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroCard}>
                    <Text style={styles.heroTitle}>Create Your Event</Text>
                    <Text style={styles.heroSub}>
                        Give your Ryder Cup event a name. This will create the event shell and generate an invitation code.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Event Details</Text>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Event Name</Text>
                        <TextInput
                            value={eventName}
                            onChangeText={setEventName}
                            placeholder="Enter event name"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                            style={styles.input}
                            returnKeyType="done"
                        />
                        <Text style={styles.helper}>
                            Example: Legacy Ryder Cup 2026, Northview Ryder Cup, Canada vs USA Cup.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={onCreateEvent}
                    disabled={!canContinue}
                    style={({ pressed }) => [
                        styles.primaryBtn,
                        !canContinue && styles.primaryBtnDisabled,
                        pressed && canContinue && styles.pressed,
                    ]}
                >
                    <Text style={styles.primaryText}>Create Ryder Cup Event</Text>
                </Pressable>
            </View>
        </View>
    );
}