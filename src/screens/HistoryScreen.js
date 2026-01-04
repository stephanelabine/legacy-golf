import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Animated,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";
import { deleteRound, getRounds } from "../storage/rounds";

function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

function calcTotals(round) {
  const players = Array.isArray(round?.players) ? round.players : [];
  const holes = Array.isArray(round?.holes) ? round.holes : [];

  const totals = {};
  players.forEach((p) => (totals[p.id] = 0));

  for (const h of holes) {
    const scores = h?.scores || {};
    for (const p of players) {
      const v = scores?.[p.id];
      if (typeof v === "number" && Number.isFinite(v)) totals[p.id] += v;
    }
  }
  return totals;
}

function SwipeRow({ onOpen, onDelete, children }) {
  const ACTION_W = 112;

  // 🔒 increased resistance + thresholds
  const DRAG_SCALE = 0.65;        // lower = heavier swipe
  const INTENT_THRESHOLD = 24;    // must move this far before responder activates
  const SNAP_THRESHOLD = 78;      // must pass this to lock open

  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const startXRef = useRef(0);

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const animateTo = (to) => {
    offsetRef.current = to;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      speed: 16,
      bounciness: 0,
    }).start();
  };

  const close = () => animateTo(0);
  const openRight = () => animateTo(ACTION_W);
  const openLeft = () => animateTo(-ACTION_W);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > INTENT_THRESHOLD && ax > ay * 1.3;
      },
      onPanResponderGrant: () => {
        startXRef.current = offsetRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const scaledDx = g.dx * DRAG_SCALE;
        const next = clamp(startXRef.current + scaledDx, -ACTION_W, ACTION_W);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const scaledDx = g.dx * DRAG_SCALE;
        const finalX = clamp(startXRef.current + scaledDx, -ACTION_W, ACTION_W);

        if (finalX > SNAP_THRESHOLD) openRight();
        else if (finalX < -SNAP_THRESHOLD) openLeft();
        else close();
      },
      onPanResponderTerminate: close,
    })
  ).current;

  return (
    <View style={styles.rowOuter}>
      <View style={styles.rowClip}>
        <View style={styles.underlay}>
          <View style={[styles.side, styles.sideLeft]}>
            <Pressable onPress={onOpen} style={styles.sideBtn}>
              <Text style={styles.sideText}>Edit</Text>
            </Pressable>
          </View>

          <View style={[styles.side, styles.sideRight]}>
            <Pressable onPress={onDelete} style={styles.sideBtn}>
              <Text style={styles.sideText}>Delete</Text>
            </Pressable>
          </View>
        </View>

        <Animated.View
          style={[styles.foreground, { transform: [{ translateX }] }]}
          {...panResponder.panHandlers}
        >
          <Pressable
            onPress={() => {
              if (offsetRef.current !== 0) close();
              else onOpen();
            }}
          >
            {children}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

export default function HistoryScreen({ navigation }) {
  const [rounds, setRounds] = useState([]);

  async function load() {
    const list = await getRounds();
    setRounds(Array.isArray(list) ? list : []);
  }

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation]);

  const sorted = useMemo(
    () =>
      [...rounds].sort(
        (a, b) =>
          new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      ),
    [rounds]
  );

  function openRound(roundId) {
    navigation.navigate(ROUTES.SCORE_ENTRY, { roundId });
  }

  function confirmDelete(roundId) {
    Alert.alert("Delete round?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteRound(roundId);
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.h1}>History</Text>
        <Pressable onPress={load} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const totals = calcTotals(item);
          const players = item.players || [];
          const summary =
            players.length > 0
              ? players.map((p) => `${p.name}: ${totals[p.id] || 0}`).join(" • ")
              : "No players";

          return (
            <SwipeRow
              onOpen={() => openRound(item.id)}
              onDelete={() => confirmDelete(item.id)}
            >
              <View style={styles.card}>
                <Text style={styles.course}>{item.courseName}</Text>
                <Text style={styles.meta}>
                  {formatDate(item.createdAt)} • {item.format} • {item.tees}
                </Text>
                <Text style={styles.summary}>{summary}</Text>
                <Text style={styles.hint}>
                  Swipe left = Delete • Swipe right = Edit
                </Text>
              </View>
            </SwipeRow>
          );
        }}
      />
    </SafeAreaView>
  );
}

const CARD_BG = "#101A2A";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  h1: { color: "#fff", fontSize: 24, fontWeight: "900" },

  refreshBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  refreshText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  rowOuter: { marginBottom: 12 },
  rowClip: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  underlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  side: {
    width: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  sideLeft: { backgroundColor: "rgba(46,125,255,0.18)" },
  sideRight: {
    marginLeft: "auto",
    backgroundColor: "rgba(255,59,48,0.18)",
  },
  sideBtn: {
    width: 92,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  sideText: { color: "#fff", fontWeight: "900" },

  foreground: { width: "100%" },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 14,
  },
  course: { color: "#fff", fontSize: 16, fontWeight: "900" },
  meta: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginVertical: 6,
    fontWeight: "800",
  },
  summary: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "800",
  },
  hint: {
    marginTop: 8,
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "800",
  },
});
