// src/screens/GameFormatsScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ScreenHeader from "../components/ScreenHeader";
import PremiumSwipeRow from "../components/PremiumSwipeRow";
import { useTheme } from "../theme/ThemeProvider";
import { loadActiveRound, updateActiveRound } from "../storage/roundState";

/*
  Regular Game Formats (Premium)
  - Firestore is source of truth via roundState.js
  - This screen reloads on focus so selections always reflect latest round state
*/

const FORMAT_CATALOG = [
    // 1
    {
        key: "kp",
        name: "KP",
        subtitle: "Closest to the pin",
        needsHoles: true,
        blurb: "Closest to the pin on selected par 3s. Hole selection coming soon.",
        comingSoon: false,
    },
    // 2
    {
        key: "longdrive",
        name: "Long Drive",
        subtitle: "Longest drive on a hole",
        needsHoles: true,
        blurb: "Longest drive on selected holes. Hole selection coming soon.",
        comingSoon: false,
    },
    // 3
    {
        key: "secondshotkp",
        name: "2nd Shot KP",
        subtitle: "Closest after second shot",
        needsHoles: true,
        blurb: "Closest to the pin after the second shot on selected holes. Hole selection coming soon.",
        comingSoon: false,
    },
    // 4
    {
        key: "deuce_pot",
        name: "Deuce Pot",
        subtitle: "All 2s split the pot",
        needsHoles: false,
        blurb: "Every score of 2 counts. Pot splits among all players with a deuce.",
        comingSoon: false,
    },
    // 5
    {
        key: "putting_contest",
        name: "Putting Contest",
        subtitle: "Fewest total putts wins",
        needsHoles: false,
        blurb: "Calculated later from round scoring data (fewest total putts).",
        comingSoon: false,
    },
    // 6
    {
        key: "skins",
        name: "Skins",
        subtitle: "Win a hole outright",
        needsHoles: false,
        blurb: "Lowest score wins the hole. Ties carry over to the next hole.",
        comingSoon: false,
    },
    // 7
    {
        key: "nassau",
        name: "Nassau",
        subtitle: "Front / Back / Total",
        needsHoles: false,
        blurb: "Three bets: Front 9, Back 9, and Total 18. Config options coming soon.",
        comingSoon: false,
    },
    // 8
    {
        key: "stableford",
        name: "Stableford",
        subtitle: "Points scoring system",
        needsHoles: false,
        blurb: "Score points per hole. Rule set selection coming soon.",
        comingSoon: false,
    },
    // 9
    {
        key: "birdie_buckets",
        name: "Birdie Buckets",
        subtitle: "Bucket builds, birdie wins",
        needsHoles: false,
        blurb: "Contributions build the pot. First birdie (or better) wins the bucket. Full rules display coming soon.",
        comingSoon: false,
    },
    // 10
    {
        key: "snake",
        name: "Snake",
        subtitle: "3-putt penalty game",
        needsHoles: false,
        blurb: "Tracks 3-putts across the round. Payout rules/config coming soon.",
        comingSoon: false,
    },
    // 11
    {
        key: "team_vs_team",
        name: "Team vs Team",
        subtitle: "Team points battle",
        needsHoles: false,
        blurb: "Team names next. Pairings/matchups later (with handicap balancing).",
        comingSoon: false,
    },
    // 12
    {
        key: "__more_coming_soon__",
        name: "More Games Coming Soon",
        subtitle: "We’re building fast",
        needsHoles: false,
        blurb: "More side games and configuration options are on the way.",
        comingSoon: true,
    },
];

export default function GameFormatsScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const { scheme, theme } = useTheme();
    const isDark = scheme === "dark";

    const params = route?.params || {};
    const roundId = params?.roundId || null;

    const [saving, setSaving] = useState(false);
    const [activeRound, setActiveRound] = useState(null);

    const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

    // Enforce: only one swipe row open at a time
    const openSwipeRef = useRef(null);
    function closeAnyOpenSwipe() {
        try {
            openSwipeRef.current?.close?.();
        } catch { }
        openSwipeRef.current = null;
    }

    async function refreshRound() {
        const r = await loadActiveRound(roundId);
        setActiveRound(r || null);
    }

    useEffect(() => {
        let mounted = true;

        (async () => {
            const r = await loadActiveRound(roundId);
            if (!mounted) return;
            setActiveRound(r || null);
        })();

        const unsub = navigation.addListener("focus", () => {
            refreshRound();
        });

        return () => {
            mounted = false;
            try {
                unsub && unsub();
            } catch { }
            closeAnyOpenSwipe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roundId]);

    const selectedKeys = useMemo(() => {
        const s = new Set();
        const list = activeRound?.formatsSelected;

        if (Array.isArray(list)) {
            list.forEach((k) => s.add(String(k || "")));
        } else if (list && typeof list === "object") {
            Object.keys(list).forEach((k) => {
                if (list[k]) s.add(String(k));
            });
        }

        s.delete("");
        s.delete("__more_coming_soon__");
        return s;
    }, [activeRound]);

    const selectedCount = selectedKeys.size;

    const styles = useMemo(() => {
        const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
        const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

        const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
        const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

        const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
        const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

        const badgeBg = isDark ? "rgba(10,15,26,0.72)" : "rgba(255,255,255,0.72)";
        const badgeBorder = isDark ? "rgba(255,255,255,0.16)" : "rgba(10,15,26,0.12)";

        const comingSoonBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(10,15,26,0.10)";
        const comingSoonBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(10,15,26,0.04)";

        return StyleSheet.create({
            screen: { flex: 1, backgroundColor: theme.bg },
            content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: footerPad + 90 },

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

            pillRow: { marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" },
            pill: {
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: softBg,
                borderWidth: 1,
                borderColor: softBorder,
            },
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

            swipeWrap: {
                marginBottom: 12,
                borderRadius: 18,
                overflow: "hidden",
            },

            formatRow: {
                position: "relative",
                borderRadius: 18,
                padding: 14,
                borderWidth: 2,
                borderColor: softBorder,
                backgroundColor: theme.card2,
            },
            formatRowOn: { borderColor: greenRing, backgroundColor: greenBg },

            formatRowComingSoon: {
                borderColor: comingSoonBorder,
                backgroundColor: comingSoonBg,
            },

            formatRowTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
            formatRowSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

            selectedBadge: {
                position: "absolute",
                top: 10,
                right: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: badgeBg,
                borderWidth: 1,
                borderColor: badgeBorder,
            },
            selectedBadgeOn: {
                borderColor: greenRing,
                backgroundColor: isDark ? "rgba(15,122,74,0.20)" : "rgba(15,122,74,0.16)",
            },
            selectedBadgeText: {
                color: theme.text,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 0.8,
                textTransform: "uppercase",
                opacity: 0.92,
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

    async function setSelectedKeys(nextSet) {
        const arr = Array.from(nextSet);
        setSaving(true);
        try {
            const next = await updateActiveRound(
                {
                    formatsSelected: arr,
                    formatsSelectedCount: arr.length,
                },
                roundId
            );
            setActiveRound(next || null);
        } catch {
            Alert.alert("Save failed", "Could not update formats.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleFormat(item) {
        if (!item?.key) return;
        if (item.comingSoon) return;

        const key = String(item.key);
        const next = new Set(selectedKeys);

        if (next.has(key)) next.delete(key);
        else next.add(key);

        await setSelectedKeys(next);
    }

    async function clearAll() {
        Alert.alert("Clear all formats?", "This removes every selected side game for this round.", [
            { text: "Cancel", style: "cancel" },
            { text: "Clear", style: "destructive", onPress: async () => setSelectedKeys(new Set()) },
        ]);
    }

    async function onContinue() {
        if (saving) return;

        if (selectedCount === 0) {
            Alert.alert("Select formats", "Choose at least one side game to continue.");
            return;
        }

        closeAnyOpenSwipe();

        // placeholder until Format Details screen exists
        navigation.goBack();
    }

    function onRowPress(item) {
        if (saving) return;

        if (item?.comingSoon) {
            Alert.alert("Coming soon", "More games and configuration options are on the way.");
            return;
        }

        toggleFormat(item);
    }

    function renderRow(item) {
        const key = String(item.key);
        const on = selectedKeys.has(key);
        const sub = item.blurb || "";

        const rowInner = (
            <Pressable
                onPress={() => onRowPress(item)}
                disabled={saving}
                style={({ pressed }) => [
                    styles.formatRow,
                    item.comingSoon && styles.formatRowComingSoon,
                    on && !item.comingSoon && styles.formatRowOn,
                    pressed && !saving && styles.pressed,
                    saving && { opacity: 0.7 },
                ]}
            >
                {!item.comingSoon && on ? (
                    <View style={[styles.selectedBadge, styles.selectedBadgeOn]}>
                        <Text style={styles.selectedBadgeText}>Selected</Text>
                    </View>
                ) : item.comingSoon ? (
                    <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Soon</Text>
                    </View>
                ) : null}

                <Text style={styles.formatRowTitle}>{item.name}</Text>
                <Text style={styles.formatRowSub}>{sub}</Text>
            </Pressable>
        );

        return (
            <View key={key} style={styles.swipeWrap}>
                <PremiumSwipeRow
                    openSwipeRef={openSwipeRef}
                    closeAnyOpenSwipe={closeAnyOpenSwipe}
                    enabled={false}
                    actionWidth={120}
                    friction={2}
                    threshold={48}
                    radius={18}
                    borderColor={theme.border}
                    backgroundColor={theme.card2}
                    editColor={"rgba(15,122,74,0.92)"}
                    deleteColor={isDark ? "rgba(220, 52, 52, 0.92)" : "rgba(190, 40, 40, 0.92)"}
                    onEdit={() => { }}
                    onDelete={() => { }}
                >
                    {rowInner}
                </PremiumSwipeRow>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader navigation={navigation} title="Formats" subtitle="Choose side games for this round." />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}>
                    <Text style={styles.heroKicker}>Step 5</Text>
                    <Text style={styles.heroTitle}>Side Games</Text>
                    <Text style={styles.heroSub}>
                        Select what this round will include. Next we’ll configure holes/team names where needed.
                    </Text>

                    <View style={styles.pillRow}>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>selected: {selectedCount}</Text>
                        </View>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>firestore</Text>
                        </View>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Choose side games</Text>
                {FORMAT_CATALOG.map(renderRow)}
            </ScrollView>

            <View style={styles.footer}>
                <Pressable
                    onPress={onContinue}
                    disabled={saving}
                    style={({ pressed }) => [styles.primaryBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.7 }]}
                >
                    <Text style={styles.primaryText}>{saving ? "Saving..." : "Next: Format Details"}</Text>
                </Pressable>

                <Pressable
                    onPress={clearAll}
                    disabled={saving}
                    style={({ pressed }) => [styles.secondaryBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.7 }]}
                >
                    <Text style={styles.secondaryText}>Clear all</Text>
                </Pressable>
            </View>
        </View>
    );
}
