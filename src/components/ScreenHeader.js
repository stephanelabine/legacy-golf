// src/components/ScreenHeader.js
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = "#0B1220";
const WHITE = "#FFFFFF";

export default function ScreenHeader({
  navigation,
  title,
  subtitle,
  safeTop = true,

  // Existing API (kept for backward compatibility)
  rightLabel,
  onRightPress,

  // New API (optional): pass a custom React element for the right side
  right,

  // NEW: left controls (optional)
  leftLabel = "Back",
  onLeftPress,

  // NEW: title controls (optional)
  titleNumberOfLines = 1,
  titleAutoShrink = false,
  titleMinFontScale = 0.78,
}) {
  const insets = useSafeAreaInsets();
  const rawTop = insets?.top || 0;
  const topInset = safeTop ? rawTop : Math.max(8, rawTop - 10);

  const canGoBack = !!navigation?.canGoBack?.();

  return (
    <View style={[styles.wrap, { paddingTop: topInset }]}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            if (typeof onLeftPress === "function") {
              onLeftPress();
              return;
            }
            if (navigation?.goBack && canGoBack) navigation.goBack();
            else navigation?.navigate?.("Home");
          }}
          hitSlop={12}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        >
          <Text style={styles.pillText}>{leftLabel || "Back"}</Text>
        </Pressable>

        <View style={styles.center}>
          <Text
            style={styles.title}
            numberOfLines={titleNumberOfLines}
            adjustsFontSizeToFit={!!titleAutoShrink}
            minimumFontScale={titleMinFontScale}
          >
            {title || ""}
          </Text>

          {!!subtitle ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? (
          <View style={styles.rightWrap}>{right}</View>
        ) : rightLabel ? (
          <Pressable
            onPress={onRightPress}
            hitSlop={12}
            style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
          >
            <Text style={styles.pillText}>{rightLabel}</Text>
          </Pressable>
        ) : (
          <View style={styles.rightSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: BG,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

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
  pillText: { color: WHITE, fontWeight: "900", fontSize: 13 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  title: { color: WHITE, fontSize: 22, fontWeight: "900", letterSpacing: 0.4 },
  sub: { marginTop: 4, color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: "800" },

  rightWrap: { minWidth: 70, height: 38, alignItems: "flex-end", justifyContent: "center" },
  rightSpacer: { minWidth: 70, height: 38 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
