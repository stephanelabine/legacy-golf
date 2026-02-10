// src/screens/TournamentGroupsScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Alert, ScrollView, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, collection, writeBatch, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/* ---------------- helpers ---------------- */

function safeStr(x) {
    return String(x ?? "").trim();
}

function clampInt(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    const x = Math.round(v);
    return Math.max(min, Math.min(max, x));
}

function chunkIntoGroups(list, size) {
    const out = [];
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function getUid(m) {
    return safeStr(m?.uid || m?.id || "");
}

function getName(m) {
    return safeStr(m?.displayName || m?.name || m?.fullName || m?.email || "Player");
}

/* ---------------- component ---------------- */

export default function TournamentGroupsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const tournamentId = route?.params?.tournamentId;

    const [t, setT] = useState(null);
    const [members, setMembers] = useState([]);

    const u = auth.currentUser;
    const myUid = useMemo(() => safeStr(u?.uid), [u]);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    // round selection (default Round 1)
    const roundsTotal = useMemo(() => Math.max(1, Number(t?.roundsTotal || 1)), [t]);
    const [roundNum, setRoundNum] = useState(1);

    // tee times per group (local state)
    const [teeTimeByGroupKey, setTeeTimeByGroupKey] = useState({}); // { "g1": "9:10 AM", ... }

    // modal
    const [timeModalOpen, setTimeModalOpen] = useState(false);
    const [timeModalGroupKey, setTimeModalGroupKey] = useState(null);
    const [timeInput, setTimeInput] = useState("");

    useEffect(() => {
        if (!tournamentId) return;

        const tref = doc(db, "tournaments", String(tournamentId));
        const unsubT = onSnapshot(
            tref,
            (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
            (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
        );

        const mref = collection(db, "tournaments", String(tournamentId), "members");
        const unsubM = onSnapshot(
            mref,
            (snap) => {
                const rows = [];
                snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
                setMembers(rows);
            },
            () => setMembers([])
        );

        return () => {
            unsubT();
            unsubM();
        };
    }, [tournamentId]);

    useEffect(() => {
        // keep selected round valid if roundsTotal changes
        setRoundNum((r) => clampInt(r, 1, Math.max(1, roundsTotal)));
    }, [roundsTotal]);

    useEffect(() => {
        if (!tournamentId) return;

        const roundKey = `r${roundNum}`;
        const gref = collection(db, "tournaments", String(tournamentId), "rounds", roundKey, "groups");

        const unsubG = onSnapshot(
            gref,
            (snap) => {
                const next = {};
                snap.forEach((d) => {
                    const data = d.data() || {};
                    const key = safeStr(data.groupId || d.id);
                    const tt = safeStr(data.teeTime || "");
                    if (key) next[key] = tt;
                });

                // merge so local edits don't get wiped while you're still on-screen
                setTeeTimeByGroupKey((prev) => ({ ...(prev || {}), ...(next || {}) }));
            },
            () => { }
        );

        return () => unsubG();
    }, [tournamentId, roundNum]);


    const startingHole = useMemo(() => {
        const n = Number(t?.startingHole);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
        return 1;
    }, [t]);

    const isHost = useMemo(() => {
        const ownerUid = safeStr(t?.ownerUid);
        if (!ownerUid) return true; // fallback
        return myUid && ownerUid === myUid;
    }, [t, myUid]);

    // stable roster ordering: organizer (ownerUid) first, then alpha by name
    const roster = useMemo(() => {
        const ownerUid = safeStr(t?.ownerUid);
        const list = (Array.isArray(members) ? members : [])
            .map((m) => ({
                ...m,
                _uid: getUid(m),
                _name: getName(m),
            }))
            .filter((m) => !!m._uid);

        list.sort((a, b) => {
            const aOwner = ownerUid && a._uid === ownerUid;
            const bOwner = ownerUid && b._uid === ownerUid;
            if (aOwner && !bOwner) return -1;
            if (!aOwner && bOwner) return 1;
            return String(a._name).localeCompare(String(b._name));
        });

        return list;
    }, [members, t]);

    // auto-groups of 4 (foursomes)
    const groups = useMemo(() => {
        const chunks = chunkIntoGroups(roster, 4);
        return chunks.map((chunk, idx) => {
            const key = `g${idx + 1}`;
            return {
                key,
                orderIndex: idx + 1,
                playerIds: chunk.map((m) => String(m._uid)),
                players: chunk,
            };
        });
    }, [roster]);

    const openTeeTimeModal = useCallback(
        (groupKey) => {
            const existing = safeStr(teeTimeByGroupKey?.[groupKey] || "");
            setTimeModalGroupKey(groupKey);
            setTimeInput(existing);
            setTimeModalOpen(true);
        },
        [teeTimeByGroupKey]
    );

    const closeTeeTimeModal = useCallback(() => {
        setTimeModalOpen(false);
        setTimeModalGroupKey(null);
        setTimeInput("");
    }, []);

    const saveTeeTime = useCallback(() => {
        const gk = timeModalGroupKey;
        if (!gk) return closeTeeTimeModal();

        const val = safeStr(timeInput);
        setTeeTimeByGroupKey((prev) => ({ ...(prev || {}), [gk]: val }));
        closeTeeTimeModal();
    }, [timeModalGroupKey, timeInput, closeTeeTimeModal]);

    async function writeGroupsToFirestore(opts = {}) {
        const silent = !!opts?.silent;

        if (!tournamentId) return false;

        if (!isHost) {
            if (!silent) Alert.alert("Organizer only", "Only the organizer can save groups and tee times.");
            return false;
        }
        if (!groups.length) {
            if (!silent) Alert.alert("No players", "Add players first.");
            return false;
        }

        try {
            const batch = writeBatch(db);
            const roundKey = `r${roundNum}`;
            const base = ["tournaments", String(tournamentId), "rounds", roundKey, "groups"];

            for (const g of groups) {
                const teeTime = safeStr(teeTimeByGroupKey?.[g.key] || "");
                const ref = doc(db, ...base, g.key);

                batch.set(
                    ref,
                    {
                        groupId: g.key,
                        orderIndex: Number(g.orderIndex) || 1,
                        teeTime: teeTime,
                        startingHole: Number(startingHole) || 1,
                        playerIds: Array.isArray(g.playerIds) ? g.playerIds.map(String).filter(Boolean) : [],
                        matchups: [], // universal shape (team format may overwrite later)
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            }

            batch.set(
                doc(db, "tournaments", String(tournamentId)),
                { groupsReady: true, updatedAt: serverTimestamp() },
                { merge: true }
            );

            await batch.commit();

            if (!silent) Alert.alert("Saved", `Groups + tee times saved for Round ${roundNum}.`);
            return true;
        } catch (e) {
            if (!silent) Alert.alert("Save failed", e?.message || "Could not write groups.");
            return false;
        }
    }

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";
        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 120 },

            hero: {
                borderRadius: 22,
                padding: 16,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: theme.card2,
            },
            heroTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
            heroSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

            roundsRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
            roundChip: {
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            roundChipActive: { borderColor: goldBorder, backgroundColor: isDark ? "rgba(214,171,84,0.12)" : "rgba(214,171,84,0.14)" },
            roundChipText: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.86 },

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
                marginBottom: 12,
            },
            groupTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
            groupTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },

            teeBtn: {
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: goldBorder,
                backgroundColor: isDark ? "rgba(214,171,84,0.12)" : "rgba(214,171,84,0.14)",
            },
            teeBtnText: { color: theme.text, fontSize: 13, fontWeight: "900" },

            playerLine: { marginTop: 10, color: theme.text, fontSize: 13, fontWeight: "800", opacity: 0.82 },

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

            // modal
            modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 18 },
            modalCard: { borderRadius: 18, padding: 16, backgroundColor: theme.bg, borderWidth: 1, borderColor: softBorder },
            modalTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
            modalSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },
            input: {
                marginTop: 12,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: theme.card2,
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: theme.text,
                fontSize: 15,
                fontWeight: "800",
            },
            modalBtnRow: { marginTop: 12, flexDirection: "row", gap: 10 },
            modalBtn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: softBorder, backgroundColor: softBg },
            modalBtnPrimary: { backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)", borderColor: "transparent" },
            modalBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },
            modalBtnTextPrimary: { color: "#fff", fontSize: 14, fontWeight: "900" },
        });
    }, [theme, isDark, footerPad]);

    if (!tournamentId) {
        return (
            <View style={styles.screen}>
                <ScreenHeader navigation={navigation} title="Groups" subtitle="Missing tournament." />
                <View style={styles.content}>
                    <View style={styles.hero}>
                        <Text style={styles.heroTitle}>Missing tournament</Text>
                        <Text style={styles.heroSub}>No tournamentId was provided.</Text>
                    </View>
                </View>
            </View>
        );
    }

    const tournamentName = safeStr(t?.name || "Tournament");

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Groups" subtitle="Set tee times for each group." />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>{tournamentName}</Text>
                    <Text style={styles.heroSub}>
                        Groups are auto-built from your roster. Set tee times here so the Player Briefing and live flow always show the right group info.
                    </Text>

                    {roundsTotal > 1 ? (
                        <View style={styles.roundsRow}>
                            {Array.from({ length: roundsTotal }).map((_, i) => {
                                const r = i + 1;
                                const active = r === roundNum;
                                return (
                                    <Pressable
                                        key={`r-${r}`}
                                        onPress={() => setRoundNum(r)}
                                        style={({ pressed }) => [styles.roundChip, active && styles.roundChipActive, pressed && styles.pressed]}
                                    >
                                        <Text style={styles.roundChipText}>Round {r}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    ) : null}
                </View>

                <Text style={styles.sectionTitle}>Groups</Text>

                {groups.length ? (
                    groups.map((g) => {
                        const teeTime = safeStr(teeTimeByGroupKey?.[g.key] || "");
                        return (
                            <View key={g.key} style={styles.groupCard}>
                                <View style={styles.groupTopRow}>
                                    <Text style={styles.groupTitle}>Group {g.orderIndex}</Text>
                                    <Pressable onPress={() => openTeeTimeModal(g.key)} style={({ pressed }) => [styles.teeBtn, pressed && styles.pressed]}>
                                        <Text style={styles.teeBtnText}>{teeTime ? teeTime : "Set tee time"}</Text>
                                    </Pressable>
                                </View>

                                {g.players.map((p) => (
                                    <Text key={p._uid} style={styles.playerLine}>
                                        {getName(p)}
                                    </Text>
                                ))}
                            </View>
                        );
                    })
                ) : (
                    <View style={styles.groupCard}>
                        <Text style={styles.heroSub}>No roster found yet. Go back and add players.</Text>
                    </View>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={async () => {
                        const ok = await writeGroupsToFirestore({ silent: true });
                        if (ok) navigation.navigate(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId });
                    }}
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                >
                    <Text style={styles.primaryText}>Continue to formats</Text>
                </Pressable>
            </View>

            <Modal visible={timeModalOpen} transparent animationType="fade" onRequestClose={closeTeeTimeModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Tee time</Text>
                        <Text style={styles.modalSub}>Example: 9:10 AM (we’ll formalize time picking later)</Text>

                        <TextInput
                            value={timeInput}
                            onChangeText={setTimeInput}
                            placeholder="e.g., 9:10 AM"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.45)" : "rgba(10,15,26,0.45)"}
                            style={styles.input}
                            autoCapitalize="characters"
                        />

                        <View style={styles.modalBtnRow}>
                            <Pressable onPress={closeTeeTimeModal} style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </Pressable>

                            <Pressable onPress={saveTeeTime} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}>
                                <Text style={styles.modalBtnTextPrimary}>Save</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
