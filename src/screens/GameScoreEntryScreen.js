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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions, StackActions } from "@react-navigation/native";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import theme from "../theme";
import { auth, db } from "../firebase/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from "firebase/firestore";

const BG = "#0B1220";
const CARD = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const GREEN = "#2ECC71";
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

function defaultTrackStatsForPlayer() {
    // Regular games: default Stats OFF for all players.
    return false;
}

function defaultSelectedStats() {
    return {
        putts: false,
        fairway: false,
        green: false,
        sandSave: false,
        updown: false,
        penalties: false,
        driveDistance: false,
    };
}

function getRequiredStatsFlags({ puttingContestActive, bbActive }) {
    return {
        putts: !!puttingContestActive,
        fairway: !!bbActive,
        green: !!bbActive,
        sandSave: false,
        updown: false,
        penalties: false,
        driveDistance: false,
    };
}

function Seg3({ value, onChange, allowNA = true }) {
    const opts = allowNA
        ? [
            { k: "yes", t: "Yes" },
            { k: "no", t: "No" },
            { k: "na", t: "N/A" },
        ]
        : [
            { k: "yes", t: "Yes" },
            { k: "no", t: "No" },
        ];

    return (
        <View style={styles.segWrap}>
            {opts.map((o) => {
                const active = value === o.k;
                return (
                    <Pressable
                        key={o.k}
                        onPress={() => onChange(o.k)}
                        style={({ pressed }) => [styles.segBtn, active && styles.segBtnActive, pressed && styles.pressed]}
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

function isSharedRoundId(roundId) {
    return String(roundId || "").startsWith("sr_");
}

function roundDocRef(roundId) {
    const rid = String(roundId || "").trim();
    const uid = auth?.currentUser?.uid || null;
    if (!rid) return null;

    if (isSharedRoundId(rid)) {
        return doc(db, "sharedRounds", rid);
    }

    if (!uid) return null;
    return doc(db, "users", String(uid), "rounds", rid);
}

function claimDocRef(roundId, docId) {
    const rid = String(roundId || "").trim();
    const uid = auth?.currentUser?.uid || null;
    if (!rid) return null;

    if (isSharedRoundId(rid)) {
        return doc(db, "sharedRounds", rid, "formatClaims", String(docId));
    }

    if (!uid) return null;
    return doc(db, "users", String(uid), "rounds", rid, "formatClaims", String(docId));
}

function rebuildBirdieBucketsState(state) {
    const formatsSelected = Array.isArray(state?.formatsSelected) ? state.formatsSelected : [];

    const bbFound = formatsSelected.find((x) => {
        const k = typeof x === "string" ? x : x?.key || x?.id || "";
        const n = typeof x === "string" ? x : x?.name || x?.label || x?.title || "";
        const s = `${String(k || "")} ${String(n || "")}`.toLowerCase();
        return s.includes("birdie") && s.includes("bucket");
    });

    const bbKey = bbFound
        ? (typeof bbFound === "string" ? String(bbFound) : String(bbFound?.key || bbFound?.id || ""))
        : "";

    const pools = state && typeof state === "object" ? (state.formatPools || {}) : {};
    const bbPool = pools && typeof pools === "object" ? (bbKey ? pools[bbKey] || {} : {}) : {};
    const perEvent = Number(bbPool?.entryFee);

    const mode = String(state?.wagers?.birdieBuckets?.mode || "hits_pay_all").trim();
    const safeMode = mode === "misses_pay" ? "misses_pay" : "hits_pay_all";

    if (!bbKey || !Number.isFinite(perEvent) || perEvent <= 0) {
        return null;
    }

    const holeMeta = state?.meta?.holeMeta && typeof state.meta.holeMeta === "object"
        ? state.meta.holeMeta
        : buildDefaultHoleMeta();

    const roundBasis = String(state?.scoringMode || state?.scoring || "net").toLowerCase();
    const useNet = roundBasis === "net";

    const rawPlayers = Array.isArray(state?.players) ? state.players : [];
    const playersBB = rawPlayers
        .map((p, idx) => ({
            pid: String(p?.id || p?.uid || p?.playerId || `p${idx + 1}`),
            name: String(p?.name || p?.displayName || p?.fullName || `Player ${idx + 1}`).trim() || `Player ${idx + 1}`,
            handicap: Number(p?.handicap ?? 0),
        }))
        .filter((x) => x.pid);

    const holesCount = Number(state?.holesCount);
    const holesSide = String(state?.holesSide || "").toLowerCase();
    const startH = holesCount === 9 && holesSide === "back" ? 10 : 1;
    const endH = holesCount === 9 ? (startH === 10 ? 18 : 9) : 18;

    function holeStrokeIndex(h) {
        const hm = holeMeta && typeof holeMeta === "object" ? (holeMeta[String(h)] || holeMeta[h] || {}) : {};
        const siRaw = hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? hm?.handicap ?? null;
        const si = Number(siRaw);
        return Number.isFinite(si) ? si : null;
    }

    function strokesReceived(hcp, strokeIndex) {
        const h = Math.max(0, Math.floor(Number(hcp) || 0));
        if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return 0;
        const base = Math.floor(h / 18);
        const extra = h % 18;
        return base + (strokeIndex <= extra ? 1 : 0);
    }

    const savedHoles = state?.holes && typeof state.holes === "object" ? state.holes : {};
    const holesOut = {};
    let pot = 0;
    let lastHole = null;
    let lastWin = null;

    for (let holeNum = startH; holeNum <= endH; holeNum++) {
        const parNow = Number(holeMeta?.[String(holeNum)]?.par ?? 4);
        const isPar3 = parNow === 3;
        const siNow = holeStrokeIndex(holeNum);

        const chargeEvents = [];

        if (safeMode === "misses_pay") {
            playersBB.forEach((p) => {
                const fairway = String(savedHoles?.[String(holeNum)]?.players?.[String(p.pid)]?.fairway || "na");
                const green = String(savedHoles?.[String(holeNum)]?.players?.[String(p.pid)]?.green || "na");

                if (!isPar3 && fairway === "no") {
                    chargeEvents.push({
                        hole: holeNum,
                        payerPid: p.pid,
                        payerName: p.name,
                        amount: perEvent,
                        reason: "FIR_MISS",
                    });
                }

                if (green === "no") {
                    chargeEvents.push({
                        hole: holeNum,
                        payerPid: p.pid,
                        payerName: p.name,
                        amount: perEvent,
                        reason: "GIR_MISS",
                    });
                }
            });
        } else {
            playersBB.forEach((trigger) => {
                const fairway = String(savedHoles?.[String(holeNum)]?.players?.[String(trigger.pid)]?.fairway || "na");
                const green = String(savedHoles?.[String(holeNum)]?.players?.[String(trigger.pid)]?.green || "na");

                if (!isPar3 && fairway === "yes") {
                    playersBB.forEach((payer) => {
                        chargeEvents.push({
                            hole: holeNum,
                            payerPid: payer.pid,
                            payerName: payer.name,
                            amount: perEvent,
                            reason: "FIR_HIT",
                            triggerPid: trigger.pid,
                            triggerName: trigger.name,
                        });
                    });
                }

                if (green === "yes") {
                    playersBB.forEach((payer) => {
                        chargeEvents.push({
                            hole: holeNum,
                            payerPid: payer.pid,
                            payerName: payer.name,
                            amount: perEvent,
                            reason: "GIR_HIT",
                            triggerPid: trigger.pid,
                            triggerName: trigger.name,
                        });
                    });
                }
            });
        }

        const add = chargeEvents.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
        pot += add;

        const contenders = playersBB
            .map((p) => {
                const gross = toInt(savedHoles?.[String(holeNum)]?.players?.[String(p.pid)]?.strokes);
                if (gross <= 0) return null;

                const net = useNet ? (gross - strokesReceived(p.handicap, siNow)) : gross;
                const diff = net - parNow;
                return { ...p, gross, net, diff };
            })
            .filter(Boolean);

        const birdies = contenders.filter((c) => c.diff <= -1);

        let winObj = null;

        if (birdies.length === 1) {
            const winner = birdies[0];
            const paidAmount = pot;

            winObj = {
                hole: holeNum,
                winnerPid: winner.pid,
                winnerName: winner.name,
                amount: paidAmount,
                scoring: useNet ? "net" : "gross",
                birdieCount: 1,
            };

            lastWin = `${winner.name} won $${String(Math.round(paidAmount))}`;
            pot = 0;
        }

        holesOut[String(holeNum)] = {
            hole: holeNum,
            mode: safeMode,
            perEvent,
            add,
            charges: chargeEvents,
            win: winObj,
        };

        lastHole = holeNum;
    }

    return {
        key: bbKey,
        mode: safeMode,
        perEvent,
        pot,
        lastHole,
        lastWin,
        holes: holesOut,
    };
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
        sideGameKey: sideGameKeyParam,
        fixMissing,
        missingHoles,
        missingIndex,
        finishReturnHole,
    } = params;

    const holeNumber = Number(hole || 1);

    const holeMeta = useMemo(() => {
        return holeMetaParam && typeof holeMetaParam === "object" ? holeMetaParam : buildDefaultHoleMeta();
    }, [holeMetaParam]);

    const par = holeMeta?.[String(holeNumber)]?.par ?? 4;
    const title = `HOLE ${holeNumber} • PAR ${par}`;

    const normalizedPlayers = useMemo(() => {
        const list = Array.isArray(players) ? players : [];
        return list.map((p, idx) => {
            const source = p?.source || null;
            return {
                // IMPORTANT: keep player ids stable for the entire round (do NOT force to auth uid)
                id: safePlayerId(p, String(idx)),
                name: safePlayerName(p, idx),
                handicap: p?.handicap ?? 0,
                source,
                uid: p?.uid || p?.userId || null,
                email: p?.email || null,
            };
        });
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

    // Birdie Buckets enforcement (regular games)
    const [bbActive, setBbActive] = useState(false);
    const [bbFormatKey, setBbFormatKey] = useState(null);

    // Putting Contest enforcement (regular games)
    const [puttingContestActive, setPuttingContestActive] = useState(false);

    // -----------------------------
    // Regular format claim (Firestore)
    // -----------------------------
    const sideGameKey = useMemo(() => String(sideGameKeyParam || "").trim(), [sideGameKeyParam]);

    const claimable = useMemo(() => {
        const k = sideGameKey.toLowerCase();
        return k === "kp" || k === "long_drive" || k === "second_shot_kp" || k === "longdrive" || k === "secondshotkp";
    }, [sideGameKey]);

    const [claimDoc, setClaimDoc] = useState(null);

    const claimRef = useMemo(() => {
        const rid = String(roundIdParam || "").trim();
        const h = Number(holeNumber || 1);
        const k = String(sideGameKey || "").trim();

        if (!rid) return null;
        if (!claimable) return null;
        if (!k) return null;
        if (!Number.isFinite(h) || h < 1 || h > 18) return null;

        const docId = `${k}_h${String(h)}`;
        return claimDocRef(rid, docId);
    }, [roundIdParam, sideGameKey, holeNumber, claimable]);

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

    const claimStatus = useMemo(() => String(claimDoc?.status || "").trim().toLowerCase(), [claimDoc]);
    const holderPid = useMemo(() => String(claimDoc?.claimedByPlayerId || "").trim(), [claimDoc]);
    const holderName = useMemo(() => String(claimDoc?.claimedByPlayerName || "").trim(), [claimDoc]);

    const sideGameTitle = useMemo(() => {
        const k = String(sideGameKey || "").trim().toLowerCase();
        if (k === "kp") return "KP";
        if (k === "long_drive" || k === "longdrive" || k === "ld") return "Long Drive";
        if (k === "second_shot_kp" || k === "secondshotkp" || k === "2nd_kp") return "Second Shot KP";
        return "Side Game";
    }, [sideGameKey]);

    const saveClaim = useCallback(
        async (pid, name) => {
            if (!claimRef) return false;

            const meUid = String(auth?.currentUser?.uid || "");
            const claimedByPlayerId = String(pid || "").trim();
            const claimedByPlayerName = String(name || "Player").trim();

            if (!claimedByPlayerId) return false;

            try {
                await setDoc(
                    claimRef,
                    {
                        roundId: String(roundIdParam || ""),
                        holeNumber: Number(holeNumber || 1),
                        formatKey: String(sideGameKey || ""),
                        claimedByPlayerId,
                        claimedByPlayerName,
                        status: "claimed",
                        claimedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        updatedByUid: meUid,
                    },
                    { merge: true }
                );
                return true;
            } catch {
                return false;
            }
        },
        [claimRef, roundIdParam, holeNumber, sideGameKey]
    );

    const markUnclaimed = useCallback(async () => {
        if (!claimRef) return false;

        const meUid = String(auth?.currentUser?.uid || "");
        try {
            await setDoc(
                claimRef,
                {
                    roundId: String(roundIdParam || ""),
                    holeNumber: Number(holeNumber || 1),
                    formatKey: String(sideGameKey || ""),
                    status: "unclaimed",
                    claimedByPlayerId: null,
                    claimedByPlayerName: null,
                    claimedAt: null,
                    updatedAt: serverTimestamp(),
                    updatedByUid: meUid,
                },
                { merge: true }
            );
            return true;
        } catch {
            return false;
        }
    }, [claimRef, roundIdParam, holeNumber, sideGameKey]);

    const markCarryOver = useCallback(async () => {
        if (!claimRef) return false;

        const meUid = String(auth?.currentUser?.uid || "");
        try {
            await setDoc(
                claimRef,
                {
                    roundId: String(roundIdParam || ""),
                    holeNumber: Number(holeNumber || 1),
                    formatKey: String(sideGameKey || ""),
                    status: "carry_over",
                    claimedByPlayerId: null,
                    claimedByPlayerName: null,
                    claimedAt: null,
                    updatedAt: serverTimestamp(),
                    updatedByUid: meUid,
                },
                { merge: true }
            );
            return true;
        } catch {
            return false;
        }
    }, [claimRef, roundIdParam, holeNumber, sideGameKey]);

    // -----------------------------
    // Seed inputs
    // -----------------------------
    useEffect(() => {
        setInputs((prev) => {
            const next = { ...(prev || {}) };

            playerRows.forEach((p) => {
                const pid = String(p._pid);
                if (!pid) return;

                if (!next[pid]) {
                    next[pid] = {
                        trackStats: defaultTrackStatsForPlayer(),
                        selectedStats: defaultSelectedStats(),
                        strokes: 0,
                        putts: 0,
                        _hasPuttsSaved: false,
                        fairway: "na",
                        green: "na",
                        sandSave: "na",
                        updown: "na",
                        penalties: "",
                        driveDistance: "",
                    };
                }
            });

            return next;
        });
    }, [playerRows]);

    // Birdie Buckets: force Stats ON + force FIR/GIR controls to be available.
    // (User can still set Yes/No on the hole; we just ensure the toggles are visible and not disable-able.)
    useEffect(() => {
        if (!bbActive) return;

        setInputs((prev) => {
            const next = { ...(prev || {}) };

            playerRows.forEach((p) => {
                const pid = String(p._pid);
                if (!pid) return;

                const cur = next[pid] || {};
                next[pid] = {
                    ...cur,
                    trackStats: true,
                    fairway: cur?.fairway ?? "na",
                    green: cur?.green ?? "na",
                };
            });

            return next;
        });
    }, [bbActive, playerRows]);

    // Load saved hole values from Firestore round doc (SOLO or SHARED)
    useEffect(() => {
        let live = true;

        (async () => {
            const rid = String(roundIdParam || "").trim();
            const ref = roundDocRef(rid);
            if (!ref) return;

            try {
                const snap = await getDoc(ref);
                if (!live) return;
                const state = snap.exists() ? (snap.data() || {}) : null;
                if (!state) return;

                // Detect Birdie Buckets + Putting Contest selections from formatsSelected
                try {
                    const formatsSelected = Array.isArray(state?.formatsSelected) ? state?.formatsSelected : [];

                    const birdieFound = formatsSelected.find((x) => {
                        const k = typeof x === "string" ? x : x?.key || x?.id || "";
                        const n = typeof x === "string" ? x : x?.name || x?.label || x?.title || "";
                        const s = `${String(k || "")} ${String(n || "")}`.toLowerCase();
                        return s.includes("birdie") && s.includes("bucket");
                    });

                    const puttingFound = formatsSelected.find((x) => {
                        const k = typeof x === "string" ? x : x?.key || x?.id || "";
                        const n = typeof x === "string" ? x : x?.name || x?.label || x?.title || "";
                        const s = `${String(k || "")} ${String(n || "")}`.toLowerCase();
                        return s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"));
                    });

                    const fk = birdieFound
                        ? (typeof birdieFound === "string" ? String(birdieFound) : String(birdieFound?.key || birdieFound?.id || ""))
                        : "";

                    setBbActive(!!birdieFound);
                    setBbFormatKey(fk ? fk : null);
                    setPuttingContestActive(!!puttingFound);
                } catch {
                    setBbActive(false);
                    setBbFormatKey(null);
                    setPuttingContestActive(false);
                }

                const savedHole = state?.holes?.[String(holeNumber)]?.players || null;
                const roundSelectedStatsByPlayer =
                    state?.playerSelectedStats && typeof state.playerSelectedStats === "object"
                        ? state.playerSelectedStats
                        : {};

                setInputs((prev) => {
                    const next = { ...(prev || {}) };

                    playerRows.forEach((p) => {
                        const pid = String(p._pid);
                        const saved = savedHole?.[String(pid)] || null;

                        const track =
                            typeof saved?.trackStats === "boolean"
                                ? saved.trackStats
                                : typeof next?.[pid]?.trackStats === "boolean"
                                    ? next[pid].trackStats
                                    : defaultTrackStatsForPlayer();

                        const sStrokes = toInt(saved?.strokes);
                        const sPutts = toInt(saved?.putts);
                        const hasPutts = String(saved?.putts ?? "").length > 0;

                        next[pid] = {
                            ...(next[pid] || {}),
                            trackStats: !!track,
                            selectedStats: {
                                ...defaultSelectedStats(),
                                ...(roundSelectedStatsByPlayer?.[String(pid)] || saved?.selectedStats || next[pid]?.selectedStats || {}),
                            },
                            strokes: saved ? (Number.isFinite(Number(sStrokes)) ? sStrokes : 0) : (next[pid]?.strokes ?? 0),
                            putts: saved ? (Number.isFinite(Number(sPutts)) ? sPutts : 0) : (next[pid]?.putts ?? 0),
                            _hasPuttsSaved: saved ? hasPutts : (next[pid]?._hasPuttsSaved ?? false),
                            fairway: saved ? (saved?.fairway ?? next[pid]?.fairway ?? "na") : (next[pid]?.fairway ?? "na"),
                            green: saved ? (saved?.green ?? next[pid]?.green ?? "na") : (next[pid]?.green ?? "na"),
                            sandSave: saved ? (saved?.sandSave ?? next[pid]?.sandSave ?? "na") : (next[pid]?.sandSave ?? "na"),
                            updown: saved ? (saved?.updown ?? next[pid]?.updown ?? "na") : (next[pid]?.updown ?? "na"),
                            penalties: saved ? (saved?.penalties ?? next[pid]?.penalties ?? "") : (next[pid]?.penalties ?? ""),
                            driveDistance: saved ? (saved?.driveDistance ?? next[pid]?.driveDistance ?? "") : (next[pid]?.driveDistance ?? ""),
                        };
                    });

                    return next;
                });
            } catch {
                // ignore
            }
        })();

        return () => {
            live = false;
        };
    }, [roundIdParam, holeNumber, playerRows]);

    function setPlayerField(pid, field, value) {
        const id = String(pid);
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[id] || {
                trackStats: defaultTrackStatsForPlayer(),
                selectedStats: defaultSelectedStats(),
                strokes: 0,
                putts: 0,
                _hasPuttsSaved: false,
                fairway: "na",
                green: "na",
                sandSave: "na",
                updown: "na",
                penalties: "",
                driveDistance: "",
            };

            if (field === "trackStats") {
                const nextOn = !!value;

                // if turning OFF -> clear ONLY the extra stats (keep strokes/putts)
                if (!nextOn) {
                    next[id] = {
                        ...cur,
                        trackStats: false,
                        selectedStats: defaultSelectedStats(),
                        fairway: "na",
                        green: "na",
                        sandSave: "na",
                        updown: "na",
                        penalties: "",
                        driveDistance: "",
                    };
                    return next;
                }

                next[id] = {
                    ...cur,
                    trackStats: true,
                    selectedStats: cur.selectedStats || defaultSelectedStats(),
                };
                return next;
            }

            if (field === "selectedStats") {
                next[id] = {
                    ...cur,
                    selectedStats: {
                        ...defaultSelectedStats(),
                        ...(cur.selectedStats || {}),
                        ...(value || {}),
                    },
                };
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
            const rid = String(roundIdParam || "").trim();
            if (!rid) {
                Alert.alert("Round error", "Missing roundId. Please start the round again.");
                return { ok: false, roundId: null };
            }

            const ref = roundDocRef(rid);
            if (!ref) {
                Alert.alert("Round error", "Not signed in. Please sign in again.");
                return { ok: false, roundId: rid };
            }

            let state = {
                roundId: rid,
                course,
                tee,
                players: normalizedPlayers,
                holes: {},
                meta: {},
            };

            try {
                const snap = await getDoc(ref);
                if (snap.exists()) state = { ...(snap.data() || {}), roundId: rid };
            } catch {
                // ignore
            }

            state.roundId = rid;
            state.course = state.course || course;
            state.tee = state.tee || tee;
            state.courseName = state.courseName || state.course?.name || course?.name || "Course";
            state.teeName = state.teeName || state.tee?.name || tee?.name || "Tees";
            state.players = normalizedPlayers;

            if (!state.holes) state.holes = {};
            if (!state.meta) state.meta = {};
            if (holeMeta && typeof holeMeta === "object") state.meta.holeMeta = holeMeta;

            if (!state.holes[String(holeNumber)]) state.holes[String(holeNumber)] = { players: {} };
            if (!state.playerSelectedStats || typeof state.playerSelectedStats !== "object") state.playerSelectedStats = {};

            const payload = {};
            playerRows.forEach((p) => {
                const pid = String(p._pid);
                const val = inputs?.[pid] || {};
                const track = !!val.trackStats;

                const requiredStats = getRequiredStatsFlags({
                    puttingContestActive,
                    bbActive,
                });

                const selectedStats = {
                    ...defaultSelectedStats(),
                    ...(val.selectedStats || {}),
                };

                state.playerSelectedStats[String(pid)] = selectedStats;

                payload[String(pid)] = {
                    trackStats: track,
                    strokes: String(toInt(val.strokes) || ""),
                    putts: requiredStats.putts || selectedStats.putts ? String(toInt(val.putts) || "") : "",
                    fairway: requiredStats.fairway || selectedStats.fairway ? (val.fairway ?? "na") : "na",
                    green: requiredStats.green || selectedStats.green ? (val.green ?? "na") : "na",
                    sandSave: requiredStats.sandSave || selectedStats.sandSave ? (val.sandSave ?? "na") : "na",
                    updown: requiredStats.updown || selectedStats.updown ? (val.updown ?? "na") : "na",
                    penalties: requiredStats.penalties || selectedStats.penalties ? String(val.penalties ?? "") : "",
                    driveDistance: requiredStats.driveDistance || selectedStats.driveDistance ? String(val.driveDistance ?? "") : "",
                };
            });

            state.holes[String(holeNumber)].players = payload;

            state.status = "in_progress";
            state.inProgress = true;
            state.isActive = true;

            // Only advance resume hole when explicitly provided
            if (Number.isFinite(Number(opts?.resumeHole))) {
                const resumeHole = Math.max(1, Math.min(18, Number(opts.resumeHole)));
                state.currentHole = resumeHole;
                state.holeNumber = resumeHole;
                state.hole = resumeHole;
                state.holeIndex = resumeHole - 1;
            }

            const rebuiltBirdieBuckets = rebuildBirdieBucketsState(state);

            try {
                const writePayload = {
                    ...state,
                    updatedAt: serverTimestamp(),
                };

                if (rebuiltBirdieBuckets) {
                    writePayload.wagers = {
                        ...(state?.wagers && typeof state.wagers === "object" ? state.wagers : {}),
                        birdieBuckets: {
                            ...rebuiltBirdieBuckets,
                            updatedAt: serverTimestamp(),
                        },
                    };
                }

                await setDoc(ref, writePayload, { merge: true });
                return { ok: true, roundId: rid };
            } catch {
                Alert.alert("Save failed", "Could not save hole data.");
                return { ok: false, roundId: rid };
            }
        },
        [roundIdParam, course, tee, normalizedPlayers, playerRows, inputs, holeMeta, holeNumber, puttingContestActive, bbActive]
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
                    // backing out should NOT advance resume hole
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
            StackActions.replace(ROUTES.HOLE_HUB, {
                course,
                tee,
                players,
                hole: targetHole,
                holeMeta,
                roundId: roundIdParam || null,
                courseName: course?.name,
                teeName: tee?.name,
                ...extraParams,
            })
        );
    }

    async function onNextHole() {
        Keyboard.dismiss();
        if (!validateStrokesForThisHole()) return;

        const resolveHoleWindow = (r) => {
            const n1 =
                Number(r?.totalHoles) ||
                Number(r?.holesToPlay) ||
                Number(r?.holesCount) ||
                Number(r?.holeCount) ||
                Number(r?.numHoles);

            let count = Number.isFinite(n1) && n1 >= 1 && n1 <= 18 ? Math.round(n1) : 18;

            const mode = String(r?.holesMode || r?.holesSelection || r?.holes || "").toLowerCase();
            if (mode.includes("front") || mode.includes("back") || mode.includes("9")) count = 9;

            let start = Number(r?.startHole) || 1;

            // If 9-hole and the round indicates back nine, start at 10
            const holesSide = String(r?.holesSide || "").toLowerCase();
            const isBack = holesSide === "back" || mode.includes("back");
            if (count === 9 && isBack) start = 10;

            const end = Math.min(18, start + count - 1);
            return { start, end, count };
        };

        // Load round truth so 9-hole BACK rounds don't incorrectly finish after hole 10.
        const rid0 = roundIdParam || null;
        const ref0 = rid0 ? roundDocRef(rid0) : null;

        let roundState0 = null;
        try {
            const snap0 = ref0 ? await getDoc(ref0) : null;
            roundState0 = snap0 && snap0.exists() ? (snap0.data() || null) : null;
        } catch {
            roundState0 = null;
        }

        if (puttingContestActive) {
            const missingPuttsPlayers = (playerRows || [])
                .map((p, idx) => {
                    const pid = String(p?._pid || "");
                    const name = String(p?._name || `Player ${idx + 1}`).trim() || `Player ${idx + 1}`;
                    const val = inputs?.[pid] || {};
                    const strokes = toInt(val?.strokes);
                    const hasPuttsSaved = val?._hasPuttsSaved === true;

                    if (strokes <= 0) return null;
                    if (hasPuttsSaved) return null;

                    return name;
                })
                .filter(Boolean);

            if (missingPuttsPlayers.length) {
                Alert.alert(
                    "Putts required",
                    missingPuttsPlayers.length === 1
                        ? `${missingPuttsPlayers[0]} must enter putts before advancing.`
                        : `${missingPuttsPlayers.join(", ")} must enter putts before advancing.`
                );
                return;
            }
        }

        const win = resolveHoleWindow(roundState0 || {});
        const holeEnd = Number(win?.end) || 18;

        // If we’re at the end of the selected window (ex: hole 9 of Front 9 / hole 18 of 18),
        // DO NOT finish from Score Entry. Save, then return to HoleHub so the user explicitly presses Finish there.
        // BUT: still show the post-hole Skins splash for the last hole.
        if (Number(holeNumber) >= holeEnd) {
            const res = await persistHole({ resumeHole: holeEnd });
            const rid = res?.roundId || roundIdParam || null;

            // Build a post-hole Skins splash (with running totals) for THIS hole before Finish prompt.
            let postHoleSplash = null;
            try {
                const roundBasis = String(roundState0?.scoringMode || roundState0?.scoring || "net").toLowerCase();
                const useNet = roundBasis === "net";

                const formatsSelected = Array.isArray(roundState0?.formatsSelected) ? roundState0.formatsSelected : [];
                const hasSkins = formatsSelected.some((x) => {
                    const k = typeof x === "string" ? x : x?.key || x?.id || "";
                    return String(k || "").trim() === "skins";
                });

                if (hasSkins) {
                    const pools = (roundState0 && typeof roundState0 === "object" ? roundState0.formatPools : null) || {};
                    const skinsPool = (pools && typeof pools === "object" ? pools.skins : null) || {};
                    const perSkin = Number(skinsPool?.amountPerSkin);

                    if (Number.isFinite(perSkin) && perSkin > 0) {
                        const excludedIds = Array.isArray(skinsPool?.excludedIds) ? skinsPool.excludedIds.map(String) : [];
                        const excludedSet = new Set(excludedIds);

                        const included = (normalizedPlayers || [])
                            .map((p, idx) => ({
                                pid: String(p?.id || ""),
                                name: String(p?.name || `Player ${idx + 1}`).trim() || `Player ${idx + 1}`,
                                handicap: Number(p?.handicap ?? 0),
                            }))
                            .filter((x) => x.pid && !excludedSet.has(String(x.pid)));

                        const holeNum = Number(holeNumber) || 1;

                        // Build a merged hole map: Firestore holes + this-hole inputs (we just entered).
                        const holes = (roundState0?.holes && typeof roundState0.holes === "object") ? roundState0.holes : {};
                        const mergedHoles = { ...holes };
                        mergedHoles[String(holeNum)] = mergedHoles[String(holeNum)] || { players: {} };
                        mergedHoles[String(holeNum)].players = mergedHoles[String(holeNum)].players || {};
                        included.forEach((p) => {
                            const grossNow = toInt(inputs?.[p.pid]?.strokes);
                            if (grossNow > 0) {
                                mergedHoles[String(holeNum)].players[String(p.pid)] = {
                                    ...(mergedHoles[String(holeNum)].players[String(p.pid)] || {}),
                                    strokes: String(grossNow),
                                };
                            }
                        });

                        // Hole window (front/back 9 correctness)
                        const holesCount = Number(roundState0?.holesCount);
                        const holesSide = String(roundState0?.holesSide || "").toLowerCase();
                        const startH = holesCount === 9 && holesSide === "back" ? 10 : 1;
                        const endH = holesCount === 9 ? (startH === 10 ? 18 : 9) : 18;

                        function holeStrokeIndex(h) {
                            const hm = holeMeta && typeof holeMeta === "object" ? (holeMeta[String(h)] || holeMeta[h] || {}) : {};
                            const siRaw = hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? hm?.handicap ?? null;
                            const si = Number(siRaw);
                            return Number.isFinite(si) ? si : null;
                        }

                        function strokesReceived(hcp, strokeIndex) {
                            const h = Math.max(0, Math.floor(Number(hcp) || 0));
                            if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return 0;
                            const base = Math.floor(h / 18);
                            const extra = h % 18;
                            return base + (strokeIndex <= extra ? 1 : 0);
                        }

                        // Compute running skins (with carryovers)
                        const skinsByPid = {};
                        included.forEach((p) => (skinsByPid[p.pid] = 0));

                        let carry = 0;
                        let winSkinsThisHole = null;      // number of skins awarded on THIS hole (includes carry)
                        let carryAfterThisHole = null;     // carry count AFTER evaluating this hole (used for wash message)
                        let tieThisHole = false;

                        for (let h = startH; h <= endH; h++) {
                            // only evaluate up to the current hole
                            if (h > holeNum) break;

                            const si = holeStrokeIndex(h);

                            const contenders = included
                                .map((p) => {
                                    const gross = toInt(mergedHoles?.[String(h)]?.players?.[String(p.pid)]?.strokes);
                                    if (gross <= 0) return null;
                                    const net = useNet ? (gross - strokesReceived(p.handicap, si)) : gross;
                                    return { ...p, gross, score: net };
                                })
                                .filter(Boolean);

                            if (contenders.length < 2) continue;

                            const min = Math.min(...contenders.map((x) => x.score));
                            const winners = contenders.filter((x) => x.score === min);

                            const isThisHole = h === holeNum;
                            const carryIn = carry;

                            if (winners.length === 1) {
                                const winPid = winners[0].pid;
                                const winSkins = 1 + carryIn;
                                skinsByPid[winPid] = (skinsByPid[winPid] || 0) + winSkins;
                                carry = 0;

                                if (isThisHole) {
                                    winSkinsThisHole = winSkins;
                                    tieThisHole = false;
                                    carryAfterThisHole = carry;
                                }
                            } else {
                                carry += 1;

                                if (isThisHole) {
                                    winSkinsThisHole = 0;
                                    tieThisHole = true;
                                    carryAfterThisHole = carry;
                                }
                            }
                        }

                        // Decide this hole’s message (using same logic)
                        const siNow = holeStrokeIndex(holeNum);
                        const nowContenders = included
                            .map((p) => {
                                const gross = toInt(mergedHoles?.[String(holeNum)]?.players?.[String(p.pid)]?.strokes);
                                if (gross <= 0) return null;
                                const net = useNet ? (gross - strokesReceived(p.handicap, siNow)) : gross;
                                return { ...p, gross, score: net };
                            })
                            .filter(Boolean);

                        if (nowContenders.length >= 2) {
                            const minNow = Math.min(...nowContenders.map((x) => x.score));
                            const nowWinners = nowContenders.filter((x) => x.score === minNow);

                            let headline = "";
                            if (nowWinners.length === 1) {
                                const n = nowWinners[0].name;
                                if (Number(winSkinsThisHole) > 1) {
                                    headline = `Skin: ${n} • Hole ${holeNum} (wins ${winSkinsThisHole})`;
                                } else {
                                    headline = `Skin: ${n} • Hole ${holeNum}`;
                                }
                            } else {
                                const carryNow = Number.isFinite(carryAfterThisHole) ? carryAfterThisHole : carry;

                                if (holeNum === endH && carryNow > 0) {
                                    headline = `Carryover washed • Hole ${holeNum}`;
                                } else if (carryNow > 0) {
                                    const startCarryHole = Math.max(startH, holeNum - carryNow + 1);
                                    const endCarryHole = holeNum;
                                    const nextHoleLabel = Math.min(endH, holeNum + 1);
                                    headline = `Carryover: ${startCarryHole}-${endCarryHole} (currently on hole ${nextHoleLabel})`;
                                } else {
                                    headline = `Carryover (tie) • Hole ${holeNum}`;
                                }
                            }

                            // Build leaderboard lines (sorted)
                            const list = included
                                .map((p) => ({
                                    name: p.name,
                                    skins: Number(skinsByPid[p.pid] || 0),
                                    est: Number(skinsByPid[p.pid] || 0) * perSkin * Math.max(0, included.length - 1),
                                }))
                                .sort((a, b) => (b.skins - a.skins) || (a.name.localeCompare(b.name)));

                            const topLines = list.map((x) => `${x.name}: ${x.skins} (${x.est > 0 ? `$${x.est}` : "$0"})`);

                            const holeWinnerPid = (nowWinners.length === 1) ? String(nowWinners[0].pid || "") : null;

                            const rows = included.map((p) => {
                                const skins = Number(skinsByPid[p.pid] || 0);
                                const amount = skins * perSkin * Math.max(0, included.length - 1);
                                return { pid: String(p.pid), name: String(p.name), skins, amount };
                            }).sort((a, b) => (b.skins - a.skins) || (a.name.localeCompare(b.name)));

                            postHoleSplash = {
                                title: "Skins",
                                headline,
                                holeWinnerPid,
                                rows,
                            };
                        }
                    }
                }
            } catch {
                postHoleSplash = null;
            }

            let birdieBucketsSplash = null;
            try {
                const refBB = rid ? roundDocRef(rid) : null;
                const snapBB = refBB ? await getDoc(refBB) : null;
                const roundStateBB = snapBB && snapBB.exists() ? (snapBB.data() || null) : null;

                const bbState =
                    (roundStateBB?.wagers &&
                        typeof roundStateBB.wagers === "object" &&
                        roundStateBB.wagers?.birdieBuckets &&
                        typeof roundStateBB.wagers.birdieBuckets === "object"
                        ? roundStateBB.wagers.birdieBuckets
                        : {}) || {};

                const holeBB =
                    (bbState?.holes && typeof bbState.holes === "object"
                        ? bbState.holes[String(holeNumber)] || bbState.holes[holeNumber] || null
                        : null) || null;

                const winAmount = Number(holeBB?.win?.amount || 0);
                const winnerName = String(holeBB?.win?.winnerName || "").trim();
                const potNow = Number(bbState?.pot || 0);

                birdieBucketsSplash = {
                    winLine:
                        winAmount > 0 && winnerName
                            ? `${winnerName} won $${String(Math.round(winAmount))}`
                            : "",
                    potLine: `Current Pot: $${String(Math.round(potNow))}`,
                };
            } catch {
                birdieBucketsSplash = null;
            }

            goToHoleHub(holeEnd, {
                roundId: rid,
                showFinishPrompt: true,
                postHoleSplash,
                birdieBucketsSplash,
                // End-of-window return: avoid re-triggering the generic format splash (ex: Long Drive) after Save
                showFormatSplash: false,
            });
            return;
        }

        const nextHole = Math.min(holeEnd, Number(holeNumber) + 1);
        const res = await persistHole({ resumeHole: nextHole });
        const rid = res?.roundId || roundIdParam || null;

        const ref = rid ? roundDocRef(rid) : null;
        let roundState = null;

        try {
            const snap = ref ? await getDoc(ref) : null;
            roundState = snap && snap.exists() ? (snap.data() || null) : null;
        } catch {
            roundState = null;
        }

        const isMatchPlay = String(roundState?.gameId || "").trim() === "match_play";
        const hasMatchSetup =
            !!(roundState?.matchPlay &&
                typeof roundState.matchPlay === "object" &&
                Array.isArray(roundState.matchPlay.matches) &&
                roundState.matchPlay.matches.length);

        // Post-hole Skins splash (single, premium) + running totals (skins count + estimated $).
        let postHoleSplash = null;
        let birdieBucketsSplash = null;

        try {
            const roundBasis = String(roundState?.scoringMode || roundState?.scoring || "net").toLowerCase();
            const useNet = roundBasis === "net";

            // Birdie Buckets (FIR/GIR build pot; birdie-or-better wins pot; net/gross respects scoring basis)
            try {
                const formatsSelectedBB = Array.isArray(roundState?.formatsSelected) ? roundState.formatsSelected : [];

                const bbFound = formatsSelectedBB.find((x) => {
                    const k = typeof x === "string" ? x : x?.key || x?.id || "";
                    const n = typeof x === "string" ? x : x?.name || x?.label || x?.title || "";
                    const s = `${String(k || "")} ${String(n || "")}`.toLowerCase();
                    return s.includes("birdie") && s.includes("bucket");
                });

                const bbKey = bbFound ? (typeof bbFound === "string" ? String(bbFound) : String(bbFound?.key || bbFound?.id || "")) : "";
                const pools = (roundState && typeof roundState === "object" ? roundState.formatPools : null) || {};
                const bbPool = (pools && typeof pools === "object" ? (bbKey ? pools[bbKey] : null) : null) || {};
                const perEvent = Number(bbPool?.entryFee);

                // pot + mode stored on round doc under wagers.birdieBuckets (single source of truth)
                const bbWagers = (roundState?.wagers && typeof roundState.wagers === "object" ? roundState.wagers : {}) || {};
                const bbState = (bbWagers?.birdieBuckets && typeof bbWagers.birdieBuckets === "object" ? bbWagers.birdieBuckets : {}) || {};
                const potNow = Number(bbState?.pot || 0);
                const mode = String(bbState?.mode || "hits_pay_all").trim(); // "hits_pay_all" | "misses_pay"

                if (bbKey && Number.isFinite(perEvent) && perEvent > 0) {
                    const holeNum = Number(holeNumber) || 1;

                    // Helper: stroke index + strokes received (same as skins)
                    function holeStrokeIndex(h) {
                        const hm = holeMeta && typeof holeMeta === "object" ? (holeMeta[String(h)] || holeMeta[h] || {}) : {};
                        const siRaw = hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? hm?.handicap ?? null;
                        const si = Number(siRaw);
                        return Number.isFinite(si) ? si : null;
                    }

                    function strokesReceived(hcp, strokeIndex) {
                        const h = Math.max(0, Math.floor(Number(hcp) || 0));
                        if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return 0;
                        const base = Math.floor(h / 18);
                        const extra = h % 18;
                        return base + (strokeIndex <= extra ? 1 : 0);
                    }

                    const playersBB = (normalizedPlayers || [])
                        .map((p, idx) => ({
                            pid: String(p?.id || ""),
                            name: String(p?.name || `Player ${idx + 1}`).trim() || `Player ${idx + 1}`,
                            handicap: Number(p?.handicap ?? 0),
                        }))
                        .filter((x) => x.pid);

                    const nPlayers = playersBB.length;

                    // Build per-hole charge events (so results/settle-up can line up later)
                    // Store under wagers.birdieBuckets.holes[holeNum] to avoid array growth + avoid concurrency issues.
                    const chargeEvents = [];
                    const safeMode = mode === "misses_pay" ? "misses_pay" : "hits_pay_all";

                    if (safeMode === "misses_pay") {
                        // Immunity for hitters: ONLY the missers pay.
                        playersBB.forEach((p) => {
                            const fairway = String(inputs?.[p.pid]?.fairway || "na");
                            const green = String(inputs?.[p.pid]?.green || "na");

                            if (fairway === "no") {
                                chargeEvents.push({
                                    hole: holeNum,
                                    payerPid: p.pid,
                                    payerName: p.name,
                                    amount: perEvent,
                                    reason: "FIR_MISS",
                                });
                            }

                            if (green === "no") {
                                chargeEvents.push({
                                    hole: holeNum,
                                    payerPid: p.pid,
                                    payerName: p.name,
                                    amount: perEvent,
                                    reason: "GIR_MISS",
                                });
                            }
                        });
                    } else {
                        // hits_pay_all (default/current): each HIT triggers EVERYONE paying.
                        // If a player hits FIR, all players pay perEvent (one charge each). Same for GIR.
                        playersBB.forEach((trigger) => {
                            const fairway = String(inputs?.[trigger.pid]?.fairway || "na");
                            const green = String(inputs?.[trigger.pid]?.green || "na");

                            if (fairway === "yes") {
                                playersBB.forEach((payer) => {
                                    chargeEvents.push({
                                        hole: holeNum,
                                        payerPid: payer.pid,
                                        payerName: payer.name,
                                        amount: perEvent,
                                        reason: "FIR_HIT",
                                        triggerPid: trigger.pid,
                                        triggerName: trigger.name,
                                    });
                                });
                            }

                            if (green === "yes") {
                                playersBB.forEach((payer) => {
                                    chargeEvents.push({
                                        hole: holeNum,
                                        payerPid: payer.pid,
                                        payerName: payer.name,
                                        amount: perEvent,
                                        reason: "GIR_HIT",
                                        triggerPid: trigger.pid,
                                        triggerName: trigger.name,
                                    });
                                });
                            }
                        });
                    }

                    const existingHole =
                        (bbState?.holes && typeof bbState.holes === "object"
                            ? bbState.holes[String(holeNum)] || bbState.holes[holeNum] || null
                            : null) || null;

                    const previousAdd = Number(existingHole?.add || 0);
                    const previousWinAmount = Number(existingHole?.win?.amount || 0);

                    const add = chargeEvents.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);

                    // Re-saving the same hole must replace that hole's prior effect,
                    // not stack it again onto the running pot.
                    let potBeforeHole = potNow - previousAdd + previousWinAmount;
                    if (!Number.isFinite(potBeforeHole) || potBeforeHole < 0) potBeforeHole = 0;

                    let potAfter = potBeforeHole + add;

                    // Determine birdie-or-better qualifiers (net or gross) on this hole.
                    // Birdie Buckets rule:
                    // - exactly 1 birdie-or-better => wins full pot
                    // - 2+ birdies-or-better => carry over
                    // - 0 birdies-or-better => carry over
                    const parNow = Number(holeMeta?.[String(holeNum)]?.par ?? 4);
                    const siNow = holeStrokeIndex(holeNum);

                    const contenders = playersBB
                        .map((p) => {
                            const gross = toInt(inputs?.[p.pid]?.strokes);
                            if (gross <= 0) return null;

                            const net = useNet ? (gross - strokesReceived(p.handicap, siNow)) : gross;
                            const diff = net - parNow; // <= -1 is birdie or better
                            return { ...p, gross, net, diff };
                        })
                        .filter(Boolean);

                    const birdies = contenders.filter((c) => c.diff <= -1);

                    let winLine = "";
                    let paid = false;
                    let winObj = null;

                    if (birdies.length === 1) {
                        const winner = birdies[0];
                        const paidAmount = potAfter;

                        winLine = `${winner.name} won $${String(Math.round(paidAmount))}`;
                        paid = true;

                        winObj = {
                            hole: holeNum,
                            winnerPid: winner.pid,
                            winnerName: winner.name,
                            amount: paidAmount,
                            scoring: useNet ? "net" : "gross",
                            birdieCount: 1,
                        };

                        potAfter = 0;
                    }

                    // Birdie Buckets authoritative state is now rebuilt inside persistHole()
                    // from the full saved hole timeline, so do not patch-write it here.

                    // Splash UI
                    birdieBucketsSplash = {
                        winLine: winLine || "",
                        potLine: `Current Pot: $${String(Math.round(potAfter))}`,
                    };

                    const isFixFlow =
                        Array.isArray(missingHoles) &&
                        missingHoles.length > 0 &&
                        Number.isFinite(Number(finishReturnHole)) &&
                        Number(finishReturnHole) > 0;

                    if (isFixFlow) {
                        const previousWinnerPid = String(existingHole?.win?.winnerPid || "").trim();
                        const previousWinAmount = Number(existingHole?.win?.amount || 0);
                        const currentWinnerPid = String(winObj?.winnerPid || "").trim();
                        const currentWinAmount = Number(winObj?.amount || 0);

                        const holeActuallyChanged =
                            Number(previousAdd || 0) !== Number(add || 0) ||
                            previousWinnerPid !== currentWinnerPid ||
                            Number(previousWinAmount || 0) !== Number(currentWinAmount || 0);

                        if (!holeActuallyChanged) {
                            birdieBucketsSplash = null;
                        }
                    }

                }
            } catch {
                birdieBucketsSplash = null;
            }

            const formatsSelected = Array.isArray(roundState?.formatsSelected) ? roundState.formatsSelected : [];
            const hasSkins = formatsSelected.some((x) => {
                const k = typeof x === "string" ? x : x?.key || x?.id || "";
                return String(k || "").trim() === "skins";
            });

            if (hasSkins) {
                const pools = (roundState && typeof roundState === "object" ? roundState.formatPools : null) || {};
                const skinsPool = (pools && typeof pools === "object" ? pools.skins : null) || {};
                const perSkin = Number(skinsPool?.amountPerSkin);

                if (Number.isFinite(perSkin) && perSkin > 0) {
                    const excludedIds = Array.isArray(skinsPool?.excludedIds) ? skinsPool.excludedIds.map(String) : [];
                    const excludedSet = new Set(excludedIds);

                    const included = (normalizedPlayers || [])
                        .map((p, idx) => ({
                            pid: String(p?.id || ""),
                            name: String(p?.name || `Player ${idx + 1}`).trim() || `Player ${idx + 1}`,
                            handicap: Number(p?.handicap ?? 0),
                        }))
                        .filter((x) => x.pid && !excludedSet.has(String(x.pid)));

                    const holeNum = Number(holeNumber) || 1;

                    const holes = (roundState?.holes && typeof roundState.holes === "object") ? roundState.holes : {};
                    const mergedHoles = { ...holes };
                    mergedHoles[String(holeNum)] = mergedHoles[String(holeNum)] || { players: {} };
                    mergedHoles[String(holeNum)].players = mergedHoles[String(holeNum)].players || {};
                    included.forEach((p) => {
                        const grossNow = toInt(inputs?.[p.pid]?.strokes);
                        if (grossNow > 0) {
                            mergedHoles[String(holeNum)].players[String(p.pid)] = {
                                ...(mergedHoles[String(holeNum)].players[String(p.pid)] || {}),
                                strokes: String(grossNow),
                            };
                        }
                    });

                    const holesCount = Number(roundState?.holesCount);
                    const holesSide = String(roundState?.holesSide || "").toLowerCase();
                    const startH = holesCount === 9 && holesSide === "back" ? 10 : 1;
                    const endH = holesCount === 9 ? (startH === 10 ? 18 : 9) : 18;

                    function holeStrokeIndex(h) {
                        const hm = holeMeta && typeof holeMeta === "object" ? (holeMeta[String(h)] || holeMeta[h] || {}) : {};
                        const siRaw = hm?.si ?? hm?.strokeIndex ?? hm?.SI ?? hm?.handicap ?? null;
                        const si = Number(siRaw);
                        return Number.isFinite(si) ? si : null;
                    }

                    function strokesReceived(hcp, strokeIndex) {
                        const h = Math.max(0, Math.floor(Number(hcp) || 0));
                        if (!Number.isFinite(strokeIndex) || strokeIndex < 1 || strokeIndex > 18) return 0;
                        const base = Math.floor(h / 18);
                        const extra = h % 18;
                        return base + (strokeIndex <= extra ? 1 : 0);
                    }

                    const skinsByPid = {};
                    included.forEach((p) => (skinsByPid[p.pid] = 0));

                    let carry = 0;
                    let winSkinsThisHole = null;      // number of skins awarded on THIS hole (includes carry)
                    let carryAfterThisHole = null;     // carry count AFTER evaluating this hole (used for wash message)
                    let tieThisHole = false;

                    for (let h = startH; h <= endH; h++) {
                        if (h > holeNum) break;

                        const si = holeStrokeIndex(h);

                        const contenders = included
                            .map((p) => {
                                const gross = toInt(mergedHoles?.[String(h)]?.players?.[String(p.pid)]?.strokes);
                                if (gross <= 0) return null;
                                const net = useNet ? (gross - strokesReceived(p.handicap, si)) : gross;
                                return { ...p, gross, score: net };
                            })
                            .filter(Boolean);

                        if (contenders.length < 2) continue;

                        const min = Math.min(...contenders.map((x) => x.score));
                        const winners = contenders.filter((x) => x.score === min);

                        const isThisHole = h === holeNum;
                        const carryIn = carry;

                        if (winners.length === 1) {
                            const winPid = winners[0].pid;
                            const winSkins = 1 + carryIn;
                            skinsByPid[winPid] = (skinsByPid[winPid] || 0) + winSkins;
                            carry = 0;

                            if (isThisHole) {
                                winSkinsThisHole = winSkins;
                                tieThisHole = false;
                                carryAfterThisHole = carry;
                            }
                        } else {
                            carry += 1;

                            if (isThisHole) {
                                winSkinsThisHole = 0;
                                tieThisHole = true;
                                carryAfterThisHole = carry;
                            }
                        }
                    }

                    const siNow = holeStrokeIndex(holeNum);
                    const nowContenders = included
                        .map((p) => {
                            const gross = toInt(mergedHoles?.[String(holeNum)]?.players?.[String(p.pid)]?.strokes);
                            if (gross <= 0) return null;
                            const net = useNet ? (gross - strokesReceived(p.handicap, siNow)) : gross;
                            return { ...p, gross, score: net };
                        })
                        .filter(Boolean);

                    if (nowContenders.length >= 2) {
                        const minNow = Math.min(...nowContenders.map((x) => x.score));
                        const nowWinners = nowContenders.filter((x) => x.score === minNow);

                        let headline = "";
                        if (nowWinners.length === 1) {
                            const n = nowWinners[0].name;
                            if (Number(winSkinsThisHole) > 1) {
                                headline = `Skin: ${n} • Hole ${holeNum} (wins ${winSkinsThisHole})`;
                            } else {
                                headline = `Skin: ${n} • Hole ${holeNum}`;
                            }
                        } else {
                            const carryNow = Number.isFinite(carryAfterThisHole) ? carryAfterThisHole : carry;

                            if (holeNum === endH && carryNow > 0) {
                                headline = `Carryover washed • Hole ${holeNum}`;
                            } else if (carryNow > 0) {
                                const startCarryHole = Math.max(startH, holeNum - carryNow + 1);
                                const endCarryHole = holeNum;
                                const nextHoleLabel = Math.min(endH, holeNum + 1);
                                headline = `Carryover: ${startCarryHole}-${endCarryHole} (currently on hole ${nextHoleLabel})`;
                            } else {
                                headline = `Carryover (tie) • Hole ${holeNum}`;
                            }
                        }

                        const list = included
                            .map((p) => ({
                                name: p.name,
                                skins: Number(skinsByPid[p.pid] || 0),
                                est: Number(skinsByPid[p.pid] || 0) * perSkin * Math.max(0, included.length - 1),
                            }))
                            .sort((a, b) => (b.skins - a.skins) || (a.name.localeCompare(b.name)));

                        const topLines = list.map((x) => `${x.name}: ${x.skins} (${x.est > 0 ? `$${x.est}` : "$0"})`);

                        const holeWinnerPid = (nowWinners.length === 1) ? String(nowWinners[0].pid || "") : null;

                        const rows = included.map((p) => {
                            const skins = Number(skinsByPid[p.pid] || 0);
                            const amount = skins * perSkin * Math.max(0, included.length - 1);
                            return { pid: String(p.pid), name: String(p.name), skins, amount };
                        }).sort((a, b) => (b.skins - a.skins) || (a.name.localeCompare(b.name)));

                        postHoleSplash = {
                            title: "Skins",
                            headline,
                            holeWinnerPid,
                            rows,
                        };
                    }
                }
            }
        } catch {
            postHoleSplash = null;
        }

        const holesCount = Number(roundState?.holesCount);
        const shouldShowFrontNinePrompt = holesCount === 18 && Number(nextHole) === 10 && Number(holeNumber) === 9;

        // Guided "fix missing holes" mode (WITHOUT changing normal flow).
        // If we arrived here from Finish -> Fix now, we jump only to the remaining missing holes,
        // but we still use the normal HoleHub + splash/claim behavior.
        const originalMissing = Array.isArray(missingHoles) ? missingHoles.map(Number).filter(Number.isFinite) : [];
        const finishHole = Number(finishReturnHole || 0);

        if (originalMissing.length && Number.isFinite(finishHole) && finishHole > 0) {
            const remaining = getMissingHolesFromState(roundState || {}, normalizedPlayers);

            if (!remaining.length) {
                goToHoleHub(finishHole, {
                    roundId: rid,
                    showFinishPrompt: true,
                    postHoleSplash,
                });
                return;
            }

            let nextMissing = null;
            let nextIdx = Number.isFinite(Number(missingIndex)) ? Number(missingIndex) : -1;

            for (let i = Math.max(0, nextIdx + 1); i < originalMissing.length; i++) {
                const h = Number(originalMissing[i]);
                if (remaining.includes(h)) {
                    nextMissing = h;
                    nextIdx = i;
                    break;
                }
            }

            if (!nextMissing) {
                nextMissing = remaining[0];
                nextIdx = originalMissing.indexOf(nextMissing);
                if (nextIdx < 0) nextIdx = 0;
            }

            goToHoleHub(nextMissing, {
                roundId: rid,
                postHoleSplash,
                birdieBucketsSplash,
                missingHoles: originalMissing,
                missingIndex: nextIdx,
                finishReturnHole: finishHole,
            });
            return;
        }

        if (isMatchPlay && hasMatchSetup) {
            goToHoleHub(nextHole, {
                roundId: rid,
                postHoleSplash,
                birdieBucketsSplash,
                showMatchStatusSplash: true,
                matchStatusHoleCompleted: Number(holeNumber) || 1,
                matchStatusNextHole: Number(nextHole) || nextHole,
                ...(shouldShowFrontNinePrompt ? { showFrontNineStatsPrompt: true } : {}),
            });
            return;
        }

        goToHoleHub(nextHole, {
            roundId: rid,
            postHoleSplash,
            birdieBucketsSplash,
            ...(shouldShowFrontNinePrompt ? { showFrontNineStatsPrompt: true } : {}),
            ...(isMatchPlay && hasMatchSetup
                ? {
                    showMatchStatusSplash: true,
                    matchStatusHoleCompleted: Number(holeNumber) || 1,
                    matchStatusNextHole: Number(nextHole) || nextHole,
                }
                : {}),
        });
    }

    // picker
    const [pickOpen, setPickOpen] = useState(false);
    const [pickPid, setPickPid] = useState("");
    const [pickField, setPickField] = useState("strokes"); // "strokes" | "putts"

    const STROKES = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
    const PUTTS = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

    const PENALTIES = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);
    const DRIVE_DISTANCES = useMemo(() => Array.from({ length: 41 }, (_, i) => i * 10), []);

    const pickTitle = useMemo(() => {
        if (pickField === "putts") return "Putts";
        if (pickField === "penalties") return "Penalties";
        if (pickField === "driveDistance") return "Drive Distance";
        return "Strokes";
    }, [pickField]);

    const pickNumbers = useMemo(() => {
        if (pickField === "putts") return PUTTS;
        if (pickField === "penalties") return PENALTIES;
        if (pickField === "driveDistance") return DRIVE_DISTANCES;
        return STROKES;
    }, [pickField, PUTTS, PENALTIES, DRIVE_DISTANCES, STROKES]);

    const requiredStats = useMemo(
        () => getRequiredStatsFlags({ puttingContestActive, bbActive }),
        [puttingContestActive, bbActive]
    );

    const [statsModalOpen, setStatsModalOpen] = useState(false);
    const [statsModalPid, setStatsModalPid] = useState("");

    const openStatsModal = useCallback((pid) => {
        Keyboard.dismiss();
        setStatsModalPid(String(pid || ""));
        setStatsModalOpen(true);
    }, []);

    const closeStatsModal = useCallback(() => {
        setStatsModalOpen(false);
        setStatsModalPid("");
    }, []);

    const statsModalPlayer = useMemo(() => {
        return playerRows.find((p) => String(p._pid) === String(statsModalPid)) || null;
    }, [playerRows, statsModalPid]);

    const statsModalValue = useMemo(() => {
        return inputs?.[String(statsModalPid)] || null;
    }, [inputs, statsModalPid]);

    const statsModalRequired = useMemo(
        () => getRequiredStatsFlags({ puttingContestActive, bbActive }),
        [puttingContestActive, bbActive]
    );

    const statsModalSelectedStats = useMemo(() => {
        return {
            ...defaultSelectedStats(),
            ...(statsModalValue?.selectedStats || {}),
        };
    }, [statsModalValue]);

    const allOptionalStatsSelected = useMemo(() => {
        return (
            !!statsModalSelectedStats.putts &&
            !!statsModalSelectedStats.fairway &&
            !!statsModalSelectedStats.green &&
            !!statsModalSelectedStats.sandSave &&
            !!statsModalSelectedStats.updown &&
            !!statsModalSelectedStats.penalties &&
            !!statsModalSelectedStats.driveDistance
        );
    }, [statsModalSelectedStats]);

    const toggleAllStatsForModalPlayer = useCallback(() => {
        if (!statsModalPid) return;

        if (allOptionalStatsSelected) {
            setPlayerField(statsModalPid, "selectedStats", {
                putts: !!statsModalRequired.putts,
                fairway: !!statsModalRequired.fairway,
                green: !!statsModalRequired.green,
                sandSave: !!statsModalRequired.sandSave,
                updown: !!statsModalRequired.updown,
                penalties: !!statsModalRequired.penalties,
                driveDistance: !!statsModalRequired.driveDistance,
            });
            return;
        }

        setPlayerField(statsModalPid, "selectedStats", {
            putts: true,
            fairway: true,
            green: true,
            sandSave: true,
            updown: true,
            penalties: true,
            driveDistance: true,
        });
    }, [statsModalPid, allOptionalStatsSelected, statsModalRequired]);

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
        if (pickField === "penalties") setPlayerField(pickPid, "penalties", Number(n));
        if (pickField === "driveDistance") setPlayerField(pickPid, "driveDistance", Number(n));
        closePicker();
    };

    const onTapDriveDistanceNA = () => {
        if (!pickPid) {
            closePicker();
            return;
        }
        if (pickField === "driveDistance") {
            setPlayerField(pickPid, "driveDistance", "na");
        }
        closePicker();
    };
    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={title}
                subtitle={"Tap a box to pick a value."}
                safeTop={false}
            />

            <View style={styles.body}>
                {claimable ? (
                    <View style={styles.sideGameBanner}>
                        <Text style={styles.sideGameTitle}>
                            {sideGameTitle === "Second Shot KP"
                                ? `Second Shot • KP • Hole ${holeNumber}`
                                : sideGameTitle === "KP"
                                    ? `KP • Hole ${holeNumber}`
                                    : `${sideGameTitle} • Hole ${holeNumber}`}
                        </Text>

                        <Text style={styles.sideGameSub}>
                            {claimStatus === "claimed" && holderName
                                ? `Current holder: ${holderName}`
                                : claimStatus === "carry_over"
                                    ? "Carry over requested"
                                    : claimStatus === "unclaimed"
                                        ? "Washed"
                                        : "Currently unclaimed"}
                        </Text>

                        <View style={styles.sideGameBtnsRow}>
                            <Pressable
                                onPress={async () => {
                                    const isClaimed = claimStatus === "claimed" && !!holderPid;

                                    if (isClaimed) {
                                        Alert.alert(
                                            "Change from claimed?",
                                            `This hole is currently claimed by ${holderName || "Player"}. Mark it washed instead?`,
                                            [
                                                { text: "Cancel", style: "cancel" },
                                                {
                                                    text: "Mark Washed",
                                                    style: "default",
                                                    onPress: async () => {
                                                        const ok = await markUnclaimed();
                                                        if (!ok) Alert.alert("Save failed", "Could not mark washed. Please try again.");
                                                    },
                                                },
                                            ]
                                        );
                                        return;
                                    }

                                    Alert.alert("Mark washed?", "This sets this format hole as washed. You can change it anytime.", [
                                        { text: "Cancel", style: "cancel" },
                                        {
                                            text: "Mark Washed",
                                            style: "default",
                                            onPress: async () => {
                                                const ok = await markUnclaimed();
                                                if (!ok) Alert.alert("Save failed", "Could not mark washed. Please try again.");
                                            },
                                        },
                                    ]);
                                }}
                                style={({ pressed }) => [
                                    styles.sideBtn,
                                    styles.sideBtnUnclaimed,
                                    claimStatus === "unclaimed" && styles.sideBtnUnclaimedOn,
                                    claimStatus === "claimed" && styles.sideBtnMuted,
                                    pressed && styles.pressed,
                                ]}
                            >
                                <Text style={[styles.sideBtnText, claimStatus === "claimed" && styles.sideBtnTextMuted]}>Washed</Text>
                            </Pressable>

                            <Pressable
                                onPress={async () => {
                                    const isClaimed = claimStatus === "claimed" && !!holderPid;

                                    if (isClaimed) {
                                        Alert.alert("Change from claimed?", `This hole is currently claimed by ${holderName || "Player"}. Carry it over instead?`, [
                                            { text: "Cancel", style: "cancel" },
                                            {
                                                text: "Carry Over",
                                                style: "default",
                                                onPress: async () => {
                                                    const ok = await markCarryOver();
                                                    if (!ok) Alert.alert("Save failed", "Could not mark carry over. Please try again.");
                                                },
                                            },
                                        ]);
                                        return;
                                    }

                                    Alert.alert("Carry over?", "This carries this hole’s value forward to the next matching format hole. You can change it anytime.", [
                                        { text: "Cancel", style: "cancel" },
                                        {
                                            text: "Carry Over",
                                            style: "default",
                                            onPress: async () => {
                                                const ok = await markCarryOver();
                                                if (!ok) Alert.alert("Save failed", "Could not mark carry over. Please try again.");
                                            },
                                        },
                                    ]);
                                }}
                                style={({ pressed }) => [
                                    styles.sideBtn,
                                    styles.sideBtnCarry,
                                    claimStatus === "carry_over" && styles.sideBtnCarryOn,
                                    claimStatus === "claimed" && styles.sideBtnMuted,
                                    pressed && styles.pressed,
                                ]}
                            >
                                <Text style={[styles.sideBtnText, claimStatus === "claimed" && styles.sideBtnTextMuted]}>Carry Over</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}

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

                        const selectedStats = {
                            ...defaultSelectedStats(),
                            ...(val.selectedStats || {}),
                        };

                        const showPutts =
                            requiredStats.putts ||
                            selectedStats.putts;

                        const holePar = Number(holeMeta?.[String(holeNumber)]?.par ?? 4);
                        const isPar3 = holePar === 3;

                        const showFairway =
                            !isPar3 && (
                                requiredStats.fairway ||
                                selectedStats.fairway
                            );

                        const showGreen =
                            requiredStats.green ||
                            selectedStats.green;

                        const showSandSave =
                            requiredStats.sandSave ||
                            selectedStats.sandSave;

                        const showUpdown =
                            requiredStats.updown ||
                            selectedStats.updown;

                        const showPenalties =
                            requiredStats.penalties ||
                            selectedStats.penalties;

                        const showDriveDistance =
                            requiredStats.driveDistance ||
                            selectedStats.driveDistance;

                        const reserveTopRowRightSlot =
                            !showPutts;

                        return (
                            <View style={styles.playerCard}>
                                <View style={styles.playerTopRow}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.playerName}>{item._name}</Text>

                                        {claimable ? (
                                            <View style={{ marginTop: 8 }}>
                                                <Pressable
                                                    disabled={toInt(val.strokes) <= 0}
                                                    onPress={async () => {
                                                        const isClaimed = claimStatus === "claimed" && !!holderPid;
                                                        const isOtherHolder = isClaimed && holderPid !== pid;

                                                        if (isOtherHolder) {
                                                            Alert.alert("Overwrite claim?", `Current holder is ${holderName || "Player"}. Claim for ${item._name}?`, [
                                                                { text: "Cancel", style: "cancel" },
                                                                {
                                                                    text: "Claim",
                                                                    style: "default",
                                                                    onPress: async () => {
                                                                        const ok = await saveClaim(pid, item._name);
                                                                        if (!ok) Alert.alert("Claim failed", "Could not save the claim. Please try again.");
                                                                    },
                                                                },
                                                            ]);
                                                            return;
                                                        }

                                                        const ok = await saveClaim(pid, item._name);
                                                        if (!ok) {
                                                            Alert.alert("Claim failed", "Could not save the claim. Please try again.");
                                                            return;
                                                        }
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.claimBtn,
                                                        claimStatus === "claimed" && holderPid === pid && styles.claimBtnClaimed,
                                                        toInt(val.strokes) <= 0 && styles.claimBtnDisabled,
                                                        pressed && styles.pressed,
                                                    ]}
                                                >
                                                    <Text style={[styles.claimBtnText, claimStatus === "claimed" && holderPid === pid && styles.claimBtnTextClaimed]}>
                                                        {claimStatus === "claimed" && holderPid === pid ? "Claimed" : toInt(val.strokes) <= 0 ? "Claim (enter strokes first)" : "Claim"}
                                                    </Text>
                                                </Pressable>
                                            </View>
                                        ) : null}
                                    </View>

                                    <Pressable
                                        onPress={() => openStatsModal(pid)}
                                        style={({ pressed }) => [
                                            styles.statsPill,
                                            (showPutts || showFairway || showGreen || showSandSave || showUpdown || showPenalties || showDriveDistance) ? styles.statsPillOn : styles.statsPillOff,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={styles.statsPillText}>
                                            Stats {(showPutts || showFairway || showGreen || showSandSave || showUpdown || showPenalties || showDriveDistance) ? "ON" : "OFF"}
                                        </Text>
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

                                    {showPutts ? (
                                        <Pressable onPress={() => openPicker(pid, "putts")} style={({ pressed }) => [styles.fieldWrap, pressed && styles.pressed]}>
                                            <Text style={styles.fieldLabel}>Putts</Text>
                                            <View style={styles.valueBox}>
                                                <Text style={styles.valueText}>{String(Math.max(0, Math.min(10, putts)))}</Text>
                                            </View>
                                            <Text style={styles.fieldHint}>0–10</Text>
                                        </Pressable>
                                    ) : reserveTopRowRightSlot ? (
                                        <View style={[styles.fieldWrap, styles.fieldWrapPlaceholder]} />
                                    ) : null}
                                </View>

                                {(showFairway || showGreen || showSandSave || showUpdown || showPenalties || showDriveDistance) ? (
                                    <>
                                        <View style={styles.divider} />

                                        {showFairway ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>Fairway Hit</Text>
                                                    <Text style={styles.statHint}>Off the tee</Text>
                                                </View>
                                                <Seg3
                                                    value={val.fairway ?? "na"}
                                                    onChange={(v) => setPlayerField(pid, "fairway", v)}
                                                    allowNA={!requiredStats.fairway}
                                                />
                                            </View>
                                        ) : null}

                                        {showGreen ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>GIR</Text>
                                                    <Text style={styles.statHint}>Green in regulation</Text>
                                                </View>
                                                <Seg3
                                                    value={val.green ?? "na"}
                                                    onChange={(v) => setPlayerField(pid, "green", v)}
                                                    allowNA={!requiredStats.green}
                                                />
                                            </View>
                                        ) : null}

                                        {showSandSave ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>Sand Save</Text>
                                                    <Text style={styles.statHint}>Bunker save</Text>
                                                </View>
                                                <Seg3 value={val.sandSave ?? "na"} onChange={(v) => setPlayerField(pid, "sandSave", v)} />
                                            </View>
                                        ) : null}

                                        {showUpdown ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>Up & Down</Text>
                                                    <Text style={styles.statHint}>Save par or better</Text>
                                                </View>
                                                <Seg3 value={val.updown ?? "na"} onChange={(v) => setPlayerField(pid, "updown", v)} />
                                            </View>
                                        ) : null}

                                        {showPenalties ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>Penalties</Text>
                                                    <Text style={styles.statHint}>Penalty strokes</Text>
                                                </View>

                                                <Pressable
                                                    onPress={() => openPicker(pid, "penalties")}
                                                    style={({ pressed }) => [styles.fieldWrap, styles.inlineValueFieldWrap, pressed && styles.pressed]}
                                                >
                                                    <View style={styles.valueBox}>
                                                        <Text style={styles.valueText}>
                                                            {String(toInt(val.penalties) || 0)}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.fieldHint}>0–10</Text>
                                                </Pressable>
                                            </View>
                                        ) : null}

                                        {showDriveDistance ? (
                                            <View style={styles.statRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.statTitle}>Drive Distance</Text>
                                                    <Text style={styles.statHint}>Yards</Text>
                                                </View>

                                                <Pressable
                                                    onPress={() => openPicker(pid, "driveDistance")}
                                                    style={({ pressed }) => [styles.fieldWrap, styles.inlineValueFieldWrap, pressed && styles.pressed]}
                                                >
                                                    <View style={styles.valueBox}>
                                                        <Text style={styles.valueText}>
                                                            {String(val.driveDistance ?? "").trim().toLowerCase() === "na"
                                                                ? "N/A"
                                                                : String(toInt(val.driveDistance) || 0)}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.fieldHint}>0–400 or N/A</Text>
                                                </Pressable>
                                            </View>
                                        ) : null}
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
                    onPress={onNextHole}
                    style={({ pressed }) => [styles.primaryBtnFull, pressed && styles.pressed]}
                >
                    <Text style={styles.primaryText}>Save • Next</Text>
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
                            const curVal =
                                pickField === "putts"
                                    ? toInt(cur.putts)
                                    : pickField === "penalties"
                                        ? toInt(cur.penalties)
                                        : pickField === "driveDistance"
                                            ? (String(cur.driveDistance ?? "").trim().toLowerCase() === "na" ? "__na__" : toInt(cur.driveDistance))
                                            : toInt(cur.strokes);

                            const active = pickField === "driveDistance"
                                ? Number(curVal) === Number(n)
                                : Number(curVal) === Number(n);

                            return <NumberChip key={`num-${n}`} n={n} active={active} onPress={() => onTapNumber(n)} />;
                        })}

                        {pickField === "driveDistance" ? (
                            <Pressable
                                onPress={onTapDriveDistanceNA}
                                style={({ pressed }) => [
                                    styles.numChip,
                                    String(inputs?.[String(pickPid)]?.driveDistance ?? "").trim().toLowerCase() === "na" && styles.numChipOn,
                                    pressed && styles.pressed,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.numChipText,
                                        String(inputs?.[String(pickPid)]?.driveDistance ?? "").trim().toLowerCase() === "na" && styles.numChipTextOn,
                                    ]}
                                >
                                    N/A
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>

                    <Text style={styles.numHint}>
                        {pickField === "putts"
                            ? "Tap 0–10"
                            : pickField === "penalties"
                                ? "Tap 0–10"
                                : pickField === "driveDistance"
                                    ? "Tap 0–400 or N/A"
                                    : "Tap 1–10"}
                    </Text>
                </View>
            </Modal>

            <Modal visible={statsModalOpen} transparent animationType="fade" onRequestClose={closeStatsModal}>
                <View style={styles.centerModalBackdrop}>
                    <View style={styles.centerModalCard}>
                        <View style={styles.centerModalHeaderRow}>
                            <Text style={styles.centerModalTitleLeft}>
                                {statsModalPlayer?._name ? `${statsModalPlayer._name} Stats` : "Player Stats"}
                            </Text>

                            <Pressable
                                onPress={toggleAllStatsForModalPlayer}
                                style={({ pressed }) => [
                                    styles.selectAllBtn,
                                    allOptionalStatsSelected ? styles.selectAllBtnActive : null,
                                    pressed && styles.pressed,
                                ]}
                            >
                                <Text style={styles.selectAllBtnText}>
                                    {allOptionalStatsSelected ? "Clear Optional" : "Select All"}
                                </Text>
                            </Pressable>
                        </View>

                        <Text style={styles.centerModalSubtext}>
                            Choose which stats to track for this player.
                        </Text>

                        {statsModalValue ? (
                            <>
                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Putts</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            disabled={statsModalRequired.putts}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    putts: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                (statsModalRequired.putts || statsModalValue?.selectedStats?.putts === true) && styles.statsChoiceBtnOn,
                                                statsModalRequired.putts && styles.statsChoiceBtnLocked,
                                                pressed && !statsModalRequired.putts && styles.pressed,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    (statsModalRequired.putts || statsModalValue?.selectedStats?.putts === true) && styles.statsChoiceBtnTextOn,
                                                ]}
                                            >
                                                {statsModalRequired.putts ? "On • Locked" : "On"}
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            disabled={statsModalRequired.putts}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    putts: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                !statsModalRequired.putts && statsModalValue?.selectedStats?.putts === false && styles.statsChoiceBtnOff,
                                                pressed && !statsModalRequired.putts && styles.pressed,
                                                statsModalRequired.putts && styles.statsChoiceBtnDisabled,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    !statsModalRequired.putts && statsModalValue?.selectedStats?.putts === false && styles.statsChoiceBtnTextOn,
                                                    statsModalRequired.putts && styles.statsChoiceBtnTextDisabled,
                                                ]}
                                            >
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Fairway Hit</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            disabled={statsModalRequired.fairway}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    fairway: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                (statsModalRequired.fairway || statsModalValue?.selectedStats?.fairway === true) && styles.statsChoiceBtnOn,
                                                statsModalRequired.fairway && styles.statsChoiceBtnLocked,
                                                pressed && !statsModalRequired.fairway && styles.pressed,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    (statsModalRequired.fairway || statsModalValue?.selectedStats?.fairway === true) && styles.statsChoiceBtnTextOn,
                                                ]}
                                            >
                                                {statsModalRequired.fairway ? "On • Locked" : "On"}
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            disabled={statsModalRequired.fairway}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    fairway: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                !statsModalRequired.fairway && statsModalValue?.selectedStats?.fairway === false && styles.statsChoiceBtnOff,
                                                pressed && !statsModalRequired.fairway && styles.pressed,
                                                statsModalRequired.fairway && styles.statsChoiceBtnDisabled,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    !statsModalRequired.fairway && statsModalValue?.selectedStats?.fairway === false && styles.statsChoiceBtnTextOn,
                                                    statsModalRequired.fairway && styles.statsChoiceBtnTextDisabled,
                                                ]}
                                            >
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>GIR</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            disabled={statsModalRequired.green}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    green: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                (statsModalRequired.green || statsModalValue?.selectedStats?.green === true) && styles.statsChoiceBtnOn,
                                                statsModalRequired.green && styles.statsChoiceBtnLocked,
                                                pressed && !statsModalRequired.green && styles.pressed,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    (statsModalRequired.green || statsModalValue?.selectedStats?.green === true) && styles.statsChoiceBtnTextOn,
                                                ]}
                                            >
                                                {statsModalRequired.green ? "On • Locked" : "On"}
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            disabled={statsModalRequired.green}
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    green: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                !statsModalRequired.green && statsModalValue?.selectedStats?.green === false && styles.statsChoiceBtnOff,
                                                pressed && !statsModalRequired.green && styles.pressed,
                                                statsModalRequired.green && styles.statsChoiceBtnDisabled,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.statsChoiceBtnText,
                                                    !statsModalRequired.green && statsModalValue?.selectedStats?.green === false && styles.statsChoiceBtnTextOn,
                                                    statsModalRequired.green && styles.statsChoiceBtnTextDisabled,
                                                ]}
                                            >
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Sand Save</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    sandSave: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.sandSave === true && styles.statsChoiceBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.sandSave === true && styles.statsChoiceBtnTextOn]}>
                                                On
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    sandSave: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.sandSave === false && styles.statsChoiceBtnOff,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.sandSave === false && styles.statsChoiceBtnTextOn]}>
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Up & Down</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    updown: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.updown === true && styles.statsChoiceBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.updown === true && styles.statsChoiceBtnTextOn]}>
                                                On
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    updown: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.updown === false && styles.statsChoiceBtnOff,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.updown === false && styles.statsChoiceBtnTextOn]}>
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Penalties</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    penalties: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.penalties === true && styles.statsChoiceBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.penalties === true && styles.statsChoiceBtnTextOn]}>
                                                On
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    penalties: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.penalties === false && styles.statsChoiceBtnOff,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.penalties === false && styles.statsChoiceBtnTextOn]}>
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <View style={styles.statsChoiceRow}>
                                    <Text style={styles.statsChoiceLabel}>Drive Distance</Text>
                                    <View style={styles.statsChoiceButtons}>
                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    driveDistance: true,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.driveDistance === true && styles.statsChoiceBtnOn,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.driveDistance === true && styles.statsChoiceBtnTextOn]}>
                                                On
                                            </Text>
                                        </Pressable>

                                        <Pressable
                                            onPress={() =>
                                                setPlayerField(statsModalPid, "selectedStats", {
                                                    ...(statsModalValue?.selectedStats || {}),
                                                    driveDistance: false,
                                                })
                                            }
                                            style={({ pressed }) => [
                                                styles.statsChoiceBtn,
                                                statsModalValue?.selectedStats?.driveDistance === false && styles.statsChoiceBtnOff,
                                                pressed && styles.pressed,
                                            ]}
                                        >
                                            <Text style={[styles.statsChoiceBtnText, statsModalValue?.selectedStats?.driveDistance === false && styles.statsChoiceBtnTextOn]}>
                                                Off
                                            </Text>
                                        </Pressable>
                                    </View>
                                </View>

                                <Pressable onPress={closeStatsModal} style={({ pressed }) => [styles.centerModalSaveBtn, pressed && styles.pressed]}>
                                    <Text style={styles.centerModalSaveBtnText}>Exit & Save</Text>
                                </Pressable>
                            </>
                        ) : null}
                    </View>
                </View>
            </Modal>
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    body: { flex: 1, paddingHorizontal: 16 },

    playerCard: {
        backgroundColor: CARD,
        borderRadius: 18,
        padding: 8,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.35)",
    },

    playerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
    playerName: { flex: 1, color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },

    statsPill: {
        height: 26,
        paddingHorizontal: 8,
        borderRadius: 999,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    statsPillOn: { backgroundColor: "rgba(46,204,113,0.16)", borderColor: "rgba(46,204,113,0.30)" },
    statsPillOff: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" },
    statsPillText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    claimBtn: {
        height: 32,
        borderRadius: 14,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(242,201,76,0.18)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.42)",
    },
    claimBtnDisabled: { opacity: 0.45 },
    claimBtnClaimed: { backgroundColor: "rgba(242,201,76,0.75)", borderColor: "rgba(242,201,76,0.95)" },
    claimBtnTextClaimed: { color: "#0B1220" },
    claimBtnText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },

    sideGameBanner: {
        marginTop: 10,
        marginBottom: 8,
        borderRadius: 22,
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.28)",
        backgroundColor: "rgba(255,255,255,0.06)",
        alignItems: "center",
    },
    sideGameTitle: { color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.6, textAlign: "center" },
    sideGameSub: { marginTop: 8, color: "rgba(255,255,255,0.72)", fontWeight: "800", fontSize: 12, textAlign: "center" },

    sideGameBtnsRow: {
        marginTop: 10,
        width: "100%",
        flexDirection: "row",
        gap: 10,
        alignItems: "stretch",
        justifyContent: "space-between",
    },
    sideBtn: {
        flex: 1,
        height: 44,
        paddingHorizontal: 12,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    sideBtnMuted: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.10)", opacity: 0.6 },
    sideBtnTextMuted: { opacity: 0.7 },

    sideBtnUnclaimed: { backgroundColor: "rgba(255,80,80,0.10)", borderColor: "rgba(255,80,80,0.22)" },
    sideBtnUnclaimedOn: { backgroundColor: "rgba(255,80,80,0.18)", borderColor: "rgba(255,80,80,0.45)" },

    sideBtnCarry: { backgroundColor: "rgba(46,125,255,0.14)", borderColor: "rgba(46,125,255,0.28)" },
    sideBtnCarryOn: { backgroundColor: "rgba(46,125,255,0.26)", borderColor: "rgba(46,125,255,0.60)" },

    sideBtnText: { color: WHITE, fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },

    inputRow: { flexDirection: "row", gap: 8, marginTop: 6 },
    fieldWrap: {
        flex: 1,
        backgroundColor: INNER,
        borderRadius: 14,
        padding: 8,
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.35)",
    },
    fieldWrapPlaceholder: {
        opacity: 0,
    },
    inlineValueFieldWrap: {
        flex: 0,
        width: 118,
        padding: 8,
    },
    fieldLabel: { color: MUTED, fontWeight: "900", fontSize: 9, letterSpacing: 0.4 },
    valueBox: {
        marginTop: 6,
        height: 38,
        borderRadius: 12,
        backgroundColor: "rgba(0,0,0,0.22)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    valueText: { color: WHITE, fontSize: 17, fontWeight: "900", letterSpacing: 0.2 },
    fieldHint: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontWeight: "800", fontSize: 8, letterSpacing: 0.2 },

    divider: { marginTop: 10, height: 1, backgroundColor: "rgba(255,255,255,0.10)" },
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
    segBtnActive: { borderColor: "rgba(46,125,255,0.65)", backgroundColor: "rgba(46,125,255,0.22)" },
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
    primaryBtnFull: {
        height: 56,
        borderRadius: 18,
        backgroundColor: GREEN,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
    },
    primaryBtnFullFinish: {
        backgroundColor: "rgba(46,125,255,0.22)",
        borderWidth: 3,
        borderColor: YELLOW,
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

    centerModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.60)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
    },
    centerModalCard: {
        width: "100%",
        maxWidth: 520,
        backgroundColor: "#0F1B33",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        padding: 18,
    },
    centerModalHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    centerModalTitle: {
        color: WHITE,
        fontWeight: "900",
        fontSize: 22,
        letterSpacing: 0.2,
        textAlign: "center",
    },
    centerModalTitleLeft: {
        flex: 1,
        color: WHITE,
        fontWeight: "900",
        fontSize: 22,
        letterSpacing: 0.2,
        textAlign: "left",
    },
    centerModalSubtext: {
        marginTop: 10,
        marginBottom: 16,
        color: "rgba(255,255,255,0.70)",
        fontWeight: "700",
        fontSize: 13,
        lineHeight: 18,
        textAlign: "left",
    },
    selectAllBtn: {
        minWidth: 112,
        height: 38,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.07)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    selectAllBtnActive: {
        backgroundColor: "rgba(46,204,113,0.18)",
        borderColor: "rgba(46,204,113,0.46)",
    },
    selectAllBtnText: {
        color: WHITE,
        fontWeight: "900",
        fontSize: 12,
        letterSpacing: 0.2,
    },
    statsChoiceRow: {
        minHeight: 62,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.05)",
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    statsChoiceLabel: {
        flex: 1,
        color: WHITE,
        fontWeight: "900",
        fontSize: 15,
        letterSpacing: 0.2,
    },
    statsChoiceButtons: {
        flexDirection: "row",
        gap: 8,
    },
    statsChoiceBtn: {
        minWidth: 62,
        height: 38,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.07)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    statsChoiceBtnOn: {
        backgroundColor: "rgba(46,204,113,0.18)",
        borderColor: "rgba(46,204,113,0.46)",
    },
    statsChoiceBtnOff: {
        backgroundColor: "rgba(255,255,255,0.12)",
        borderColor: "rgba(255,255,255,0.24)",
    },
    statsChoiceBtnLocked: {
        backgroundColor: "rgba(46,204,113,0.24)",
        borderColor: "rgba(46,204,113,0.62)",
    },
    statsChoiceBtnDisabled: {
        opacity: 0.45,
    },
    statsChoiceBtnText: {
        color: "rgba(255,255,255,0.84)",
        fontWeight: "900",
        fontSize: 13,
        letterSpacing: 0.2,
    },
    statsChoiceBtnTextOn: {
        color: WHITE,
    },
    statsChoiceBtnTextDisabled: {
        color: "rgba(255,255,255,0.42)",
    },
    centerModalSaveBtn: {
        marginTop: 10,
        height: 52,
        borderRadius: 16,
        backgroundColor: GREEN,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    centerModalSaveBtnText: {
        color: WHITE,
        fontWeight: "900",
        fontSize: 16,
        letterSpacing: 0.2,
    },
});