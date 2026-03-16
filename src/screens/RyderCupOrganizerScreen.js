// src/screens/RyderCupOrganizerScreen.js
import React, { useMemo, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    Platform,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";

function parseHandicap(v) {
    const raw = String(v ?? "").trim();
    if (!raw) return { ok: false, value: null };
    const num = Number(raw);
    if (!Number.isFinite(num)) return { ok: false, value: null };
    const rounded = Math.round(num * 10) / 10;
    return { ok: true, value: rounded };
}

export default function RyderCupOrganizerScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const [saving, setSaving] = useState(false);

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [handicap, setHandicap] = useState("");

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const styles = useMemo(() => {
        const goldBorder = isDark ? "rgba(232,194,92,0.78)" : "rgba(232,194,92,0.84)";
        const goldBg = isDark ? "rgba(232,194,92,0.10)" : "rgba(232,194,92,0.14)";

        const cupBorder = isDark ? "rgba(60,120,255,0.52)" : "rgba(60,120,255,0.42)";
        const cupBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(10,15,26,0.04)";

        const inkBtn = isDark ? "rgba(18,34,64,0.96)" : "rgba(10,15,26,0.92)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1.5,
                borderColor: goldBorder,
                backgroundColor: goldBg,
                marginBottom: 12,
            },
            heroKicker: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.82,
                textTransform: "uppercase",
            },
            heroTitle: {
                marginTop: 10,
                color: theme.text,
                fontSize: 18,
                fontWeight: "900",
            },
            heroSub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
            },

            card: {
                borderRadius: 22,
                padding: 14,
                borderWidth: 2.5,
                borderColor: cupBorder,
                backgroundColor: theme.card2,
                marginBottom: 12,
            },
            cardTitle: {
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.2,
                opacity: 0.82,
                textTransform: "uppercase",
            },
            cardSub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.72,
                fontSize: 12,
                fontWeight: "800",
                lineHeight: 17,
            },

            input: {
                marginTop: 12,
                height: 52,
                borderRadius: 16,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: 15,
                fontWeight: "800",
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
            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: inkBtn,
                borderWidth: 1.5,
                borderColor: goldBorder,
            },
            primaryBtnDisabled: { opacity: 0.65 },
            primaryText: {
                color: "#fff",
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: 0.4,
            },

            pressed: {
                opacity: Platform.OS === "ios" ? 0.88 : 0.9,
                transform: [{ scale: 0.99 }],
            },

            muted: {
                color: theme.text,
                opacity: 0.72,
                fontSize: 12,
                fontWeight: "800",
                textAlign: "center",
                marginTop: 10,
            },
        });
    }, [theme, isDark, footerPad]);

    function handleExit() {
        Alert.alert(
            "Exit Ryder Cup?",
            "Choose how you want to leave this setup.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Exit Without Saving",
                    style: "destructive",
                    onPress: () => navigation.navigate(ROUTES.HOME),
                },
                {
                    text: "Save and Exit",
                    onPress: () => navigation.navigate(ROUTES.HOME),
                },
            ]
        );
    }

    function onContinue() {
        const n = String(name || "").trim();
        const e = String(email || "").trim();
        const p = String(phone || "").trim();
        const h = parseHandicap(handicap);

        if (!n) {
            Alert.alert("Organizer name", "Please enter your name.");
            return;
        }

        if (!h.ok) {
            Alert.alert("Handicap required", "Please enter a valid handicap (example: 12.4).");
            return;
        }

        setSaving(true);

        try {
            Keyboard.dismiss();

            navigation.navigate(ROUTES.RYDER_CUP_HUB_WELCOME, {
                roundId: String(route?.params?.roundId || "").trim(),
                organizerName: n,
                organizerEmail: e,
                organizerPhone: p,
                organizerHandicap: String(h.value.toFixed(1)),
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader
                navigation={navigation}
                title="Organizer"
                subtitle="Set your profile before entering the Ryder Cup hub."
                rightLabel="Exit"
                onRightPress={handleExit}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.hero}>
                        <Text style={styles.heroKicker}>Ryder Cup profile</Text>
                        <Text style={styles.heroTitle}>Tell us who’s running this Ryder Cup</Text>
                        <Text style={styles.heroSub}>
                            This becomes the host profile for the event and keeps setup, teams, and results clean
                            from the start.
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Your details</Text>
                        <Text style={styles.cardSub}>Name + handicap required. Email/phone recommended.</Text>

                        <TextInput
                            value={name}
                            onChangeText={setName}
                            placeholder="Full name"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                            style={styles.input}
                            autoCapitalize="words"
                            autoCorrect={false}
                            editable={!saving}
                            returnKeyType="next"
                        />

                        <TextInput
                            value={email}
                            onChangeText={setEmail}
                            placeholder="Email (recommended)"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                            style={styles.input}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            editable={!saving}
                            returnKeyType="next"
                        />

                        <TextInput
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="Phone (recommended)"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                            style={styles.input}
                            keyboardType="phone-pad"
                            editable={!saving}
                            returnKeyType="next"
                        />

                        <TextInput
                            value={handicap}
                            onChangeText={(s) => setHandicap(String(s || "").replace(/[^0-9.]/g, ""))}
                            placeholder="Handicap (required) — example: 12.4"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                            style={styles.input}
                            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                            editable={!saving}
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />

                        <Text style={styles.muted}>Ryder Cup uses the same clean organizer-first setup flow.</Text>
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <Pressable
                        onPress={onContinue}
                        disabled={saving}
                        style={({ pressed }) => [
                            styles.primaryBtn,
                            saving && styles.primaryBtnDisabled,
                            pressed && !saving && styles.pressed,
                        ]}
                    >
                        <Text style={styles.primaryText}>
                            {saving ? "Continuing..." : "Continue to Ryder Cup Hub"}
                        </Text>
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}