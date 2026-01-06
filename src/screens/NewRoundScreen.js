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
import { COURSES_LOCAL } from "../data/coursesLocal";
import { haversineKm } from "../utils/distance";

const FALLBACK_CENTER = { lat: 49.0504, lng: -122.3045 };
const MAX_KM = 200;

export default function NewRoundScreen({ navigation, route }) {
  const [query, setQuery] = useState("");
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [locationDenied, setLocationDenied] = useState(false);

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
    return COURSES_LOCAL.map((c) => ({
      ...c,
      distanceKm: haversineKm(center, { lat: c.lat, lng: c.lng }),
    }))
      .filter((c) => c.distanceKm <= MAX_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [center]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nearbyCourses;
    return nearbyCourses.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, nearbyCourses]);

  function selectCourse(course) {
    Keyboard.dismiss();
    navigation.navigate("TeeSelection", {
      course: {
        id: course.name.replace(/\s/g, "_").toLowerCase(),
        name: course.name,
      },
      ...(route?.params || {}),
    });
  }

  function renderRow({ item }) {
    return (
      <Pressable
        onPress={() => selectCourse(item)}
        style={({ pressed }) => [styles.row, styles.rowShadow, pressed && styles.pressed]}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.name}
            </Text>

            <View style={styles.rowMeta}>
              <View style={styles.kmPill}>
                <Text style={styles.kmText}>{item.distanceKm.toFixed(0)} km</Text>
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                Tap to select tee’s
              </Text>
            </View>
          </View>

          <View style={styles.chevWrap}>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color="rgba(255,255,255,0.65)"
            />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER */}
      <View style={styles.topWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.top}>
          <Text style={styles.h1}>Select Course</Text>
          <Text style={styles.h2}>Nearby courses within {MAX_KM} km.</Text>

          <View style={styles.searchWrap}>
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
          </View>

          {locationDenied ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>Location off — showing default nearby</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* LIST */}
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
            contentContainerStyle={styles.listContent}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  topWrap: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },

  topGlowA: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(46,125,255,0.20)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  top: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14 },
  h1: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: 0.2, lineHeight: 34 },
  h2: { marginTop: 8, color: "#fff", opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

  searchWrap: { marginTop: 14 },
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
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },

  row: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 12,
  },

  rowShadow: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 2,
    },
    default: {},
  }),

  rowMain: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },

  rowMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },

  kmPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  kmText: { color: "#fff", fontSize: 12, fontWeight: "900", opacity: 0.9 },

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

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
