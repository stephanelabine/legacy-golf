// src/screens/TournamentScoreEntryScreen.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
    SafeAreaView,
    View,
    Text,
    StyleSheet,
    Pressable,
    TextInput,
    FlatList,
    Alert,
    Keyboard,
    Modal,
    ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, collection, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

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

function toInt(v) {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
}

function safePlayerId(p, fallback) {
    return String(p?.uid || p?.id || p?._id || p?.playerId || fallback || "");
}

function safePlayerName(p) {
    return String(p?.name || p?.displayName || p?.fullName || p?.label || "Player");
}

export default function TournamentScoreEntryScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const params = route?.params || {};

    const tournamentId = params?.tournamentId ? String(params.tournamentId) : "";
    const roundNumber = Number(params?.roundNumber || 1);
    const holeNumber = Number(params?.holeNumber || 1);
    const totalHoles = Number(params?.totalHoles || 18);

    const meUid = String(auth?.currentUser?.uid || "");

    const title = `HOLE ${holeNumber} • ENTER SCORES`;

    const [players, setPlayers] = useState(() => {
        const p = params?.players;
        return Array.isArray(p) ? p : [];
    });

    const [inputs, setInputs] = useState({}); // { [playerId]: { strokes: "", putts: "" } }
    const [saving, setSaving] = useState(false);

    const [addModalOpen, setAddModalOpen] = useState(false);
    const [extraIds, setExtraIds] = useState(() => new Set()); // additional players for this hole

    // If players weren't passed, load from Firestore:
    // Prefer /members, fallback to /roster.
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

                    // fallback to /roster
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

    const playerRows = useMemo(() => {
        const list = Array.isArray(players) ? players : [];
        return list
            .map((p, idx) => {
                const pid = safePlayerId(p, String(idx));
                return { ...p, _pid: pid, _name: safePlayerName(p) };
            })
            .filter((p) => !!p._pid);
    }, [players]);

    // PRIMARY GROUP: only show me + my group (passed in)
    const baseGroupIds = useMemo(() => {
        const fromParams =
            (Array.isArray(params?.groupPlayerIds) && params.groupPlayerIds.map(String)) ||
            (Array.isArray(params?.groupIds) && params.groupIds.map(String)) ||
            null;

        const set = new Set();

        if (fromParams && fromParams.length) {
            fromParams.forEach((id) => set.add(String(id)));
        } else if (meUid) {
            set.add(String(meUid));
        }

        return set;
    }, [params?.groupPlayerIds, params?.groupIds, meUid]);

    const displayedIds = useMemo(() => {
        const set = new Set();
        baseGroupIds.forEach((id) => set.add(id));
        extraIds.forEach((id) => set.add(id));
        return set;
    }, [baseGroupIds, extraIds]);

    const displayedRows = useMemo(() => {
        if (!playerRows.length) return [];
        return playerRows.filter((p) => displayedIds.has(String(p._pid)));
    }, [playerRows, displayedIds]);

    const addableRows = useMemo(() => {
        if (!playerRows.length) return [];
        return playerRows.filter((p) => !displayedIds.has(String(p._pid)));
    }, [playerRows, displayedIds]);

    function setPlayerField(pid, field, value) {
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[pid] || { strokes: "", putts: "" };
            next[pid] = { ...cur, [field]: value };
            return next;
        });
    }

    function toggleExtra(pid) {
        const id = String(pid);
        setExtraIds((prev) => {
            const next = new Set(prev || []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    const onPressSaveNext = useCallback(async () => {
        if (!tournamentId) {
            Alert.alert("Missing tournament", "No tournamentId was provided.");
            return;
        }

        if (!displayedRows.length) {
            Alert.alert("No players loaded", "No members found yet. Make sure tournaments/{tournamentId}/members contains player docs.");
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

                // Require strokes; putts optional.
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
                    playerId: String(pid),
                    playerName: p._name,
                    updatedAt: serverTimestamp(),
                    [`holes.${String(holeNumber)}.strokes`]: strokes,
                    [`holes.${String(holeNumber)}.putts`]: putts,
                };

                writes.push(setDoc(scoreDocRef, payload, { merge: true }));
            }

            if (!writes.length) {
                Alert.alert("Nothing to save", "Enter at least one player’s strokes.");
                return;
            }

            await Promise.all(writes);

            // next hole
            const nextHole = holeNumber + 1;
            if (nextHole > totalHoles) {
                Alert.alert("Saved", "Scores saved.");
                navigation.goBack();
                return;
            }

            navigation.replace(ROUTES.TOURNAMENT_SCORE_ENTRY, {
                ...params,
                tournamentId,
                roundNumber,
                holeNumber: nextHole,
                totalHoles,
                // keep this list stable
                players: Array.isArray(params?.players) && params.players.length ? params.players : players,
                groupPlayerIds: Array.isArray(params?.groupPlayerIds) ? params.groupPlayerIds : Array.from(baseGroupIds),
            });
        } catch {
            Alert.alert("Save failed", "Could not save scores. Please try again.");
        } finally {
            setSaving(false);
        }
    }, [
        tournamentId,
        roundNumber,
        holeNumber,
        totalHoles,
        inputs,
        displayedRows,
        navigation,
        params,
        players,
        baseGroupIds,
    ]);

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenHeader
                navigation={navigation}
                title={title}
                subtitle={""}
                safeTop={false}
                rightLabel={null}
                onRightPress={null}
            />

            <View style={styles.body}>
                <View style={styles.topBar}>
                    <View style={styles.pill}>
                        <Text style={styles.pillText}>Round {roundNumber}</Text>
                    </View>

                    <Pressable
                        onPress={() => setAddModalOpen(true)}
                        style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                    >
                        <Text style={styles.addBtnText}>Add Players</Text>
                    </Pressable>
                </View>

                <FlatList
                    data={displayedRows}
                    keyExtractor={(item) => String(item._pid)}
                    contentContainerStyle={{ paddingBottom: Math.max(16, (insets?.bottom || 0) + 120) }}
                    renderItem={({ item }) => {
                        const pid = String(item._pid);
                        const val = inputs?.[pid] || {};
                        return (
                            <View style={styles.playerCard}>
                                <Text style={styles.playerName}>{item._name}</Text>

                                <View style={styles.inputRow}>
                                    <View style={styles.fieldWrap}>
                                        <Text style={styles.fieldLabel}>Strokes</Text>
                                        <TextInput
                                            value={String(val.strokes ?? "")}
                                            onChangeText={(t) => setPlayerField(pid, "strokes", t)}
                                            keyboardType="number-pad"
                                            placeholder="—"
                                            placeholderTextColor="rgba(255,255,255,0.45)"
                                            style={styles.fieldInput}
                                            maxLength={2}
                                        />
                                    </View>

                                    <View style={styles.fieldWrap}>
                                        <Text style={styles.fieldLabel}>Putts</Text>
                                        <TextInput
                                            value={String(val.putts ?? "")}
                                            onChangeText={(t) => setPlayerField(pid, "putts", t)}
                                            keyboardType="number-pad"
                                            placeholder="—"
                                            placeholderTextColor="rgba(255,255,255,0.45)"
                                            style={styles.fieldInput}
                                            maxLength={2}
                                        />
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyCard}>
                            <Text style={styles.emptyTitle}>Loading players…</Text>
                            <Text style={styles.emptySub}>Waiting for tournament members from Firebase.</Text>
                        </View>
                    }
                />
            </View>

            <View style={[styles.footer, { paddingBottom: Math.max(10, (insets?.bottom || 0) + 8) }]}>
                <Pressable
                    onPress={onPressSaveNext}
                    disabled={saving}
                    style={({ pressed }) => [
                        styles.saveBtn,
                        pressed && styles.pressed,
                        saving && { opacity: 0.7 },
                    ]}
                >
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Score • Next Hole"}</Text>
                </Pressable>

                <Text style={styles.microNote}>
                    tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/scores/{`{playerId}`}
                </Text>
            </View>

            <Modal visible={addModalOpen} animationType="slide" transparent onRequestClose={() => setAddModalOpen(false)}>
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Add Players</Text>
                            <Pressable onPress={() => setAddModalOpen(false)} style={({ pressed }) => [styles.modalClose, pressed && styles.pressed]}>
                                <Text style={styles.modalCloseText}>Done</Text>
                            </Pressable>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
                            {addableRows.length ? (
                                addableRows.map((p) => {
                                    const pid = String(p._pid);
                                    return (
                                        <Pressable
                                            key={pid}
                                            onPress={() => toggleExtra(pid)}
                                            style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}
                                        >
                                            <View style={styles.pickDotOuter}>
                                                <View style={[styles.pickDotInner, extraIds.has(pid) && { opacity: 1 }]} />
                                            </View>
                                            <Text style={styles.pickName}>{p._name}</Text>
                                        </Pressable>
                                    );
                                })
                            ) : (
                                <View style={styles.modalEmpty}>
                                    <Text style={styles.modalEmptyText}>No more players to add.</Text>
                                </View>
                            )}
                        </ScrollView>
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
    addBtn: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.10)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        alignItems: "center",
        justifyContent: "center",
    },
    addBtnText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    playerCard: {
        backgroundColor: CARD,
        borderRadius: 22,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    playerName: { color: WHITE, fontWeight: "900", fontSize: 16, letterSpacing: 0.2 },

    inputRow: { flexDirection: "row", gap: 12, marginTop: 12 },
    fieldWrap: {
        flex: 1,
        backgroundColor: INNER,
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
    },
    fieldLabel: { color: MUTED, fontWeight: "900", fontSize: 11, letterSpacing: 0.6 },
    fieldInput: {
        marginTop: 8,
        height: 46,
        borderRadius: 16,
        backgroundColor: "rgba(0,0,0,0.20)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        color: WHITE,
        fontSize: 18,
        fontWeight: "900",
        textAlign: "center",
    },

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
    microNote: { marginTop: 8, color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10, letterSpacing: 0.2 },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.60)",
        paddingHorizontal: 14,
        justifyContent: "flex-end",
    },
    modalCard: {
        backgroundColor: "#0F1B33",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        maxHeight: "78%",
        paddingBottom: 8,
    },
    modalHeader: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.08)",
    },
    modalTitle: { color: WHITE, fontWeight: "900", fontSize: 15, letterSpacing: 0.2 },
    modalClose: {
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        backgroundColor: "rgba(46,204,113,0.16)",
        borderWidth: 1,
        borderColor: "rgba(46,204,113,0.30)",
        alignItems: "center",
        justifyContent: "center",
    },
    modalCloseText: { color: WHITE, fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

    pickRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.06)",
    },
    pickDotOuter: {
        width: 22,
        height: 22,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.25)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    pickDotInner: {
        width: 12,
        height: 12,
        borderRadius: 999,
        backgroundColor: GREEN,
        opacity: 0,
    },
    pickName: { color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 13, letterSpacing: 0.2 },

    modalEmpty: { paddingHorizontal: 14, paddingVertical: 18 },
    modalEmptyText: { color: "rgba(255,255,255,0.70)", fontWeight: "800", fontSize: 12 },
});
