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
  deleteDoc,
  onSnapshot as onSnapshotQuery,
  writeBatch,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { db } from "../firebase/firebase";
import { COURSES_LOCAL } from "../data/coursesLocal";

export default function TournamentCourseScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [saving, setSaving] = useState(false);

  const [roundDocs, setRoundDocs] = useState([]); // canonical rounds only (r1..rN)

  // modal picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRound, setPickerRound] = useState(1);
  const [qText, setQText] = useState("");

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

  // --- helpers -------------------------------------------------------------

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

  // --- migration + canonical seeding --------------------------------------

  useEffect(() => {
    if (!tournamentId) return;
    if (!roundsReady) return;

    let cancelled = false;

    async function migrateAndSeedCanonicalRounds() {
      try {
        const rref = collection(db, "tournaments", tournamentId, "rounds");
        const snap = await getDocs(rref);

        // Gather any existing docs, numeric and r*
        const numericByRound = new Map(); // 1 -> {ref, data}
        const canonicalByRound = new Map(); // 1 -> {ref, data}

        snap.forEach((d) => {
          const data = d.data() || {};
          const rn = parseRoundNumberFromDoc(d.id, data);
          if (!rn) return;

          if (isNumericId(d.id)) numericByRound.set(rn, { ref: d.ref, data, id: d.id });
          if (String(d.id || "").startsWith("r")) canonicalByRound.set(rn, { ref: d.ref, data, id: d.id });
        });

        const batch = writeBatch(db);

        // Ensure canonical r1..rN exist, and migrate course/tee fields from numeric if needed.
        for (let i = 1; i <= roundsTotal; i++) {
          const canonical = canonicalByRound.get(i);
          const numeric = numericByRound.get(i);

          const targetRef = doc(db, "tournaments", tournamentId, "rounds", roundIdFor(i));

          // Prefer canonical values, but if missing, pull from numeric.
          const sourceData = canonical?.data || {};
          const migrateFromNumeric = numeric?.data || {};

          const courseId = String(sourceData?.courseId || "").trim()
            ? sourceData.courseId
            : migrateFromNumeric?.courseId ?? null;

          const courseName = String(sourceData?.courseName || "").trim()
            ? sourceData.courseName
            : migrateFromNumeric?.courseName ?? null;

          const teeCode = String(sourceData?.teeCode || "").trim()
            ? sourceData.teeCode
            : migrateFromNumeric?.teeCode ?? null;

          const teeName = String(sourceData?.teeName || "").trim()
            ? sourceData.teeName
            : migrateFromNumeric?.teeName ?? null;

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
              // keep roundIndex for backward compatibility if any old code still queries it
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

        // Delete numeric docs (and any extra r-docs beyond roundsTotal)
        snap.forEach((d) => {
          const data = d.data() || {};
          const rn = parseRoundNumberFromDoc(d.id, data);
          if (!rn) return;

          // remove numeric ids always
          if (isNumericId(d.id)) {
            batch.delete(d.ref);
            return;
          }

          // remove canonical rounds that are beyond roundsTotal
          if (String(d.id || "").startsWith("r") && rn > roundsTotal) {
            batch.delete(d.ref);
          }
        });

        await batch.commit();

        // Also keep tournament-level courseId/courseName synced to Round 1 (optional compatibility)
        // Only if Round 1 has a course selected.
        const round1Ref = doc(db, "tournaments", tournamentId, "rounds", roundIdFor(1));
        const round1Snap = await getDocs(collection(db, "tournaments", tournamentId, "rounds")); // cheap-ish; already in cache
        let r1CourseId = null;
        let r1CourseName = null;
        round1Snap.forEach((d) => {
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
          } catch (e) {
            // non-blocking
          }
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

  // Subscribe to canonical rounds only (r1..rN) so screens stay consistent
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
          // only keep canonical ids r*
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

  const courses = useMemo(() => {
    const arr = Array.isArray(COURSES_LOCAL) ? [...COURSES_LOCAL] : [];
    arr.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    return arr;
  }, []);

  const filteredCourses = useMemo(() => {
    const q = String(qText || "").trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const name = String(c?.name || "").toLowerCase();
      const id = String(c?.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [courses, qText]);

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
      heroSub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.74,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 19,
      },

      warn: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 12,
      },
      warnTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      warnSub: {
        marginTop: 6,
        color: theme.text,
        opacity: 0.72,
        fontSize: 13,
        fontWeight: "700",
        lineHeight: 18,
      },

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
      roundLabel: {
        color: theme.text,
        fontSize: 14,
        fontWeight: "900",
        letterSpacing: 0.4,
        textAlign: "center",
      },

      coursePill: {
        marginTop: 12,
        alignSelf: "center",
        width: "82%",
        minHeight: 78,
        borderRadius: 20,
        paddingVertical: 18,
        paddingHorizontal: 16,
        borderWidth: 2,
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      coursePillText: {
        color: theme.text,
        fontSize: 16,
        fontWeight: "900",
        textAlign: "center",
        lineHeight: 20,
      },
      coursePillSub: {
        marginTop: 10,
        color: theme.text,
        opacity: 0.7,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
      },

      selectBtn: {
        marginTop: 14,
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: green,
        borderWidth: 1,
        borderColor: greenRing,
      },
      selectBtnText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

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
      Alert.alert("Rounds first", "Set the number of rounds before assigning courses.");
      return;
    }
    setPickerRound(roundIndex);
    setQText("");
    setPickerOpen(true);
  }

  async function setCourseForRound(roundIndex, course) {
    if (!tournamentId) return;

    const cid = String(course?.id ?? course?.courseId ?? "");
    const cname = String(course?.name ?? "Course");

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
          roundIndex: roundIndex, // keep for legacy ordering
          courseId: cid,
          courseName: cname,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // keep tournament-level fields as "Round 1 default"
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
              // clear canonical rounds; also clears any leftovers if they exist
              batch.set(d.ref, { courseId: null, courseName: null, updatedAt: serverTimestamp() }, { merge: true });
            });

            await batch.commit();

            await updateDoc(doc(db, "tournaments", tournamentId), {
              courseId: null,
              courseName: null,
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

  function handleContinue() {
    if (saving) return;

    if (!roundsReady) {
      Alert.alert("Rounds not set", "Set the number of rounds first, then assign a course per round.");
      return;
    }

    if (!allRoundsHaveCourses) {
      Alert.alert("Courses missing", `Select a course for round(s): ${missingRounds.join(", ")}`);
      return;
    }

    navigation.navigate(ROUTES.TOURNAMENT_TEES, { tournamentId });
  }

  function renderCoursePickRow({ item }) {
    const cid = String(item?.id ?? item?.courseId ?? "");
    const cname = String(item?.name || "Course");

    const current = roundInfo.get(pickerRound) || {};
    const active = String(current.courseId || "") && String(current.courseId) === cid;

    return (
      <Pressable
        onPress={() => setCourseForRound(pickerRound, item)}
        disabled={saving}
        style={({ pressed }) => [
          styles.courseRow,
          active && styles.courseRowActive,
          pressed && !saving && styles.pressed,
          saving && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.courseRowTitle}>{cname}</Text>
        <Text style={styles.courseRowSub}>courseId: {cid}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament Course" subtitle="Assign a course per round." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Course</Text>
          <Text style={styles.heroTitle}>{roundsReady ? "Round Courses" : "Rounds required"}</Text>
          <Text style={styles.heroSub}>
            {roundsReady
              ? "Set each round’s course below. It’s designed to be fast, clean, and obvious."
              : "Go to Tournament Dashboard → Rounds, set the number of rounds, then come back here."}
          </Text>
        </View>

        {!roundsReady ? (
          <View style={styles.warn}>
            <Text style={styles.warnTitle}>Rounds not set</Text>
            <Text style={styles.warnSub}>Set the number of rounds first. Then you can assign a course per round.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Select Round</Text>

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
                    <Text style={styles.coursePillSub}>
                      {cname ? "Course selected · Ready" : "Course selected · Missing"}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => openPicker(r)}
                    disabled={saving}
                    style={({ pressed }) => [styles.selectBtn, pressed && styles.pressed, saving && { opacity: 0.7 }]}
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
          onPress={handleContinue}
          disabled={saving || !roundsReady}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && styles.pressed,
            (saving || !roundsReady) && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Continue"}</Text>
        </Pressable>

        <Pressable
          onPress={clearCoursesForAllRounds}
          disabled={saving || !roundsReady}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && !saving && styles.pressed,
            (saving || !roundsReady) && { opacity: 0.6 },
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
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Round {pickerRound} Course</Text>
              <Text style={styles.modalSub}>Search, then tap a course to set it for this round.</Text>

              <TextInput
                value={qText}
                onChangeText={setQText}
                placeholder="Search courses (e.g. Osoyoos, Desert Gold, Park Meadows)"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <FlatList
                data={filteredCourses}
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
