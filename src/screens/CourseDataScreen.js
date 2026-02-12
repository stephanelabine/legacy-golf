// src/screens/CourseDataScreen.js
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
  Modal,
  ActivityIndicator,
} from "react-native";
import {
  loadCourseData,
  saveCourseData,
  clearCourseData,
  publishLocalCourseToCloud,
  listLocalCourseDataSummaries,
  copyLocalCourseData,
  publishLocalCourseIdToCloud,
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
  const courseId = String(course?.id || "").trim();

  const [holeMeta, setHoleMeta] = useState(defaultHoleMeta());
  const [loading, setLoading] = useState(true);

  const [publishing, setPublishing] = useState(false);

  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverList, setRecoverList] = useState([]);
  const [selectedRecover, setSelectedRecover] = useState(null);
  const [recoverActing, setRecoverActing] = useState(false);

  const admin = isAdminUser();

  async function reload() {
    const saved = await loadCourseData(courseId);
    if (saved?.holeMeta) setHoleMeta(saved.holeMeta);
    else setHoleMeta(defaultHoleMeta());
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const saved = await loadCourseData(courseId);
      if (!live) return;

      if (saved?.holeMeta) setHoleMeta(saved.holeMeta);
      setLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [courseId]);

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
    const ok = await saveCourseData(courseId, { holeMeta });
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
            const ok = await clearCourseData(courseId);
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
      const res = await publishLocalCourseToCloud(courseId);
      if (!res.ok) {
        Alert.alert(
          "Publish failed",
          "No local course data found for this courseId.\n\nUse Recover Local Data to find the saved Green Tee data, then publish it."
        );
        return;
      }
      Alert.alert("Published", "Course data is now saved to the cloud for all users.");
    } catch (e) {
      Alert.alert("Publish failed", "Could not publish to cloud. Check Firestore rules and login.");
    } finally {
      setPublishing(false);
    }
  }

  async function openRecover() {
    if (!admin) return;

    setRecoverOpen(true);
    setRecoverLoading(true);
    setSelectedRecover(null);

    try {
      const list = await listLocalCourseDataSummaries();
      setRecoverList(list || []);
    } finally {
      setRecoverLoading(false);
    }
  }

  async function useSelected() {
    if (!admin || !selectedRecover?.courseId) return;

    setRecoverActing(true);
    try {
      const ok = await copyLocalCourseData(selectedRecover.courseId, courseId);
      if (!ok) {
        Alert.alert("Recover failed", "Could not copy that local blob into this course.");
        return;
      }
      await reload();
      setRecoverOpen(false);
      Alert.alert("Recovered", "This course is now using the recovered local data.");
    } finally {
      setRecoverActing(false);
    }
  }

  async function publishSelectedToCloud() {
    if (!admin || !selectedRecover?.courseId) return;

    setRecoverActing(true);
    try {
      const res = await publishLocalCourseIdToCloud(selectedRecover.courseId, courseId);
      if (!res.ok) {
        Alert.alert("Publish failed", "Could not publish that recovered blob to Firestore.");
        return;
      }
      Alert.alert("Published", "Recovered course data is now saved to the cloud for all users.");
    } catch {
      Alert.alert("Publish failed", "Could not publish that recovered blob. Check Firestore rules/login.");
    } finally {
      setRecoverActing(false);
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
            <Text style={styles.sub2}>courseId: {courseId}</Text>

            {admin ? (
              <>
                <Pressable onPress={openRecover} style={({ pressed }) => [styles.recoverBtn, pressed && styles.pressed]}>
                  <Text style={styles.recoverText}>Recover Local Data</Text>
                </Pressable>

                <Pressable
                  onPress={onPublish}
                  disabled={publishing}
                  style={({ pressed }) => [styles.publishBtn, pressed && styles.pressed, publishing && { opacity: 0.6 }]}
                >
                  <Text style={styles.publishText}>{publishing ? "Publishing..." : "Publish to Cloud"}</Text>
                </Pressable>

                <Pressable onPress={onWipeCourse} style={({ pressed }) => [styles.wipeBtn, pressed && styles.pressed]}>
                  <Text style={styles.wipeText}>Wipe this course</Text>
                </Pressable>
              </>
            ) : (
              <View style={styles.readOnlyPill}>
                <Text style={styles.readOnlyText}>Read-only (guests cannot edit course data)</Text>
              </View>
            )}
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

          <Modal visible={recoverOpen} transparent animationType="fade" onRequestClose={() => setRecoverOpen(false)}>
            <View style={styles.modalBg}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Recover Local Data</Text>
                  <Pressable onPress={() => setRecoverOpen(false)} style={styles.modalClose}>
                    <Text style={styles.modalCloseT}>Close</Text>
                  </Pressable>
                </View>

                {recoverLoading ? (
                  <View style={styles.modalLoading}>
                    <ActivityIndicator />
                    <Text style={styles.modalLoadingT}>Scanning local storage…</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.modalSub}>Select the entry that has your real Green Tee values (not SI 1-18).</Text>

                    <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ padding: 12, paddingTop: 8 }}>
                      {recoverList.length === 0 ? (
                        <Text style={{ color: "rgba(255,255,255,0.72)", fontWeight: "800" }}>
                          No local course blobs found on this device.
                        </Text>
                      ) : (
                        recoverList.map((it) => {
                          const active = selectedRecover?.key === it.key;
                          const si1 = it?.hole1?.si ?? "—";
                          const par1 = it?.hole1?.par ?? "—";
                          return (
                            <Pressable
                              key={it.key}
                              onPress={() => setSelectedRecover(it)}
                              style={({ pressed }) => [
                                styles.recoverRow,
                                active && styles.recoverRowActive,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={styles.recoverRowT} numberOfLines={1}>
                                {it.courseId}
                              </Text>
                              <Text style={styles.recoverRowS}>
                                Hole1: Par {String(par1)} • SI {String(si1)} • GPS holes: {String(it.gpsHolesCount)}
                                {it.gpsLocked ? " • LOCKED" : ""}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>

                    <View style={styles.modalActions}>
                      <Pressable
                        disabled={!selectedRecover || recoverActing}
                        onPress={useSelected}
                        style={({ pressed }) => [
                          styles.actionBtn,
                          pressed && styles.pressed,
                          (!selectedRecover || recoverActing) && { opacity: 0.45 },
                        ]}
                      >
                        <Text style={styles.actionBtnT}>Use This Data</Text>
                      </Pressable>

                      <Pressable
                        disabled={!selectedRecover || recoverActing}
                        onPress={publishSelectedToCloud}
                        style={({ pressed }) => [
                          styles.actionBtn2,
                          pressed && styles.pressed,
                          (!selectedRecover || recoverActing) && { opacity: 0.45 },
                        ]}
                      >
                        <Text style={styles.actionBtnT2}>Publish Selected to Cloud</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
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
  sub2: { color: "rgba(175,195,218,0.75)", marginTop: 4, fontWeight: "800", fontSize: 12 },

  recoverBtn: {
    marginTop: 12,
    height: 44,
    borderRadius: 16,
    backgroundColor: "rgba(46,125,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  recoverText: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.2 },

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

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.70)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(18,22,30,0.96)",
    overflow: "hidden",
  },
  modalHeader: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 16 },
  modalClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalCloseT: { color: "#fff", fontWeight: "900" },

  modalLoading: { padding: 18, alignItems: "center", justifyContent: "center", gap: 10 },
  modalLoadingT: { color: "rgba(255,255,255,0.72)", fontWeight: "800" },

  modalSub: {
    color: "rgba(255,255,255,0.72)",
    fontWeight: "800",
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  recoverRow: {
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  recoverRowActive: {
    backgroundColor: "rgba(46,125,255,0.18)",
    borderColor: "rgba(46,125,255,0.35)",
  },
  recoverRowT: { color: "#fff", fontWeight: "900" },
  recoverRowS: { marginTop: 6, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },

  modalActions: { padding: 12, paddingTop: 0, flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46,125,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
  },
  actionBtnT: { color: "#fff", fontWeight: "900" },

  actionBtn2: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(46, 204, 113, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(46, 204, 113, 0.28)",
  },
  actionBtnT2: { color: "#fff", fontWeight: "900" },
});
