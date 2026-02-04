// src/screens/TournamentHoleViewScreen.js
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
    FlatList,
    InteractionManager,
    ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { loadCourseData } from "../storage/courseData";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const INNER2 = "#2A4A76";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
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

/* -------------------------- */
/* side game overlay helpers  */
/* -------------------------- */

function normalizeSideKey(x) {
    return String(x || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function getSideGameMeta(sideGameKeyRaw) {
    const k = normalizeSideKey(sideGameKeyRaw);

    if (k === "long_drive" || k === "longdrive" || k === "ld") {
        return { title: "LONG DRIVE", subtitle: "Let it rip.", icon: "🏌️‍♂️" };
    }

    if (k === "kp" || k === "closest_to_pin" || k === "closest-to-pin") {
        return { title: "KP", subtitle: "Closest to the pin.", icon: "🎯" };
    }

    if (
        k === "second_shot_kp" ||
        k === "secondshotkp" ||
        k === "2nd_shot_kp" ||
        k === "second_shot_closest_to_pin"
    ) {
        return { title: "SECOND SHOT KP", subtitle: "Closest on the second shot.", icon: "🎯" };
    }

    if (k === "putting_contest" || k === "putting" || k === "putt") {
        return { title: "PUTTING CONTEST", subtitle: "We’ll track it later.", icon: "⛳" };
    }

    return { title: "FORMAT HOLE", subtitle: "Special hole", icon: "⭐" };
}

function SideGameOverlayModal({ visible, meta, currentHole, roundNumber, onDismiss }) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
            <View style={styles.sgWrap}>
                <View style={styles.sgBackdrop} />

                <View style={styles.sgCard}>
                    <View style={styles.sgTopRow}>
                        <View style={styles.sgIconPill}>
                            <Text style={styles.sgIcon}>{meta?.icon || "⭐"}</Text>
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.sgKicker}>
                                {Number.isFinite(Number(roundNumber)) ? `ROUND ${Number(roundNumber)}` : "ROUND"}
                                {Number.isFinite(Number(currentHole)) ? `  •  HOLE ${Number(currentHole)}` : ""}
                            </Text>
                            <Text style={styles.sgTitle}>{meta?.title || "FORMAT HOLE"}</Text>
                            {!!meta?.subtitle ? <Text style={styles.sgSub}>{meta.subtitle}</Text> : null}
                        </View>
                    </View>

                    <View style={styles.sgDivider} />

                    <View style={styles.sgBottomRow}>
                        <View style={styles.sgMiniPill}>
                            <Text style={styles.sgMiniText}>FORMAT ACTIVE</Text>
                        </View>

                        <Pressable onPress={onDismiss} style={({ pressed }) => [styles.sgBtn, pressed && styles.pressed]}>
                            <Text style={styles.sgBtnText}>Continue</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

export default function TournamentHoleViewScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);

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

    const players = Array.isArray(params.players) ? params.players : [];

    const holeMeta = useMemo(() => {
        return params.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
    }, [params.holeMeta]);

    // IMPORTANT: Tournament hole state must come from route params (NOT local active round).
    const initialHole = useMemo(() => {
        const raw = Number(params?.holeNumber ?? params?.hole ?? 1);
        if (Number.isFinite(raw) && raw >= 1 && raw <= 18) return raw;
        return 1;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [currentHole, setCurrentHole] = useState(initialHole);

    useEffect(() => {
        const incoming = Number(params?.holeNumber ?? params?.hole);
        if (Number.isFinite(incoming) && incoming >= 1 && incoming <= 18 && incoming !== currentHole) {
            setCurrentHole(incoming);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params?.holeNumber, params?.hole]);

    const par = holeMeta?.[String(currentHole)]?.par ?? 4;

    /* -------------------------- */
    /* side game overlay behavior */
    /* -------------------------- */

    const showFormatSplash = !!params?.showFormatSplash;
    const sideGameKey = params?.sideGameKey ? String(params.sideGameKey) : "";

    const sideMeta = useMemo(() => getSideGameMeta(sideGameKey), [sideGameKey]);

    const [sgVisible, setSgVisible] = useState(false);
    const sgShownKeyRef = useRef(null);

    const sgOnceKey = useMemo(() => {
        const t = String(tournamentId || "t");
        const r = String(roundNumber || "r");
        const h = String(currentHole || "h");
        const s = String(sideGameKey || "none");
        return `${t}__${r}__${h}__${s}`;
    }, [tournamentId, roundNumber, currentHole, sideGameKey]);

    const dismissSideGameOverlay = useCallback(() => {
        setSgVisible(false);

        // prevent looping if the same screen instance refocuses
        try {
            navigation.setParams({ showFormatSplash: false });
        } catch { }
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            if (!showFormatSplash) return undefined;
            if (!sideGameKey) return undefined;

            if (sgShownKeyRef.current === sgOnceKey) return undefined;
            sgShownKeyRef.current = sgOnceKey;

            setSgVisible(true);
            return undefined;
        }, [showFormatSplash, sideGameKey, sgOnceKey])
    );

    /* -------------------------- */
    /* course + gps + yardages    */
    /* -------------------------- */

    const [courseData, setCourseData] = useState(null);
    const [user, setUser] = useState(null);

    useFocusEffect(
        useCallback(() => {
            let cancelled = false;
            let sub = null;

            (async () => {
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
                } catch { }
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

    /* -------------------------- */
    /* yardage book (local for now) */
    /* -------------------------- */

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
        } catch { }
        setSaving(false);
        Keyboard.dismiss();
        setYardageOpen(false);
    }

    /* -------------------------- */
    /* navigation actions         */
    /* -------------------------- */

    function setHoleAndPersist(h) {
        const next = Number(h);
        if (!Number.isFinite(next) || next < 1 || next > 18) return;
        setCurrentHole(next);
        try {
            navigation.setParams({ holeNumber: next, hole: next });
        } catch { }
    }

    function openScorecard() {
        navigation.navigate(ROUTES.SCORECARD, {
            course: courseParam ?? { name: courseName },
            tee: teeParam ?? { name: teeName },
            players,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,

            // tournament context (harmless to pass)
            tournamentId,
            roundNumber,
            holeNumber: currentHole,
        });
    }

    function openGreenView() {
        navigation.navigate(ROUTES.GREEN_VIEW, {
            ...params,
            course: courseParam ?? { name: courseName },
            tee: teeParam ?? { name: teeName },
            players,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,
            courseName,
            teeName,

            tournamentId,
            roundNumber,
            holeNumber: currentHole,
        });
    }

    function openHazards() {
        navigation.navigate(ROUTES.HAZARDS, {
            ...params,
            course: courseParam ?? { name: courseName },
            tee: teeParam ?? { name: teeName },
            players,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,
            courseName,
            teeName,

            tournamentId,
            roundNumber,
            holeNumber: currentHole,
        });
    }

    function openHoleMap(openSetup = false) {
        navigation.navigate(ROUTES.HOLE_MAP, {
            ...params,
            holeIndex: currentHole - 1,
            hole: currentHole,
            holeNumber: currentHole,
            course: courseParam ?? { name: courseName, id: courseId },
            tee: teeParam ?? { name: teeName },
            players,
            holeMeta,
            courseName,
            courseId: courseId ? String(courseId) : null,
            openSetup: !!openSetup,

            tournamentId,
            roundNumber,
            sideGameKey: sideGameKey || null,
        });
    }

    function openTournamentScoreEntry() {
        const TARGET = ROUTES.TOURNAMENT_SCORE_ENTRY || "TournamentScoreEntry";
        navigation.navigate(TARGET, {
            tournamentId,
            roundNumber,
            holeNumber: currentHole,
            holeMeta,
            sideGameKey: sideGameKey || null,

            courseId: courseId ? String(courseId) : null,
            courseName,
            teeName,
            players: players?.length ? players : null,
        });
    }

    /* -------------------------- */
    /* hole pills / centering     */
    /* -------------------------- */

    const headerTitle = useMemo(() => `HOLE ${currentHole} • PAR ${par}`, [currentHole, par]);
    const holesData = useMemo(() => Array.from({ length: 18 }).map((_, i) => i + 1), []);

    const holeListRef = useRef(null);
    const [holeBarWidth, setHoleBarWidth] = useState(0);

    const sidePad = useMemo(() => {
        if (!holeBarWidth) return 0;
        const pad = holeBarWidth / 2 - HOLE_PILL_SIZE / 2;
        return Math.max(0, Math.round(pad));
    }, [holeBarWidth]);

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

    const headerCourseTitle = useMemo(() => shortCourseTitle(courseName), [courseName]);

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={headerTitle}
                subtitle={headerCourseTitle ? headerCourseTitle : ""}
                safeTop={false}
                rightLabel={null}
                onRightPress={null}
            />

            <SideGameOverlayModal
                visible={sgVisible}
                meta={sideMeta}
                currentHole={currentHole}
                roundNumber={roundNumber}
                onDismiss={dismissSideGameOverlay}
            />

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
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
                                    onPress={() => setHoleAndPersist(h)}
                                    style={({ pressed }) => [styles.holePill, active && styles.holePillActive, pressed && styles.pressed]}
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
                    <Pressable onPress={() => setYardageOpen(true)} style={({ pressed }) => [styles.ybCard, pressed && styles.pressed]}>
                        <Text style={styles.ybCenterText}>Yardage Book</Text>
                    </Pressable>
                </View>

                <Pressable onPress={() => openHoleMap(false)} style={({ pressed }) => [styles.mapCard, pressed && styles.pressed]}>
                    {!!sideGameKey ? (
                        <View style={styles.formatBanner}>
                            <Text style={styles.formatBannerText}>FORMAT HOLE: {sideMeta?.title || "FORMAT"}</Text>
                        </View>
                    ) : null}

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
                <Pressable style={styles.greenBtn} onPress={openTournamentScoreEntry}>
                    <Text style={styles.greenText}>Input Scores</Text>
                </Pressable>
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
        overflow: "hidden",
    },
    mapTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },
    mapSub: { color: MUTED, marginTop: 8, fontWeight: "700", fontSize: 14 },

    formatBanner: {
        position: "absolute",
        top: 10,
        left: 10,
        right: 10,
        height: 34,
        borderRadius: 14,
        backgroundColor: "rgba(0,0,0,0.22)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
    },
    formatBannerText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },

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

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    /* -------------------------- */
    /* side game overlay styles   */
    /* -------------------------- */

    sgWrap: { flex: 1, justifyContent: "center", padding: 18 },
    sgBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
    sgCard: {
        borderRadius: 24,
        padding: 14,
        backgroundColor: "rgba(18,22,30,0.96)",
        borderWidth: 2,
        borderColor: "rgba(242,201,76,0.85)",
    },
    sgTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    sgIconPill: {
        width: 48,
        height: 48,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(242,201,76,0.14)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.40)",
    },
    sgIcon: { fontSize: 20 },
    sgKicker: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 11, letterSpacing: 1.1 },
    sgTitle: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 20, letterSpacing: 0.8 },
    sgSub: { marginTop: 6, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 13, lineHeight: 17 },
    sgDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 12, marginBottom: 12 },
    sgBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    sgMiniPill: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },
    sgMiniText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
    sgBtn: {
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: "rgba(242,201,76,0.92)",
        alignItems: "center",
        justifyContent: "center",
    },
    sgBtnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
});
