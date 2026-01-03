import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Keyboard,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";

import theme from "../theme";
import { saveRound } from "../storage/rounds";
import { ROUTES } from "../navigation/routes";

const COURSES = [
  "Green Tee Country Club",
  "Langley Golf & Banquet Center",
  "Redwoods Golf Course",
  "Newlands Golf & Country Club",
  "Surrey Golf Club",
  "Morgan Creek Golf Course",
  "Northview Golf & Country Club",
  "Meadow Gardens Golf Course",
  "Riverway Golf Course",
  "Fraserview Golf Course",
  "Shaughnessy Golf & Country Club",
  "Point Grey Golf & Country Club",
  "Capilano Golf & Country Club",
  "University Golf Club",
  "Mayfair Lakes Golf & Country Club",
  "Westwood Plateau Golf & Country Club",
  "Swan-e-set Bay Resort & Country Club",
  "Ledgeview Golf Club",
  "Abbotsford Golf & Country Club",
  "Chilliwack Golf Club",
];

const TEE_OPTIONS = ["White", "Blue", "Black", "Red", "Gold"];

const FORMAT_OPTIONS = [
  "Stroke Play",
  "Match Play",
  "Skins",
  "Nassau",
  "Vegas",
  "Stableford",
  "Modified Stableford",
  "Par / Bogey",
];

function buildDefaultHoles(players) {
  return Array.from({ length: 18 }, (_, i) => {
    const scores = {};
    (players || []).forEach((p) => {
      scores[p.id] = null;
    });
    return { hole: i + 1, scores };
  });
}

function makeId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function makePlayer(idNum) {
  return { id: `p${idNum}`, name: idNum === 1 ? "Me" : `Player ${idNum}` };
}

function toMoneyNumber(text) {
  const cleaned = (text || "").replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function normalizeCourseNameFromNominatim(item) {
  const dn = (item?.display_name || "").trim();
  if (!dn) return "";
  const first = dn.split(",")[0]?.trim();
  return first || dn;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      (Math.sin(dLon / 2) * Math.sin(dLon / 2));
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchOverpassNearestGolfCourse(lat, lon, radiusMeters) {
  const q = `
[out:json][timeout:20];
(
  node["leisure"="golf_course"](around:${radiusMeters},${lat},${lon});
  way["leisure"="golf_course"](around:${radiusMeters},${lat},${lon});
  relation["leisure"="golf_course"](around:${radiusMeters},${lat},${lon});
);
out center 40;
  `.trim();

  const url = "https://overpass-api.de/api/interpreter";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `data=${encodeURIComponent(q)}`,
  });

  if (!res.ok) return null;
  const data = await res.json();
  const els = Array.isArray(data?.elements) ? data.elements : [];
  if (!els.length) return null;

  let best = null;

  for (const el of els) {
    const name = el?.tags?.name || "";
    if (!name) continue;

    const elLat =
      typeof el?.lat === "number"
        ? el.lat
        : typeof el?.center?.lat === "number"
        ? el.center.lat
        : null;

    const elLon =
      typeof el?.lon === "number"
        ? el.lon
        : typeof el?.center?.lon === "number"
        ? el.center.lon
        : null;

    if (elLat == null || elLon == null) continue;

    const d = haversineMeters(lat, lon, elLat, elLon);
    if (!best || d < best.distanceMeters) {
      best = { name, distanceMeters: d };
    }
  }

  return best;
}

export default function NewRoundScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedTee, setSelectedTee] = useState("White");
  const [selectedFormat, setSelectedFormat] = useState("Stroke Play");
  const [saving, setSaving] = useState(false);

  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState([makePlayer(1), makePlayer(2)]);

  // WAGERS
  const [skinsPerSkin, setSkinsPerSkin] = useState("5");
  const [nassauFront, setNassauFront] = useState("5");
  const [nassauBack, setNassauBack] = useState("5");
  const [nassauTotal, setNassauTotal] = useState("5");
  const [vegasUnit, setVegasUnit] = useState("1");

  // COURSE AUTOCOMPLETE
  const [courseResults, setCourseResults] = useState([]);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseError, setCourseError] = useState("");

  // GPS
  const [gpsLoading, setGpsLoading] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const lastRequestAtRef = useRef(0);

  const vegasTeams = useMemo(() => {
    if (players.length !== 4) return null;
    return {
      teamA: [players[0].id, players[1].id],
      teamB: [players[2].id, players[3].id],
    };
  }, [players]);

  const localSuggestions = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    return COURSES.filter((c) => c.toLowerCase().includes(q))
      .slice(0, 12)
      .map((c) => ({
        id: `local-${c}`,
        name: c,
        display_name: c,
        source: "local",
      }));
  }, [query]);

  const mergedSuggestions = useMemo(() => {
    if (courseResults.length > 0) return courseResults;
    return localSuggestions;
  }, [courseResults, localSuggestions]);

  function pickCourse(name) {
    setSelectedCourse(name);
    setQuery(name);
    setCourseResults([]);
    setCourseError("");
    Keyboard.dismiss();
  }

  function setCount(n) {
    setPlayerCount(n);

    const next = [];
    for (let i = 1; i <= n; i++) {
      const existing = players[i - 1];
      next.push(existing ? existing : makePlayer(i));
    }
    setPlayers(next);
  }

  function updatePlayerName(idx, name) {
    setPlayers((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], name };
      return next;
    });
  }

  function clearWagersIfNeeded(format) {
    // Intentionally no-op right now.
    // Later: we can auto-reset wager inputs when format changes.
  }

  async function fetchCoursesOSM(q) {
    const trimmed = (q || "").trim();
    if (trimmed.length < 3) {
      setCourseResults([]);
      setCourseLoading(false);
      setCourseError("");
      return;
    }

    const now = Date.now();
    const elapsed = now - lastRequestAtRef.current;
    if (elapsed < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - elapsed));
    }
    lastRequestAtRef.current = Date.now();

    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch (e) {}
    }
    abortRef.current = new AbortController();

    setCourseLoading(true);
    setCourseError("");

    try {
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?q=${encodeURIComponent(trimmed + " golf course")}` +
        "&format=jsonv2" +
        "&addressdetails=1" +
        "&countrycodes=ca" +
        "&limit=12";

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Language": "en-CA,en;q=0.9",
        },
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setCourseResults([]);
        setCourseError("Live search temporarily unavailable. Showing local list.");
        return;
      }

      const data = await res.json();

      const cleaned = (Array.isArray(data) ? data : [])
        .map((it) => ({
          id: String(it.place_id),
          display_name: it.display_name,
          name: normalizeCourseNameFromNominatim(it),
          source: "osm",
        }))
        .filter((it) => it.name);

      setCourseResults(cleaned);
      if (cleaned.length === 0) {
        setCourseError("No live matches found. Showing local list.");
      }
    } catch (e) {
      setCourseResults([]);
      setCourseError("Live search unavailable. Showing local list.");
    } finally {
      setCourseLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (selectedCourse && query === selectedCourse) {
      setCourseResults([]);
      setCourseLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      fetchCoursesOSM(query);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedCourse]);

  async function onUseMyLocation() {
    setGpsLoading(true);
    setCourseError("");

    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Location needed", "Enable location to find nearby courses.");
        setGpsLoading(false);
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = pos?.coords?.latitude;
      const lon = pos?.coords?.longitude;

      if (typeof lat !== "number" || typeof lon !== "number") {
        Alert.alert("Location error", "Could not read your location. Try again.");
        setGpsLoading(false);
        return;
      }

      let best = await fetchOverpassNearestGolfCourse(lat, lon, 25000);
      if (!best) best = await fetchOverpassNearestGolfCourse(lat, lon, 50000);

      if (!best || !best.name) {
        Alert.alert(
          "No nearby course found",
          "We couldn't find a nearby golf course in free map data. Type it manually."
        );
        setGpsLoading(false);
        return;
      }

      pickCourse(best.name);
    } catch (e) {
      Alert.alert("GPS lookup failed", "Try again, or type the course manually.");
    } finally {
      setGpsLoading(false);
    }
  }

  async function onStartRound() {
    const courseName = (selectedCourse || query || "").trim();

    if (!courseName) {
      Alert.alert("Course required", "Type and select a course name.");
      return;
    }

    const cleanedPlayers = players.map((p, i) => ({
      ...p,
      name: (p.name || "").trim() || (i === 0 ? "Me" : `Player ${i + 1}`),
    }));

    if (selectedFormat === "Vegas" && cleanedPlayers.length !== 4) {
      Alert.alert("Vegas requires 4 players", "Set Players to 4 for Vegas.");
      return;
    }

    if (selectedFormat === "Skins") {
      if (toMoneyNumber(skinsPerSkin) <= 0) {
        Alert.alert("Skins wager", "Enter a $ amount per skin.");
        return;
      }
    }

    if (selectedFormat === "Nassau") {
      if (
        toMoneyNumber(nassauFront) <= 0 ||
        toMoneyNumber(nassauBack) <= 0 ||
        toMoneyNumber(nassauTotal) <= 0
      ) {
        Alert.alert("Nassau wager", "Enter $ amounts for Front, Back, and Total.");
        return;
      }
    }

    if (selectedFormat === "Vegas") {
      if (toMoneyNumber(vegasUnit) <= 0) {
        Alert.alert("Vegas wager", "Enter a $ unit amount.");
        return;
      }
    }

    setSaving(true);

    const newRound = {
      id: makeId(),
      courseName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "in_progress",
      tees: selectedTee,
      format: selectedFormat,
      players: cleanedPlayers,
      vegasTeams: selectedFormat === "Vegas" ? vegasTeams : null,
      holes: buildDefaultHoles(cleanedPlayers),
      wagers: {
        skinsPerSkin:
          selectedFormat === "Skins" ? toMoneyNumber(skinsPerSkin) : null,
        nassau:
          selectedFormat === "Nassau"
            ? {
                front: toMoneyNumber(nassauFront),
                back: toMoneyNumber(nassauBack),
                total: toMoneyNumber(nassauTotal),
              }
            : null,
        vegasUnit: selectedFormat === "Vegas" ? toMoneyNumber(vegasUnit) : null,
      },
    };

    const ok = await saveRound(newRound);
    setSaving(false);

    if (!ok) {
      Alert.alert("Error", "Could not save round. Try again.");
      return;
    }

    navigation.navigate(ROUTES.SCORE_ENTRY, { roundId: newRound.id });
  }

  function ChipRow({ title, options, value, onChange }) {
    return (
      <View style={styles.block}>
        <Text style={styles.label}>{title}</Text>
        <View style={styles.chips}>
          {options.map((opt) => {
            const active = opt === value;
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  onChange(opt);
                  clearWagersIfNeeded(opt);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function MoneyInput({ label, value, onChangeText, placeholder }) {
    return (
      <View style={styles.moneyRow}>
        <Text style={styles.moneyLabel}>{label}</Text>
        <TextInput
          style={styles.moneyInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || "0"}
          placeholderTextColor={
            (theme && theme.colors && theme.colors.mutedText) || "#888"
          }
          keyboardType="decimal-pad"
        />
      </View>
    );
  }

  const showDropdown = mergedSuggestions.length > 0 && !selectedCourse;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.wrap}>
            <Text style={styles.h1}>New Round</Text>

            <View style={styles.block}>
              <View style={styles.courseTopRow}>
                <Text style={styles.label}>Course</Text>

                <Pressable
                  onPress={onUseMyLocation}
                  disabled={gpsLoading}
                  style={({ pressed }) => [
                    styles.locBtn,
                    pressed && styles.pressed,
                    gpsLoading && styles.disabled,
                  ]}
                >
                  {gpsLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.locBtnText}>Use my location</Text>
                  )}
                </Pressable>
              </View>

              {courseLoading ? (
                <View style={styles.loadingPill}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.loadingText}>Searching</Text>
                </View>
              ) : null}

              <TextInput
                style={styles.input}
                value={query}
                onChangeText={(t) => {
                  setQuery(t);
                  setSelectedCourse("");
                }}
                placeholder="Start typing a course name…"
                placeholderTextColor={
                  (theme && theme.colors && theme.colors.mutedText) || "#888"
                }
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const name = (query || "").trim();
                  if (name) setSelectedCourse(name);
                  Keyboard.dismiss();
                }}
              />

              {showDropdown ? (
                <View style={styles.dropdown}>
                  {mergedSuggestions.map((item, idx) => (
                    <Pressable
                      key={item.id}
                      onPress={() => pickCourse(item.name)}
                      style={[
                        styles.ddItem,
                        idx !== mergedSuggestions.length - 1 && styles.ddDivider,
                      ]}
                    >
                      <Text style={styles.ddText}>{item.name}</Text>
                      {item.source === "osm" ? (
                        <Text style={styles.ddSub}>{item.display_name}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {selectedCourse ? (
                <Text style={styles.selectedNote}>
                  Selected: {selectedCourse}
                </Text>
              ) : null}

              {courseError ? (
                <Text style={styles.smallNote}>{courseError}</Text>
              ) : null}
            </View>

            <ChipRow
              title="Tees"
              options={TEE_OPTIONS}
              value={selectedTee}
              onChange={setSelectedTee}
            />

            <ChipRow
              title="Format"
              options={FORMAT_OPTIONS}
              value={selectedFormat}
              onChange={setSelectedFormat}
            />

            {selectedFormat === "Skins" ? (
              <View style={styles.block}>
                <Text style={styles.label}>Skins Wager</Text>
                <MoneyInput
                  label="$ per skin"
                  value={skinsPerSkin}
                  onChangeText={setSkinsPerSkin}
                  placeholder="5"
                />
              </View>
            ) : null}

            {selectedFormat === "Nassau" ? (
              <View style={styles.block}>
                <Text style={styles.label}>Nassau Wagers</Text>
                <MoneyInput
                  label="Front 9 ($)"
                  value={nassauFront}
                  onChangeText={setNassauFront}
                  placeholder="5"
                />
                <MoneyInput
                  label="Back 9 ($)"
                  value={nassauBack}
                  onChangeText={setNassauBack}
                  placeholder="5"
                />
                <MoneyInput
                  label="Total ($)"
                  value={nassauTotal}
                  onChangeText={setNassauTotal}
                  placeholder="5"
                />
              </View>
            ) : null}

            {selectedFormat === "Vegas" ? (
              <View style={styles.block}>
                <Text style={styles.label}>Vegas Wager</Text>
                <MoneyInput
                  label="$ unit"
                  value={vegasUnit}
                  onChangeText={setVegasUnit}
                  placeholder="1"
                />
                <Text style={styles.smallNote}>
                  Vegas = 2 teams of 2. Team A = Players 1–2, Team B = Players
                  3–4.
                </Text>
              </View>
            ) : null}

            <View style={styles.block}>
              <Text style={styles.label}>Players</Text>

              <View style={styles.chips}>
                {[2, 3, 4].map((n) => {
                  const active = n === playerCount;
                  return (
                    <Pressable
                      key={String(n)}
                      onPress={() => setCount(n)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {players.map((p, idx) => (
                <View key={p.id} style={styles.playerRow}>
                  <Text style={styles.playerLabel}>{idx + 1}.</Text>
                  <TextInput
                    style={styles.playerInput}
                    value={p.name}
                    onChangeText={(t) => updatePlayerName(idx, t)}
                    placeholder={idx === 0 ? "Me" : `Player ${idx + 1}`}
                    placeholderTextColor={
                      (theme && theme.colors && theme.colors.mutedText) || "#888"
                    }
                    autoCapitalize="words"
                  />
                </View>
              ))}
            </View>

            <Pressable
              onPress={onStartRound}
              style={[styles.btn, styles.btnPrimary]}
              disabled={saving}
            >
              <Text style={styles.btnTextPrimary}>
                {saving ? "Starting…" : "Start Round"}
              </Text>
            </Pressable>

            <View style={{ height: 18 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: (theme && theme.colors && theme.colors.bg) || "#0B1220",
  },
  kav: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 26 },
  wrap: { padding: 16 },
  h1: {
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
  },

  block: { marginBottom: 14 },

  courseTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  label: {
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.85,
    fontSize: 14,
    fontWeight: "700",
  },

  locBtn: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  locBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", opacity: 0.95 },

  loadingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    marginBottom: 8,
    alignSelf: "flex-end",
  },
  loadingText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", opacity: 0.9 },

  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor:
      (theme && theme.colors && theme.colors.border) || "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    backgroundColor: "rgba(255,255,255,0.04)",
    fontSize: 16,
  },

  dropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor:
      (theme && theme.colors && theme.colors.border) || "rgba(255,255,255,0.2)",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor:
      (theme && theme.colors && theme.colors.card) || "rgba(255,255,255,0.04)",
  },
  ddItem: { paddingVertical: 12, paddingHorizontal: 12 },
  ddDivider: { borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  ddText: {
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  ddSub: {
    marginTop: 4,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.6,
    fontSize: 12,
    lineHeight: 16,
  },

  selectedNote: {
    marginTop: 8,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.7,
    fontSize: 13,
  },
  smallNote: {
    marginTop: 10,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.6,
    fontSize: 12,
    lineHeight: 16,
  },

  chips: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor:
      (theme && theme.colors && theme.colors.border) || "rgba(255,255,255,0.25)",
    backgroundColor: "transparent",
    marginRight: 10,
    marginBottom: 10,
  },
  chipActive: {
    backgroundColor: (theme && theme.colors && theme.colors.primary) || "#2E7DFF",
    borderColor: "transparent",
  },
  chipText: {
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    fontSize: 13,
    fontWeight: "800",
    opacity: 0.85,
  },
  chipTextActive: { opacity: 1 },

  playerRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  playerLabel: {
    width: 22,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.8,
    fontWeight: "800",
  },
  playerInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor:
      (theme && theme.colors && theme.colors.border) || "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    backgroundColor: "rgba(255,255,255,0.04)",
    fontSize: 16,
  },

  moneyRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  moneyLabel: {
    flex: 1,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    opacity: 0.85,
    fontSize: 14,
    fontWeight: "700",
  },
  moneyInput: {
    width: 90,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor:
      (theme && theme.colors && theme.colors.border) || "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    color: (theme && theme.colors && theme.colors.text) || "#fff",
    backgroundColor: "rgba(255,255,255,0.04)",
    fontSize: 16,
    textAlign: "center",
  },

  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  btnPrimary: {
    backgroundColor: (theme && theme.colors && theme.colors.primary) || "#2E7DFF",
  },
  btnTextPrimary: { color: "#fff", fontSize: 16, fontWeight: "800" },

  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.6 },
});
