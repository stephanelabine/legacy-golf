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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, collection, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import { db } from "../firebase/firebase";
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

    const title = `HOLE ${holeNumber} • SCORES`;

    const [players, setPlayers] = useState(() => {
        const p = params?.players;
        return Array.isArray(p) ? p : [];
    });

    const [inputs, setInputs] = useState({}); // { [playerId]: { strokes: "", putts: "" } }
    const [saving, setSaving] = useState(false);

    // If players weren't passed, load roster from Firestore.
    // Your DB uses tournaments/{tournamentId}/members (not /roster).
    useEffect(() => {
        if (!tournamentId) return;
        if (Array.isArray(params?.players) && params.players.length) return;

        const membersRef = collection(db, "tournaments", String(tournamentId), "members");
        const rosterRef = collection(db, "tournaments", String(tournamentId), "roster"); // optional legacy

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

                    // Fallback: if members is empty for some reason, try legacy /roster.
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

    function setPlayerField(pid, field, value) {
        setInputs((prev) => {
            const next = { ...(prev || {}) };
            const cur = next[pid] || { strokes: "", putts: "" };
            next[pid] = { ...cur, [field]: value };
            return next;
        });
    }

    const onPressSaveAll = useCallback(async () => {
        if (!tournamentId) {
            Alert.alert("Missing tournament", "No tournamentId was provided.");
            return;
        }

        if (!playerRows.length) {
            Alert.alert(
                "No players loaded",
                "No members found yet. Make sure tournaments/{tournamentId}/members contains player docs."
            );
            return;
        }

        setSaving(true);
        Keyboard.dismiss();

        try {
            const writes = [];

            for (const p of playerRows) {
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

                // one doc per player, holes map inside.
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

            Alert.alert("Saved", "Scores saved to Firebase.");
            navigation.goBack();
        } catch {
            Alert.alert("Save failed", "Could not save scores. Please try again.");
        } finally {
            setSaving(false);
        }
    }, [tournamentId, roundNumber, holeNumber, inputs, playerRows, navigation]);

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
                <FlatList
                    data={playerRows}
                    keyExtractor={(item) => String(item._pid)}
                    contentContainerStyle={{ paddingBottom: Math.max(16, (insets?.bottom || 0) + 16) }}
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
                    onPress={onPressSaveAll}
                    disabled={saving}
                    style={({ pressed }) => [
                        styles.saveBtn,
                        pressed && styles.pressed,
                        saving && { opacity: 0.7 },
                    ]}
                >
                    <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Scores"}</Text>
                </Pressable>

                <Text style={styles.microNote}>
                    Firebase path: tournaments/{`{tournamentId}`}/rounds/r{`{roundNumber}`}/scores/{`{playerId}`}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: BG },
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },

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
    microNote: {
        marginTop: 8,
        color: "rgba(255,255,255,0.55)",
        fontWeight: "800",
        fontSize: 10,
        letterSpacing: 0.2,
    },

    pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
