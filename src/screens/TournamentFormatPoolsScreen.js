// src/screens/TournamentFormatPoolsScreen.js
import React, { useEffect, useMemo, useState } from "react";
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

export default function TournamentFormatPoolsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [formatDocs, setFormatDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const [applyAll, setApplyAll] = useState("");
  const [feeByKey, setFeeByKey] = useState({});

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

  // initialize local fee strings from firestore docs
  useEffect(() => {
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

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.12)" : "rgba(255, 210, 92, 0.16)";

    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
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
      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      name: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      sub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 16 },

      feeRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
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
      feeHint: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },

      applyBox: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginBottom: 12,
      },

      applyBtn: {
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: greenBg,
        borderWidth: 1,
        borderColor: greenRing,
        marginTop: 10,
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
      emptySub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 18 },
    });
  }, [theme, isDark, footerPad]);

  function applyFeeToAll() {
    const v = parseFeeString(applyAll);
    if (Number.isNaN(v)) {
      Alert.alert("Entry fee", "Entry fee must be a number (example: 10 or 10.00).");
      return;
    }
    const s = v === null ? "" : String(v);
    const next = { ...feeByKey };
    (formatDocs || []).forEach((f) => {
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
      for (const f of formatDocs || []) {
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

      await updateDoc(doc(db, "tournaments", tournamentId), {
        setupStep: "format_details",
        poolsReady: true,
        updatedAt: serverTimestamp(),
      });

      Keyboard.dismiss();
      navigation.navigate(ROUTES.TOURNAMENT_FORMAT_DETAILS, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save money pools.");
    } finally {
      setSaving(false);
    }
  }

  function renderFormatCard(f) {
    const key = String(f?.key || f?.id || "").trim();
    const name = String(f?.name || key);
    const sub = String(f?.blurb || "").trim();
    const needsHoles = !!f?.needsHoles;

    const feeStr = String(feeByKey?.[key] ?? "");
    const feeNum = Number(feeStr);
    const estPool = rosterCount > 0 && Number.isFinite(feeNum) && feeNum > 0 ? feeNum * rosterCount : null;

    return (
      <View key={key} style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.feeHint}>{needsHoles ? "holes per round" : "event-wide"}</Text>
        </View>

        {sub ? <Text style={styles.sub}>{sub}</Text> : null}

        <View style={styles.feeRow}>
          <TextInput
            value={feeStr}
            onChangeText={(s) => {
              const cleaned = String(s || "").replace(/[^0-9.]/g, "");
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
          <Text style={styles.feeHint}>
            {estPool ? `pool ~ ${money(estPool)}` : rosterCount ? `pool = fee x ${rosterCount}` : "pool later"}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Money Pools" subtitle="Set an entry fee for each selected side game." />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>Step 5</Text>
            <Text style={styles.heroTitle}>Tournament Pools</Text>
            <Text style={styles.heroSub}>
              Set the entry fee per side game. The pool is fee x players. Current roster estimate: {rosterCount || 0}.
            </Text>
          </View>

          {!formatDocs.length ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No formats selected</Text>
              <Text style={styles.emptySub}>Go back and select at least one tournament side game, or continue later.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Quick apply</Text>
              <View style={styles.applyBox}>
                <Text style={styles.feeHint}>Optional: apply one entry fee to all selected formats</Text>
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
                  <Text style={styles.feeHint}>per player</Text>
                </View>

                <Pressable
                  onPress={applyFeeToAll}
                  disabled={!isHost || saving}
                  style={({ pressed }) => [styles.applyBtn, pressed && !saving && styles.pressed, (!isHost || saving) && { opacity: 0.7 }]}
                >
                  <Text style={styles.applyBtnText}>Apply to all</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Per format</Text>
              {(formatDocs || []).map(renderFormatCard)}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={saveAllFees}
            disabled={saving || !isHost}
            style={({ pressed }) => [styles.primaryBtn, pressed && !saving && styles.pressed, (saving || !isHost) && { opacity: 0.7 }]}
          >
            <Text style={styles.primaryText}>{saving ? "Saving..." : "Save & Continue to Format Details"}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
