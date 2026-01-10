import React, { useMemo } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable } from "react-native";

import ScreenHeader from "../components/ScreenHeader";

const BG = "#0B1220";
const CARD = "rgba(255,255,255,0.05)";
const BORDER = "rgba(255,255,255,0.14)";
const MUTED = "rgba(255,255,255,0.65)";
const WHITE = "#FFFFFF";

export default function HazardsScreen({ navigation, route }) {
  const params = route?.params || {};

  const subtitle = useMemo(() => {
    const parts = [];
    if (params?.teeName) parts.push(params.teeName);
    if (params?.hole) parts.push(`Hole ${params.hole}`);
    return parts.join(" • ") || "Hazards";
  }, [params?.teeName, params?.hole]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Hazards" subtitle={subtitle} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hazards (wired)</Text>
          <Text style={styles.cardSub}>
            Next we’ll feed this real per-hole hazard data (water, bunkers, OB, carry points) and show it with clean chips
            and a mini-map overlay.
          </Text>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Water</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Bunkers</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Out of Bounds</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Carry / Layup</Text>
            </View>
          </View>

          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    marginBottom: 12,
  },

  cardTitle: { color: WHITE, fontSize: 15, fontWeight: "900" },
  cardSub: { marginTop: 6, color: MUTED, fontSize: 12, fontWeight: "800", lineHeight: 17 },

  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14, marginBottom: 14 },

  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  pill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { color: WHITE, fontWeight: "900", fontSize: 12, opacity: 0.92 },

  cta: {
    marginTop: 14,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.30)",
  },
  ctaText: { color: WHITE, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
