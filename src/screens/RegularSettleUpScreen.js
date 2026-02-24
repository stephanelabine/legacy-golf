// src/screens/RegularSettleUpScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, onSnapshot } from "firebase/firestore";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ScreenHeader from "../components/ScreenHeader";
import ROUTES from "../navigation/routes";
import { getRoundById } from "../storage/rounds";
import { auth, db } from "../firebase/firebase";

const BG = "#06150F";
const CARD = "rgba(18,22,30,0.92)";
const ROW = "#1D3557";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";

function toInt(v) {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return "$0";
    const fixed = Math.round(v * 100) / 100;
    return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function uniqInts(arr) {
    const s = new Set();
    (arr || []).forEach((x) => {
        const v = Number(x);
        if (Number.isFinite(v)) s.add(Math.round(v));
    });
    return Array.from(s).sort((a, b) => a - b);
}

function normKey(x) {
    return String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Supports BOTH storage shapes:
// A) roundState: holes["1"].players["p1"].strokes
// B) rounds.js legacy: holes[0].scores["p1"] = strokes
function readStroke(roundRoot, holeNumber, playerId) {
    const rid = String(playerId);

    const a =
        roundRoot?.holes?.[String(holeNumber)]?.players?.[rid]?.strokes ??
        roundRoot?.holes?.[String(holeNumber)]?.scores?.[rid];
    const aInt = toInt(a);
    if (aInt > 0) return aInt;

    const holesArr = Array.isArray(roundRoot?.holes) ? roundRoot.holes : null;
    if (holesArr && holeNumber >= 1 && holeNumber <= holesArr.length) {
        const h = holesArr[holeNumber - 1];
        const b = h?.scores?.[rid] ?? h?.strokes?.[rid];
        const bInt = toInt(b);
        if (bInt > 0) return bInt;
    }

    return 0;
}

// IMPORTANT: detect “second shot kp” before “kp”
function detectFormatType(key, name) {
    const k = normKey(key);
    const n = normKey(name);
    const s = `${k} ${n}`.trim();

    const isSecondShot =
        s.includes("secondshotkp") ||
        s.includes("secondshot") ||
        (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
        s.includes("2ndshotkp") ||
        (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

    if (isSecondShot) return "secondshotkp";
    if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";
    if (s.includes("deucepot") || (s.includes("deuce") && s.includes("pot"))) return "deucepot";
    if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "puttingcontest";
    if (s.includes("teamvsteam") || (s.includes("team") && s.includes("vs") && s.includes("team"))) return "teamvsteam";
    if (s.includes("kp")) return "kp";
    return "unknown";
}

function getConfigByKeyFromRoundDoc(doc) {
    const c1 = doc?.configByKey;
    const c2 = doc?.formatConfigByKey;
    const c3 = doc?.formatDetailsByKey;
    const c4 = doc?.formatsConfigByKey;
    const c5 = doc?.formatsConfig;
    const c6 = doc?.formatConfig;
    return (
        (c1 && typeof c1 === "object" && c1) ||
        (c2 && typeof c2 === "object" && c2) ||
        (c3 && typeof c3 === "object" && c3) ||
        (c4 && typeof c4 === "object" && c4) ||
        (c5 && typeof c5 === "object" && c5) ||
        (c6 && typeof c6 === "object" && c6) ||
        {}
    );
}

function getFormatPools(roundDoc) {
    const pools =
        roundDoc?.formatPools && typeof roundDoc.formatPools === "object"
            ? roundDoc.formatPools
            : null;
    return pools || null;
}

function getIncludedPlayerIds(roundDoc, formatKey, playersList) {
    const pools = getFormatPools(roundDoc) || {};
    const excluded = Array.isArray(pools?.[formatKey]?.excludedIds)
        ? pools[formatKey].excludedIds
        : [];

    const excludedSet = new Set(excluded.map((x) => String(x)));
    const list = Array.isArray(playersList) ? playersList : [];

    return list
        .map((p) => String(p?.id ?? ""))
        .filter((id) => id && !excludedSet.has(id));
}

// Regular official holes from configByKey:
// - cfg.holes
// - cfg.holesSelected
// - cfg.holesByRound.r1
function getOfficialHolesForFormat(roundDoc, formatKey) {
    const cfgAll = getConfigByKeyFromRoundDoc(roundDoc);
    const cfg = cfgAll?.[String(formatKey)] || cfgAll?.[normKey(formatKey)] || null;
    if (!cfg || typeof cfg !== "object") return [];

    const holes = Array.isArray(cfg?.holes) ? cfg.holes : null;
    const holesSelected = Array.isArray(cfg?.holesSelected) ? cfg.holesSelected : null;
    const holesByRound = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : null;
    const holesR1 = holesByRound && Array.isArray(holesByRound?.r1) ? holesByRound.r1 : null;

    const list = holesR1 || holesSelected || holes || [];
    return uniqInts(list).filter((h) => h >= 1 && h <= 18);
}

function getEntryFee(roundDoc, formatKey) {
    const pools = getFormatPools(roundDoc);
    if (pools && pools?.[formatKey]) {
        const p = pools[formatKey];
        const fee =
            Number(p?.entryFee) ||
            Number(p?.buyIn) ||
            Number(p?.buyInAmount) ||
            Number(p?.amountPerHole) ||
            Number(p?.amountPerSkin) ||
            0;
        return Number.isFinite(fee) && fee > 0 ? fee : 0;
    }

    const feeByKey = roundDoc?.feeByKey && typeof roundDoc.feeByKey === "object" ? roundDoc.feeByKey : null;
    const n = feeByKey ? Number(feeByKey?.[formatKey]) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function greedySettlement(netById, playersById) {
    const payers = [];
    const receivers = [];

    Object.keys(netById || {}).forEach((pid) => {
        const v = Number(netById[pid] || 0);
        if (!Number.isFinite(v) || Math.abs(v) < 0.005) return;
        if (v < 0) payers.push({ id: pid, amt: -v });
        if (v > 0) receivers.push({ id: pid, amt: v });
    });

    payers.sort((a, b) => b.amt - a.amt);
    receivers.sort((a, b) => b.amt - a.amt);

    const transfers = [];
    let i = 0;
    let j = 0;

    while (i < payers.length && j < receivers.length) {
        const p = payers[i];
        const r = receivers[j];

        const send = Math.min(p.amt, r.amt);
        if (send > 0.005) {
            transfers.push({
                fromId: p.id,
                toId: r.id,
                amount: send,
                fromName: playersById?.[p.id]?.name || "Player",
                toName: playersById?.[r.id]?.name || "Player",
            });
        }

        p.amt -= send;
        r.amt -= send;

        if (p.amt <= 0.005) i += 1;
        if (r.amt <= 0.005) j += 1;
    }

    return transfers;
}

export default function RegularSettleUpScreen({ navigation, route }) {
    const params = route?.params || {};
    const roundId = String(params.roundId || "");

    const [round, setRound] = useState(null);
    const [loading, setLoading] = useState(true);

    const [claimsByFormat, setClaimsByFormat] = useState({}); // normKey -> { holeStr: claimDoc }

    const courseName = String(round?.courseName || round?.course?.name || "Course");
    const teeName = String(round?.teeName || round?.tee?.name || "Tees");

    function onBack() {
        navigation.goBack();
    }

    function onExit() {
        Alert.alert("Exit settle up?", "Return to Home?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Exit",
                style: "destructive",
                onPress: () => navigation.navigate(ROUTES.HOME),
            },
        ]);
    }

    useFocusEffect(
        useCallback(() => {
            let live = true;
            setLoading(true);

            (async () => {
                try {
                    const r = roundId ? await getRoundById(roundId) : null;
                    if (!live) return;
                    setRound(r || null);
                } catch {
                    if (!live) return;
                    setRound(null);
                } finally {
                    if (live) setLoading(false);
                }
            })();

            return () => {
                live = false;
            };
        }, [roundId])
    );

    // Live claims snapshot (single source of truth)
    useFocusEffect(
        useCallback(() => {
            const uid = auth?.currentUser?.uid;
            if (!uid || !roundId) return undefined;

            const ref = collection(db, "users", String(uid), "rounds", String(roundId), "formatClaims");

            const unsub = onSnapshot(
                ref,
                (snap) => {
                    const map = {};
                    snap.forEach((d) => {
                        const id = String(d.id || "");
                        const m = id.match(/^(.*)_h(\d+)$/);
                        if (!m) return;

                        const rawKey = String(m[1] || "").trim();
                        const hole = String(Number(m[2] || 0));
                        if (!rawKey || !hole || hole === "0") return;

                        const nk = normKey(rawKey);
                        if (!nk) return;

                        if (!map[nk]) map[nk] = {};
                        map[nk][hole] = d.data() || {};
                    });

                    setClaimsByFormat(map);
                },
                () => setClaimsByFormat({})
            );

            return () => unsub();
        }, [roundId])
    );

    const players = useMemo(() => {
        const list = Array.isArray(round?.players) ? round.players : [];
        return list.map((p, idx) => ({
            id: String(p?.id ?? String(idx)),
            name: String(p?.name || `Player ${idx + 1}`),
        }));
    }, [round]);

    const playersById = useMemo(() => {
        const m = {};
        players.forEach((p) => {
            m[String(p.id)] = p;
        });
        return m;
    }, [players]);

    const formatsSelected = useMemo(() => {
        const raw = Array.isArray(round?.formatsSelected) ? round.formatsSelected : [];
        const out = raw
            .map((x) => {
                if (typeof x === "string") return { key: String(x).trim(), name: String(x).trim() };
                const k = String(x?.key || x?.id || x?.formatKey || "").trim();
                const n = String(x?.name || x?.title || k || "").trim();
                return k ? { key: k, name: n || k } : null;
            })
            .filter(Boolean);

        return out;
    }, [round]);

    const settleModel = useMemo(() => {
        const r = round || {};

        // Used for WHO PAYS WHO (gross money flow)
        const netById = {};
        const paidById = {};
        const wonById = {}; // gross winnings (full pots)

        // Used for WHO WON WHAT (credit view)
        // Shows ONLY what a player “won” based on their own entry fee for that format.
        const wonCreditById = {};

        // Track ONLY hole-format winnings (KP/LD/2ndKP) for the non-top balancing rule
        const holeWonById = {};

        players.forEach((p) => {
            const id = String(p.id);
            netById[id] = 0;
            paidById[id] = 0;
            wonById[id] = 0;
            wonCreditById[id] = 0;
            holeWonById[id] = 0;
        });

        // DETAILED settlement:
        // - WHO PAYS WHO = per-format settlements combined (no global netting)
        const detailedTransfers = [];

        const addPaidGlobal = (pid, amt) => {
            const key = String(pid || "");
            const a = Number(amt || 0);
            if (!Number.isFinite(a) || a <= 0) return;
            paidById[key] = (paidById[key] || 0) + a;
            netById[key] = (netById[key] || 0) - a;
        };

        const addWonGlobal = (pid, amt) => {
            const key = String(pid || "");
            const a = Number(amt || 0);
            if (!Number.isFinite(a) || a <= 0) return;
            wonById[key] = (wonById[key] || 0) + a;
            netById[key] = (netById[key] || 0) + a;
        };

        const addWonCredit = (pid, amt) => {
            const key = String(pid || "");
            const a = Number(amt || 0);
            if (!Number.isFinite(a) || a <= 0) return;
            wonCreditById[key] = (wonCreditById[key] || 0) + a;
        };

        const readPutts = (holeNumber, pid) => {
            const p = String(pid || "");
            const h = String(holeNumber || "");
            const raw =
                r?.holes?.[h]?.players?.[p]?.putts ??
                r?.holes?.[h]?.players?.[p]?.stats?.putts;

            // If missing/blank, treat as “no data”, not a real 0.
            if (raw === undefined || raw === null || String(raw).trim() === "") {
                return { has: false, n: 0 };
            }

            const n = toInt(raw);
            // Allow 0 as valid (chip-in / holed out)
            if (!Number.isFinite(n) || n < 0) return { has: false, n: 0 };
            return { has: true, n };
        };

        const getPuttingStatsFromRound = (pid) => {
            let total = 0;
            let holesWithData = 0;
            let zero = 0;
            let one = 0;
            let three = 0;

            for (let h = 1; h <= 18; h++) {
                const v = readPutts(h, pid);
                if (!v.has) continue;
                holesWithData += 1;
                total += v.n;
                if (v.n === 0) zero += 1;
                if (v.n === 1) one += 1;
                if (v.n === 3) three += 1;
            }

            return { total, holesWithData, zero, one, three };
        };

        formatsSelected.forEach((f) => {
            const formatKey = String(f.key || "").trim();
            const rawName = String(f.name || f.key || "Format");
            const type = detectFormatType(formatKey, rawName);
            if (!formatKey) return;

            const includedIds = getIncludedPlayerIds(r, formatKey, players);
            const includedCount = includedIds.length;
            const fee = getEntryFee(r, formatKey);

            // Per-format mini-ledger (only included players participate)
            const fmtNetById = {};
            includedIds.forEach((pid) => {
                fmtNetById[String(pid)] = 0;
            });

            const addPaidFmt = (pid, amt) => {
                const a = Number(amt || 0);
                const key = String(pid || "");
                if (!Number.isFinite(a) || a <= 0) return;
                if (!(key in fmtNetById)) return;
                fmtNetById[key] = (fmtNetById[key] || 0) - a;
            };

            const addWonFmt = (pid, amt) => {
                const a = Number(amt || 0);
                const key = String(pid || "");
                if (!Number.isFinite(a) || a <= 0) return;
                if (!(key in fmtNetById)) return;
                fmtNetById[key] = (fmtNetById[key] || 0) + a;
            };

            if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                const holes = getOfficialHolesForFormat(r, formatKey);

                // WIN-COUNT settlement model (your requested model):
                // - Count funded wins per player (carryover stacks as extra funded wins)
                // - Settle head-to-head differences:
                //   if A has 2 wins and B has 1 win => B pays A $5
                const perWin = fee > 0 ? fee : 0;

                const includedSet = new Set((includedIds || []).map((x) => String(x)));
                const nk = normKey(formatKey);
                const claimsMap = claimsByFormat?.[nk] || {};

                // Each entry = one funded win (carryovers become extra funded wins)
                const payoutWinnerIds = [];

                for (let i = 0; i < holes.length; i++) {
                    const h = holes[i];
                    const c = claimsMap?.[String(h)] || null;

                    const statusRaw = String(c?.status || "").toLowerCase();
                    const isCarry = statusRaw === "carry_over" || statusRaw === "carryover";

                    const directWinnerId = String(c?.claimedByPlayerId || "").trim();
                    if (directWinnerId && includedSet.has(directWinnerId)) {
                        payoutWinnerIds.push(directWinnerId);
                        continue;
                    }

                    if (isCarry) {
                        let resolvedId = "";
                        for (let j = i + 1; j < holes.length; j++) {
                            const h2 = holes[j];
                            const c2 = claimsMap?.[String(h2)] || null;
                            const nm2 = String(c2?.claimedByPlayerId || "").trim();
                            if (nm2 && includedSet.has(nm2)) {
                                resolvedId = nm2;
                                break;
                            }
                        }
                        if (resolvedId) payoutWinnerIds.push(resolvedId);
                    }
                }

                // Count wins per included player
                const winsById = {};
                includedIds.forEach((pid) => {
                    winsById[String(pid)] = 0;
                });

                payoutWinnerIds.forEach((winnerId) => {
                    const wid = String(winnerId || "").trim();
                    if (!wid || !includedSet.has(wid)) return;
                    winsById[wid] = (winsById[wid] || 0) + 1;

                    // WHO WON WHAT (credit) = $5 per funded win (or whatever perWin is)
                    if (perWin > 0) {
                        addWonCredit(wid, perWin);

                        // Track hole-format winnings only (for non-top balancing)
                        holeWonById[wid] = (holeWonById[wid] || 0) + perWin;
                    }
                });

                // Build head-to-head transfers (THIS creates Don -> Bill / Guido style lines)
                const ids = includedIds.map((x) => String(x)).filter(Boolean);

                if (perWin > 0 && ids.length > 1) {
                    for (let a = 0; a < ids.length; a++) {
                        for (let b = a + 1; b < ids.length; b++) {
                            const idA = ids[a];
                            const idB = ids[b];

                            const wA = Number(winsById?.[idA] || 0);
                            const wB = Number(winsById?.[idB] || 0);
                            if (!Number.isFinite(wA) || !Number.isFinite(wB) || wA === wB) continue;

                            const diff = Math.abs(wA - wB);
                            const amt = perWin * diff;
                            if (!Number.isFinite(amt) || amt <= 0.005) continue;

                            // If A has more wins, B pays A
                            const fromId = wA > wB ? idB : idA;
                            const toId = wA > wB ? idA : idB;

                            // Update ledgers so fmtNetById and global nets stay coherent
                            addPaidGlobal(fromId, amt);
                            addWonGlobal(toId, amt);
                            addPaidFmt(fromId, amt);
                            addWonFmt(toId, amt);

                            detailedTransfers.push({
                                fromId,
                                toId,
                                amount: amt,
                                fromName: playersById?.[fromId]?.name || "Player",
                                toName: playersById?.[toId]?.name || "Player",
                                __kind: "hole_win_count",
                            });
                        }
                    }
                }
            } else if (type === "deucepot") {
                // Pool: everyone buys in fee, pot split by deuces made

                // WHO PAYS WHO uses gross pot (fee * players)
                includedIds.forEach((pid) => {
                    addPaidGlobal(pid, fee);
                    addPaidFmt(pid, fee);
                });

                let totalDeuces = 0;
                const deucesById = {};
                includedIds.forEach((pid) => {
                    let count = 0;
                    for (let h = 1; h <= 18; h++) {
                        const s = readStroke(r, h, pid);
                        if (Number.isFinite(s) && s === 2) count += 1;
                    }
                    if (count > 0) {
                        deucesById[String(pid)] = count;
                        totalDeuces += count;
                    }
                });

                // Gross pot payout (WHO PAYS WHO)
                const potTotalGross = fee > 0 ? fee * includedCount : 0;
                const perDeuceGross = totalDeuces > 0 ? potTotalGross / totalDeuces : 0;

                Object.keys(deucesById).forEach((pid) => {
                    const amt = perDeuceGross * deucesById[pid];
                    addWonGlobal(pid, amt);
                    addWonFmt(pid, amt);
                });

                // Credit pot payout (WHO WON WHAT) = ONLY one entry fee worth of credit
                // Split by deuces made
                const potTotalCredit = fee > 0 ? fee : 0;
                const perDeuceCredit = totalDeuces > 0 ? potTotalCredit / totalDeuces : 0;

                Object.keys(deucesById).forEach((pid) => {
                    const credit = perDeuceCredit * deucesById[pid];
                    addWonCredit(pid, credit);
                });
            } else if (type === "puttingcontest") {
                // Pool: everyone buys in fee, pot paid by places (ties split)

                // WHO PAYS WHO uses gross pot (fee * players)
                includedIds.forEach((pid) => {
                    addPaidGlobal(pid, fee);
                    addPaidFmt(pid, fee);
                });

                const pools = getFormatPools(r) || {};
                const ppRaw = Number(pools?.[formatKey]?.payoutPlaces);
                const payoutPlaces = ppRaw === 2 || ppRaw === 3 ? ppRaw : 1;

                const splits =
                    payoutPlaces === 3
                        ? [0.6, 0.3, 0.1]
                        : payoutPlaces === 2
                            ? [0.75, 0.25]
                            : [1];

                const potTotalGross = fee > 0 ? fee * includedCount : 0;
                const potTotalCredit = fee > 0 ? fee : 0; // IMPORTANT: credit view uses ONLY the winner’s own entry fee

                const rows = includedIds
                    .map((pid) => {
                        const stats = getPuttingStatsFromRound(pid);
                        return {
                            id: String(pid),
                            name: playersById?.[pid]?.name || "Player",
                            total: stats.total,
                            holesWithData: stats.holesWithData,
                            zero: stats.zero,
                            one: stats.one,
                            three: stats.three,
                        };
                    })
                    .filter((x) => x.holesWithData > 0);

                // Winner selection + tie-break:
                // 1) lowest total putts
                // 2) most 0-putts
                // 3) least 3-putts
                // 4) most 1-putts
                rows.sort((a, b) => {
                    if (a.total !== b.total) return a.total - b.total;
                    if (a.zero !== b.zero) return b.zero - a.zero;
                    if (a.three !== b.three) return a.three - b.three;
                    if (a.one !== b.one) return b.one - a.one;
                    return a.name.localeCompare(b.name);
                });

                // Group “true ties” only when ALL tie-break fields match
                const groups = [];
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const last = groups[groups.length - 1];
                    const sameAsLast =
                        !!last &&
                        last.keyTotal === row.total &&
                        last.keyZero === row.zero &&
                        last.keyThree === row.three &&
                        last.keyOne === row.one;

                    if (!last || !sameAsLast) {
                        groups.push({
                            keyTotal: row.total,
                            keyZero: row.zero,
                            keyThree: row.three,
                            keyOne: row.one,
                            rows: [row],
                        });
                    } else {
                        last.rows.push(row);
                    }
                }

                for (let place = 0; place < splits.length; place++) {
                    const g = groups[place];
                    if (!g || !g.rows.length) continue;

                    // WHO PAYS WHO (gross)
                    const payoutForPlaceGross = potTotalGross * splits[place];
                    const eachGross = payoutForPlaceGross / g.rows.length;

                    // WHO WON WHAT (credit)
                    const payoutForPlaceCredit = potTotalCredit * splits[place];
                    const eachCredit = payoutForPlaceCredit / g.rows.length;

                    g.rows.forEach((x) => {
                        addWonGlobal(x.id, eachGross);
                        addWonFmt(x.id, eachGross);
                        addWonCredit(x.id, eachCredit);
                    });
                }
            } else {
                // Other pool-style formats: everyone buys in; (no payouts computed here)
                includedIds.forEach((pid) => {
                    addPaidGlobal(pid, fee);
                    addPaidFmt(pid, fee);
                });
            }

            // Convert THIS format’s net positions into transfers, and append (do NOT globally net)
            // IMPORTANT:
            // - Hole-based formats (kp/ld/2ndkp) already pushed WIN-COUNT transfers directly above.
            // - If we also greedy-settle here, we DOUBLE-COUNT and totals inflate.
            const isHoleWinCount =
                type === "kp" || type === "longdrive" || type === "secondshotkp";

            if (!isHoleWinCount) {
                const fmtTransfers = greedySettlement(fmtNetById, playersById) || [];
                fmtTransfers.forEach((t) => {
                    detailedTransfers.push(t);
                });
            }
        });
        // NON-TOP HOLE BALANCING (your rule)
        // - We do NOT want per-format head-to-head creating "Bill pays Don" just because Don won one sub-format.
        // - Instead: look at TOTAL hole-format winnings across KP/LD/2ndKP combined.
        // - Identify the TOP hole winner (usually Steph), EXCLUDE them from this balancing.
        // - Among the remaining players, if A won less than B in hole formats, A pays B the difference.
        //
        // This produces the expected:
        // Don ($5) pays Bill ($10) $5
        // Don ($5) pays Guido ($10) $5
        // and prevents Bill/Guido paying Don.
        const allIds = players.map((p) => String(p.id)).filter(Boolean);

        // Find top hole winner id (max holeWonById)
        let topHoleId = "";
        let topHoleAmt = -1;
        allIds.forEach((id) => {
            const v = Number(holeWonById?.[id] || 0);
            if (Number.isFinite(v) && v > topHoleAmt) {
                topHoleAmt = v;
                topHoleId = id;
            }
        });

        // Remove hole_win_count transfers that are BETWEEN NON-TOP players
        // (keep transfers involving topHoleId untouched)
        const filteredTransfers = (detailedTransfers || []).filter((t) => {
            const kind = String(t?.__kind || "");
            if (kind !== "hole_win_count") return true;

            const fromId = String(t?.fromId || "");
            const toId = String(t?.toId || "");

            // If either side is the top hole winner, keep it.
            if (fromId === topHoleId || toId === topHoleId) return true;

            // Otherwise remove (we will replace with correct combined-hole balancing)
            return false;
        });

        // Add the correct combined-hole balancing transfers among NON-TOP players only
        const nonTopIds = allIds.filter((id) => id && id !== topHoleId);

        for (let a = 0; a < nonTopIds.length; a++) {
            for (let b = 0; b < nonTopIds.length; b++) {
                if (a === b) continue;

                const idA = nonTopIds[a];
                const idB = nonTopIds[b];

                const wA = Number(holeWonById?.[idA] || 0);
                const wB = Number(holeWonById?.[idB] || 0);

                if (!Number.isFinite(wA) || !Number.isFinite(wB)) continue;
                if (wA >= wB) continue;

                const amt = wB - wA;
                if (!Number.isFinite(amt) || amt <= 0.005) continue;

                filteredTransfers.push({
                    fromId: idA,
                    toId: idB,
                    amount: amt,
                    fromName: playersById?.[idA]?.name || "Player",
                    toName: playersById?.[idB]?.name || "Player",
                    __kind: "hole_non_top_balance",
                });
            }
        }

        return { netById, paidById, wonById, wonCreditById, transfers: filteredTransfers };
    }, [round, players, playersById, formatsSelected, claimsByFormat]);

    const wonRows = useMemo(() => {
        const rows = players.map((p) => {
            // WHO WON WHAT = credit view (not gross pot totals)
            const won = Number(settleModel?.wonCreditById?.[p.id] || 0);
            return { id: p.id, name: p.name, won };
        });

        // Sort by most won, then name
        rows.sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));
        return rows;
    }, [players, settleModel]);

    if (loading) {
        return (
            <SafeAreaView style={styles.safe}>
                <ScreenHeader
                    navigation={navigation}
                    title="SETTLE UP"
                    titleAutoShrink
                    titleNumberOfLines={1}
                    subtitle={`${courseName} • ${teeName}`}
                    safeTop={false}
                    leftLabel="Back"
                    onLeftPress={onBack}
                    rightLabel="Exit"
                    onRightPress={onExit}
                />
                <View style={styles.center}>
                    <ActivityIndicator />
                    <Text style={styles.loadingText}>Loading settle up…</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!round) {
        return (
            <SafeAreaView style={styles.safe}>
                <ScreenHeader
                    navigation={navigation}
                    title="SETTLE UP"
                    titleAutoShrink
                    titleNumberOfLines={1}
                    subtitle="Round not found"
                    safeTop={false}
                    leftLabel="Back"
                    onLeftPress={onBack}
                    rightLabel="Exit"
                    onRightPress={onExit}
                />
                <View style={styles.card}>
                    <Text style={styles.title}>Round not found</Text>
                    <Text style={styles.sub}>This round isn’t available right now.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title="SETTLE UP"
                titleAutoShrink
                titleNumberOfLines={1}
                subtitle={`${courseName} • ${teeName}`}
                safeTop={false}
                leftLabel="Back"
                onLeftPress={onBack}
                rightLabel="Exit"
                onRightPress={onExit}
            />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 24, paddingTop: 10 }}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.card}>
                    <View style={styles.cardTop}>
                        <Text style={styles.title}>Who Won What</Text>
                        <View style={styles.pill}>
                            <MaterialCommunityIcons name="cash-multiple" size={16} color="rgba(242,201,76,0.98)" />
                            <Text style={styles.pillText}>REGULAR</Text>
                        </View>
                    </View>

                    <Text style={styles.sub}>
                        Below are the details of who won what.
                    </Text>

                    <View style={styles.divider} />

                    {wonRows.map((r) => {
                        const isPos = r.won > 0.005;

                        return (
                            <View key={`won-${r.id}`} style={styles.row}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.rowName} numberOfLines={1}>{r.name}</Text>
                                </View>

                                <View style={[styles.netChip, isPos ? styles.netChipPos : styles.netChipZero]}>
                                    <Text style={styles.netChipText}>
                                        {money(r.won)}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.card}>
                    <View style={styles.cardTop}>
                        <Text style={styles.title}>Who Pays Who</Text>
                        <View style={styles.pill}>
                            <MaterialCommunityIcons name="swap-horizontal" size={16} color="rgba(242,201,76,0.98)" />
                            <Text style={styles.pillText}>AUTO</Text>
                        </View>
                    </View>

                    {!settleModel?.transfers?.length ? (
                        <Text style={styles.sub}>Nothing to settle (or payouts not recorded yet).</Text>
                    ) : (
                        <>
                            <Text style={styles.sub}>
                                Simple pairing to settle balances (ties split evenly for putting contest places).
                            </Text>
                            <View style={styles.divider} />

                            {(() => {
                                // Build lookup: fromId -> toId -> amount
                                const amtByFromTo = {};
                                (settleModel?.transfers || []).forEach((t) => {
                                    const fromId = String(t.fromId || "");
                                    const toId = String(t.toId || "");
                                    const amt = Number(t.amount || 0);
                                    if (!fromId || !toId) return;
                                    if (!amtByFromTo[fromId]) amtByFromTo[fromId] = {};
                                    amtByFromTo[fromId][toId] = (amtByFromTo[fromId][toId] || 0) + (Number.isFinite(amt) ? amt : 0);
                                });

                                const list = Array.isArray(players) ? players : [];

                                // Display names: first name only; if duplicated first name, use "First L."
                                const firstCounts = {};
                                list.forEach((p) => {
                                    const full = String(p?.name || "").trim();
                                    const first = full.split(/\s+/).filter(Boolean)[0] || "";
                                    const k = first.toLowerCase();
                                    if (k) firstCounts[k] = (firstCounts[k] || 0) + 1;
                                });

                                const displayNameById = {};
                                list.forEach((p) => {
                                    const id = String(p?.id || "");
                                    const full = String(p?.name || "Player").trim();
                                    const parts = full.split(/\s+/).filter(Boolean);
                                    const first = parts[0] || "Player";
                                    const k = first.toLowerCase();

                                    if ((firstCounts[k] || 0) > 1 && parts.length > 1) {
                                        const last = parts[parts.length - 1] || "";
                                        const li = last ? String(last[0] || "").toUpperCase() : "";
                                        displayNameById[id] = li ? `${first} ${li}.` : first;
                                    } else {
                                        displayNameById[id] = first;
                                    }
                                });

                                const dispName = (id, fallback) => displayNameById[String(id)] || fallback || "Player";

                                return list.map((payer) => {
                                    const payerId = String(payer?.id || "");
                                    const payerName = dispName(payerId, String(payer?.name || "Player"));

                                    const payees = list.filter((x) => String(x?.id || "") !== payerId);

                                    return (
                                        <View key={`payer-${payerId}`} style={styles.payerCard}>
                                            <Text style={styles.payerNameCentered} numberOfLines={1}>
                                                {payerName}
                                            </Text>

                                            <View style={{ marginTop: 10 }}>
                                                {payees.map((payee) => {
                                                    const toId = String(payee?.id || "");
                                                    const toName = dispName(toId, String(payee?.name || "Player"));

                                                    const amt = Number(amtByFromTo?.[payerId]?.[toId] || 0);
                                                    const isZero = !Number.isFinite(amt) || Math.abs(amt) <= 0.005;

                                                    return (
                                                        <View
                                                            key={`pay-${payerId}-${toId}`}
                                                            style={[styles.payerLineRow, isZero && styles.payerLineRowZero]}
                                                        >
                                                            <Text
                                                                style={[styles.payerLineText, isZero && styles.payerLineTextZero]}
                                                                numberOfLines={1}
                                                            >
                                                                {payerName} pays {toName}
                                                            </Text>

                                                            <View style={[styles.amountPill, isZero && styles.amountPillZero]}>
                                                                <Text style={[styles.amountText, isZero && styles.amountTextZero]}>
                                                                    {money(isZero ? 0 : amt)}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    );
                                });
                            })()}
                        </>
                    )}

                    <View style={{ height: 10 }} />

                    <Pressable
                        onPress={() => Alert.alert("Coming next", "We’ll add Share / Copy + confirmations in the next pass.")}
                        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                    >
                        <Text style={styles.btnText}>Share / Copy (next)</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    loadingText: { marginTop: 10, color: MUTED, fontWeight: "800" },

    card: {
        marginHorizontal: 16,
        marginBottom: 14,
        borderRadius: 24,
        backgroundColor: CARD,
        borderWidth: 2,
        borderColor: "rgba(242,201,76,0.75)",
        padding: 12,
    },
    cardTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 8,
    },
    title: { color: WHITE, fontWeight: "900", fontSize: 18 },
    sub: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

    pill: {
        height: 30,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(242,201,76,0.16)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.30)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    pillText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

    divider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
        marginTop: 10,
        marginBottom: 12,
    },

    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: 18,
        backgroundColor: ROW,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.22)",
        marginBottom: 10,
    },
    rowName: { color: WHITE, fontWeight: "900", fontSize: 14 },
    rowSub: { marginTop: 4, color: MUTED, fontWeight: "800", fontSize: 11 },

    netChip: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        minWidth: 96,
    },
    netChipPos: { backgroundColor: "rgba(105,230,180,0.10)", borderColor: "rgba(105,230,180,0.35)" },
    netChipNeg: { backgroundColor: "rgba(255,90,90,0.10)", borderColor: "rgba(255,90,90,0.35)" },
    netChipZero: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" },
    netChipText: { color: WHITE, fontWeight: "900", fontSize: 12 },

    transferRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: 10,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        marginBottom: 10,
    },

    payerCard: {
        borderRadius: 18,
        padding: 12,
        backgroundColor: "rgba(105,230,180,0.06)",
        borderWidth: 2,
        borderColor: "rgba(105,230,180,0.45)",
        marginBottom: 12,
    },
    payerName: { color: WHITE, fontWeight: "900", fontSize: 14 },
    payerNameCentered: { color: WHITE, fontWeight: "900", fontSize: 14, textAlign: "center" },
    payerLineRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        marginBottom: 8,
    },

    payerLineRowZero: { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" },
    payerLineTextZero: { color: "rgba(255,255,255,0.55)" },
    amountPillZero: { backgroundColor: "rgba(242,201,76,0.10)", borderColor: "rgba(242,201,76,0.18)" },
    amountTextZero: { color: "rgba(242,201,76,0.55)" },
    payerLineText: { color: WHITE, fontWeight: "900", fontSize: 12, flex: 1 },
    transferText: { color: WHITE, fontWeight: "900", fontSize: 12, flex: 1 },

    amountPill: {
        height: 30,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(242,201,76,0.16)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.30)",
        alignItems: "center",
        justifyContent: "center",
    },
    amountText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 12 },

    btn: {
        height: 52,
        borderRadius: 18,
        backgroundColor: YELLOW,
        alignItems: "center",
        justifyContent: "center",
    },
    btnText: { color: "#1A1A1A", fontWeight: "900", fontSize: 14 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});