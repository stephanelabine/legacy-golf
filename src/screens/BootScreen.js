import React, { useEffect } from "react";
import { View, StyleSheet, ImageBackground, ActivityIndicator } from "react-native";
import { COLORS } from "../theme.js";

export default function BootScreen({ navigation }) {
  useEffect(() => {
    const t = setTimeout(() => {
      navigation.replace("Home");
    }, 2200);

    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <View style={styles.wrap}>
      <ImageBackground
        source={require("../../assets/splash-full.png")}
        style={styles.bg}
        resizeMode="contain"
      >
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color={COLORS.white} />
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#0E3A5A", // matches your splash vibe
  },
  bg: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
  },
  loaderWrap: {
    paddingBottom: 42,
    alignItems: "center",
  },
});

