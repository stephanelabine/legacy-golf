// src/screens/QuickPostScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    Pressable,
    TextInput,
    ScrollView,
    Modal,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    InputAccessoryView,
    ActivityIndicator,
    Alert,
    Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";

import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth } from "../firebase/firebase";

import { searchCoursesUnified } from "../services/courseSearch";
import { getTeesForCourse } from "../services/tees";
import { loadCourseData } from "../storage/courseData";
import { createSetupRound, loadActiveRound, updateActiveRound, clearActiveRound } from "../storage/roundState";

const PROTECTED_LOCAL_COURSE_IDS = new Set(["green-tee-country-club"]);

function todayISODate() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return false;
    const [y, m, d] = String(iso).split("-").map((n) => Number(n));
    if (!y || !m || !d) return false;
    const dt = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return false;
    return dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d;
}

// Store playedAt as local-noon time (no timezone suffix) to avoid date shifting.
function playedAtValueFromISO(iso) {
    return `${iso}T12:00:00`;
}

function formatDateDisplay(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return "";
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    const mon = d.toLocaleString(undefined, { month: "short" }).toUpperCase();
    const day = String(d.getDate()).padStart(2, "0");
    const yr = String(d.getFullYear());
    return `${mon}-${day}-${yr}`;
}

function isoToDateLocalNoon(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return new Date();
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function dateToISO(d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return todayISODate();
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function safeStr(x) {
    return String(x == null ? "" : x).trim();
}

function toInt(v) {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function normalizeCourseResult(item) {
    const id = safeStr(item?.id) || `course_${Date.now()}`;
    const name = safeStr(item?.name) || "Course";
    return {
        id,
        name,
        source: safeStr(item?.source) || "local",
        clubName: safeStr(item?.clubName || ""),
        city: safeStr(item?.city || ""),
        state: safeStr(item?.state || ""),
        country: safeStr(item?.country || ""),
        raw: item?.raw || null,
    };
}

function formatYds(y) {
    const n = Number(y);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return `${Math.round(n)} yds`;
}

function buildYouPlayer() {
    const uid = auth?.currentUser?.uid ? String(auth.currentUser.uid) : null;
    const name = safeStr(auth?.currentUser?.displayName) || "You";
    return { id: "p1", name, isYou: true, uid };
}

export default function QuickPostScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    const { theme, scheme } = useTheme();
    const isDark = scheme === "dark";

    const bottomPad = useMemo(() => Math.max(18, (insets?.bottom || 0) + 16), [insets?.bottom]);

    const [booting, setBooting] = useState(true);
    const [roundId, setRoundId] = useState(null);
    const [roundDoc, setRoundDoc] = useState(null);

    const [dateISO, setDateISO] = useState(todayISODate());
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [tempDate, setTempDate] = useState(isoToDateLocalNoon(todayISODate()));

    const [scoreText, setScoreText] = useState("");
    const SCORE_ACCESSORY_ID = "quickpost_score_done";

    const course = roundDoc?.course || null;
    const tee = roundDoc?.tee || null;

    const [courseModalOpen, setCourseModalOpen] = useState(false);
    const [teeModalOpen, setTeeModalOpen] = useState(false);

    const [courseQuery, setCourseQuery] = useState("");
    const [courseSearching, setCourseSearching] = useState(false);
    const [courseResults, setCourseResults] = useState([]);
    const courseDebounceRef = useRef(null);
    const courseSeqRef = useRef(0);

    const [teeLoading, setTeeLoading] = useState(false);
    const [teeList, setTeeList] = useState([]);
    const [teeHoleMeta, setTeeHoleMeta] = useState(null);

    const grossTotal = useMemo(() => toInt(scoreText), [scoreText]);

    const isQuickReady = useMemo(() => {
        if (!roundId) return false;
        if (!isValidISODate(dateISO)) return false;
        if (!course?.id) return false;
        if (!tee?.code) return false;
        if (!Number.isFinite(grossTotal) || grossTotal <= 0) return false;
        if (grossTotal < 40 || grossTotal > 200) return false;
        return true;
    }, [roundId, dateISO, course?.id, tee?.code, grossTotal]);

    const ctaLabel = isQuickReady
        ? "Done: Return to Home"
        : !course?.id
            ? "Select Course"
            : !tee?.code
                ? "Select Tees"
                : "Enter Score";

    const hydrate = useCallback(async (rid) => {
        if (!rid) return;
        const fs = await loadActiveRound(rid);
        setRoundDoc(fs || null);

        const existingTotal = Number(fs?.grossTotal);
        if (Number.isFinite(existingTotal) && existingTotal > 0) {
            setScoreText(String(Math.round(existingTotal)));
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            let alive = true;

            (async () => {
                setBooting(true);
                try {
                    const created = await createSetupRound({ scoring: "gross" });
                    if (!alive) return;

                    const rid = created?.roundId || null;
                    setRoundId(rid);

                    const iso = dateISO || todayISODate();
                    if (rid) {
                        await updateActiveRound(
                            {
                                playedAt: playedAtValueFromISO(iso),
                                entrySource: "quick_post",
                                scoring: "gross",
                                players: [buildYouPlayer()],
                                playerCount: 1,
                                status: "setup",
                            },
                            rid
                        );
                        await hydrate(rid);
                    }
                } catch {
                    // ignore
                } finally {
                    if (alive) setBooting(false);
                }
            })();

            return () => {
                alive = false;
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [])
    );

    async function persistDate(nextISO) {
        if (!roundId) return;
        if (!isValidISODate(nextISO)) return;
        try {
            await updateActiveRound({ playedAt: playedAtValueFromISO(nextISO) }, roundId);
            await hydrate(roundId);
        } catch { }
    }

    useFocusEffect(
        useCallback(() => {
            if (!courseModalOpen) return;

            setCourseQuery("");
            setCourseResults([]);
            setCourseSearching(false);

            const seq = ++courseSeqRef.current;

            (async () => {
                setCourseSearching(true);
                try {
                    const res = await searchCoursesUnified("", { limit: 50 });
                    if (courseSeqRef.current !== seq) return;
                    setCourseResults(Array.isArray(res) ? res : []);
                } catch {
                    if (courseSeqRef.current !== seq) return;
                    setCourseResults([]);
                } finally {
                    if (courseSeqRef.current === seq) setCourseSearching(false);
                }
            })();

            return () => { };
        }, [courseModalOpen])
    );

    useEffect(() => {
        if (!courseModalOpen) return;

        if (courseDebounceRef.current) clearTimeout(courseDebounceRef.current);

        const q = safeStr(courseQuery);
        const seq = ++courseSeqRef.current;

        courseDebounceRef.current = setTimeout(async () => {
            setCourseSearching(true);
            try {
                const res = await searchCoursesUnified(q, { limit: 60 });
                if (courseSeqRef.current !== seq) return;
                setCourseResults(Array.isArray(res) ? res : []);
            } catch {
                if (courseSeqRef.current !== seq) return;
                setCourseResults([]);
            } finally {
                if (courseSeqRef.current === seq) setCourseSearching(false);
            }
        }, 250);

        return () => {
            if (courseDebounceRef.current) clearTimeout(courseDebounceRef.current);
        };
    }, [courseQuery, courseModalOpen]);

    async function selectCourse(item) {
        if (!roundId) return;
        Keyboard.dismiss();

        const nextCourse = normalizeCourseResult(item);

        const prevCourseId = safeStr(course?.id);
        const changed = !!(prevCourseId && prevCourseId !== nextCourse.id);

        try {
            const patch = {
                course: nextCourse,
                courseName: nextCourse.name,
                ...(changed ? { tee: null, teeName: null, holeMeta: null, "meta.holeMeta": null } : {}),
            };

            await updateActiveRound(patch, roundId);
            await hydrate(roundId);

            setCourseModalOpen(false);
        } catch {
            setCourseModalOpen(false);
        }
    }

    async function openTeesModal() {
        if (!roundId) return;
        if (!course?.id) {
            setCourseModalOpen(true);
            return;
        }

        setTeeModalOpen(true);
        setTeeLoading(true);
        setTeeList([]);
        setTeeHoleMeta(null);

        try {
            const courseId = safeStr(course.id);
            const isProtected = PROTECTED_LOCAL_COURSE_IDS.has(courseId);

            const tees = await getTeesForCourse(courseId, {
                courseName: course?.name || "",
                forceLocalOnly: isProtected,
            });

            const saved = await loadCourseData(courseId, { allowApiImport: !isProtected, publishIfAdmin: false });
            const hm = saved?.holeMeta || null;

            setTeeList(Array.isArray(tees) ? tees : []);
            setTeeHoleMeta(hm && typeof hm === "object" ? hm : null);
        } catch {
            setTeeList([]);
            setTeeHoleMeta(null);
        } finally {
            setTeeLoading(false);
        }
    }

    async function selectTee(t) {
        if (!roundId) return;

        const nextTee = t
            ? { name: safeStr(t?.name) || safeStr(t?.code) || "Tee", code: safeStr(t?.code) || "TEE", yardage: t?.yardage ?? null }
            : null;

        try {
            const patch = {
                tee: nextTee,
                teeName: nextTee?.name || null,
                holeMeta: teeHoleMeta || null,
                "meta.holeMeta": teeHoleMeta || null,
                scoring: "gross",
            };

            await updateActiveRound(patch, roundId);
            await hydrate(roundId);

            setTeeModalOpen(false);
        } catch {
            setTeeModalOpen(false);
        }
    }

    async function persistScore(nextText) {
        if (!roundId) return;

        const n = toInt(nextText);
        if (!Number.isFinite(n) || n <= 0) return;

        try {
            await updateActiveRound({ grossTotal: n }, roundId);
            await hydrate(roundId);
        } catch { }
    }

    async function onPrimary() {
        if (booting || !roundId) return;

        if (!isValidISODate(dateISO)) {
            Alert.alert("Check date", "Please choose a date.");
            return;
        }

        await persistDate(dateISO);

        if (!course?.id) {
            setCourseModalOpen(true);
            return;
        }
        if (!tee?.code) {
            await openTeesModal();
            return;
        }

        const n = toInt(scoreText);
        if (!Number.isFinite(n) || n <= 0) {
            Alert.alert("Enter score", "Please enter your total score for the round.");
            return;
        }
        if (n < 40 || n > 200) {
            Alert.alert("Check score", "Please enter a realistic total score (40–200).");
            return;
        }

        await persistScore(String(n));

        if (!isQuickReady) return;

        try {
            await updateActiveRound(
                {
                    status: "complete",
                    entrySource: "quick_post",
                    completedAt: new Date().toISOString(),
                    playedAt: playedAtValueFromISO(dateISO),
                    grossTotal: n,
                    scoring: "gross",
                    players: [buildYouPlayer()],
                    playerCount: 1,
                    currentHole: 18,
                    startHole: 1,
                },
                roundId
            );

            try {
                await clearActiveRound();
            } catch { }

            navigation.navigate("Home");
        } catch {
            Alert.alert("Couldn’t save", "Please try again.");
        }
    }

    const headerSubtitle = "Fast entry • Modals only • Saves to Round History";

    const courseLabel = course?.name ? safeStr(course.name) : "Select course";
    const teeLabel = tee?.name ? safeStr(tee.name) : "Select tees";

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
            <ScreenHeader navigation={navigation} title="Quick Post" subtitle={headerSubtitle} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                <ScrollView
                    contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <View
                        style={[
                            styles.card,
                            { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
                        ]}
                    >
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick round entry</Text>
                        <Text style={[styles.sectionSub, { color: theme.muted }]}>
                            Add past rounds quickly so your round history (and future handicap) stays accurate.
                        </Text>

                        <View style={styles.pickerStack}>
                            {/* Date */}
                            <Pressable
                                onPress={() => {
                                    setTempDate(isoToDateLocalNoon(dateISO));
                                    setDatePickerOpen(true);
                                }}
                                style={({ pressed }) => [
                                    styles.pickerPill,
                                    {
                                        borderColor: isDark ? "rgba(242,201,76,0.45)" : "rgba(242,201,76,0.65)",
                                        backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.70)",
                                        opacity: pressed ? 0.92 : 1,
                                    },
                                ]}
                            >
                                <View style={styles.pickerLeft}>
                                    <MaterialCommunityIcons name="calendar-month" size={18} color={theme.muted} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.pickerLabel, { color: theme.muted }]}>Date</Text>
                                        <Text style={[styles.pickerValue, { color: theme.text }]} numberOfLines={1}>
                                            {formatDateDisplay(dateISO) || "Select date"}
                                        </Text>
                                    </View>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
                            </Pressable>

                            {/* Course */}
                            <Pressable
                                onPress={() => setCourseModalOpen(true)}
                                disabled={booting || !roundId}
                                style={({ pressed }) => [
                                    styles.pickerPill,
                                    {
                                        borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
                                        backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.70)",
                                        opacity: booting || !roundId ? 0.55 : pressed ? 0.92 : 1,
                                    },
                                    pressed && !(booting || !roundId) && styles.pressed,
                                ]}
                            >
                                <View style={styles.pickerLeft}>
                                    <MaterialCommunityIcons name="map-marker" size={18} color={theme.muted} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.pickerLabel, { color: theme.muted }]}>Course</Text>
                                        <Text style={[styles.pickerValue, { color: theme.text }]} numberOfLines={1}>
                                            {courseLabel}
                                        </Text>
                                    </View>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
                            </Pressable>

                            {/* Tees */}
                            <Pressable
                                onPress={openTeesModal}
                                disabled={booting || !roundId || !course?.id}
                                style={({ pressed }) => [
                                    styles.pickerPill,
                                    {
                                        borderColor: course?.id
                                            ? "rgba(15,122,74,0.55)"
                                            : isDark
                                                ? "rgba(255,255,255,0.12)"
                                                : "rgba(0,0,0,0.10)",
                                        backgroundColor: course?.id
                                            ? "rgba(15,122,74,0.10)"
                                            : isDark
                                                ? "rgba(0,0,0,0.18)"
                                                : "rgba(255,255,255,0.55)",
                                        opacity: booting || !roundId || !course?.id ? 0.55 : pressed ? 0.92 : 1,
                                    },
                                    pressed && !(booting || !roundId || !course?.id) && styles.pressed,
                                ]}
                            >
                                <View style={styles.pickerLeft}>
                                    <MaterialCommunityIcons name="flag-variant" size={18} color={theme.muted} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.pickerLabel, { color: theme.muted }]}>Tees</Text>
                                        <Text style={[styles.pickerValue, { color: theme.text }]} numberOfLines={1}>
                                            {teeLabel}
                                        </Text>
                                    </View>
                                </View>
                                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
                            </Pressable>
                        </View>

                        {/* Score cube */}
                        <View style={styles.field}>
                            <Text style={[styles.label, { color: theme.muted, textAlign: "center" }]}>Total score</Text>

                            <View style={styles.scoreCubeWrap}>
                                <TextInput
                                    value={scoreText}
                                    onChangeText={setScoreText}
                                    onBlur={() => persistScore(scoreText)}
                                    placeholder="86"
                                    placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
                                    keyboardType="number-pad"
                                    inputAccessoryViewID={Platform.OS === "ios" ? SCORE_ACCESSORY_ID : undefined}
                                    style={[
                                        styles.scoreCube,
                                        {
                                            color: theme.text,
                                            borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
                                            backgroundColor: isDark ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.7)",
                                        },
                                    ]}
                                />
                            </View>

                            <Text style={[styles.hint, { color: theme.muted, textAlign: "center" }]}>Required for Quick Post.</Text>
                        </View>

                        <View style={styles.noteRow}>
                            <MaterialCommunityIcons name="shield-check" size={16} color={theme.muted} />
                            <Text style={[styles.note, { color: theme.muted }]}>
                                Course + tees are pulled from the same trusted sources used elsewhere in the app.
                            </Text>
                        </View>
                    </View>

                    <Pressable
                        onPress={onPrimary}
                        disabled={booting || !roundId}
                        style={({ pressed }) => [
                            styles.cta,
                            {
                                backgroundColor: isDark ? "rgba(255,255,255,0.92)" : "rgba(10,15,26,0.92)",
                                opacity: booting || !roundId ? 0.65 : 1,
                            },
                            pressed && !(booting || !roundId) && styles.pressed,
                        ]}
                    >
                        <View style={styles.ctaRow}>
                            {booting ? (
                                <>
                                    <ActivityIndicator />
                                    <Text style={[styles.ctaText, { color: isDark ? "#0A0F1A" : "#FFFFFF" }]}>Loading…</Text>
                                </>
                            ) : (
                                <>
                                    <MaterialCommunityIcons name="flash" size={18} color={isDark ? "#0A0F1A" : "#FFFFFF"} />
                                    <Text style={[styles.ctaText, { color: isDark ? "#0A0F1A" : "#FFFFFF" }]}>{ctaLabel}</Text>
                                </>
                            )}
                        </View>
                    </Pressable>
                </ScrollView>

                {Platform.OS === "ios" ? (
                    <InputAccessoryView nativeID={SCORE_ACCESSORY_ID}>
                        <View style={styles.accessoryBar}>
                            <View style={{ flex: 1 }} />
                            <Pressable
                                onPress={() => Keyboard.dismiss()}
                                hitSlop={12}
                                style={({ pressed }) => [styles.accessoryBtn, pressed && styles.pressedTiny]}
                            >
                                <Text style={styles.accessoryBtnText}>Done</Text>
                            </Pressable>
                        </View>
                    </InputAccessoryView>
                ) : null}
            </KeyboardAvoidingView>

            {/* DATE PICKER MODAL */}
            <Modal
                visible={datePickerOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setDatePickerOpen(false)}
            >
                <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.bg }]}>
                    <View style={styles.modalHeader}>
                        <Pressable
                            onPress={() => setDatePickerOpen(false)}
                            hitSlop={12}
                            style={({ pressed }) => [styles.modalClose, pressed && styles.pressedTiny]}
                        >
                            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
                        </Pressable>

                        <Text style={[styles.modalTitle, { color: theme.text }]}>Select date</Text>

                        <Pressable
                            onPress={async () => {
                                const iso = dateToISO(tempDate);
                                setDateISO(iso);
                                setDatePickerOpen(false);
                                await persistDate(iso);
                            }}
                            hitSlop={12}
                            style={({ pressed }) => [styles.modalDone, pressed && styles.pressedTiny]}
                        >
                            <Text style={styles.modalDoneText}>Done</Text>
                        </Pressable>
                    </View>

                    <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
                        <View style={styles.dateWheelWrap}>
                            <DateTimePicker
                                value={tempDate}
                                mode="date"
                                display={Platform.OS === "ios" ? "spinner" : "default"}
                                onChange={(e, d) => {
                                    if (d) setTempDate(d);
                                }}
                                themeVariant={isDark ? "dark" : "light"}
                            />
                        </View>
                    </View>
                </SafeAreaView>
            </Modal>

            {/* COURSE MODAL */}
            <Modal
                visible={courseModalOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCourseModalOpen(false)}
            >
                <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.bg }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Select course</Text>
                        <Pressable
                            onPress={() => setCourseModalOpen(false)}
                            hitSlop={12}
                            style={({ pressed }) => [styles.modalClose, pressed && styles.pressedTiny]}
                        >
                            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
                        </Pressable>
                    </View>

                    <View style={styles.modalSearchWrap}>
                        <TextInput
                            value={courseQuery}
                            onChangeText={setCourseQuery}
                            placeholder="Search course…"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"}
                            autoCorrect={false}
                            autoCapitalize="none"
                            clearButtonMode="while-editing"
                            style={[
                                styles.modalSearch,
                                {
                                    color: theme.text,
                                    borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)",
                                    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                                },
                            ]}
                        />
                        <Text style={[styles.modalSub, { color: theme.muted }]}>
                            Type 3+ letters for online matches (GolfCourseAPI). Local results show immediately.
                        </Text>
                    </View>

                    {courseSearching ? (
                        <View style={styles.modalLoading}>
                            <ActivityIndicator />
                            <Text style={[styles.modalLoadingText, { color: theme.muted }]}>Searching…</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={courseResults}
                            keyExtractor={(it, idx) => safeStr(it?.id || it?.name || idx)}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
                            renderItem={({ item }) => {
                                const obj = normalizeCourseResult(item);
                                const active = safeStr(course?.id) === obj.id;

                                const metaRight = obj.source === "api" ? "Online" : "Local";
                                const loc = [obj.city, obj.state, obj.country].filter(Boolean).join(", ");
                                const sub = obj.source === "api" ? (loc || "Tap to select") : "Tap to select";

                                return (
                                    <Pressable
                                        onPress={() => selectCourse(item)}
                                        style={({ pressed }) => [
                                            styles.modalRowOuter,
                                            active && styles.modalRowOuterActive,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <View style={[styles.modalRow, active && styles.modalRowActive]}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <View style={styles.modalRowTop}>
                                                    <Text style={[styles.modalRowTitle, { color: theme.text }]} numberOfLines={1}>
                                                        {obj.name}
                                                    </Text>

                                                    <View
                                                        style={[
                                                            styles.modalPill,
                                                            { borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)" },
                                                        ]}
                                                    >
                                                        <Text style={[styles.modalPillText, { color: theme.muted }]}>{metaRight}</Text>
                                                    </View>
                                                </View>

                                                <Text style={[styles.modalRowSub, { color: theme.muted }]} numberOfLines={1}>
                                                    {sub}
                                                </Text>
                                            </View>

                                            {active ? (
                                                <View style={styles.modalCheck}>
                                                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                                                </View>
                                            ) : (
                                                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.modalEmpty}>
                                    <Text style={[styles.modalEmptyTitle, { color: theme.text }]}>No matches</Text>
                                    <Text style={[styles.modalEmptySub, { color: theme.muted }]}>Try a different spelling.</Text>
                                </View>
                            }
                        />
                    )}
                </SafeAreaView>
            </Modal>

            {/* TEES MODAL */}
            <Modal
                visible={teeModalOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setTeeModalOpen(false)}
            >
                <SafeAreaView style={[styles.modalSafe, { backgroundColor: theme.bg }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Select tees</Text>
                        <Pressable
                            onPress={() => setTeeModalOpen(false)}
                            hitSlop={12}
                            style={({ pressed }) => [styles.modalClose, pressed && styles.pressedTiny]}
                        >
                            <MaterialCommunityIcons name="close" size={22} color={theme.text} />
                        </Pressable>
                    </View>

                    <View style={styles.modalSearchWrap}>
                        <Text style={[styles.modalSub, { color: theme.muted }]} numberOfLines={2}>
                            {course?.name ? `Course: ${course.name}` : "Select a course first."}
                        </Text>
                    </View>

                    {teeLoading ? (
                        <View style={styles.modalLoading}>
                            <ActivityIndicator />
                            <Text style={[styles.modalLoadingText, { color: theme.muted }]}>Loading tees…</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={teeList}
                            keyExtractor={(it, idx) => safeStr(it?.code || it?.name || idx)}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
                            renderItem={({ item }) => {
                                const code = safeStr(item?.code);
                                const name = safeStr(item?.name) || code || "Tee";
                                const active = safeStr(tee?.code) === code;

                                return (
                                    <Pressable
                                        onPress={() => selectTee(item)}
                                        style={({ pressed }) => [
                                            styles.modalRowOuter,
                                            active && styles.modalRowOuterActiveGreen,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <View style={[styles.modalRow, active && styles.modalRowActiveGreen]}>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <View style={styles.modalRowTop}>
                                                    <Text style={[styles.modalRowTitle, { color: theme.text }]} numberOfLines={1}>
                                                        {name}
                                                    </Text>

                                                    <View
                                                        style={[
                                                            styles.modalPill,
                                                            { borderColor: "rgba(15,122,74,0.32)", backgroundColor: "rgba(15,122,74,0.10)" },
                                                        ]}
                                                    >
                                                        <Text style={[styles.modalPillText, { color: theme.muted }]}>{formatYds(item?.yardage)}</Text>
                                                    </View>
                                                </View>

                                                <Text style={[styles.modalRowSub, { color: theme.muted }]} numberOfLines={1}>
                                                    Tap to select
                                                </Text>
                                            </View>

                                            {active ? (
                                                <View style={styles.modalCheck}>
                                                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                                                </View>
                                            ) : (
                                                <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
                                            )}
                                        </View>
                                    </Pressable>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.modalEmpty}>
                                    <Text style={[styles.modalEmptyTitle, { color: theme.text }]}>No tees found</Text>
                                    <Text style={[styles.modalEmptySub, { color: theme.muted }]}>Try selecting a different course.</Text>
                                </View>
                            }
                        />
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },

    content: {
        paddingHorizontal: 16,
        paddingTop: 14,
        gap: 12,
    },

    card: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.24)",
    },

    sectionTitle: {
        fontFamily: "Cinzel",
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: 0.3,
        textAlign: "center",
    },
    sectionSub: {
        marginTop: 6,
        fontSize: 13,
        lineHeight: 18,
        textAlign: "center",
    },

    pickerStack: {
        marginTop: 14,
        gap: 10,
    },
    pickerPill: {
        height: 64,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    pickerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    pickerLabel: {
        fontFamily: "Cinzel",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        opacity: 0.85,
    },
    pickerValue: {
        marginTop: 4,
        fontSize: 14,
        fontWeight: "800",
    },

    field: { marginTop: 14 },
    label: {
        fontFamily: "Cinzel",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        marginBottom: 8,
    },

    hint: {
        marginTop: 8,
        fontSize: 12,
        lineHeight: 16,
        opacity: 0.85,
    },

    scoreCubeWrap: {
        marginTop: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    scoreCube: {
        width: 120,
        height: 120,
        borderRadius: 18,
        borderWidth: 1,
        fontSize: 34,
        fontWeight: "900",
        textAlign: "center",
        paddingHorizontal: 10,
    },

    noteRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 14,
    },
    note: {
        flex: 1,
        fontSize: 12,
        lineHeight: 16,
    },

    cta: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    ctaText: {
        fontFamily: "Cinzel",
        fontSize: 16,
        fontWeight: "700",
        letterSpacing: 0.4,
    },

    pressed: {
        opacity: Platform.OS === "ios" ? 0.88 : 0.9,
        transform: [{ scale: 0.99 }],
    },
    pressedTiny: {
        opacity: Platform.OS === "ios" ? 0.9 : 0.92,
    },

    /* ---------------- modals ---------------- */

    modalSafe: { flex: 1 },
    modalHeader: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    modalTitle: { fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },

    modalClose: {
        width: 38,
        height: 38,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.06)",
    },

    modalDone: {
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.45)",
        backgroundColor: "rgba(242,201,76,0.14)",
        minWidth: 72,
    },
    modalDoneText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 0.2,
    },

    dateWheelWrap: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        paddingVertical: 10,
        overflow: "hidden",
    },

    modalSearchWrap: { paddingHorizontal: 16, paddingTop: 12 },
    modalSearch: {
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 14,
        fontSize: 15,
        fontWeight: "800",
    },
    modalSub: { marginTop: 10, fontSize: 12, fontWeight: "800", opacity: 0.75, lineHeight: 16 },

    modalLoading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    modalLoadingText: { fontSize: 12, fontWeight: "800", opacity: 0.75 },

    modalRowOuter: {
        borderRadius: 22,
        padding: 2,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "transparent",
        marginBottom: 12,
    },
    modalRowOuterActive: {
        borderColor: "rgba(255, 210, 92, 0.75)",
        backgroundColor: "rgba(255, 210, 92, 0.12)",
    },
    modalRowOuterActiveGreen: {
        borderColor: "rgba(15,122,74,0.55)",
        backgroundColor: "rgba(15,122,74,0.10)",
    },
    modalRow: {
        borderRadius: 20,
        padding: 14,
        backgroundColor: "rgba(255,255,255,0.04)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    modalRowActive: { backgroundColor: "rgba(255, 210, 92, 0.10)" },
    modalRowActiveGreen: { backgroundColor: "rgba(15,122,74,0.10)" },

    modalRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    modalRowTitle: { fontSize: 15, fontWeight: "900", flex: 1 },
    modalRowSub: { marginTop: 8, fontSize: 12, fontWeight: "800", opacity: 0.7 },

    modalPill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
    },
    modalPillText: { fontSize: 12, fontWeight: "900", opacity: 0.85 },

    modalCheck: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255, 210, 92, 0.55)",
        backgroundColor: "rgba(255, 210, 92, 0.14)",
    },

    modalEmpty: { padding: 22, alignItems: "center" },
    modalEmptyTitle: { fontSize: 14, fontWeight: "900" },
    modalEmptySub: { marginTop: 8, fontSize: 12, fontWeight: "800", opacity: 0.75, textAlign: "center" },

    accessoryBar: {
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(18,22,30,0.96)",
    },
    accessoryBtn: {
        height: 34,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
    },
    accessoryBtnText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 0.3,
    },
});