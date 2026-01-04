import React from "react";
import { View, Image, StyleSheet } from "react-native";

export default function SplashOverlay() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/splash-full.png")}
        style={styles.img}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  img: {
    width: "100%",
    height: "100%",
  },
});
