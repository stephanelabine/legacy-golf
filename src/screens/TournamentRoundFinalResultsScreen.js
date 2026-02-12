// src/screens/TournamentRoundFinalResultsScreen.js
import React, { useCallback, useMemo, useState } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    Pressable,
    ActivityIndicator,
    Alert,
    ScrollView,
    Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, onSnapshot } from "firebase/firestore";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { db } from "../firebase/firebase";
import { pickTournamentNavParams, assertTournamentNavParams } from "../utils/tournamentNav";
import * as BuddiesStore from "../storage/buddies";

const BG = "#06150F";
const CARD = "rgba(18,22,30,0.92)";
const ROW = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";

function toInt(v) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "$0";
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
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;

    const s = String(v).trim();
    if (!s) return null;

    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return null;

    const n = Number(m[0]);
    return Number.isFinite(n) ? Math.round(n) : null;
}

// IMPORTANT: detect “second shot kp” before “kp”
function detectFormatType(f) {
    const k = normKey(f?.key || f?.id || f?.formatKey);
    const n = normKey(f?.name || f?.title);
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

function getKey(f) {
    return String(f?.key || f?.id || f?.formatKey || "").trim();
}

function sumPlayerStrokes(scoreDoc, totalHoles) {
    const holes = scoreDoc?.holes || {};
    let total = 0;
    for (let h = 1; h <= Number(totalHoles || 18); h++) {
        total += toInt(holes?.[String(h)]?.strokes);
    }
    return total;
}

function sumPlayerPutts(scoreDoc, totalHoles) {
    const holes = scoreDoc?.holes || {};
    let total = 0;
    for (let h = 1; h <= Number(totalHoles || 18); h++) {
        total += Math.max(0, toInt(holes?.[String(h)]?.putts));
    }
    return total;
}

// Net rules:
// 1) If explicit net exists AND not placeholder, use it.
// 2) Else if doc handicap exists, use gross - doc handicap (unless 0 placeholder and we have a real player handicap).
// 3) Else fallback: gross - (player handicap prorated).
function getNetTotal(scoreDoc, grossTotal, playerHandicap, totalHoles) {
    const d = scoreDoc || {};
    const gross = Number(grossTotal);

    const explicitRaw = d?.netTotal ?? d?.net ?? d?.roundNet ?? null;
    const explicit = Number(explicitRaw);

    if (Number.isFinite(explicit)) {
        const ph = playerHandicap;
        const hasPlayerHcp = Number.isFinite(ph) && ph > 0;

        const looksPlaceholder =
            (explicit === 0 && Number.isFinite(gross) && gross > 0) ||
            (Number.isFinite(gross) && gross > 0 && hasPlayerHcp && explicit === gross);

        if (!looksPlaceholder) return explicit;
    }

    const hdcpRaw =
        d?.handicapStrokes ??
        d?.courseHandicap ??
        d?.handicap ??
        d?.hcp ??
        d?.strokesHdcp ??
        d?.handicapShots ??
        d?.handicapShotsTotal ??
        null;

    const hdcp = Number(hdcpRaw);

    if (Number.isFinite(hdcp) && Number.isFinite(gross)) {
        const ph = playerHandicap;
        const hasPlayerHcp = Number.isFinite(ph) && ph > 0;
        if (!(hdcp === 0 && gross > 0 && hasPlayerHcp)) {
            return gross - hdcp;
        }
    }

    const h = playerHandicap;
    const holes = Number(totalHoles || 18);

    if (Number.isFinite(h) && holes > 0 && Number.isFinite(gross)) {
        const roundHcp = Math.round(h * (holes / 18));
        return gross - roundHcp;
    }

    return null;
}

function extractEntryFee(f) {
    const fee =
        f?.entryFee != null
            ? Number(f.entryFee)
            : f?.buyIn != null
                ? Number(f.buyIn)
                : f?.buyInAmount != null
                    ? Number(f.buyInAmount)
                    : f?.amount != null
                        ? Number(f.amount)
                        : null;

    return Number.isFinite(Number(fee)) && Number(fee) > 0 ? Number(fee) : 0;
}

function countEventsForHoleFormat(f, roundKeys) {
    const cfg = f?.config && typeof f.config === "object" ? f.config : {};
    const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};

    let count = 0;
    for (const rk of roundKeys) {
        const list = uniqInts(hbr?.[rk] || []);
        count += list.length;
    }
    return count;
}

function formatIconName(type) {
    if (type === "kp") return "target";
    if (type === "secondshotkp") return "target-variant";
    if (type === "longdrive") return "golf";
    if (type === "puttingcontest") return "golf";
    if (type === "deucepot") return "cash";
    if (type === "teamvsteam") return "account-group";
    return "star-four-points";
}

function formatDisplayTitle(type, rawName) {
    if (type === "kp") return "KP";
    if (type === "longdrive") return "LONG DRIVE";
    if (type === "secondshotkp") return "SECOND SHOT KP";
    if (type === "deucepot") return "DEUCE POT";
    if (type === "puttingcontest") return "PUTTING CONTEST";
    if (type === "teamvsteam") return "TEAM VS TEAM";
    return String(rawName || "FORMAT").toUpperCase();
}

function formatTheme(type) {
    if (type === "kp") return { accent: "#5AD7FF", bg: "rgba(90,215,255,0.10)", border: "rgba(90,215,255,0.28)" };
    if (type === "longdrive") return { accent: "#B8F37A", bg: "rgba(184,243,122,0.10)", border: "rgba(184,243,122,0.28)" };
    if (type === "secondshotkp") return { accent: "#9D7BFF", bg: "rgba(157,123,255,0.10)", border: "rgba(157,123,255,0.28)" };
    if (type === "deucepot") return { accent: "#FFCF5A", bg: "rgba(255,207,90,0.10)", border: "rgba(255,207,90,0.30)" };
    if (type === "puttingcontest") return { accent: "#FF7AC8", bg: "rgba(255,122,200,0.10)", border: "rgba(255,122,200,0.28)" };
    if (type === "teamvsteam") return { accent: "#69E6B4", bg: "rgba(105,230,180,0.10)", border: "rgba(105,230,180,0.28)" };
    return { accent: YELLOW, bg: "rgba(242,201,76,0.08)", border: "rgba(242,201,76,0.22)" };
}

export default function TournamentRoundFinalResultsScreen({ navigation, route }) {
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);
    const totalHoles = Number(params?.totalHoles || 18);

    const totalRounds = Number(params?.totalRounds ?? params?.roundsCount ?? params?.numRounds ?? params?.roundCount ?? 1);
    const isFinalRound = Number.isFinite(totalRounds) ? roundNumber >= totalRounds : true;

    React.useEffect(() => {
        if (!__DEV__) return;
        try {
            assertTournamentNavParams(params, "TournamentRoundFinalResultsScreen");
        } catch {
            // ignore
        }
    }, [params]);

    const [scoresByPid, setScoresByPid] = useState({});
    const [loading, setLoading] = useState(true);

    const [formatDocs, setFormatDocs] = useState([]);
    const [winnerModalOpen, setWinnerModalOpen] = useState(false);
    const [selectedFormat, setSelectedFormat] = useState(null);

    const [buddyHcpById, setBuddyHcpById] = useState({});
    const [tournamentHcpById, setTournamentHcpById] = useState({});

    const [showFull, setShowFull] = useState(true);
    const [showAllFormats, setShowAllFormats] = useState(true);

    const TAB_LEADERBOARD = "leaderboard";
    const TAB_TEAM = "team";
    const TAB_FORMATS = "formats";

    const [activeTab, setActiveTab] = useState(TAB_LEADERBOARD);

    // Load buddies once (this is what gives us handicaps for buddy_* ids)
    React.useEffect(() => {
        let alive = true;

        (async () => {
            try {
                const list = await BuddiesStore.getBuddies();
                const map = {};

                (Array.isArray(list) ? list : []).forEach((b) => {
                    const rawId = b?.id ? String(b.id) : "";
                    if (!rawId) return;

                    const raw =
                        b?.handicap ??
                        b?.hcp ??
                        b?.courseHandicap ??
                        b?.handicapIndex ??
                        b?.index ??
                        null;

                    const n = parseHcp(raw);
                    if (n == null) return;

                    // store BOTH key styles:
                    //  - "17698..."
                    //  - "buddy_17698..."
                    map[rawId] = n;
                    if (!rawId.startsWith("buddy_")) {
                        map[`buddy_${rawId}`] = n;
                    } else {
                        map[rawId.replace(/^buddy_/, "")] = n;
                    }
                });

                if (alive) setBuddyHcpById(map);
            } catch {
                if (alive) setBuddyHcpById({});
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    // Formats snapshot
    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            const ref = collection(db, "tournaments", String(tournamentId), "formats");
            const unsub = onSnapshot(
                ref,
                (snap) => {
                    const out = [];
                    snap.forEach((d) => out.push({ id: d.id, ...(d.data() || {}) }));
                    setFormatDocs(out);
                },
                () => setFormatDocs([])
            );

            return () => unsub();
        }, [tournamentId])
    );

    // Scores snapshot
    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            setLoading(true);

            const scoresRef = collection(db, "tournaments", String(tournamentId), "rounds", `r${String(roundNumber)}`, "scores");
            const unsub = onSnapshot(
                scoresRef,
                (snap) => {
                    const next = {};
                    snap.forEach((d) => {
                        next[String(d.id)] = d.data() || {};
                    });
                    setScoresByPid(next);
                    setLoading(false);
                },
                () => setLoading(false)
            );

            return () => unsub();
        }, [tournamentId, roundNumber])
    );

    // Roster + Members snapshot (handicap source for BOTH buddy_* and uid players)
    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            let rosterSnap = null;
            let membersSnap = null;

            const rebuild = () => {
                const map = {};

                const ingest = (docId, data) => {
                    const d = data || {};

                    const rawH =
                        d?.handicap ??
                        d?.hcp ??
                        d?.courseHandicap ??
                        d?.handicapIndex ??
                        d?.index ??
                        d?.strokesHdcp ??
                        d?.handicapStrokes ??
                        null;

                    const h = parseHcp(rawH);
                    if (h == null) return;

                    const ids = [
                        docId,
                        d?.id,
                        d?.pid,
                        d?.playerId,
                        d?.buddyId,
                        d?.memberId,
                        d?.uid,
                        d?.userId,
                    ]
                        .filter(Boolean)
                        .map((x) => String(x));

                    const name = String(d?.name || d?.playerName || "").trim();
                    const nk = normKey(name);

                    // Store by name (fallback only)
                    if (nk) map[`name:${nk}`] = h;

                    // Store by id in BOTH forms
                    for (const k of ids) {
                        map[k] = h;
                        if (k.startsWith("buddy_")) {
                            map[k.replace(/^buddy_/, "")] = h;
                        } else {
                            map[`buddy_${k}`] = h;
                        }
                    }
                };

                // roster
                if (rosterSnap) {
                    rosterSnap.forEach((docSnap) => ingest(docSnap.id, docSnap.data()));
                }

                // members
                if (membersSnap) {
                    membersSnap.forEach((docSnap) => ingest(docSnap.id, docSnap.data()));
                }

                setTournamentHcpById(map);

                if (__DEV__) {
                    console.log("TRFR tournamentHcpById count:", Object.keys(map || {}).length);
                    console.log("TRFR tournamentHcpById sample:", Object.entries(map || {}).slice(0, 8));
                }
            };

            const rosterRef = collection(db, "tournaments", String(tournamentId), "roster");
            const membersRef = collection(db, "tournaments", String(tournamentId), "members");

            const unsubRoster = onSnapshot(
                rosterRef,
                (snap) => {
                    rosterSnap = snap;
                    rebuild();
                },
                () => {
                    rosterSnap = null;
                    rebuild();
                }
            );

            const unsubMembers = onSnapshot(
                membersRef,
                (snap) => {
                    membersSnap = snap;
                    rebuild();
                },
                () => {
                    membersSnap = null;
                    rebuild();
                }
            );

            return () => {
                unsubRoster();
                unsubMembers();
            };
        }, [tournamentId])
    );


    const formatsFromParams = useMemo(() => {
        return Array.isArray(params?.formats) ? params.formats : [];
    }, [params?.formats]);

    const hasFormats = useMemo(() => {
        if (Array.isArray(formatDocs) && formatDocs.length) return true;
        if (formatsFromParams && formatsFromParams.length) return true;
        if (params?.hasFormats === true) return true;
        if (params?.showFormatsTab === true) return true;
        return false;
    }, [formatDocs, formatsFromParams, params?.hasFormats, params?.showFormatsTab]);

    const hasTeam = useMemo(() => {
        if (params?.teamVsTeamActive === true) return true;
        if (Array.isArray(params?.teamMatches) && params.teamMatches.length) return true;
        if (Array.isArray(params?.matches) && params.matches.length) return true;
        if (Array.isArray(params?.teams) && params.teams.length) return true;
        if (params?.team1Name && params?.team2Name) return true;
        return false;
    }, [params]);

    const tabs = useMemo(() => {
        const out = [{ key: TAB_LEADERBOARD, label: "Leaderboard" }];
        if (hasFormats) out.push({ key: TAB_FORMATS, label: "Formats" });
        if (hasTeam) out.push({ key: TAB_TEAM, label: "Team vs Team" });
        return out;
    }, [hasTeam, hasFormats]);

    React.useEffect(() => {
        const keys = tabs.map((t) => t.key);
        if (!keys.includes(activeTab)) setActiveTab(TAB_LEADERBOARD);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs.length, hasTeam, hasFormats]);

    const headerSubtitle = useMemo(() => {
        if (activeTab === TAB_TEAM) return "TEAM VS TEAM";
        if (activeTab === TAB_FORMATS) return "FORMATS / WINNERS";
        return "LEADERBOARD";
    }, [activeTab]);

    const rows = useMemo(() => {
        const ids = Object.keys(scoresByPid || {});

        const playersFromParams =
            Array.isArray(params?.players) ? params.players :
                Array.isArray(params?.members) ? params.members :
                    Array.isArray(params?.roster) ? params.roster :
                        [];

        // Build lookup tables from any roster objects that actually contain handicaps (if present)
        const hcpById = {};
        const hcpByName = {};

        for (const pl of playersFromParams) {
            const possibleIds = [
                pl?.id,
                pl?.pid,
                pl?.playerId,
                pl?.memberId,
                pl?.uid,
                pl?.userId,
            ].filter(Boolean).map((x) => String(x));

            const rawH =
                pl?.handicap ??
                pl?.hcp ??
                pl?.courseHandicap ??
                pl?.handicapIndex ??
                pl?.index ??
                null;

            const h = parseHcp(rawH);
            if (h != null && possibleIds.length) {
                for (const k of possibleIds) hcpById[k] = h;
            }

            const nm = String(pl?.name || pl?.playerName || "").trim();
            if (nm && h != null) hcpByName[normKey(nm)] = h;
        }

        const getTournamentHcp = (pid, name) => {
            const p = String(pid || "");
            const nk = normKey(String(name || ""));

            const direct = tournamentHcpById[p];
            if (direct != null) return direct;

            if (p.startsWith("buddy_")) {
                const stripped = p.replace(/^buddy_/, "");
                const v = tournamentHcpById[stripped];
                if (v != null) return v;
            } else {
                const prefixed = `buddy_${p}`;
                const v = tournamentHcpById[prefixed];
                if (v != null) return v;
            }

            if (nk) {
                const v = tournamentHcpById[`name:${nk}`];
                if (v != null) return v;
            }

            return null;
        };

        const getBuddyHcp = (pid) => {
            const p = String(pid || "");
            const n1 = buddyHcpById[p];
            if (n1 != null) return n1;

            if (p.startsWith("buddy_")) {
                const stripped = p.replace(/^buddy_/, "");
                const n2 = buddyHcpById[stripped];
                if (n2 != null) return n2;
            } else {
                const prefixed = `buddy_${p}`;
                const n3 = buddyHcpById[prefixed];
                if (n3 != null) return n3;
            }

            return null;
        };


        if (__DEV__) {
            console.log("TRFR playersFromParams len:", Array.isArray(playersFromParams) ? playersFromParams.length : "not array");
            console.log("TRFR sample player:", Array.isArray(playersFromParams) && playersFromParams[0] ? playersFromParams[0] : null);
            console.log("TRFR score ids:", Object.keys(scoresByPid || {}));
            const firstPid = Object.keys(scoresByPid || {})[0];
            console.log("TRFR sample score doc:", firstPid ? { pid: firstPid, doc: scoresByPid[firstPid] } : null);
            console.log("TRFR buddyHcpById count:", Object.keys(buddyHcpById || {}).length);
            console.log("TRFR buddyHcpById sample:", Object.entries(buddyHcpById || {}).slice(0, 5));
        }

        return ids.map((pid) => {
            const d = scoresByPid?.[pid] || {};

            const gross = sumPlayerStrokes(d, totalHoles);
            const putts = sumPlayerPutts(d, totalHoles);

            const playerName = String(d?.playerName || d?.name || "");

            // roster handicap (if provided in params) OR buddy store handicap (most important for buddy_* ids)
            const rosterHRaw =
                getTournamentHcp(String(pid), playerName) ??
                getTournamentHcp(String(d?.playerId ?? ""), playerName) ??
                getTournamentHcp(String(d?.uid ?? ""), playerName) ??
                hcpById[String(pid)] ??
                hcpById[String(d?.playerId ?? "")] ??
                hcpById[String(d?.uid ?? "")] ??
                hcpById[String(d?.id ?? "")] ??
                hcpByName[normKey(playerName)] ??
                getBuddyHcp(String(pid)) ??
                null;


            const rosterH = parseHcp(rosterHRaw);
            const hasRosterH = rosterH != null;

            // score-doc handicap (often absent or 0 placeholder)
            const scoreHRaw =
                d?.handicapStrokes ??
                d?.courseHandicap ??
                d?.handicap ??
                d?.hcp ??
                d?.handicapIndex ??
                d?.index ??
                null;

            const scoreH = parseHcp(scoreHRaw);
            const hasScoreH = scoreH != null;

            const effectiveH =
                hasScoreH && !(scoreH === 0 && hasRosterH)
                    ? scoreH
                    : hasRosterH
                        ? rosterH
                        : null;

            const net = getNetTotal(d, gross, effectiveH, totalHoles);

            return {
                pid: String(pid),
                name: String(playerName || "Player"),
                gross,
                putts,
                net,
                hcpUsed: effectiveH,
            };
        });
    }, [scoresByPid, totalHoles, params?.players, params?.members, params?.roster, buddyHcpById, tournamentHcpById]);


    const rosterCount = useMemo(() => rows.length, [rows]);
    const hasNet = useMemo(() => {
        return rows.some((r) => r.hcpUsed != null || Number.isFinite(Number(r.net)));
    }, [rows]);



    const sortedRows = useMemo(() => {
        const list = [...rows];
        list.sort((a, b) => {
            if (hasNet) {
                const an = Number.isFinite(Number(a.net)) ? Number(a.net) : 9999;
                const bn = Number.isFinite(Number(b.net)) ? Number(b.net) : 9999;
                if (an !== bn) return an - bn;
                return a.gross - b.gross;
            }
            return a.gross - b.gross;
        });
        return list;
    }, [rows, hasNet]);

    const dataToRender = useMemo(() => {
        return showFull ? sortedRows : sortedRows.slice(0, 5);
    }, [sortedRows, showFull]);

    const roundKeys = useMemo(() => {
        const tr = Number.isFinite(totalRounds) ? totalRounds : 1;
        const out = [];
        for (let i = 1; i <= Math.max(1, tr); i++) out.push(`r${i}`);
        return out;
    }, [totalRounds]);

    const orderedFormats = useMemo(() => {
        const src = (Array.isArray(formatDocs) && formatDocs.length ? formatDocs : formatsFromParams) || [];

        const FORMAT_ORDER = ["kp", "longdrive", "secondshotkp", "deucepot", "puttingcontest", "teamvsteam"];
        const rank = (f) => {
            const type = detectFormatType(f);
            const idx = FORMAT_ORDER.indexOf(type);
            return idx === -1 ? 999 : idx;
        };

        return [...src].filter((f) => !!getKey(f)).sort((a, b) => rank(a) - rank(b));
    }, [formatDocs, formatsFromParams]);

    const formatsToRender = useMemo(() => {
        if (showAllFormats) return orderedFormats;
        return orderedFormats.slice(0, 3);
    }, [orderedFormats, showAllFormats]);

    const teamData = useMemo(() => {
        const t1 = String(params?.team1Name || "Team A");
        const t2 = String(params?.team2Name || "Team B");

        const lead = String(params?.leadingTeam || "");
        const leadText = lead ? `${lead} leading` : "Leader shown once scoring is connected";

        const matches = Array.isArray(params?.teamMatches)
            ? params.teamMatches
            : Array.isArray(params?.matches)
                ? params.matches
                : [];

        return { t1, t2, leadText, matches };
    }, [params]);

    const goTournamentHub = useCallback(() => {
        const target = ROUTES.TOURNAMENT_DASHBOARD || ROUTES.TOURNAMENT_LIVE_HUB || "TournamentDashboard";
        navigation.navigate(target, pickTournamentNavParams(params));
    }, [navigation, params]);

    const primaryAction = useCallback(() => {
        if (isFinalRound || totalRounds === 1) {
            Alert.alert("Next step", "Save tournament results, then show Winner’s Circle / Trophy screen next.", [{ text: "OK" }]);
            return;
        }

        Alert.alert("Next step", "Save round results, then take you to Round 2 start flow.", [{ text: "OK" }]);
    }, [isFinalRound, totalRounds]);

    const goHome = useCallback(() => {
        navigation.navigate(ROUTES.HOME);
    }, [navigation]);

    const title = useMemo(() => {
        if (totalRounds === 1 || isFinalRound) return "TOURNAMENT FINAL RESULTS";
        return `ROUND ${roundNumber} RESULTS`;
    }, [roundNumber, totalRounds, isFinalRound]);

    const primaryLabel = useMemo(() => {
        if (totalRounds === 1 || isFinalRound) return "Save & Publish Tournament";
        return "Save & Publish Round";
    }, [totalRounds, isFinalRound]);

    const FOOTER_H = 142;

    const openWinnerModal = useCallback((f) => {
        setSelectedFormat(f || null);
        setWinnerModalOpen(true);
    }, []);

    const closeWinnerModal = useCallback(() => {
        setWinnerModalOpen(false);
        setSelectedFormat(null);
    }, []);

    const renderTabs = () => {
        if (!tabs || tabs.length <= 1) return null;

        return (
            <View style={styles.tabsRow}>
                {tabs.map((t) => {
                    const isActive = t.key === activeTab;
                    return (
                        <Pressable
                            key={t.key}
                            onPress={() => setActiveTab(t.key)}
                            style={({ pressed }) => [
                                styles.tabPill,
                                isActive ? styles.tabPillActive : styles.tabPillIdle,
                                pressed && styles.pressed,
                            ]}
                        >
                            <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextIdle]}>
                                {t.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        );
    };

    const renderColumnHeader = () => {
        return (
            <View style={styles.headerRow}>
                <View style={styles.rankPillSpacer} />
                <View style={styles.rowMid}>
                    <Text style={[styles.colText, styles.colPlayer]}>PLAYER</Text>
                </View>

                <View style={styles.numCol}>
                    <Text style={[styles.colText, styles.colNum]}>GROSS</Text>
                </View>

                <View style={styles.numCol}>
                    <Text style={[styles.colText, styles.colNum]}>PUTTS</Text>
                </View>

                {hasNet ? (
                    <View style={styles.numCol}>
                        <Text style={[styles.colText, styles.colNum]}>NET</Text>
                    </View>
                ) : null}
            </View>
        );
    };

    const renderLeaderboardCard = () => {
        return (
            <View style={styles.leaderWrap}>
                <View style={styles.leaderTopRow}>
                    <Text style={styles.leaderTitle}>Leaderboard</Text>

                    <Pressable
                        onPress={() => setShowFull((v) => !v)}
                        style={({ pressed }) => [styles.leaderToggle, pressed && styles.pressed]}
                    >
                        <Text style={styles.leaderToggleText}>
                            {showFull ? "View Top 5" : "View full leaderboard"}
                        </Text>
                    </Pressable>
                </View>

                {renderColumnHeader()}
                <View style={styles.divider} />

                <View>
                    {dataToRender.map((item, index) => {
                        const rank = index + 1;
                        const netLabel = Number.isFinite(Number(item.net)) ? String(item.net) : "—";
                        const debugHcp = item?.hcpUsed == null ? "—" : String(item.hcpUsed);

                        return (
                            <View key={item.pid} style={[styles.rowCard, index > 0 && { marginTop: 10 }]}>
                                <View style={styles.rankPill}>
                                    <Text style={styles.rankText}>{rank}</Text>
                                </View>

                                <View style={styles.rowMid}>
                                    <Text style={styles.name} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                </View>

                                <View style={styles.numCol}>
                                    <Text style={styles.numBig}>{item.gross}</Text>
                                    <Text style={styles.numSub}>gross</Text>
                                </View>

                                <View style={styles.numCol}>
                                    <Text style={styles.numBig2}>{item.putts}</Text>
                                    <Text style={styles.numSub}>putts</Text>
                                </View>

                                {hasNet ? (
                                    <View style={styles.numCol}>
                                        <Text style={styles.numBig3}>{netLabel}</Text>
                                        <Text style={styles.numSub}>net</Text>

                                    </View>
                                ) : null}
                            </View>
                        );
                    })}
                </View>

                {!hasNet ? (
                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.noteText}>
                            Net scoring is not available yet (no handicap found for these players).
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    };

    const renderTeamCard = () => {
        return (
            <View style={styles.leaderWrap}>
                <View style={styles.leaderTopRow}>
                    <Text style={styles.leaderTitle}>Team vs Team</Text>

                    <View style={styles.teamPill}>
                        <Text style={styles.teamPillText} numberOfLines={1}>
                            {teamData.leadText}
                        </Text>
                    </View>
                </View>

                <View style={styles.teamNamesRow}>
                    <View style={styles.teamNameCard}>
                        <Text style={styles.teamNameText} numberOfLines={1}>
                            {teamData.t1}
                        </Text>
                    </View>
                    <View style={styles.teamNameCard}>
                        <Text style={styles.teamNameText} numberOfLines={1}>
                            {teamData.t2}
                        </Text>
                    </View>
                </View>

                <View style={styles.divider} />

                {Array.isArray(teamData.matches) && teamData.matches.length ? (
                    <View>
                        {teamData.matches.map((m, i) => {
                            const left = String(m?.left ?? m?.p1 ?? m?.player1 ?? "Player A");
                            const right = String(m?.right ?? m?.p2 ?? m?.player2 ?? "Player B");
                            const result = String(m?.result ?? m?.outcome ?? "Result pending");

                            return (
                                <View key={String(m?.id ?? i)} style={[styles.matchRow, i > 0 && { marginTop: 10 }]}>
                                    <Text style={styles.matchPlayers} numberOfLines={1}>
                                        {left} vs {right}
                                    </Text>
                                    <View style={styles.matchPill}>
                                        <Text style={styles.matchPillText} numberOfLines={1}>
                                            {result}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View style={styles.placeholderBox}>
                        <Text style={styles.placeholderTitle}>Matches coming next</Text>
                        <Text style={styles.placeholderSub}>
                            This panel will show match results once team scoring is connected.
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    function renderFormatPayout(f) {
        const type = detectFormatType(f);
        const fee = extractEntryFee(f);
        const totalPool = fee > 0 ? fee * Math.max(0, rosterCount) : 0;

        if (fee <= 0) {
            return { headline: "No buy-in", lines: ["Set a buy-in in Formats / Money Pools to compute payouts."] };
        }

        if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
            const events = countEventsForHoleFormat(f, roundKeys);
            const perEvent = events > 0 ? totalPool / events : 0;

            return {
                headline: events > 0 ? `${money(perEvent)} per win` : "Needs holes",
                lines: [
                    `Entry fee: ${money(fee)}`,
                    `Roster: ${rosterCount}`,
                    `Pool total: ${money(totalPool)}`,
                    `Official holes selected: ${events > 0 ? String(events) : "0 (select holes in Format Details)"}`,
                ],
            };
        }

        if (type === "deucepot") {
            return {
                headline: "To be determined",
                lines: [
                    "This pot is split among all players who make a deuce.",
                    `Entry fee: ${money(fee)}`,
                    `Roster: ${rosterCount}`,
                    `Pot total: ${money(totalPool)}`,
                ],
            };
        }

        if (type === "puttingcontest") {
            const first = totalPool * 0.75;
            const second = totalPool * 0.25;

            return {
                headline: `${money(first)} / ${money(second)}`,
                lines: [
                    "Split: 1st place 75% and 2nd place 25% of the total pool.",
                    `Entry fee: ${money(fee)}`,
                    `Roster: ${rosterCount}`,
                    `Pool total: ${money(totalPool)}`,
                ],
            };
        }

        if (type === "teamvsteam") {
            const perPlayer = rosterCount > 0 ? totalPool / rosterCount : 0;

            return {
                headline: rosterCount > 0 ? `${money(perPlayer)} per player` : "Roster needed",
                lines: [
                    "Winning team payout shown per player.",
                    `Entry fee: ${money(fee)}`,
                    `Roster: ${rosterCount}`,
                    `Pool total: ${money(totalPool)}`,
                ],
            };
        }

        return {
            headline: `${money(totalPool)} (winner)`,
            lines: [
                "Default payout: a single winner takes the full pool.",
                `Entry fee: ${money(fee)}`,
                `Roster: ${rosterCount}`,
                `Pool total: ${money(totalPool)}`,
            ],
        };
    }

    const renderWinnerModal = () => {
        if (!winnerModalOpen || !selectedFormat) return null;

        const f = selectedFormat;
        const key = getKey(f) || String(f?.id || f?.formatKey || f?.key || "format");
        const rawName = String(f?.name || f?.title || key);

        const type = detectFormatType(f);
        const display = formatDisplayTitle(type, rawName);
        const theme = formatTheme(type);
        const icon = formatIconName(type);

        const payout = renderFormatPayout(f);

        const rnKeyNow = `r${String(roundNumber)}`;

        const cfg = f?.config && typeof f.config === "object" ? f.config : {};
        const hbr = cfg?.holesByRound && typeof cfg.holesByRound === "object" ? cfg.holesByRound : {};
        const officialHoles = uniqInts(hbr?.[rnKeyNow] || []);

        const allClaims = f?.claimsByRound && typeof f.claimsByRound === "object" ? f.claimsByRound : {};
        const roundClaims = allClaims?.[rnKeyNow] && typeof allClaims[rnKeyNow] === "object" ? allClaims[rnKeyNow] : {};

        const feeLocal = extractEntryFee(f);
        const poolLocal = feeLocal > 0 ? feeLocal * Math.max(0, rosterCount) : 0;
        const eventsThisRound = officialHoles.length;
        const perWin = eventsThisRound > 0 ? poolLocal / eventsThisRound : 0;

        const claimedCount = officialHoles.reduce((acc, h) => {
            const c = roundClaims?.[String(h)] || null;
            return acc + (c && (c.playerName || c.name || c.claimedByUid) ? 1 : 0);
        }, 0);

        const statusPill =
            eventsThisRound === 0
                ? "NO HOLES SET"
                : claimedCount === 0
                    ? "NO CLAIMS YET"
                    : claimedCount < eventsThisRound
                        ? "INCOMPLETE"
                        : "PENDING CONFIRM";

        const winnerLine =
            eventsThisRound === 0
                ? "No official holes selected yet"
                : claimedCount === 0
                    ? "No winners claimed yet"
                    : "Round winners (pending)";

        return (
            <Modal visible={winnerModalOpen} transparent animationType="fade" onRequestClose={closeWinnerModal}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalCard, { borderColor: theme.border }]}>
                        <View style={styles.modalTop}>
                            <View style={[styles.modalIconWrap, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                                <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={styles.modalTitle} numberOfLines={1}>
                                    {display} WINNER
                                </Text>
                                <Text style={styles.modalSub} numberOfLines={1}>
                                    {rawName}
                                </Text>
                            </View>

                            <Pressable onPress={closeWinnerModal} style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}>
                                <Text style={styles.modalCloseText}>Close</Text>
                            </Pressable>
                        </View>

                        <View style={styles.modalDivider} />

                        <View style={styles.modalSection}>
                            <View style={styles.modalSectionRow}>
                                <Text style={styles.modalSectionTitle}>Winner</Text>
                                <View style={styles.statusPill}>
                                    <Text style={styles.statusPillText}>{statusPill}</Text>
                                </View>
                            </View>

                            <View style={[styles.winnerBox, { alignItems: "stretch" }]}>
                                <Text style={styles.winnerBig}>{winnerLine}</Text>

                                {officialHoles.length ? (
                                    <View style={{ marginTop: 10, gap: 8 }}>
                                        {officialHoles.map((h) => {
                                            const c = roundClaims?.[String(h)] || null;
                                            const nm = String(c?.playerName || c?.name || "—");
                                            const has = !!(c && (c.playerName || c.name || c.claimedByUid));

                                            return (
                                                <View
                                                    key={`hole-${h}`}
                                                    style={{
                                                        flexDirection: "row",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        gap: 10,
                                                        borderRadius: 14,
                                                        backgroundColor: "rgba(255,255,255,0.04)",
                                                        borderWidth: 1,
                                                        borderColor: "rgba(255,255,255,0.10)",
                                                        paddingVertical: 10,
                                                        paddingHorizontal: 12,
                                                    }}
                                                >
                                                    <Text style={{ color: WHITE, fontWeight: "900", fontSize: 13 }}>Hole {h}</Text>

                                                    <Text
                                                        style={{ flex: 1, color: WHITE, fontWeight: "900", fontSize: 13, textAlign: "center" }}
                                                        numberOfLines={1}
                                                    >
                                                        {has ? nm : "Unclaimed"}
                                                    </Text>

                                                    <View style={styles.matchPill}>
                                                        <Text style={styles.matchPillText}>{perWin > 0 ? money(perWin) : "—"}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                ) : null}

                                <Text style={styles.winnerSmall}>
                                    Claims are shown as pending until organizer confirmation/override is added.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.modalDivider} />

                        <View style={styles.modalSection}>
                            <View style={styles.modalSectionRow}>
                                <Text style={styles.modalSectionTitle}>Payout</Text>
                                <View style={styles.formatPill}>
                                    <Text style={styles.formatPillText}>PAYOUT</Text>
                                </View>
                            </View>

                            <Text style={styles.payoutHeadline}>{payout.headline}</Text>

                            {payout.lines.map((line, idx) => (
                                <Text key={`${key}-p-${idx}`} style={styles.modalLine}>
                                    {line}
                                </Text>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    const renderFormatsCard = () => {
        return (
            <View style={styles.leaderWrap}>
                <View style={styles.leaderTopRow}>
                    <Text style={styles.leaderTitle}>Formats</Text>

                    <Pressable
                        onPress={() => setShowAllFormats((v) => !v)}
                        style={({ pressed }) => [styles.leaderToggle, pressed && styles.pressed]}
                    >
                        <Text style={styles.leaderToggleText}>
                            {showAllFormats ? "Show less" : "View all formats"}
                        </Text>
                    </Pressable>
                </View>

                <View style={styles.divider} />

                {!formatsToRender.length ? (
                    <View style={styles.placeholderBox}>
                        <Text style={styles.placeholderTitle}>No formats to show</Text>
                        <Text style={styles.placeholderSub}>
                            Select formats in tournament setup, then they will appear here.
                        </Text>
                    </View>
                ) : (
                    <>
                        {formatsToRender.map((f) => {
                            const key = getKey(f) || String(f?.id || f?.formatKey || f?.key || "format");
                            const rawName = String(f?.name || f?.title || key);

                            const type = detectFormatType(f);
                            const display = formatDisplayTitle(type, rawName);
                            const theme = formatTheme(type);
                            const icon = formatIconName(type);

                            return (
                                <Pressable
                                    key={key}
                                    onPress={() => openWinnerModal(f)}
                                    style={({ pressed }) => [
                                        styles.winnerTile,
                                        { backgroundColor: theme.bg, borderColor: theme.border },
                                        pressed && styles.pressed,
                                    ]}
                                >
                                    <View style={styles.winnerTileTop}>
                                        <View style={[styles.winnerIcon, { backgroundColor: "rgba(0,0,0,0.18)", borderColor: theme.border }]}>
                                            <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
                                        </View>
                                        <View style={styles.formatPill}>
                                            <Text style={styles.formatPillText}>WINNER</Text>
                                        </View>
                                    </View>

                                    <View style={styles.winnerTileCenter}>
                                        <Text style={styles.winnerTileTitle} numberOfLines={2}>
                                            {display} WINNER
                                        </Text>
                                        <Text style={styles.winnerTileSub} numberOfLines={1}>
                                            Tap to view details
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                        <View style={{ height: 2 }} />
                        {renderWinnerModal()}
                    </>
                )}
            </View>
        );
    };

    const renderActiveContent = () => {
        if (activeTab === TAB_TEAM) return renderTeamCard();
        if (activeTab === TAB_FORMATS) return renderFormatsCard();
        return renderLeaderboardCard();
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.bgWashA} />
            <View style={styles.bgWashB} />

            <ScreenHeader
                navigation={navigation}
                title={title}
                titleAutoShrink
                titleNumberOfLines={1}
                subtitle={headerSubtitle}
                safeTop={false}
                rightLabel={null}
                onRightPress={null}
            />

            <View style={styles.body}>
                {!tournamentId ? (
                    <View style={styles.card}>
                        <Text style={styles.titleText}>Round not found</Text>
                        <Text style={styles.subText}>Missing tournamentId.</Text>
                        <Pressable onPress={goHome} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
                            <Text style={styles.btnPrimaryText}>Go Home</Text>
                        </Pressable>
                    </View>
                ) : loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator />
                        <Text style={styles.loadingText}>Loading results…</Text>
                    </View>
                ) : (
                    <>
                        {renderTabs()}

                        <ScrollView
                            style={{ flex: 1 }}
                            contentContainerStyle={{
                                paddingBottom: FOOTER_H + 24,
                                paddingTop: tabs.length > 1 ? 6 : 10,
                            }}
                            showsVerticalScrollIndicator={false}
                        >
                            {renderActiveContent()}
                            <View style={{ height: 10 }} />
                        </ScrollView>

                        <View style={styles.footerWrap}>
                            <View style={styles.footer}>
                                <Pressable onPress={primaryAction} style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}>
                                    <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
                                </Pressable>

                                <View style={{ height: 10 }} />

                                <Pressable onPress={goTournamentHub} style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}>
                                    <Text style={styles.btnOutlineText}>Back to Tournament Hub</Text>
                                </Pressable>
                            </View>
                        </View>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },

    bgWashA: {
        position: "absolute",
        top: -120,
        left: -120,
        width: 340,
        height: 340,
        borderRadius: 340,
        backgroundColor: "rgba(46,204,113,0.10)",
    },
    bgWashB: {
        position: "absolute",
        bottom: -180,
        right: -160,
        width: 420,
        height: 420,
        borderRadius: 420,
        backgroundColor: "rgba(11,42,27,0.65)",
    },

    body: { flex: 1 },

    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    loadingText: { marginTop: 10, color: MUTED, fontWeight: "800" },

    card: {
        margin: 16,
        padding: 14,
        borderRadius: 22,
        backgroundColor: CARD,
        borderWidth: 2,
        borderColor: "rgba(242,201,76,0.55)",
    },
    titleText: { color: WHITE, fontWeight: "900", fontSize: 16 },
    subText: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

    tabsRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 10,
    },
    tabPill: {
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
    },
    tabPillIdle: {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.14)",
    },
    tabPillActive: {
        backgroundColor: "rgba(242,201,76,0.18)",
        borderColor: "rgba(242,201,76,0.55)",
    },
    tabText: { fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },
    tabTextIdle: { color: WHITE },
    tabTextActive: { color: "rgba(242,201,76,0.98)" },

    leaderWrap: {
        marginTop: 14,
        marginHorizontal: 16,
        borderRadius: 24,
        backgroundColor: CARD,
        borderWidth: 2,
        borderColor: "rgba(242,201,76,0.75)",
        padding: 12,
    },

    leaderTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
    },
    leaderTitle: { color: WHITE, fontWeight: "900", fontSize: 18 },

    leaderToggle: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    leaderToggleText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
    },

    colText: { color: "rgba(255,255,255,0.68)", fontWeight: "900", fontSize: 11, letterSpacing: 0.7 },
    colPlayer: { flex: 1 },
    colNum: { textAlign: "center" },

    divider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
        marginTop: 10,
        marginBottom: 12,
    },

    rowCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        borderRadius: 20,
        backgroundColor: ROW,
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.28)",
    },

    rankPillSpacer: { width: 34, height: 34, borderRadius: 14 },

    rankPill: {
        width: 34,
        height: 34,
        borderRadius: 14,
        backgroundColor: INNER,
        alignItems: "center",
        justifyContent: "center",
    },
    rankText: { color: WHITE, fontWeight: "900" },

    rowMid: { flex: 1, minWidth: 0 },
    name: { color: WHITE, fontWeight: "900", fontSize: 14 },

    numCol: { width: 64, alignItems: "center" },
    numBig: { color: WHITE, fontWeight: "900", fontSize: 18 },
    numBig2: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 17 },
    numBig3: { color: "rgba(242,201,76,0.96)", fontWeight: "900", fontSize: 17 },
    numSub: { marginTop: 2, color: MUTED, fontWeight: "900", fontSize: 10, letterSpacing: 0.4 },

    noteText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12, lineHeight: 16 },

    teamPill: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
        maxWidth: 190,
    },
    teamPillText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    teamNamesRow: { flexDirection: "row", gap: 10 },
    teamNameCard: {
        flex: 1,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    teamNameText: { color: WHITE, fontWeight: "900", fontSize: 14 },

    matchRow: {
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    matchPlayers: { flex: 1, color: WHITE, fontWeight: "900", fontSize: 13 },
    matchPill: {
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(242,201,76,0.16)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.30)",
        alignItems: "center",
        justifyContent: "center",
    },
    matchPillText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

    placeholderBox: {
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
    },
    placeholderTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },
    placeholderSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

    winnerTile: {
        borderRadius: 22,
        borderWidth: 2,
        padding: 12,
        marginBottom: 10,
    },
    winnerTileTop: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    winnerIcon: {
        width: 34,
        height: 34,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    winnerTileCenter: { marginTop: 12, alignItems: "center", justifyContent: "center" },
    winnerTileTitle: { color: WHITE, fontWeight: "900", fontSize: 18, textAlign: "center", letterSpacing: 0.4 },
    winnerTileSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12 },

    formatPill: {
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(242,201,76,0.16)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.30)",
        alignItems: "center",
        justifyContent: "center",
    },
    formatPillText: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 11, letterSpacing: 0.3 },

    footerWrap: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: "rgba(6,21,15,0.88)",
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
    },
    footer: { paddingTop: 12 },

    btnPrimary: {
        height: 54,
        borderRadius: 18,
        backgroundColor: YELLOW,
        alignItems: "center",
        justifyContent: "center",
    },
    btnPrimaryText: { color: "#1A1A1A", fontWeight: "900", fontSize: 15 },

    btnOutline: {
        height: 54,
        borderRadius: 18,
        backgroundColor: "rgba(18,22,30,0.96)",
        borderWidth: 1,
        borderColor: "rgba(242,201,76,0.45)",
        alignItems: "center",
        justifyContent: "center",
    },
    btnOutlineText: { color: WHITE, fontWeight: "900", fontSize: 15 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    modalCard: {
        width: "100%",
        maxWidth: 520,
        borderRadius: 24,
        backgroundColor: "rgba(18,22,30,0.97)",
        borderWidth: 2,
        padding: 14,
    },
    modalTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    modalIconWrap: {
        width: 34,
        height: 34,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    modalTitle: { color: WHITE, fontWeight: "900", fontSize: 16 },
    modalSub: { marginTop: 2, color: MUTED, fontWeight: "800", fontSize: 12 },
    modalClose: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    modalCloseText: { color: WHITE, fontWeight: "900", fontSize: 12 },
    modalDivider: {
        height: 1,
        backgroundColor: "rgba(255,255,255,0.10)",
        marginTop: 12,
        marginBottom: 12,
    },
    modalSection: { marginBottom: 2 },
    modalSectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    modalSectionTitle: { color: WHITE, fontWeight: "900", fontSize: 14 },

    statusPill: {
        height: 26,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    statusPillText: { color: WHITE, fontWeight: "900", fontSize: 11, letterSpacing: 0.2 },

    winnerBox: {
        marginTop: 10,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    winnerBig: { color: WHITE, fontWeight: "900", fontSize: 18, textAlign: "center" },
    winnerSmall: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, textAlign: "center", lineHeight: 16 },

    payoutHeadline: { marginTop: 10, color: WHITE, fontWeight: "900", fontSize: 15 },
    modalLine: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },
});
