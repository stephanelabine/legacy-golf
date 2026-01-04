import React, { useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import ROUTES from "../navigation/routes";

export default function BootScreen({ navigation }) {
  useEffect(() => {
    const t = setTimeout(() => {
      navigation.replace(ROUTES.HOME);
    }, 1200);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/legacy-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>Legacy Golf</Text>
      <Text style={styles.subtitle}>Play the round. Build your legacy.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 30,
    marginBottom: 8,
  },
  subtitle: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
  },
});
