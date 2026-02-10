// src/screens/TournamentPlayerBriefingScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, collection, query, orderBy } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/* ---------------- helpers ---------------- */

function clampInt(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    const x = Math.round(v);
    return Math.max(min, Math.min(max, x));
}

function safeStr(x) {
    return String(x ?? "").trim();
}

function toTimeLabel(v) {
    const s = safeStr(v);
    return s ? s : "TBD";
}

function toHoleLabel(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "1";
    return String(Math.round(n));
}

function getPlayerId(p) {
    return String(p?.uid || p?.id || p?._id || "").trim();
}

function getPlayerName(p) {
    return String(p?.displayName || p?.name || p?.fullName || p?.email || "Player");
}

function pickUserLabelFromUserDoc(userDoc) {
    if (!userDoc || typeof userDoc !== "object") return "";
    const a = safeStr(userDoc.displayName);
    if (a) return a;
    const b = safeStr(userDoc.name);
    if (b) return b;
    const c = safeStr(userDoc.fullName);
    if (c) return c;
    const d = safeStr(userDoc.email);
    if (d) return d;
    return "";
}

function guessTeamNamesFromTournamentName(tournamentName) {
    const s = String(tournamentName || "").toLowerCase();
    if (s.includes("hackers") && s.includes("slackers")) {
        return { teamAName: "Hackers", teamBName: "Slackers" };
    }
    return { teamAName: "Team A", teamBName: "Team B" };
}

function pickFormatTeamNames(formatDoc) {
    const cfg = formatDoc?.config && typeof formatDoc.config === "object" ? formatDoc.config : null;
    const teams = cfg?.teams && typeof cfg.teams === "object" ? cfg.teams : null;
    const a = safeStr(teams?.teamA?.name);
    const b = safeStr(teams?.teamB?.name);
    return { teamAName: a, teamBName: b };
}

/* ---------------- component ---------------- */

export default function TournamentPlayerBriefingScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const tournamentId = route?.params?.tournamentId;

    const [t, setT] = useState(null);
    const [teamVTeamFormat, setTeamVTeamFormat] = useState(null);
    const [meDoc, setMeDoc] = useState(null);

    // universal groups for this round
    const [roundGroups, setRoundGroups] = useState([]);

    // roster members (format-agnostic fallback)
    const [rosterMembers, setRosterMembers] = useState([]);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const u = auth.currentUser;
    const myUid = useMemo(() => String(u?.uid || "").trim(), [u]);

    /* ---- subscribe tournament ---- */
    useEffect(() => {
        if (!tournamentId) return;

        const ref = doc(db, "tournaments", String(tournamentId));
        const unsub = onSnapshot(
            ref,
            (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
        );

        return () => unsub();
    }, [tournamentId]);

    /* ---- subscribe format doc (team_vs_team) ---- */
    useEffect(() => {
        if (!tournamentId) return;

        const ref = doc(db, "tournaments", String(tournamentId), "formats", "team_vs_team");
        const unsub = onSnapshot(
            ref,
            (snap) => setTeamVTeamFormat(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setTeamVTeamFormat(null)
        );

        return () => unsub();
    }, [tournamentId]);

    /* ---- subscribe user doc ---- */
    useEffect(() => {
        if (!myUid) return;

        const ref = doc(db, "users", String(myUid));
        const unsub = onSnapshot(
            ref,
            (snap) => setMeDoc(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            () => setMeDoc(null)
        );

        return () => unsub();
    }, [myUid]);

    const tournamentName = useMemo(() => String(t?.name || "Tournament"), [t]);

    const roundNum = useMemo(() => {
        const r = Number(t?.activeRound);
        if (Number.isFinite(r) && r > 0) return clampInt(r, 1, 10);
        return 1;
    }, [t]);

    /* ---- subscribe universal round groups ---- */
    useEffect(() => {
        if (!tournamentId) return;

        const roundKey = `r${roundNum}`;
        const qy = query(
            collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "groups"),
            orderBy("orderIndex", "asc")
        );

        const unsub = onSnapshot(
            qy,
            (snap) => {
                const list = (snap?.docs || []).map((d) => ({ id: d.id, ...((d.data && d.data()) || {}) }));
                setRoundGroups(list);
            },
            () => setRoundGroups([])
        );

        return () => unsub();
    }, [tournamentId, roundNum]);

    /* ---- subscribe roster members (fallback if groups missing) ---- */
    useEffect(() => {
        if (!tournamentId) return;

        const ref = collection(db, "tournaments", String(tournamentId), "members");
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const rows = [];
                snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
                setRosterMembers(rows);
            },
            () => setRosterMembers([])
        );

        return () => unsub();
    }, [tournamentId]);

    const rosterById = useMemo(() => {
        const m = new Map();
        for (const r of Array.isArray(rosterMembers) ? rosterMembers : []) {
            const uid = String(r?.uid || r?.id || "").trim();
            if (!uid) continue;
            m.set(uid, r);
        }
        return m;
    }, [rosterMembers]);

    /* ---- detect team vs team is truly active ---- */
    const teamVsTeam = useMemo(() => {
        return t?.teamVsTeam && typeof t.teamVsTeam === "object" ? t.teamVsTeam : null;
    }, [t]);

    const hasTeamVsTeam = useMemo(() => {
        const a = Array.isArray(teamVsTeam?.teamA) ? teamVsTeam.teamA : [];
        const b = Array.isArray(teamVsTeam?.teamB) ? teamVsTeam.teamB : [];
        if (a.length || b.length) return true;

        // If the format doc exists AND has meaningful config, treat it as active
        if (teamVTeamFormat && (teamVTeamFormat?.enabled === true || teamVTeamFormat?.isSelected === true)) return true;

        // otherwise not active
        return false;
    }, [teamVsTeam, teamVTeamFormat]);

    const teamNames = useMemo(() => {
        const guess = guessTeamNamesFromTournamentName(tournamentName);

        const a0 = safeStr(teamVsTeam?.teamAName);
        const b0 = safeStr(teamVsTeam?.teamBName);

        const f = pickFormatTeamNames(teamVTeamFormat);
        const a1 = safeStr(f?.teamAName);
        const b1 = safeStr(f?.teamBName);

        const a = a0 || a1 || guess.teamAName || "Team A";
        const b = b0 || b1 || guess.teamBName || "Team B";
        return { teamAName: a, teamBName: b };
    }, [teamVsTeam, teamVTeamFormat, tournamentName]);

    const allPlayers = useMemo(() => {
        if (hasTeamVsTeam) {
            const a = Array.isArray(teamVsTeam?.teamA) ? teamVsTeam.teamA : [];
            const b = Array.isArray(teamVsTeam?.teamB) ? teamVsTeam.teamB : [];
            return [...a, ...b];
        }

        // non-team: roster members
        return (Array.isArray(rosterMembers) ? rosterMembers : []).map((m) => ({
            uid: String(m?.uid || m?.id || "").trim(),
            displayName: safeStr(m?.displayName || m?.name),
            name: safeStr(m?.name || m?.displayName),
            email: safeStr(m?.email || ""),
        }));
    }, [hasTeamVsTeam, teamVsTeam, rosterMembers]);

    const playersById = useMemo(() => {
        const m = new Map();

        if (!hasTeamVsTeam) {
            for (const [k, v] of rosterById.entries()) m.set(String(k), v);
            return m;
        }

        for (const p of allPlayers) {
            const id = getPlayerId(p);
            if (id) m.set(String(id), p);
        }
        return m;
    }, [hasTeamVsTeam, allPlayers, rosterById]);

    const resolveName = (uid) => {
        const key = String(uid || "").trim();
        if (!key) return "TBD";
        const p = playersById.get(key);
        return p ? getPlayerName(p) : "TBD";
    };

    const myLabel = useMemo(() => {
        const authName = safeStr(u?.displayName);
        if (authName) return authName;

        const fromUserDoc = pickUserLabelFromUserDoc(meDoc);
        if (fromUserDoc) return fromUserDoc;

        const fromRoster = myUid ? safeStr(resolveName(myUid)) : "";
        if (fromRoster && fromRoster !== "TBD") return fromRoster;

        return "You";
    }, [u, meDoc, myUid, playersById]);

    const myStartingHole = useMemo(() => {
        // Prefer universal group startingHole if available later; fallback here for top tile
        const n = Number(t?.startingHole);
        if (Number.isFinite(n) && n > 0) return toHoleLabel(n);
        return "1";
    }, [t]);

    const roundKey = useMemo(() => `r${roundNum}`, [roundNum]);

    const myGroup = useMemo(() => {
        if (!myUid) return null;

        const groups = Array.isArray(roundGroups) ? roundGroups : [];

        // 1) Try to find my universal group
        const g = groups.find((x) => Array.isArray(x?.playerIds) && x.playerIds.map(String).includes(String(myUid)));
        if (g) {
            const teeTime = safeStr(g?.teeTime);
            const ids = Array.isArray(g?.playerIds) ? g.playerIds.map(String).filter(Boolean) : [];
            const startingHole = Number(g?.startingHole) || Number(t?.startingHole) || 1;

            const matchups = Array.isArray(g?.matchups) ? g.matchups : null;

            let rows = [];
            if (matchups && matchups.length) {
                rows = matchups.slice(0, 2).map((m) => ({
                    aUid: String(m?.aUid || ""),
                    bUid: String(m?.bUid || ""),
                }));
            } else {
                // Non-team (or no matchups): show first 4 players as 2 lines
                const a = ids[0] || "";
                const b = ids[1] || "";
                const c = ids[2] || "";
                const d = ids[3] || "";
                rows = [
                    { aUid: a, bUid: b },
                    { aUid: c, bUid: d },
                ].filter((m0) => String(m0.aUid || m0.bUid).trim());
            }

            return {
                teeTime: teeTime || "",
                startingHole,
                playerIds: ids,
                rows,
            };
        }

        // 2) Fallback if groups are missing: build implicit group from roster/team arrays
        const idsFallback = (Array.isArray(allPlayers) ? allPlayers : [])
            .map((p) => getPlayerId(p))
            .map(String)
            .filter(Boolean);

        if (!idsFallback.length) return null;

        const teeTime = safeStr(t?.teeTime);
        const startingHole = Number(t?.startingHole) || 1;

        const a = idsFallback[0] || "";
        const b = idsFallback[1] || "";
        const c = idsFallback[2] || "";
        const d = idsFallback[3] || "";
        const rows = [
            { aUid: a, bUid: b },
            { aUid: c, bUid: d },
        ].filter((m0) => String(m0.aUid || m0.bUid).trim());

        return {
            teeTime: teeTime || "",
            startingHole,
            playerIds: idsFallback,
            rows,
            _implicit: true,
        };
    }, [myUid, roundGroups, allPlayers, t]);

    const myTeeTime = useMemo(() => {
        return toTimeLabel(myGroup?.teeTime || t?.teeTime);
    }, [myGroup, t]);

    const effectiveStartingHole = useMemo(() => {
        return toHoleLabel(myGroup?.startingHole || t?.startingHole || 1);
    }, [myGroup, t]);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
        const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

        const teamAGreen = isDark ? "rgba(26, 182, 108, 0.98)" : "rgba(15, 122, 74, 0.98)";
        const teamBGold = isDark ? "rgba(214, 171, 84, 0.98)" : "rgba(214, 171, 84, 0.98)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 140 },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: goldBg,
                marginBottom: 12,
                alignItems: "center",
            },
            kicker: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.78,
                textTransform: "uppercase",
                textAlign: "center",
            },
            title: { marginTop: 10, color: theme.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
            sub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
                textAlign: "center",
            },

            tilesRow: { marginTop: 14, flexDirection: "row", gap: 12, alignSelf: "stretch" },
            tile: {
                flex: 1,
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: theme.card2,
            },
            tileLabel: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "900", letterSpacing: 0.2, textTransform: "uppercase" },
            tileValue: { marginTop: 8, color: theme.text, fontSize: 22, fontWeight: "900" },
            tileSub: { marginTop: 6, color: theme.text, opacity: 0.70, fontSize: 12, fontWeight: "800" },

            sectionTitle: {
                marginTop: 14,
                marginBottom: 10,
                color: theme.text,
                fontSize: 13,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.75,
                textTransform: "uppercase",
            },

            groupCard: {
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: theme.card2,
            },

            groupHeaderRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", flexWrap: "wrap" },
            groupHeaderA: { color: teamAGreen, fontSize: 15, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },
            groupHeaderVs: { color: theme.text, opacity: 0.78, fontSize: 15, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },
            groupHeaderB: { color: teamBGold, fontSize: 15, fontWeight: "900", letterSpacing: 0.2, textAlign: "center" },

            groupHeaderSub: {
                marginTop: 6,
                color: theme.text,
                opacity: 0.72,
                fontSize: 12,
                fontWeight: "800",
                textAlign: "center",
            },

            line: { marginTop: 14, height: 1, backgroundColor: softBorder },

            matchupLine: {
                marginTop: 12,
                borderRadius: 14,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(10,15,26,0.04)",
            },
            matchupText: {
                color: theme.text,
                fontSize: 15,
                fontWeight: "900",
                textAlign: "center",
                letterSpacing: 0.2,
            },
            nameA: { color: teamAGreen },
            nameB: { color: teamBGold },
            vsText: { color: theme.text, opacity: 0.78 },

            footer: {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: 16,
                paddingBottom: footerPad,
                paddingTop: 12,
                backgroundColor: theme.bg,
                borderTopWidth: 1,
                borderTopColor: theme.divider,
            },

            primaryBtn: {
                height: 56,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)",
            },
            primaryBtnInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
            icon: { color: "#fff", fontSize: 16, fontWeight: "900" },
            primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

            secondaryBtn: {
                marginTop: 10,
                height: 52,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
            },
            secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

            pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
        });
    }, [theme, isDark, footerPad]);

    if (!tournamentId) {
        return (
            <View style={styles.screen}>
                <ScreenHeader navigation={navigation} title="Player Briefing" subtitle="Missing tournament." />
                <View style={[styles.content, { paddingTop: 18 }]}>
                    <View style={styles.hero}>
                        <Text style={styles.title}>Missing tournament</Text>
                        <Text style={styles.sub}>No tournamentId was provided.</Text>
                    </View>
                </View>
            </View>
        );
    }

    const groupCount = Array.isArray(myGroup?.playerIds) ? myGroup.playerIds.length : 0;

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Player Briefing" subtitle="Welcome, tee time, start hole, and your group." />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.kicker}>{tournamentName}</Text>
                    <Text style={styles.title}>Welcome, {myLabel}</Text>
                    <Text style={styles.sub}>You’re about to begin Round {roundNum}. Play well. Good luck.</Text>

                    <View style={styles.tilesRow}>
                        <View style={styles.tile}>
                            <Text style={styles.tileLabel}>Tee time</Text>
                            <Text style={styles.tileValue}>{myTeeTime}</Text>
                            <Text style={styles.tileSub}>Proceed to your starting tee.</Text>
                        </View>

                        <View style={styles.tile}>
                            <Text style={styles.tileLabel}>Starting hole</Text>
                            <Text style={styles.tileValue}>#{effectiveStartingHole}</Text>
                            <Text style={styles.tileSub}>Hole {effectiveStartingHole} to begin.</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Your group</Text>

                <View style={styles.groupCard}>
                    {hasTeamVsTeam ? (
                        <View style={styles.groupHeaderRow}>
                            <Text style={styles.groupHeaderA} numberOfLines={1}>{teamNames.teamAName}</Text>
                            <Text style={styles.groupHeaderVs}>{" "}vs{" "}</Text>
                            <Text style={styles.groupHeaderB} numberOfLines={1}>{teamNames.teamBName}</Text>
                        </View>
                    ) : (
                        <View style={styles.groupHeaderRow}>
                            <Text style={styles.groupHeaderVs} numberOfLines={1}>{`Group • ${groupCount} players`}</Text>
                        </View>
                    )}

                    <Text style={styles.groupHeaderSub}>{`Round ${roundNum} • Tee time ${myTeeTime} • Start hole ${effectiveStartingHole}`}</Text>

                    <View style={styles.line} />

                    {myGroup?.playerIds?.length ? (
                        // Non-team: show the list of names (and also works for team if no matchups written)
                        (hasTeamVsTeam && myGroup?.rows?.length ? (
                            myGroup.rows.map((m0, idx) => {
                                const aName = resolveName(m0.aUid);
                                const bName = resolveName(m0.bUid);
                                return (
                                    <View key={`m-${idx}`} style={styles.matchupLine}>
                                        <Text style={styles.matchupText} numberOfLines={1}>
                                            <Text style={styles.nameA}>{aName}</Text>
                                            <Text style={styles.vsText}> vs </Text>
                                            <Text style={styles.nameB}>{bName}</Text>
                                        </Text>
                                    </View>
                                );
                            })
                        ) : (
                            myGroup.playerIds.map((pid, idx) => (
                                <View key={`p-${pid}-${idx}`} style={styles.matchupLine}>
                                    <Text style={styles.matchupText} numberOfLines={1}>{resolveName(pid)}</Text>
                                </View>
                            ))
                        ))
                    ) : (
                        <View style={{ marginTop: 12 }}>
                            <Text style={styles.sub}>Group not found yet for this player.</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={() =>
                        navigation.navigate(ROUTES.TOURNAMENT_ROUND_START_SPLASH, {
                            tournamentId,
                            devPreview: true,
                            roundIndex: (Number(t?.activeRound) || 1) - 1,
                            holeIndex: (Number(t?.startingHole) || 1) - 1,
                            sideGameKey: "LONG_DRIVE",
                        })
                    }
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                    <View style={styles.primaryBtnInner}>
                        <Text style={styles.icon}>✅</Text>
                        <Text style={styles.primaryText}>Start round (dev)</Text>
                        <Text style={styles.icon}>✅</Text>
                    </View>
                </Pressable>

                <Pressable
                    onPress={() => navigation.navigate(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId })}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
                >
                    <Text style={styles.secondaryText}>Back to overview</Text>
                </Pressable>
            </View>
        </View>
    );
}
