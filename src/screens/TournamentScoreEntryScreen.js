// src/screens/TournamentScoreEntryScreen.js
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
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { db, auth } from "../firebase/firebase";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { pickTournamentNavParams, assertTournamentNavParams } from "../utils/tournamentNav";

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

function normalizeSideKey(x) {
    return String(x || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function claimLabelForKey(k) {
    const kk = normalizeSideKey(k);
    if (kk === "kp") return "KP";
    if (kk === "second_shot_kp") return "SECOND SHOT KP";
    if (kk === "long_drive") return "LONG DRIVE";
    return "FORMAT";
}

function claimTheme(k) {
    const kk = normalizeSideKey(k);
    if (kk === "kp") return { accent: "#5AD7FF", bg: "rgba(90,215,255,0.12)", border: "rgba(90,215,255,0.34)", icon: "target" };
    if (kk === "second_shot_kp") return { accent: "#9D7BFF", bg: "rgba(157,123,255,0.12)", border: "rgba(157,123,255,0.34)", icon: "target-variant" };
    if (kk === "long_drive") return { accent: "#B8F37A", bg: "rgba(184,243,122,0.12)", border: "rgba(184,243,122,0.34)", icon: "golf" };
    return { accent: YELLOW, bg: "rgba(242,201,76,0.10)", border: "rgba(242,201,76,0.28)", icon: "star-four-points" };
}

function isClaimableHoleFormat(sideKeyRaw) {
    const k = normalizeSideKey(sideKeyRaw);
    return k === "kp" || k === "second_shot_kp" || k === "long_drive";
}

function NumberChip({ n, active, onPress }) {
    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.numChip, active && styles.numChipOn, pressed && styles.pressed]}>
            <Text style={[styles.numChipText, active && styles.numChipTextOn]}>{String(n)}</Text>
        </Pressable>
    );
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

    const sideGameKeyRaw = params?.sideGameKey || null;
    const sideGameKey = useMemo(() => (sideGameKeyRaw ? normalizeSideKey(sideGameKeyRaw) : ""), [sideGameKeyRaw]);
    const claimable = useMemo(() => isClaimableHoleFormat(sideGameKey), [sideGameKey]);

    const roundId = useMemo(() => {
        const p = String(params?.roundId || "").trim();
        if (p) return p;
        return defaultRoundId(tournamentId, roundNumber);
    }, [params?.roundId, tournamentId, roundNumber]);

    // contract (dev-only logging) — allow roundId to be derived
    assertTournamentNavParams({ ...params, roundId }, "TournamentScoreEntryScreen");

    const holeMeta = useMemo(() => {
        return params?.holeMeta && typeof params.holeMeta === "object" ? params.holeMeta : buildDefaultHoleMeta();
    }, [params?.holeMeta]);

    const par = holeMeta?.[String(holeNumber)]?.par ?? 4;
    const title = `HOLE ${holeNumber} • PAR ${par}`;

    const [players, setPlayers] = useState(() => {
        const p = params?.players;
        return Array.isArray(p) ? p : [];
    });

    // This is the "default group" we infer from Firestore groups (the group that contains me).
    // IMPORTANT: this does NOT limit who you can select; selection list should include ALL members.
    const [myGroupIds, setMyGroupIds] = useState(() => {
        const fromParams = Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds.map(String) : null;
        return fromParams && fromParams.length ? uniqIds(fromParams) : [];
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

    // All eligible ids = ALL tournament members we know about (this fixes “only 2 of 4 selectable”).
    const eligibleIds = useMemo(() => {
        const ids = uniqIds(allRowsSorted.map((p) => String(p._pid)));
        return ids;
    }, [allRowsSorted]);

    const eligibleSet = useMemo(() => new Set(eligibleIds.map(String)), [eligibleIds]);

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

    // Subscribe to universal groups for this round and compute "my default group".
    // NOTE: this does NOT restrict selection list; it only influences the default selection.
    useEffect(() => {
        if (!tournamentId) return;
        if (!meUid) return;

        const me = String(meUid);

        const qy = query(
            collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "groups"),
            orderBy("orderIndex", "asc")
        );

        const unsub = onSnapshot(
            qy,
            (snap) => {
                const docs = snap?.docs || [];

                // If any group contains me, use that group's ids as "myGroupIds".
                for (const d of docs) {
                    const data = d.data ? d.data() : null;
                    const ids = uniqIds(Array.isArray(data?.playerIds) ? data.playerIds.map(String) : []);
                    if (ids.includes(me)) {
                        setMyGroupIds((prev) => {
                            const prevIds = uniqIds(Array.isArray(prev) ? prev : []).map(String);
                            const nextIds = uniqIds(ids).map(String);
                            if (prevIds.length === nextIds.length && prevIds.every((x, i) => x === nextIds[i])) return prev;
                            return nextIds;
                        });
                        return;
                    }
                }

                // No group includes me -> keep whatever we had (or empty)
                setMyGroupIds((prev) => {
                    const prevIds = uniqIds(Array.isArray(prev) ? prev : []).map(String);
                    if (!prevIds.length) return [];
                    return prevIds;
                });
            },
            () => { }
        );

        return () => unsub();
    }, [tournamentId, roundKey, meUid]);

    const selectionRef = useMemo(() => {
        if (!tournamentId || !meUid) return null;
        return doc(db, "tournaments", String(tournamentId), "rounds", roundKey, "scorekeepers", String(meUid));
    }, [tournamentId, roundKey, meUid]);

    // Load / persist who this scorekeeper is scoring for.
    // Clamp to eligibleIds (ALL members), not a smaller group.
    useEffect(() => {
        if (!selectionRef) return;
        if (!meUid) return;
        if (!eligibleIds.length) return;

        setSelectionReady(false);

        const defaultIds = (() => {
            const clampedGroup = uniqIds(myGroupIds).map(String).filter((id) => eligibleSet.has(String(id)));
            if (clampedGroup.length) return clampedGroup;
            return [String(meUid)];
        })();

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
    }, [selectionRef, meUid, eligibleIds, eligibleSet, myGroupIds]);

    const displayedIds = useMemo(() => {
        const base = uniqIds(Array.isArray(selectedIds) ? selectedIds : []).map(String);
        const clamped = base.filter((id) => eligibleSet.has(String(id)));

        if (clamped.length) return new Set(clamped.map(String));

        const fallbackGroup = uniqIds(myGroupIds).map(String).filter((id) => eligibleSet.has(String(id)));
        if (fallbackGroup.length) return new Set(fallbackGroup.map(String));

        if (meUid) return new Set([String(meUid)]);
        return new Set();
    }, [selectedIds, eligibleSet, myGroupIds, meUid]);

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
                if (!next.length && meUid) next = [String(meUid)];
                return next;
            });

            if (!selectionRef) return;

            try {
                const cur = uniqIds(Array.isArray(selectedIds) ? selectedIds : []).map(String).filter((x) => eligibleSet.has(String(x)));
                const set = new Set(cur);
                if (set.has(id)) set.delete(id);
                else set.add(id);

                let next = Array.from(set);
                if (!next.length && meUid) next = [String(meUid)];

                await setDoc(selectionRef, { scorekeeperUid: String(meUid), selectedPlayerIds: next, updatedAt: serverTimestamp() }, { merge: true });
            } catch { }
        },
        [eligibleSet, selectionRef, selectedIds, meUid]
    );

    // Subscribe to all scores for this round
    useEffect(() => {
        if (!tournamentId) return;
        if (!roundKey) return;

        const scoresRef = collection(db, "tournaments", String(tournamentId), "rounds", String(roundKey), "scores");

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
    }, [tournamentId, roundKey]);

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

    // Claim snapshot (single holder for this hole+format)
    const [claimDoc, setClaimDoc] = useState(null);

    const claimRef = useMemo(() => {
        if (!tournamentId) return null;
        if (!claimable) return null;
        const docId = `${String(sideGameKey)}_h${String(holeNumber)}`;
        return doc(db, "tournaments", String(tournamentId), "rounds", String(roundKey), "formatClaims", String(docId));
    }, [tournamentId, roundKey, sideGameKey, holeNumber, claimable]);

    useEffect(() => {
        if (!claimRef) {
            setClaimDoc(null);
            return;
        }
        const unsub = onSnapshot(
            claimRef,
            (snap) => setClaimDoc(snap?.exists?.() ? (snap.data() || null) : null),
            () => setClaimDoc(null)
        );
        return () => unsub();
    }, [claimRef]);

    const holderPid = String(claimDoc?.claimedByPlayerId || "");
    const holderName = String(claimDoc?.claimedByPlayerName || "");

    const canClaimForPid = useCallback(
        (pid) => {
            const docData = scoresByPid?.[String(pid)] || {};
            const holes = docData?.holes || {};
            const h = holes?.[String(holeNumber)] || {};
            const strokes = toInt(h?.strokes);
            return strokes > 0;
        },
        [scoresByPid, holeNumber]
    );

    const [claimOpen, setClaimOpen] = useState(false);
    const [claimPid, setClaimPid] = useState("");
    const [claimName, setClaimName] = useState("");

    const theme = useMemo(() => claimTheme(sideGameKey), [sideGameKey]);
    const claimTitle = useMemo(() => claimLabelForKey(sideGameKey), [sideGameKey]);

    const openClaim = useCallback(
        (pid, name) => {
            setClaimPid(String(pid));
            setClaimName(String(name || "Player"));
            setClaimOpen(true);
        },
        []
    );

    const closeClaim = useCallback(() => {
        setClaimOpen(false);
        setClaimPid("");
        setClaimName("");
    }, []);

    const saveClaim = useCallback(async () => {
        if (!claimRef) return;
        if (!claimPid) return;

        const pid = String(claimPid);
        const name = String(claimName || "Player");

        // overwrite allowed (simple for now)
        try {
            await setDoc(
                claimRef,
                {
                    tournamentId: String(tournamentId),
                    roundNumber: Number(roundNumber),
                    holeNumber: Number(holeNumber),
                    formatKey: String(sideGameKey),
                    claimedByPlayerId: pid,
                    claimedByPlayerName: name,
                    status: "claimed",
                    claimedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    updatedByUid: String(meUid || ""),
                },
                { merge: true }
            );
            closeClaim();
            Alert.alert("Claim saved", `${claimTitle} claimed for ${name}.`);
        } catch {
            Alert.alert("Claim failed", "Could not save the claim. Please try again.");
        }
    }, [claimRef, claimPid, claimName, tournamentId, roundNumber, holeNumber, sideGameKey, meUid, closeClaim, claimTitle]);

    const onPressSaveNext = useCallback(async () => {
        if (!tournamentId) {
            Alert.alert("Missing tournament", "No tournamentId was provided.");
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

                const scoreDocRef = doc(
                    db,
                    "tournaments",
                    String(tournamentId),
                    "rounds",
                    `r${String(roundNumber)}`,
                    "scores",
                    String(pid)
                );

                const payload = {
                    roundId: String(roundId || ""),
                    tournamentId: String(tournamentId || ""),
                    roundNumber: Number(roundNumber || 1),
                    playerId: String(pid),
                    playerName: p._name,
                    updatedAt: serverTimestamp(),
                    holes: {
                        [String(holeNumber)]: {
                            holeNumber: Number(holeNumber),
                            strokes: Number(strokes),
                            putts: Number.isFinite(Number(putts)) ? Number(Math.max(0, Math.min(10, putts))) : 0,
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
                    ...pickTournamentNavParams(params),
                    ...params,
                    tournamentId,
                    roundId,
                    roundNumber,
                    holeNumber: Math.min(totalHoles, holeNumber),
                    hole: Math.min(totalHoles, holeNumber),
                    totalHoles,
                    groupPlayerIds: Array.from(displayedIds || []),
                    showFormatSplash: false,
                });
                return;
            }

            navigation.replace(ROUTES.TOURNAMENT_HOLE_VIEW, {
                ...pickTournamentNavParams(params),
                ...params,
                tournamentId,
                roundId,
                roundNumber,
                holeNumber: nextHole,
                hole: nextHole,
                totalHoles,
                groupPlayerIds: Array.from(displayedIds || []),
                showFormatSplash: false,
            });
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[LegacyGolf] TournamentScoreEntry save failed:", e);
            const msg = e?.message || e?.code || "Could not save scores. Please try again.";
            Alert.alert("Save failed", String(msg));
        } finally {
            setSaving(false);
        }
    }, [roundId, tournamentId, roundNumber, holeNumber, totalHoles, inputs, displayedRows, displayedIds, navigation, params, meUid]);

    const selectCountLabel = useMemo(() => {
        if (!selectionReady) return "Loading…";
        const n = displayedRows.length;
        return `${n} ${n === 1 ? "player" : "players"}`;
    }, [displayedRows.length, selectionReady]);

    const pickTitle = useMemo(() => (pickField === "putts" ? "Putts" : "Strokes"), [pickField]);
    const pickNumbers = useMemo(() => (pickField === "putts" ? PUTTS : STROKES), [pickField, PUTTS, STROKES]);

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
                            { text: "Exit", style: "destructive", onPress: () => navigation.navigate(ROUTES.HOME) },
                        ]
                    );
                }}
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

                {claimable ? (
                    <View style={[styles.claimBanner, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <MaterialCommunityIcons name={theme.icon} size={16} color={theme.accent} />
                            <Text style={styles.claimBannerText}>{claimTitle} • CLAIM ON THIS HOLE</Text>
                        </View>
                        <Text style={styles.claimBannerSub}>
                            {holderPid ? `Current holder: ${holderName || "Player"}` : "Unclaimed"}
                        </Text>
                    </View>
                ) : null}

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

                        const savedOk = canClaimForPid(pid);
                        const isHolder = claimable && holderPid && holderPid === pid;
                        const hasHolder = claimable && !!holderPid;

                        const claimDisabled = !claimable || !savedOk;

                        return (
                            <View style={styles.playerCard}>
                                <View style={styles.playerTopRow}>
                                    <Text style={styles.playerName}>{item._name}</Text>

                                    {claimable ? (
                                        <Pressable
                                            onPress={() => {
                                                if (claimDisabled) {
                                                    Alert.alert("Enter strokes first", "Save strokes for this player on this hole before claiming.");
                                                    return;
                                                }

                                                if (hasHolder && !isHolder) {
                                                    Alert.alert(
                                                        "Overwrite claim?",
                                                        `Current holder is ${holderName || "Player"}. Claim for ${item._name}?`,
                                                        [
                                                            { text: "Cancel", style: "cancel" },
                                                            { text: "Claim", style: "default", onPress: () => openClaim(pid, item._name) },
                                                        ]
                                                    );
                                                    return;
                                                }

                                                openClaim(pid, item._name);
                                            }}
                                            style={({ pressed }) => [
                                                styles.claimBtn,
                                                { borderColor: theme.border, backgroundColor: theme.bg },
                                                claimDisabled && { opacity: 0.55 },
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <MaterialCommunityIcons
                                                name={isHolder ? "check-circle" : theme.icon}
                                                size={16}
                                                color={isHolder ? GREEN : theme.accent}
                                            />
                                            <Text style={[styles.claimBtnText, { color: isHolder ? GREEN : WHITE }]}>
                                                {isHolder ? "Claimed" : "Claim"}
                                            </Text>
                                        </Pressable>
                                    ) : null}
                                </View>

                                {claimable && hasHolder ? (
                                    <Text style={styles.holderLine}>
                                        Holder: {holderName || "Player"}
                                    </Text>
                                ) : null}

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
                            <Text style={styles.emptySub}>Waiting for players and your selection to load.</Text>
                        </View>
                    }
                />
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <Pressable onPress={onPressSaveNext} disabled={saving} style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && { opacity: 0.7 }]}>
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save • Next Hole"}</Text>
                </Pressable>

                <Text style={styles.microNote}>scores: tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/scores/{`{playerId}`}</Text>
                <Text style={styles.microNote}>claims: tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/formatClaims/{`{formatKey}_h{holeNumber}`}</Text>
                <Text style={styles.microNote}>selection: tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/scorekeepers/{`{myUid}`}</Text>
            </View>

            <Modal visible={claimOpen} animationType="fade" transparent onRequestClose={closeClaim}>
                <View style={styles.claimModalOverlay}>
                    <View style={[styles.claimModalCard, { borderColor: theme.border }]}>
                        <View style={styles.claimModalTop}>
                            <View style={[styles.claimModalIcon, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                                <MaterialCommunityIcons name={theme.icon} size={18} color={theme.accent} />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.claimModalTitle}>{claimTitle} • HOLE {holeNumber}</Text>
                                <Text style={styles.claimModalSub} numberOfLines={1}>
                                    {holderPid ? `Current holder: ${holderName || "Player"}` : "Currently unclaimed"}
                                </Text>
                            </View>

                            <Pressable onPress={closeClaim} style={({ pressed }) => [styles.claimModalClose, pressed && styles.pressed]}>
                                <Text style={styles.claimModalCloseText}>Close</Text>
                            </Pressable>
                        </View>

                        <View style={styles.claimModalDivider} />

                        <View style={styles.claimModalBody}>
                            <Text style={styles.claimModalBig}>Claim for</Text>
                            <Text style={styles.claimModalName}>{claimName || "Player"}</Text>

                            <Pressable onPress={saveClaim} style={({ pressed }) => [styles.claimModalBtn, pressed && styles.pressed]}>
                                <Text style={styles.claimModalBtnText}>Confirm claim</Text>
                            </Pressable>

                            <Pressable onPress={closeClaim} style={({ pressed }) => [styles.claimModalBtn2, pressed && styles.pressed]}>
                                <Text style={styles.claimModalBtn2Text}>Cancel</Text>
                            </Pressable>

                            <Text style={styles.claimModalNote}>
                                Claim becomes the current holder shown on the format splash screen next.
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>

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

    claimBanner: {
        borderRadius: 18,
        borderWidth: 1,
        padding: 12,
        marginBottom: 10,
    },
    claimBannerText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
    claimBannerSub: { marginTop: 6, color: "rgba(255,255,255,0.78)", fontWeight: "800", fontSize: 12 },

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

    claimBtn: {
        height: 34,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    claimBtnText: { fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    holderLine: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12 },

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

    // Claim modal
    claimModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.60)", alignItems: "center", justifyContent: "center", padding: 16 },
    claimModalCard: { width: "100%", maxWidth: 520, borderRadius: 24, backgroundColor: "rgba(18,22,30,0.97)", borderWidth: 2, padding: 14 },
    claimModalTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    claimModalIcon: { width: 36, height: 36, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    claimModalTitle: { color: WHITE, fontWeight: "900", fontSize: 15 },
    claimModalSub: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 12 },
    claimModalClose: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    claimModalCloseText: { color: WHITE, fontWeight: "900", fontSize: 12 },
    claimModalDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 12, marginBottom: 12 },
    claimModalBody: { alignItems: "center" },
    claimModalBig: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
    claimModalName: { marginTop: 10, color: WHITE, fontWeight: "900", fontSize: 18, textAlign: "center" },
    claimModalBtn: { marginTop: 14, height: 52, alignSelf: "stretch", borderRadius: 18, backgroundColor: GREEN, alignItems: "center", justifyContent: "center" },
    claimModalBtnText: { color: GREEN_TEXT, fontWeight: "900", fontSize: 15 },
    claimModalBtn2: {
        marginTop: 10,
        height: 52,
        alignSelf: "stretch",
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    claimModalBtn2Text: { color: WHITE, fontWeight: "900", fontSize: 15 },
    claimModalNote: { marginTop: 10, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 12, textAlign: "center", lineHeight: 16 },

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
