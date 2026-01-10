// src/components/ScreenHeader.js
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";

export default function ScreenHeader({
  navigation,
  title = "",
  subtitle = "",
  right = null,
  showBack = true,
  fallbackRoute = ROUTES.HOME,
}) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  // Slightly reduce the perceived “dead space” at the very top while staying safe.
  const topPad = Math.max(0, (insets?.top || 0) - 8);

  function onBack() {
    if (!navigation) return;
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate(fallbackRoute);
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: topPad,
          backgroundColor: theme.bg,
          borderBottomColor: theme.divider,
        },
      ]}
    >
      <View
        style={[
          styles.topGlowA,
          {
            backgroundColor: isDark ? "rgba(46,125,255,0.22)" : "rgba(29,53,87,0.10)",
            opacity: isDark ? 0.35 : 0.20,
          },
        ]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.topGlowB,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(69,123,157,0.10)",
            opacity: isDark ? 0.18 : 0.14,
          },
        ]}
        pointerEvents="none"
      />

      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={({ pressed }) => [
              styles.pill,
              {
                borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(10,15,26,0.12)",
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.04)",
              },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.pillText, { color: theme.text }]}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.sideSpacer} />
        )}

        <View style={styles.center}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>

          {!!subtitle ? (
            <Text style={[styles.sub, { color: theme.muted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.rightWrap}>{right}</View> : <View style={styles.sideSpacer} />}
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
    overflow: "hidden",
  },

  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    minHeight: 62,
  },

  pill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  pillText: { fontWeight: "900", fontSize: 13 },

  sideSpacer: { minWidth: 70, height: 38 },

  rightWrap: {
    minWidth: 70,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 2,
  },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
    textAlign: "center",
  },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.9 : 0.92,
    transform: [{ scale: 0.99 }],
  },
});
