// src/screens/TournamentScoreEntryScreen.js
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import {
    doc,
    collection,
    onSnapshot,
    setDoc,
    serverTimestamp,
    query,
    orderBy,
} from "firebase/firestore";

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

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5, 4, 3, 4, 4];

function buildDefaultHoleMeta() {
    const meta = {};
    for (let i = 1; i <= 18; i++) meta[String(i)] = { par: DEFAULT_PARS[i - 1] };
    return meta;
}

function defaultRoundId(tournamentId, roundNumber) {
    const t = String(tournamentId || "").trim();
    const r = Number(roundNumber || 1);
    if (!t) return "";
    return `${t}__r${r}`;
}

function toInt(v) {
    const raw = String(v ?? "");
    if (!raw.length) return 0;
    const n = parseInt(raw.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function safePlayerId(p, fallback) {
    return String(p?.uid || p?.id || p?._id || p?.playerId || fallback || "");
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

export default function TournamentScoreEntryScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);
    const holeNumber = Number(params?.holeNumber || 1);
    const totalHoles = Number(params?.totalHoles || 18);

    const meUid = String(auth?.currentUser?.uid || "");
    const roundKey = `r${String(roundNumber)}`;

    const roundId = useMemo(() => {
        const p = String(params?.roundId || "").trim();
        if (p) return p;
        return defaultRoundId(tournamentId, roundNumber);
    }, [params?.roundId, tournamentId, roundNumber]);

    const holeMeta = useMemo(() => {
        return params?.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
    }, [params?.holeMeta]);

    const par = holeMeta?.[String(holeNumber)]?.par ?? 4;
    const title = `HOLE ${holeNumber} • PAR ${par}`;

    // players (tournament roster)
    const [players, setPlayers] = useState(() => {
        const p = params?.players;
        return Array.isArray(p) ? p : [];
    });

    // group ids (the foursome you are playing with) for THIS round
    const [groupIds, setGroupIds] = useState(() => {
        const fromParams = Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds.map(String) : null;
        return fromParams && fromParams.length ? uniqIds(fromParams) : [];
    });

    // selection ids (which players YOU are scoring for) persisted in Firestore
    const [selectedIds, setSelectedIds] = useState(() => []); // will default to [meUid] once group known
    const [selectionReady, setSelectionReady] = useState(false);

    // scores cache from Firestore
    const [scoresByPid, setScoresByPid] = useState({}); // { [pid]: { holes: { [hole]: {strokes, putts} } } }

    // inputs per hole view
    const [inputs, setInputs] = useState({}); // { [playerId]: { strokes: number, putts: number } }
    const [saving, setSaving] = useState(false);

    // picker modal (wheel)
    const [pickOpen, setPickOpen] = useState(false);
    const [pickPid, setPickPid] = useState("");
    const [pickField, setPickField] = useState("strokes"); // "strokes" | "putts"
    const [pickValue, setPickValue] = useState(1);

    const ROW_H = 40;
    const VISIBLE_ROWS = 5;
    const PAD = Math.floor(VISIBLE_ROWS / 2) * ROW_H;

    const strokesRef = useRef(null);
    const puttsRef = useRef(null);

    const STROKES = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
    const PUTTS = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

    // selection modal
    const [selectOpen, setSelectOpen] = useState(false);

    // If players weren't passed, load from Firestore: prefer /members, fallback /roster
    useEffect(() => {
        if (!tournamentId) return;
        if (Array.isArray(params?.players) && params.players.length) return;

        const membersRef = collection(db, "tournaments", String(tournamentId), "members");
        const rosterRef = collection(db, "tournaments", String(tournamentId), "roster");

        let unsubMembers = null;
        let unsubRoster = null;

        try {
            unsubMembers = onSnapshot(
                membersRef,
                (snap) => {
                    const docs = snap?.docs || [];
                    const list = docs.map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
                    if (list.length) {
                        setPlayers(list);
                        return;
                    }

                    try {
                        if (!unsubRoster) {
                            unsubRoster = onSnapshot(
                                rosterRef,
                                (snap2) => {
                                    const docs2 = snap2?.docs || [];
                                    const list2 = docs2.map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
                                    if (list2.length) setPlayers(list2);
                                },
                                () => { }
                            );
                        }
                    } catch { }
                },
                () => { }
            );
        } catch { }

        return () => {
            if (unsubMembers) unsubMembers();
            if (unsubRoster) unsubRoster();
        };
    }, [tournamentId, params?.players]);

    // Resolve group ids from universal groups if not provided
    useEffect(() => {
        if (!tournamentId) return;
        if (Array.isArray(groupIds) && groupIds.length) return;
        if (!meUid) return;

        const qy = query(
            collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "groups"),
            orderBy("orderIndex", "asc")
        );

        const unsub = onSnapshot(
            qy,
            (snap) => {
                const docs = snap?.docs || [];
                for (const d of docs) {
                    const data = d.data ? d.data() : null;
                    const ids = uniqIds(Array.isArray(data?.playerIds) ? data.playerIds.map(String) : []);
                    if (ids.includes(String(meUid))) {
                        setGroupIds(ids);
                        return;
                    }
                }
                setGroupIds([String(meUid)]);
            },
            () => setGroupIds([String(meUid)])
        );

        return () => unsub();
    }, [tournamentId, roundKey, meUid, groupIds]);

    const playerRows = useMemo(() => {
        const list = Array.isArray(players) ? players : [];
        return list
            .map((p, idx) => {
                const pid = safePlayerId(p, String(idx));
                return { ...p, _pid: pid, _name: safePlayerName(p) };
            })
            .filter((p) => !!p._pid);
    }, [players]);

    // group-only player rows (your foursome)
    const groupRows = useMemo(() => {
        if (!playerRows.length) return [];
        const set = new Set((Array.isArray(groupIds) ? groupIds : []).map(String));
        return playerRows.filter((p) => set.has(String(p._pid)));
    }, [playerRows, groupIds]);

    // ensure logged-in user always appears first in any list
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

    const groupRowsSorted = useMemo(() => sortMeFirst(groupRows), [groupRows, sortMeFirst]);

    // Firestore selection doc (persist which players THIS scorekeeper is scoring for, per round)
    const selectionRef = useMemo(() => {
        if (!tournamentId || !meUid) return null;
        return doc(db, "tournaments", String(tournamentId), "rounds", roundKey, "scorekeepers", String(meUid));
    }, [tournamentId, roundKey, meUid]);

    // Subscribe to selection doc; if missing, default to [meUid] and write once.
    useEffect(() => {
        if (!selectionRef) return;
        if (!Array.isArray(groupIds) || !groupIds.length) return;

        setSelectionReady(false);

        const unsub = onSnapshot(
            selectionRef,
            async (snap) => {
                try {
                    const groupSet = new Set(groupIds.map(String));
                    if (snap?.exists()) {
                        const data = snap.data ? snap.data() : {};
                        const raw = uniqIds(Array.isArray(data?.selectedPlayerIds) ? data.selectedPlayerIds : []);
                        const clamped = raw.filter((id) => groupSet.has(String(id)));
                        const next = clamped.length ? clamped : [String(meUid)];
                        setSelectedIds(next);
                        setSelectionReady(true);
                        return;
                    }

                    const next = [String(meUid)];
                    setSelectedIds(next);
                    setSelectionReady(true);

                    await setDoc(
                        selectionRef,
                        {
                            scorekeeperUid: String(meUid),
                            selectedPlayerIds: next,
                            updatedAt: serverTimestamp(),
                        },
                        { merge: true }
                    );
                } catch {
                    setSelectedIds([String(meUid)]);
                    setSelectionReady(true);
                }
            },
            () => {
                setSelectedIds([String(meUid)]);
                setSelectionReady(true);
            }
        );

        return () => unsub();
    }, [selectionRef, groupIds, meUid]);

    const displayedIds = useMemo(() => {
        const groupSet = new Set((Array.isArray(groupIds) ? groupIds : []).map(String));
        const base = uniqIds(Array.isArray(selectedIds) ? selectedIds : []);
        const clamped = base.filter((id) => groupSet.has(String(id)));

        if (clamped.length) return new Set(clamped.map(String));
        if (meUid) return new Set([String(meUid)]);
        return new Set();
    }, [selectedIds, groupIds, meUid]);

    const displayedRows = useMemo(() => {
        if (!groupRowsSorted.length) return [];
        const set = displayedIds;
        return groupRowsSorted.filter((p) => set.has(String(p._pid)));
    }, [groupRowsSorted, displayedIds]);

    // Persist selection immediately on toggle
    const toggleSelected = useCallback(
        async (pid) => {
            const id = String(pid);
            const groupSet = new Set((Array.isArray(groupIds) ? groupIds : []).map(String));
            if (!groupSet.has(id)) return;

            setSelectedIds((prev) => {
                const cur = uniqIds(Array.isArray(prev) ? prev : []);
                const set = new Set(cur.map(String));
                if (set.has(id)) set.delete(id);
                else set.add(id);

                const next = Array.from(set);

                if (!next.length && meUid) return [String(meUid)];
                return next;
            });

            if (!selectionRef) return;
            try {
                const cur = uniqIds(Array.isArray(selectedIds) ? selectedIds : []);
                const set = new Set(cur.map(String));
                if (set.has(id)) set.delete(id);
                else set.add(id);

                let next = Array.from(set).filter((x) => groupSet.has(String(x)));
                if (!next.length && meUid) next = [String(meUid)];

                await setDoc(
                    selectionRef,
                    {
                        scorekeeperUid: String(meUid),
                        selectedPlayerIds: next,
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch { }
        },
        [groupIds, meUid, selectionRef, selectedIds]
    );

    // Subscribe to all scores for this round (GLOBAL rounds/{roundId}/scores)
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

    // Prefill inputs from Firestore whenever hole changes OR selection changes OR scores update
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

            nextInputs[pid] = {
                strokes: hasStrokes ? strokes : 0,
                putts: hasPutts ? putts : 0,
                _hasPuttsSaved: hasPutts,
            };
        }

        setInputs(nextInputs);
    }, [displayedRows, scoresByPid, holeNumber]);

    function setPlayerField(pid, field, value) {
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[pid] || { strokes: 0, putts: 0 };
            const v = Number(value);
            next[pid] = {
                ...cur,
                [field]: Number.isFinite(v) ? v : 0,
                ...(field === "putts" ? { _hasPuttsSaved: true } : null),
            };
            return next;
        });
    }

    const openPicker = (pid, field) => {
        Keyboard.dismiss();

        const current = inputs?.[String(pid)] || {};
        const curVal = field === "putts" ? toInt(current.putts) : toInt(current.strokes);

        setPickPid(String(pid));
        setPickField(field);

        if (field === "putts") {
            const v = Math.max(0, Math.min(10, curVal || 0));
            setPickValue(v);
        } else {
            const v = Math.max(1, Math.min(10, curVal || 1));
            setPickValue(v);
        }

        setPickOpen(true);

        requestAnimationFrame(() => {
            try {
                if (field === "putts") {
                    const v = Math.max(0, Math.min(10, curVal || 0));
                    const idx = Math.max(0, PUTTS.indexOf(v));
                    puttsRef.current?.scrollTo?.({ y: idx * ROW_H, animated: false });
                } else {
                    const v = Math.max(1, Math.min(10, curVal || 1));
                    const idx = Math.max(0, STROKES.indexOf(v));
                    strokesRef.current?.scrollTo?.({ y: idx * ROW_H, animated: false });
                }
            } catch { }
        });
    };

    const closePicker = () => {
        setPickOpen(false);
        setPickPid("");
    };

    const snapIndex = (y) => Math.round(Math.max(0, y) / ROW_H);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const onPickEnd = (e) => {
        const y = e?.nativeEvent?.contentOffset?.y || 0;
        if (pickField === "putts") {
            const idx = clamp(snapIndex(y), 0, PUTTS.length - 1);
            setPickValue(PUTTS[idx]);
        } else {
            const idx = clamp(snapIndex(y), 0, STROKES.length - 1);
            setPickValue(STROKES[idx]);
        }
    };

    const onPickSet = () => {
        if (!pickPid) {
            closePicker();
            return;
        }
        setPlayerField(pickPid, pickField, Number(pickValue));
        closePicker();
    };

    const onPressSaveNext = useCallback(async () => {
        if (!roundId) {
            Alert.alert("Missing round", "No roundId was provided.");
            return;
        }

        if (!displayedRows.length) {
            Alert.alert("No players loaded", "No group players found yet.");
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

                const hasPutts = val?._hasPuttsSaved === true;

                if (strokes <= 0) continue;

                const scoreDocRef = doc(db, "rounds", String(roundId), "scores", String(pid));

                const payload = {
                    roundId: String(roundId),
                    tournamentId: String(tournamentId || ""),
                    roundNumber: Number(roundNumber || 1),
                    playerId: String(pid),
                    playerName: p._name,
                    updatedAt: serverTimestamp(),
                    holes: {
                        [String(holeNumber)]: {
                            holeNumber: Number(holeNumber),
                            strokes: Number(strokes),
                            ...(hasPutts ? { putts: Number.isFinite(Number(putts)) ? Number(putts) : 0 } : null),
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
                navigation.replace(ROUTES.TOURNAMENT_HOLE_VIEW, {
                    ...params,
                    tournamentId,
                    roundId,
                    roundNumber,
                    holeNumber: Math.min(totalHoles, holeNumber),
                    hole: Math.min(totalHoles, holeNumber),
                    totalHoles,
                    showFormatSplash: false,
                });
                return;
            }

            navigation.replace(ROUTES.TOURNAMENT_HOLE_VIEW, {
                ...params,
                tournamentId,
                roundId,
                roundNumber,
                holeNumber: nextHole,
                hole: nextHole,
                totalHoles,
                showFormatSplash: false,
            });
        } catch {
            Alert.alert("Save failed", "Could not save scores. Please try again.");
        } finally {
            setSaving(false);
        }
    }, [
        roundId,
        tournamentId,
        roundNumber,
        holeNumber,
        totalHoles,
        inputs,
        displayedRows,
        navigation,
        params,
        meUid,
    ]);

    const selectCountLabel = useMemo(() => {
        if (!selectionReady) return "Loading…";
        const n = displayedRows.length;
        return `${n} ${n === 1 ? "player" : "players"}`;
    }, [displayedRows.length, selectionReady]);

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={title}
                subtitle={"Tap a box to pick a value."}
                safeTop={false}
                rightLabel={null}
                onRightPress={null}
            />

            <View style={styles.body}>
                <View style={styles.topBar}>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>Round {roundNumber}</Text>
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

                        return (
                            <View style={styles.playerCard}>
                                <Text style={styles.playerName}>{item._name}</Text>

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
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>Loading…</Text>
                            <Text style={styles.emptySub}>Waiting for your round group and your selection to load.</Text>
                        </View>
                    }
                />
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <Pressable onPress={onPressSaveNext} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && { opacity: 0.7 }]}>
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save • Next Hole"}</Text>
                </Pressable>

                <Text style={styles.microNote}>scores: rounds/{`{roundId}`}/scores/{`{playerId}`}</Text>
                <Text style={styles.microNote}>selection: tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/scorekeepers/{`{myUid}`}</Text>
            </View>

            {/* selection modal */}
            <Modal visible={selectOpen} animationType="slide" transparent onRequestClose={() => setSelectOpen(false)}>
                <View style={styles.modalBackdrop}>
                    <View style={styles.selCard}>
                        <View style={styles.selHeader}>
                            <Text style={styles.selTitle}>Who are you scoring for?</Text>
                            <Pressable onPress={() => setSelectOpen(false)} style={({ pressed }) => [styles.selDone, pressed && styles.pressed]}>
                                <Text style={styles.selDoneText}>Done</Text>
                            </Pressable>
                        </View>

                        <Text style={styles.selSub}>This selection carries forward hole-to-hole for this round.</Text>

                        <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
                            {groupRowsSorted.length ? (
                                groupRowsSorted.map((p) => {
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
                                    <Text style={styles.modalEmptyText}>No group players found yet.</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* picker modal */}
            <Modal visible={pickOpen} transparent animationType="fade" onRequestClose={closePicker}>
                <Pressable style={styles.pickerBackdrop} onPress={closePicker} />
                <View style={[styles.pickerCard, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                    <View style={styles.pickerHeader}>
                        <Pressable onPress={closePicker} style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}>
                            <Text style={styles.pickerBtnText}>Cancel</Text>
                        </Pressable>

                        <Text style={styles.pickerTitle}>{pickField === "putts" ? "Putts" : "Strokes"}</Text>

                        <Pressable onPress={onPickSet} style={({ pressed }) => [styles.pickerBtn, pressed && styles.pressed]}>
                            <Text style={[styles.pickerBtnText, styles.pickerBtnTextSet]}>Set</Text>
                        </Pressable>
                    </View>

                    <View style={styles.wheelWrap}>
                        <ScrollView
                            ref={pickField === "putts" ? puttsRef : strokesRef}
                            showsVerticalScrollIndicator={false}
                            snapToInterval={ROW_H}
                            decelerationRate="fast"
                            contentContainerStyle={{ paddingVertical: PAD }}
                            onMomentumScrollEnd={onPickEnd}
                            onScrollEndDrag={onPickEnd}
                        >
                            {(pickField === "putts" ? PUTTS : STROKES).map((n) => (
                                <View key={`n-${n}`} style={[styles.wheelRow, { height: ROW_H }]}>
                                    <Text style={styles.wheelText}>{String(n)}</Text>
                                </View>
                            ))}
                        </ScrollView>
                        <View style={[styles.wheelSelection, { height: ROW_H }]} pointerEvents="none" />
                    </View>

                    <View style={styles.previewPill}>
                        <Text style={styles.previewText}>Selected: {String(pickValue)}</Text>
                    </View>
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
    playerName: { color: WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },

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

    emptyCard: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 22,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    emptyTitle: { color: WHITE, fontWeight: "900", fontSize: 15 },
    emptySub: {
        marginTop: 8,
        color: "rgba(255,255,255,0.72)",
        fontWeight: "800",
        fontSize: 12,
        lineHeight: 17,
    },

    footer: {
        paddingTop: 10,
        paddingHorizontal: 16,
        backgroundColor: BG,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
    },
    saveBtn: {
        height: 56,
        borderRadius: 999,
        backgroundColor: GREEN,
        alignItems: "center",
        justifyContent: "center",
    },
    saveBtnText: { color: GREEN_TEXT, fontSize: 17, fontWeight: "900" },
    microNote: { marginTop: 6, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10, letterSpacing: 0.2 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    // selection modal
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.60)",
        paddingHorizontal: 14,
        justifyContent: "flex-end",
    },
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
    selSub: {
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: 10,
        color: "rgba(255,255,255,0.70)",
        fontWeight: "800",
        fontSize: 12,
        lineHeight: 16,
    },
    selRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    selDotOuter: {
        width: 22,
        height: 22,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.25)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    selDotOuterOn: {
        borderColor: "rgba(46,204,113,0.55)",
    },
    selDotInner: {
        width: 12,
        height: 12,
        borderRadius: 999,
        backgroundColor: GREEN,
        opacity: 0,
    },
    selName: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },

    modalEmpty: { paddingHorizontal: 14, paddingVertical: 18 },
    modalEmptyText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },

    // picker modal
    pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.60)" },
    pickerCard: {
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
    pickerHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 10,
    },
    pickerTitle: { color: WHITE, fontWeight: "900", fontSize: 15, letterSpacing: 0.2 },
    pickerBtn: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
    },
    pickerBtnText: { color: "rgba(255,255,255,0.82)", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
    pickerBtnTextSet: { color: WHITE },

    wheelWrap: {
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(0,0,0,0.20)",
        overflow: "hidden",
        height: 40 * 5,
    },
    wheelRow: { alignItems: "center", justifyContent: "center" },
    wheelText: { color: WHITE, fontSize: 18, fontWeight: "900", letterSpacing: 0.2 },
    wheelSelection: {
        position: "absolute",
        left: 10,
        right: 10,
        top: (40 * 5) / 2 - 40 / 2,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.45)",
        backgroundColor: "rgba(46,204,113,0.10)",
    },

    previewPill: {
        marginTop: 12,
        borderRadius: 999,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(46,204,113,0.12)",
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.22)",
    },
    previewText: { color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },
});
