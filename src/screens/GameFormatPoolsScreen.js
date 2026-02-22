// src/screens/GameFormatPoolsScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    Alert,
    Platform,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/*
  Regular Game Money Pools
  Single source of truth:
    users/{uid}/rounds/{roundId}

  Stores inputs only (no computed totals stored):
    formatPools: {
      kp: { amountPerHole, excludedIds: [] },
      longdrive: { amountPerHole, excludedIds: [] },
      secondshotkp: { amountPerHole, excludedIds: [] },
      skins: { amountPerSkin, excludedIds: [] },
      deuce_pot: { entryFee, excludedIds: [] },
      putting_contest: { entryFee, excludedIds: [] },
    }
*/

function money(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return "";
    const fixed = Math.round(v * 100) / 100;
    return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function parseFeeString(s) {
    const raw = String(s || "").trim();
    if (!raw) return null;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return NaN;
    return Math.round(v * 100) / 100;
}

function normKey(x) {
    return String(x || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// IMPORTANT: detect “second shot kp” before “kp” so it doesn’t get misclassified.
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

    // putting contest (support both puttingcontest + putting_contest)
    if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "putting_contest";

    if (s.includes("skins")) return "skins";

    // KP (last)
    if (s.includes("kp")) return "kp";

    return "unknown";
}

function getKey(f) {
    return String(f?.key || f?.id || "").trim();
}

function safeArr(v) {
    return Array.isArray(v) ? v : [];
}

function safeObj(v) {
    return v && typeof v === "object" ? v : {};
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

const FORMAT_META = {
    kp: {
        title: "KP",
        blurb: "Enter the cost per KP hole. Total is calculated from selected KP holes.",
        hint: "per hole",
    },
    longdrive: {
        title: "Long Drive",
        blurb: "Enter the cost per Long Drive hole. Total is calculated from selected Long Drive holes.",
        hint: "per hole",
    },
    secondshotkp: {
        title: "Second Shot KP",
        blurb: "Enter the cost per Second Shot KP hole. Total is calculated from selected holes.",
        hint: "per hole",
    },
    skins: {
        title: "Skins",
        blurb: "Enter the value per skin. The total depends on results and is calculated later.",
        hint: "per skin",
    },
    deuce_pot: {
        title: "Deuce Pot",
        blurb: "Enter the fee per player to join the Deuce Pot. Pool estimate uses fee x included players.",
        hint: "per player",
    },
    putting_contest: {
        title: "Putting Contest",
        blurb: "Enter the fee per player. Winner is lowest total putts for the round. Ties split the pot.",
        hint: "per player",
    },
    unknown: {
        title: "Format",
        blurb: "Money setup for this format will be added later.",
        hint: "",
    },
};

export default function GameFormatPoolsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const roundId = route?.params?.roundId || null;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [roundDoc, setRoundDoc] = useState(null);
    const [formats, setFormats] = useState([]);

    // local editable strings
    const [applyAll, setApplyAll] = useState("");

    // fee strings keyed by formatKey (as stored in formatsSelected)
    const [feeByKey, setFeeByKey] = useState({});

    // putting contest payout places keyed by formatKey (1 | 2 | 3)
    const [payoutPlacesByKey, setPayoutPlacesByKey] = useState({});

    // excluded ids by formatKey
    const [excludedByKey, setExcludedByKey] = useState({});

    // open/close inclusion editor per card
    const [openKey, setOpenKey] = useState(null);

    const dirtyRef = useRef(false);
    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        // bronzy gold (less yellow)
        const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
        const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

        const greenRing = isDark ? "rgba(15,122,74,0.62)" : "rgba(15,122,74,0.72)";
        const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

        const greenOnBorder = isDark ? "rgba(90, 235, 165, 0.92)" : "rgba(42, 200, 125, 0.92)";
        const greenOnBg = isDark ? "rgba(90, 235, 165, 0.18)" : "rgba(42, 200, 125, 0.14)";

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
            heroSub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.74,
                fontSize: 13,
                fontWeight: "700",
                lineHeight: 19,
            },

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

            premiumCard: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 2.5,
                borderColor: goldBorder,
                backgroundColor: theme.card2,
                marginBottom: 12,
            },

            rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
            name: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
            hint: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },

            sub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

            innerSection: {
                marginTop: 12,
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: greenRing,
                backgroundColor: greenBg,
            },

            feeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
            feeInput: {
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

            previewRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
            previewText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800" },

            applyBtn: {
                height: 52,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: greenOnBg,
                borderWidth: 1,
                borderColor: greenOnBorder,
                marginTop: 12,
            },
            applyBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },

            tinyBtn: {
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            tinyBtnText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.92 },

            playerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
            playerName: { color: theme.text, fontSize: 13, fontWeight: "900", opacity: 0.9 },
            toggle: {
                width: 62,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: "transparent",
                justifyContent: "center",
                paddingHorizontal: 4,
            },
            toggleKnob: {
                width: 26,
                height: 26,
                borderRadius: 999,
                backgroundColor: isDark ? "rgba(255,255,255,0.85)" : "rgba(10,15,26,0.85)",
            },
            toggleOn: { borderColor: greenOnBorder, backgroundColor: greenOnBg },
            knobOn: { alignSelf: "flex-end" },
            knobOff: { alignSelf: "flex-start" },

            divider: { height: 1, backgroundColor: softBorder },

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

            payoutPlacesRow: {
                marginTop: 12,
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.10)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
            },
            payoutPlacesLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12 },
            payoutPlacesPills: { flexDirection: "row", gap: 8 },
            payoutPill: {
                height: 32,
                minWidth: 36,
                paddingHorizontal: 12,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
            },
            payoutPillIdle: {
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.14)",
            },
            payoutPillActive: {
                backgroundColor: "rgba(242,201,76,0.18)",
                borderColor: "rgba(242,201,76,0.55)",
            },
            payoutPillTextIdle: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
            payoutPillTextActive: { color: "rgba(242,201,76,0.98)", fontWeight: "900", fontSize: 12 },

            empty: {
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: softBorder,
                backgroundColor: softBg,
            },
            emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
            emptySub: {
                marginTop: 8,
                color: theme.text,
                opacity: 0.72,
                fontSize: 12,
                fontWeight: "800",
                textAlign: "center",
                lineHeight: 18,
            },
        });
    }, [theme, isDark, footerPad]);

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

        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = snap.exists() ? snap.data() : null;
                setRoundDoc(data);

                const fsFormats = safeArr(data?.formatsSelected)
                    .map((x) => {
                        if (typeof x === "string") return { key: x, name: x };
                        return { key: x?.key || x?.id || "", name: x?.name || x?.label || x?.title || x?.key || x?.id || "Format" };
                    })
                    .filter((f) => String(f.key || "").trim());

                setFormats(fsFormats);

                const pools = safeObj(data?.formatPools);
                const nextFeeByKey = {};
                const nextPayoutPlacesByKey = {};
                const nextExcludedByKey = {};

                fsFormats.forEach((f) => {
                    const fk = getKey(f);
                    const type = detectFormatType(f);

                    const p = safeObj(pools?.[fk] || pools?.[type] || {});
                    const excl = safeArr(p?.excludedIds).map((z) => String(z));

                    nextExcludedByKey[fk] = excl;

                    // do not stomp user typing
                    if (!dirtyRef.current) {
                        if (type === "skins") {
                            const v = Number(p?.amountPerSkin);
                            nextFeeByKey[fk] = Number.isFinite(v) && v > 0 ? String(v) : "";
                        } else if (type === "deuce_pot" || type === "putting_contest") {
                            const v = Number(p?.entryFee);
                            nextFeeByKey[fk] = Number.isFinite(v) && v > 0 ? String(v) : "";

                            // putting contest payout places (default 1)
                            if (type === "putting_contest") {
                                const pp = Number(p?.payoutPlaces);
                                nextPayoutPlacesByKey[fk] = pp === 2 || pp === 3 ? pp : 1;
                            }
                        } else if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                            const v = Number(p?.amountPerHole);
                            nextFeeByKey[fk] = Number.isFinite(v) && v > 0 ? String(v) : "";
                        } else {
                            nextFeeByKey[fk] = "";
                        }
                    }
                });

                if (!dirtyRef.current) {
                    setFeeByKey(nextFeeByKey);
                    setPayoutPlacesByKey(nextPayoutPlacesByKey);
                }
                setExcludedByKey(nextExcludedByKey);

                setLoading(false);
            },
            (err) => {
                setLoading(false);
                Alert.alert("Round error", err?.message || "Could not load round.");
            }
        );

        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roundId, navigation]);

    const players = useMemo(() => safeArr(roundDoc?.players), [roundDoc]);

    function selectedHoleCountForFormat(f) {
        const fk = getKey(f);
        if (!fk) return 0;

        // Canonical (and aliases) used across regular games
        const cfgByKey =
            safeObj(roundDoc?.configByKey) ||
            safeObj(roundDoc?.formatConfigByKey) ||
            safeObj(roundDoc?.formatDetailsByKey) ||
            safeObj(roundDoc?.formatsConfigByKey) ||
            safeObj(roundDoc?.formatsConfig) ||
            safeObj(roundDoc?.formatConfig) ||
            {};

        const entry = safeObj(cfgByKey?.[fk] || cfgByKey?.[normKey(fk)] || {});

        // Support holes, holesSelected, holesByRound.r1
        const holesA = safeArr(entry?.holes);
        const holesB = safeArr(entry?.holesSelected);
        const hbr = safeObj(entry?.holesByRound);
        const holesR1 = safeArr(hbr?.r1);

        const list = holesR1.length ? holesR1 : holesB.length ? holesB : holesA;

        return list.filter((n) => {
            const v = Number(n);
            return Number.isFinite(v) && v >= 1 && v <= 18;
        }).length;
    }

    function includedCountForKey(fk) {
        const ids = players.map((p, idx) => playerId(p, idx)).filter(Boolean);
        const excluded = new Set(safeArr(excludedByKey?.[fk]).map((x) => String(x)));
        return ids.filter((id) => !excluded.has(String(id))).length;
    }

    function applyFeeToAll() {
        const v = parseFeeString(applyAll);
        if (Number.isNaN(v)) {
            Alert.alert("Amount", "Amount must be a number (example: 10 or 10.00).");
            return;
        }
        const s = v === null ? "" : String(v);

        dirtyRef.current = true;

        const next = { ...(feeByKey || {}) };
        (formats || []).forEach((f) => {
            const type = detectFormatType(f);
            if (type === "unknown") return;
            const fk = getKey(f);
            if (!fk) return;
            next[fk] = s;
        });

        setFeeByKey(next);
        Keyboard.dismiss();
    }

    function toggleExclude(fk, pid) {
        const id = String(pid);
        setExcludedByKey((prev) => {
            const base = safeObj(prev);
            const cur = safeArr(base?.[fk]).map((x) => String(x));
            const s = new Set(cur);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return { ...base, [fk]: Array.from(s) };
        });
    }

    function validateRequired() {
        if (loading) return { ok: false, reason: "loading" };
        if (!roundId) return { ok: false, reason: "missingRound" };
        if (!formats.length) return { ok: false, reason: "noFormats" };

        for (const f of formats) {
            const fk = getKey(f);
            const type = detectFormatType(f);
            const feeStr = String(feeByKey?.[fk] ?? "");
            const parsed = parseFeeString(feeStr);

            if (Number.isNaN(parsed)) return { ok: false, reason: `nan:${fk}` };

            if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                if (parsed === null || parsed <= 0) return { ok: false, reason: `need:${fk}` };
            }
            if (type === "skins") {
                if (parsed === null || parsed <= 0) return { ok: false, reason: `need:${fk}` };
            }
            if (type === "deuce_pot" || type === "putting_contest") {
                if (parsed === null || parsed <= 0) return { ok: false, reason: `need:${fk}` };
            }
        }

        return { ok: true, reason: "ok" };
    }

    const canSave = useMemo(() => {
        if (saving) return false;
        const v = validateRequired();
        return v.ok;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, loading, roundId, formats?.length, feeByKey, excludedByKey]);

    async function savePools() {
        if (!roundId) return;

        const uid = auth?.currentUser?.uid || null;
        if (!uid) {
            Alert.alert("Not signed in", "Please sign in again.");
            return;
        }

        const v = validateRequired();
        if (!v.ok) {
            if (String(v.reason || "").startsWith("nan:")) {
                Alert.alert("Amount", "One of the amounts is not a valid number.");
                return;
            }
            if (String(v.reason || "").startsWith("need:")) {
                Alert.alert("Amount required", "Enter an amount for each selected format to unlock Save.");
                return;
            }
            return;
        }

        setSaving(true);
        try {
            const nextPools = {};

            (formats || []).forEach((f) => {
                const fk = getKey(f);
                const type = detectFormatType(f);
                if (!fk) return;

                const feeStr = String(feeByKey?.[fk] ?? "");
                const parsed = parseFeeString(feeStr);
                const excludedIds = safeArr(excludedByKey?.[fk]).map((x) => String(x)).filter(Boolean);

                if (type === "skins") {
                    nextPools[fk] = { amountPerSkin: parsed === null ? null : parsed, excludedIds };
                    return;
                }
                if (type === "deuce_pot") {
                    nextPools[fk] = { entryFee: parsed === null ? null : parsed, excludedIds };
                    return;
                }

                if (type === "putting_contest") {
                    const ppRaw = Number(payoutPlacesByKey?.[fk]);
                    const payoutPlaces = ppRaw === 2 || ppRaw === 3 ? ppRaw : 1;

                    nextPools[fk] = {
                        entryFee: parsed === null ? null : parsed,
                        payoutPlaces,
                        excludedIds,
                    };
                    return;
                }
                if (type === "kp" || type === "longdrive" || type === "secondshotkp") {
                    nextPools[fk] = { amountPerHole: parsed === null ? null : parsed, excludedIds };
                    return;
                }

                nextPools[fk] = { excludedIds };
            });

            await setDoc(
                roundRef(uid, roundId),
                {
                    formatPools: nextPools,
                    poolsReady: true,
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );

            dirtyRef.current = false;
            Keyboard.dismiss();

            // navigation will be wired after GAME_ROUND_BRIEFING exists
            try {
                if (ROUTES?.GAME_ROUND_BRIEFING) {
                    navigation.navigate(ROUTES.GAME_ROUND_BRIEFING, { roundId });
                    return;
                }
            } catch { }

            Alert.alert("Saved", "Money pools saved.");
        } catch (e) {
            Alert.alert("Save failed", e?.message || "Could not save money pools.");
        } finally {
            setSaving(false);
        }
    }

    function renderFormatCard(f) {
        const fk = getKey(f);
        const type = detectFormatType(f);
        const meta = FORMAT_META[type] || FORMAT_META.unknown;

        const name = String(meta.title || f?.name || fk || "Format");
        const sub = String(meta.blurb || "").trim();
        const hint = String(meta.hint || "").trim();

        const feeStr = String(feeByKey?.[fk] ?? "");

        const holesSelected =
            type === "kp" || type === "longdrive" || type === "secondshotkp" ? selectedHoleCountForFormat(f) : null;

        const included = includedCountForKey(fk);
        const roster = players.length;

        const feeNum = Number(feeStr);
        let previewRight = "Calculated later";

        if ((type === "kp" || type === "longdrive" || type === "secondshotkp") && holesSelected !== null) {
            if (holesSelected > 0 && Number.isFinite(feeNum) && feeNum > 0) {
                const perPlayerEntry = feeNum * holesSelected; // $ per hole * holes
                const poolTotal = perPlayerEntry * included;   // entry/player * included players
                const perWin = feeNum * Math.max(0, included - 1); // winner doesn't pay themselves
                previewRight = `Entry/player: ${money(perPlayerEntry)} • Pool: ${money(poolTotal)} • Per win: ${money(perWin)}`;
            } else {
                previewRight = `Holes: ${holesSelected}`;
            }
        } else if (type === "deuce_pot" || type === "putting_contest") {
            previewRight =
                included > 0 && Number.isFinite(feeNum) && feeNum > 0 ? `Pool: ${money(feeNum * included)}` : `Included: ${included}`;
        } else if (type === "skins") {
            previewRight = feeNum > 0 ? `Per skin: ${money(feeNum)}` : "Value per skin";
        }
        return (
            <View key={fk || `${type}_${name}`} style={styles.premiumCard}>
                <View style={styles.rowTop}>
                    <Text style={styles.name}>{name}</Text>
                    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
                </View>

                {sub ? <Text style={styles.sub}>{sub}</Text> : null}

                {type === "putting_contest" ? (
                    <View style={styles.payoutPlacesRow}>
                        <Text style={styles.payoutPlacesLabel}>Payout places</Text>

                        <View style={styles.payoutPlacesPills}>
                            {[1, 2, 3].map((n) => {
                                const active = (Number(payoutPlacesByKey?.[fk]) || 1) === n;
                                return (
                                    <Pressable
                                        key={`pp-${fk}-${n}`}
                                        onPress={() => {
                                            dirtyRef.current = true;
                                            setPayoutPlacesByKey((prev) => ({ ...prev, [fk]: n }));
                                        }}
                                        style={({ pressed }) => [
                                            styles.payoutPill,
                                            active ? styles.payoutPillActive : styles.payoutPillIdle,
                                            pressed && styles.pressed,
                                        ]}
                                    >
                                        <Text style={active ? styles.payoutPillTextActive : styles.payoutPillTextIdle}>
                                            {n}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                ) : null}

                <View style={styles.innerSection}>
                    <View style={styles.feeRow}>
                        <TextInput
                            value={feeStr}
                            onChangeText={(s) => {
                                const cleaned = String(s || "").replace(/[^0-9.]/g, "");
                                dirtyRef.current = true;
                                setFeeByKey((prev) => ({ ...(prev || {}), [fk]: cleaned }));
                            }}
                            editable={!saving && type !== "unknown"}
                            placeholder="0"
                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                            style={[styles.feeInput, (saving || type === "unknown") && { opacity: 0.7 }]}
                            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                            returnKeyType="done"
                            onSubmitEditing={() => Keyboard.dismiss()}
                        />
                    </View>

                    <View style={styles.previewRow}>
                        <Text style={styles.previewText}>{roster ? `Players: ${roster}` : "Players: 0"}</Text>
                        <Text style={styles.previewText}>{previewRight}</Text>
                    </View>

                    <View style={[styles.previewRow, { marginTop: 12 }]}>
                        <Text style={styles.previewText}>{`Included: ${included}/${roster || 0}`}</Text>
                        <Pressable
                            onPress={() => setOpenKey((prev) => (prev === fk ? null : fk))}
                            disabled={saving || !roster}
                            style={({ pressed }) => [
                                styles.tinyBtn,
                                pressed && !saving && styles.pressed,
                                (saving || !roster) && { opacity: 0.7 },
                            ]}
                        >
                            <Text style={styles.tinyBtnText}>{openKey === fk ? "Done" : "Edit"}</Text>
                        </Pressable>
                    </View>

                    {openKey === fk ? (
                        <View style={{ marginTop: 12 }}>
                            {players.map((p, idx) => {
                                const id = playerId(p, idx);
                                const nameTxt = playerName(p, idx);
                                const excluded = new Set(safeArr(excludedByKey?.[fk]).map((x) => String(x)));
                                const isIncluded = !excluded.has(String(id));

                                return (
                                    <View key={`${fk}_${id}`}>
                                        <View style={styles.playerRow}>
                                            <Text style={styles.playerName}>{nameTxt}</Text>
                                            <Pressable
                                                onPress={() => toggleExclude(fk, id)}
                                                disabled={saving}
                                                style={({ pressed }) => [
                                                    styles.toggle,
                                                    isIncluded && styles.toggleOn,
                                                    pressed && !saving && styles.pressed,
                                                    saving && { opacity: 0.7 },
                                                ]}
                                            >
                                                <View style={[styles.toggleKnob, isIncluded ? styles.knobOn : styles.knobOff]} />
                                            </Pressable>
                                        </View>
                                        {idx < players.length - 1 ? <View style={styles.divider} /> : null}
                                    </View>
                                );
                            })}
                        </View>
                    ) : null}
                </View>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Money Pools" subtitle="Set amounts per format and who’s in." />

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={styles.hero}>
                        <Text style={styles.heroKicker}>Regular Game</Text>
                        <Text style={styles.heroTitle}>Money Setup</Text>
                        <Text style={styles.heroSub}>
                            Enter buy-ins and values for each selected format. Hole-based totals are calculated from your selected holes.
                            Default is everyone in; you can exclude players per format.
                        </Text>
                    </View>

                    {!formats.length ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>No formats selected</Text>
                            <Text style={styles.emptySub}>Go back and select at least one format first.</Text>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.sectionTitle}>Quick apply</Text>

                            <View style={styles.premiumCard}>
                                <View style={styles.rowTop}>
                                    <Text style={styles.name}>Apply one amount to all</Text>
                                    <Text style={styles.hint}>optional</Text>
                                </View>

                                <Text style={styles.sub}>Set a single amount and apply it to every selected format.</Text>

                                <View style={styles.innerSection}>
                                    <View style={styles.feeRow}>
                                        <TextInput
                                            value={applyAll}
                                            onChangeText={(s) => setApplyAll(String(s || "").replace(/[^0-9.]/g, ""))}
                                            editable={!saving}
                                            placeholder="5"
                                            placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                                            style={[styles.feeInput, saving && { opacity: 0.7 }]}
                                            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                                            returnKeyType="done"
                                            onSubmitEditing={applyFeeToAll}
                                        />
                                    </View>

                                    <Pressable
                                        onPress={applyFeeToAll}
                                        disabled={saving}
                                        style={({ pressed }) => [
                                            styles.applyBtn,
                                            pressed && !saving && styles.pressed,
                                            saving && { opacity: 0.7 },
                                        ]}
                                    >
                                        <Text style={styles.applyBtnText}>Apply to all formats</Text>
                                    </Pressable>
                                </View>
                            </View>

                            <Text style={styles.sectionTitle}>Per format</Text>
                            {formats.map(renderFormatCard)}
                        </>
                    )}
                </ScrollView>

                <View style={styles.footer}>
                    <Pressable
                        onPress={savePools}
                        disabled={!canSave}
                        style={({ pressed }) => [
                            styles.primaryBtn,
                            pressed && canSave && styles.pressed,
                            (!canSave || saving) && { opacity: 0.45 },
                        ]}
                    >
                        <Text style={styles.primaryText}>{saving ? "Saving..." : "Save & Continue"}</Text>
                    </Pressable>

                    {!canSave && !loading && formats.length ? (
                        <View style={{ marginTop: 10 }}>
                            <Text style={[styles.previewText, { opacity: 0.7, textAlign: "center" }]}>
                                Enter an amount for each selected format to unlock Save.
                            </Text>
                        </View>
                    ) : null}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}
