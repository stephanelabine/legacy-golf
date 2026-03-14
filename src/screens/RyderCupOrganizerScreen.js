// src/screens/RyderCupOrganizerScreen.js
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

export default function RyderCupOrganizerScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const [organizerName, setOrganizerName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [handicap, setHandicap] = useState("");

    const canContinue =
        organizerName.trim().length > 0 &&
        email.trim().length > 0 &&
        phone.trim().length > 0 &&
        handicap.trim().length > 0;

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
                borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(10,15,26,0.10)",
                backgroundColor: theme.card,
            },

            heroTitle: {
                color: theme.text,
                fontSize: 22,
                fontWeight: "900",
            },

            heroSub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.74,
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

        navigation.navigate(ROUTES.RYDER_CUP_HUB_WELCOME, {
            organizerName: organizerName.trim(),
            organizerEmail: email.trim(),
            organizerPhone: phone.trim(),
            organizerHandicap: handicap.trim(),
        });
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Ryder Cup"
                subtitle="Set up the organizer profile for your event."
            />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.heroCard}>
                        <Text style={styles.heroTitle}>Organizer Profile</Text>
                        <Text style={styles.heroSub}>
                            Enter the host details for this Ryder Cup event. These details will follow the event as you build it.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Organizer Details</Text>

                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Organizer Name</Text>
                            <TextInput
                                value={organizerName}
                                onChangeText={setOrganizerName}
                                placeholder="Enter organizer name"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                                style={styles.input}
                                returnKeyType="next"
                            />
                        </View>

                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Email</Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter email"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                                style={styles.input}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                returnKeyType="next"
                            />
                        </View>

                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Phone Number</Text>
                            <TextInput
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Enter phone number"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                                style={styles.input}
                                keyboardType="phone-pad"
                                returnKeyType="next"
                            />
                        </View>

                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Handicap</Text>
                            <TextInput
                                value={handicap}
                                onChangeText={setHandicap}
                                placeholder="Enter organizer handicap"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.34)" : "rgba(10,15,26,0.34)"}
                                style={styles.input}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                            />
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

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
                    <Text style={styles.primaryText}>Continue to Ryder Cup</Text>
                </Pressable>
            </View>
        </View>
    );
}