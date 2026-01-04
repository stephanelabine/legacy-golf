import React, { useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import theme from "../theme";
import ROUTES from "../navigation/routes";

const GAMES = [
  { id: "stroke_play", title: "Stroke Play", subtitle: "Total strokes over 18 holes. The classic.", supported: true },
  { id: "match_play", title: "Match Play", subtitle: "Win holes, not strokes.", supported: true },
  { id: "kps", title: "KPs (Closest to the Pin)", subtitle: "Track KPs + payouts.", supported: false },
  { id: "2v2", title: "2v2", subtitle: "Teams, presses, totals.", supported: false },
  { id: "skins", title: "Skins", subtitle: "Win holes outright for skins.", supported: true },
  { id: "vegas", title: "Vegas", subtitle: "2v2 score-combo game (4 players).", supported: true },
  { id: "nassau", title: "Nassau", subtitle: "Front 9, Back 9, and Total match.", supported: true },
  { id: "stableford", title: "Stableford", subtitle: "Points per hole based on score vs par.", supported: true },
  { id: "wolf", title: "Wolf", subtitle: "Rotating captain chooses a partner.", supported: false },
  { id: "snake", title: "Snake", subtitle: "3-putt tracker with payouts.", supported: false },
];

export default function GamesScreen({ navigation }) {
  const [selectedId, setSelectedId] = useState("stroke_play");

  const items = useMemo(() => {
    return [
      { type: "section", id: "formats", title: "Game Formats", subtitle: "Choose how you’re playing today." },
      ...GAMES.map((g) => ({ type: "game", rowId: `g-${g.id}`, ...g })),
    ];
  }, []);

  const selected = useMemo(() => GAMES.find((x) => x.id === selectedId), [selectedId]);
  const selectedSupported = !!selected?.supported;

  function onContinue() {
    if (!selectedSupported) return;

    navigation.navigate(ROUTES.NEW_ROUND, {
      gameId: selected.id,
      gameTitle: selected.title,
    });
  }

  function renderItem({ item }) {
    if (item.type === "section") {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
          <Text style={styles.sectionSub}>{item.subtitle}</Text>
        </View>
      );
    }

    const active = item.id === selectedId;
    const disabled = !item.supported;

    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          setSelectedId(item.id);
        }}
        style={({ pressed }) => [
          styles.card,
          active && styles.cardActive,
          disabled && styles.cardDisabled,
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          {disabled ? (
            <Text style={styles.pill}>Soon</Text>
          ) : active ? (
            <Text style={styles.pillActive}>Selected</Text>
          ) : null}
        </View>
        <Text style={styles.cardSub}>{item.subtitle}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.h1}>Games</Text>
        <Text style={styles.h2}>Pick a format, then we’ll start your round.</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.rowId || it.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={onContinue}
          disabled={!selectedSupported}
          style={({ pressed }) => [
            styles.primaryBtn,
            !selectedSupported && styles.primaryBtnDisabled,
            pressed && selectedSupported && styles.pressed,
          ]}
        >
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  h1: { color: theme?.colors?.text || "#fff", fontSize: 34, fontWeight: "900", letterSpacing: 0.2 },
  h2: { marginTop: 6, color: theme?.colors?.text || "#fff", opacity: 0.72, fontSize: 14, fontWeight: "700" },

  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 120 },

  section: { marginTop: 10, marginBottom: 10 },
  sectionTitle: {
    color: theme?.colors?.text || "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.4,
    opacity: 0.75,
    textTransform: "uppercase",
  },
  sectionSub: { marginTop: 6, color: theme?.colors?.text || "#fff", opacity: 0.55, fontSize: 12, fontWeight: "700" },

  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme?.colors?.border || "rgba(255,255,255,0.18)",
    backgroundColor: theme?.colors?.card || "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  cardActive: {
    borderColor: "rgba(46,125,255,0.9)",
    backgroundColor: "rgba(46,125,255,0.10)",
  },
  cardDisabled: { opacity: 0.55 },

  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: theme?.colors?.text || "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: {
    marginTop: 8,
    color: theme?.colors?.text || "#fff",
    opacity: 0.72,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
  },
  pillActive: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(46,125,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.55)",
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.colors?.bg || "#0B1220",
  },
  primaryBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
