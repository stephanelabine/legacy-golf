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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { collection, onSnapshot } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { db } from "../firebase/firebase";
import { pickTournamentNavParams, assertTournamentNavParams } from "../utils/tournamentNav";

const BG = "#06150F"; // deep course green
const CARD = "rgba(18,22,30,0.92)"; // premium dark glass
const ROW = "#1D3557";
const INNER = "#243E63";
const MUTED = "#AFC3DA";
const WHITE = "#FFFFFF";
const YELLOW = "#F2C94C";

function toInt(v) {
    const n = parseInt(String(v ?? ""), 10);
    return Number.isFinite(n) ? n : 0;
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

// v1 net: use explicit net if present; otherwise gross - handicap-ish if present.
// (Later we compute properly from course handicap + stroke index allocation.)
function getNetTotal(scoreDoc, grossTotal) {
    const d = scoreDoc || {};
    const explicit = d?.netTotal ?? d?.net ?? d?.roundNet ?? null;
    if (Number.isFinite(Number(explicit))) return Number(explicit);

    const hdcp = d?.handicapStrokes ?? d?.courseHandicap ?? d?.handicap ?? null;
    if (Number.isFinite(Number(hdcp))) return Number(grossTotal) - Number(hdcp);

    return null;
}

export default function TournamentRoundFinalResultsScreen({ navigation, route }) {
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);
    const totalHoles = Number(params?.totalHoles || 18);

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

    const [showFull, setShowFull] = useState(false);
    const [showAllFormats, setShowAllFormats] = useState(false);

    // Tabs: single screen hub (no navigation between tabs)
    const TAB_LEADERBOARD = "leaderboard";
    const TAB_TEAM = "team";
    const TAB_FORMATS = "formats";

    // Formats source (v1 placeholder list only if formats tab exists)
    const formatsFromParams = useMemo(() => {
        return Array.isArray(params?.formats) ? params.formats : null;
    }, [params?.formats]);

    const hasFormats = useMemo(() => {
        if (formatsFromParams && formatsFromParams.length) return true;
        if (params?.hasFormats === true) return true;
        if (params?.showFormatsTab === true) return true;
        return false;
    }, [formatsFromParams, params?.hasFormats, params?.showFormatsTab]);

    const hasTeam = useMemo(() => {
        if (params?.teamVsTeamActive === true) return true;
        if (Array.isArray(params?.teamMatches) && params.teamMatches.length) return true;
        if (Array.isArray(params?.matches) && params.matches.length) return true;
        if (Array.isArray(params?.teams) && params.teams.length) return true;
        if (params?.team1Name && params?.team2Name) return true;
        return false;
    }, [params]);

    const tabs = useMemo(() => {
        const out = [
            { key: TAB_LEADERBOARD, label: "Leaderboard" },
        ];
        if (hasTeam) out.push({ key: TAB_TEAM, label: "Team vs Team" });
        if (hasFormats) out.push({ key: TAB_FORMATS, label: "Formats" });
        return out;
    }, [hasTeam, hasFormats]);

    const [activeTab, setActiveTab] = useState(TAB_LEADERBOARD);

    React.useEffect(() => {
        // Keep activeTab valid if tab availability changes
        const keys = tabs.map((t) => t.key);
        if (!keys.includes(activeTab)) {
            setActiveTab(TAB_LEADERBOARD);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabs.length, hasTeam, hasFormats]);

    const headerSubtitle = useMemo(() => {
        if (activeTab === TAB_TEAM) return "TEAM VS TEAM";
        if (activeTab === TAB_FORMATS) return "FORMATS / MONEY GAMES";
        return "LEADERBOARD";
    }, [activeTab]);

    useFocusEffect(
        useCallback(() => {
            if (!tournamentId) return undefined;

            setLoading(true);

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
                    setLoading(false);
                },
                () => setLoading(false)
            );

            return () => unsub();
        }, [tournamentId, roundNumber])
    );

    const rows = useMemo(() => {
        const ids = Object.keys(scoresByPid || {});
        const out = ids.map((pid) => {
            const d = scoresByPid?.[pid] || {};
            const gross = sumPlayerStrokes(d, totalHoles);
            const putts = sumPlayerPutts(d, totalHoles);
            const net = getNetTotal(d, gross);

            return {
                pid: String(pid),
                name: String(d?.playerName || d?.name || "Player"),
                gross,
                putts,
                net,
            };
        });

        const netCount = out.filter((x) => Number.isFinite(Number(x.net))).length;
        const sortByNet = netCount >= Math.max(1, Math.floor(out.length / 2));

        out.sort((a, b) => {
            if (sortByNet) {
                const an = Number.isFinite(Number(a.net)) ? Number(a.net) : 9999;
                const bn = Number.isFinite(Number(b.net)) ? Number(b.net) : 9999;
                return (
                    an - bn ||
                    a.gross - b.gross ||
                    a.putts - b.putts ||
                    a.name.localeCompare(b.name)
                );
            }
            return (
                a.gross - b.gross ||
                a.putts - b.putts ||
                a.name.localeCompare(b.name)
            );
        });

        return out;
    }, [scoresByPid, totalHoles]);

    const top3 = useMemo(() => rows.slice(0, 3), [rows]);
    const dataToRender = useMemo(() => (showFull ? rows : top3), [rows, top3, showFull]);

    const hasNet = useMemo(() => rows.some((r) => Number.isFinite(Number(r.net))), [rows]);

    // Formats v1 (only used if formats tab exists)
    const formats = useMemo(() => {
        if (formatsFromParams && formatsFromParams.length) {
            return formatsFromParams.map((f, i) => ({
                key: String(f?.id ?? f?.key ?? i),
                title: String(f?.name ?? f?.title ?? `Format ${i + 1}`),
                status: String(f?.status ?? "COMING SOON"),
                summary: String(f?.summary ?? "Winners will appear here after format calculations are added."),
            }));
        }

        return [
            { key: "net", title: "Net Stroke Play", status: "LEADERS", summary: "Leaders shown in the leaderboard tab. Winners later." },
            { key: "kp", title: "KP (Closest to Pin)", status: "COMING SOON", summary: "KP winners will be summarized here." },
            { key: "ld", title: "Long Drive", status: "COMING SOON", summary: "Long Drive winners will be summarized here." },
            { key: "pools", title: "Pools / Flights", status: "COMING SOON", summary: "Pools/flights winners will be summarized here." },
        ];
    }, [formatsFromParams]);

    const formatsToRender = useMemo(() => {
        if (showAllFormats) return formats;
        return formats.slice(0, 2);
    }, [formats, showAllFormats]);

    // Team vs Team v1 (placeholder UI; later driven by tournament format data)
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

    const startNextRound = useCallback(() => {
        Alert.alert(
            "Start Next Round",
            "Round 2 splash + next-round start flow is next. For now, this is a placeholder."
        );
    }, []);

    const goHome = useCallback(() => {
        navigation.navigate(ROUTES.HOME);
    }, [navigation]);

    const title = useMemo(() => `ROUND ${roundNumber} RESULTS`, [roundNumber]);

    const FOOTER_H = 132;

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
                            {showFull ? "Show top 3" : "View full leaderboard"}
                        </Text>
                    </Pressable>
                </View>

                <View style={styles.colHeader}>
                    <Text style={[styles.colText, styles.colPlayer]}>PLAYER</Text>
                    <Text style={[styles.colText, styles.colNum]}>GROSS</Text>
                    <Text style={[styles.colText, styles.colNum]}>PUTTS</Text>
                    {hasNet ? <Text style={[styles.colText, styles.colNum]}>NET</Text> : null}
                </View>

                <View style={styles.divider} />

                <View>
                    {dataToRender.map((item, index) => {
                        const rank = index + 1;
                        const netLabel = Number.isFinite(Number(item.net)) ? String(item.net) : "—";
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
                            This panel will show team names, who’s leading, and a scrollable match list once team scoring is connected.
                        </Text>
                    </View>
                )}
            </View>
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

                {formatsToRender.map((f) => (
                    <View key={f.key} style={styles.formatCard}>
                        <View style={styles.formatTop}>
                            <Text style={styles.formatTitle} numberOfLines={1}>
                                {f.title}
                            </Text>
                            <View style={styles.formatPill}>
                                <Text style={styles.formatPillText} numberOfLines={1}>
                                    {f.status}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.formatSub}>{f.summary}</Text>
                    </View>
                ))}

                <View style={{ height: 2 }} />
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
                        <Pressable
                            onPress={goHome}
                            style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
                        >
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
                            contentContainerStyle={{ paddingBottom: FOOTER_H + 24, paddingTop: tabs.length > 1 ? 6 : 10 }}
                            showsVerticalScrollIndicator={false}
                        >
                            {renderActiveContent()}
                            <View style={{ height: 10 }} />
                        </ScrollView>

                        {/* Fixed action bar */}
                        <View style={styles.footer}>
                            <Pressable
                                onPress={startNextRound}
                                style={({ pressed }) => [styles.btnPrimary, pressed && styles.pressed]}
                            >
                                <Text style={styles.btnPrimaryText}>Start Next Round</Text>
                            </Pressable>

                            <View style={{ height: 10 }} />

                            <Pressable
                                onPress={goTournamentHub}
                                style={({ pressed }) => [styles.btnOutline, pressed && styles.pressed]}
                            >
                                <Text style={styles.btnOutlineText}>Back to Tournament Hub</Text>
                            </Pressable>
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

    colHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
    colText: { color: "rgba(255,255,255,0.68)", fontWeight: "900", fontSize: 11, letterSpacing: 0.7 },
    colPlayer: { flex: 1 },
    colNum: { width: 64, textAlign: "center" },

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

    teamNamesRow: {
        flexDirection: "row",
        gap: 10,
    },
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

    formatCard: {
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        padding: 12,
        marginBottom: 10,
    },
    formatTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    formatTitle: { flex: 1, color: WHITE, fontWeight: "900", fontSize: 14 },
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
    formatSub: { marginTop: 8, color: MUTED, fontWeight: "800", fontSize: 12, lineHeight: 16 },

    footer: {
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 16,
    },

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
});
