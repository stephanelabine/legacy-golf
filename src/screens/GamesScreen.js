import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Alert, ScrollView } from "react-native";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import BottomSheet from "../components/BottomSheet";
import ScreenHeader from "../components/ScreenHeader";
import gameFormats from "../data/gameFormats.json";

const GAMES = [
  {
    id: "legacy_card",
    title: "Legacy Card",
    subtitle: "Premium tournament format. The heart of Legacy Golf.",
    supported: true,
    premium: true,
  },

  { id: "stroke_play", title: "Stroke Play", subtitle: "Total strokes over 18 holes. The classic.", supported: true },
  { id: "match_play", title: "Match Play", subtitle: "Win holes, not strokes.", supported: true },
  { id: "kps", title: "KPs (Closest to the Pin)", subtitle: "Track KPs + payouts.", supported: true },
  { id: "skins", title: "Skins", subtitle: "Win holes outright for skins.", supported: true },
  { id: "two_v_two", title: "2v2", subtitle: "Teams, presses, totals.", supported: true },
  { id: "nassau", title: "Nassau", subtitle: "Front 9, Back 9, and Total match.", supported: true },
  { id: "stableford", title: "Stableford", subtitle: "Points per hole based on score vs par.", supported: true },
  { id: "wolf", title: "Wolf", subtitle: "Rotating captain chooses a partner.", supported: true },
  { id: "snake", title: "Snake", subtitle: "3-putt tracker with payouts.", supported: true },
  { id: "legacy_points", title: "Legacy Points", subtitle: "Points-based competition, Legacy-style.", supported: true },

  {
    id: "more_soon",
    title: "More games to come…",
    subtitle: "We’re building the full suite next.",
    supported: false,
    infoOnly: true,
  },
];

export default function GamesScreen({ navigation }) {
  const [selectedId, setSelectedId] = useState(null);
  const [infoId, setInfoId] = useState(null);

  const items = useMemo(() => {
    return [
      { type: "section", id: "formats", title: "Game Formats", subtitle: "Choose how you’re playing today." },
      ...GAMES.map((g) => ({ type: "game", rowId: `g-${g.id}`, ...g })),
    ];
  }, []);

  const selected = useMemo(() => GAMES.find((x) => x.id === selectedId), [selectedId]);
  const selectedSupported = !!selected?.supported;

  function onContinue() {
    if (!selectedId) {
      Alert.alert("Select game to continue");
      return;
    }
    if (!selectedSupported) return;

    navigation.navigate(ROUTES.GAME_SETUP, {
      gameId: selected.id,
      gameTitle: selected.title,
    });
  }

  const info = infoId ? gameFormats?.[infoId] : null;

  function openInfo(id) {
    const exists = !!gameFormats?.[id];
    if (!exists) return;
    setInfoId(id);
  }

  function closeInfo() {
    setInfoId(null);
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
    const infoable = !!gameFormats?.[item.id];

    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          if (item.infoOnly) return;
          setSelectedId((prev) => (prev === item.id ? null : item.id));
        }}
        style={({ pressed }) => [
          styles.card,
          item.premium && styles.cardPremium,
          active && !item.premium && styles.cardActive,
          active && item.premium && styles.cardPremiumActive,
          disabled && styles.cardDisabled,
          pressed && !disabled && !item.infoOnly && styles.pressed,
        ]}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, item.premium && styles.cardTitlePremium]}>{item.title}</Text>

          {item.infoOnly ? null : active ? (
            <Text style={[styles.pillActive, item.premium && styles.pillPremiumActive]}>Selected</Text>
          ) : null}
        </View>

        <Text style={[styles.cardSub, item.premium && styles.cardSubPremium]}>{item.subtitle}</Text>

        <View style={styles.cardBottom}>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => openInfo(item.id)}
            disabled={!infoable}
            style={({ pressed }) => [
              styles.infoBtn,
              !infoable && styles.infoBtnDisabled,
              pressed && infoable && styles.infoPressed,
            ]}
            hitSlop={10}
          >
            <Text style={styles.infoText}>Info</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Games" subtitle="Pick a format, then we’ll start your round." />

      <FlatList
        data={items}
        keyExtractor={(it) => it.rowId || it.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <Pressable onPress={onContinue} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      </View>

      <BottomSheet visible={!!info} onClose={closeInfo}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{info?.title || ""}</Text>
          <Text style={styles.sheetSub}>{info?.subtitle || ""}</Text>
        </View>

        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyContent} showsVerticalScrollIndicator={false}>
          {(info?.details || []).map((block, idx) => (
            <View key={`${block.heading}-${idx}`} style={styles.detailBlock}>
              <Text style={styles.detailHeading}>{block.heading}</Text>
              <Text style={styles.detailBody}>{block.body}</Text>
            </View>
          ))}

          <Pressable onPress={closeInfo} style={({ pressed }) => [styles.sheetCloseBtn, pressed && styles.pressed]}>
            <Text style={styles.sheetCloseText}>Done</Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140 },

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
  cardActive: { borderColor: "rgba(46,125,255,0.9)", backgroundColor: "rgba(46,125,255,0.10)" },
  cardDisabled: { opacity: 0.55 },

  cardPremium: { borderColor: "rgba(255, 210, 92, 0.55)", backgroundColor: "rgba(255, 210, 92, 0.10)" },
  cardPremiumActive: { borderColor: "rgba(255, 210, 92, 0.95)", backgroundColor: "rgba(255, 210, 92, 0.16)" },
  cardTitlePremium: { letterSpacing: 0.2 },
  cardSubPremium: { opacity: 0.78 },

  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: theme?.colors?.text || "#fff", fontSize: 18, fontWeight: "900" },
  cardSub: { marginTop: 8, color: theme?.colors?.text || "#fff", opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  cardBottom: { marginTop: 12, flexDirection: "row", alignItems: "center" },

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
  pillPremiumActive: { backgroundColor: "rgba(255, 210, 92, 0.22)", borderColor: "rgba(255, 210, 92, 0.65)" },

  infoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  infoBtnDisabled: { opacity: 0.3 },
  infoText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  infoPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.colors?.bg || "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  primaryBtn: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme?.colors?.primary || "#2E7DFF" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  sheetHeader: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 },
  sheetTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  sheetSub: { marginTop: 6, color: "#fff", opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  sheetBody: { maxHeight: 520 },
  sheetBodyContent: { paddingHorizontal: 18, paddingBottom: 22 },

  detailBlock: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  detailHeading: { color: "#fff", fontSize: 13, fontWeight: "900", letterSpacing: 0.6, opacity: 0.9 },
  detailBody: { marginTop: 8, color: "#fff", opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

  sheetCloseBtn: {
    marginTop: 14,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  sheetCloseText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
});
