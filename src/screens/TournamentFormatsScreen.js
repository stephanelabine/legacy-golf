// src/screens/TournamentFormatsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  collection,
  onSnapshot,
  onSnapshot as onSnapshotQuery,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

/**
 * Tournament Formats (Premium)
 * Tournament-only side games (not Nassau/Wolf/Vegas/etc).
 *
 * Data:
 * tournaments/{id}/formats/{key}
 */

const FORMAT_CATALOG = [
  {
    key: "kp",
    name: "KP",
    subtitle: "Closest to the pin",
    needsHoles: true,
    blurb: "Select the official KP holes per round on the next step.",
  },
  {
    key: "second_shot_kp",
    name: "Second Shot KP",
    subtitle: "Closest after second shot",
    needsHoles: true,
    blurb: "Select the official holes per round on the next step.",
  },
  {
    key: "long_drive",
    name: "Long Drive",
    subtitle: "Longest drive on a hole",
    needsHoles: true,
    blurb: "Select the official holes per round on the next step.",
  },
  {
    key: "putting_contest",
    name: "Putting Contest",
    subtitle: "Lowest total putts wins",
    needsHoles: false,
    blurb: "Calculated later from the round scoring data (fewest total putts).",
  },
  {
    key: "team_vs_team",
    name: "Team vs Team",
    subtitle: "Team points battle",
    needsHoles: false,
    blurb: "Set team names next. Team assignment and matchups come later (with handicap balancing).",
  },
  {
    key: "deuce_pot",
    name: "Deuce Pot",
    subtitle: "Split pot among all deuces",
    needsHoles: false,
    blurb: "Calculated later: every score of 2 counts, across all rounds.",
  },
];

export default function TournamentFormatsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formatDocs, setFormatDocs] = useState([]); // tournaments/{id}/formats

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId, navigation]);

  useEffect(() => {
    if (!tournamentId) return;

    const fref = collection(db, "tournaments", tournamentId, "formats");
    const fq = query(fref, orderBy("createdAt", "asc"));

    const unsub = onSnapshotQuery(
      fq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setFormatDocs(rows);
      },
      (err) => Alert.alert("Formats error", err?.message || "Could not load formats.")
    );

    return () => unsub();
  }, [tournamentId]);

  const u = auth.currentUser;
  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const selectedKeys = useMemo(() => {
    const s = new Set();
    (formatDocs || []).forEach((d) => s.add(String(d?.key || d?.id || "")));
    s.delete("");
    return s;
  }, [formatDocs]);

  const selectedCount = selectedKeys.size;
  const roundsTotal = Math.max(1, Number(t?.roundsTotal || 1));

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 190 },

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

      formatRow: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 2,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      formatRowOn: { borderColor: greenRing, backgroundColor: greenBg },
      formatRowTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      formatRowSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

      tagRow: { marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" },
      tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: blueBg, borderWidth: 1, borderColor: blue },
      tagText: { color: theme.text, fontSize: 11, fontWeight: "900", opacity: 0.92 },

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

  async function toggleFormat(item) {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit formats.");
      return;
    }
    if (!item?.key) return;

    const key = String(item.key);
    const exists = selectedKeys.has(key);

    setSaving(true);
    try {
      const ref = doc(db, "tournaments", tournamentId, "formats", key);

      if (exists) {
        await deleteDoc(ref);
      } else {
        await setDoc(
          ref,
          {
            key,
            name: item.name,
            subtitle: item.subtitle || "",
            needsHoles: !!item.needsHoles,
            blurb: item.blurb || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not update formats.");
    } finally {
      setSaving(false);
    }
  }

  async function clearAll() {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit formats.");
      return;
    }

    Alert.alert("Clear all formats?", "This removes every selected tournament side game.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            for (const k of Array.from(selectedKeys)) {
              // eslint-disable-next-line no-await-in-loop
              await deleteDoc(doc(db, "tournaments", tournamentId, "formats", k));
            }
          } catch (e) {
            Alert.alert("Clear failed", e?.message || "Could not clear formats.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  async function onContinue() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can continue setup.");
      return;
    }

    if (selectedCount === 0) {
      Alert.alert("Select formats", "Choose at least one tournament side game to continue.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "format_details",
        formatsSelected: true,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      // non-blocking
    } finally {
      setSaving(false);
    }

    navigation.navigate(ROUTES.TOURNAMENT_FORMAT_DETAILS, { tournamentId });
  }

  function renderRow(item) {
    const on = selectedKeys.has(String(item.key));
    const tag = item.needsHoles ? `holes per round (${roundsTotal})` : "event-wide";
    const sub = item.blurb || "";

    return (
      <Pressable
        key={String(item.key)}
        onPress={() => toggleFormat(item)}
        disabled={saving || !isHost}
        style={({ pressed }) => [
          styles.formatRow,
          on && styles.formatRowOn,
          pressed && !saving && isHost && styles.pressed,
          (!isHost || saving) && { opacity: 0.7 },
        ]}
      >
        <Text style={styles.formatRowTitle}>{item.name}</Text>
        <Text style={styles.formatRowSub}>{sub}</Text>

        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{on ? "selected" : "tap to add"}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Formats" subtitle="Choose tournament side games." />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Step 4</Text>
          <Text style={styles.heroTitle}>Tournament Side Games</Text>
          <Text style={styles.heroSub}>
            Select what your tournament will include. Next you’ll configure holes and team names before money pools.
          </Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>selected: {selectedCount}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>rounds: {roundsTotal}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>premium</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Choose side games</Text>
        {FORMAT_CATALOG.map(renderRow)}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={onContinue}
          disabled={saving || !isHost}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !isHost) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Continue to Format Details"}</Text>
        </Pressable>

        <Pressable
          onPress={clearAll}
          disabled={saving || !isHost}
          style={({ pressed }) => [
            styles.secondaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !isHost) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.secondaryText}>Clear all</Text>
        </Pressable>
      </View>
    </View>
  );
}
