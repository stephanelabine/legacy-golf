// src/screens/NewRoundScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  Keyboard,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { COURSES_LOCAL } from "../data/coursesLocal";
import { haversineKm } from "../utils/distance";
import { loadActiveRound, saveActiveRound, updateActiveRound } from "../storage/roundState";

const FALLBACK_CENTER = { lat: 49.0504, lng: -122.3045 };
const MAX_KM = 200;

function formatKm(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return "<1 km";
  return `${Math.round(n)} km`;
}

export default function NewRoundScreen({ navigation, route }) {
  const [query, setQuery] = useState("");
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [locationDenied, setLocationDenied] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState(null);

  // Seed Active Round with GameSetup params (gameId, scoringMode, wagers, etc.)
  useEffect(() => {
    let alive = true;

    (async () => {
      const params = route?.params || {};
      const incomingGameId = params?.gameId ?? null;
      const incomingGameTitle = params?.gameTitle ?? null;
      const incomingScoringMode = params?.scoringMode ?? null;
      const incomingWagers = params?.wagers ?? null;

      const existing = await loadActiveRound();
      if (!alive) return;

      const next = {
        ...(existing || {}),
        startedAt: existing?.startedAt || new Date().toISOString(),
        gameId: incomingGameId ?? existing?.gameId ?? null,
        gameTitle: incomingGameTitle ?? existing?.gameTitle ?? null,
        scoringMode: incomingScoringMode ?? existing?.scoringMode ?? "net",
        wagers: incomingWagers ?? existing?.wagers ?? null,
      };

      await saveActiveRound(next);

      if (__DEV__) {
        console.log("[LegacyGolf] Active round seeded on Select Course:", next);
      }
    })();

    return () => {
      alive = false;
    };
  }, [route?.params?.gameId, route?.params?.gameTitle, route?.params?.scoringMode, route?.params?.wagers]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;

        if (status !== "granted") {
          setLocationDenied(true);
          setLoadingLoc(false);
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!active) return;

        setCenter({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLoadingLoc(false);
      } catch {
        if (!active) return;
        setLocationDenied(true);
        setLoadingLoc(false);
      }
    })();

    return () => (active = false);
  }, []);

  const nearbyCourses = useMemo(() => {
    return COURSES_LOCAL.map((c) => {
      const d = haversineKm(center, { lat: c.lat, lng: c.lng });
      return {
        ...c,
        distanceKm: Number.isFinite(d) ? d : 999999,
      };
    })
      .filter((c) => c.distanceKm <= MAX_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [center]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nearbyCourses;
    return nearbyCourses.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, nearbyCourses]);

  function tapCourse(course) {
    Keyboard.dismiss();

    const courseObj = {
      id: course.name.replace(/\s/g, "_").toLowerCase(),
      name: course.name,
      lat: course.lat,
      lng: course.lng,
    };

    setSelectedCourse((prev) => {
      if (prev?.id === courseObj.id) return null; // tap again to unselect
      return courseObj;
    });
  }

  async function onContinue() {
    if (!selectedCourse) return;

    await updateActiveRound({ course: { id: selectedCourse.id, name: selectedCourse.name } });

    if (__DEV__) {
      console.log("[LegacyGolf] Active round updated with course:", selectedCourse);
    }

    navigation.navigate(ROUTES.TEE_SELECTION, {
      course: { id: selectedCourse.id, name: selectedCourse.name },
      ...(route?.params || {}),
    });
  }

  const footerHeight = 92;
  const listBottomPad = footerHeight + 20;

  function renderRow({ item }) {
    const courseObjId = item.name.replace(/\s/g, "_").toLowerCase();
    const active = selectedCourse?.id === courseObjId;

    return (
      <Pressable
        onPress={() => tapCourse(item)}
        style={({ pressed }) => [
          styles.row,
          styles.rowShadow,
          active && styles.rowActive,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.name}
              </Text>

              {active ? (
                <View style={styles.selectedPill}>
                  <Text style={styles.selectedPillText}>Selected</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.rowMeta}>
              <View style={[styles.kmPill, active && styles.kmPillActive]}>
                <Text style={[styles.kmText, active && styles.kmTextActive]}>{formatKm(item.distanceKm)}</Text>
              </View>

              <Text style={styles.rowSub} numberOfLines={1}>
                Tap to select
              </Text>
            </View>
          </View>

          <View style={[styles.chevWrap, active && styles.chevWrapActive]}>
            <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.65)" />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Select Course" subtitle={`Nearby courses within ${MAX_KM} km.`} />

      <View style={styles.topArea}>
        <TextInput
          style={styles.input}
          placeholder="Search course…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />

        {locationDenied ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Location off — showing default nearby</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {loadingLoc ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Finding nearby courses…</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No matches nearby</Text>
            <Text style={styles.emptySub}>Try a different search, or adjust your spelling.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      {/* PREMIUM FOOTER CTA */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.footerLabel}>Course</Text>
            <Text style={styles.footerValue} numberOfLines={1}>
              {selectedCourse ? selectedCourse.name : "None selected"}
            </Text>
          </View>

          <Pressable
            onPress={onContinue}
            disabled={!selectedCourse}
            style={({ pressed }) => [
              styles.continueBtn,
              !selectedCourse && styles.continueBtnDisabled,
              pressed && selectedCourse && styles.pressed,
            ]}
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  topArea: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },

  input: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    fontSize: 14,
    fontWeight: "800",
  },

  banner: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bannerText: { color: "#fff", opacity: 0.72, fontSize: 12, fontWeight: "800" },

  body: { flex: 1 },

  listContent: { paddingHorizontal: 16, paddingTop: 12 },

  row: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 12,
  },
  rowActive: {
    borderColor: "rgba(46,125,255,0.55)",
    backgroundColor: "rgba(46,125,255,0.12)",
  },

  rowShadow: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }),

  rowMain: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },

  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "900", flex: 1 },

  selectedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.55)",
    backgroundColor: "rgba(46,125,255,0.18)",
  },
  selectedPillText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },

  rowMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },

  kmPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  kmPillActive: { borderColor: "rgba(46,125,255,0.35)", backgroundColor: "rgba(46,125,255,0.10)" },
  kmText: { color: "#fff", fontSize: 12, fontWeight: "900", opacity: 0.9 },
  kmTextActive: { opacity: 1 },

  rowSub: { color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "800" },

  chevWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chevWrapActive: {
    borderColor: "rgba(46,125,255,0.25)",
    backgroundColor: "rgba(46,125,255,0.08)",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#fff", opacity: 0.72, fontSize: 12, fontWeight: "800" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  emptySub: {
    marginTop: 10,
    color: "#fff",
    opacity: 0.65,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 17,
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: theme?.colors?.bg || "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  footerLabel: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "900", letterSpacing: 0.9 },
  footerValue: { marginTop: 4, color: "#fff", fontSize: 14, fontWeight: "900" },

  continueBtn: {
    height: 50,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.92)",
  },
  continueBtnDisabled: { opacity: 0.35 },
  continueText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
