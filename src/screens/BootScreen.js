// src/screens/BootScreen.js
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Image, ImageBackground, Animated, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Easing } from "react-native";

const TOTAL_MS = 3500;

// Phase timings (must sum to TOTAL_MS)
const T0_BG_ONLY_MS = 350;
const T1_ZOOM_IN_MS = 1600;
const T2_HOLD_MS = 1200;
const T3_FADE_OUT_MS = 350;

export default function BootScreen() {
  const insets = useSafeAreaInsets();

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.045)).current; // start smaller
  const logoY = useRef(new Animated.Value(26)).current;
  const fadeOut = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    logoOpacity.setValue(0);
    logoScale.setValue(0.045);
    logoY.setValue(26);
    fadeOut.setValue(0);

    const anim = Animated.sequence([
      Animated.delay(T0_BG_ONLY_MS),

      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1.95,
          duration: T1_ZOOM_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoY, {
          toValue: 0,
          duration: T1_ZOOM_IN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(T2_HOLD_MS),

      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: T3_FADE_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeOut, {
          toValue: 1,
          duration: T3_FADE_OUT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    anim.start();

    return () => {
      anim.stop?.();
    };
  }, [logoOpacity, logoScale, logoY, fadeOut]);

  return (
    <View style={styles.root}>
      <ImageBackground source={require("../../assets/splash-bg.png")} style={styles.bg} resizeMode="cover">
        <Animated.View pointerEvents="none" style={[styles.endFade, { opacity: fadeOut }]} />

        <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Animated.View style={{ opacity: logoOpacity, transform: [{ translateY: logoY }, { scale: logoScale }] }}>
            <Image
              source={require("../../assets/legacy-logo-transparent.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bg: { flex: 1 },
  endFade: { ...StyleSheet.absoluteFillObject, backgroundColor: "#070A10" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: {
    width: Platform.OS === "ios" ? 310 : 290,
    height: Platform.OS === "ios" ? 310 : 290,
  },
});
