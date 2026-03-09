// src/screens/RegularSettleUpScreen.js
import React, { useCallback, useMemo, useState } from "react";
import { SafeAreaView, View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ScreenHeader from "../components/ScreenHeader";
import ROUTES from "../navigation/routes";
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
    if (!Number.isFinite(v) || Math.abs(v) < 0.005) return "$0";
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

function parseHcp(v) {
    if (v == null) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
    const s = String(v).trim();
    if (!s) return 0;
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return 0;
    const n = Number(m[0]);
    return Number.isFinite(n) ? Math.round(n) : 0;
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

function getPlayedHoles(r) {
    const hcRaw = Number(r?.holesCount ?? r?.meta?.holesCount);
    const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

    const sideRaw = String(r?.holesSide ?? r?.meta?.holesSide ?? "").toLowerCase().trim();
    const holesSide = sideRaw === "back" ? "back" : "front";

    const playedHoles =
        holesCount === 9
            ? (holesSide === "back"
                ? Array.from({ length: 9 }).map((_, i) => 10 + i)
                : Array.from({ length: 9 }).map((_, i) => 1 + i))
            : Array.from({ length: 18 }).map((_, i) => 1 + i);

    const frontHoles = playedHoles.filter((h) => h >= 1 && h <= 9);
    const backHoles = playedHoles.filter((h) => h >= 10 && h <= 18);

    return { holesCount, holesSide, playedHoles, frontHoles, backHoles };
}

function getStrokeIndexForHole(r, holeNumber) {
    const hm = r?.holeMeta ?? r?.meta?.holeMeta ?? null;
    if (!hm) return null;

    const pickSI = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        const raw =
            obj.strokeIndex ??
            obj.stokeIndex ??
            obj.si ??
            obj.handicap ??
            obj.hcp ??
            obj.hdcp ??
            obj.rank ??
            null;

        const n = parseInt(String(raw ?? "").replace(/[^\d]/g, ""), 10);
        if (!Number.isFinite(n) || n < 1 || n > 18) return null;
        return n;
    };

    if (Array.isArray(hm)) return pickSI(hm[holeNumber - 1]);
    if (hm && typeof hm === "object") return pickSI(hm?.[String(holeNumber)] ?? hm?.[holeNumber]);
    return null;
}

function netStrokesForHole(r, pid, holeNumber, useNet, playersById) {
    const strokes = readStroke(r, holeNumber, pid);
    if (!Number.isFinite(strokes) || strokes <= 0) return 0;
    if (!useNet) return strokes;

    const hcp = Number(playersById?.[pid]?.handicap || 0);
    if (!Number.isFinite(hcp) || hcp <= 0) return strokes;

    const si = getStrokeIndexForHole(r, holeNumber);
    if (!Number.isFinite(si)) return strokes;

    const base = Math.floor(Math.round(hcp) / 18);
    const extra = Math.round(hcp) % 18;
    const getsExtra = si <= extra ? 1 : 0;
    const received = base + getsExtra;

    return strokes - received;
}

function winnerIdsForHoles(r, holes, includedIds, useNet, playersById) {
    if (!holes || !holes.length) return [];

    const rows = (includedIds || []).map((pid) => {
        const id = String(pid);
        let total = 0;
        for (let i = 0; i < holes.length; i++) {
            total += netStrokesForHole(r, id, holes[i], useNet, playersById);
        }
        return { id, total };
    });

    rows.sort((a, b) => a.total - b.total);

    const best = rows[0]?.total;
    if (best == null) return [];
    return rows.filter((x) => x.total === best).map((x) => x.id);
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

    if (s.includes("nassau")) return "nassau";
    if (s.includes("skins")) return "skins";
    if (s.includes("stableford")) return "stableford";
    if (s.includes("birdiebuckets") || (s.includes("birdie") && s.includes("bucket"))) return "birdiebuckets";
    if (s.includes("wolf")) return "wolf";
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
    // Nassau buy-ins live in wagers.nassau (not formatPools)
    if (normKey(formatKey) === "nassau") {
        const w = roundDoc?.wagers?.nassau || {};
        const enabled = !!w?.enabled;
        if (!enabled) return 0;

        const front = Number(w?.front || 0);
        const back = Number(w?.back || 0);
        const total = Number(w?.total || 0);

        // Respect 9-hole side:
        // - 9 front: charge front + overall
        // - 9 back : charge back + overall
        // - 18     : charge front + back + overall
        const hcRaw = Number(roundDoc?.holesCount ?? roundDoc?.meta?.holesCount);
        const holesCount = hcRaw === 9 || hcRaw === 18 ? hcRaw : 18;

        const sideRaw = String(roundDoc?.holesSide ?? roundDoc?.meta?.holesSide ?? "").toLowerCase().trim();
        const holesSide = sideRaw === "back" ? "back" : "front";

        const useFront = holesCount === 18 || (holesCount === 9 && holesSide === "front");
        const useBack = holesCount === 18 || (holesCount === 9 && holesSide === "back");

        const sum =
            (useFront && front > 0 ? front : 0) +
            (useBack && back > 0 ? back : 0) +
            (total > 0 ? total : 0);

        return Number.isFinite(sum) && sum > 0 ? sum : 0;
    }

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

function collapseReciprocalTransfers(rawTransfers, playersById) {
    const pairMap = {};

    (rawTransfers || []).forEach((t) => {
        const fromId = String(t?.fromId || "");
        const toId = String(t?.toId || "");
        const amt = Number(t?.amount || 0);

        if (!fromId || !toId || fromId === toId) return;
        if (!Number.isFinite(amt) || amt <= 0.005) return;

        const a = fromId < toId ? fromId : toId;
        const b = fromId < toId ? toId : fromId;
        const key = `${a}__${b}`;

        if (!pairMap[key]) {
            pairMap[key] = { a, b, ab: 0, ba: 0 };
        }

        if (fromId === a && toId === b) {
            pairMap[key].ab += amt;
        } else {
            pairMap[key].ba += amt;
        }
    });

    const transfers = [];

    Object.values(pairMap).forEach((pair) => {
        const ab = Number(pair?.ab || 0);
        const ba = Number(pair?.ba || 0);
        const net = ab - ba;

        if (net > 0.005) {
            transfers.push({
                fromId: pair.a,
                toId: pair.b,
                amount: net,
                fromName: playersById?.[pair.a]?.name || "Player",
                toName: playersById?.[pair.b]?.name || "Player",
            });
            return;
        }

        if (net < -0.005) {
            transfers.push({
                fromId: pair.b,
                toId: pair.a,
                amount: Math.abs(net),
                fromName: playersById?.[pair.b]?.name || "Player",
                toName: playersById?.[pair.a]?.name || "Player",
            });
        }
    });

    transfers.sort((a, b) => b.amount - a.amount || a.fromName.localeCompare(b.fromName));
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
            const uid = auth?.currentUser?.uid;
            if (!uid || !roundId) {
                setRound(null);
                setLoading(false);
                return undefined;
            }

            const isShared = String(roundId).startsWith("sr_");
            const ref = isShared
                ? doc(db, "sharedRounds", String(roundId))
                : doc(db, "users", String(uid), "rounds", String(roundId));

            setLoading(true);

            const unsub = onSnapshot(
                ref,
                (snap) => {
                    if (!snap.exists()) {
                        setRound(null);
                        setLoading(false);
                        return;
                    }

                    const data = snap.data() || {};
                    setRound({
                        id: String(snap.id),
                        roundId: data?.roundId ? String(data.roundId) : String(snap.id),
                        ...data,
                    });

                    setLoading(false);
                },
                () => {
                    setRound(null);
                    setLoading(false);
                }
            );

            return () => unsub();
        }, [roundId])
    );

    // Live claims snapshot (single source of truth)
    useFocusEffect(
        useCallback(() => {
            const uid = auth?.currentUser?.uid;
            if (!uid || !roundId) return undefined;

            const isShared = String(roundId).startsWith("sr_");
            const ref = isShared
                ? collection(db, "sharedRounds", String(roundId), "formatClaims")
                : collection(db, "users", String(uid), "rounds", String(roundId), "formatClaims");

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
            handicap: parseHcp(
                p?.handicap ??
                p?.hcp ??
                p?.handicapIndex ??
                p?.index ??
                p?.courseHandicap ??
                p?.handicapStrokes ??
                p?.strokesHdcp ??
                0
            ),
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

        const netById = {};
        const paidById = {};
        const wonById = {};
        const rawTransfers = [];

        players.forEach((p) => {
            const id = String(p.id);
            netById[id] = 0;
            paidById[id] = 0;
            wonById[id] = 0;
        });

        const addPaid = (pid, amt) => {
            const key = String(pid || "");
            const a = Number(amt || 0);
            if (!Number.isFinite(a) || a <= 0) return;
            paidById[key] = (paidById[key] || 0) + a;
            netById[key] = (netById[key] || 0) - a;
        };

        const addWon = (pid, amt) => {
            const key = String(pid || "");
            const a = Number(amt || 0);
            if (!Number.isFinite(a) || a <= 0) return;
            wonById[key] = (wonById[key] || 0) + a;
            netById[key] = (netById[key] || 0) + a;
        };

        const addTransfer = (fromId, toId, amt) => {
            const from = String(fromId || "");
            const to = String(toId || "");
            const a = Number(amt || 0);

            if (!from || !to || from === to) return;
            if (!Number.isFinite(a) || a <= 0) return;

            rawTransfers.push({ fromId: from, toId: to, amount: a });
            addPaid(from, a);
            addWon(to, a);
        };

        const readPutts = (holeNumber, pid) => {
            const p = String(pid || "");
            const h = String(holeNumber || "");
            const raw =
                r?.holes?.[h]?.players?.[p]?.putts ??
                r?.holes?.[h]?.players?.[p]?.stats?.putts;

            if (raw === undefined || raw === null || String(raw).trim() === "") {
                return { has: false, n: 0 };
            }

            const n = toInt(raw);
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
            if (!includedCount) return;

            const fee = getEntryFee(r, formatKey);

            // Hole formats: winner never pays themselves
            if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                const holes = getOfficialHolesForFormat(r, formatKey);
                const perHole = fee > 0 ? fee : 0;
                if (!perHole || !holes.length) return;

                const includedSet = new Set((includedIds || []).map((x) => String(x)));
                const nk = normKey(formatKey);
                const claimsMap = claimsByFormat?.[nk] || {};

                let carryUnits = 0;
                let fundedUnits = 0;

                holes.forEach((h) => {
                    const c = claimsMap?.[String(h)] || null;
                    const statusRaw = String(c?.status || "").toLowerCase();
                    const isCarry = statusRaw === "carry_over" || statusRaw === "carryover";

                    const winnerId = String(c?.claimedByPlayerId || "").trim();
                    const hasWinner = winnerId && includedSet.has(winnerId);

                    if (hasWinner) {
                        const units = 1 + carryUnits;
                        fundedUnits += units;
                        carryUnits = 0;
                        addWon(winnerId, units * perHole * Math.max(0, includedCount - 1));
                    } else if (isCarry) {
                        carryUnits += 1;
                    } else {
                        carryUnits = 0;
                    }
                });

                includedIds.forEach((pid) => addPaid(pid, fundedUnits * perHole));
                return;
            }

            // Deuce pot: every player funds the deuce split, but reciprocal winner-vs-winner payments cancel later
            if (type === "deucepot") {
                const perPlayer = fee > 0 ? fee : 0;
                if (!perPlayer) return;

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

                if (!totalDeuces) return;

                includedIds.forEach((payerId) => {
                    const fromId = String(payerId);

                    Object.keys(deucesById).forEach((winnerId) => {
                        const toId = String(winnerId);
                        if (!toId || toId === fromId) return;

                        const winnerDeuces = Number(deucesById[toId] || 0);
                        if (!Number.isFinite(winnerDeuces) || winnerDeuces <= 0) return;

                        const amt = perPlayer * (winnerDeuces / totalDeuces);
                        if (!Number.isFinite(amt) || amt <= 0) return;

                        addTransfer(fromId, toId, amt);
                    });
                });

                return;
            }

            // Putting contest: winner never pays themselves
            if (type === "puttingcontest") {
                const perPlayer = fee > 0 ? fee : 0;
                if (!perPlayer) return;

                const pools = getFormatPools(r) || {};
                const ppRaw = Number(pools?.[formatKey]?.payoutPlaces);
                const payoutPlaces = ppRaw === 2 || ppRaw === 3 ? ppRaw : 1;

                const splits =
                    payoutPlaces === 3
                        ? [0.6, 0.3, 0.1]
                        : payoutPlaces === 2
                            ? [0.75, 0.25]
                            : [1];

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

                if (!rows.length) return;

                rows.sort((a, b) => {
                    if (a.total !== b.total) return a.total - b.total;
                    if (a.zero !== b.zero) return b.zero - a.zero;
                    if (a.three !== b.three) return a.three - b.three;
                    if (a.one !== b.one) return b.one - a.one;
                    return a.name.localeCompare(b.name);
                });

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

                includedIds.forEach((payerId) => {
                    const fromId = String(payerId);

                    for (let place = 0; place < splits.length; place++) {
                        const g = groups[place];
                        if (!g || !g.rows.length) continue;

                        const split = Number(splits[place] || 0);
                        if (!Number.isFinite(split) || split <= 0) continue;

                        const each = (perPlayer * split) / g.rows.length;
                        if (!Number.isFinite(each) || each <= 0) continue;

                        g.rows.forEach((x) => {
                            const toId = String(x?.id || "");
                            if (!toId || toId === fromId) return;

                            addTransfer(fromId, toId, each);
                        });
                    }
                });

                return;
            }

            // Skins: POOL PAYOUTS (carry on ties). Per-skin value is fee, funded per skin unit.
            if (type === "skins") {
                const perSkin = fee > 0 ? fee : 0;
                if (!perSkin) return;

                const { playedHoles } = getPlayedHoles(r);
                const holes = playedHoles || [];

                // Determine net/gross basis once (same approach as Nassau)
                const basis = String(r?.matchPlay?.scoring?.basis || r?.scoringMode || r?.scoring || "gross").toLowerCase();
                const useNet = basis.includes("net");

                let carryUnits = 0;

                for (let i = 0; i < holes.length; i++) {
                    const h = holes[i];

                    // Build scores based on chosen basis and require all included players to have strokes.
                    const scored = includedIds.map((pid) => {
                        const id = String(pid);
                        const v = useNet
                            ? netStrokesForHole(r, id, h, true, playersById)
                            : netStrokesForHole(r, id, h, false, playersById);
                        return { id, v };
                    });

                    if (scored.some((x) => !Number.isFinite(x.v) || x.v <= 0)) {
                        continue;
                    }

                    scored.sort((a, b) => a.v - b.v);
                    const best = scored[0]?.v;
                    if (best == null) continue;

                    const tied = scored.filter((x) => x.v === best);
                    if (tied.length === 1) {
                        const winId = String(tied[0].id || "");
                        const units = 1 + carryUnits;
                        carryUnits = 0;

                        // Transfers-style math (guarantees "Who Pays Who"):
                        // Each non-winner pays winner: perSkin * units
                        includedIds.forEach((pid) => {
                            const p = String(pid);
                            if (!p || p === winId) return;
                            addPaid(p, units * perSkin);
                            addWon(winId, units * perSkin);
                        });
                    } else {
                        carryUnits += 1;
                    }
                }

                return;
            }

            // Nassau (settlement = transfers, not full pool payouts)
            if (type === "nassau") {
                const w = r?.wagers?.nassau || {};
                const enabled = !!w?.enabled;
                if (!enabled) return;

                const frontBuyIn = Number(w?.front || 0);
                const backBuyIn = Number(w?.back || 0);
                const totalBuyIn = Number(w?.total || 0);

                const { holesCount, holesSide, playedHoles, frontHoles, backHoles } = getPlayedHoles(r);
                const overallHoles = playedHoles;

                const basis = String(r?.matchPlay?.scoring?.basis || r?.scoringMode || r?.scoring || "gross").toLowerCase();
                const useNet = basis.includes("net");

                const applySegment = (buyIn, holes) => {
                    const b = Number(buyIn || 0);
                    if (!Number.isFinite(b) || b <= 0) return;

                    const winners = winnerIdsForHoles(r, holes, includedIds, useNet, playersById);
                    if (!winners.length || winners.length !== 1) return; // tie/push

                    const winId = String(winners[0]);

                    includedIds.forEach((pid) => {
                        const p = String(pid);
                        if (!p || p === winId) return;
                        addPaid(p, b);
                        addWon(winId, b);
                    });
                };

                if (holesCount === 9 && holesSide === "front") {
                    applySegment(frontBuyIn, frontHoles);
                    applySegment(totalBuyIn, overallHoles);
                    return;
                }

                if (holesCount === 9 && holesSide === "back") {
                    applySegment(backBuyIn, backHoles);
                    applySegment(totalBuyIn, overallHoles);
                    return;
                }

                applySegment(frontBuyIn, frontHoles);
                applySegment(backBuyIn, backHoles);
                applySegment(totalBuyIn, overallHoles);
                return;
            }

            // Unknown / other: washed
            return;
        });

        const transfers = rawTransfers.length
            ? collapseReciprocalTransfers(rawTransfers, playersById)
            : (greedySettlement(netById, playersById) || []);

        return { netById, paidById, wonById, transfers };
    }, [round, players, playersById, formatsSelected, claimsByFormat]);

    const wonRows = useMemo(() => {
        const rows = players.map((p) => {
            const won = Number(settleModel?.wonById?.[p.id] || 0);
            return { id: p.id, name: p.name, won };
        });

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
                            <Text style={styles.pillText}>GROSS</Text>
                        </View>
                    </View>

                    <Text style={styles.sub}>Gross winnings by player across the selected formats before final net settlement.</Text>

                    <View style={styles.divider} />

                    {wonRows.map((r) => {
                        const isPos = r.won > 0.005;

                        return (
                            <View key={`won-${r.id}`} style={styles.row}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.rowName} numberOfLines={1}>
                                        {r.name}
                                    </Text>
                                </View>

                                <View style={[styles.netChip, isPos ? styles.netChipPos : styles.netChipZero]}>
                                    <Text style={styles.netChipText}>{money(r.won)}</Text>
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
                            <Text style={styles.pillText}>NET</Text>
                        </View>
                    </View>

                    {!settleModel?.transfers?.length ? (
                        <Text style={styles.sub}>Nothing to settle right now.</Text>
                    ) : (
                        <>
                            <Text style={styles.sub}>
                                Final payment instructions after netting each player’s gross winnings against their round obligations.
                            </Text>
                            <View style={styles.divider} />

                            {(() => {
                                const list = Array.isArray(players) ? players : [];

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

                                const byFrom = {};
                                (settleModel?.transfers || []).forEach((t) => {
                                    const fromId = String(t?.fromId || "");
                                    const toId = String(t?.toId || "");
                                    const amt = Number(t?.amount || 0);
                                    if (!fromId || !toId) return;
                                    if (!Number.isFinite(amt) || amt <= 0.005) return;

                                    if (!byFrom[fromId]) byFrom[fromId] = [];
                                    byFrom[fromId].push({ toId, amount: amt });
                                });

                                const payerIds = Object.keys(byFrom);

                                return payerIds.map((payerId) => {
                                    const payerName = dispName(payerId, playersById?.[payerId]?.name || "Player");
                                    const lines = byFrom[payerId] || [];

                                    lines.sort((a, b) => b.amount - a.amount);

                                    return (
                                        <View key={`payer-${payerId}`} style={styles.payerCard}>
                                            <Text style={styles.payerNameCentered} numberOfLines={1}>
                                                {payerName}
                                            </Text>

                                            <View style={{ marginTop: 10 }}>
                                                {lines.map((ln) => {
                                                    const toName = dispName(ln.toId, playersById?.[ln.toId]?.name || "Player");

                                                    return (
                                                        <View key={`pay-${payerId}-${ln.toId}`} style={styles.payerLineRow}>
                                                            <Text style={styles.payerLineText} numberOfLines={1}>
                                                                {payerName} pays {toName}
                                                            </Text>

                                                            <View style={styles.amountPill}>
                                                                <Text style={styles.amountText}>{money(ln.amount)}</Text>
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