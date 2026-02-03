// src/screens/NewRoundScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { searchCoursesUnified } from "../services/courseSearch";

const FALLBACK_CENTER = { lat: 49.0504, lng: -122.3045 };

// Legacy green accents
const GREEN = "rgba(15,122,74,0.95)";
const GREEN_BORDER = "rgba(15,122,74,0.55)";
const GREEN_BG = "rgba(15,122,74,0.12)";
const GREEN_BG_SOFT = "rgba(15,122,74,0.08)";

// Option B: hide local courses except Green Tee
const PINNED_LOCAL_COURSE_IDS = new Set([
  "green-tee-country-club",
  "green_tee_country_club",
]);

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGreenTeeLocal(course) {
  const id = String(course?.id || course?.courseId || "").trim();
  if (PINNED_LOCAL_COURSE_IDS.has(id)) return true;

  const name = norm(course?.name || course?.courseName || "");
  return name.includes("green tee");
}

function formatKm(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return "—";
  if (n < 1) return "<1 km";
  return `${Math.round(n)} km`;
}

function safeNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function getLatLngFromAny(item) {
  // local list: {lat,lng}
  const latLocal = safeNum(item?.lat, null);
  const lngLocal = safeNum(item?.lng, null);
  if (Number.isFinite(latLocal) && Number.isFinite(lngLocal)) return { lat: latLocal, lng: lngLocal };

  // api: raw.location.latitude/longitude (if present)
  const latApi = safeNum(item?.raw?.location?.latitude, null);
  const lngApi = safeNum(item?.raw?.location?.longitude, null);
  if (Number.isFinite(latApi) && Number.isFinite(lngApi)) return { lat: latApi, lng: lngApi };

  return null;
}

function normCourseName(x) {
  return String(x || "").trim();
}

function normalizeSelectedCourse(course, { preferApi = false } = {}) {
  const raw = course?.raw || null;

  const idFromData = String(course?.id ?? course?.courseId ?? "").trim();
  const nameFromData = normCourseName(course?.name ?? course?.courseName ?? course?.course_name ?? course?.clubName);

  const fallbackId = nameFromData ? nameFromData.replace(/\s/g, "_").toLowerCase() : "";
  const id = idFromData || fallbackId || `course_${Date.now()}`;

  const ll = getLatLngFromAny(course);
  const lat = ll?.lat ?? null;
  const lng = ll?.lng ?? null;

  const source = String(course?.source || (preferApi ? "api" : "local")).trim() || "local";

  return {
    id,
    name: nameFromData || "Course",
    lat,
    lng,
    source,
    city: String(course?.city || "").trim(),
    state: String(course?.state || "").trim(),
    country: String(course?.country || "").trim(),
    raw,
  };
}

function dedupeApiResults(list) {
  const seen = new Set();
  const out = [];

  for (const it of Array.isArray(list) ? list : []) {
    const name = norm(it?.name || it?.courseName || it?.course_name || it?.clubName);
    const city = norm(it?.city || it?.raw?.location?.city);
    const state = norm(it?.state || it?.raw?.location?.state);
    const key = `${name}|${city}|${state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }

  return out;
}

export default function NewRoundScreen({ navigation, route }) {
  const [query, setQuery] = useState("");
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [locationDenied, setLocationDenied] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState(null);

  const [searching, setSearching] = useState(false);
  const [apiResults, setApiResults] = useState([]);
  const searchSeqRef = useRef(0);
  const debounceRef = useRef(null);

  const qTrim = String(query || "").trim();
  const qLower = qTrim.toLowerCase();

  // API mode only at 3+ chars (clear, predictable)
  const useApiMode = qTrim.length >= 3;

  // Seed Active Round with GameSetup params
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

  // Location for distance labels (API results + pinned course)
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

  // Pinned local course only (Green Tee)
  const pinnedLocalList = useMemo(() => {
    const found = (Array.isArray(COURSES_LOCAL) ? COURSES_LOCAL : []).filter((c) => isGreenTeeLocal(c));

    // enrich with distance
    return found.map((c) => {
      const ll = getLatLngFromAny(c);
      const d = ll ? haversineKm(center, ll) : null;
      return {
        ...c,
        source: "local",
        distanceKm: Number.isFinite(d) ? d : null,
      };
    });
  }, [center]);

  // API unified search (debounced) when query length >= 3
  useEffect(() => {
    if (!useApiMode) {
      setSearching(false);
      setApiResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const seq = ++searchSeqRef.current;

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchCoursesUnified(qTrim, { limit: 60 });
        if (searchSeqRef.current !== seq) return;

        // Option B: API-only results (no local fallback)
        const apiOnly = (Array.isArray(res) ? res : []).filter((x) => String(x?.source || "") === "api");

        const enriched = apiOnly.map((it) => {
          const ll = getLatLngFromAny(it);
          const d = ll ? haversineKm(center, ll) : null;
          return { ...it, distanceKm: Number.isFinite(d) ? d : null };
        });

        setApiResults(dedupeApiResults(enriched));
      } catch {
        if (searchSeqRef.current !== seq) return;
        setApiResults([]);
      } finally {
        if (searchSeqRef.current === seq) setSearching(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [useApiMode, qTrim, center]);

  const listData = useApiMode ? apiResults : pinnedLocalList;

  function tapCourse(item) {
    Keyboard.dismiss();
    const preferApi = String(item?.source || "") === "api";
    const normalized = normalizeSelectedCourse(item, { preferApi });

    setSelectedCourse((prev) => {
      if (prev?.id === normalized.id) return null;
      return normalized;
    });
  }

  async function onContinue() {
    if (!selectedCourse) return;

    await updateActiveRound({
      course: {
        id: selectedCourse.id,
        name: selectedCourse.name,
        raw: selectedCourse.raw || null,
        source: selectedCourse.source || null,
        city: selectedCourse.city || null,
        state: selectedCourse.state || null,
        country: selectedCourse.country || null,
        lat: Number.isFinite(Number(selectedCourse.lat)) ? Number(selectedCourse.lat) : null,
        lng: Number.isFinite(Number(selectedCourse.lng)) ? Number(selectedCourse.lng) : null,
      },
    });

    if (__DEV__) {
      console.log("[LegacyGolf] Active round updated with course:", selectedCourse);
    }

    navigation.navigate(ROUTES.TEE_SELECTION, {
      ...(route?.params || {}),
      course: {
        id: selectedCourse.id,
        name: selectedCourse.name,
        raw: selectedCourse.raw || null,
        source: selectedCourse.source || null,
        city: selectedCourse.city || null,
        state: selectedCourse.state || null,
        country: selectedCourse.country || null,
        lat: selectedCourse.lat ?? null,
        lng: selectedCourse.lng ?? null,
      },
    });
  }

  const footerHeight = 92;
  const listBottomPad = footerHeight + 20;

  function renderRow({ item }) {
    const preferApi = String(item?.source || "") === "api";
    const obj = normalizeSelectedCourse(item, { preferApi });
    const active = selectedCourse?.id === obj.id;

    const distanceLabel = Number.isFinite(Number(item?.distanceKm)) ? formatKm(item.distanceKm) : null;

    let metaRight = preferApi ? "Online" : "Home";
    if (distanceLabel) metaRight = distanceLabel;

    let subLeft = "Tap to select";
    if (preferApi) {
      const loc = [String(item?.city || "").trim(), String(item?.state || "").trim(), String(item?.country || "").trim()]
        .filter(Boolean)
        .join(", ");
      subLeft = loc || "Tap to select";
    } else {
      subLeft = "Protected local course (no API import)";
    }

    return (
      <Pressable
        onPress={() => tapCourse(item)}
        style={({ pressed }) => [styles.row, styles.rowShadow, active && styles.rowActive, pressed && styles.pressed]}
      >
        <View style={styles.rowMain}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.rowTop}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {obj.name}
              </Text>

              {active ? (
                <View style={styles.selectedPill}>
                  <Text style={styles.selectedPillText}>Selected</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.rowMeta}>
              <View style={[styles.kmPill, active && styles.kmPillActive]}>
                <Text style={[styles.kmText, active && styles.kmTextActive]}>{metaRight}</Text>
              </View>

              <Text style={styles.rowSub} numberOfLines={1}>
                {subLeft}
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

  const headerSubtitle = useApiMode
    ? "Online course search"
    : "Home course (local) • Type 3+ letters to search online";

  const showLoadingState = (!useApiMode && loadingLoc && pinnedLocalList.length === 0) || (useApiMode && searching);

  const emptyTitle = useApiMode ? "No online matches" : "Home course not found";
  const emptySub = useApiMode
    ? "Try a different spelling. (Online search starts at 3+ letters.)"
    : "Green Tee isn’t present in your local list. We can add it back safely.";

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Select Course" subtitle={headerSubtitle} />

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

        {!useApiMode ? (
          <View style={styles.bannerHome}>
            <Text style={styles.bannerTextHome}>Green Tee is protected. Search 3+ letters for online courses.</Text>
          </View>
        ) : (
          <View style={styles.bannerApi}>
            <Text style={styles.bannerTextApi}>{searching ? "Searching online courses…" : "Powered by GolfCourseAPI"}</Text>
          </View>
        )}

        {locationDenied ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Location off — distance may be approximate</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        {showLoadingState ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>{useApiMode ? "Searching courses…" : "Loading…"}</Text>
          </View>
        ) : listData.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptySub}>{emptySub}</Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item, idx) => String(item?.id || item?.name || idx)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

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
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  bannerText: { color: "#fff", opacity: 0.72, fontSize: 12, fontWeight: "800" },

  bannerHome: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.20)",
    backgroundColor: "rgba(15,122,74,0.10)",
  },
  bannerTextHome: { color: "#fff", opacity: 0.82, fontSize: 12, fontWeight: "800" },

  bannerApi: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.18)",
    backgroundColor: "rgba(46,125,255,0.08)",
  },
  bannerTextApi: { color: "#fff", opacity: 0.78, fontSize: 12, fontWeight: "800" },

  body: { flex: 1 },

  listContent: { paddingHorizontal: 16, paddingTop: 12 },

  row: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginBottom: 12,
  },
  rowActive: {
    borderColor: GREEN,
    backgroundColor: GREEN_BG,
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
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_BG,
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
  kmPillActive: { borderColor: "rgba(15,122,74,0.35)", backgroundColor: GREEN_BG_SOFT },
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
    borderColor: "rgba(15,122,74,0.30)",
    backgroundColor: "rgba(15,122,74,0.08)",
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
