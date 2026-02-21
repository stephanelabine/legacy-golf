// src/screens/GameFormatDetailsScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/*
  Regular Game Format Details
  - Single source of truth: users/{uid}/rounds/{roundId}
  - Stores:
      formatsSelected: [{key,name}]
      formatConfig: { [formatKey]: { holes: number[], teams?: {...} } }
*/

const HOLE_COLS = 6;

const HOLE_FORMAT_KEYS = new Set(["kp", "secondshotkp", "longdrive"]);
// Regular-games version supports a few common aliases so formats from selection screen still work.
function isHoleBasedKey(key) {
    const k = String(key || "").toLowerCase().trim();
    if (!k) return false;
    if (HOLE_FORMAT_KEYS.has(k)) return true;
    if (k === "2nd_kp" || k === "second_shot_kp" || k === "secondshotkp") return true;
    if (k === "ld" || k === "long_drive" || k === "longdrive") return true;
    if (k === "kp" || k.includes("closest") || k.includes("kp")) return true;
    if (k.includes("longdrive") || k.includes("long drive")) return true;
    return false;
}

const TEAM_KEY = "team_vs_team";
function isTeamVsTeamKey(key) {
    const k = String(key || "").toLowerCase().trim();
    if (!k) return false;
    return k === TEAM_KEY || k === "teamvsteam" || k.includes("team_vs") || k.includes("team vs team");
}

function clampInt(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    const x = Math.round(v);
    return Math.max(min, Math.min(max, x));
}

function uniqInts(arr) {
    const s = new Set();
    (arr || []).forEach((x) => {
        const v = Number(x);
        if (Number.isFinite(v)) s.add(Math.round(v));
    });
    return Array.from(s).sort((a, b) => a - b);
}

function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function prettyFormatName(keyOrName) {
    const k = String(keyOrName || "").trim();
    const n = k.toLowerCase();

    if (!k) return "Unknown";

    // Exact keys we care about
    if (n === "kp") return "KP";
    if (n === "longdrive" || n === "long_drive" || n === "ld") return "Long Drive";
    if (n === "secondshotkp" || n === "second_shot_kp" || n === "2nd_kp") return "Second Shot KP";
    if (n === "deuce_pot") return "Deuce Pot";
    if (n === "putting_contest") return "Putting Contest";
    if (n === "team_vs_team" || n === "teamvsteam") return "Team vs Team";
    if (n === "skins") return "Skins";
    if (n === "nassau") return "Nassau";
    if (n === "stableford") return "Stableford";
    if (n === "birdie_buckets") return "Birdie Buckets";
    if (n === "snake") return "Snake";

    // Fallback: Title Case + preserve acronyms like KP if user typed them
    const cleaned = k.replace(/[_-]+/g, " ").trim();
    return cleaned
        .split(/\s+/)
        .map((w) => {
            const lw = w.toLowerCase();
            if (lw === "kp") return "KP";
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
}

function normalizeFormats(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .filter(Boolean)
        .map((f) => {
            if (typeof f === "string") {
                const key = String(f || "").trim();
                return { key, name: prettyFormatName(key) };
            }

            const key = String(f?.key || f?.id || f?.type || "").trim();
            const rawName = String(f?.name || f?.label || f?.title || "").trim();
            const name = rawName ? prettyFormatName(rawName) : prettyFormatName(key);

            return {
                key,
                name,
                blurb: f?.blurb || "",
            };
        })
        .filter((f) => String(f.key || "").trim());
}

function getKey(f) {
    return String(f?.key || f?.id || "").trim();
}

function safeObj(v) {
    return v && typeof v === "object" ? v : {};
}

export default function GameFormatDetailsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const roundId = route?.params?.roundId || null;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [roundDoc, setRoundDoc] = useState(null);
    const [formats, setFormats] = useState(() => normalizeFormats(route?.params?.formatsSelected));

    // Working config buffer (persisted into roundDoc.formatConfig)
    const [configByKey, setConfigByKey] = useState({});

    // Team names (mirrors tournament UX, but stored inside formatConfig[TEAM_KEY].teams)
    const [teamAName, setTeamAName] = useState("Hackers");
    const [teamBName, setTeamBName] = useState("Slackers");

    const unsubRef = useRef(null);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const premiumGold = isDark ? "rgba(196, 160, 98, 0.88)" : "rgba(176, 136, 78, 0.90)";
        const premiumGoldGlow = isDark ? "rgba(196, 160, 98, 0.10)" : "rgba(176, 136, 78, 0.10)";

        const greenSectionBorder = isDark ? "rgba(90, 235, 165, 0.55)" : "rgba(42, 200, 125, 0.55)";
        const greenSectionBg = isDark ? "rgba(15, 122, 74, 0.10)" : "rgba(15, 122, 74, 0.08)";

        const greenOnBorder = isDark ? "rgba(90, 235, 165, 0.92)" : "rgba(42, 200, 125, 0.92)";
        const greenOnBg = isDark ? "rgba(90, 235, 165, 0.24)" : "rgba(42, 200, 125, 0.18)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 210 },

            hero: {
                borderRadius: 22,
                padding: 18,
                borderWidth: 1,
                borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)",
                backgroundColor: softBg,
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

            pillRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
            pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: softBg, borderWidth: 1, borderColor: softBorder },
            pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },

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
                borderRadius: 20,
                padding: 14,
                borderWidth: 3,
                borderColor: premiumGold,
                backgroundColor: theme.card2,
                marginBottom: 14,
                shadowColor: premiumGold,
                shadowOpacity: isDark ? 0.22 : 0.14,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 8 },
                elevation: 4,
            },
            cardInnerGlow: {
                borderRadius: 16,
                padding: 10,
                backgroundColor: premiumGoldGlow,
            },

            cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
            cardTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
            cardSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

            groupBox: {
                marginTop: 12,
                borderRadius: 16,
                padding: 10,
                borderWidth: 2,
                borderColor: greenSectionBorder,
                backgroundColor: greenSectionBg,
            },

            holesWrap: { marginTop: 10 },
            holeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
            holeChip: {
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: "transparent",
            },
            holeChipOn: { borderColor: greenOnBorder, backgroundColor: greenOnBg },
            holeText: { color: theme.text, fontSize: 13, fontWeight: "900" },
            holeSpacer: { width: 44, height: 44 },

            inlineRow: { marginTop: 12, flexDirection: "row", gap: 10 },
            input: {
                flex: 1,
                height: 52,
                borderRadius: 16,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.card2,
                color: theme.text,
                fontSize: 16,
                fontWeight: "900",
            },

            note: {
                marginTop: 12,
                borderRadius: 16,
                padding: 12,
                borderWidth: 2,
                borderColor: greenSectionBorder,
                backgroundColor: greenSectionBg,
            },
            noteText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 18 },

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

            empty: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
            emptySub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 18 },
        });
    }, [theme, isDark, footerPad]);

    const holeCount = useMemo(() => {
        const n =
            Number(roundDoc?.holeCount) ||
            Number(roundDoc?.course?.holeCount) ||
            Number(roundDoc?.courseMeta?.holeCount) ||
            18;
        return Number.isFinite(n) && n >= 9 && n <= 36 ? Math.round(n) : 18;
    }, [roundDoc]);

    const holeBased = useMemo(() => (formats || []).filter((f) => isHoleBasedKey(getKey(f))), [formats]);
    const teamFormats = useMemo(() => (formats || []).filter((f) => isTeamVsTeamKey(getKey(f))), [formats]);
    const otherFormats = useMemo(
        () =>
            (formats || []).filter((f) => {
                const k = getKey(f);
                return k && !isHoleBasedKey(k) && !isTeamVsTeamKey(k);
            }),
        [formats]
    );

    function roundRef(uid, rid) {
        return doc(db, "users", uid, "rounds", String(rid));
    }

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

        const ref = roundRef(uid, roundId);

        if (unsubRef.current) {
            try {
                unsubRef.current();
            } catch (e) { }
        }

        unsubRef.current = onSnapshot(
            ref,
            (snap) => {
                const data = snap.exists() ? snap.data() : null;
                setRoundDoc(data);

                const fsFormats = normalizeFormats(data?.formatsSelected);
                const fromNav = normalizeFormats(route?.params?.formatsSelected);
                const merged = fsFormats.length ? fsFormats : fromNav;

                setFormats(merged);

                const fsCfg = safeObj(data?.formatConfig);
                setConfigByKey(fsCfg);

                // hydrate team names if present
                const tcfg = safeObj(fsCfg?.[TEAM_KEY]);
                const teamA = String(tcfg?.teams?.teamA?.name || "").trim();
                const teamB = String(tcfg?.teams?.teamB?.name || "").trim();
                setTeamAName(teamA || "Hackers");
                setTeamBName(teamB || "Slackers");

                setLoading(false);
            },
            (err) => {
                setLoading(false);
                Alert.alert("Round error", err?.message || "Could not load round.");
            }
        );

        return () => {
            if (unsubRef.current) {
                try {
                    unsubRef.current();
                } catch (e) { }
                unsubRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roundId, navigation]);

    function getHoles(key) {
        const cfg = configByKey?.[key] && typeof configByKey[key] === "object" ? configByKey[key] : {};
        return uniqInts(cfg?.holes || []);
    }

    function toggleHole(formatKey, holeNum) {
        if (saving) return;

        const hn = clampInt(holeNum, 1, holeCount);

        setConfigByKey((prev) => {
            const base = prev && typeof prev === "object" ? prev : {};
            const existingCfg = base[formatKey] && typeof base[formatKey] === "object" ? base[formatKey] : {};
            const current = getHoles(formatKey);
            const has = current.includes(hn);
            const nextArr = has ? current.filter((x) => x !== hn) : uniqInts([...current, hn]);

            return { ...base, [formatKey]: { ...existingCfg, holes: nextArr } };
        });
    }

    function renderHolePickerCard(f) {
        const key = getKey(f);
        if (!key) return null;

        const selected = getHoles(key);

        const holes = Array.from({ length: holeCount }, (_, i) => i + 1);
        const rows = chunk(holes, HOLE_COLS);

        return (
            <View key={key} style={styles.card}>
                <View style={styles.cardInnerGlow}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
                    </View>

                    <Text style={styles.cardSub}>Choose the official holes for this format (single round).</Text>

                    <Text style={[styles.cardSub, { marginTop: 10 }]}>Selected: {selected.length ? selected.join(", ") : "none"}</Text>

                    <View style={styles.groupBox}>
                        <View style={styles.holesWrap}>
                            {rows.map((row, idx) => (
                                <View key={`${key}_row_${idx}`} style={styles.holeRow}>
                                    {row.map((hn) => {
                                        const on = selected.includes(hn);
                                        return (
                                            <Pressable
                                                key={`${key}_${hn}`}
                                                onPress={() => toggleHole(key, hn)}
                                                disabled={saving}
                                                style={({ pressed }) => [styles.holeChip, on && styles.holeChipOn, pressed && !saving && styles.pressed, saving && { opacity: 0.7 }]}
                                            >
                                                <Text style={styles.holeText}>{hn}</Text>
                                            </Pressable>
                                        );
                                    })}
                                    {row.length < HOLE_COLS
                                        ? Array.from({ length: HOLE_COLS - row.length }, (_, i) => <View key={`${key}_sp_${idx}_${i}`} style={styles.holeSpacer} />)
                                        : null}
                                </View>
                            ))}
                        </View>
                    </View>

                    <View style={styles.note}>
                        <Text style={styles.noteText}>Note: Regular games store hole selections on this round only (no multi-round r1/r2 selection).</Text>
                    </View>
                </View>
            </View>
        );
    }

    function renderInfoCard(f) {
        const key = getKey(f);
        if (!key) return null;
        if (isHoleBasedKey(key) || isTeamVsTeamKey(key)) return null;

        const sub = String(f?.blurb || "").trim();

        return (
            <View key={key} style={styles.card}>
                <View style={styles.cardInnerGlow}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{String(f?.name || key)}</Text>
                    </View>

                    {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}

                    <View style={styles.note}>
                        <Text style={styles.noteText}>No extra setup needed here for this format right now.</Text>
                    </View>
                </View>
            </View>
        );
    }

    function renderTeamCard(f) {
        const key = getKey(f);
        if (!isTeamVsTeamKey(key)) return null;

        return (
            <View key={key} style={styles.card}>
                <View style={styles.cardInnerGlow}>
                    <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{String(f?.name || "Team vs Team")}</Text>
                    </View>

                    <Text style={styles.cardSub}>Set team names now. Member assignment comes later.</Text>

                    <View style={styles.groupBox}>
                        <View style={styles.inlineRow}>
                            <TextInput
                                value={teamAName}
                                onChangeText={(s) => setTeamAName(String(s || "").slice(0, 24))}
                                editable={!saving}
                                placeholder="Team A"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                                style={[styles.input, saving && { opacity: 0.7 }]}
                                returnKeyType="done"
                            />
                            <TextInput
                                value={teamBName}
                                onChangeText={(s) => setTeamBName(String(s || "").slice(0, 24))}
                                editable={!saving}
                                placeholder="Team B"
                                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                                style={[styles.input, saving && { opacity: 0.7 }]}
                                returnKeyType="done"
                            />
                        </View>
                    </View>

                    <View style={styles.note}>
                        <Text style={styles.noteText}>Scoring foundation will be added later. For now, this stores team names only.</Text>
                    </View>
                </View>
            </View>
        );
    }

    function validateRequired() {
        if (loading) return { ok: false, reason: "loading" };
        if (!roundId) return { ok: false, reason: "missingRound" };
        if (!formats.length) return { ok: false, reason: "noFormats" };

        // hole formats must have at least one hole
        for (const f of holeBased) {
            const k = getKey(f);
            const list = getHoles(k);
            if (!list.length) return { ok: false, reason: `holes:${k}` };
        }

        // team vs team must have names
        const hasTeam = teamFormats.length > 0;
        if (hasTeam) {
            const a = String(teamAName || "").trim();
            const b = String(teamBName || "").trim();
            if (!a || !b) return { ok: false, reason: "teamNames" };
        }

        return { ok: true, reason: "ok" };
    }

    const canSave = useMemo(() => {
        if (saving) return false;
        const v = validateRequired();
        return v.ok;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, loading, roundId, formats?.length, configByKey, teamAName, teamBName]);

    async function saveDetails() {
        if (!roundId) return;

        const uid = auth?.currentUser?.uid || null;
        if (!uid) {
            Alert.alert("Not signed in", "Please sign in again.");
            return;
        }

        const v = validateRequired();
        if (!v.ok) {
            if (String(v.reason || "").startsWith("holes:")) {
                const key = String(v.reason || "").split(":")[1] || "";
                Alert.alert("Holes required", `Select at least one hole for ${key}.`);
                return;
            }
            if (v.reason === "teamNames") {
                Alert.alert("Team names required", "Please enter both team names.");
                return;
            }
            if (v.reason === "noFormats") {
                Alert.alert("No formats", "Go back and select at least one format.");
                return;
            }
            if (v.reason === "loading") return;
            return;
        }

        setSaving(true);
        try {
            // normalize hole selections
            const nextConfig = safeObj(configByKey);

            // ensure team config (if present) is written in a structured way
            if (teamFormats.length) {
                const safeA = String(teamAName || "Hackers").trim() || "Hackers";
                const safeB = String(teamBName || "Slackers").trim() || "Slackers";

                const existing = safeObj(nextConfig?.[TEAM_KEY]);
                nextConfig[TEAM_KEY] = {
                    ...existing,
                    teams: {
                        teamA: { name: safeA, memberUids: Array.isArray(existing?.teams?.teamA?.memberUids) ? existing.teams.teamA.memberUids : [] },
                        teamB: { name: safeB, memberUids: Array.isArray(existing?.teams?.teamB?.memberUids) ? existing.teams.teamB.memberUids : [] },
                    },
                };
            }

            // ensure hole arrays are ints within range
            for (const f of holeBased) {
                const k = getKey(f);
                const existing = safeObj(nextConfig?.[k]);
                const list = uniqInts(existing?.holes || []).filter((n) => n >= 1 && n <= holeCount);
                nextConfig[k] = { ...existing, holes: list };
            }

            // persist back onto the same round doc (single source of truth)
            await setDoc(
                roundRef(uid, roundId),
                {
                    formatsSelected: formats.map((f) => ({ key: getKey(f), name: prettyFormatName(String(f?.name || getKey(f))) })),
                    formatConfig: nextConfig, formatDetailsReady: true,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            Alert.alert("Saved", "Format details saved.");
            navigation.navigate(ROUTES.GAME_FORMAT_POOLS, { roundId });

        } catch (e) {
            Alert.alert("Save failed", e?.message || "Could not save format details.");
        } finally {
            setSaving(false);
        }
    }

    const kickerLabel = "Regular Game";
    const heroSub = "Hole-based games need official hole selection (single round). Team vs Team stores team names now. Everything saves to this round.";

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Format Details" subtitle="Set holes + basic rules (regular game)." />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.hero}>
                    <Text style={styles.heroKicker}>{kickerLabel}</Text>
                    <Text style={styles.heroTitle}>Details & Rules</Text>
                    <Text style={styles.heroSub}>{heroSub}</Text>

                    <View style={styles.pillRow}>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>formats: {formats.length}</Text>
                        </View>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>holes: {holeCount}</Text>
                        </View>
                    </View>
                </View>

                {!formats.length ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No formats selected</Text>
                        <Text style={styles.emptySub}>Go back and select at least one regular-game format.</Text>
                    </View>
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>Hole-based formats</Text>
                        {holeBased.length ? holeBased.map(renderHolePickerCard) : <View style={styles.empty}><Text style={styles.emptyTitle}>None</Text><Text style={styles.emptySub}>No hole-based formats selected.</Text></View>}

                        <Text style={styles.sectionTitle}>Other formats</Text>
                        {otherFormats.length ? otherFormats.map(renderInfoCard) : <View style={styles.empty}><Text style={styles.emptyTitle}>None</Text><Text style={styles.emptySub}>No other formats selected.</Text></View>}

                        <Text style={styles.sectionTitle}>Team setup</Text>
                        {teamFormats.length ? teamFormats.map(renderTeamCard) : <View style={styles.empty}><Text style={styles.emptyTitle}>None</Text><Text style={styles.emptySub}>No team formats selected.</Text></View>}
                    </>
                )}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={saveDetails}
                    disabled={!canSave}
                    style={({ pressed }) => [
                        styles.primaryBtn,
                        pressed && canSave && styles.pressed,
                        (!canSave || saving) && { opacity: 0.45 },
                    ]}
                >
                    <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Format Details"}</Text>

                </Pressable>

                {!canSave && !loading && formats.length ? (
                    <View style={{ marginTop: 10 }}>
                        <Text style={[styles.pillText, { opacity: 0.7 }]}>Complete required selections above to unlock Save.</Text>
                    </View>
                ) : null}
            </View>
        </View>
    );
}
