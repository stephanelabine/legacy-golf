import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";

export default function ScreenHeader({
  navigation,
  title = "",
  subtitle = "",
  right = null,
  showBack = true,
  fallbackRoute = ROUTES.HOME,
}) {
  const insets = useSafeAreaInsets();

  function onBack() {
    if (!navigation) return;
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate(fallbackRoute);
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.topGlowA} pointerEvents="none" />
      <View style={styles.topGlowB} pointerEvents="none" />

      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.pillText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.sideSpacer} />
        )}

        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? (
          <View style={styles.rightWrap}>{right}</View>
        ) : (
          <View style={styles.sideSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    backgroundColor: "#0B1220",
  },

  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
  },

  pill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  pillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  sideSpacer: { minWidth: 70, height: 38 },

  rightWrap: { minWidth: 70, alignItems: "flex-end" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
  sub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.60)",
    fontSize: 12,
    fontWeight: "800",
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
