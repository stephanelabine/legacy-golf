import React, { useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import ROUTES from "../navigation/routes";

const BG = "#000000";
const CARD = "#1D3557";
const INNER = "#243E63";
const INNER2 = "#2A4A76";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const ORANGE = "#F39C12";
const ORANGE_TEXT = "#1B1200";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4];
const DEFAULT_SI = [10, 2, 16, 4, 12, 6, 14, 8, 18, 1, 15, 3, 11, 5, 13, 7, 17, 9];

function buildDefaultHoleMeta() {
  const meta = {};
  for (let i = 1; i <= 18; i++) meta[String(i)] = { par: DEFAULT_PARS[i - 1], si: DEFAULT_SI[i - 1] };
  return meta;
}

export default function HoleViewScreen({ navigation, route }) {
  const params = route?.params || {};

  const courseParam = params.course;
  const teeParam = params.tee;

  const courseName =
    params.courseName ??
    courseParam?.name ??
    courseParam?.courseName ??
    (typeof courseParam === "string" ? courseParam : "Course");

  const teeName =
    teeParam?.name ??
    (typeof teeParam === "string" ? teeParam : "Tees");

  const players = params.players || [];
  const roundId = params.roundId ?? null;

  const [currentHole, setCurrentHole] = useState(params.hole || 1);
  const [mode, setMode] = useState("hole");

  const holeMeta = useMemo(() => {
    return params.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
  }, [params.holeMeta]);

  const par = holeMeta?.[String(currentHole)]?.par ?? 4;

  const yardages = { front: 145, middle: 158, back: 172 };
  const hazards = [
    { label: "Bunker (right)", yards: 120 },
    { label: "Water (left)", yards: 150 },
  ];
  const greenInfo = "Front pin • Slight back-to-front slope";

  function openScoreEntry() {
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      hole: currentHole,
      holeMeta,
      roundId,
    });
  }

  function openScorecard() {
    navigation.navigate(ROUTES.SCORECARD, {
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
      roundId,
    });
  }

  function openHoleMap() {
    navigation.navigate(ROUTES.HOLE_MAP, {
      roundId,
      holeIndex: currentHole - 1,
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.course} numberOfLines={1}>{courseName}</Text>
        <Text style={styles.sub}>{teeName} • Hole {currentHole} • Par {par}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.holePills}>
        {Array.from({ length: 18 }).map((_, i) => {
          const h = i + 1;
          const active = h === currentHole;
          return (
            <Pressable key={h} onPress={() => setCurrentHole(h)} style={[styles.holePill, active && styles.holePillActive]}>
              <Text style={[styles.holePillText, active && styles.holePillTextActive]}>{h}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.modeRow}>
        {["hole", "green", "hazards"].map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeBtn, mode === m && styles.modeBtnActive]}>
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
              {m === "hole" ? "Hole View" : m === "green" ? "Green View" : "Hazards"}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={openHoleMap} style={styles.mapCard}>
        <Text style={styles.mapTitle}>Hole View</Text>
        <Text style={styles.mapSub}>Tap to open full-screen GPS</Text>
      </Pressable>

      <View style={styles.yardageRow}>
        {["front", "middle", "back"].map((k) => (
          <View key={k} style={styles.yardCard}>
            <Text style={styles.yardLabel}>{k.toUpperCase()}</Text>
            <Text style={styles.yardValue}>{yardages[k]}</Text>
            <Text style={styles.yardUnit}>yards</Text>
          </View>
        ))}
      </View>

      {mode === "hole" && (
        <View style={styles.infoRow}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Hazards</Text>
            {hazards.map((h, i) => (
              <Text key={i} style={styles.infoText}>• {h.label} ~ {h.yards}y</Text>
            ))}
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Green View</Text>
            <Text style={styles.infoText}>{greenInfo}</Text>
          </View>
        </View>
      )}

      {mode === "green" && (
        <View style={styles.singleCard}>
          <Text style={styles.infoTitle}>Green View Details</Text>
          <Text style={styles.infoText}>{greenInfo}</Text>
        </View>
      )}

      {mode === "hazards" && (
        <View style={styles.singleCard}>
          <Text style={styles.infoTitle}>Hazards</Text>
          {hazards.map((h, i) => (
            <Text key={i} style={styles.infoText}>• {h.label} — {h.yards}y</Text>
          ))}
        </View>
      )}

      <View style={styles.footer}>
        <Pressable style={styles.greenBtn} onPress={openScoreEntry}>
          <Text style={styles.greenText}>Input Scores</Text>
        </Pressable>

        <Pressable style={styles.orangeBtn} onPress={openScorecard}>
          <Text style={styles.orangeText}>Scorecard</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: { padding: 16, paddingBottom: 8 },
  course: { color: WHITE, fontSize: 20, fontWeight: "900" },
  sub: { color: MUTED, fontSize: 14, marginTop: 4, fontWeight: "700" },

  holePills: { paddingHorizontal: 12, paddingBottom: 8 },
  holePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  holePillActive: { backgroundColor: GREEN },
  holePillText: { color: WHITE, fontWeight: "900" },
  holePillTextActive: { color: GREEN_TEXT },

  modeRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 6 },
  modeBtn: { flex: 1, height: 46, borderRadius: 18, backgroundColor: INNER2, alignItems: "center", justifyContent: "center" },
  modeBtnActive: { backgroundColor: GREEN },
  modeText: { color: WHITE, fontWeight: "900" },
  modeTextActive: { color: GREEN_TEXT },

  mapCard: { marginHorizontal: 16, marginTop: 10, height: 170, borderRadius: 22, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  mapTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },
  mapSub: { color: MUTED, marginTop: 8, fontWeight: "700", fontSize: 14 },

  yardageRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 14 },
  yardCard: { flex: 1, backgroundColor: CARD, borderRadius: 20, alignItems: "center", paddingVertical: 14 },
  yardLabel: { color: MUTED, fontSize: 11, fontWeight: "900" },
  yardValue: { color: WHITE, fontSize: 30, fontWeight: "900", marginTop: 6 },
  yardUnit: { color: MUTED, fontSize: 12, fontWeight: "700" },

  infoRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 14 },
  infoCard: { flex: 1, backgroundColor: CARD, borderRadius: 20, padding: 14 },
  singleCard: { marginHorizontal: 16, marginTop: 14, backgroundColor: CARD, borderRadius: 20, padding: 14 },
  infoTitle: { color: WHITE, fontWeight: "900", marginBottom: 6 },
  infoText: { color: MUTED, fontSize: 13, marginTop: 4, fontWeight: "700" },

  footer: { padding: 16, gap: 10 },
  greenBtn: { height: 56, borderRadius: 999, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
  greenText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },
  orangeBtn: { height: 52, borderRadius: 999, backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" },
  orangeText: { color: ORANGE_TEXT, fontSize: 16, fontWeight: "900" },
});
