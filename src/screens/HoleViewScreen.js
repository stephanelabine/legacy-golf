// src/screens/HoleViewScreen.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  FlatList,
  InteractionManager,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import * as Location from "expo-location";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { loadCourseData } from "../storage/courseData";
import * as RoundState from "../storage/roundState";
import { saveRound } from "../storage/rounds";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const INNER2 = "#2A4A76";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const DANGER = "#D62828";
const YELLOW = "#F2C94C";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4];
const DEFAULT_SI = [10, 2, 16, 4, 12, 6, 14, 8, 18, 1, 15, 3, 11, 5, 13, 7, 17, 9];

const HOLE_PILL_SIZE = 44;
const HOLE_PILL_GAP = 8;
const HOLE_STEP = HOLE_PILL_SIZE + HOLE_PILL_GAP;

function buildDefaultHoleMeta() {
  const meta = {};
  for (let i = 1; i <= 18; i++) meta[String(i)] = { par: DEFAULT_PARS[i - 1], si: DEFAULT_SI[i - 1] };
  return meta;
}

function notesKey(courseName) {
  const safe = String(courseName || "course")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return `LEGACY_YARDAGE_BOOK_${safe}`;
}

function shortCourseTitle(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Course";

  const stripped = raw
    .replace(/\s*(golf\s*&\s*country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*and\s*country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*country\s*club)\s*$/i, "")
    .replace(/\s*(country\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*club)\s*$/i, "")
    .replace(/\s*(golf\s*course)\s*$/i, "")
    .replace(/\s*(golf)\s*$/i, "")
    .replace(/\s*[-–—:,]\s*$/i, "")
    .trim();

  return stripped || raw;
}

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const x = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function yds(m) {
  if (!Number.isFinite(m)) return "—";
  return String(Math.round(m * 1.09361));
}

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function pickFirstNumber(...vals) {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function unwrapRound(state) {
  if (!state || typeof state !== "object") return null;
  return state?.activeRound || state?.currentRound || state?.round || state;
}

function pickHoleFromActive(activeState) {
  const root = unwrapRound(activeState);
  if (!root) return null;

  const holeNumberDirect = pickFirstNumber(
    root?.holeNumber,
    root?.currentHole,
    root?.hole,
    root?.lastHole,
    root?.resumeHole
  );

  let holeNumber = holeNumberDirect;

  if (holeNumber === null || holeNumber === undefined) {
    const idx = Number(root?.holeIndex);
    if (Number.isFinite(idx) && idx >= 0 && idx <= 17) holeNumber = idx + 1;
  }

  if (!Number.isFinite(holeNumber)) return null;
  if (holeNumber < 1 || holeNumber > 18) return null;
  return holeNumber;
}

function getMissingHolesFromState(state, playersList) {
  const players = Array.isArray(playersList) ? playersList : [];
  const ids = players.map((p, idx) => String(p?.id ?? String(idx)));

  const missing = [];
  for (let h = 1; h <= 18; h++) {
    let holeOk = true;
    for (const pid of ids) {
      const strokes = state?.holes?.[String(h)]?.players?.[String(pid)]?.strokes;
      if (toInt(strokes) <= 0) {
        holeOk = false;
        break;
      }
    }
    if (!holeOk) missing.push(h);
  }
  return missing;
}

function holeHasAllStrokes(state, holeNumber, playersList) {
  const players = Array.isArray(playersList) ? playersList : [];
  const ids = players.map((p, idx) => String(p?.id ?? String(idx)));

  for (const pid of ids) {
    const strokes = state?.holes?.[String(holeNumber)]?.players?.[String(pid)]?.strokes;
    if (toInt(strokes) <= 0) return false;
  }
  return ids.length > 0;
}

export default function HoleViewScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};

  const courseParam = params.course;
  const teeParam = params.tee;

  const courseId =
    params.courseId ??
    courseParam?.id ??
    courseParam?.courseId ??
    (typeof courseParam === "string" ? courseParam : null);

  const courseName =
    params.courseName ??
    courseParam?.name ??
    courseParam?.courseName ??
    (typeof courseParam === "string" ? courseParam : "Course");

  const teeName = teeParam?.name ?? (typeof teeParam === "string" ? teeParam : "Tees");
  const players = params.players || [];
  const roundId = params.roundId ?? null;

  const [currentHole, setCurrentHole] = useState(params.hole || 1);
  const [courseData, setCourseData] = useState(null);
  const [user, setUser] = useState(null);
  const [activeSnap, setActiveSnap] = useState(null);

  const holeMeta = useMemo(() => {
    return params.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
  }, [params.holeMeta]);

  const par = holeMeta?.[String(currentHole)]?.par ?? 4;

  useEffect(() => {
    const incoming = Number(params?.hole);
    if (Number.isFinite(incoming) && incoming >= 1 && incoming <= 18 && incoming !== currentHole) {
      setCurrentHole(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.hole]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let sub = null;

      (async () => {
        try {
          const s = await RoundState.loadActiveRound();
          if (cancelled) return;
          setActiveSnap(s || null);

          const fromActive = pickHoleFromActive(s);
          if (fromActive) {
            setCurrentHole((prev) => (fromActive !== prev ? fromActive : prev));
          }
        } catch {
          if (!cancelled) setActiveSnap(null);
        }

        try {
          if (courseId) {
            const saved = await loadCourseData(String(courseId));
            if (!cancelled) setCourseData(saved || null);
          } else {
            if (!cancelled) setCourseData(null);
          }
        } catch {
          if (!cancelled) setCourseData(null);
        }

        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (cancelled) return;
          if (status !== "granted") return;

          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
            (p) => {
              if (cancelled) return;
              setUser({ lat: p.coords.latitude, lon: p.coords.longitude });
            }
          );
        } catch {}
      })();

      return () => {
        cancelled = true;
        if (sub) sub.remove();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [courseId])
  );

  const savedGpsHole = useMemo(() => {
    const gps = courseData?.gps;
    const hole = gps?.holes?.[String(currentHole)] || null;
    return hole;
  }, [courseData, currentHole]);

  const green = savedGpsHole?.green || null;
  const hasGreenPoints = !!(green?.front || green?.middle || green?.back);
  const gpsLive = !!user;

  const yardages = useMemo(() => {
    if (!user || !green) return { front: "—", middle: "—", back: "—" };

    const out = { front: "—", middle: "—", back: "—" };
    if (green.front && Number.isFinite(green.front.lat) && Number.isFinite(green.front.lon)) {
      out.front = yds(haversineMeters(user, green.front));
    }
    if (green.middle && Number.isFinite(green.middle.lat) && Number.isFinite(green.middle.lon)) {
      out.middle = yds(haversineMeters(user, green.middle));
    }
    if (green.back && Number.isFinite(green.back.lat) && Number.isFinite(green.back.lon)) {
      out.back = yds(haversineMeters(user, green.back));
    }
    return out;
  }, [user, green]);

  const [yardageOpen, setYardageOpen] = useState(false);
  const [yardageText, setYardageText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(notesKey(courseName));
        if (!live) return;
        const obj = raw ? JSON.parse(raw) : {};
        const note = obj?.[String(currentHole)] || "";
        setYardageText(String(note));
      } catch {
        if (!live) return;
        setYardageText("");
      }
    })();
    return () => {
      live = false;
    };
  }, [courseName, currentHole]);

  async function saveYardageNoteAndClose() {
    setSaving(true);
    try {
      const key = notesKey(courseName);
      const raw = await AsyncStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      obj[String(currentHole)] = String(yardageText || "").trim();
      await AsyncStorage.setItem(key, JSON.stringify(obj));
    } catch {}
    setSaving(false);
    Keyboard.dismiss();
    setYardageOpen(false);
  }

  function openScoreEntry(extra = {}) {
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      hole: currentHole,
      holeMeta,
      roundId,
      courseName,
      teeName,
      ...extra,
    });
  }

  function openScorecard() {
    navigation.navigate(ROUTES.SCORECARD, {
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
      roundId,
      hole: currentHole,
      holeIndex: currentHole - 1,
    });
  }

  function openGreenView() {
    navigation.navigate(ROUTES.GREEN_VIEW, {
      ...params,
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
      roundId,
      hole: currentHole,
      holeIndex: currentHole - 1,
      courseName,
      teeName,
    });
  }

  function openHazards() {
    navigation.navigate(ROUTES.HAZARDS, {
      ...params,
      course: courseParam ?? { name: courseName },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
      roundId,
      hole: currentHole,
      holeIndex: currentHole - 1,
      courseName,
      teeName,
    });
  }

  function openHoleMap(openSetup = false) {
    navigation.navigate(ROUTES.HOLE_MAP, {
      roundId,
      holeIndex: currentHole - 1,
      hole: currentHole,
      course: courseParam ?? { name: courseName, id: courseId },
      tee: teeParam ?? { name: teeName },
      players,
      holeMeta,
      courseName,
      courseId: courseId ? String(courseId) : null,
      openSetup: !!openSetup,
    });
  }

  const headerTitle = useMemo(() => shortCourseTitle(courseName), [courseName]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedOpen, setDeletedOpen] = useState(false);

  const [savingRound, setSavingRound] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  async function doDeleteRound() {
    if (deleting) return;
    setDeleting(true);
    try {
      await RoundState.clearActiveRoundEverywhere();
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
      setDeletedOpen(true);
      setTimeout(() => {
        setDeletedOpen(false);
        navigation.navigate(ROUTES.HOME);
      }, 900);
    }
  }

  async function doSaveRoundNow({ status }) {
    if (savingRound) return;

    setSavingRound(true);
    try {
      const active = (await RoundState.loadActiveRound()) || {};

      const safePlayers = Array.isArray(active?.players) && active.players.length ? active.players : players;
      const safeCourse = active?.course || courseParam || { name: courseName };
      const safeTee = active?.tee || teeParam || { name: teeName };
      const safeHoles = active?.holes || {};

      // NEW: persist wagers + holeMeta to the saved round
      const safeWagers = active?.wagers || params?.wagers || null;
      const safeMeta = active?.meta && typeof active.meta === "object" ? active.meta : {};
      const mergedMeta = { ...safeMeta, holeMeta };

      const id = String(active?.id || roundId || `r_${Date.now()}`);

      const payload = {
        id,
        courseName: String(safeCourse?.name || courseName || "Course"),
        teeName: String(safeTee?.name || teeName || "Tees"),
        course: safeCourse,
        tee: safeTee,
        players: safePlayers,
        holes: safeHoles,
        wagers: safeWagers,
        meta: mergedMeta,
        playedAt: active?.playedAt || active?.startedAt || new Date().toISOString(),
        startedAt: active?.startedAt || new Date().toISOString(),
        status: status || "in_progress",
        lastHole: currentHole,
      };

      const ok = await saveRound(payload);
      if (!ok) {
        Alert.alert("Save failed", "Could not save this round to history.");
        return { ok: false, roundId: id };
      }

      setSavedOpen(true);
      setTimeout(() => setSavedOpen(false), 900);
      return { ok: true, roundId: id };
    } catch {
      Alert.alert("Save failed", "Could not save this round to history.");
      return { ok: false, roundId: null };
    } finally {
      setSavingRound(false);
    }
  }

  function onPressSaveRound() {
    if (savingRound) return;
    Alert.alert("Save round?", "This will save the round to Round History so you can review or resume later.", [
      { text: "Cancel", style: "cancel" },
      { text: "Save", onPress: () => doSaveRoundNow({ status: "in_progress" }) },
    ]);
  }

  async function onPressFinishRound() {
    if (savingRound) return;

    try {
      const active = (await RoundState.loadActiveRound()) || {};
      const missing = getMissingHolesFromState(active, players);

      if (missing.length) {
        const list = missing.join(", ");
        Alert.alert("Missing scores", `Some holes are missing strokes.\n\nMissing holes: ${list}`, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Fix now",
            onPress: () => {
              const first = missing[0];
              openScoreEntry({
                hole: first,
                fixMissing: true,
                missingHoles: missing,
                missingIndex: 0,
                finishReturnHole: 18,
              });
            },
          },
        ]);
        return;
      }

      const res = await doSaveRoundNow({ status: "completed" });

      try {
        await RoundState.clearActiveRoundEverywhere();
      } catch {}

      const FINAL_RESULTS = ROUTES.FINAL_RESULTS || "FinalResults";

      navigation.dispatch(
        CommonActions.navigate({
          name: FINAL_RESULTS,
          params: {
            roundId: res?.roundId || active?.id || roundId || null,
            course: active?.course || courseParam || { name: courseName },
            tee: active?.tee || teeParam || { name: teeName },
            players: active?.players || players,
            holeMeta: active?.meta?.holeMeta || holeMeta,
          },
          merge: true,
        })
      );
    } catch {
      Alert.alert("Finish failed", "Could not finish the round. Please try again.");
    }
  }

  function onPressHome() {
    Alert.alert("Exit round?", "Are you sure you want to exit the round and return Home?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit (no save)",
        style: "destructive",
        onPress: () => {
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: ROUTES.HOME }],
            })
          );
        },
      },
      {
        text: "Save & Exit",
        onPress: async () => {
          await doSaveRoundNow({ status: "in_progress" });
          navigation.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: ROUTES.HOME }],
            })
          );
        },
      },
    ]);
  }

  const showFinish = currentHole === 18 && holeHasAllStrokes(activeSnap || {}, 18, players);

  const holeListRef = useRef(null);
  const [holeBarWidth, setHoleBarWidth] = useState(0);

  const sidePad = useMemo(() => {
    if (!holeBarWidth) return 0;
    const pad = holeBarWidth / 2 - HOLE_PILL_SIZE / 2;
    return Math.max(0, Math.round(pad));
  }, [holeBarWidth]);

  const holesData = useMemo(() => Array.from({ length: 18 }).map((_, i) => i + 1), []);

  const getItemLayout = useCallback((data, index) => {
    return { length: HOLE_STEP, offset: HOLE_STEP * index, index };
  }, []);

  const scrollHoleToCenter = useCallback((h, animated = true) => {
    if (!holeListRef.current) return;
    const idx = Math.min(17, Math.max(0, Number(h || 1) - 1));
    const offset = HOLE_STEP * idx;

    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        holeListRef.current?.scrollToOffset?.({ offset, animated });
      });
    });
  }, []);

  useEffect(() => {
    if (!holeBarWidth) return;
    scrollHoleToCenter(currentHole, true);
    setTimeout(() => scrollHoleToCenter(currentHole, false), 60);
    setTimeout(() => scrollHoleToCenter(currentHole, false), 180);
  }, [currentHole, holeBarWidth, scrollHoleToCenter]);

  useFocusEffect(
    useCallback(() => {
      if (!holeBarWidth) return undefined;
      const t1 = setTimeout(() => scrollHoleToCenter(currentHole, false), 40);
      const t2 = setTimeout(() => scrollHoleToCenter(currentHole, false), 160);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }, [currentHole, holeBarWidth, scrollHoleToCenter])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        navigation={navigation}
        title={headerTitle}
        subtitle={`${teeName} • Hole ${currentHole} • Par ${par}`}
        safeTop={false}
        rightLabel="Home"
        onRightPress={onPressHome}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.holeBarWrap} onLayout={(e) => setHoleBarWidth(e?.nativeEvent?.layout?.width || 0)}>
          <FlatList
            ref={holeListRef}
            data={holesData}
            keyExtractor={(item) => String(item)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.holePills, { paddingHorizontal: sidePad }]}
            extraData={currentHole}
            getItemLayout={getItemLayout}
            onContentSizeChange={() => {
              setTimeout(() => scrollHoleToCenter(currentHole, false), 0);
            }}
            renderItem={({ item }) => {
              const h = item;
              const active = h === currentHole;
              return (
                <Pressable
                  onPress={() => setCurrentHole(h)}
                  style={({ pressed }) => [
                    styles.holePill,
                    active && styles.holePillActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.holePillText, active && styles.holePillTextActive]}>{h}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <View style={styles.modeRow}>
          <Pressable onPress={openScorecard} style={[styles.modeBtn, styles.modeBtnPrimary]}>
            <Text style={[styles.modeText, styles.modeTextPrimary]}>Scorecard</Text>
          </Pressable>

          <Pressable onPress={openGreenView} style={styles.modeBtn}>
            <Text style={styles.modeText}>Green View</Text>
          </Pressable>

          <Pressable onPress={openHazards} style={styles.modeBtn}>
            <Text style={styles.modeText}>Hazards</Text>
          </Pressable>
        </View>

        <View style={styles.ybWrap}>
          <Pressable
            onPress={() => setYardageOpen(true)}
            style={({ pressed }) => [styles.ybCard, pressed && styles.pressed]}
          >
            <Text style={styles.ybCenterText}>Yardage Book</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => openHoleMap(false)} style={styles.mapCard}>
          <Text style={styles.mapTitle}>Hole View</Text>
          <Text style={styles.mapSub}>Tap to open full-screen GPS</Text>
        </Pressable>

        <View style={styles.yardageRow}>
          {[
            ["front", "FRONT"],
            ["middle", "MIDDLE"],
            ["back", "BACK"],
          ].map(([k, label]) => (
            <View key={k} style={styles.yardCard}>
              <Text style={styles.yardLabel}>{label}</Text>
              <Text style={styles.yardValue}>{yardages[k]}</Text>
              <Text style={styles.yardUnit}>yards</Text>

              {gpsLive ? (
                <View style={styles.microRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.microText}>LIVE GPS</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {!hasGreenPoints ? (
          <View style={styles.hintCard}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.hintTitle}>No green points yet</Text>
              <Text style={styles.hintSub}>Set front / mid / back once, and yardages will be perfect every round.</Text>
            </View>

            <Pressable
              onPress={() => openHoleMap(true)}
              disabled={!courseId}
              style={({ pressed }) => [styles.hintBtn, pressed && styles.pressed, !courseId && { opacity: 0.45 }]}
            >
              <Text style={styles.hintBtnT}>Set points</Text>
              <Text style={styles.hintBtnS}>→</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
        <Pressable style={styles.greenBtn} onPress={() => openScoreEntry()}>
          <Text style={styles.greenText}>Input Scores</Text>
        </Pressable>

        <View style={styles.footerMiniRow}>
          <Pressable
            onPress={showFinish ? onPressFinishRound : onPressSaveRound}
            style={({ pressed }) => [
              styles.miniBtn,
              styles.saveMiniBtn,
              pressed && styles.pressed,
              savingRound && { opacity: 0.7 },
            ]}
            disabled={savingRound}
          >
            <Text style={styles.miniBtnText}>{savingRound ? "Saving…" : showFinish ? "Finish Round" : "Save Round"}</Text>
          </Pressable>

          <Pressable
            onPress={() => setDeleteOpen(true)}
            style={({ pressed }) => [styles.miniBtn, styles.deleteMiniBtn, pressed && styles.pressed]}
          >
            <Text style={styles.miniBtnText}>Delete Round</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={yardageOpen} transparent animationType="fade" onRequestClose={() => setYardageOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setYardageOpen(false)}>
          <View />
        </Pressable>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Yardage Book</Text>
                <Text style={styles.modalSub}>
                  {courseName} • Hole {currentHole}
                </Text>
              </View>

              <Pressable onPress={() => setYardageOpen(false)} style={({ pressed }) => [styles.modalX, pressed && styles.pressed]}>
                <Text style={styles.modalXText}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              value={yardageText}
              onChangeText={setYardageText}
              placeholder="Example: Wind left-to-right. Aim at right edge. Long is trouble…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.modalInput}
              multiline
              autoFocus
            />

            <Pressable
              onPress={saveYardageNoteAndClose}
              disabled={saving}
              style={({ pressed }) => [styles.modalDone, pressed && styles.pressed, saving && { opacity: 0.7 }]}
            >
              <Text style={styles.modalDoneText}>{saving ? "Saving…" : "Done"}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <Pressable style={styles.confirmBg} onPress={() => setDeleteOpen(false)}>
          <View />
        </Pressable>

        <View style={styles.confirmWrap}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Delete round?</Text>
            <Text style={styles.confirmSub}>Are you sure you want to delete this round? This can’t be undone.</Text>

            <View style={styles.confirmRow}>
              <Pressable onPress={() => setDeleteOpen(false)} style={({ pressed }) => [styles.confirmBtn, pressed && styles.pressed]}>
                <Text style={styles.confirmBtnT}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={doDeleteRound}
                disabled={deleting}
                style={({ pressed }) => [styles.confirmBtnDanger, pressed && styles.pressed, deleting && { opacity: 0.7 }]}
              >
                <Text style={styles.confirmBtnDangerT}>{deleting ? "Deleting…" : "Delete"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deletedOpen} transparent animationType="fade" onRequestClose={() => setDeletedOpen(false)}>
        <Pressable style={styles.confirmBg} onPress={() => setDeletedOpen(false)}>
          <View />
        </Pressable>
        <View style={styles.confirmWrap}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Round deleted</Text>
            <Text style={styles.confirmSub}>Returning Home…</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={savedOpen} transparent animationType="fade" onRequestClose={() => setSavedOpen(false)}>
        <Pressable style={styles.confirmBg} onPress={() => setSavedOpen(false)}>
          <View />
        </Pressable>
        <View style={styles.confirmWrap}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Round saved</Text>
            <Text style={styles.confirmSub}>Saved to Round History.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  body: { flex: 1 },
  bodyContent: { paddingBottom: 14 },

  holeBarWrap: { paddingTop: 8, paddingBottom: 6 },
  holePills: { alignItems: "center" },

  holePill: {
    width: HOLE_PILL_SIZE,
    height: HOLE_PILL_SIZE,
    borderRadius: HOLE_PILL_SIZE / 2,
    backgroundColor: INNER,
    alignItems: "center",
    justifyContent: "center",
    marginRight: HOLE_PILL_GAP,
  },

  holePillActive: { backgroundColor: GREEN, borderRadius: HOLE_PILL_SIZE / 2 },
  holePillText: { color: WHITE, fontWeight: "900" },
  holePillTextActive: { color: GREEN_TEXT },

  modeRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 4 },
  modeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    backgroundColor: INNER2,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnPrimary: {
    backgroundColor: "rgba(46,125,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  modeText: { color: WHITE, fontWeight: "900" },
  modeTextPrimary: { color: WHITE },

  ybWrap: { marginHorizontal: 16, marginTop: 8 },

  ybCard: {
    height: 84,
    borderRadius: 27,
    borderWidth: 4,
    borderColor: YELLOW,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  ybCenterText: { color: WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.3 },

  mapCard: {
    marginHorizontal: 16,
    marginTop: 8,
    height: 210,
    borderRadius: 22,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  mapTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },
  mapSub: { color: MUTED, marginTop: 8, fontWeight: "700", fontSize: 14 },

  yardageRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 10 },
  yardCard: { flex: 1, backgroundColor: CARD, borderRadius: 20, alignItems: "center", paddingVertical: 10 },
  yardLabel: { color: MUTED, fontSize: 11, fontWeight: "900" },
  yardValue: { color: WHITE, fontSize: 30, fontWeight: "900", marginTop: 6 },
  yardUnit: { color: MUTED, fontSize: 12, fontWeight: "700" },

  microRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(46,125,255,0.95)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
  },
  microText: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 10, letterSpacing: 0.7 },

  hintCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 22,
    padding: 12,
    backgroundColor: "rgba(46,125,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.26)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hintTitle: { color: WHITE, fontWeight: "900", fontSize: 13 },
  hintSub: { marginTop: 6, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

  hintBtn: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  hintBtnT: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
  hintBtnS: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 14 },

  footer: {
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },

  greenBtn: {
    height: 56,
    borderRadius: 999,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  greenText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },

  footerMiniRow: { marginTop: 10, flexDirection: "row", gap: 10 },

  miniBtn: {
    flex: 1,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  saveMiniBtn: { backgroundColor: "rgba(46,125,255,0.18)", borderColor: "rgba(46,125,255,0.45)" },
  deleteMiniBtn: { backgroundColor: "rgba(214,40,40,0.12)", borderColor: "rgba(214,40,40,0.35)" },

  miniBtnText: { color: WHITE, fontWeight: "900", letterSpacing: 0.25, fontSize: 13 },

  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
  modalWrap: { flex: 1, justifyContent: "center", padding: 18 },
  modalCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  modalTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  modalSub: { marginTop: 5, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

  modalX: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  modalXText: { color: WHITE, fontWeight: "900", fontSize: 14 },

  modalInput: {
    minHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.20)",
    color: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },

  modalDone: {
    marginTop: 12,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GREEN,
  },
  modalDoneText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 16 },

  confirmBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
  confirmWrap: { flex: 1, justifyContent: "center", padding: 18 },
  confirmCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(18,22,30,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  confirmTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
  confirmSub: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  confirmRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  confirmBtnT: { color: WHITE, fontWeight: "900" },
  confirmBtnDanger: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DANGER,
  },
  confirmBtnDangerT: { color: WHITE, fontWeight: "900" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
