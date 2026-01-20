import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import {
  loadCourseData,
  saveCourseData,
  clearCourseData,
  publishLocalCourseToCloud,
} from "../storage/courseData";
import { isAdmin as isAdminUser } from "../storage/courseDataRemote";

const BG = "#000000";
const CARD = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const ORANGE = "#F39C12";
const ORANGE_TEXT = "#1B1200";
const RED = "#E74C3C";

function defaultHoleMeta() {
  const meta = {};
  for (let i = 1; i <= 18; i++) meta[String(i)] = { par: 4, si: i };
  return meta;
}

export default function CourseDataScreen({ navigation, route }) {
  const { course } = route.params;

  const [holeMeta, setHoleMeta] = useState(defaultHoleMeta());
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const admin = isAdminUser();

  useEffect(() => {
    let live = true;
    (async () => {
      const saved = await loadCourseData(course.id);
      if (!live) return;

      if (saved?.holeMeta) setHoleMeta(saved.holeMeta);
      setLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [course.id]);

  const isValid = useMemo(() => {
    const siSet = new Set();
    for (let h = 1; h <= 18; h++) {
      const par = Number(holeMeta[String(h)]?.par);
      const si = Number(holeMeta[String(h)]?.si);
      if (![3, 4, 5].includes(par)) return false;
      if (!Number.isFinite(si) || si < 1 || si > 18) return false;
      if (siSet.has(si)) return false;
      siSet.add(si);
    }
    return true;
  }, [holeMeta]);

  function updateHole(h, field, value) {
    setHoleMeta((prev) => ({
      ...prev,
      [String(h)]: {
        ...prev[String(h)],
        [field]: value,
      },
    }));
  }

  async function onSave() {
    if (!admin) return;

    if (!isValid) {
      Alert.alert("Fix inputs", "Pars must be 3/4/5 and Stroke Index must be 1-18 with no duplicates.");
      return;
    }
    const ok = await saveCourseData(course.id, { holeMeta });
    if (!ok) {
      Alert.alert("Save failed", "Could not save course data.");
      return;
    }
    navigation.goBack();
  }

  function onWipeCourse() {
    if (!admin) return;

    Alert.alert(
      "Wipe this course?",
      "This will delete ALL saved data for this course (Pars/SI and all green points/GPS mapping). You will be starting fresh for this course.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Wipe",
          style: "destructive",
          onPress: async () => {
            const ok = await clearCourseData(course.id);
            if (!ok) {
              Alert.alert("Wipe failed", "Could not wipe course data.");
              return;
            }
            setHoleMeta(defaultHoleMeta());
            Alert.alert("Wiped", "Course data cleared. You can now re-enter Pars/SI and re-map points.");
          },
        },
      ]
    );
  }

  async function onPublish() {
    if (!admin) return;

    setPublishing(true);
    try {
      const res = await publishLocalCourseToCloud(course.id);
      if (!res.ok) {
        Alert.alert("Publish failed", "No local course data found to publish from this device.");
        return;
      }
      Alert.alert("Published", "Course data is now saved to the cloud for all users.");
    } catch (e) {
      Alert.alert("Publish failed", "Could not publish to cloud. Check Firestore rules and login.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ color: WHITE, fontWeight: "900" }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>Course Hole Data</Text>
            <Text style={styles.sub}>{course.name}</Text>

            {admin ? (
              <Pressable
                onPress={onPublish}
                disabled={publishing}
                style={({ pressed }) => [styles.publishBtn, pressed && styles.pressed, publishing && { opacity: 0.6 }]}
              >
                <Text style={styles.publishText}>{publishing ? "Publishing..." : "Publish to Cloud"}</Text>
              </Pressable>
            ) : (
              <View style={styles.readOnlyPill}>
                <Text style={styles.readOnlyText}>Read-only (guests cannot edit course data)</Text>
              </View>
            )}

            {admin ? (
              <Pressable onPress={onWipeCourse} style={({ pressed }) => [styles.wipeBtn, pressed && styles.pressed]}>
                <Text style={styles.wipeText}>Wipe this course</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            {Array.from({ length: 18 }).map((_, i) => {
              const h = i + 1;
              const parVal = String(holeMeta[String(h)]?.par ?? "");
              const siVal = String(holeMeta[String(h)]?.si ?? "");

              return (
                <View key={h} style={styles.rowCard}>
                  <Text style={styles.holeLabel}>Hole {h}</Text>

                  <View style={styles.rowInputs}>
                    <View style={styles.field}>
                      <Text style={styles.label}>Par</Text>
                      <TextInput
                        value={parVal}
                        editable={admin}
                        onChangeText={(v) => updateHole(h, "par", v)}
                        keyboardType="numeric"
                        style={[styles.input, !admin && { opacity: 0.85 }]}
                        placeholder="3/4/5"
                        placeholderTextColor={MUTED}
                      />
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Stroke Index</Text>
                      <TextInput
                        value={siVal}
                        editable={admin}
                        onChangeText={(v) => updateHole(h, "si", v)}
                        keyboardType="numeric"
                        style={[styles.input, !admin && { opacity: 0.85 }]}
                        placeholder="1-18"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.orangeBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.orangeText}>Cancel</Text>
            </Pressable>

            {admin ? (
              <Pressable style={[styles.greenBtn, !isValid && { opacity: 0.5 }]} onPress={onSave}>
                <Text style={styles.greenText}>Save</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  title: { color: WHITE, fontSize: 28, fontWeight: "900" },
  sub: { color: MUTED, marginTop: 6, fontWeight: "700" },

  publishBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#243E63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  publishText: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.2 },

  readOnlyPill: {
    marginTop: 12,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  readOnlyText: { color: "rgba(255,255,255,0.80)", fontWeight: "900", fontSize: 13 },

  wipeBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 16,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },
  wipeText: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.2 },

  rowCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 14,
  },
  holeLabel: { color: WHITE, fontWeight: "900", marginBottom: 10 },

  rowInputs: { flexDirection: "row", gap: 12 },
  field: { flex: 1 },
  label: { color: MUTED, fontWeight: "900", fontSize: 12, marginBottom: 6 },

  input: {
    height: 46,
    borderRadius: 16,
    backgroundColor: INNER,
    color: WHITE,
    paddingHorizontal: 12,
    fontWeight: "900",
  },

  footer: { padding: 16, flexDirection: "row", gap: 12, backgroundColor: BG },
  orangeBtn: {
    flex: 1,
    height: 56,
    borderRadius: 999,
    backgroundColor: ORANGE,
    alignItems: "center",
    justifyContent: "center",
  },
  orangeText: { color: ORANGE_TEXT, fontWeight: "900", fontSize: 16 },

  greenBtn: {
    flex: 1,
    height: 56,
    borderRadius: 999,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  greenText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 16 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
