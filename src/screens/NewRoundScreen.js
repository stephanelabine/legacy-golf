import React, { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, TextInput, Pressable, FlatList, Keyboard, Alert, Modal } from "react-native";
import * as Location from "expo-location";
import theme from "../theme";
import ROUTES from "../navigation/routes";
import { MAPBOX_TOKEN } from "../config/mapbox";
import { getBuddies } from "../storage/buddies";
import { saveRound } from "../storage/rounds";

const MAX_PLAYERS = 8;
const DEFAULT_TEES = ["Blue", "White", "Gold", "Red"];

function kmToDeltaLat(km) {
  return km / 111;
}
function kmToDeltaLon(km, lat) {
  const c = Math.cos((lat * Math.PI) / 180);
  return km / (111 * (c || 0.00001));
}

async function searchMapboxCourses(q, user) {
  const query = encodeURIComponent(q.trim());
  const { lat, lon } = user;
  const dLat = kmToDeltaLat(200);
  const dLon = kmToDeltaLon(200, lat);
  const minLon = lon - dLon;
  const minLat = lat - dLat;
  const maxLon = lon + dLon;
  const maxLat = lat + dLat;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&autocomplete=true&limit=10&types=poi` +
    `&proximity=${lon},${lat}` +
    `&bbox=${minLon},${minLat},${maxLon},${maxLat}`;

  const res = await fetch(url);
  const json = await res.json();

  const feats = Array.isArray(json?.features) ? json.features : [];
  const filtered = feats.filter((f) => {
    const text = `${f?.text || ""} ${f?.place_name || ""}`.toLowerCase();
    return text.includes("golf");
  });

  return filtered.map((f) => ({
    id: f.id,
    name: f.text || f.place_name || "Golf Course",
    placeName: f.place_name || "",
    center: { lon: f.center?.[0], lat: f.center?.[1] },
  }));
}

export default function NewRoundScreen({ navigation, route }) {
  const format = route?.params?.format || "stroke_play";
  const gameTitle = route?.params?.gameTitle || "Stroke Play";
  const scoringMode = route?.params?.scoringMode || "gross";

  const [loc, setLoc] = useState(null);
  const [search, setSearch] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courses, setCourses] = useState([]);
  const [pickedCourse, setPickedCourse] = useState(null);

  const [tees, setTees] = useState(DEFAULT_TEES[1]);
  const [players, setPlayers] = useState(() => {
    const arr = Array.from({ length: MAX_PLAYERS }).map((_, i) => ({
      id: `p${i + 1}`,
      name: i === 0 ? "Me" : "",
    }));
    return arr;
  });

  const [buddyModalFor, setBuddyModalFor] = useState(null);
  const [buddies, setBuddies] = useState([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location needed", "Enable location so we can find courses near you.");
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLoc({ lat: p.coords.latitude, lon: p.coords.longitude });
    })();

    (async () => {
      const list = await getBuddies();
      setBuddies(Array.isArray(list) ? list : []);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    const q = search.trim();
    if (!loc || q.length < 2) {
      setCourses([]);
      return;
    }
    setLoadingCourses(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchMapboxCourses(q, loc);
        if (!alive) return;
        setCourses(results);
      } catch (e) {
        if (!alive) return;
        setCourses([]);
      } finally {
        if (!alive) return;
        setLoadingCourses(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search, loc]);

  const canStart = useMemo(() => {
    if (!pickedCourse) return false;
    const named = players.filter((p) => String(p.name || "").trim().length > 0);
    return named.length >= 1;
  }, [pickedCourse, players]);

  function setPlayerName(idx, name) {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, name } : p)));
  }

  function openBuddy(idx) {
    setBuddyModalFor(idx);
  }

  function pickBuddy(b) {
    if (buddyModalFor == null) return;
    setPlayerName(buddyModalFor, b?.name || "");
    setBuddyModalFor(null);
  }

  async function onStartRound() {
    Keyboard.dismiss();
    if (!canStart) return;

    const activePlayers = players
      .filter((p) => String(p.name || "").trim().length > 0)
      .slice(0, MAX_PLAYERS)
      .map((p, idx) => ({ id: p.id || `p${idx + 1}`, name: String(p.name).trim() }));

    const holes = Array.from({ length: 18 }).map((_, i) => ({
      hole: i + 1,
      par: 4,
      si: null,
      scores: {},
    }));

    const round = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      courseName: pickedCourse.name,
      courseCenter: pickedCourse.center,
      tees,
      format,
      scoringMode,
      players: activePlayers,
      holes,
    };

    await saveRound(round);

    navigation.replace(ROUTES.SCORE_HOLE, {
      roundId: round.id,
      gameTitle,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable style={styles.bg} onPress={Keyboard.dismiss}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backTxt}>Back</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Start Round</Text>
            <Text style={styles.h2}>{gameTitle} • {String(scoringMode).toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Course (within 200km)</Text>
          <TextInput
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setPickedCourse(null);
            }}
            placeholder="Type course name..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            style={styles.input}
            autoCapitalize="words"
          />

          {!!pickedCourse ? (
            <View style={styles.picked}>
              <Text style={styles.pickedT}>{pickedCourse.name}</Text>
              {!!pickedCourse.placeName ? <Text style={styles.pickedS} numberOfLines={1}>{pickedCourse.placeName}</Text> : null}
              <Pressable onPress={() => setPickedCourse(null)} style={styles.pickedX}>
                <Text style={styles.pickedXTxt}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listBox}>
              <FlatList
                data={courses}
                keyExtractor={(it) => it.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      setPickedCourse(item);
                      setSearch(item.name);
                      setCourses([]);
                    }}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowT} numberOfLines={1}>{item.name}</Text>
                    {!!item.placeName ? <Text style={styles.rowS} numberOfLines={1}>{item.placeName}</Text> : null}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 12 }}>
                    <Text style={styles.empty}>
                      {!loc ? "Getting your location…" : search.trim().length < 2 ? "Type at least 2 letters." : (loadingCourses ? "Searching…" : "No matches nearby. Try a different name.")}
                    </Text>
                  </View>
                }
                style={{ maxHeight: 220 }}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Tee Box</Text>
          <View style={styles.teeRow}>
            {DEFAULT_TEES.map((t) => {
              const on = tees === t;
              return (
                <Pressable key={t} onPress={() => setTees(t)} style={[styles.tee, on && styles.teeOn]}>
                  <Text style={[styles.teeT, on && styles.teeTOn]}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Players (max 8)</Text>

          <FlatList
            data={players}
            keyExtractor={(it) => it.id}
            contentContainerStyle={{ paddingBottom: 160 }}
            renderItem={({ item, index }) => {
              const isMe = index === 0;
              return (
                <View style={styles.playerCard}>
                  <Text style={styles.playerLabel}>Player {index + 1}{isMe ? " (Me)" : ""}</Text>
                  <TextInput
                    value={item.name}
                    onChangeText={(v) => setPlayerName(index, v)}
                    placeholder={isMe ? "Me" : "Guest name…"}
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.playerInput}
                    autoCapitalize="words"
                  />

                  {!isMe ? (
                    <Pressable onPress={() => openBuddy(index)} style={({ pressed }) => [styles.addBuddy, pressed && styles.pressed]}>
                      <Text style={styles.addBuddyT}>Add buddy</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
        </View>

        <View style={styles.footer}>
          <Pressable onPress={onStartRound} disabled={!canStart} style={[styles.primary, !canStart && styles.disabled]}>
            <Text style={styles.primaryT}>Start Round</Text>
          </Pressable>
        </View>

        <Modal visible={buddyModalFor != null} transparent animationType="fade" onRequestClose={() => setBuddyModalFor(null)}>
          <Pressable style={styles.modalWrap} onPress={() => setBuddyModalFor(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Pick a Buddy</Text>

              <FlatList
                data={buddies}
                keyExtractor={(b) => b.id}
                renderItem={({ item }) => (
                  <Pressable onPress={() => pickBuddy(item)} style={({ pressed }) => [styles.modalRow, pressed && styles.pressed]}>
                    <Text style={styles.modalRowT} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.modalRowS} numberOfLines={1}>
                      {item.handicap != null ? `HCP ${item.handicap}` : "Buddy"}
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 10 }}>
                    <Text style={styles.empty}>No buddies yet. Add some in Buddy List.</Text>
                  </View>
                }
              />

              <Pressable onPress={() => setBuddyModalFor(null)} style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}>
                <Text style={styles.modalCloseT}>Close</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },
  bg: { flex: 1 },

  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 12 },
  backBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  backTxt: { color: "#fff", fontWeight: "900" },
  h1: { color: "#fff", fontSize: 32, fontWeight: "900" },
  h2: { marginTop: 4, color: "#fff", opacity: 0.7, fontWeight: "700" },

  section: { paddingHorizontal: 16, paddingTop: 10 },
  label: { color: "#fff", opacity: 0.75, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase", fontSize: 12, marginBottom: 8 },

  input: {
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    color: "#fff",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    fontWeight: "800",
  },

  listBox: { marginTop: 10, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)" },
  row: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  rowT: { color: "#fff", fontWeight: "900" },
  rowS: { marginTop: 4, color: "#fff", opacity: 0.6, fontWeight: "700", fontSize: 12 },
  empty: { color: "#fff", opacity: 0.6, fontWeight: "800" },

  picked: { marginTop: 10, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(46,125,255,0.35)", backgroundColor: "rgba(46,125,255,0.10)" },
  pickedT: { color: "#fff", fontWeight: "900", fontSize: 16 },
  pickedS: { marginTop: 4, color: "#fff", opacity: 0.7, fontWeight: "700", fontSize: 12 },
  pickedX: { marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  pickedXTxt: { color: "#fff", fontWeight: "900" },

  teeRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  tee: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.04)" },
  teeOn: { borderColor: "rgba(46,125,255,0.9)", backgroundColor: "rgba(46,125,255,0.14)" },
  teeT: { color: "#fff", fontWeight: "900", opacity: 0.8 },
  teeTOn: { opacity: 1 },

  playerCard: { marginTop: 10, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.03)" },
  playerLabel: { color: "#fff", opacity: 0.75, fontWeight: "900", marginBottom: 8, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  playerInput: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    fontWeight: "800",
  },
  addBuddy: { marginTop: 10, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  addBuddyT: { color: "#fff", fontWeight: "900" },

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: 18, paddingTop: 12, backgroundColor: theme?.colors?.bg || "#0B1220" },
  primary: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme?.colors?.primary || "#2E7DFF" },
  primaryT: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
  disabled: { opacity: 0.5 },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 18, justifyContent: "center" },
  modalCard: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "#0B1220", padding: 14, maxHeight: "70%" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  modalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  modalRowT: { color: "#fff", fontWeight: "900" },
  modalRowS: { marginTop: 4, color: "#fff", opacity: 0.65, fontWeight: "700", fontSize: 12 },
  modalClose: { marginTop: 12, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  modalCloseT: { color: "#fff", fontWeight: "900" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
