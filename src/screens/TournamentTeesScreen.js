// src/screens/TournamentTeesScreen.js
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
  getDocs,
  setDoc,
  query,
  orderBy,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";
import { getTeesForCourse } from "../services/tees";

function roundDocId(n) {
  const v = Number(n);
  const idx = Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
  return `r${idx}`;
}
function parseRoundIndexFromId(id) {
  const s = String(id || "").trim().toLowerCase();
  if (s.startsWith("r")) {
    const n = Number(s.slice(1));
    if (Number.isFinite(n)) return Math.floor(n);
  }
  const n2 = Number(s);
  if (Number.isFinite(n2)) return Math.floor(n2);
  return null;
}

export default function TournamentTeesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  // IMPORTANT: when opened from Overview, return by POP (goBack) so we don't stack Overview screens
  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [saving, setSaving] = useState(false);

  const [roundDocs, setRoundDocs] = useState([]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRound, setPickerRound] = useState(1);
  const [pickerCourseId, setPickerCourseId] = useState("");
  const [pickerCourseName, setPickerCourseName] = useState("");
  const [teesLoading, setTeesLoading] = useState(false);
  const [tees, setTees] = useState([]);
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
  }, [tournamentId, navigation]);

  const u = auth.currentUser;
  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  useEffect(() => {
    if (!tournamentId) return;

    const rref = collection(db, "tournaments", tournamentId, "rounds");
    const rq = query(rref, orderBy("roundNumber", "asc"));

    const unsub = onSnapshot(
      rq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => {
          if (String(d.id || "").startsWith("r")) rows.push({ id: d.id, ...d.data() });
        });

        rows.sort((a, b) => {
          const ai = Number(a?.roundNumber);
          const bi = Number(b?.roundNumber);
          const aIdx = Number.isFinite(ai) ? Math.floor(ai) : parseRoundIndexFromId(a?.id);
          const bIdx = Number.isFinite(bi) ? Math.floor(bi) : parseRoundIndexFromId(b?.id);
          return Number(aIdx || 0) - Number(bIdx || 0);
        });

        setRoundDocs(rows);
      },
      (err) => Alert.alert("Rounds error", err?.message || "Could not load rounds.")
    );

    return () => unsub();
  }, [tournamentId]);

  const roundsReady = !!t?.roundsReady;
  const roundsTotal = Math.max(1, Number(t?.roundsTotal || 1));

  const roundInfo = useMemo(() => {
    const m = new Map();

    (roundDocs || []).forEach((r) => {
      const riRaw = Number(r?.roundNumber || r?.roundIndex);
      const ri = Number.isFinite(riRaw) ? Math.floor(riRaw) : parseRoundIndexFromId(r?.id);
      if (!Number.isFinite(ri) || ri < 1) return;

      m.set(ri, {
        courseId: r?.courseId ? String(r.courseId) : "",
        courseName: r?.courseName ? String(r.courseName) : "",
        teeCode: r?.teeCode ? String(r.teeCode) : "",
        teeName: r?.teeName ? String(r.teeName) : "",
        teeYardage: typeof r?.teeYardage === "number" ? r.teeYardage : r?.teeYardage ? Number(r.teeYardage) : null,
      });
    });

    return m;
  }, [roundDocs]);

  const missingTees = useMemo(() => {
    if (!roundsReady) return [];
    const missing = [];
    for (let i = 1; i <= roundsTotal; i++) {
      const info = roundInfo.get(i) || {};
      if (!String(info.courseId || "").trim()) missing.push(i);
      else if (!String(info.teeCode || "").trim()) missing.push(i);
    }
    return missing;
  }, [roundInfo, roundsReady, roundsTotal]);

  const allRoundsHaveTees = roundsReady && missingTees.length === 0;

  const filteredTees = useMemo(() => {
    const q = String(qText || "").trim().toLowerCase();
    if (!q) return tees;
    return (tees || []).filter((t2) => {
      const name = String(t2?.name || "").toLowerCase();
      const code = String(t2?.code || "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [tees, qText]);

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

      teePill: {
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
      teePillText: { color: theme.text, fontSize: 16, fontWeight: "900", textAlign: "center", lineHeight: 20 },
      teePillSub: { marginTop: 10, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800", textAlign: "center" },

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

      teeRow: {
        marginTop: 12,
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: greenRing,
        backgroundColor: theme.card2,
        overflow: "hidden",
      },
      teeRowActive: { borderColor: blue, backgroundColor: blueBg },
      teeRowTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      teeRowSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },
    });
  }, [theme, isDark, footerPad]);

  function openPicker(roundIndex) {
    if (!roundsReady) {
      Alert.alert("Rounds first", "Set the number of rounds before selecting tees.");
      return;
    }
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }

    const info = roundInfo.get(roundIndex) || {};
    const cid = String(info.courseId || "").trim();
    const cname = String(info.courseName || "").trim();

    if (!cid) {
      Alert.alert("Course required", `Select a course for Round ${roundIndex} first.`);
      return;
    }

    setPickerRound(roundIndex);
    setPickerCourseId(cid);
    setPickerCourseName(cname);
    setQText("");
    setPickerOpen(true);
  }

  useEffect(() => {
    let mounted = true;

    async function loadTees() {
      if (!pickerOpen) return;
      if (!pickerCourseId) return;

      setTeesLoading(true);
      try {
        const data = await getTeesForCourse(pickerCourseId, { courseName: pickerCourseName });
        const list = Array.isArray(data) ? data : [];
        if (!mounted) return;
        setTees(list);
      } catch (e) {
        if (!mounted) return;
        Alert.alert("Tees failed", e?.message || "Could not load tees for this course.");
        setTees([]);
      } finally {
        if (mounted) setTeesLoading(false);
      }
    }

    loadTees();

    return () => {
      mounted = false;
    };
  }, [pickerOpen, pickerCourseId, pickerCourseName]);

  async function setTeeForRound(roundIndex, tee) {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }

    const code = String(tee?.code ?? "").trim();
    const name = String(tee?.name ?? "").trim();
    const yardage = typeof tee?.yardage === "number" ? tee.yardage : tee?.yardage ? Number(tee.yardage) : null;

    if (!code) {
      Alert.alert("Missing tee", "This tee is missing a code.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "rounds", roundDocId(roundIndex)),
        {
          roundNumber: Math.floor(Number(roundIndex) || 1),
          roundIndex: Math.floor(Number(roundIndex) || 1),
          teeCode: code,
          teeName: name || code,
          teeYardage: Number.isFinite(yardage) ? yardage : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setPickerOpen(false);
      Keyboard.dismiss();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not set tees for this round.");
    } finally {
      setSaving(false);
    }
  }

  async function clearTeesForAllRounds() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit tournament setup.");
      return;
    }

    Alert.alert("Clear all round tees?", "This will remove tee selections for every round.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            const rref = collection(db, "tournaments", tournamentId, "rounds");
            const snap = await getDocs(rref);

            const updates = [];
            snap.forEach((d) => {
              if (!String(d.id || "").startsWith("r")) return;
              updates.push(
                setDoc(d.ref, { teeCode: null, teeName: null, teeYardage: null, updatedAt: serverTimestamp() }, { merge: true })
              );
            });

            await Promise.all(updates);

            try {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                teesReady: false,
                updatedAt: serverTimestamp(),
              });
            } catch (e) {}
          } catch (e) {
            Alert.alert("Clear failed", e?.message || "Could not clear round tees.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function onSaveOrContinue() {
    if (saving) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can continue tournament setup.");
      return;
    }

    if (!roundsReady) {
      Alert.alert("Rounds not set", "Set the number of rounds first, then select tees per round.");
      return;
    }

    if (!allRoundsHaveTees) {
      Alert.alert("Tees missing", `Complete tee selection for round(s): ${missingTees.join(", ")}`);
      return;
    }

    try {
      const patch = {
        teesReady: true,
        updatedAt: serverTimestamp(),
      };
      if (!fromOverview) patch.setupStep = "formats";
      await updateDoc(doc(db, "tournaments", tournamentId), patch);
    } catch (e) {}

    if (fromOverview) {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate(returnTo, { tournamentId });
      return;
    }

    navigation.navigate(ROUTES.TOURNAMENT_FORMATS, { tournamentId });
  }

  function renderTeePickRow({ item }) {
    const current = roundInfo.get(pickerRound) || {};
    const active = String(current.teeCode || "") && String(current.teeCode) === String(item?.code || "");

    const yard = typeof item?.yardage === "number" ? item.yardage : item?.yardage ? Number(item.yardage) : null;

    return (
      <Pressable
        onPress={() => setTeeForRound(pickerRound, item)}
        disabled={saving || !isHost}
        style={({ pressed }) => [
          styles.teeRow,
          active && styles.teeRowActive,
          pressed && !saving && isHost && styles.pressed,
          (saving || !isHost) && { opacity: 0.6 },
        ]}
      >
        <Text style={styles.teeRowTitle}>{String(item?.name || item?.code || "Tee")}</Text>
        <Text style={styles.teeRowSub}>
          code: {String(item?.code || "")}
          {Number.isFinite(yard) ? `  •  ${yard} yds` : ""}
        </Text>
      </Pressable>
    );
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Confirm & Continue";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Tournament Tees"
        subtitle={fromOverview ? "Edit tees, then return." : "Select tees per round."}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>{fromOverview ? "Edit" : "Tees"}</Text>
          <Text style={styles.heroTitle}>{roundsReady ? "Round Tees" : "Rounds required"}</Text>
          <Text style={styles.heroSub}>
            {roundsReady
              ? fromOverview
                ? "Choose tees for each round. Saving will return to the overview."
                : "Choose tees for each round. This stays separate from normal round setup."
              : "Go back and set rounds first."}
          </Text>
        </View>

        {!roundsReady ? (
          <View style={styles.warn}>
            <Text style={styles.warnTitle}>Rounds not set</Text>
            <Text style={styles.warnSub}>Set the number of rounds first. Then you can select tees per round.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Select tees by round</Text>

            {Array.from({ length: roundsTotal }).map((_, idx) => {
              const r = idx + 1;
              const info = roundInfo.get(r) || {};
              const cname = String(info.courseName || "").trim();
              const teeName = String(info.teeName || "").trim();
              const teeCode = String(info.teeCode || "").trim();

              const displayTitle = teeName || teeCode || "No tees selected";
              const displaySub = !String(info.courseId || "").trim()
                ? "Course required first"
                : teeCode
                ? "Tee selected · Ready"
                : "Tee missing";

              return (
                <View key={`tee-round-${r}`} style={styles.roundBlock}>
                  <Text style={styles.roundLabel}>Round {r}</Text>

                  <View style={styles.teePill}>
                    <Text style={styles.teePillText} numberOfLines={2} ellipsizeMode="tail">
                      {displayTitle}
                    </Text>
                    <Text style={styles.teePillSub}>{cname ? `${cname}  •  ${displaySub}` : displaySub}</Text>
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
                    <Text style={styles.selectBtnText}>Select Round {r} Tees</Text>
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
          onPress={clearTeesForAllRounds}
          disabled={saving || !roundsReady || !isHost}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !roundsReady || !isHost) && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.secondaryText}>Clear All Round Tees</Text>
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
              <Text style={styles.modalTitle}>Round {pickerRound} Tees</Text>
              <Text style={styles.modalSub}>
                {pickerCourseName ? `${pickerCourseName} • ` : ""}Search, then tap tees to set them for this round.
              </Text>

              <TextInput
                value={qText}
                onChangeText={setQText}
                placeholder="Search tees (e.g. Gold, Tournament, Blue)"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving && !teesLoading && isHost}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <FlatList
                data={filteredTees}
                keyExtractor={(t2, i) => String(t2?.code ?? i)}
                renderItem={renderTeePickRow}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 8 }}
                ListEmptyComponent={
                  teesLoading ? (
                    <Text style={[styles.modalSub, { marginTop: 14 }]}>Loading tees…</Text>
                  ) : (
                    <Text style={[styles.modalSub, { marginTop: 14 }]}>No tees found.</Text>
                  )
                }
              />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
