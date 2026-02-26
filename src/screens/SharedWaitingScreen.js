// src/screens/SharedWaitingScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

export default function SharedWaitingScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const roundId = String(params?.roundId || "").trim();

    const [roundDoc, setRoundDoc] = useState(null);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    useEffect(() => {
        if (!roundId) {
            Alert.alert("Missing round", "roundId was not provided.");
            navigation.goBack();
            return;
        }

        const uid = String(auth?.currentUser?.uid || "").trim();
        if (!uid) {
            Alert.alert("Not signed in", "Please sign in again.");
            navigation.goBack();
            return;
        }

        const ref = doc(db, "sharedRounds", String(roundId));

        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = snap.exists() ? (snap.data() || {}) : null;
                setRoundDoc(data);

                const status = String(data?.status || "").trim();
                const setupReady = data?.setupReady === true;

                if (status === "in_progress") {
                    navigation.replace(ROUTES.GAME_ROUND_START_SPLASH, { roundId, ms: 2500 });
                    return;
                }

                if (setupReady) {
                    navigation.replace(ROUTES.GAME_ROUND_BRIEFING, { roundId });
                }
            },
            (err) => Alert.alert("Round error", err?.message || "Could not load round.")
        );

        return () => {
            try {
                unsub && unsub();
            } catch { }
        };
    }, [roundId, navigation]);

    const hostName = useMemo(() => {
        const h = String(roundDoc?.hostName || "").trim();
        return h || "the host";
    }, [roundDoc]);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
        const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

            card: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: goldBg,
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
            sub: { marginTop: 10, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

            infoBox: {
                marginTop: 14,
                borderRadius: 18,
                padding: 12,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            infoText: { color: theme.text, opacity: 0.82, fontSize: 12, fontWeight: "800", lineHeight: 18 },

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
            secondaryBtn: {
                height: 54,
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
            <ScreenHeader navigation={navigation} title="Waiting Room" subtitle="You’ve joined the round." />

            <View style={styles.content}>
                <View style={styles.card}>
                    <Text style={styles.kicker}>Joined</Text>
                    <Text style={styles.title}>Waiting for {hostName} to finish setup.</Text>
                    <Text style={styles.sub}>
                        You’re in. Once the host reaches the Round Briefing screen, you’ll be brought in automatically.
                    </Text>

                    <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                            Tip: keep this screen open. If the host starts the round, you’ll automatically enter play.
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.footer}>
                <Pressable
                    onPress={() => navigation.navigate(ROUTES.HOME)}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                    <Text style={styles.secondaryText}>Back to Home</Text>
                </Pressable>
            </View>
        </View>
    );
}