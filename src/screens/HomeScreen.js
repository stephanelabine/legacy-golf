import React from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Image,
  Pressable,
} from "react-native";

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      {/* TOP BAR */}
      <View style={styles.top}>
        <Pressable onPress={() => navigation.navigate("Home")}>
          <Image
            source={require("../../assets/legacy-logo.png")}
            style={styles.logo}
            resizeMode="cover"
          />
        </Pressable>

        <View style={styles.topText}>
          <Text style={styles.welcome}>WELCOME TO</Text>
          <Text style={styles.title}>Legacy Golf</Text>
          <Text style={styles.tagline}>Play the round, build your Legacy</Text>
        </View>
      </View>

      {/* HERO IMAGE */}
      <ImageBackground
        source={require("../../assets/landing-hero.jpg")}
        style={styles.hero}
        resizeMode="cover"
      />

      {/* BOTTOM */}
      <View style={styles.bottom}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.navigate("NewRound")}
        >
          <Text style={styles.primaryText}>Start Round</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate("NewRound")}
        >
          <Text style={styles.secondaryText}>Join Round</Text>
        </Pressable>

        <View style={styles.row}>
          <Pressable
            style={styles.smallBtn}
            onPress={() => navigation.navigate("History")}
          >
            <Text style={styles.smallText}>Legacy</Text>
          </Pressable>

          <Pressable
            style={styles.smallBtn}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={styles.smallText}>Player Profile</Text>
          </Pressable>
        </View>

        <Text style={styles.supporter}>Add Supporter · $10/year</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0E3A5A",
  },

  top: {
    backgroundColor: "#0E3A5A",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },

  logo: {
    width: 64,
    height: 64,
  },

  topText: {
    flex: 1,
    alignItems: "center",
    paddingRight: 64,
  },

  welcome: {
    color: "#fff",
    fontSize: 14,
    letterSpacing: 2,
  },

  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2,
  },

  tagline: {
    color: "#fff",
    fontSize: 14,
    marginTop: 6,
  },

  hero: {
    flex: 1,
    width: "100%",
  },

  bottom: {
    backgroundColor: "#0E3A5A",
    padding: 16,
    alignItems: "center",
  },

  primaryBtn: {
    width: "100%",
    backgroundColor: "#1E7F4F",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  primaryText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  secondaryBtn: {
    width: "100%",
    marginTop: 12,
    borderWidth: 2,
    borderColor: "#fff",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },

  secondaryText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },

  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    width: "100%",
  },

  smallBtn: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },

  smallText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  supporter: {
    marginTop: 12,
    color: "#fff",
    fontSize: 14,
    opacity: 0.9,
  },
});
