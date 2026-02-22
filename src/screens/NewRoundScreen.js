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

// Premium gold accents
const GOLD = "rgba(255, 210, 92, 0.95)";
const GOLD_BORDER = "rgba(255, 210, 92, 0.70)";
const DARK_GLASS = "rgba(255,255,255,0.04)";

// Option B: hide local courses except Green Tee
const PINNED_LOCAL_COURSE_IDS = new Set(["green-tee-country-club", "green_tee_country_club"]);

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

  // API mode only at 3+ chars (clear, predictable)
  const useApiMode = qTrim.length >= 3;

  // Seed Active Round with GameSetup params (MUST stay on the same Firestore round doc)
  useEffect(() => {
    let alive = true;

    (async () => {
      const params = route?.params || {};
      const roundId = params?.roundId || null;

      const incomingGameId = params?.gameId ?? null;
      const incomingGameTitle = params?.gameTitle ?? null;
      const incomingScoringMode = params?.scoringMode ?? null;
      const incomingWagers = params?.wagers ?? null;

      // LAW: never load/save "active round" without an explicit roundId once setup has started.
      if (!roundId) return;

      const existing = await loadActiveRound(roundId);
      if (!alive) return;

      const next = {
        ...(existing || {}),
        startedAt: existing?.startedAt || new Date().toISOString(),
        gameId: incomingGameId ?? existing?.gameId ?? null,
        gameTitle: incomingGameTitle ?? existing?.gameTitle ?? null,
        scoringMode: incomingScoringMode ?? existing?.scoringMode ?? "net",
        wagers: incomingWagers ?? existing?.wagers ?? null,
      };

      await saveActiveRound(next, roundId);

      if (__DEV__) {
        console.log("[LegacyGolf] Active round seeded on Select Course:", next);
      }
    })();

    return () => {
      alive = false;
    };
  }, [route?.params?.roundId, route?.params?.gameId, route?.params?.gameTitle, route?.params?.scoringMode, route?.params?.wagers]);

  // Re-hydrate previously selected course from Firestore truth (when returning from Net/Gross/back stack)
  useEffect(() => {
    let alive = true;

    async function hydrateSelectedCourseFromRound() {
      const roundId = route?.params?.roundId || null;

      // If roundId is missing, loadActiveRound() will fall back to Firestore active pointer (still truth).
      const r = await loadActiveRound(roundId);
      if (!alive) return;

      const c = r?.course || null;
      const hasCourse = !!(c?.id && c?.name);
      if (!hasCourse) return;

      const hydrated = {
        id: String(c.id),
        name: String(c.name),
        raw: c?.raw ?? null,
        source: c?.source ?? null,
        city: c?.city ?? null,
        state: c?.state ?? null,
        country: c?.country ?? null,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null,
      };

      setSelectedCourse((prev) => prev || hydrated);
    }

    hydrateSelectedCourseFromRound();

    const unsub = navigation.addListener("focus", () => {
      hydrateSelectedCourseFromRound();
    });

    return () => {
      alive = false;
      try {
        unsub && unsub();
      } catch { }
    };
  }, [navigation, route?.params?.roundId]);

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

  const NEARBY_LOCAL_LIMIT = 5;

  // Local mode list:
  // - DEV: show Green Tee pinned + nearest local courses
  // - PROD: show nearest local courses only
  const localCourseList = useMemo(() => {
    const all = (Array.isArray(COURSES_LOCAL) ? COURSES_LOCAL : [])
      .map((c) => {
        const ll = getLatLngFromAny(c);
        const d = ll ? haversineKm(center, ll) : null;
        return {
          ...c,
          source: "local",
          distanceKm: Number.isFinite(d) ? d : null,
        };
      })
      .filter((c) => Number.isFinite(Number(c?.distanceKm)));

    all.sort((a, b) => Number(a.distanceKm) - Number(b.distanceKm));

    const green = __DEV__ ? all.find((c) => isGreenTeeLocal(c)) : null;

    const nearby = all
      .filter((c) => !isGreenTeeLocal(c))
      .slice(0, NEARBY_LOCAL_LIMIT);

    const out = [];
    if (green) out.push(green);
    out.push(...nearby);

    return out;
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

  const listData = useApiMode ? apiResults : localCourseList;

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

    const patch = {
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
    };

    // LAW: Firestore is the truth. If roundId is missing in params, resolve via Firestore active pointer.
    const updated = await updateActiveRound(patch, route?.params?.roundId || null);
    const resolvedRoundId = updated?.roundId || route?.params?.roundId || null;

    if (__DEV__) {
      console.log("[LegacyGolf] Active round updated with course:", selectedCourse, "roundId:", resolvedRoundId);
    }

    if (!resolvedRoundId) return;

    navigation.navigate(ROUTES.TEE_SELECTION, {
      ...(route?.params || {}),
      roundId: resolvedRoundId,
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

  // bottom dock sizing
  const footerHeight = 128;
  const listBottomPad = footerHeight + 20;

  function renderRow({ item }) {
    const preferApi = String(item?.source || "") === "api";
    const obj = normalizeSelectedCourse(item, { preferApi });
    const active = selectedCourse?.id === obj.id;

    const isProtectedLocal = !preferApi && isGreenTeeLocal(item);

    // Protected local course: simple centered "Green Tee" card only
    if (isProtectedLocal) {
      return (
        <Pressable
          onPress={() => tapCourse(item)}
          style={({ pressed }) => [
            styles.rowOuter,
            active && styles.rowOuterActive,
            pressed && styles.pressed,
          ]}
        >
          <View style={[styles.row, styles.rowShadow, active && styles.rowActive, styles.rowProtectedLocal]}>
            <Text style={[styles.rowProtectedLocalText, active && styles.rowProtectedLocalTextActive]}>
              Green Tee
            </Text>
          </View>
        </Pressable>
      );
    }

    const distanceLabel = Number.isFinite(Number(item?.distanceKm)) ? formatKm(item.distanceKm) : null;

    let metaRight = preferApi ? "Online" : "Home";
    if (distanceLabel) metaRight = distanceLabel;

    let subLeft = "Tap to select";
    if (preferApi) {
      const loc = [
        String(item?.city || "").trim(),
        String(item?.state || "").trim(),
        String(item?.country || "").trim(),
      ]
        .filter(Boolean)
        .join(", ");
      subLeft = loc || "Tap to select";
    } else {
      subLeft = "Local course";
    }

    return (
      <Pressable
        onPress={() => tapCourse(item)}
        style={({ pressed }) => [
          styles.rowOuter,
          active && styles.rowOuterActive,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.row, styles.rowShadow, active && styles.rowActive]}>
          <View style={styles.rowMain}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {obj.name}
                </Text>

                {active ? (
                  <View style={styles.selectedCheckWrap}>
                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
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
          </View>
        </View>
      </Pressable>
    );
  }
  const headerSubtitle = useApiMode
    ? "Online course search"
    : "Home course (local) • Type 3+ letters to search online";

  const showLoadingState = (!useApiMode && loadingLoc && localCourseList.length === 0) || (useApiMode && searching);

  const emptyTitle = useApiMode ? "No online matches" : "Home course not found";
  const emptySub = useApiMode
    ? "Try a different spelling. (Online search starts at 3+ letters.)"
    : "Green Tee isn’t present in your local list. We can add it back safely.";

  const coursePillText = selectedCourse ? selectedCourse.name : "Select a course";
  const ctaText = "Next: Continue to Tee Selection";

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader navigation={navigation} title="Select Course" subtitle={headerSubtitle} />

      <View style={styles.topArea}>
        <View style={styles.heroGlowA} pointerEvents="none" />
        <View style={styles.heroGlowB} pointerEvents="none" />

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
            <Text style={styles.bannerTextHome}>
              {__DEV__
                ? "Green Tee is protected. Showing nearby courses. Search 3+ letters for online courses."
                : "Showing nearby courses. Search 3+ letters for online courses."}
            </Text>
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

      {/* Bottom Dock: 2 stacked pills */}
      <View style={styles.footer}>
        <View style={styles.footerDock}>
          <Pressable
            onPress={() => {
              if (selectedCourse) setSelectedCourse(null);
            }}
            style={({ pressed }) => [
              styles.coursePill,
              !selectedCourse && styles.coursePillEmpty,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.coursePillValue} numberOfLines={1}>
              {coursePillText}
            </Text>
          </Pressable>

          <Pressable
            onPress={onContinue}
            disabled={!selectedCourse}
            style={({ pressed }) => [
              styles.ctaPill,
              !selectedCourse && styles.ctaPillDisabled,
              pressed && selectedCourse && styles.pressed,
            ]}
          >
            <Text style={styles.ctaText}>{ctaText}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  topArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    position: "relative",
    overflow: "visible",
  },

  heroGlowA: {
    position: "absolute",
    top: -90,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.55,
  },
  heroGlowB: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  input: {
    height: 56,
    borderRadius: 18,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    fontSize: 15,
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

  rowOuter: {
    borderRadius: 24,
    marginBottom: 14,
    padding: 3,
    backgroundColor: "rgba(255, 210, 92, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.70)",
  },
  rowOuterActive: {
    backgroundColor: "rgba(255, 210, 92, 0.26)",
    borderColor: "rgba(255, 210, 92, 0.92)",
  },

  row: {
    borderRadius: 21,
    padding: 16,
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "rgba(18,22,30,0.74)",
  },
  rowActive: {
    borderWidth: 0,
    borderColor: "transparent",
    backgroundColor: "rgba(255, 210, 92, 0.14)",
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

  selectedCheckWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 92, 0.55)",
    backgroundColor: "rgba(255, 210, 92, 0.14)",
  },

  rowProtectedLocal: {
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  rowProtectedLocalText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  rowProtectedLocalTextActive: {
    opacity: 1,
  },

  rowMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },

  kmPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  kmPillActive: { borderColor: "rgba(255, 210, 92, 0.35)", backgroundColor: GREEN_BG_SOFT },
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
    borderColor: "rgba(46,125,255,0.40)",
    backgroundColor: "rgba(46,125,255,0.24)",
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

  /* ---------------- bottom dock (floating glass) ---------------- */

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "transparent",
  },

  footerDock: {
    borderRadius: 26,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(18,22,30,0.92)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.28,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 10 },
      default: {},
    }),
  },

  coursePill: {
    height: 58,
    borderRadius: 999,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: GOLD_BORDER,
    backgroundColor: DARK_GLASS,
    alignItems: "center",
    justifyContent: "center",
  },
  coursePillEmpty: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  coursePillValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  ctaPill: {
    height: 58,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
    backgroundColor: "rgba(46,125,255,0.92)",
  },
  ctaPillDisabled: {
    opacity: 0.35,
  },
  ctaText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.4,
    textAlign: "center",
  },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
