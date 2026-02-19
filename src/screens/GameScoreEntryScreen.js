// src/screens/GameScoreEntryScreen.js
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    Pressable,
    FlatList,
    Alert,
    Keyboard,
    Modal,
    ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions, StackActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { loadActiveRound, saveActiveRound } from "../storage/roundState";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const YELLOW = "#F2C94C";
const BLUE = theme?.colors?.primary || "#2E7DFF";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4];

function buildDefaultHoleMeta() {
    const meta = {};
    for (let i = 1; i <= 18; i++) meta[String(i)] = { par: DEFAULT_PARS[i - 1] };
    return meta;
}

function toInt(v) {
    const raw = String(v ?? "");
    if (!raw.length) return 0;
    const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function safePlayerId(p, fallback) {
    return String(p?.id ?? p?.uid ?? p?.playerId ?? fallback ?? "");
}

function safePlayerName(p, idx) {
    return String(p?.name || p?.displayName || p?.fullName || `Player ${idx + 1}`);
}

function uniqIds(list) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((x) => {
        const s = String(x || "").trim();
        if (!s) return;
        if (seen.has(s)) return;
        seen.add(s);
        out.push(s);
    });
    return out;
}

function defaultTrackStatsForPlayer(p) {
    // Regular games: default Stats OFF for all players.
    // Strokes + Putts are always tracked regardless.
    return false;
}

function Seg3({ value, onChange }) {
    const opts = [
        { k: "yes", t: "Yes" },
        { k: "no", t: "No" },
        { k: "na", t: "N/A" },
    ];

    return (
        <View style={styles.segWrap}>
            {opts.map((o) => {
                const active = value === o.k;
                return (
                    <Pressable
                        key={o.k}
                        onPress={() => onChange(o.k)}
                        style={({ pressed }) => [
                            styles.segBtn,
                            active && styles.segBtnActive,
                            pressed && styles.pressed,
                        ]}
                    >
                        <Text style={[styles.segText, active && styles.segTextActive]}>{o.t}</Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function NumberChip({ n, active, onPress }) {
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.numChip, active && styles.numChipOn, pressed && styles.pressed]}>
            <Text style={[styles.numChipText, active && styles.numChipTextOn]}>{String(n)}</Text>
        </Pressable>
    );
}

function getMissingHolesFromState(state, normalizedPlayers) {
    const ids = (normalizedPlayers || []).map((p) => String(p.id));
    const missing = [];

    for (let h = 1; h <= 18; h++) {
        let ok = true;
        for (const pid of ids) {
            const strokes = state?.holes?.[String(h)]?.players?.[String(pid)]?.strokes;
            if (toInt(strokes) <= 0) {
                ok = false;
                break;
            }
        }
        if (!ok) missing.push(h);
    }
    return missing;
}

export default function GameScoreEntryScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const {
        course,
        tee,
        players = [],
        hole = 1,
        holeMeta: holeMetaParam,
        roundId: roundIdParam,
        fixMissing,
        missingHoles,
        missingIndex,
        finishReturnHole,
    } = params;

    const isFixMode = !!fixMissing;

    const holeNumber = Number(hole || 1);
    const holeMeta = useMemo(() => {
        return holeMetaParam && typeof holeMetaParam === "object" ? holeMetaParam : buildDefaultHoleMeta();
    }, [holeMetaParam]);

    const par = holeMeta?.[String(holeNumber)]?.par ?? 4;
    const title = `HOLE ${holeNumber} • PAR ${par}`;

    const normalizedPlayers = useMemo(() => {
        const list = Array.isArray(players) ? players : [];
        return list.map((p, idx) => ({
            id: safePlayerId(p, String(idx)),
            name: safePlayerName(p, idx),
            handicap: p?.handicap ?? 0,
            source: p?.source || null,
            uid: p?.uid || p?.userId || null,
            email: p?.email || null,
        }));
    }, [players]);

    const playerRows = useMemo(() => {
        return normalizedPlayers
            .map((p) => ({
                ...p,
                _pid: String(p.id),
                _name: String(p.name),
            }))
            .filter((p) => !!p._pid);
    }, [normalizedPlayers]);

    const [inputs, setInputs] = useState({});

    useEffect(() => {
        // Seed inputs once playerRows arrives (and keep any existing edits)
        setInputs((prev) => {
            const next = { ...(prev || {}) };

            playerRows.forEach((p) => {
                const pid = String(p._pid);
                if (!pid) return;

                if (!next[pid]) {
                    next[pid] = {
                        trackStats: defaultTrackStatsForPlayer(p),
                        strokes: 0,
                        putts: 0,
                        _hasPuttsSaved: false,
                        fairway: "na",
                        green: "na",
                        sandSave: "na",
                        updown: "na",
                    };
                }
            });

            return next;
        });
    }, [playerRows]);

    // Load saved hole values from active round state
    useEffect(() => {
        let live = true;
        (async () => {
            const state = await loadActiveRound();
            if (!live) return;

            const savedHole = state?.holes?.[String(holeNumber)]?.players || null;
            if (!savedHole) return;

            setInputs((prev) => {
                const next = { ...(prev || {}) };
                playerRows.forEach((p) => {
                    const pid = String(p._pid);
                    const saved = savedHole[String(pid)];
                    if (!saved) return;

                    const track =
                        typeof saved?.trackStats === "boolean"
                            ? saved.trackStats
                            : typeof next?.[pid]?.trackStats === "boolean"
                                ? next[pid].trackStats
                                : defaultTrackStatsForPlayer(p);

                    const sStrokes = toInt(saved?.strokes);
                    const sPutts = toInt(saved?.putts);
                    const hasPutts = String(saved?.putts ?? "").length > 0;

                    next[pid] = {
                        ...(next[pid] || {}),
                        trackStats: !!track,
                        strokes: Number.isFinite(Number(sStrokes)) ? sStrokes : 0,
                        putts: Number.isFinite(Number(sPutts)) ? sPutts : 0,
                        _hasPuttsSaved: hasPutts,
                        fairway: saved?.fairway ?? next[pid]?.fairway ?? "na",
                        green: saved?.green ?? next[pid]?.green ?? "na",
                        sandSave: saved?.sandSave ?? next[pid]?.sandSave ?? "na",
                        updown: saved?.updown ?? next[pid]?.updown ?? "na",
                    };
                });
                return next;
            });
        })();

        return () => {
            live = false;
        };
    }, [holeNumber, playerRows]);

    function setPlayerField(pid, field, value) {
        const id = String(pid);
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[id] || {
                trackStats: defaultTrackStatsForPlayer({ source: null }),
                strokes: 0,
                putts: 0,
                _hasPuttsSaved: false,
                fairway: "na",
                green: "na",
                sandSave: "na",
                updown: "na",
            };

            if (field === "trackStats") {
                const nextOn = !!value;

                // if turning OFF -> clear ONLY the extra stats (keep strokes/putts)
                if (!nextOn) {
                    next[id] = {
                        ...cur,
                        trackStats: false,
                        fairway: "na",
                        green: "na",
                        sandSave: "na",
                        updown: "na",
                    };
                    return next;
                }


                next[id] = { ...cur, trackStats: true };
                return next;
            }

            if (field === "putts") {
                next[id] = { ...cur, putts: Number(value) || 0, _hasPuttsSaved: true };
                return next;
            }

            next[id] = { ...cur, [field]: value };
            return next;
        });
    }

    function validateStrokesForThisHole() {
        const missingNames = [];
        for (const p of playerRows) {
            const pid = String(p._pid);
            const v = inputs?.[pid] || {};
            if (toInt(v.strokes) <= 0) missingNames.push(p._name || "Player");
        }

        if (missingNames.length) {
            Alert.alert("Missing strokes", `Please enter strokes for:\n\n${missingNames.join("\n")}`, [{ text: "OK" }]);
            return false;
        }
        return true;
    }

    const persistHole = useCallback(
        async (opts = {}) => {
            const state = (await loadActiveRound()) || {
                course,
                tee,
                players: normalizedPlayers,
                holes: {},
                meta: {},
                startedAt: Date.now(),
            };

            const existingId =
                state?.id ||
                state?.roundId ||
                state?.activeRound?.id ||
                state?.round?.id ||
                roundIdParam;

            const safeId =
                String(existingId || "") ||
                (Number.isFinite(state?.startedAt) ? `r_${state.startedAt}` : `r_${Date.now()}`);

            state.id = safeId;
            state.roundId = safeId;

            state.course = state.course || course;
            state.tee = state.tee || tee;
            state.courseName = state.courseName || state.course?.name || course?.name || "Course";
            state.teeName = state.teeName || state.tee?.name || tee?.name || "Tees";
            state.players = normalizedPlayers;

            if (!state.holes) state.holes = {};
            if (!state.meta) state.meta = {};
            if (holeMeta && typeof holeMeta === "object") state.meta.holeMeta = holeMeta;

            if (!state.holes[String(holeNumber)]) state.holes[String(holeNumber)] = { players: {} };

            const payload = {};
            playerRows.forEach((p) => {
                const pid = String(p._pid);
                const val = inputs?.[pid] || {};
                const track = !!val.trackStats;

                payload[String(pid)] = {
                    trackStats: track,
                    strokes: String(toInt(val.strokes) || ""),
                    // Putts are always tracked (needed for games like Putting Contest), even when Stats is OFF.
                    putts: String(toInt(val.putts) || ""),
                    fairway: track ? (val.fairway ?? "na") : "na",
                    green: track ? (val.green ?? "na") : "na",
                    sandSave: track ? (val.sandSave ?? "na") : "na",
                    updown: track ? (val.updown ?? "na") : "na",
                };
            });

            state.holes[String(holeNumber)].players = payload;

            state.status = "active";
            state.inProgress = true;
            state.isActive = true;
            state.updatedAt = Date.now();

            // Only advance the round's resume hole when we explicitly say so (Next Hole).
            if (Number.isFinite(Number(opts?.resumeHole))) {
                const resumeHole = Math.max(1, Math.min(18, Number(opts.resumeHole)));

                state.currentHole = resumeHole;
                state.holeNumber = resumeHole;
                state.hole = resumeHole;
                state.holeIndex = resumeHole - 1;
            }

            const ok = await saveActiveRound(state);
            if (!ok) Alert.alert("Save failed", "Could not save hole data.");
            return { ok, roundId: safeId };
        },
        [course, tee, normalizedPlayers, playerRows, inputs, holeMeta, holeNumber, roundIdParam]
    );

    // autosave on navigation away
    const skipBeforeRemoveRef = useRef(false);
    const leavingRef = useRef(false);

    useEffect(() => {
        const unsub = navigation.addListener("beforeRemove", (e) => {
            if (skipBeforeRemoveRef.current) return;
            if (leavingRef.current) return;

            e.preventDefault();
            leavingRef.current = true;

            (async () => {
                try {
                    // IMPORTANT: backing out should NOT advance resume hole
                    await persistHole({ skipResumeUpdate: true });
                } catch { }
                navigation.dispatch(e.data.action);
                leavingRef.current = false;
            })();
        });

        return unsub;
    }, [navigation, persistHole]);

    function goToHoleHub(targetHole, extraParams = {}) {
        navigation.dispatch(
            CommonActions.navigate({
                name: ROUTES.HOLE_HUB,
                params: {
                    course,
                    tee,
                    players,
                    hole: targetHole,
                    holeMeta,
                    roundId: roundIdParam || null,
                    courseName: course?.name,
                    teeName: tee?.name,
                    ...extraParams,
                },
                merge: true,
            })
        );
    }

    async function onBack() {
        Keyboard.dismiss();

        if (isFixMode) {
            goToHoleHub(Number(finishReturnHole || 18));
            return;
        }

        // IMPORTANT: Back should save, but NOT advance resume hole
        const res = await persistHole({ skipResumeUpdate: true });
        goToHoleHub(holeNumber, { roundId: res?.roundId || roundIdParam || null });
    }



    async function onScorecard() {
        Keyboard.dismiss();
        const res = await persistHole();

        navigation.navigate(ROUTES.SCORECARD, {
            course,
            tee,
            players,
            holeMeta,
            roundId: res?.roundId || roundIdParam || null,
        });
    }

    async function onNextHole() {
        Keyboard.dismiss();

        if (!validateStrokesForThisHole()) return;

        const nextHole = holeNumber >= 18 ? 18 : holeNumber + 1;
        const res = await persistHole({ resumeHole: nextHole });
        goToHoleHub(nextHole, { roundId: res?.roundId || roundIdParam || null });
    }

    async function doneFixMode() {
        Keyboard.dismiss();

        if (!validateStrokesForThisHole()) return;

        await persistHole({ skipResumeUpdate: true });

        const state = (await loadActiveRound()) || {};
        const remaining = getMissingHolesFromState(state, normalizedPlayers);

        if (!remaining.length) {
            goToHoleHub(Number(finishReturnHole || 18), {
                showFinishPrompt: true,
                hole: Number(finishReturnHole || 18),
            });
            return;
        }

        const original = Array.isArray(missingHoles) ? missingHoles : [];
        let nextHole = null;
        let nextIdx = Number.isFinite(Number(missingIndex)) ? Number(missingIndex) : -1;

        if (original.length) {
            for (let i = Math.max(0, nextIdx + 1); i < original.length; i++) {
                const h = Number(original[i]);
                if (remaining.includes(h)) {
                    nextHole = h;
                    nextIdx = i;
                    break;
                }
            }
        }

        if (!nextHole) {
            nextHole = remaining[0];
            nextIdx = original.indexOf(nextHole);
            if (nextIdx < 0) nextIdx = 0;
        }

        skipBeforeRemoveRef.current = true;
        navigation.dispatch(
            StackActions.replace(ROUTES.SCORE_ENTRY, {
                ...params,
                hole: nextHole,
                fixMissing: true,
                missingHoles: original.length ? original : remaining,
                missingIndex: nextIdx,
                finishReturnHole: Number(finishReturnHole || 18),
            })
        );

        requestAnimationFrame(() => {
            skipBeforeRemoveRef.current = false;
        });
    }

    // picker
    const [pickOpen, setPickOpen] = useState(false);
    const [pickPid, setPickPid] = useState("");
    const [pickField, setPickField] = useState("strokes"); // "strokes" | "putts"

    const STROKES = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
    const PUTTS = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

    const pickTitle = useMemo(() => (pickField === "putts" ? "Putts" : "Strokes"), [pickField]);
    const pickNumbers = useMemo(() => (pickField === "putts" ? PUTTS : STROKES), [pickField, PUTTS, STROKES]);

    const openPicker = (pid, field) => {
        Keyboard.dismiss();
        setPickPid(String(pid));
        setPickField(field);
        setPickOpen(true);
    };

    const closePicker = () => {
        setPickOpen(false);
        setPickPid("");
    };

    const onTapNumber = (n) => {
        if (!pickPid) {
            closePicker();
            return;
        }
        if (pickField === "strokes") setPlayerField(pickPid, "strokes", Number(n));
        if (pickField === "putts") setPlayerField(pickPid, "putts", Number(n));
        closePicker();
    };

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={title}
                subtitle={isFixMode ? "Fix missing scores • Tap a box to pick a value." : "Tap a box to pick a value."}
                safeTop={false}
            />

            <View style={styles.body}>
                <FlatList
                    data={playerRows}
                    keyExtractor={(item) => String(item._pid)}
                    contentContainerStyle={{ paddingBottom: Math.max(16, (insets?.bottom || 0) + 160), paddingTop: 10 }}
                    renderItem={({ item }) => {
                        const pid = String(item._pid);
                        const val = inputs?.[pid] || {};
                        const strokes = toInt(val.strokes);
                        const putts = toInt(val.putts);
                        const trackStats = !!val.trackStats;
                        const showPutts = val?._hasPuttsSaved === true || String(val?.putts ?? "").length > 0;


                        return (
                            <View style={styles.playerCard}>
                                <View style={styles.playerTopRow}>
                                    <Text style={styles.playerName}>{item._name}</Text>

                                    <Pressable
                                        onPress={() => setPlayerField(pid, "trackStats", !trackStats)}
                                        style={({ pressed }) => [
                                            styles.statsPill,
                                            trackStats ? styles.statsPillOn : styles.statsPillOff,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={styles.statsPillText}>Stats {trackStats ? "ON" : "OFF"}</Text>
                                    </Pressable>

                                </View>

                                <View style={styles.inputRow}>
                                    <Pressable onPress={() => openPicker(pid, "strokes")} style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}>
                                        <Text style={styles.fieldLabel}>Strokes</Text>
                                        <View style={styles.valueBox}>
                                            <Text style={styles.valueText}>{strokes > 0 ? String(strokes) : "—"}</Text>
                                        </View>
                                        <Text style={styles.fieldHint}>1–10</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => openPicker(pid, "putts")}
                                        style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}
                                    >

                                        <Text style={styles.fieldLabel}>Putts</Text>
                                        <View style={styles.valueBox}>
                                            <Text style={styles.valueText}>{showPutts ? String(Math.max(0, Math.min(10, putts))) : "—"}</Text>
                                        </View>
                                        <Text style={styles.fieldHint}>0–10</Text>
                                    </Pressable>
                                </View>

                                {trackStats ? (
                                    <>
                                        <View style={styles.divider} />

                                        <View style={styles.statRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.statTitle}>Fairway Hit</Text>
                                                <Text style={styles.statHint}>Off the tee</Text>
                                            </View>
                                            <Seg3 value={val.fairway ?? "na"} onChange={(v) => setPlayerField(pid, "fairway", v)} />
                                        </View>

                                        <View style={styles.statRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.statTitle}>GIR</Text>
                                                <Text style={styles.statHint}>Green in regulation</Text>
                                            </View>
                                            <Seg3 value={val.green ?? "na"} onChange={(v) => setPlayerField(pid, "green", v)} />
                                        </View>

                                        <View style={styles.statRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.statTitle}>Sand Save</Text>
                                                <Text style={styles.statHint}>Bunker save</Text>
                                            </View>
                                            <Seg3 value={val.sandSave ?? "na"} onChange={(v) => setPlayerField(pid, "sandSave", v)} />
                                        </View>

                                        <View style={styles.statRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.statTitle}>Up & Down</Text>
                                                <Text style={styles.statHint}>Save par or better</Text>
                                            </View>
                                            <Seg3 value={val.updown ?? "na"} onChange={(v) => setPlayerField(pid, "updown", v)} />
                                        </View>
                                    </>
                                ) : null}
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>No players</Text>
                            <Text style={styles.emptySub}>Go back and add players to start scoring.</Text>
                        </View>
                    }
                />
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <Pressable
                    onPress={isFixMode ? doneFixMode : onNextHole}
                    style={({ pressed }) => [styles.primaryBtnFull, pressed && styles.pressed]}
                >
                    <Text style={styles.primaryText}>{isFixMode ? "Done" : "Save • Next Hole"}</Text>
                </Pressable>
            </View>


            <Modal visible={pickOpen} transparent animationType="fade" onRequestClose={closePicker}>
                <Pressable style={styles.pickerBackdrop} onPress={closePicker} />

                <View style={[styles.numCard, { paddingBottom: Math.max(12, (insets?.bottom || 0) + 10) }]}>
                    <View style={styles.numHeader}>
                        <Pressable onPress={closePicker} style={({ pressed }) => [styles.numHeaderBtn, pressed && styles.pressed]}>
                            <Text style={styles.numHeaderBtnText}>Cancel</Text>
                        </Pressable>

                        <Text style={styles.numTitle}>{pickTitle}</Text>

                        <View style={{ width: 72 }} />
                    </View>

                    <View style={styles.numGrid}>
                        {pickNumbers.map((n) => {
                            const cur = inputs?.[String(pickPid)] || {};
                            const curVal = pickField === "putts" ? toInt(cur.putts) : toInt(cur.strokes);
                            const active = Number(curVal) === Number(n);
                            return <NumberChip key={`num-${n}`} n={n} active={active} onPress={() => onTapNumber(n)} />;
                        })}
                    </View>

                    <Text style={styles.numHint}>{pickField === "putts" ? "Tap 0–10" : "Tap 1–10"}</Text>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    body: { flex: 1, paddingHorizontal: 16 },

    playerCard: {
        backgroundColor: CARD,
        borderRadius: 22,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.35)",
    },

    playerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    playerName: { flex: 1, color: WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },

    statsPill: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    statsPillOn: { backgroundColor: "rgba(46,204,113,0.16)", borderColor: "rgba(46,204,113,0.30)" },
    statsPillOff: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" },
    statsPillText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    inputRow: { flexDirection: "row", gap: 12, marginTop: 10 },
    fieldWrap: {
        flex: 1,
        backgroundColor: INNER,
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.35)",
    },
    fieldLabel: { color: MUTED, fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },
    valueBox: {
        marginTop: 10,
        height: 52,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.22)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    valueText: { color: WHITE, fontSize: 22, fontWeight: "900", letterSpacing: 0.2 },
    fieldHint: { marginTop: 8, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 10, letterSpacing: 0.2 },

    divider: { marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },

    statRow: {
        marginTop: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    statTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },
    statHint: { marginTop: 5, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

    segWrap: { flexDirection: "row", gap: 8 },
    segBtn: {
        width: 60,
        height: 38,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
        justifyContent: "center",
    },
    segBtnActive: {
        borderColor: "rgba(46,125,255,0.65)",
        backgroundColor: "rgba(46,125,255,0.22)",
    },
    segText: { color: WHITE, fontWeight: "900", fontSize: 12, opacity: 0.85 },
    segTextActive: { opacity: 1 },

    emptyCard: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    emptyTitle: { color: WHITE, fontWeight: "900", fontSize: 15 },
    emptySub: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, lineHeight: 17 },

    footer: {
        paddingTop: 10,
        paddingHorizontal: 16,
        backgroundColor: BG,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
    },
    footerRow: { flexDirection: "row", gap: 10 },

    secondaryBtn: {
        width: 80,
        height: 56,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    secondaryText: { color: WHITE, fontWeight: "900" },

    midBtn: {
        width: 110,
        height: 56,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    midText: { color: WHITE, fontWeight: "900" },

    primaryBtn: {
        flex: 1,
        height: 54,
        borderRadius: 16,
        backgroundColor: GREEN,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },
    primaryBtnFull: {
        height: 56,
        borderRadius: 18,
        backgroundColor: GREEN,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },

    primaryText: { color: WHITE, fontWeight: "900" },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    // Number picker
    pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
    numCard: {
        position: "absolute",
        left: 14,
        right: 14,
        bottom: 14,
        backgroundColor: "#0F1B33",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        padding: 14,
    },
    numHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 },
    numHeaderBtn: {
        height: 34,
        width: 72,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    numHeaderBtnText: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
    numTitle: { color: WHITE, fontWeight: "900", fontSize: 15, letterSpacing: 0.2 },

    numGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", paddingTop: 6, paddingBottom: 10 },
    numChip: {
        width: 52,
        height: 44,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    numChipOn: { backgroundColor: "rgba(46,204,113,0.16)", borderColor: "rgba(46,204,113,0.45)" },
    numChipText: { color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 16 },
    numChipTextOn: { color: WHITE },

    numHint: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 11, letterSpacing: 0.2, textAlign: "center" },
});
