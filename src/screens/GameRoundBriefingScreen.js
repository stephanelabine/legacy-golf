// src/screens/GameRoundBriefingScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    const fixed = Math.round(v * 100) / 100;
    return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function safeArr(v) {
    return Array.isArray(v) ? v : [];
}

function safeObj(v) {
    return v && typeof v === "object" ? v : {};
}

function normKey(x) {
    return String(x || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function detectFormatType(f) {
    const k = normKey(f?.key || f?.id);
    const n = normKey(f?.name);
    const s = `${k} ${n}`.trim();

    const isSecondShot =
        s.includes("secondshotkp") ||
        s.includes("secondshot") ||
        (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
        s.includes("2ndshotkp") ||
        (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

    if (isSecondShot) return "secondshotkp";
    if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";
    if (s.includes("deucepot") || (s.includes("deuce") && s.includes("pot"))) return "deuce_pot";
    if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "putting_contest";
    if (s.includes("skins")) return "skins";
    if (s.includes("kp")) return "kp";
    return "unknown";
}

function getKey(f) {
    return String(f?.key || f?.id || "").trim();
}

function playerId(p, idx) {
    const o = p && typeof p === "object" ? p : {};
    const id =
        o.uid ||
        o.id ||
        o.playerId ||
        o.buddyId ||
        o.email ||
        (typeof o.name === "string" && o.name.trim() ? `name:${o.name.trim()}` : "") ||
        `p${idx + 1}`;
    return String(id);
}

function playerName(p, idx) {
    const o = p && typeof p === "object" ? p : {};
    const nm = o.displayName || o.name || o.fullName || o.label || "";
    const s = String(nm || "").trim();
    return s || `Player ${idx + 1}`;
}

const TITLE_BY_TYPE = {
    kp: "KP",
    longdrive: "Long Drive",
    secondshotkp: "Second Shot KP",
    skins: "Skins",
    deuce_pot: "Deuce Pot",
    putting_contest: "Putting Contest",
};

export default function GameRoundBriefingScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const roundId = route?.params?.roundId || null;

    const [roundDoc, setRoundDoc] = useState(null);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    useEffect(() => {
        if (!roundId) {
            Alert.alert("Missing round", "roundId was not provided.");
            navigation.goBack();
            return;
        }

        const uid = auth?.currentUser?.uid || null;
        if (!uid) {
            Alert.alert("Not signed in", "Please sign in again.");
            navigation.goBack();
            return;
        }

        const isShared = String(roundId).startsWith("sr_");
        const ref = isShared
            ? doc(db, "sharedRounds", String(roundId))
            : doc(db, "users", uid, "rounds", String(roundId));

        const unsub = onSnapshot(
            ref,
            (snap) => {
                const roundData = snap.exists() ? snap.data() : null;
                setRoundDoc(roundData);

                if (isShared && roundData?.status !== "in_progress") {
                    // If it's a shared round and not in progress, show "Waiting for host" message
                    if (roundData?.status === "waiting_for_host") {
                        Alert.alert("Waiting for host", "The host has not started the round yet.");
                        navigation.goBack();  // Routing back to Home screen if the host hasn't started
                    }
                }
            },
            (err) => Alert.alert("Round error", err?.message || "Could not load round.")
        );

        return () => unsub();
    }, [roundId, navigation]);

    const players = useMemo(() => safeArr(roundDoc?.players), [roundDoc]);

    const formats = useMemo(() => {
        return safeArr(roundDoc?.formatsSelected)
            .map((x) => {
                if (typeof x === "string") return { key: x, name: x };
                return { key: x?.key || x?.id || "", name: x?.name || x?.label || x?.title || x?.key || x?.id || "Format" };
            })
            .filter((f) => String(f.key || "").trim());
    }, [roundDoc]);

    const courseName = String(roundDoc?.course?.name || roundDoc?.course?.title || "Course").trim();
    const teeName = String(roundDoc?.tee?.name || roundDoc?.tee?.label || "Tee").trim();

    const scoring = String(roundDoc?.scoring || roundDoc?.scoringMode || "net").toLowerCase();
    const modeLabel = scoring === "gross" ? "Championship" : "Net";

    const formatConfig = safeObj(roundDoc?.formatConfig);
    const formatPools = safeObj(roundDoc?.formatPools);

    const isSharedRound = String(roundId || "").startsWith("sr_");
    const hostUid = String(roundDoc?.hostUid || "").trim();
    const currentUid = String(auth?.currentUser?.uid || "").trim();
    const isJoinerInShared = isSharedRound && !!hostUid && hostUid !== currentUid;

    function includedCountForKey(fk) {
        const ids = players.map((p, idx) => playerId(p, idx)).filter(Boolean);
        const excluded = new Set(safeArr(formatPools?.[fk]?.excludedIds).map((x) => String(x)));
        return ids.filter((id) => !excluded.has(String(id))).length;
    }

    function selectedHoleCountForKey(fk) {
        const entry = safeObj(formatConfig?.[fk]);
        const holes = safeArr(entry?.holes);
        return holes.filter((n) => Number.isFinite(Number(n))).length;
    }

    const perPlayerOwes = useMemo(() => {
        const owes = {};
        players.forEach((p, idx) => {
            const pid = playerId(p, idx);
            owes[pid] = 0;
        });

        formats.forEach((f) => {
            const fk = getKey(f);
            if (!fk) return;

            const type = detectFormatType(f);
            const pool = safeObj(formatPools?.[fk]);

            players.forEach((p, idx) => {
                const pid = playerId(p, idx);
                const excluded = new Set(safeArr(pool?.excludedIds).map((x) => String(x)));
                if (excluded.has(String(pid))) return;

                if (type === "deuce_pot" || type === "putting_contest") {
                    const fee = Number(pool?.entryFee);
                    if (Number.isFinite(fee) && fee > 0) owes[pid] += fee;
                } else if (type === "skins") {
                    // skins is value per skin, not a buy-in; do not add to owed
                } else if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                    const perHole = Number(pool?.amountPerHole);
                    const holes = selectedHoleCountForKey(fk);
                    if (Number.isFinite(perHole) && perHole > 0 && holes > 0) owes[pid] += perHole * holes;
                }
            });
        });

        return owes;
    }, [players, formats, formatPools, formatConfig]);

    const currentUserName = useMemo(() => {
        const nm = String(auth?.currentUser?.displayName || "").trim();
        if (nm) return nm;

        // fallback: if a player has uid matching current user, use that name
        const uid = String(auth?.currentUser?.uid || "").trim();
        if (uid) {
            for (let i = 0; i < players.length; i++) {
                const p = players[i];
                const puid = String(p?.uid || "").trim();
                if (puid && puid === uid) return playerName(p, i);
            }
        }

        return "";
    }, [players]);

    const yourEstimatedBuyIn = useMemo(() => {
        const uid = String(auth?.currentUser?.uid || "").trim();
        if (uid) {
            const direct = Number(perPlayerOwes?.[uid] || 0);
            if (Number.isFinite(direct) && direct >= 0) return direct;

            // sometimes playerId maps to uid inside players array
            for (let i = 0; i < players.length; i++) {
                const pid = playerId(players[i], i);
                if (pid === uid) {
                    const v = Number(perPlayerOwes?.[pid] || 0);
                    return Number.isFinite(v) ? v : 0;
                }
            }
        }

        // fallback: if only one player, show their estimate
        if (players.length === 1) {
            const pid = playerId(players[0], 0);
            const v = Number(perPlayerOwes?.[pid] || 0);
            return Number.isFinite(v) ? v : 0;
        }

        return null;
    }, [players, perPlayerOwes]);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
        const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

        const greenRing = isDark ? "rgba(15,122,74,0.62)" : "rgba(15,122,74,0.72)";
        const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

        const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
        const blueBg = isDark ? "rgba(46,125,255,0.16)" : "rgba(29,53,87,0.12)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: goldBg,
                marginBottom: 12,
            },
            heroKicker: {
                color: theme.text,
                fontSize: 12,
                fontWeight: "900",
                letterSpacing: 1.4,
                opacity: 0.78,
                textTransform: "uppercase",
            },
            heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
            heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

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

            card: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: theme.card2,
                marginBottom: 12,
            },

            row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
            label: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.9 },
            value: { color: theme.text, fontSize: 13, fontWeight: "900" },

            sub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

            factsBox: {
                marginTop: 12,
                borderRadius: 18,
                padding: 12,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            factRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
            factLabel: { color: theme.text, opacity: 0.75, fontSize: 12, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
            factValue: { color: theme.text, fontSize: 13, fontWeight: "900" },
            factDivider: { height: 1, backgroundColor: softBorder },

            highlightCard: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: blue,
                backgroundColor: blueBg,
                marginBottom: 12,
            },
            highlightTitle: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.92 },
            highlightValue: { marginTop: 8, color: theme.text, fontSize: 22, fontWeight: "900" },
            highlightSub: { marginTop: 8, color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 18 },

            greenBox: {
                marginTop: 12,
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: greenRing,
                backgroundColor: greenBg,
            },

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
            primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },
            pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },
        });
    }, [theme, isDark, footerPad]);

    const goodLuckLine = currentUserName ? `Good luck, ${currentUserName}` : "Good luck";

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Round Briefing" subtitle="Quick summary before you start." />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroKicker}>{goodLuckLine}</Text>
                    <Text style={styles.heroTitle}>Play well.</Text>
                    <Text style={styles.heroSub}>
                        Everything is set. This page is the one-glance summary: where you’re playing, what you’re playing, and what each player owes.
                    </Text>

                    <View style={styles.factsBox}>
                        <View style={styles.factRow}>
                            <Text style={styles.factLabel}>Course</Text>
                            <Text style={styles.factValue}>{courseName || "—"}</Text>
                        </View>
                        <View style={styles.factDivider} />
                        <View style={styles.factRow}>
                            <Text style={styles.factLabel}>Tees</Text>
                            <Text style={styles.factValue}>{teeName || "—"}</Text>
                        </View>
                        <View style={styles.factDivider} />
                        <View style={styles.factRow}>
                            <Text style={styles.factLabel}>Mode</Text>
                            <Text style={styles.factValue}>{modeLabel}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.highlightCard}>
                    <Text style={styles.highlightTitle}>Your estimated buy-in</Text>
                    <Text style={styles.highlightValue}>
                        {yourEstimatedBuyIn === null ? "—" : yourEstimatedBuyIn > 0 ? money(yourEstimatedBuyIn) : "$0"}
                    </Text>
                    <Text style={styles.highlightSub}>
                        This is based on selected holes, per-player fees, and exclusions. Skins is a value-per-skin (not a buy-in), so it is not included here.
                    </Text>
                </View>

                <Text style={styles.sectionTitle}>Formats</Text>
                <View style={styles.card}>
                    {!formats.length ? (
                        <Text style={styles.sub}>No formats selected.</Text>
                    ) : (
                        formats.map((f, idx) => {
                            const fk = getKey(f);
                            const type = detectFormatType(f);
                            const title = TITLE_BY_TYPE[type] || String(f?.name || fk || "Format");
                            const included = includedCountForKey(fk);

                            let right = `${included}/${players.length || 0} in`;
                            if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                                const holes = selectedHoleCountForKey(fk);
                                right = holes ? `${holes} holes` : "holes?";
                            }

                            return (
                                <View key={`${fk}_${idx}`} style={[styles.row, { paddingVertical: 10 }]}>
                                    <Text style={styles.label}>{title}</Text>
                                    <Text style={styles.value}>{right}</Text>
                                </View>
                            );
                        })
                    )}
                </View>

                <Text style={styles.sectionTitle}>Who owes what</Text>
                <View style={styles.card}>
                    {!players.length ? (
                        <Text style={styles.sub}>No players yet.</Text>
                    ) : (
                        players.map((p, idx) => {
                            const pid = playerId(p, idx);
                            const nm = playerName(p, idx);
                            const owes = Number(perPlayerOwes?.[pid] || 0);
                            return (
                                <View key={`${pid}_${idx}`} style={[styles.row, { paddingVertical: 10 }]}>
                                    <Text style={styles.label}>{nm}</Text>
                                    <Text style={styles.value}>{owes > 0 ? money(owes) : "$0"}</Text>
                                </View>
                            );
                        })
                    )}
                </View>

                <View style={styles.greenBox}>
                    <Text style={styles.sub}>
                        Note: This is the setup estimate from your selected formats and buy-ins. Winnings and settle-up will be calculated at the end of the round.
                    </Text>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    disabled={isJoinerInShared}
                    onPress={async () => {
                        try {
                            const uid = auth?.currentUser?.uid || null;
                            if (!uid) {
                                Alert.alert("Not signed in", "Please sign in again.");
                                return;
                            }
                            if (!roundId) {
                                Alert.alert("Missing round", "roundId was not provided.");
                                return;
                            }

                            const isShared = String(roundId).startsWith("sr_");
                            const hostUid = String(roundDoc?.hostUid || "");

                            if (isShared && hostUid && hostUid !== String(uid)) {
                                Alert.alert("Waiting for host", "Only the host can start the round.");
                                return;
                            }

                            const ref = isShared
                                ? doc(db, "sharedRounds", String(roundId))
                                : doc(db, "users", uid, "rounds", String(roundId));

                            const snap = await getDoc(ref);
                            const data = snap.exists() ? (snap.data() || {}) : {};

                            const patch = {
                                status: "in_progress",
                                startHole: 1,
                                currentHole: 1,
                                hole: 1,
                                holeNumber: 1,
                                holeIndex: 0,
                                updatedAt: serverTimestamp(),
                            };

                            if (!data?.startedAt) {
                                patch.startedAt = serverTimestamp();
                            }

                            await updateDoc(ref, patch);

                            navigation.replace(ROUTES.GAME_ROUND_START_SPLASH, { roundId, ms: 3000 });
                        } catch (e) {
                            Alert.alert("Start failed", e?.message || "Could not start the round.");
                        }
                    }}
                    style={({ pressed }) => [
                        styles.primaryBtn,
                        isJoinerInShared && { opacity: 0.55 },
                        pressed && styles.pressed,
                    ]}
                >
                    <Text style={styles.primaryText}>
                        {isJoinerInShared ? "Waiting for host" : "Start Round"}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}
