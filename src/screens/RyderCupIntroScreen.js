// src/screens/RyderCupIntroScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Animated,
    Easing,
    Platform,
    ImageBackground,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

const RYDER_CUP_INTRO = require("../../assets/ryder-cup-intro.mp4");
const RYDER_CUP_HERO = require("../../assets/ryder-cup-hero-image.png");

export default function RyderCupIntroScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme } = useTheme();
    const isDark = scheme === "dark";

    const roundId = route?.params?.roundId || null;
    const gameId = route?.params?.gameId || "ryder_cup";
    const gameTitle = route?.params?.gameTitle || "Ryder Cup";

    const [showHero, setShowHero] = useState(false);

    const videoOpacity = useRef(new Animated.Value(1)).current;
    const heroOpacity = useRef(new Animated.Value(0)).current;
    const heroScale = useRef(new Animated.Value(1.01)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const cardTranslateY = useRef(new Animated.Value(18)).current;

    const player = useVideoPlayer(RYDER_CUP_INTRO, (p) => {
        p.loop = false;
        p.muted = false;
        p.play();
    });

    function goNext() {
        navigation.replace(ROUTES.RYDER_CUP_ORGANIZER, {
            roundId,
            gameId,
            gameTitle,
        });
    }

    function beginHeroTransition() {
        if (showHero) return;

        setShowHero(true);

        heroOpacity.setValue(0);
        heroScale.setValue(1.01);
        cardOpacity.setValue(0);
        cardTranslateY.setValue(18);

        Animated.parallel([
            Animated.timing(videoOpacity, {
                toValue: 0,
                duration: 180,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(heroOpacity, {
                toValue: 1,
                duration: 220,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(heroScale, {
                toValue: 1,
                duration: 320,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();

        Animated.sequence([
            Animated.delay(130),
            Animated.parallel([
                Animated.timing(cardOpacity, {
                    toValue: 1,
                    duration: 260,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(cardTranslateY, {
                    toValue: 0,
                    duration: 320,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
            ]),
        ]).start();
    }

    useEventListener(player, "playToEnd", () => {
        beginHeroTransition();
    });

    useEventListener(player, "statusChange", ({ status }) => {
        if (status === "error") {
            beginHeroTransition();
        }
    });

    const styles = useMemo(() => {
        const gold = "rgba(232,194,92,1)";
        const goldSoft = "rgba(232,194,92,0.82)";
        const warmWhite = "rgba(255,248,230,0.98)";
        const glassBg = isDark ? "rgba(7,14,24,0.48)" : "rgba(7,14,24,0.34)";
        const glassInner = isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)";
        const glassStroke = isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.18)";
        const buttonBg = isDark ? "rgba(10,18,30,0.82)" : "rgba(10,18,30,0.72)";
        const buttonStroke = "rgba(232,194,92,0.92)";

        return StyleSheet.create({
            screen: {
                flex: 1,
                backgroundColor: "#000",
            },

            absoluteFill: {
                ...StyleSheet.absoluteFillObject,
            },

            videoPanel: {
                ...StyleSheet.absoluteFillObject,
                backgroundColor: "#000",
                backfaceVisibility: "hidden",
            },

            video: {
                ...StyleSheet.absoluteFillObject,
                backgroundColor: "#000",
            },
            heroPanel: {
                ...StyleSheet.absoluteFillObject,
                backgroundColor: "#000",
                backfaceVisibility: "hidden",
            },

            heroImage: {
                flex: 1,
                justifyContent: "flex-end",
            },

            heroImageStyle: {
                resizeMode: "cover",
            },

            heroOverlay: {
                ...StyleSheet.absoluteFillObject,
            },

            topFade: {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "24%",
                backgroundColor: "rgba(6,12,20,0.18)",
            },

            bottomFade: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "42%",
                backgroundColor: "rgba(6,12,20,0.26)",
            },

            leftBlueWash: {
                position: "absolute",
                left: 0,
                top: "14%",
                width: "44%",
                height: "44%",
                backgroundColor: "rgba(44,98,195,0.10)",
            },

            rightRedWash: {
                position: "absolute",
                right: 0,
                top: "16%",
                width: "36%",
                height: "34%",
                backgroundColor: "rgba(179,40,40,0.08)",
            },

            bottomGreenWash: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "24%",
                backgroundColor: "rgba(41,120,73,0.08)",
            },

            ctaWrap: {
                paddingHorizontal: 18,
                paddingBottom: Math.max(18, insets.bottom + 12),
            },

            ctaCard: {
                borderRadius: 4,
                borderWidth: 2,
                borderColor: goldSoft,
                backgroundColor: glassBg,
                overflow: "hidden",
                shadowColor: "#000",
                shadowOpacity: 0.34,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 10,
            },

            ctaCardInner: {
                borderRadius: 2,
                borderWidth: 1,
                borderColor: glassStroke,
                backgroundColor: glassInner,
                paddingHorizontal: 18,
                paddingTop: 20,
                paddingBottom: 18,
                alignItems: "center",
            },

            welcomeText: {
                color: warmWhite,
                fontSize: 15,
                fontWeight: "800",
                letterSpacing: 1.7,
                textTransform: "uppercase",
                textAlign: "center",
                fontFamily: "Cinzel",
            },

            heroTitle: {
                marginTop: 8,
                color: gold,
                fontSize: 29,
                lineHeight: 36,
                fontWeight: "900",
                textAlign: "center",
                fontFamily: "Cinzel",
                textShadowColor: "rgba(0,0,0,0.58)",
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 7,
            },

            buttonOuter: {
                marginTop: 18,
                width: "100%",
                borderRadius: 3,
                borderWidth: 1.5,
                borderColor: buttonStroke,
                overflow: "hidden",
                backgroundColor: "rgba(255,255,255,0.03)",
            },

            buttonInner: {
                paddingVertical: 14,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: buttonBg,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
            },

            buttonText: {
                color: "#FFFFFF",
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: 0.4,
                textAlign: "center",
                fontFamily: "Cinzel",
            },

            pressed: {
                opacity: Platform.OS === "ios" ? 0.9 : 0.92,
                transform: [{ scale: 0.992 }],
            },
        });
    }, [insets.bottom, isDark]);

    return (
        <View style={styles.screen}>
            <Animated.View
                pointerEvents={showHero ? "none" : "auto"}
                style={[
                    styles.videoPanel,
                    {
                        opacity: videoOpacity,
                    },
                ]}
            >
                <VideoView
                    player={player}
                    style={styles.video}
                    allowsFullscreen={false}
                    allowsPictureInPicture={false}
                    nativeControls={false}
                    contentFit="cover"
                />
            </Animated.View>

            {showHero ? (
                <Animated.View
                    style={[
                        styles.heroPanel,
                        {
                            opacity: heroOpacity,
                            transform: [{ scale: heroScale }],
                        },
                    ]}
                >
                    <ImageBackground source={RYDER_CUP_HERO} style={styles.heroImage} imageStyle={styles.heroImageStyle}>
                        <View pointerEvents="none" style={styles.heroOverlay}>
                            <View style={styles.topFade} />
                            <View style={styles.bottomFade} />
                            <View style={styles.leftBlueWash} />
                            <View style={styles.rightRedWash} />
                            <View style={styles.bottomGreenWash} />
                        </View>

                        <View style={styles.ctaWrap}>
                            <Animated.View
                                style={{
                                    opacity: cardOpacity,
                                    transform: [{ translateY: cardTranslateY }],
                                }}
                            >
                                <View style={styles.ctaCard}>
                                    <View style={styles.ctaCardInner}>
                                        <Text style={styles.welcomeText}>Welcome to the</Text>
                                        <Text style={styles.heroTitle}>Ryder Cup Experience</Text>

                                        <Pressable onPress={goNext} style={({ pressed }) => [styles.buttonOuter, pressed && styles.pressed]}>
                                            <View style={styles.buttonInner}>
                                                <Text style={styles.buttonText}>Click here to continue</Text>
                                            </View>
                                        </Pressable>
                                    </View>
                                </View>
                            </Animated.View>
                        </View>
                    </ImageBackground>
                </Animated.View>
            ) : null}
        </View>
    );
}