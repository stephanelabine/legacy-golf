import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import ScreenHeader from "../components/ScreenHeader";

function formatHazard(h) {
  const label = String(h?.label || "Hazard").trim();
  const yards = Number(h?.yards);
  const y = Number.isFinite(yards) ? `${Math.round(yards)}y` : "—";
  const kind = h?.type ? String(h.type).toUpperCase() : "";
  return { label, y, kind };
}

export default function HoleStrategyScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const hole = route?.params?.hole ?? 1;

  const hazards = useMemo(() => {
    const list = Array.isArray(route?.params?.hazards) ? route.params.hazards : [];
    if (list.length) return list;

    // safe placeholder until we wire real course hazards
    return [
      { type: "Bunker", label: "Bunker (right)", yards: 120 },
      { type: "Water", label: "Water (left)", yards: 150 },
      { type: "Trees", label: "Tree line (right)", yards: 205 },
    ];
  }, [route?.params?.hazards]);

  const carries = useMemo(() => {
    const ys = hazards
      .map((h) => Number(h?.yards))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const carry1 = ys[0] ?? null;
    const carry2 = ys[1] ?? null;

    return { carry1, carry2 };
  }, [hazards]);

  const strategy = useMemo(() => {
    const note = String(route?.params?.strategy || "").trim();
    if (note) return note;

    const c1 = carries.carry1 ? `${Math.round(carries.carry1)}y` : "—";
    const c2 = carries.carry2 ? `${Math.round(carries.carry2)}y` : "—";

    return `Play to the fat side. First meaningful carry is around ${c1}. If you’re aggressive, the next risk window shows around ${c2}. Default miss: short/center.`;
  }, [route?.params?.strategy, carries]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Hazards + Strategy"
        subtitle={`Hole ${hole}`}
      />

      <View style={[styles.wrap, { paddingBottom: 18 + insets.bottom }]}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hole Strategy</Text>
          <Text style={styles.cardBody}>{strategy}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hazards</Text>

          <View style={styles.list}>
            {hazards.map((h, idx) => {
              const row = formatHazard(h);
              return (
                <View key={`${row.label}-${idx}`} style={styles.hRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.hLabel} numberOfLines={1}>
                      {row.label}
                    </Text>
                    {!!row.kind ? (
                      <Text style={styles.hKind} numberOfLines={1}>
                        {row.kind}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.yPill}>
                    <Text style={styles.yText}>{row.y}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.hint}>
            Next: we’ll pull hazards + carries from your course data per hole and tee.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  wrap: { flex: 1, padding: 16, gap: 12 },

  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  cardBody: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "800", lineHeight: 18 },

  list: { marginTop: 12, gap: 10 },
  hRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  hLabel: { color: "#fff", fontSize: 13, fontWeight: "900" },
  hKind: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },

  yPill: {
    minWidth: 74,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
    backgroundColor: "rgba(46,125,255,0.14)",
  },
  yText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  hint: { marginTop: 12, color: "rgba(255,255,255,0.58)", fontWeight: "800", fontSize: 12, lineHeight: 17 },
});
