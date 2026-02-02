// src/screens/TournamentFormatPoolsScreen.js
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
import { CommonActions } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  collection,
  onSnapshot,
  onSnapshot as onSnapshotQuery,
  query,
  orderBy,
  setDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

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

// required order:
// KP → Long Drive → Second Shot KP → Deuce Pot → Putting Contest → Team vs Team
const FORMAT_ORDER = ["kp", "longdrive", "secondshotkp", "deucepot", "puttingcontest", "teamvsteam"];

const FORMAT_META = {
  kp: {
    title: "KP",
    blurb: "Closest to the pin on selected par-3s. Results are calculated from player input.",
    hint: "per player",
  },
  longdrive: {
    title: "Long Drive",
    blurb: "Longest drive competition. Results are calculated from player input.",
    hint: "per player",
  },
  secondshotkp: {
    title: "Second Shot KP",
    blurb: "Closest to the pin on selected approach shots. Results are calculated from player input.",
    hint: "per player",
  },
  deucepot: {
    title: "Deuce Pot",
    blurb: "Pot for 2s across the round. Results are calculated from player input.",
    hint: "per player",
  },
  puttingcontest: {
    title: "Putting Contest",
    blurb: "Putting challenge for the event. Results are calculated from player input.",
    hint: "per player",
  },
  teamvsteam: {
    title: "Team vs Team",
    blurb: "Team game pool for the event. Results are calculated from player input.",
    hint: "per player",
  },
};

// IMPORTANT: detect “second shot kp” before “kp” so it doesn’t get misclassified.
function detectFormatType(f) {
  const k = normKey(f?.key || f?.id);
  const n = normKey(f?.name);

  const s = `${k} ${n}`.trim();

  // second shot KP (check first)
  const isSecondShot =
    s.includes("secondshotkp") ||
    s.includes("secondshot") ||
    (s.includes("second") && s.includes("shot") && s.includes("kp")) ||
    s.includes("2ndshotkp") ||
    (s.includes("2nd") && s.includes("shot") && s.includes("kp"));

  if (isSecondShot) return "secondshotkp";

  // long drive
  if (s.includes("longdrive") || (s.includes("long") && s.includes("drive"))) return "longdrive";

  // deuce pot
  if (s.includes("deucepot") || (s.includes("deuce") && s.includes("pot"))) return "deucepot";

  // putting contest
  if (s.includes("puttingcontest") || (s.includes("putting") && s.includes("contest"))) return "puttingcontest";

  // team vs team
  if (s.includes("teamvsteam") || (s.includes("team") && s.includes("vs") && s.includes("team"))) return "teamvsteam";

  // KP (last)
  if (s.includes("kp")) return "kp";

  return "unknown";
}

export default function TournamentFormatPoolsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [formatDocs, setFormatDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const [applyAll, setApplyAll] = useState("");
  const [feeByKey, setFeeByKey] = useState({});
  const dirtyRef = useRef(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  function returnToOverview() {
    Keyboard.dismiss();

    // Key fix:
    // If we came from Overview, preserve the existing stack by going back.
    // That way, the Overview back button returns to the previous tournament screen
    // (not Home), because we didn’t nuke the stack with a reset.
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    // Fallback for edge cases (deep link, etc.)
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: returnTo, params: { tournamentId } }],
      })
    );
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

  // initialize local fee strings from firestore docs (but don’t stomp while typing)
  useEffect(() => {
    if (dirtyRef.current) return;

    const next = {};
    (formatDocs || []).forEach((f) => {
      const key = String(f?.key || f?.id || "").trim();
      if (!key) return;
      const fee = Number(f?.entryFee);
      next[key] = Number.isFinite(fee) && fee > 0 ? String(fee) : "";
    });
    setFeeByKey(next);
  }, [formatDocs]);

  const u = auth.currentUser;
  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const rosterCount = useMemo(() => {
    const memberIds = Array.isArray(t?.memberIds) ? t.memberIds : [];
    const guestIds = Array.isArray(t?.guestIds) ? t.guestIds : [];
    const owner = String(t?.ownerUid || "").trim();

    const s = new Set();
    memberIds.forEach((x) => s.add(String(x)));
    guestIds.forEach((x) => s.add(String(x)));
    if (owner) s.add(owner);

    s.delete("");
    return s.size;
  }, [t]);

  // enforce the same order as Formats + Details, using detectFormatType
  const orderedFormats = useMemo(() => {
    const getRank = (f) => {
      const type = detectFormatType(f);
      const idx = FORMAT_ORDER.indexOf(type);
      return idx === -1 ? 999 : idx;
    };

    return [...(formatDocs || [])].sort((a, b) => getRank(a) - getRank(b));
  }, [formatDocs]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    // bronzy gold (less yellow)
    const goldBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
    const goldBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

    const greenRing = isDark ? "rgba(15,122,74,0.62)" : "rgba(15,122,74,0.72)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.14)";

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

      previewRow: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      previewText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800" },

      applyBtn: {
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: greenBg,
        borderWidth: 1,
        borderColor: greenRing,
        marginTop: 12,
      },
      applyBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },

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

  function applyFeeToAll() {
    const v = parseFeeString(applyAll);
    if (Number.isNaN(v)) {
      Alert.alert("Entry fee", "Entry fee must be a number (example: 10 or 10.00).");
      return;
    }
    const s = v === null ? "" : String(v);

    dirtyRef.current = true;
    const next = { ...(feeByKey || {}) };
    (orderedFormats || []).forEach((f) => {
      const key = String(f?.key || f?.id || "").trim();
      if (!key) return;
      next[key] = s;
    });
    setFeeByKey(next);
    Keyboard.dismiss();
  }

  async function saveAllFees() {
    if (!tournamentId) return;

    if (!isHost) {
      Alert.alert("Host only", "Only the host can set money pools.");
      return;
    }

    setSaving(true);
    try {
      for (const f of orderedFormats || []) {
        const key = String(f?.key || f?.id || "").trim();
        if (!key) continue;

        const parsed = parseFeeString(feeByKey?.[key]);
        if (Number.isNaN(parsed)) {
          Alert.alert("Entry fee", `Entry fee for ${String(f?.name || key)} must be a number.`);
          setSaving(false);
          return;
        }

        const entryFee = parsed === null ? null : parsed;

        // eslint-disable-next-line no-await-in-loop
        await setDoc(
          doc(db, "tournaments", tournamentId, "formats", key),
          { entryFee, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }

      dirtyRef.current = false;
      Keyboard.dismiss();

      if (fromOverview) {
        // Edit mode: do not advance setupStep, just mark poolsReady + go back to Overview (preserve stack)
        try {
          await updateDoc(doc(db, "tournaments", tournamentId), {
            poolsReady: true,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          // non-blocking
        }

        returnToOverview();
        return;
      }

      // Flow mode
      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "players",
        poolsReady: true,
        updatedAt: serverTimestamp(),
      });

      navigation.navigate(ROUTES.TOURNAMENT_PLAYERS_SETUP, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save money pools.");
    } finally {
      setSaving(false);
    }
  }

  function getMetaForFormat(f) {
    const type = detectFormatType(f);
    return FORMAT_META[type] || null;
  }

  function renderFormatCard(f) {
    const key = String(f?.key || f?.id || "").trim();
    const meta = getMetaForFormat(f);

    const name = String(meta?.title || f?.name || key);
    const sub = String(meta?.blurb || "").trim();
    const hint = String(meta?.hint || "per player");

    const feeStr = String(feeByKey?.[key] ?? "");
    const feeNum = Number(feeStr);
    const estPool = rosterCount > 0 && Number.isFinite(feeNum) && feeNum > 0 ? feeNum * rosterCount : null;

    return (
      <View key={key} style={styles.premiumCard}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>

        {sub ? <Text style={styles.sub}>{sub}</Text> : null}

        <View style={styles.innerSection}>
          <View style={styles.feeRow}>
            <TextInput
              value={feeStr}
              onChangeText={(s) => {
                const cleaned = String(s || "").replace(/[^0-9.]/g, "");
                dirtyRef.current = true;
                setFeeByKey((prev) => ({ ...(prev || {}), [key]: cleaned }));
              }}
              editable={!saving && isHost}
              placeholder="0"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={[styles.feeInput, (!isHost || saving) && { opacity: 0.7 }]}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewText}>{rosterCount ? `Roster: ${rosterCount}` : "Roster: 0"}</Text>
            <Text style={styles.previewText}>
              {estPool ? `Pool ~ ${money(estPool)}` : rosterCount ? "Pool = fee x roster" : "Pool later"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Save & Continue to Players";

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Money Pools"
        subtitle={fromOverview ? "Edit pools, then return." : "Set the entry fee per selected side game."}
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>{fromOverview ? "Edit" : "Step 6"}</Text>
            <Text style={styles.heroTitle}>Tournament Pools</Text>
            <Text style={styles.heroSub}>
              Set the buy-in per side game. Pool estimate uses fee x roster. Current roster estimate: {rosterCount || 0}.
            </Text>
          </View>

          {!orderedFormats.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No formats selected</Text>
              <Text style={styles.emptySub}>Go back and select at least one tournament side game, or continue later.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Quick apply</Text>

              <View style={styles.premiumCard}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>Apply one fee to all</Text>
                  <Text style={styles.hint}>optional</Text>
                </View>

                <Text style={styles.sub}>Set a single entry fee and apply it to every selected format.</Text>

                <View style={styles.innerSection}>
                  <View style={styles.feeRow}>
                    <TextInput
                      value={applyAll}
                      onChangeText={(s) => setApplyAll(String(s || "").replace(/[^0-9.]/g, ""))}
                      editable={!saving && isHost}
                      placeholder="10"
                      placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                      style={[styles.feeInput, (!isHost || saving) && { opacity: 0.7 }]}
                      keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                      returnKeyType="done"
                      onSubmitEditing={applyFeeToAll}
                    />
                  </View>

                  <Pressable
                    onPress={applyFeeToAll}
                    disabled={!isHost || saving}
                    style={({ pressed }) => [
                      styles.applyBtn,
                      pressed && !saving && styles.pressed,
                      (!isHost || saving) && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.applyBtnText}>Apply to all formats</Text>
                  </Pressable>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Per format</Text>
              {orderedFormats.map(renderFormatCard)}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={saveAllFees}
            disabled={saving || !isHost}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && !saving && styles.pressed,
              (saving || !isHost) && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.primaryText}>{saving ? "Saving..." : primaryLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
