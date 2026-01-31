// src/screens/TournamentHubSplashScreen.js
import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  Easing,
  ImageBackground,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

export default function TournamentHubSplashScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  // Background push-in (clean)
  const bgScale = useRef(new Animated.Value(0.76)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;

  // Logo: start VERY small and grow continuously to final
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.16)).current;
  const logoY = useRef(new Animated.Value(22)).current;

  // Text: start VERY small and grow continuously to final
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0.16)).current;
  const textY = useRef(new Animated.Value(18)).current;

  // Flash at landing (subtle)
  const flashOpacity = useRef(new Animated.Value(0)).current;

  // CTA arrives after hero
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    // Background
    Animated.parallel([
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(bgScale, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();

    // Logo: continuous small -> big -> land (no overshoot)
    Animated.sequence([
      Animated.delay(160),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 1250,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(logoY, {
          toValue: 0,
          duration: 1250,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Text: start shortly after logo, also continuous zoom-in
    Animated.sequence([
      Animated.delay(220),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(textScale, {
          toValue: 1,
          duration: 1180,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(textY, {
          toValue: 0,
          duration: 1180,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Subtle flash near landing
    Animated.sequence([
      Animated.delay(1040),
      Animated.timing(flashOpacity, {
        toValue: 0.12,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // CTA reveal
    Animated.sequence([
      Animated.delay(1180),
      Animated.parallel([
        Animated.timing(ctaOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ctaY, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [
    bgOpacity,
    bgScale,
    logoOpacity,
    logoScale,
    logoY,
    textOpacity,
    textScale,
    textY,
    flashOpacity,
    ctaOpacity,
    ctaY,
  ]);

  const styles = useMemo(() => {
    const gold = "rgba(214,170,76,1)";
    const glassStroke = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.10)";
    const ctaBg = isDark ? "rgba(10,12,18,0.10)" : "rgba(10,12,18,0.08)";
    const ctaBorder = isDark ? "rgba(255,210,92,0.78)" : "rgba(255,210,92,0.84)";

    const w = Dimensions.get("window").width;
    const logoW = Math.min(Math.floor(w * 0.98), 720);
    const logoH = Math.floor(logoW * 0.34);

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      bg: { flex: 1, backgroundColor: theme.bg },
      bgImage: { alignSelf: "center" },

      flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#ffffff" },

      logoWrap: {
        position: "absolute",
        left: 0,
        right: 0,
        top: Math.max(54, (insets?.top || 0) + 54),
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
      },

      logo: {
        width: logoW,
        height: logoH,
        resizeMode: "contain",
        opacity: 0.98,
        transform: [{ scale: 1.30 }],
      },

      textCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
        transform: [{ translateY: -80 }],
      },

      welcome: {
        fontFamily: "Cinzel",
        color: "#fff",
        opacity: 0.9,
        fontSize: 17,
        letterSpacing: 2.2,
        textTransform: "uppercase",
        textAlign: "center",
        fontWeight: "800",
      },

      legacy: {
        marginTop: 10,
        fontFamily: "Cinzel",
        color: gold,
        fontSize: 30,
        letterSpacing: 1.6,
        textTransform: "uppercase",
        textAlign: "center",
        fontWeight: "900",
        textShadowColor: "rgba(0,0,0,0.60)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 7,
      },

      hub: {
        marginTop: 8,
        fontFamily: "Cinzel",
        color: "#fff",
        opacity: 0.92,
        fontSize: 17,
        letterSpacing: 2.2,
        textTransform: "uppercase",
        textAlign: "center",
        fontWeight: "800",
      },

      footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: -8,
        paddingHorizontal: 18,
        paddingBottom: Math.max(10, (insets?.bottom || 0) + 6),
        paddingTop: 10,
      },

      ctaCard: {
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 2,
        borderColor: ctaBorder,
        backgroundColor: "transparent",
        shadowColor: "rgba(0,0,0,1)",
        shadowOpacity: isDark ? 0.3 : 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 9,
      },
      ctaInner: {
        borderRadius: 10,
        paddingVertical: 18,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: glassStroke,
        backgroundColor: ctaBg,
        alignItems: "center",
        justifyContent: "center",
      },
      ctaText: {
        color: gold,
        fontSize: 18,
        fontWeight: "900",
        letterSpacing: 0.3,
        textAlign: "center",
        fontFamily: "Cinzel",
        textShadowColor: "rgba(0,0,0,0.55)",
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
      },

      pressed: {
        opacity: Platform.OS === "ios" ? 0.88 : 0.9,
        transform: [{ scale: 0.99 }],
      },
    });
  }, [theme, isDark, insets?.top, insets?.bottom]);

  function start() {
    navigation.replace(ROUTES.TOURNAMENT_ORGANIZER_PROFILE);
  }

  return (
    <View style={styles.screen}>
      <Animated.View style={{ flex: 1, opacity: bgOpacity, transform: [{ scale: bgScale }] }}>
        <ImageBackground
          source={require("../../assets/tournament-hub-splash.jpg")}
          style={styles.bg}
          imageStyle={styles.bgImage}
          resizeMode="cover"
        />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

      <View style={styles.logoWrap} pointerEvents="none">
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ translateY: logoY }, { scale: logoScale }],
            alignItems: "center",
          }}
        >
          <Animated.Image source={require("../../assets/legacy-logo-transparent.png")} style={styles.logo} />
        </Animated.View>
      </View>

      <View style={styles.textCenter} pointerEvents="none">
        <Animated.View
          style={{
            opacity: textOpacity,
            transform: [{ translateY: textY }, { scale: textScale }],
            alignItems: "center",
          }}
        >
          <Text style={styles.welcome}>WELCOME TO THE</Text>
          <Text style={styles.legacy}>LEGACY GOLF</Text>
          <Text style={styles.hub}>TOURNAMENT HUB</Text>
        </Animated.View>
      </View>

      <View style={styles.footer}>
        <Animated.View style={{ opacity: ctaOpacity, transform: [{ translateY: ctaY }] }}>
          <Pressable onPress={start} style={({ pressed }) => [styles.ctaCard, pressed && styles.pressed]}>
            <View style={styles.ctaInner}>
              <Text style={styles.ctaText}>Start your tournament experience now</Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}
