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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import ROUTES from "../navigation/routes";

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
            <Text style={styles.tagline}>Start building your legacy</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.GAMES)}
              style={({ pressed }) => [
                styles.btn,
                styles.btnPrimary,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.btnRow}>
                <MaterialCommunityIcons name="golf-tee" size={18} color="#0A0F1A" />
                <Text style={styles.btnPrimaryText}>Start Round</Text>
              </View>
            </Pressable>

            <View style={styles.quickCard}>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.HISTORY)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressed]}
              >
                <View style={styles.quickLeft}>
                  <View style={styles.quickIcon}>
                    <MaterialCommunityIcons name="history" size={18} color="#fff" />
                  </View>
                  <Text style={styles.quickText}>History</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.70)" />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.PROFILE)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressed]}
              >
                <View style={styles.quickLeft}>
                  <View style={styles.quickIcon}>
                    <MaterialCommunityIcons name="account" size={18} color="#fff" />
                  </View>
                  <Text style={styles.quickText}>Player Profile</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.70)" />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                onPress={() => navigation.navigate(ROUTES.BUDDIES)}
                style={({ pressed }) => [styles.quickRow, pressed && styles.pressed]}
              >
                <View style={styles.quickLeft}>
                  <View style={styles.quickIcon}>
                    <MaterialCommunityIcons name="account-multiple" size={18} color="#fff" />
                  </View>
                  <Text style={styles.quickText}>Buddy List</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.70)" />
              </Pressable>
            </View>
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
  brand: { alignItems: "center", paddingTop: 28 },
  logo: { width: 170, height: 170, marginBottom: 14 },

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
    textAlign: "center",
  },

  actions: { gap: 12 },

  btn: {
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  btnPrimary: { backgroundColor: "rgba(255,255,255,0.92)" },
  btnPrimaryText: {
    color: "#0A0F1A",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  quickCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.28)",
    overflow: "hidden",
  },
  quickRow: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  quickText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)" },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.85 : 0.9,
    transform: [{ scale: 0.99 }],
  },
});
