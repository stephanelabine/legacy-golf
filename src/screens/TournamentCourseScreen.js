// src/screens/TournamentCourseScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  getDocs,
  setDoc,
  onSnapshot as onSnapshotQuery,
  writeBatch,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";
import { searchCoursesUnified } from "../services/courseSearch";

export default function TournamentCourseScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  // When opened from Overview, we should return by POP (goBack), not push/replace a new Overview.
  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [saving, setSaving] = useState(false);

  const [roundDocs, setRoundDocs] = useState([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRound, setPickerRound] = useState(1);

  const [qText, setQText] = useState("");

  const [courseResults, setCourseResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId]);

  const roundsReady = !!t?.roundsReady;
  const roundsTotal = Math.max(1, Number(t?.roundsTotal || 1));

  const u = auth.currentUser;
  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  function isNumericId(id) {
    return /^[0-9]+$/.test(String(id || ""));
  }

  function roundIdFor(n) {
    return `r${n}`;
  }

  function parseRoundNumberFromDoc(docId, data) {
    const rn =
      Number(data?.roundNumber) ||
      Number(data?.roundIndex) ||
      (typeof docId === "string" && docId.startsWith("r") ? Number(docId.slice(1)) : NaN) ||
      (isNumericId(docId) ? Number(docId) : NaN);

    return Number.isFinite(rn) ? rn : null;
  }

  useEffect(() => {
    if (!tournamentId) return;
    if (!roundsReady) return;

    let cancelled = false;

    async function migrateAndSeedCanonicalRounds() {
      try {
        const rref = collection(db, "tournaments", tournamentId, "rounds");
        const snap = await getDocs(rref);

        const numericByRound = new Map();
        const canonicalByRound = new Map();

        snap.forEach((d) => {
          const data = d.data() || {};
          const rn = parseRoundNumberFromDoc(d.id, data);
          if (!rn) return;

          if (isNumericId(d.id)) numericByRound.set(rn, { ref: d.ref, data, id: d.id });
          if (String(d.id || "").startsWith("r")) canonicalByRound.set(rn, { ref: d.ref, data, id: d.id });
        });

        const batch = writeBatch(db);

        for (let i = 1; i <= roundsTotal; i++) {
          const canonical = canonicalByRound.get(i);
          const numeric = numericByRound.get(i);

          const targetRef = doc(db, "tournaments", tournamentId, "rounds", roundIdFor(i));

          const sourceData = canonical?.data || {};
          const migrateFromNumeric = numeric?.data || {};

          const courseId = String(sourceData?.courseId || "").trim()
            ? sourceData.courseId
            : migrateFromNumeric?.courseId ?? null;

          const courseName = String(sourceData?.courseName || "").trim()
            ? sourceData.courseName
            : migrateFromNumeric?.courseName ?? null;

          const teeCode = String(sourceData?.teeCode || "").trim() ? sourceData.teeCode : migrateFromNumeric?.teeCode ?? null;

          const teeName = String(sourceData?.teeName || "").trim() ? sourceData.teeName : migrateFromNumeric?.teeName ?? null;

          const teeYardage =
            typeof sourceData?.teeYardage === "number"
              ? sourceData.teeYardage
              : typeof migrateFromNumeric?.teeYardage === "number"
                ? migrateFromNumeric.teeYardage
                : migrateFromNumeric?.teeYardage
                  ? Number(migrateFromNumeric.teeYardage)
                  : null;

          batch.set(
            targetRef,
            {
              roundNumber: i,
              roundIndex: i,
              courseId: courseId ?? null,
              courseName: courseName ?? null,
              teeCode: teeCode ?? null,
              teeName: teeName ?? null,
              teeYardage: Number.isFinite(teeYardage) ? teeYardage : null,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        snap.forEach((d) => {
          const data = d.data() || {};
          const rn = parseRoundNumberFromDoc(d.id, data);
          if (!rn) return;

          if (isNumericId(d.id)) {
            batch.delete(d.ref);
            return;
          }

          if (String(d.id || "").startsWith("r") && rn > roundsTotal) {
            batch.delete(d.ref);
          }
        });

        await batch.commit();

        const allRoundsSnap = await getDocs(collection(db, "tournaments", tournamentId, "rounds"));
        let r1CourseId = null;
        let r1CourseName = null;
        allRoundsSnap.forEach((d) => {
          if (d.id === "r1") {
            const dd = d.data() || {};
            r1CourseId = dd?.courseId ?? null;
            r1CourseName = dd?.courseName ?? null;
          }
        });

        if (!cancelled && String(r1CourseId || "").trim()) {
          try {
            await updateDoc(doc(db, "tournaments", tournamentId), {
              courseId: r1CourseId,
              courseName: r1CourseName || null,
              updatedAt: serverTimestamp(),
            });
          } catch (e) { }
        }
      } catch (e) {
        if (!cancelled) Alert.alert("Setup failed", e?.message || "Could not prepare round records.");
      }
    }

    migrateAndSeedCanonicalRounds();

    return () => {
      cancelled = true;
    };
  }, [tournamentId, roundsReady, roundsTotal]);

  useEffect(() => {
    if (!tournamentId) return;
    if (!roundsReady) return;

    const rref = collection(db, "tournaments", tournamentId, "rounds");
    const rq = query(rref, orderBy("roundNumber", "asc"));

    const unsub = onSnapshotQuery(
      rq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => {
          if (String(d.id || "").startsWith("r")) rows.push({ id: d.id, ...d.data() });
        });
        setRoundDocs(rows);
      },
      (err) => Alert.alert("Rounds error", err?.message || "Could not load rounds.")
    );

    return () => unsub();
  }, [tournamentId, roundsReady]);

  const roundInfo = useMemo(() => {
    const m = new Map();
    (roundDocs || []).forEach((r) => {
      const rn =
        Number(r?.roundNumber) ||
        Number(r?.roundIndex) ||
        (typeof r?.id === "string" && r.id.startsWith("r") ? Number(r.id.slice(1)) : NaN);

      if (!Number.isFinite(rn)) return;

      m.set(rn, {
        courseId: r?.courseId ? String(r.courseId) : "",
        courseName: r?.courseName ? String(r.courseName) : "",
      });
    });
    return m;
  }, [roundDocs]);

  const missingRounds = useMemo(() => {
    if (!roundsReady) return [];
    const missing = [];
    for (let i = 1; i <= roundsTotal; i++) {
      const info = roundInfo.get(i) || {};
      if (!String(info.courseId || "").trim()) missing.push(i);
    }
    return missing;
  }, [roundInfo, roundsReady, roundsTotal]);

  const allRoundsHaveCourses = roundsReady && missingRounds.length === 0;

  // Search results for the picker (debounced, safe, minimal API usage)
  useEffect(() => {
    if (!pickerOpen) return;

    let cancelled = false;
    let timer = null;

    async function run() {
      setSearching(true);
      try {
        const list = await searchCoursesUnified(qText, { limit: 50 });
        if (!cancelled) setCourseResults(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setCourseResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }

    // Debounce typing so we don't spam API calls
    timer = setTimeout(run, 350);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pickerOpen, qText]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const green = isDark ? "rgba(15,122,74,0.92)" : "rgba(15,122,74,0.92)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.16)";
    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 170 },

      hero: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 14,
      },
      heroKicker: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      warn: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 12,
      },
      warnTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      warnSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      sectionTitle: {
        marginTop: 4,
        marginBottom: 12,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      roundBlock: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 2,
        borderColor: greenRing,
        backgroundColor: theme.card2,
        marginBottom: 14,
      },
      roundLabel: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.4, textAlign: "center" },

      coursePill: {
        marginTop: 12,
        alignSelf: "center",
        width: "84%",
        minHeight: 96,
        borderRadius: 22,
        paddingVertical: 20,
        paddingHorizontal: 16,
        borderWidth: 2,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      coursePillText: { color: theme.text, fontSize: 16, fontWeight: "900", textAlign: "center", lineHeight: 20 },
      coursePillSub: { marginTop: 10, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800", textAlign: "center" },

      selectBtn: {
        marginTop: 12,
        height: 48,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: green,
        borderWidth: 1,
        borderColor: greenRing,
      },
      selectBtnText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },

      footer: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: footerPad,
        paddingTop: 12,
        backgroundColor: theme.bg,
        borderTopWidth: 1,
        borderTopColor: theme.divider,
      },
      primaryBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
      },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      secondaryBtn: {
        marginTop: 10,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      },
      modalCard: {
        width: "100%",
        maxHeight: "84%",
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
      },
      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
      modalSub: {
        marginTop: 6,
        color: theme.text,
        opacity: 0.7,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
        textAlign: "center",
      },

      input: {
        marginTop: 14,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 15,
        fontWeight: "800",
      },

      hintLine: {
        marginTop: 10,
        marginBottom: 2,
        color: theme.text,
        opacity: 0.7,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
      },

      courseRow: {
        marginTop: 12,
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: theme.card2,
        overflow: "hidden",
      },
      courseRowActive: { borderColor: blue, backgroundColor: blueBg },
      courseRowTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      courseRowSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },
    });
  }, [theme, isDark, footerPad]);

  function openPicker(roundIndex) {
    if (!roundsReady) {
      Alert.alert("Rounds first", "Confirm the number of rounds before selecting courses.");
      return;
    }
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }
    setPickerRound(roundIndex);
    setQText("");
    setCourseResults([]);
    setPickerOpen(true);
  }

  function normalizePickedCourse(item) {
    // from unified search:
    // local: { id, name, ... }
    // api: { id, name, clubName?, city?, state?, country?, raw... }
    if (!item) return { id: "", name: "Course" };

    const id = String(item?.id ?? item?.courseId ?? "").trim();
    const name = String(item?.name ?? item?.courseName ?? "Course").trim();

    return { id, name, raw: item?.raw || null, source: item?.source || null };
  }

  async function setCourseForRound(roundIndex, course) {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }

    const picked = normalizePickedCourse(course);
    const cid = picked.id;
    const cname = picked.name || "Course";

    if (!cid) {
      Alert.alert("Missing course id", "This course is missing an id.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "rounds", roundIdFor(roundIndex)),
        {
          roundNumber: roundIndex,
          roundIndex: roundIndex,
          courseId: cid,
          courseName: cname,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (roundIndex === 1) {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          courseId: cid,
          courseName: cname,
          updatedAt: serverTimestamp(),
        });
      }

      setPickerOpen(false);
      Keyboard.dismiss();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not set course for this round.");
    } finally {
      setSaving(false);
    }
  }

  async function clearCoursesForAllRounds() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }

    Alert.alert("Clear all round courses?", "This will remove course selections for every round.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            const rref = collection(db, "tournaments", tournamentId, "rounds");
            const snap = await getDocs(rref);

            const batch = writeBatch(db);
            snap.forEach((d) => {
              batch.set(d.ref, { courseId: null, courseName: null, updatedAt: serverTimestamp() }, { merge: true });
            });

            await batch.commit();

            await updateDoc(doc(db, "tournaments", tournamentId), {
              courseId: null,
              courseName: null,
              coursesReady: false,
              updatedAt: serverTimestamp(),
            });
          } catch (e) {
            Alert.alert("Clear failed", e?.message || "Could not clear round courses.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function onSaveOrContinue() {
    if (saving) return;

    if (!roundsReady) {
      Alert.alert("Rounds first", "Confirm the number of rounds before selecting courses.");
      return;
    }

    if (!allRoundsHaveCourses) {
      Alert.alert("Courses needed", `Select a course for round(s): ${missingRounds.join(", ")}`);
      return;
    }

    try {
      const patch = {
        coursesReady: true,
        updatedAt: serverTimestamp(),
      };
      if (!fromOverview) patch.setupStep = "tees";

      await updateDoc(doc(db, "tournaments", tournamentId), patch);
    } catch (e) { }

    // Return behavior:
    // - If opened from Overview: POP back to the existing Overview (no duplicate Overview in stack)
    // - Safety fallback: if no back stack, hard-return to Overview
    if (fromOverview) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate(returnTo, { tournamentId });
      }
      return;
    }

    navigation.navigate(ROUTES.TOURNAMENT_TEES, { tournamentId });
  }

  function renderCoursePickRow({ item }) {
    const cid = String(item?.id ?? item?.courseId ?? "");
    const cname = String(item?.name || "Course");

    const current = roundInfo.get(pickerRound) || {};
    const active = String(current.courseId || "") && String(current.courseId) === cid;

    const source = String(item?.source || "");
    const subParts = [];
    if (source === "api") {
      const club = String(item?.clubName || "").trim();
      const city = String(item?.city || "").trim();
      const state = String(item?.state || "").trim();
      const country = String(item?.country || "").trim();

      const loc = [city, state].filter(Boolean).join(", ");
      const tail = [loc, country].filter(Boolean).join(" · ");
      if (club && club !== cname) subParts.push(club);
      if (tail) subParts.push(tail);
    } else if (source === "local") {
      subParts.push("Local");
    }

    return (
      <Pressable
        onPress={() => setCourseForRound(pickerRound, item)}
        disabled={saving || !isHost}
        style={({ pressed }) => [
          styles.courseRow,
          active && styles.courseRowActive,
          pressed && !saving && isHost && styles.pressed,
          (saving || !isHost) && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.courseRowTitle}>{cname}</Text>
        <Text style={styles.courseRowSub}>{subParts.length ? subParts.join(" · ") : `courseId: ${cid}`}</Text>
      </Pressable>
    );
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Confirm & Continue";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Courses"
        subtitle={fromOverview ? "Edit courses, then return." : "Confirm a course for each round"}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>{fromOverview ? "Edit" : "Step 2"}</Text>
          <Text style={styles.heroTitle}>{roundsReady ? "Round Courses" : "Rounds required"}</Text>
          <Text style={styles.heroSub}>
            {roundsReady
              ? fromOverview
                ? "Select a course for each round. Saving will return to the overview."
                : "Select a course for each round. When finished, confirm and continue to tees."
              : "Go back and confirm rounds first."}
          </Text>
        </View>

        {!roundsReady ? (
          <View style={styles.warn}>
            <Text style={styles.warnTitle}>Rounds not set</Text>
            <Text style={styles.warnSub}>Confirm the number of rounds first, then return here to choose courses.</Text>

            <Pressable
              onPress={() => navigation.navigate(ROUTES.TOURNAMENT_ROUNDS, { tournamentId })}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryText}>Go to Rounds</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Rounds</Text>

            {Array.from({ length: roundsTotal }).map((_, idx) => {
              const r = idx + 1;
              const info = roundInfo.get(r) || {};
              const cname = String(info.courseName || "").trim();

              return (
                <View key={`round-${r}`} style={styles.roundBlock}>
                  <Text style={styles.roundLabel}>Round {r}</Text>

                  <View style={styles.coursePill}>
                    <Text style={styles.coursePillText} numberOfLines={2} ellipsizeMode="tail">
                      {cname ? cname : "No course selected"}
                    </Text>
                    <Text style={styles.coursePillSub}>{cname ? "Course selected · Ready" : "Select a course to continue"}</Text>
                  </View>

                  <Pressable
                    onPress={() => openPicker(r)}
                    disabled={saving || !isHost}
                    style={({ pressed }) => [
                      styles.selectBtn,
                      pressed && isHost && !saving && styles.pressed,
                      (saving || !isHost) && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.selectBtnText}>Select Round {r} Course</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onSaveOrContinue}
          disabled={saving || !roundsReady || !isHost}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !roundsReady || !isHost) && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : primaryLabel}</Text>
        </Pressable>

        <Pressable
          onPress={clearCoursesForAllRounds}
          disabled={saving || !roundsReady || !isHost}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !roundsReady || !isHost) && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.secondaryText}>Clear All Round Courses</Text>
        </Pressable>
      </View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setPickerOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <Text style={styles.modalTitle}>Round {pickerRound} Course</Text>
              <Text style={styles.modalSub}>Search, then tap a course to set it for this round.</Text>

              <TextInput
                value={qText}
                onChangeText={setQText}
                placeholder="Search courses (type 3+ letters for live results)"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Text style={styles.hintLine}>
                {searching ? "Searching…" : qText.trim().length < 3 ? "Tip: type at least 3 letters to search the live database." : "Tap a course to select it."}
              </Text>

              <FlatList
                data={courseResults}
                keyExtractor={(c, i) => String(c?.id ?? c?.courseId ?? c?.name ?? i)}
                renderItem={renderCoursePickRow}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
              />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
