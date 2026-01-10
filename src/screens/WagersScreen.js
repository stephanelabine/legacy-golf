import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommonActions } from "@react-navigation/native";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import { saveWagers, clearWagers } from "../storage/wagers";

function toMoneyNumber(str) {
  const s = String(str || "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanMoneyInput(raw) {
  let s = String(raw || "").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  if (s.startsWith(".")) s = "0" + s;
  if (s.length > 8) s = s.slice(0, 8);
  return s;
}

function moneyLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const asInt = Math.round(v);
  if (Math.abs(v - asInt) < 0.000001) return `$${asInt}`;
  return `$${v.toFixed(2)}`;
}

export default function WagersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const seed = route?.params?.wagers || null;

  const [skinsOn, setSkinsOn] = useState(!!seed?.skins?.enabled);
  const [skinsAmt, setSkinsAmt] = useState(seed?.skins?.amount ? String(seed.skins.amount) : "");

  const [kpsOn, setKpsOn] = useState(!!seed?.kps?.enabled);
  const [kpsAmt, setKpsAmt] = useState(seed?.kps?.amount ? String(seed.kps.amount) : "");

  const [nassauOn, setNassauOn] = useState(!!seed?.nassau?.enabled);
  const [nassauFront, setNassauFront] = useState(seed?.nassau?.front ? String(seed.nassau.front) : "");
  const [nassauBack, setNassauBack] = useState(seed?.nassau?.back ? String(seed.nassau.back) : "");
  const [nassauTotal, setNassauTotal] = useState(seed?.nassau?.total ? String(seed.nassau.total) : "");

  const [perStrokeOn, setPerStrokeOn] = useState(!!seed?.perStroke?.enabled);
  const [perStrokeAmt, setPerStrokeAmt] = useState(seed?.perStroke?.amount ? String(seed.perStroke.amount) : "");

  const [notes, setNotes] = useState(seed?.notes ? String(seed.notes) : "");

  const exposure = useMemo(() => {
    const skins = skinsOn ? toMoneyNumber(skinsAmt) : 0;
    const kps = kpsOn ? toMoneyNumber(kpsAmt) : 0;
    const nas = nassauOn
      ? toMoneyNumber(nassauFront) + toMoneyNumber(nassauBack) + toMoneyNumber(nassauTotal)
      : 0;
    return skins + kps + nas;
  }, [skinsOn, skinsAmt, kpsOn, kpsAmt, nassauOn, nassauFront, nassauBack, nassauTotal]);

  const anyOn = skinsOn || kpsOn || nassauOn || perStrokeOn;

  async function onDone() {
    const payload = {
      enabled: anyOn,
      skins: { enabled: skinsOn, amount: toMoneyNumber(skinsAmt) },
      kps: { enabled: kpsOn, amount: toMoneyNumber(kpsAmt) },
      nassau: {
        enabled: nassauOn,
        front: toMoneyNumber(nassauFront),
        back: toMoneyNumber(nassauBack),
        total: toMoneyNumber(nassauTotal),
      },
      perStroke: { enabled: perStrokeOn, amount: toMoneyNumber(perStrokeAmt) },
      notes: String(notes || "").trim(),
    };

    // Persist (no crashes if storage fails)
    if (payload.enabled) await saveWagers(payload);
    else await clearWagers();

    // 1) Return to previous screen (GameSetup)
    if (navigation.canGoBack?.()) navigation.goBack();

    // 2) Merge the payload into GameSetup params (reliable)
    requestAnimationFrame(() => {
      navigation.dispatch(
        CommonActions.navigate({
          name: ROUTES.GAME_SETUP,
          params: { wagers: payload },
          merge: true,
        })
      );
    });
  }

  function onBack() {
    navigation.goBack();
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerWrap}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.headerRow}>
          <Pressable onPress={onBack} hitSlop={12} style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}>
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Wagers</Text>
            <Text style={styles.headerSub}>Choose what you want to play for</Text>
          </View>

          <View style={{ minWidth: 70, height: 38 }} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Summary</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Estimated exposure</Text>
              <Text style={styles.summaryVal}>{moneyLabel(exposure)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Per-stroke</Text>
              <Text style={styles.summaryVal}>
                {perStrokeOn ? `${moneyLabel(toMoneyNumber(perStrokeAmt))} / stroke` : "OFF"}
              </Text>
            </View>

            <Text style={styles.summaryHint}>
              Exposure is a simple setup total. Live wins/losses come later when payouts and rules are built.
            </Text>
          </View>

          <View style={styles.card}>
            <Pressable onPress={() => setSkinsOn((v) => !v)} style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Skins</Text>
                <Text style={styles.toggleSub}>Win a hole outright</Text>
              </View>

              <View style={[styles.switchOuter, skinsOn && styles.switchOuterOn]}>
                <View style={[styles.switchKnob, skinsOn && styles.switchKnobOn]} />
              </View>
            </Pressable>

            {skinsOn ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <TextInput
                  value={skinsAmt}
                  onChangeText={(t) => setSkinsAmt(cleanMoneyInput(t))}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  keyboardType="decimal-pad"
                  style={styles.moneyInput}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Pressable onPress={() => setKpsOn((v) => !v)} style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>KPs (Closest to the Pin)</Text>
                <Text style={styles.toggleSub}>Closest on selected par 3s</Text>
              </View>

              <View style={[styles.switchOuter, kpsOn && styles.switchOuterOn]}>
                <View style={[styles.switchKnob, kpsOn && styles.switchKnobOn]} />
              </View>
            </Pressable>

            {kpsOn ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <TextInput
                  value={kpsAmt}
                  onChangeText={(t) => setKpsAmt(cleanMoneyInput(t))}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  keyboardType="decimal-pad"
                  style={styles.moneyInput}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Pressable onPress={() => setNassauOn((v) => !v)} style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Nassau</Text>
                <Text style={styles.toggleSub}>Front 9, Back 9, Total</Text>
              </View>

              <View style={[styles.switchOuter, nassauOn && styles.switchOuterOn]}>
                <View style={[styles.switchKnob, nassauOn && styles.switchKnobOn]} />
              </View>
            </Pressable>

            {nassauOn ? (
              <View style={{ marginTop: 12, gap: 10 }}>
                <View style={styles.threeCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Front</Text>
                    <TextInput
                      value={nassauFront}
                      onChangeText={(t) => setNassauFront(cleanMoneyInput(t))}
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="decimal-pad"
                      style={styles.moneyInput}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Back</Text>
                    <TextInput
                      value={nassauBack}
                      onChangeText={(t) => setNassauBack(cleanMoneyInput(t))}
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="decimal-pad"
                      style={styles.moneyInput}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabel}>Total</Text>
                    <TextInput
                      value={nassauTotal}
                      onChangeText={(t) => setNassauTotal(cleanMoneyInput(t))}
                      placeholder="0.00"
                      placeholderTextColor="rgba(255,255,255,0.35)"
                      keyboardType="decimal-pad"
                      style={styles.moneyInput}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Pressable onPress={() => setPerStrokeOn((v) => !v)} style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Per Stroke</Text>
                <Text style={styles.toggleSub}>Amount per stroke difference</Text>
              </View>

              <View style={[styles.switchOuter, perStrokeOn && styles.switchOuterOn]}>
                <View style={[styles.switchKnob, perStrokeOn && styles.switchKnobOn]} />
              </View>
            </Pressable>

            {perStrokeOn ? (
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Amount</Text>
                <TextInput
                  value={perStrokeAmt}
                  onChangeText={(t) => setPerStrokeAmt(cleanMoneyInput(t))}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  keyboardType="decimal-pad"
                  style={styles.moneyInput}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the group should remember…"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.notes}
              multiline
            />
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: 14 + insets.bottom }]}>
          <Pressable onPress={onDone} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  topGlowA: {
    position: "absolute",
    top: -90,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(46,125,255,0.22)",
    opacity: 0.35,
  },
  topGlowB: {
    position: "absolute",
    top: -120,
    right: -70,
    width: 340,
    height: 340,
    borderRadius: 340,
    backgroundColor: "rgba(255,255,255,0.10)",
    opacity: 0.18,
  },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10 },

  headerPill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  headerPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 0.6 },
  headerSub: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },

  summaryCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  summaryLabel: { color: "#fff", fontWeight: "900", fontSize: 13, opacity: 0.9, letterSpacing: 0.2 },
  summaryRow: { marginTop: 12, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  summaryKey: { color: "rgba(255,255,255,0.65)", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
  summaryVal: { color: "#fff", fontWeight: "900", fontSize: 16 },
  summaryHint: { marginTop: 12, color: "rgba(255,255,255,0.58)", fontWeight: "700", fontSize: 12, lineHeight: 17 },

  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    marginBottom: 12,
  },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "900", marginBottom: 10 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  toggleTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  toggleSub: { marginTop: 6, color: "rgba(255,255,255,0.62)", fontSize: 12, fontWeight: "800", lineHeight: 17 },

  switchOuter: {
    width: 56,
    height: 34,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
  },
  switchOuterOn: { borderColor: "rgba(46,125,255,0.55)", backgroundColor: "rgba(46,125,255,0.18)" },
  switchKnob: { width: 28, height: 28, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.70)", transform: [{ translateX: 0 }] },
  switchKnobOn: { backgroundColor: "rgba(255,255,255,0.92)", transform: [{ translateX: 20 }] },

  fieldRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  fieldLabel: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 12, letterSpacing: 0.4 },
  moneyInput: {
    width: 120,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },

  threeCol: { flexDirection: "row", gap: 10 },
  smallLabel: { color: "rgba(255,255,255,0.62)", fontWeight: "900", fontSize: 12, marginBottom: 6, letterSpacing: 0.3 },

  notes: {
    minHeight: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "rgba(11,18,32,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  primaryBtn: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
