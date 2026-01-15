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

  rightLabel,
  onRightPress,
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
            if (navigation?.goBack && canGoBack) navigation.goBack();
            else navigation?.navigate?.("Home");
          }}
          hitSlop={12}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        >
          <Text style={styles.pillText}>Back</Text>
        </Pressable>

        <View style={styles.center}>
          <Text style={styles.title} numberOfLines={1}>
            {title || ""}
          </Text>
          {!!subtitle ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightLabel ? (
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

  rightSpacer: { minWidth: 70, height: 38 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
