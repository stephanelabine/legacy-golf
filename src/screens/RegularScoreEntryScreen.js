// src/screens/RegularScoreEntryScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
import { doc, collection, onSnapshot, setDoc, serverTimestamp, query, orderBy } from "firebase/firestore";

import { db, auth } from "../firebase/firebase";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
const GREEN_TEXT = "#0B1F12";
const YELLOW = "#F2C94C";

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
    return String(p?.uid || p?.id || p?._id || p?.playerId || p?._pid || fallback || "");
}

function safePlayerName(p) {
    return String(p?.name || p?.displayName || p?.fullName || p?.label || "Player");
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

function clampBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    return null;
}

function clampFir(v) {
    const s = String(v || "").toLowerCase().trim();
    if (s === "hit") return "hit";
    if (s === "miss") return "miss";
    if (s === "na") return "na";
    return "na";
}

function firLabel(v) {
    const s = clampFir(v);
    if (s === "hit") return "Hit";
    if (s === "miss") return "Miss";
    return "N/A";
}

function firAccent(v) {
    const s = clampFir(v);
    if (s === "hit") return GREEN;
    if (s === "miss") return "rgba(255,255,255,0.65)";
    return "rgba(255,255,255,0.65)";
}

function NumberChip({ n, active, onPress }) {
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.numChip, active && styles.numChipOn, pressed && styles.pressed]}>
            <Text style={[styles.numChipText, active && styles.numChipTextOn]}>{String(n)}</Text>
        </Pressable>
    );
}

export default function RegularScoreEntryScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    // Regular-round identity (single source of truth root)
    // Preferred: params.roundId
    // Fallbacks: params.gameId, params.roundKey
    const roundId = useMemo(() => {
        const a = String(params?.roundId || "").trim();
        if (a) return a;
        const b = String(params?.gameId || "").trim();
        if (b) return b;
        const c = String(params?.roundKey || "").trim();
        if (c) return c;
        return "";
    }, [params?.roundId, params?.gameId, params?.roundKey]);

    const holeNumber = Number(params?.holeNumber || params?.hole || 1);
    const totalHoles = Number(params?.totalHoles || 18);

    const meUid = String(auth?.currentUser?.uid || "");

    const holeMeta = useMemo(() => {
        return params?.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
    }, [params?.holeMeta]);

    const par = holeMeta?.[String(holeNumber)]?.par ?? 4;
    const title = `HOLE ${holeNumber} • PAR ${par}`;

    const HOLE_HUB_ROUTE =
        params?.holeHubRouteName ||
        params?.holeHubRoute ||
        ROUTES?.GAME_HOLE_HUB ||
        ROUTES?.REGULAR_HOLE_HUB ||
        ROUTES?.HOLE_HUB ||
        ROUTES?.HOLE_VIEW ||
        "RegularHoleHubScreen";

    const HOME_ROUTE = ROUTES?.HOME || "Home";

    const [players, setPlayers] = useState(() => {
        const p = params?.players;
        return Array.isArray(p) ? p : [];
    });

    const [selectedIds, setSelectedIds] = useState(() => []);
    const [selectionReady, setSelectionReady] = useState(false);

    const [scoresByPid, setScoresByPid] = useState({});
    const [inputs, setInputs] = useState({});
    const [saving, setSaving] = useState(false);

    const [pickOpen, setPickOpen] = useState(false);
    const [pickPid, setPickPid] = useState("");
    const [pickField, setPickField] = useState("strokes"); // "strokes" | "putts"

    const STROKES = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
    const PUTTS = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

    const [selectOpen, setSelectOpen] = useState(false);

    // Stats modal
    const [statsOpen, setStatsOpen] = useState(false);
    const [statsPid, setStatsPid] = useState("");
    const [statsName, setStatsName] = useState("");

    const playerRows = useMemo(() => {
        const list = Array.isArray(players) ? players : [];
        return list
            .map((p, idx) => {
                const pid = safePlayerId(p, String(idx));
                return { ...p, _pid: pid, _name: safePlayerName(p) };
            })
            .filter((p) => !!p._pid);
    }, [players]);

    const sortMeFirst = useCallback(
        (rows) => {
            const list = Array.isArray(rows) ? [...rows] : [];
            list.sort((a, b) => {
                const aMe = String(a?._pid) === String(meUid);
                const bMe = String(b?._pid) === String(meUid);
                if (aMe && !bMe) return -1;
                if (!aMe && bMe) return 1;
                return String(a?._name || "").localeCompare(String(b?._name || ""));
            });
            return list;
        },
        [meUid]
    );

    const allRowsSorted = useMemo(() => sortMeFirst(playerRows), [playerRows, sortMeFirst]);

    const eligibleIds = useMemo(() => {
        const ids = uniqIds(allRowsSorted.map((p) => String(p._pid)));
        return ids;
    }, [allRowsSorted]);

    const eligibleSet = useMemo(() => new Set(eligibleIds.map(String)), [eligibleIds]);

    // If players weren't passed, load from Firestore: rounds/{roundId}/players
    useEffect(() => {
        if (!roundId) return;
        if (Array.isArray(params?.players) && params.players.length) return;

        const playersRef = collection(db, "rounds", String(roundId), "players");

        let unsub = null;
        try {
            unsub = onSnapshot(
                playersRef,
                (snap) => {
                    const docs = snap?.docs || [];
                    const list = docs.map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
                    if (list.length) setPlayers(list);
                },
                () => { }
            );
        } catch { }

        return () => {
            if (unsub) unsub();
        };
    }, [roundId, params?.players]);

    const selectionRef = useMemo(() => {
        if (!roundId || !meUid) return null;
        return doc(db, "rounds", String(roundId), "scorekeepers", String(meUid));
    }, [roundId, meUid]);

    // Load / persist who this scorekeeper is scoring for.
    useEffect(() => {
        if (!selectionRef) return;
        if (!meUid) return;
        if (!eligibleIds.length) return;

        setSelectionReady(false);

        const defaultIds = [String(meUid)].filter((id) => eligibleSet.has(String(id)));

        const unsub = onSnapshot(
            selectionRef,
            async (snap) => {
                try {
                    if (snap?.exists()) {
                        const data = snap.data ? snap.data() : {};
                        const raw = uniqIds(Array.isArray(data?.selectedPlayerIds) ? data.selectedPlayerIds : []).map(String);
                        const clamped = raw.filter((id) => eligibleSet.has(String(id)));
                        const next = clamped.length ? clamped : defaultIds;
                        setSelectedIds(next);
                        setSelectionReady(true);
                        return;
                    }

                    setSelectedIds(defaultIds);
                    setSelectionReady(true);

                    await setDoc(
                        selectionRef,
                        { scorekeeperUid: String(meUid), selectedPlayerIds: defaultIds, updatedAt: serverTimestamp() },
                        { merge: true }
                    );
                } catch {
                    setSelectedIds(defaultIds);
                    setSelectionReady(true);
                }
            },
            () => {
                setSelectedIds(defaultIds);
                setSelectionReady(true);
            }
        );

        return () => unsub();
    }, [selectionRef, meUid, eligibleIds, eligibleSet]);

    const displayedIds = useMemo(() => {
        const base = uniqIds(Array.isArray(selectedIds) ? selectedIds : []).map(String);
        const clamped = base.filter((id) => eligibleSet.has(String(id)));

        if (clamped.length) return new Set(clamped.map(String));
        if (meUid && eligibleSet.has(String(meUid))) return new Set([String(meUid)]);
        return new Set();
    }, [selectedIds, eligibleSet, meUid]);

    const displayedRows = useMemo(() => {
        if (!allRowsSorted.length) return [];
        const set = displayedIds;
        return allRowsSorted.filter((p) => set.has(String(p._pid)));
    }, [allRowsSorted, displayedIds]);

    const toggleSelected = useCallback(
        async (pid) => {
            const id = String(pid);
            if (!eligibleSet.has(id)) return;

            // optimistic UI
            setSelectedIds((prev) => {
                const cur = uniqIds(Array.isArray(prev) ? prev : []).map(String).filter((x) => eligibleSet.has(String(x)));
                const set = new Set(cur);
                if (set.has(id)) set.delete(id);
                else set.add(id);

                let next = Array.from(set);
                if (!next.length && meUid && eligibleSet.has(String(meUid))) next = [String(meUid)];
                return next;
            });

            if (!selectionRef) return;

            try {
                const cur = uniqIds(Array.isArray(selectedIds) ? selectedIds : []).map(String).filter((x) => eligibleSet.has(String(x)));
                const set = new Set(cur);
                if (set.has(id)) set.delete(id);
                else set.add(id);

                let next = Array.from(set);
                if (!next.length && meUid && eligibleSet.has(String(meUid))) next = [String(meUid)];

                await setDoc(selectionRef, { scorekeeperUid: String(meUid), selectedPlayerIds: next, updatedAt: serverTimestamp() }, { merge: true });
            } catch { }
        },
        [eligibleSet, selectionRef, selectedIds, meUid]
    );

    // Subscribe to all scores for this round: rounds/{roundId}/scores/{playerId}
    useEffect(() => {
        if (!roundId) return;

        const scoresRef = collection(db, "rounds", String(roundId), "scores");

        const unsub = onSnapshot(
            scoresRef,
            (snap) => {
                const next = {};
                (snap?.docs || []).forEach((d) => {
                    const data = d.data ? d.data() : {};
                    next[String(d.id)] = data || {};
                });
                setScoresByPid(next);
            },
            () => { }
        );

        return () => unsub();
    }, [roundId]);

    // Hydrate inputs from saved doc
    useEffect(() => {
        if (!displayedRows.length) return;

        const nextInputs = {};
        for (const p of displayedRows) {
            const pid = String(p._pid);
            const docData = scoresByPid?.[pid] || {};
            const holes = docData?.holes || {};
            const h = holes?.[String(holeNumber)] || {};

            const strokes = Number.isFinite(Number(h?.strokes)) ? Number(h.strokes) : 0;
            const putts = Number.isFinite(Number(h?.putts)) ? Number(h.putts) : 0;

            const hasStrokes = Number.isFinite(Number(h?.strokes));
            const hasPutts = Number.isFinite(Number(h?.putts));

            const stats = h?.stats && typeof h.stats === "object" ? h.stats : {};
            const fir = clampFir(stats?.fir ?? "na");
            const gir = clampBool(stats?.gir);
            const upDown = clampBool(stats?.upDown);

            nextInputs[pid] = {
                strokes: hasStrokes ? strokes : 0,
                putts: hasPutts ? putts : 0,
                _hasPuttsSaved: hasPutts,
                stats: { fir, gir, upDown },
            };
        }

        setInputs(nextInputs);
    }, [displayedRows, scoresByPid, holeNumber]);

    function setPlayerField(pid, field, value) {
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[pid] || { strokes: 0, putts: 0, stats: { fir: "na", gir: null, upDown: null } };
            const v = Number(value);

            next[pid] = {
                ...cur,
                [field]: Number.isFinite(v) ? v : 0,
                ...(field === "putts" ? { _hasPuttsSaved: true } : null),
            };

            return next;
        });
    }

    function setPlayerStat(pid, field, value) {
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[pid] || { strokes: 0, putts: 0, stats: { fir: "na", gir: null, upDown: null } };
            const curStats = cur?.stats && typeof cur.stats === "object" ? cur.stats : { fir: "na", gir: null, upDown: null };

            const patchedStats = {
                ...curStats,
                ...(field === "fir" ? { fir: clampFir(value) } : null),
                ...(field === "gir" ? { gir: value === null ? null : !!value } : null),
                ...(field === "upDown" ? { upDown: value === null ? null : !!value } : null),
            };

            next[pid] = { ...cur, stats: patchedStats };
            return next;
        });
    }

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
        setPlayerField(pickPid, pickField, Number(n));
        closePicker();
    };

    const openStats = useCallback((pid, name) => {
        setStatsPid(String(pid));
        setStatsName(String(name || "Player"));
        setStatsOpen(true);
    }, []);

    const closeStats = useCallback(() => {
        setStatsOpen(false);
        setStatsPid("");
        setStatsName("");
    }, []);

    const selectCountLabel = useMemo(() => {
        if (!selectionReady) return "Loading…";
        const n = displayedRows.length;
        return `${n} ${n === 1 ? "player" : "players"}`;
    }, [displayedRows.length, selectionReady]);

    const pickTitle = useMemo(() => (pickField === "putts" ? "Putts" : "Strokes"), [pickField]);
    const pickNumbers = useMemo(() => (pickField === "putts" ? PUTTS : STROKES), [pickField, PUTTS, STROKES]);

    const onPressSaveNext = useCallback(async () => {
        if (!roundId) {
            Alert.alert("Missing round", "No roundId was provided.");
            return;
        }

        if (!meUid) {
            Alert.alert("Not signed in", "You must be signed in to save scores.");
            return;
        }

        if (!displayedRows.length) {
            Alert.alert("No players loaded", "No players selected yet.");
            return;
        }

        setSaving(true);
        Keyboard.dismiss();

        try {
            const writes = [];

            for (const p of displayedRows) {
                const pid = String(p._pid);
                const val = inputs?.[pid] || {};

                const strokes = toInt(val.strokes);
                const putts = toInt(val.putts);

                if (strokes <= 0) continue;

                const st = val?.stats && typeof val.stats === "object" ? val.stats : {};
                const fir = clampFir(st?.fir ?? "na");
                const gir = clampBool(st?.gir);
                const upDown = clampBool(st?.upDown);

                const scoreDocRef = doc(db, "rounds", String(roundId), "scores", String(pid));

                const payload = {
                    roundId: String(roundId || ""),
                    playerId: String(pid),
                    playerName: p._name,
                    updatedAt: serverTimestamp(),
                    holes: {
                        [String(holeNumber)]: {
                            holeNumber: Number(holeNumber),
                            strokes: Number(strokes),
                            putts: Number.isFinite(Number(putts)) ? Number(Math.max(0, Math.min(10, putts))) : 0,
                            stats: {
                                fir,
                                gir,
                                upDown,
                            },
                            updatedAt: serverTimestamp(),
                            scorekeeperUid: String(meUid || ""),
                        },
                    },
                };

                writes.push(setDoc(scoreDocRef, payload, { merge: true }));
            }

            if (!writes.length) {
                Alert.alert("Nothing to save", "Enter at least one player’s strokes.");
                return;
            }

            await Promise.all(writes);

            const nextHole = holeNumber + 1;

            if (nextHole > totalHoles) {
                Alert.alert("Saved", "Scores saved.");
                navigation.replace(HOLE_HUB_ROUTE, {
                    ...params,
                    roundId,
                    holeNumber: Math.min(totalHoles, holeNumber),
                    hole: Math.min(totalHoles, holeNumber),
                    totalHoles,
                    groupPlayerIds: Array.from(displayedIds || []),
                });
                return;
            }

            navigation.replace(HOLE_HUB_ROUTE, {
                ...params,
                roundId,
                holeNumber: nextHole,
                hole: nextHole,
                totalHoles,
                groupPlayerIds: Array.from(displayedIds || []),
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[LegacyGolf] RegularScoreEntry save failed:", e);
            const msg = e?.message || e?.code || "Could not save scores. Please try again.";
            Alert.alert("Save failed", String(msg));
        } finally {
            setSaving(false);
        }
    }, [roundId, meUid, displayedRows, inputs, holeNumber, totalHoles, navigation, params, displayedIds, HOLE_HUB_ROUTE]);

    const statsForModal = useMemo(() => {
        if (!statsPid) return { fir: "na", gir: null, upDown: null };
        const v = inputs?.[String(statsPid)] || {};
        const st = v?.stats && typeof v.stats === "object" ? v.stats : {};
        return {
            fir: clampFir(st?.fir ?? "na"),
            gir: clampBool(st?.gir),
            upDown: clampBool(st?.upDown),
        };
    }, [statsPid, inputs]);

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={title}
                subtitle={"Tap a box to pick a value."}
                safeTop={false}
                rightLabel="Exit"
                onRightPress={() => {
                    Alert.alert(
                        "Exit round?",
                        "Your progress is saved. Return to Home?",
                        [
                            { text: "Cancel", style: "cancel" },
                            { text: "Exit", style: "destructive", onPress: () => navigation.navigate(HOME_ROUTE) },
                        ]
                    );
                }}
            />

            <View style={styles.body}>
                <View style={styles.topBar}>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>Round</Text>
                    </View>

                    <Pressable onPress={() => setSelectOpen(true)} style={({ pressed }) => [styles.pill2, pressed && styles.pressed]}>
                        <Text style={styles.pillText2}>{selectCountLabel}</Text>
                    </Pressable>
                </View>

                <FlatList
                    data={displayedRows}
                    keyExtractor={(item) => String(item._pid)}
                    contentContainerStyle={{ paddingBottom: Math.max(16, (insets?.bottom || 0) + 140) }}
                    renderItem={({ item }) => {
                        const pid = String(item._pid);
                        const val = inputs?.[pid] || {};
                        const strokes = toInt(val.strokes);
                        const putts = toInt(val.putts);
                        const showPutts = val?._hasPuttsSaved === true;

                        const st = val?.stats && typeof val.stats === "object" ? val.stats : {};
                        const fir = clampFir(st?.fir ?? "na");
                        const gir = clampBool(st?.gir);
                        const upDown = clampBool(st?.upDown);

                        const statsSummary = `FIR: ${firLabel(fir)}  •  GIR: ${gir === null ? "—" : gir ? "Yes" : "No"}  •  U&D: ${upDown === null ? "—" : upDown ? "Yes" : "No"}`;

                        return (
                            <View style={styles.playerCard}>
                                <View style={styles.playerTopRow}>
                                    <Text style={styles.playerName}>{item._name}</Text>

                                    <Pressable
                                        onPress={() => openStats(pid, item._name)}
                                        style={({ pressed }) => [
                                            styles.statsBtn,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={styles.statsBtnText}>Stats</Text>
                                    </Pressable>
                                </View>

                                <Text style={styles.statsLine}>
                                    {statsSummary}
                                </Text>

                                <View style={styles.inputRow}>
                                    <Pressable onPress={() => openPicker(pid, "strokes")} style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}>
                                        <Text style={styles.fieldLabel}>Strokes</Text>
                                        <View style={styles.valueBox}>
                                            <Text style={styles.valueText}>{strokes > 0 ? String(strokes) : "—"}</Text>
                                        </View>
                                        <Text style={styles.fieldHint}>1–10</Text>
                                    </Pressable>

                                    <Pressable onPress={() => openPicker(pid, "putts")} style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}>
                                        <Text style={styles.fieldLabel}>Putts</Text>
                                        <View style={styles.valueBox}>
                                            <Text style={styles.valueText}>{showPutts ? String(Math.max(0, Math.min(10, putts))) : "—"}</Text>
                                        </View>
                                        <Text style={styles.fieldHint}>0–10</Text>
                                    </Pressable>
                                </View>

                                <View style={{ height: 2 }} />

                                <View style={styles.quickStatsRow}>
                                    <Pressable
                                        onPress={() => setPlayerStat(pid, "fir", fir === "hit" ? "miss" : fir === "miss" ? "na" : "hit")}
                                        style={({ pressed }) => [
                                            styles.quickPill,
                                            pressed && styles.pressed,
                                            { borderColor: "rgba(255,255,255,0.18)" },
                                        ]}
                                    >
                                        <Text style={styles.quickPillK}>FIR</Text>
                                        <Text style={[styles.quickPillV, { color: firAccent(fir) }]}>{firLabel(fir)}</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setPlayerStat(pid, "gir", gir === null ? true : gir === true ? false : null)}
                                        style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                                    >
                                        <Text style={styles.quickPillK}>GIR</Text>
                                        <Text style={styles.quickPillV}>{gir === null ? "—" : gir ? "Yes" : "No"}</Text>
                                    </Pressable>

                                    <Pressable
                                        onPress={() => setPlayerStat(pid, "upDown", upDown === null ? true : upDown === true ? false : null)}
                                        style={({ pressed }) => [styles.quickPill, pressed && styles.pressed]}
                                    >
                                        <Text style={styles.quickPillK}>U&D</Text>
                                        <Text style={styles.quickPillV}>{upDown === null ? "—" : upDown ? "Yes" : "No"}</Text>
                                    </Pressable>
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>Loading…</Text>
                            <Text style={styles.emptySub}>Waiting for players and your selection to load.</Text>
                        </View>
                    }
                />
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <Pressable onPress={onPressSaveNext} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && { opacity: 0.7 }]}>
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save • Next Hole"}</Text>
                </Pressable>

                <Text style={styles.microNote}>scores: rounds/{`{roundId}`}/scores/{`{playerId}`}</Text>
                <Text style={styles.microNote}>selection: rounds/{`{roundId}`}/scorekeepers/{`{myUid}`}</Text>
                <Text style={styles.microNote}>hole stats: holes/{`{holeNumber}`}/stats (fir,gir,upDown)</Text>
            </View>

            {/* Stats modal */}
            <Modal visible={statsOpen} animationType="fade" transparent onRequestClose={closeStats}>
                <View style={styles.statsModalOverlay}>
                    <View style={styles.statsModalCard}>
                        <View style={styles.statsModalTop}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.statsModalTitle}>STATS • HOLE {holeNumber}</Text>
                                <Text style={styles.statsModalSub} numberOfLines={1}>
                                    {statsName || "Player"}
                                </Text>
                            </View>

                            <Pressable onPress={closeStats} style={({ pressed }) => [styles.statsModalClose, pressed && styles.pressed]}>
                                <Text style={styles.statsModalCloseText}>Close</Text>
                            </Pressable>
                        </View>

                        <View style={styles.statsModalDivider} />

                        <View style={styles.statsModalBody}>
                            <Text style={styles.statsSectionLabel}>Fairway In Regulation (FIR)</Text>

                            <View style={styles.statsTriRow}>
                                {[
                                    ["hit", "Hit"],
                                    ["miss", "Miss"],
                                    ["na", "N/A"],
                                ].map(([k, label]) => {
                                    const on = clampFir(statsForModal.fir) === k;
                                    return (
                                        <Pressable
                                            key={k}
                                            onPress={() => setPlayerStat(String(statsPid), "fir", k)}
                                            style={({ pressed }) => [
                                                styles.statsTriBtn,
                                                on && styles.statsTriBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsTriText, on && styles.statsTriTextOn]}>{label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={{ height: 14 }} />

                            <Text style={styles.statsSectionLabel}>Greens In Regulation (GIR)</Text>
                            <View style={styles.statsTriRow}>
                                {[
                                    [true, "Yes"],
                                    [false, "No"],
                                    [null, "—"],
                                ].map(([k, label]) => {
                                    const on = statsForModal.gir === k;
                                    return (
                                        <Pressable
                                            key={`gir-${String(k)}`}
                                            onPress={() => setPlayerStat(String(statsPid), "gir", k)}
                                            style={({ pressed }) => [
                                                styles.statsTriBtn,
                                                on && styles.statsTriBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsTriText, on && styles.statsTriTextOn]}>{label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={{ height: 14 }} />

                            <Text style={styles.statsSectionLabel}>Up & Down</Text>
                            <View style={styles.statsTriRow}>
                                {[
                                    [true, "Yes"],
                                    [false, "No"],
                                    [null, "—"],
                                ].map(([k, label]) => {
                                    const on = statsForModal.upDown === k;
                                    return (
                                        <Pressable
                                            key={`ud-${String(k)}`}
                                            onPress={() => setPlayerStat(String(statsPid), "upDown", k)}
                                            style={({ pressed }) => [
                                                styles.statsTriBtn,
                                                on && styles.statsTriBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsTriText, on && styles.statsTriTextOn]}>{label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <View style={{ height: 14 }} />

                            <Text style={styles.statsModalNote}>
                                Stats are saved when you press “Save • Next Hole”.
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Selection modal */}
            <Modal visible={selectOpen} animationType="slide" transparent onRequestClose={() => setSelectOpen(false)}>
                <View style={[styles.modalBackdrop, { paddingBottom: Math.max(14, (insets?.bottom || 0) + 10) }]}>
                    <View style={styles.selCard}>
                        <View style={styles.selHeader}>
                            <Text style={styles.selTitle}>Who are you scoring for?</Text>
                            <Pressable onPress={() => setSelectOpen(false)} style={({ pressed }) => [styles.selDone, pressed && styles.pressed]}>
                                <Text style={styles.selDoneText}>Done</Text>
                            </Pressable>
                        </View>

                        <Text style={styles.selSub}>This selection carries forward hole-to-hole for this round.</Text>

                        <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
                            {allRowsSorted.length ? (
                                allRowsSorted.map((p) => {
                                    const pid = String(p._pid);
                                    const isOn = displayedIds.has(pid);
                                    const isMe = pid === String(meUid);

                                    return (
                                        <Pressable key={pid} onPress={() => toggleSelected(pid)} style={({ pressed }) => [styles.selRow, pressed && styles.pressed]}>
                                            <View style={[styles.selDotOuter, isOn && styles.selDotOuterOn]}>
                                                <View style={[styles.selDotInner, isOn && { opacity: 1 }]} />
                                            </View>

                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={styles.selName}>
                                                    {p._name}
                                                    {isMe ? " (You)" : ""}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    );
                                })
                            ) : (
                                <View style={styles.modalEmpty}>
                                    <Text style={styles.modalEmptyText}>No players found yet.</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Number picker */}
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
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },

    topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    pill: {
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    pillText: { color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    pill2: {
        paddingHorizontal: 12,
        height: 34,
        borderRadius: 999,
        backgroundColor: "rgba(46,204,113,0.10)",
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.22)",
        alignItems: "center",
        justifyContent: "center",
    },
    pillText2: { color: "rgba(255,255,255,0.88)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

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

    statsBtn: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    statsBtnText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    statsLine: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },

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

    quickStatsRow: { flexDirection: "row", gap: 10, marginTop: 10 },
    quickPill: {
        flex: 1,
        height: 44,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    quickPillK: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 10, letterSpacing: 0.8 },
    quickPillV: { marginTop: 3, color: WHITE, fontWeight: "900", fontSize: 12 },

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
    saveBtn: { height: 56, borderRadius: 999, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
    saveBtnText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },
    microNote: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10, letterSpacing: 0.2 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    // Stats modal
    statsModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", alignItems: "center", justifyContent: "center", padding: 16 },
    statsModalCard: { width: "100%", maxWidth: 520, borderRadius: 24, backgroundColor: "rgba(18,22,30,0.97)", borderWidth: 2, borderColor: "rgba(242,201,76,0.55)", padding: 14 },
    statsModalTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    statsModalTitle: { color: WHITE, fontWeight: "900", fontSize: 14, letterSpacing: 0.7 },
    statsModalSub: { marginTop: 6, color: "rgba(255,255,255,0.74)", fontWeight: "800", fontSize: 12, lineHeight: 16 },
    statsModalClose: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    statsModalCloseText: { color: WHITE, fontWeight: "900", fontSize: 12 },
    statsModalDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 12, marginBottom: 12 },
    statsModalBody: {},
    statsSectionLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
    statsTriRow: { flexDirection: "row", gap: 10, marginTop: 10 },
    statsTriBtn: {
        flex: 1,
        height: 46,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    statsTriBtnOn: { backgroundColor: "rgba(46,204,113,0.16)", borderColor: "rgba(46,204,113,0.45)" },
    statsTriText: { color: "rgba(255,255,255,0.78)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
    statsTriTextOn: { color: WHITE },
    statsModalNote: { marginTop: 12, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 12, lineHeight: 16, textAlign: "center" },

    // Selection modal
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", paddingHorizontal: 14, justifyContent: "flex-end" },
    selCard: {
        backgroundColor: "#0F1B33",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        maxHeight: "78%",
        paddingBottom: 8,
    },
    selHeader: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
    },
    selTitle: { color: WHITE, fontWeight: "900", fontSize: 15, letterSpacing: 0.2 },
    selDone: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(46,204,113,0.16)",
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.30)",
        alignItems: "center",
        justifyContent: "center",
    },
    selDoneText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
    selSub: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 16 },
    selRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
    selDotOuter: { width: 22, height: 22, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginRight: 10 },
    selDotOuterOn: { borderColor: "rgba(46,204,113,0.55)" },
    selDotInner: { width: 12, height: 12, borderRadius: 999, backgroundColor: GREEN, opacity: 0 },
    selName: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },
    modalEmpty: { paddingHorizontal: 14, paddingVertical: 18 },
    modalEmptyText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

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
