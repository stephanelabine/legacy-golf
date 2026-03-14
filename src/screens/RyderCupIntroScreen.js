// src/screens/RyderCupIntroScreen.js
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

const RYDER_CUP_INTRO = require("../../assets/ryder-cup-intro.mp4");

export default function RyderCupIntroScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const roundId = route?.params?.roundId || null;
    const gameId = route?.params?.gameId || "ryder_cup";
    const gameTitle = route?.params?.gameTitle || "Ryder Cup";

    const player = useVideoPlayer(RYDER_CUP_INTRO, (p) => {
        p.loop = false;
        p.muted = false;
        p.play();
    });

    function goNext() {
        navigation.replace(ROUTES.GAME_SETUP, {
            roundId,
            gameId,
            gameTitle,
        });
    }

    useEventListener(player, "playToEnd", () => {
        goNext();
    });

    useEventListener(player, "statusChange", ({ status }) => {
        if (status === "error") {
            goNext();
        }
    });

    const styles = StyleSheet.create({
        screen: {
            flex: 1,
            backgroundColor: "#000",
        },

        videoWrap: {
            flex: 1,
            backgroundColor: "#000",
        },

        video: {
            flex: 1,
            backgroundColor: "#000",
        },

        overlayTop: {
            position: "absolute",
            top: insets.top + 12,
            left: 16,
            right: 16,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },

        badge: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: "rgba(10,15,26,0.62)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
        },

        badgeText: {
            color: "#FFFFFF",
            fontSize: 12,
            fontWeight: "900",
            letterSpacing: 1.2,
            textTransform: "uppercase",
        },

        skipBtn: {
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.20)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.22)",
        },

        skipText: {
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: "900",
            letterSpacing: 0.3,
        },

        overlayBottom: {
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 18,
            alignItems: "center",
        },

        titlePill: {
            paddingHorizontal: 18,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: "rgba(10,15,26,0.68)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
        },

        titleText: {
            color: "#FFFFFF",
            fontSize: 16,
            fontWeight: "900",
            letterSpacing: 1.4,
            textTransform: "uppercase",
        },
    });

    return (
        <View style={styles.screen}>
            <View style={styles.videoWrap}>
                <VideoView
                    player={player}
                    style={styles.video}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                    nativeControls={false}
                    contentFit="contain"
                />
            </View>

            <View style={styles.overlayTop}>
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Ryder Cup</Text>
                </View>

                <Pressable onPress={goNext} style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.9 }]}>
                    <Text style={styles.skipText}>Skip Video</Text>
                </Pressable>
            </View>

            <View style={styles.overlayBottom}>
                <View style={styles.titlePill}>
                    <Text style={styles.titleText}>Team Event Mode</Text>
                </View>
            </View>
        </View>
    );
}