// src/screens/TournamentCourseScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, Alert, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

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
  const [query, setQuery] = useState("");

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

  const currentCourseId = t?.courseId ? String(t.courseId) : "";
  const currentCourseName = t?.courseName ? String(t.courseName) : "";

  const courses = useMemo(() => {
    const arr = Array.isArray(COURSES_LOCAL) ? [...COURSES_LOCAL] : [];
    arr.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    return arr;
  }, []);

  const filteredCourses = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return courses;

    return courses.filter((c) => {
      const name = String(c?.name || "").toLowerCase();
      const id = String(c?.id ?? c?.courseId ?? "").toLowerCase();

      // Optional fields if you add them later in COURSES_LOCAL:
      const city = String(c?.city || "").toLowerCase();
      const region = String(c?.region || c?.province || "").toLowerCase();

      const haystack = `${name} ${city} ${region} ${id}`.trim();
      return haystack.includes(q);
    });
  }, [courses, query]);

  const data = useMemo(() => {
    return [
      { _type: "current", key: "current" },
      { _type: "search", key: "search" },
      { _type: "section", key: "section-all" },
      ...filteredCourses.map((c, idx) => {
        const cid = String(c?.id ?? c?.courseId ?? c?.name ?? idx);
        return { _type: "course", key: `c-${cid}`, course: c, _cid: cid };
      }),
      { _type: "end", key: "end" },
    ];
  }, [filteredCourses]);

  const styles = useMemo(() => {
    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const greenRing = isDark ? "rgba(15,122,74,0.55)" : "rgba(15,122,74,0.62)";
    const greenRingActive = isDark ? "rgba(15,122,74,0.88)" : "rgba(15,122,74,0.90)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },

      listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 140 },

      currentCard: {
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 14,
      },
      currentKicker: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.78,
        textTransform: "uppercase",
      },
      currentTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      currentSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      searchWrap: {
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 12,
      },
      searchLabel: {
        color: theme.text,
        opacity: 0.75,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        textTransform: "uppercase",
      },
      searchInput: {
        marginTop: 10,
        height: 48,
        borderRadius: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 15,
        fontWeight: "800",
      },

      sectionTitle: {
        marginTop: 6,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      row: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        marginBottom: 12,
        position: "relative",
        overflow: "hidden",
      },
      rowActive: { borderColor: blue, backgroundColor: blueBg },

      greenRing: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: greenRing,
        opacity: 0.95,
      },
      greenRingActive: { borderColor: greenRingActive, opacity: 0.95 },

      rowTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
      rowSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      pill: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.2 },

      emptyCard: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 12,
      },
      emptyTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      emptySub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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
    });
  }, [theme, isDark, footerPad]);

  async function setCourse(course) {
    if (!tournamentId) return;
    const cid = String(course?.id ?? course?.courseId ?? "");
    const cname = String(course?.name ?? "Course");

    if (!cid) {
      Alert.alert("Missing course id", "This course is missing an id.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        courseId: cid,
        courseName: cname,
        updatedAt: serverTimestamp(),
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not set course.");
    } finally {
      setSaving(false);
    }
  }

  async function clearCourse() {
    if (!tournamentId) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        courseId: null,
        courseName: null,
        updatedAt: serverTimestamp(),
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Clear failed", e?.message || "Could not clear course.");
    } finally {
      setSaving(false);
    }
  }

  function renderItem({ item }) {
    if (item._type === "current") {
      return (
        <View style={styles.currentCard}>
          <Text style={styles.currentKicker}>Course</Text>
          <Text style={styles.currentTitle}>{currentCourseName ? `Selected: ${currentCourseName}` : "Current not set"}</Text>
          <Text style={styles.currentSub}>
            Tap a course below to set it for this tournament. This selection is saved in Firebase.
          </Text>
        </View>
      );
    }

    if (item._type === "search") {
      return (
        <View style={styles.searchWrap}>
          <Text style={styles.searchLabel}>Search</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Type a course name…"
            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
            style={styles.searchInput}
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      );
    }

    if (item._type === "section") {
      return <Text style={styles.sectionTitle}>All Courses</Text>;
    }

    if (item._type === "end") {
      if (!filteredCourses.length) {
        return (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptySub}>Try a different search (example: “Osoyoos”, “Kelowna”, “Bear”).</Text>
          </View>
        );
      }
      return null;
    }

    if (item._type !== "course") return null;

    const c = item.course || {};
    const cid = String(c?.id ?? c?.courseId ?? item._cid);
    const active = !!currentCourseId && cid === currentCourseId;

    return (
      <Pressable
        onPress={() => setCourse(c)}
        disabled={saving}
        style={({ pressed }) => [
          styles.row,
          active && styles.rowActive,
          pressed && !saving && styles.pressed,
          saving && { opacity: 0.6 },
        ]}
      >
        <View pointerEvents="none" style={[styles.greenRing, active && styles.greenRingActive]} />

        <Text style={styles.rowTitle}>{String(c?.name || "Course")}</Text>
        <Text style={styles.rowSub}>courseId: {cid}</Text>

        {active ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>Current</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament Course" subtitle="Select the course for this tournament." />

      <FlatList
        data={data}
        keyExtractor={(x) => x.key}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={saving}
          style={({ pressed }) => [styles.primaryBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Done"}</Text>
        </Pressable>

        <Pressable
          onPress={clearCourse}
          disabled={saving}
          style={({ pressed }) => [styles.secondaryBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.secondaryText}>Clear Course</Text>
        </Pressable>
      </View>
    </View>
  );
}
