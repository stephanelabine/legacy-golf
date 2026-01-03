import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  Pressable,
  Platform,
} from "react-native";

import { ROUTES } from "../navigation/routes";

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground
        source={require("../../assets/landing-hero.jpg")}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.overlay} />

        <View style={styles.content}>
          <View style={styles.brand}>
            <Image
              source={require("../../assets/legacy-logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />

            <Text style={styles.welcome}>WELCOME TO</Text>
            <Text style={styles.title}>Legacy Golf</Text>
            <Text style={styles.tagline}>Build your legacy</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.NEW_ROUND)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start a new round"
            >
              <Text style={styles.btnPrimaryText}>Start Round</Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate(ROUTES.PROFILE)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open player profile"
            >
              <Text style={styles.btnGhostText}>Player Profile</Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate(ROUTES.HISTORY)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open round history"
            >
              <Text style={styles.btnGhostText}>History</Text>
            </Pressable>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 28,
    justifyContent: "space-between",
  },
  brand: {
    alignItems: "center",
    paddingTop: 28,
  },
  logo: {
    width: 170,
    height: 170,
    marginBottom: 14,
  },
  welcome: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    letterSpacing: 2.2,
    fontWeight: "700",
    marginBottom: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 0.3,
    textAlign: "center",
    marginBottom: 6,
  },
  tagline: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  actions: {
    gap: 12,
  },
  btn: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: {
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  btnPrimaryText: {
    color: "#0A0F1A",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  btnGhost: {
    backgroundColor: "rgba(0,0,0,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  btnGhostText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: Platform.OS === "ios" ? 0.85 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
