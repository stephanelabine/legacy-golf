// src/screens/TournamentFormatsScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  collection,
  onSnapshot,
  query,
  orderBy,
  setDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  getDoc,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import PremiumSwipeRow from "../components/PremiumSwipeRow";
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
  { key: "kp", name: "KP", subtitle: "Closest to the pin", needsHoles: true, blurb: "Select the official KP holes per round on the next step." },
  { key: "long_drive", name: "Long Drive", subtitle: "Longest drive on a hole", needsHoles: true, blurb: "Select the official holes per round on the next step." },
  { key: "second_shot_kp", name: "Second Shot KP", subtitle: "Closest after second shot", needsHoles: true, blurb: "Select the official holes per round on the next step." },
  { key: "deuce_pot", name: "Deuce Pot", subtitle: "Split pot among all deuces", needsHoles: false, blurb: "Calculated later: every score of 2 counts, across all rounds." },
  { key: "putting_contest", name: "Putting Contest", subtitle: "Lowest total putts wins", needsHoles: false, blurb: "Calculated later from the round scoring data (fewest total putts)." },
  { key: "team_vs_team", name: "Team vs Team", subtitle: "Team points battle", needsHoles: false, blurb: "Set team names next. Team assignment and matchups come later (with handicap balancing)." },
];

export default function TournamentFormatsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  // IMPORTANT: when opened from Overview, return by POP (goBack) so we don't break stack history
  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formatDocs, setFormatDocs] = useState([]);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  // Enforce: only one swipe row open at a time
  const openSwipeRef = useRef(null);
  function closeAnyOpenSwipe() {
    try {
      openSwipeRef.current?.close?.();
    } catch (e) {}
    openSwipeRef.current = null;
  }

  function popReturnToOverview() {
    closeAnyOpenSwipe();

    // KEY: do NOT reset nav here. POP back so Overview keeps its history.
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    // fallback (only if there's no back stack, which is rare)
    navigation.navigate(returnTo, { tournamentId });
  }

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

    const unsub = onSnapshot(
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

  // Swipe active when host + not saving
  const canSwipe = isHost && !saving;

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

    const badgeBg = isDark ? "rgba(10,15,26,0.72)" : "rgba(255,255,255,0.72)";
    const badgeBorder = isDark ? "rgba(255,255,255,0.16)" : "rgba(10,15,26,0.12)";

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

      // Clips swipe panes + row so you don’t get “side beams”
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

  async function ensureSelected(item) {
    if (!tournamentId) return;
    if (!item?.key) return;

    const key = String(item.key);
    const ref = doc(db, "tournaments", tournamentId, "formats", key);

    const already = selectedKeys.has(key);
    if (already) return;

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) return;
    } catch (e) {}

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

  async function editFormat(item) {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit formats.");
      return;
    }

    setSaving(true);
    try {
      await ensureSelected(item);
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not update formats.");
      setSaving(false);
      return;
    }
    setSaving(false);

    closeAnyOpenSwipe();

    // Pass through overview-return params so DETAILS screens can also return correctly.
    navigation.navigate(ROUTES.TOURNAMENT_FORMAT_DETAILS, {
      tournamentId,
      focusKey: String(item?.key || ""),
      fromOverview,
      returnTo,
    });
  }

  async function deleteFormat(item) {
    if (!tournamentId) return;
    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit formats.");
      return;
    }
    if (!item?.key) return;

    const key = String(item.key);
    if (!selectedKeys.has(key)) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, "tournaments", tournamentId, "formats", key));
    } catch (e) {
      Alert.alert("Delete failed", e?.message || "Could not remove this format.");
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

    closeAnyOpenSwipe();

    navigation.navigate(ROUTES.TOURNAMENT_FORMAT_DETAILS, {
      tournamentId,
      fromOverview: false,
      returnTo: ROUTES.TOURNAMENT_OVERVIEW,
    });
  }

  async function onSaveReturnToOverview() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can edit formats.");
      return;
    }

    setSaving(true);
    try {
      // Don’t advance setupStep when editing from overview.
      // Just keep a small breadcrumb that formats are selected or not.
      await updateDoc(doc(db, "tournaments", tournamentId), {
        formatsSelected: selectedCount > 0,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      // non-blocking
    } finally {
      setSaving(false);
    }

    popReturnToOverview();
  }

  function onRowPress(item) {
    if (saving) return;
    if (!isHost) return;

    const key = String(item?.key || "");
    const on = selectedKeys.has(key);

    // Premium behavior:
    // - if not selected: tap selects it
    // - if selected: tap edits/configures it (go to details)
    if (!on) {
      toggleFormat(item);
      return;
    }

    editFormat(item);
  }

  function renderRow(item) {
    const key = String(item.key);
    const on = selectedKeys.has(key);
    const sub = item.blurb || "";

    const rowInner = (
      <Pressable
        onPress={() => onRowPress(item)}
        disabled={saving || !isHost}
        style={({ pressed }) => [
          styles.formatRow,
          on && styles.formatRowOn,
          pressed && !saving && isHost && styles.pressed,
          (!isHost || saving) && { opacity: 0.7 },
        ]}
      >
        {on ? (
          <View style={[styles.selectedBadge, styles.selectedBadgeOn]}>
            <Text style={styles.selectedBadgeText}>Selected</Text>
          </View>
        ) : null}

        <Text style={styles.formatRowTitle}>{item.name}</Text>
        <Text style={styles.formatRowSub}>{sub}</Text>
      </Pressable>
    );

    // If swipe is not allowed, still keep the same clipped wrapper for consistent look
    if (!canSwipe) {
      return (
        <View key={key} style={styles.swipeWrap}>
          {rowInner}
        </View>
      );
    }

    return (
      <View key={key} style={styles.swipeWrap}>
        <PremiumSwipeRow
          openSwipeRef={openSwipeRef}
          closeAnyOpenSwipe={closeAnyOpenSwipe}
          enabled={canSwipe}
          actionWidth={120}
          friction={2}
          threshold={48}
          radius={18}
          borderColor={theme.border}
          backgroundColor={theme.card2}
          editColor={"rgba(15,122,74,0.92)"}
          deleteColor={isDark ? "rgba(220, 52, 52, 0.92)" : "rgba(190, 40, 40, 0.92)"}
          onEdit={() => editFormat(item)}
          onDelete={() => deleteFormat(item)}
        >
          {rowInner}
        </PremiumSwipeRow>
      </View>
    );
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Continue to Format Details";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Formats"
        subtitle={fromOverview ? "Edit formats, then return." : "Choose tournament side games."}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>{fromOverview ? "Edit" : "Step 4"}</Text>
          <Text style={styles.heroTitle}>Tournament Side Games</Text>
          <Text style={styles.heroSub}>
            {fromOverview
              ? "Select what your tournament will include. When finished, save and return to the overview."
              : "Select what your tournament will include. Next you’ll configure holes and team names before money pools."}
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
          onPress={fromOverview ? onSaveReturnToOverview : onContinue}
          disabled={saving || !isHost}
          style={({ pressed }) => [
            styles.primaryBtn,
            pressed && !saving && isHost && styles.pressed,
            (saving || !isHost) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : primaryLabel}</Text>
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
