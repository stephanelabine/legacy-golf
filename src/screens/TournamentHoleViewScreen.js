// src/screens/TournamentHoleViewScreen.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
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
    Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import * as Location from "expo-location";
import { doc, setDoc, updateDoc, serverTimestamp, collection, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { loadCourseData } from "../storage/courseData";
import { db, auth } from "../firebase/firebase";
import { pickTournamentNavParams, assertTournamentNavParams } from "../utils/tournamentNav";

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

function defaultRoundId(tournamentId, roundNumber) {
    const t = String(tournamentId || "").trim();
    const r = Number(roundNumber || 1);
    if (!t) return "";
    return `${t}__r${r}`;
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
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function getPlayerId(p) {
    if (!p) return "";
    const id = p?.id ?? p?._pid ?? p?.playerId ?? p?.uid ?? p?._id;
    return String(id || "");
}

function holeHasAllStrokes(scoresByPid, holeNumber, playersList) {
    const ids = (playersList || []).map(getPlayerId).filter(Boolean);
    if (!ids.length) return false;

    for (const pid of ids) {
        const docData = scoresByPid?.[String(pid)] || {};
        const holes = docData?.holes || {};
        const h = holes?.[String(holeNumber)] || {};
        const strokes = toInt(h?.strokes);
        if (strokes <= 0) return false;
    }
    return true;
}

function getMissingHolesFromScores(scoresByPid, playersList, totalHoles) {
    const ids = (playersList || []).map(getPlayerId).filter(Boolean);
    const missing = [];

    for (let h = 1; h <= Number(totalHoles || 18); h++) {
        let ok = true;
        for (const pid of ids) {
            const docData = scoresByPid?.[String(pid)] || {};
            const holes = docData?.holes || {};
            const hv = holes?.[String(h)] || {};
            const strokes = toInt(hv?.strokes);
            if (strokes <= 0) {
                ok = false;
                break;
            }
        }
        if (!ok) missing.push(h);
    }

    return missing;
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

    if (k === "second_shot_kp" || k === "secondshotkp" || k === "2nd_shot_kp" || k === "second_shot_closest_to_pin") {
        return { title: "SECOND SHOT KP", subtitle: "Closest on the second shot.", icon: "🎯" };
    }

    if (k === "putting_contest" || k === "putting" || k === "putt") {
        return { title: "PUTTING CONTEST", subtitle: "We’ll track it later.", icon: "⛳" };
    }

    return { title: "FORMAT HOLE", subtitle: "Special hole", icon: "⭐" };
}

function pickFormatDocForHole(formatDocs, roundNumber, holeNumber) {
    const rn = `r${String(Number(roundNumber || 1))}`;
    const hn = Number(holeNumber || 0);
    if (!hn || !Array.isArray(formatDocs) || !formatDocs.length) return null;

    // normalizeSideKey can output variants like: longdrive / secondshotkp
    const HOLE_KEYS = new Set([
        "kp",
        "closest_to_pin",
        "closest-to-pin",

        "long_drive",
        "longdrive",
        "ld",

        "second_shot_kp",
        "secondshotkp",
        "2nd_shot_kp",
        "second_shot_closest_to_pin",
    ]);

    for (const f of formatDocs) {
        const rawType = String(f?.key || f?.formatKey || "").trim();
        const rawId = String(f?.id || "").trim();
        const type = normalizeSideKey(rawType || rawId);
        if (!type || !HOLE_KEYS.has(type)) continue;

        const cfg = f?.config && typeof f.config === "object" ? f.config : {};
        const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};
        const arr = Array.isArray(hbr?.[rn]) ? hbr[rn] : [];

        if (arr.map(Number).includes(hn)) return f;
    }

    return null;
}

function SideGameOverlayModal({ visible, meta, currentHole, roundNumber, currentHolderName, onDismiss }) {
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

                            {!!currentHolderName ? (
                                <View style={styles.sgHolderPill}>
                                    <Text style={styles.sgHolderText} numberOfLines={1}>
                                        Current holder: {currentHolderName}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.sgHolderPillIdle}>
                                    <Text style={styles.sgHolderTextIdle}>No current holder yet</Text>
                                </View>
                            )}
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

/* -------------------------- */
/* long drive pin modal       */
/* -------------------------- */

function fmtCoord(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(6);
}

function normPoint(pt) {
    if (!pt) return null;

    const lat =
        pt.lat ??
        pt.latitude ??
        pt?.coords?.latitude ??
        (Array.isArray(pt) ? pt[0] : undefined);

    const lon =
        pt.lon ??
        pt.lng ??
        pt.longitude ??
        pt?.coords?.longitude ??
        (Array.isArray(pt) ? pt[1] : undefined);

    const latN = Number(lat);
    const lonN = Number(lon);

    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return null;
    return { lat: latN, lon: lonN };
}

function deriveCourseFromRound(roundDoc) {
    const d = roundDoc && typeof roundDoc === "object" ? roundDoc : {};

    const courseId =
        d?.courseId ??
        d?.course?.id ??
        d?.course?.courseId ??
        d?.courseRefId ??
        null;

    const courseName =
        d?.courseName ??
        d?.course?.name ??
        d?.course?.courseName ??
        d?.courseTitle ??
        null;

    const teeName =
        d?.teeName ??
        d?.teesName ??
        d?.tee?.name ??
        d?.tees?.name ??
        null;

    return {
        courseId: courseId != null ? String(courseId) : null,
        courseName: courseName != null ? String(courseName) : null,
        teeName: teeName != null ? String(teeName) : null,
    };
}

export default function TournamentHoleViewScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);
    const totalHoles = Number(params?.totalHoles || 18);

    const [roundDoc, setRoundDoc] = useState(null);
    const [scoresByPid, setScoresByPid] = useState({});
    const [formatDocs, setFormatDocs] = useState([]);

    /* -------------------------- */
    /* round doc snapshot         */
    /* -------------------------- */

    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            const ref = doc(db, "tournaments", String(tournamentId), "rounds", `r${String(roundNumber)}`);
            const unsub = onSnapshot(
                ref,
                (snap) => setRoundDoc(snap?.exists?.() ? (snap.data() || null) : null),
                () => setRoundDoc(null)
            );

            return () => unsub();
        }, [tournamentId, roundNumber])
    );

    const derived = useMemo(() => deriveCourseFromRound(roundDoc), [roundDoc]);

    /* -------------------------- */
    /* formats snapshot           */
    /* -------------------------- */

    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            const ref = collection(db, "tournaments", String(tournamentId), "formats");
            const unsub = onSnapshot(
                ref,
                (snap) => {
                    const next = [];
                    snap.forEach((d) => {
                        const data = d.data() || {};
                        next.push({ id: d.id, ...data });
                    });
                    setFormatDocs(next);
                },
                () => { }
            );

            return () => unsub();
        }, [tournamentId])
    );

    const roundId = useMemo(() => {
        const p = String(params?.roundId || "").trim();
        if (p) return p;
        return defaultRoundId(tournamentId, roundNumber);
    }, [params?.roundId, tournamentId, roundNumber]);

    const assertedRef = useRef(false);
    useEffect(() => {
        if (!__DEV__) return;
        if (assertedRef.current) return;
        assertedRef.current = true;

        try {
            assertTournamentNavParams({ ...params, roundId }, "TournamentHoleViewScreen");
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roundId]);

    const courseParam = params.course;
    const teeParam = params.tee;

    const courseIdRaw =
        params.courseId ??
        courseParam?.id ??
        courseParam?.courseId ??
        (typeof courseParam === "string" ? courseParam : null);

    const courseNameRaw =
        params.courseName ??
        courseParam?.name ??
        courseParam?.courseName ??
        (typeof courseParam === "string" ? courseParam : null);

    const teeNameRaw = teeParam?.name ?? (typeof teeParam === "string" ? teeParam : null);

    const courseId = courseIdRaw != null ? String(courseIdRaw) : null;
    const courseName = courseNameRaw != null ? String(courseNameRaw) : null;
    const teeName = teeNameRaw != null ? String(teeNameRaw) : null;

    const effectiveCourseId = courseId || derived?.courseId || null;
    const effectiveCourseName = courseName || derived?.courseName || "Course";
    const effectiveTeeName = teeName || derived?.teeName || "Tees";

    useEffect(() => {
        try {
            const patch = {};
            if (!params?.courseId && effectiveCourseId) patch.courseId = String(effectiveCourseId);
            if ((!params?.courseName || params?.courseName === "Course") && effectiveCourseName) patch.courseName = String(effectiveCourseName);
            if (!params?.teeName && effectiveTeeName) patch.teeName = String(effectiveTeeName);
            if (Object.keys(patch).length) navigation.setParams(patch);
        } catch { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveCourseId, effectiveCourseName, effectiveTeeName]);

    const playersParam = Array.isArray(params?.players) ? params.players : [];

    const playersFromScores = useMemo(() => {
        const ids = Object.keys(scoresByPid || {});
        return ids.map((pid) => {
            const d = scoresByPid?.[pid] || {};
            return {
                id: String(pid),
                name: String(d?.playerName || d?.name || pid),
            };
        });
    }, [scoresByPid]);

    const players = useMemo(() => {
        if ((playersParam || []).length) return playersParam;
        return playersFromScores;
    }, [playersParam, playersFromScores]);

    const effectivePlayers = useMemo(() => {
        const base = players && players.length ? players : playersFromScores;

        const gp = Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds.map(String) : null;

        if (gp && gp.length) {
            const filtered = base.filter((p) => gp.includes(String(getPlayerId(p))));
            if (filtered.length) return filtered;
            return base;
        }

        return base;
    }, [players, playersFromScores, params?.groupPlayerIds]);

    const holeMeta = useMemo(() => {
        return params.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
    }, [params.holeMeta]);

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
    /* scores snapshot            */
    /* -------------------------- */

    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            const scoresRef = collection(
                db,
                "tournaments",
                String(tournamentId),
                "rounds",
                `r${String(roundNumber)}`,
                "scores"
            );

            const unsub = onSnapshot(
                scoresRef,
                (snap) => {
                    const next = {};
                    snap.forEach((d) => {
                        next[String(d.id)] = d.data() || {};
                    });
                    setScoresByPid(next);
                },
                () => { }
            );

            return () => unsub();
        }, [tournamentId, roundNumber])
    );

    const showFinish = useMemo(() => {
        if (Number(currentHole) !== Number(totalHoles || 18)) return false;
        return holeHasAllStrokes(scoresByPid, Number(totalHoles || 18), effectivePlayers);
    }, [currentHole, totalHoles, scoresByPid, effectivePlayers]);

    /* -------------------------- */
    /* side game overlay behavior */
    /* -------------------------- */

    const rnKey = useMemo(() => `r${String(Number(roundNumber || 1))}`, [roundNumber]);

    const activeFormatDoc = useMemo(() => {
        return pickFormatDocForHole(formatDocs, roundNumber, currentHole);
    }, [formatDocs, roundNumber, currentHole]);

    const computedSideGameKey = useMemo(() => {
        return normalizeSideKey(activeFormatDoc?.key || activeFormatDoc?.id || "");
    }, [activeFormatDoc]);

    const sideMeta = useMemo(() => getSideGameMeta(computedSideGameKey), [computedSideGameKey]);

    const [holeClaimDoc, setHoleClaimDoc] = useState(null);

    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            if (!computedSideGameKey) {
                setHoleClaimDoc(null);
                return undefined;
            }

            const formatId = String(activeFormatDoc?.id || activeFormatDoc?.key || computedSideGameKey || "").trim();

            if (!formatId) {
                setHoleClaimDoc(null);
                return undefined;
            }

            const claimId = `${formatId}_h${String(currentHole)}`;
            const ref = doc(
                db,
                "tournaments",
                String(tournamentId),
                "rounds",
                `r${String(roundNumber)}`,
                "formatClaims",
                claimId
            );


            const unsub = onSnapshot(
                ref,
                (snap) => {
                    setHoleClaimDoc(snap?.exists?.() ? (snap.data() || null) : null);
                },
                () => setHoleClaimDoc(null)
            );

            return () => unsub();
        }, [tournamentId, activeFormatDoc, computedSideGameKey, currentHole, roundNumber])
    );

    const currentHolderName = useMemo(() => {
        const s = String(holeClaimDoc?.status || "").toLowerCase();
        if (s === "cleared") return "";

        const nm =
            holeClaimDoc?.claimedByPlayerName ||
            holeClaimDoc?.playerName ||
            holeClaimDoc?.name ||
            holeClaimDoc?.holderName ||
            "";

        return nm ? String(nm) : "";
    }, [holeClaimDoc]);


    const [sgVisible, setSgVisible] = useState(false);

    const dismissSideGameOverlay = useCallback(() => {
        setSgVisible(false);
    }, []);

    useEffect(() => {
        if (!computedSideGameKey) {
            setSgVisible(false);
            return;
        }
        setSgVisible(true);
    }, [computedSideGameKey, currentHole]);

    /* -------------------------- */
    /* claim format winner        */
    /* -------------------------- */

    const meUid = String(auth?.currentUser?.uid || "");

    const [claimOpen, setClaimOpen] = useState(false);
    const [claimBusy, setClaimBusy] = useState(false);

    const claimTitle = useMemo(() => {
        const t = sideMeta?.title || "FORMAT";
        return `${t} • HOLE ${currentHole}`;
    }, [sideMeta, currentHole]);

    const claimPillText = useMemo(() => {
        const k = normalizeSideKey(computedSideGameKey);
        if (k === "long_drive" || k === "longdrive" || k === "ld") return "Claim 🏌️‍♂️";
        if (k === "kp" || k === "closest_to_pin" || k === "closest-to-pin") return "Claim 🎯";
        if (k === "second_shot_kp" || k === "secondshotkp" || k === "2nd_shot_kp" || k === "second_shot_closest_to_pin") return "Claim 🎯";
        return "Claim ⭐";
    }, [computedSideGameKey]);

    const openClaim = useCallback(() => {
        if (!computedSideGameKey) return;
        setClaimOpen(true);
    }, [computedSideGameKey]);

    const closeClaim = useCallback(() => {
        setClaimOpen(false);
        setClaimBusy(false);
    }, []);

    const setPendingClaim = useCallback(
        async (player) => {
            if (!tournamentId) return;
            if (!computedSideGameKey) return;
            if (!activeFormatDoc) {
                Alert.alert("Format missing", "Could not find this format doc in Firestore.");
                return;
            }

            const pid = String(getPlayerId(player));
            const pname = String(player?.name || "Player");

            if (!pid) {
                Alert.alert("Missing player", "Player id not found.");
                return;
            }

            setClaimBusy(true);
            try {
                const formatId = String(activeFormatDoc?.id || activeFormatDoc?.key || computedSideGameKey || "").trim();
                const roundKey = `r${String(roundNumber)}`;
                const claimDocId = `${formatId}_h${String(currentHole)}`;

                const claimRef = doc(
                    db,
                    "tournaments",
                    String(tournamentId),
                    "rounds",
                    String(roundKey),
                    "formatClaims",
                    String(claimDocId)
                );

                const payload = {
                    tournamentId: String(tournamentId),
                    roundKey: String(roundKey),
                    roundNumber: Number(roundNumber),
                    holeNumber: Number(currentHole),

                    formatId: String(formatId),
                    formatKey: String(formatId),

                    claimedByPlayerId: String(pid),
                    claimedByPlayerName: String(pname),

                    claimedByUid: meUid || null,
                    status: "pending",
                    updatedAt: serverTimestamp(),
                    claimedAt: serverTimestamp(),
                };

                await setDoc(claimRef, payload, { merge: true });

                closeClaim();
                Alert.alert("Saved", `${pname} claimed ${sideMeta?.title || "format"} (pending confirmation).`);
            } catch {
                Alert.alert("Save failed", "Could not save the claim. Please try again.");
            } finally {
                setClaimBusy(false);
            }
        },
        [tournamentId, computedSideGameKey, activeFormatDoc, roundNumber, currentHole, meUid, sideMeta, closeClaim]
    );

    const clearClaim = useCallback(async () => {
        if (!tournamentId) return;
        if (!computedSideGameKey) return;
        if (!activeFormatDoc) return;

        setClaimBusy(true);
        try {
            const formatId = String(activeFormatDoc?.id || activeFormatDoc?.key || computedSideGameKey || "").trim();
            const roundKey = `r${String(roundNumber)}`;
            const claimDocId = `${formatId}_h${String(currentHole)}`;

            const claimRef = doc(
                db,
                "tournaments",
                String(tournamentId),
                "rounds",
                String(roundKey),
                "formatClaims",
                String(claimDocId)
            );

            await setDoc(
                claimRef,
                {
                    tournamentId: String(tournamentId),
                    roundKey: String(roundKey),
                    roundNumber: Number(roundNumber),
                    holeNumber: Number(currentHole),

                    formatId: String(formatId),
                    formatKey: String(formatId),

                    status: "cleared",
                    claimedByPlayerId: null,
                    claimedByPlayerName: null,
                    claimedByUid: null,

                    clearedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            closeClaim();
            Alert.alert("Cleared", "Claim cleared for this hole.");
        } catch {
            Alert.alert("Clear failed", "Could not clear the claim. Please try again.");
        } finally {
            setClaimBusy(false);
        }
    }, [tournamentId, computedSideGameKey, activeFormatDoc, roundNumber, currentHole, closeClaim]);


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
                    if (effectiveCourseId) {
                        const saved = await loadCourseData(String(effectiveCourseId));
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
        }, [effectiveCourseId])
    );

    const savedGpsHole = useMemo(() => {
        const gps = courseData?.gps;
        const hole = gps?.holes?.[String(currentHole)] || null;
        return hole;
    }, [courseData, currentHole]);

    const green = savedGpsHole?.green || null;

    const gFront = normPoint(green?.front);
    const gMiddle = normPoint(green?.middle);
    const gBack = normPoint(green?.back);

    const hasGreenPoints = !!(gFront || gMiddle || gBack);

    const userPt = useMemo(() => normPoint(user), [user]);
    const gpsLive = !!userPt;

    const yardages = useMemo(() => {
        if (!userPt) return { front: "—", middle: "—", back: "—" };

        const out = { front: "—", middle: "—", back: "—" };
        if (gFront) out.front = yds(haversineMeters(userPt, gFront));
        if (gMiddle) out.middle = yds(haversineMeters(userPt, gMiddle));
        if (gBack) out.back = yds(haversineMeters(userPt, gBack));
        return out;
    }, [userPt, gFront, gMiddle, gBack]);

    /* -------------------------- */
    /* yardage book               */
    /* -------------------------- */

    const [yardageOpen, setYardageOpen] = useState(false);
    const [yardageText, setYardageText] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let live = true;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(notesKey(effectiveCourseName));
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
    }, [effectiveCourseName, currentHole]);

    async function saveYardageNoteAndClose() {
        setSaving(true);
        try {
            const key = notesKey(effectiveCourseName);
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
    /* long drive pin flow        */
    /* -------------------------- */

    const isLongDrive = useMemo(() => {
        const k = normalizeSideKey(computedSideGameKey);
        return k === "long_drive" || k === "longdrive" || k === "ld";
    }, [computedSideGameKey]);

    const [pinOpen, setPinOpen] = useState(false);
    const [pinStep, setPinStep] = useState("SET"); // SET | CONFIRM
    const [pinCoord, setPinCoord] = useState(null);
    const [pinBusy, setPinBusy] = useState(false);

    const openPin = useCallback(() => {
        setPinCoord(null);
        setPinStep("SET");
        setPinOpen(true);
    }, []);

    const closePin = useCallback(() => {
        setPinOpen(false);
        setPinBusy(false);
        setPinCoord(null);
        setPinStep("SET");
    }, []);

    const useMyLocation = useCallback(() => {
        if (!user || !Number.isFinite(user.lat) || !Number.isFinite(user.lon)) {
            Alert.alert("GPS not ready", "We need your GPS location to drop the pin. Give it a second and try again.");
            return;
        }
        setPinCoord({ lat: user.lat, lon: user.lon });
    }, [user]);

    const savePin = useCallback(async () => {
        if (!tournamentId) return;
        if (!meUid) {
            Alert.alert("Missing player", "You must be signed in to pin a drive.");
            return;
        }
        if (!pinCoord || !Number.isFinite(pinCoord.lat) || !Number.isFinite(pinCoord.lon)) {
            Alert.alert("No pin set", "Tap “Use my current location” first.");
            return;
        }

        setPinBusy(true);
        try {
            const ref = doc(
                db,
                "tournaments",
                String(tournamentId),
                "rounds",
                `r${String(roundNumber)}`,
                "sideGames",
                "long_drive_pins",
                "pins",
                String(meUid)
            );

            const payload = {
                tournamentId: String(tournamentId),
                roundNumber: Number(roundNumber),
                playerId: String(meUid),
                updatedAt: serverTimestamp(),
                pins: {
                    [String(currentHole)]: {
                        holeNumber: Number(currentHole),
                        lat: Number(pinCoord.lat),
                        lon: Number(pinCoord.lon),
                        savedAt: serverTimestamp(),
                        confirmed: false,
                        confirmedAt: null,
                        confirmedByUid: null,
                    },
                },
            };

            await setDoc(ref, payload, { merge: true });
            setPinStep("CONFIRM");
        } catch {
            Alert.alert("Save failed", "Could not save the pin. Please try again.");
        } finally {
            setPinBusy(false);
        }
    }, [tournamentId, roundNumber, currentHole, meUid, pinCoord]);

    const confirmPin = useCallback(async () => {
        if (!tournamentId) return;
        if (!meUid) return;

        setPinBusy(true);
        try {
            const ref = doc(
                db,
                "tournaments",
                String(tournamentId),
                "rounds",
                `r${String(roundNumber)}`,
                "sideGames",
                "long_drive_pins",
                "pins",
                String(meUid)
            );

            const payload = {
                updatedAt: serverTimestamp(),
                pins: {
                    [String(currentHole)]: {
                        confirmed: true,
                        confirmedAt: serverTimestamp(),
                        confirmedByUid: String(meUid),
                    },
                },
            };

            await setDoc(ref, payload, { merge: true });
            closePin();
            Alert.alert("Saved", "Drive pin saved and confirmed.");
        } catch {
            Alert.alert("Confirm failed", "Could not confirm the pin. Please try again.");
        } finally {
            setPinBusy(false);
        }
    }, [tournamentId, roundNumber, currentHole, meUid, closePin]);

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
            ...pickTournamentNavParams(params),
            tournamentId,
            roundNumber,
            roundId,
            holeNumber: currentHole,

            course: courseParam ?? { name: effectiveCourseName, id: effectiveCourseId },
            tee: teeParam ?? { name: effectiveTeeName },
            players: effectivePlayers,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,
            courseName: effectiveCourseName,
            courseId: effectiveCourseId,
            teeName: effectiveTeeName,
        });
    }

    function openGreenView() {
        navigation.navigate(ROUTES.TOURNAMENT_GREEN_VIEW, {
            ...params,
            ...pickTournamentNavParams(params),
            tournamentId,
            roundNumber,
            roundId,
            holeNumber: currentHole,

            course: courseParam ?? { name: effectiveCourseName, id: effectiveCourseId },
            tee: teeParam ?? { name: effectiveTeeName },
            players: effectivePlayers,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,
            courseName: effectiveCourseName,
            courseId: effectiveCourseId,
            teeName: effectiveTeeName,
        });
    }

    function openHazards() {
        navigation.navigate(ROUTES.HAZARDS, {
            ...params,
            ...pickTournamentNavParams(params),
            tournamentId,
            roundNumber,
            roundId,
            holeNumber: currentHole,

            course: courseParam ?? { name: effectiveCourseName, id: effectiveCourseId },
            tee: teeParam ?? { name: effectiveTeeName },
            players: effectivePlayers,
            holeMeta,
            hole: currentHole,
            holeIndex: currentHole - 1,
            courseName: effectiveCourseName,
            courseId: effectiveCourseId,
            teeName: effectiveTeeName,
        });
    }

    function openHoleMap(openSetup = false) {
        navigation.navigate(ROUTES.HOLE_MAP, {
            ...params,
            ...pickTournamentNavParams(params),
            tournamentId,
            roundNumber,
            roundId,
            holeNumber: currentHole,

            holeIndex: currentHole - 1,
            hole: currentHole,
            course: courseParam ?? { name: effectiveCourseName, id: effectiveCourseId },
            tee: teeParam ?? { name: effectiveTeeName },
            players: effectivePlayers,
            holeMeta,
            courseName: effectiveCourseName,
            courseId: effectiveCourseId ? String(effectiveCourseId) : null,
            openSetup: !!openSetup,

            sideGameKey: computedSideGameKey || null,
        });
    }

    function openTournamentScoreEntry(extra = {}) {
        const TARGET = ROUTES.TOURNAMENT_SCORE_ENTRY || "TournamentScoreEntry";
        navigation.navigate(TARGET, {
            ...pickTournamentNavParams(params),
            tournamentId,
            roundNumber,
            roundId,
            holeNumber: currentHole,
            hole: currentHole,
            totalHoles,
            holeMeta,
            sideGameKey: computedSideGameKey || null,

            courseId: effectiveCourseId ? String(effectiveCourseId) : null,
            courseName: effectiveCourseName,
            teeName: effectiveTeeName,

            players: effectivePlayers,
            groupPlayerIds: Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds : null,

            ...extra,
        });
    }

    async function onPressFinishRound() {
        try {
            const missing = getMissingHolesFromScores(scoresByPid, effectivePlayers, totalHoles);

            if (missing.length) {
                const list = missing.join(", ");
                Alert.alert("Missing scores", `Some holes are missing strokes.\n\nMissing holes: ${list}`, [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Fix now",
                        onPress: () => {
                            const first = missing[0];
                            openTournamentScoreEntry({
                                holeNumber: first,
                                hole: first,
                                fixMissing: true,
                                missingHoles: missing,
                                missingIndex: 0,
                                finishReturnHole: Number(totalHoles || 18),
                            });
                        },
                    },
                ]);
                return;
            }

            const TOURNAMENT_RESULTS = ROUTES.TOURNAMENT_FINAL_RESULTS || "TournamentFinalResults";


            navigation.dispatch(
                CommonActions.navigate({
                    name: TOURNAMENT_RESULTS,
                    params: {
                        ...pickTournamentNavParams(params),
                        tournamentId,
                        roundNumber,
                        roundId,
                        totalHoles,
                        showFormatsTab: Array.isArray(formatDocs) && formatDocs.length > 0,
                        formats: Array.isArray(formatDocs) ? formatDocs : [],
                        teamVsTeamActive: false,

                        tournamentName: params?.tournamentName ?? params?.name ?? "",
                        courseName: effectiveCourseName,
                        teesName: effectiveTeeName,

                        course: courseParam ?? { name: effectiveCourseName, id: effectiveCourseId },
                        tee: teeParam ?? { name: effectiveTeeName },

                        players: effectivePlayers,
                        holeMeta,
                    },
                    merge: true,
                })
            );
        } catch {
            Alert.alert("Finish failed", "Could not finish the round. Please try again.");
        }
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

    const headerCourseTitle = useMemo(() => shortCourseTitle(effectiveCourseName), [effectiveCourseName]);

    return (
        <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
            <ScreenHeader
                navigation={navigation}
                title={headerTitle}
                titleAutoShrink
                titleNumberOfLines={2}
                subtitle={headerCourseTitle ? headerCourseTitle : ""}
                safeTop={false}
                rightLabel="Exit"
                onRightPress={() => {
                    Alert.alert(
                        "Exit round?",
                        "Your progress is saved. Return to Home?",
                        [
                            { text: "Cancel", style: "cancel" },
                            { text: "Exit", style: "destructive", onPress: () => navigation.navigate(ROUTES.HOME) },
                        ]
                    );
                }}
            />

            <SideGameOverlayModal
                visible={sgVisible}
                meta={sideMeta}
                currentHole={currentHole}
                roundNumber={roundNumber}
                currentHolderName={currentHolderName}
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
                    <Pressable onPress={() => setYardageOpen(true)} style={({ pressed }) => [styles.ybCard, pressed && styles.pressed]}>
                        <Text style={styles.ybCenterText}>Yardage Book</Text>
                    </Pressable>
                </View>

                <Pressable onPress={() => openHoleMap(false)} style={({ pressed }) => [styles.mapCard, pressed && styles.pressed]}>
                    {!!computedSideGameKey ? (
                        <View style={styles.formatBanner}>
                            <Text style={styles.formatBannerText} numberOfLines={1}>
                                FORMAT HOLE: {sideMeta?.title || "FORMAT"}
                                {!!currentHolderName ? `  •  HOLDER: ${currentHolderName}` : ""}
                            </Text>
                        </View>
                    ) : null}

                    <Text style={styles.mapTitle}>Hole View</Text>
                    <Text style={styles.mapSub}>Tap to open full-screen GPS</Text>

                    {isLongDrive ? (
                        <View style={styles.pinWrap}>
                            <Pressable onPress={openPin} style={({ pressed }) => [styles.pinBtn, pressed && styles.pressed]}>
                                <Text style={styles.pinBtnText}>Pin your drive</Text>
                            </Pressable>
                            <Text style={styles.pinSub}>Use your GPS location and save + confirm.</Text>
                        </View>
                    ) : null}
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
                    <>
                        <View style={{ height: 92 }} />
                        <View style={styles.hintCard}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.hintTitle}>No green points yet</Text>
                                <Text style={styles.hintSub}>Set front / mid / back once, and yardages will be perfect every round.</Text>
                            </View>

                            <Pressable
                                onPress={() => openHoleMap(true)}
                                disabled={!effectiveCourseId}
                                style={({ pressed }) => [
                                    styles.hintBtn,
                                    pressed && styles.pressed,
                                    !effectiveCourseId && { opacity: 0.45 },
                                ]}
                            >
                                <Text style={styles.hintBtnT}>Set points</Text>
                                <Text style={styles.hintBtnS}>→</Text>
                            </Pressable>
                        </View>
                    </>
                ) : null}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <View style={styles.footerRow}>
                    {showFinish ? (
                        <>
                            <Pressable style={styles.greenBtn} onPress={openTournamentScoreEntry}>
                                <Text style={styles.greenText}>Input Scores</Text>
                            </Pressable>

                            <Pressable style={[styles.greenBtn, { backgroundColor: YELLOW }]} onPress={onPressFinishRound}>
                                <Text style={[styles.greenText, { color: "#1A1A1A" }]}>Finish Round</Text>
                            </Pressable>
                        </>
                    ) : (
                        <Pressable style={styles.greenBtn} onPress={openTournamentScoreEntry}>
                            <Text style={styles.greenText}>Input Scores</Text>
                        </Pressable>
                    )}

                    {null}
                </View>
            </View>

            {null}

            {/* Pin modal */}
            <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={closePin}>
                <View style={styles.pinModalWrap}>
                    <Pressable style={styles.pinModalBg} onPress={closePin}>
                        <View />
                    </Pressable>

                    <View style={styles.pinModalCard}>
                        <View style={styles.pinModalTop}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.pinModalTitle}>LONG DRIVE • HOLE {currentHole}</Text>
                                <Text style={styles.pinModalSub}>
                                    {pinStep === "CONFIRM" ? "Confirm the saved pin." : "Drop a pin at your current GPS location."}
                                </Text>
                            </View>

                            <Pressable onPress={closePin} style={({ pressed }) => [styles.pinX, pressed && styles.pressed]}>
                                <Text style={styles.pinXText}>✕</Text>
                            </Pressable>
                        </View>

                        {pinStep === "SET" ? (
                            <>
                                <View style={styles.pinMiniRow}>
                                    <View style={styles.pinMiniPill}>
                                        <Text style={styles.pinMiniText}>{gpsLive ? "GPS READY" : "GPS WAITING"}</Text>
                                    </View>

                                    <Pressable onPress={useMyLocation} style={({ pressed }) => [styles.pinUseBtn, pressed && styles.pressed]}>
                                        <Text style={styles.pinUseBtnText}>Use my current location</Text>
                                    </Pressable>
                                </View>

                                <View style={styles.pinCoords}>
                                    <Text style={styles.pinCoordsLabel}>Pin location</Text>
                                    <Text style={styles.pinCoordsVal}>
                                        {pinCoord ? `${fmtCoord(pinCoord.lat)}, ${fmtCoord(pinCoord.lon)}` : "Not set"}
                                    </Text>
                                </View>

                                <Pressable
                                    onPress={savePin}
                                    disabled={pinBusy}
                                    style={({ pressed }) => [styles.pinSaveBtn, pressed && styles.pressed, pinBusy && { opacity: 0.7 }]}
                                >
                                    <Text style={styles.pinSaveBtnText}>{pinBusy ? "Saving…" : "Save pin"}</Text>
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <View style={styles.pinConfirmCard}>
                                    <Text style={styles.pinConfirmTitle}>Confirmation</Text>
                                    <Text style={styles.pinConfirmSub}>
                                        Hand the phone to another player to confirm, or confirm now if you’re the scorekeeper.
                                    </Text>
                                </View>

                                <Pressable
                                    onPress={confirmPin}
                                    disabled={pinBusy}
                                    style={({ pressed }) => [styles.pinConfirmBtn, pressed && styles.pressed, pinBusy && { opacity: 0.7 }]}
                                >
                                    <Text style={styles.pinConfirmBtnText}>{pinBusy ? "Confirming…" : "Confirm pin"}</Text>
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

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
                                    {effectiveCourseName} • Hole {currentHole}
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
    modeBtn: { flex: 1, height: 44, borderRadius: 18, backgroundColor: INNER2, alignItems: "center", justifyContent: "center" },
    modeBtnPrimary: { backgroundColor: "rgba(46,125,255,0.22)", borderWidth: 1, borderColor: "rgba(46,125,255,0.35)" },
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
        height: 232,
        borderRadius: 22,
        backgroundColor: CARD,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 2,
        borderColor: "rgba(242,201,76,0.55)",
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

    pinWrap: { marginTop: 14, alignItems: "center" },
    pinBtn: {
        height: 40,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: "rgba(242,201,76,0.92)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.85)",
        alignItems: "center",
        justifyContent: "center",
    },
    pinBtnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
    pinSub: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },

    yardageRow: { flexDirection: "row", gap: 12, marginHorizontal: 16, marginTop: 10 },
    yardCard: {
        flex: 1,
        backgroundColor: CARD,
        borderRadius: 20,
        alignItems: "center",
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.35)",
    },
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
    footerRow: { flexDirection: "row", gap: 10, alignItems: "center" },

    greenBtn: { flex: 1, height: 56, borderRadius: 999, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
    greenText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },

    modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
    modalWrap: { flex: 1, justifyContent: "center", padding: 18 },
    modalCard: { borderRadius: 22, padding: 14, backgroundColor: "rgba(18,22,30,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
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

    modalDone: { marginTop: 12, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
    modalDoneText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 16 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    sgWrap: { flex: 1, justifyContent: "center", padding: 18 },
    sgBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
    sgCard: { borderRadius: 24, padding: 14, backgroundColor: "rgba(18,22,30,0.96)", borderWidth: 2, borderColor: "rgba(242,201,76,0.85)" },
    sgTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    sgIconPill: { width: 48, height: 48, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242,201,76,0.14)", borderWidth: 1, borderColor: "rgba(242,201,76,0.40)" },
    sgIcon: { fontSize: 20 },
    sgKicker: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 11, letterSpacing: 1.1 },
    sgTitle: { marginTop: 4, color: WHITE, fontWeight: "900", fontSize: 20, letterSpacing: 0.8 },
    sgSub: { marginTop: 6, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 13, lineHeight: 17 },

    sgHolderPill: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(46,204,113,0.14)",
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.28)",
    },
    sgHolderText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    sgHolderPillIdle: {
        marginTop: 10,
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },
    sgHolderTextIdle: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    sgDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.12)", marginTop: 12, marginBottom: 12 },
    sgBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    sgMiniPill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
    sgMiniText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
    sgBtn: { height: 44, paddingHorizontal: 14, borderRadius: 16, backgroundColor: "rgba(242,201,76,0.92)", alignItems: "center", justifyContent: "center" },
    sgBtnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },

    pinModalWrap: { flex: 1, justifyContent: "center", padding: 18 },
    pinModalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.62)" },
    pinModalCard: { borderRadius: 24, padding: 14, backgroundColor: "rgba(18,22,30,0.96)", borderWidth: 2, borderColor: "rgba(242,201,76,0.85)" },
    pinModalTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    pinModalTitle: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.7 },
    pinModalSub: { marginTop: 6, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 12, lineHeight: 16 },
    pinX: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
    pinXText: { color: WHITE, fontWeight: "900", fontSize: 14 },

    pinMiniRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    pinMiniPill: { paddingHorizontal: 10, height: 34, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
    pinMiniText: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 11, letterSpacing: 0.8 },
    pinUseBtn: { height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(46,204,113,0.14)", borderWidth: 1, borderColor: "rgba(46,204,113,0.28)", alignItems: "center", justifyContent: "center" },
    pinUseBtnText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    pinCoords: { marginTop: 12, borderRadius: 18, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
    pinCoordsLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },
    pinCoordsVal: { marginTop: 8, color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },

    pinSaveBtn: { marginTop: 12, height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242,201,76,0.92)" },
    pinSaveBtnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 15 },

    pinConfirmCard: { borderRadius: 18, padding: 12, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
    pinConfirmTitle: { color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
    pinConfirmSub: { marginTop: 8, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

    pinConfirmBtn: { marginTop: 12, height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: GREEN },
    pinConfirmBtnText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 15 },
});
