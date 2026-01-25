// src/screens/TournamentFormatsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Platform,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

const SIDE_GAME_TYPES = [
  { id: "kp", label: "KP (Closest to Pin)" },
  { id: "kp_second_shot", label: "2nd Shot KP" },
  { id: "long_drive", label: "Long Drive" },
  { id: "deuce_pot", label: "Deuce Pot" },
  { id: "putting_contest", label: "Putting Contest (Total Putts)" },
  { id: "skins", label: "Skins (Tournament)" },
];

const GAME_META = {
  kp: {
    title: "KP",
    subtitle: "Pick label + holes + cost to enter.",
    labelOptions: ["Men's KP", "Women's KP", "Mixed KP", "Custom..."],
    holesMode: "multi",
    scopeChoices: ["All 18", "Front 9", "Back 9", "Select holes..."],
  },
  kp_second_shot: {
    title: "2nd Shot KP",
    subtitle: "Pick label + holes + cost to enter.",
    labelOptions: [
      "Men's 2nd Shot KP",
      "Women's 2nd Shot KP",
      "Mixed 2nd Shot KP",
      "Custom...",
    ],
    holesMode: "multi",
    scopeChoices: ["All 18", "Front 9", "Back 9", "Select holes..."],
  },
  long_drive: {
    title: "Long Drive",
    subtitle: "Pick label + holes + cost to enter.",
    labelOptions: [
      "Men's Long Drive",
      "Women's Long Drive",
      "Mixed Long Drive",
      "Custom...",
    ],
    // CHANGE: long drive is now multi-select holes
    holesMode: "multi",
    scopeChoices: ["Select holes..."],
  },
  deuce_pot: {
    title: "Deuce Pot",
    subtitle: "Pick label + scope + cost to enter.",
    labelOptions: ["Men's Deuce Pot", "Women's Deuce Pot", "Mixed Deuce Pot", "Custom..."],
    holesMode: "scope",
    scopeChoices: ["All 18", "Front 9", "Back 9"],
  },
  skins: {
    title: "Skins",
    subtitle: "Pick label + scope (or select holes) + cost to enter.",
    labelOptions: ["Men's Skins", "Women's Skins", "All Skins", "Custom..."],
    holesMode: "scope_or_custom",
    scopeChoices: ["All 18", "Front 9", "Back 9", "Select holes..."],
  },
  putting_contest: {
    title: "Total Putts",
    subtitle: "We’ll implement later.",
    labelOptions: ["Total Putts", "Custom..."],
    holesMode: "none",
    scopeChoices: ["All 18"],
  },
};

function holesLabelFromMode(holesMode, holes) {
  const mode = String(holesMode || "all");
  const arr = Array.isArray(holes) ? holes : [];
  if (mode === "front9") return "Front 9";
  if (mode === "back9") return "Back 9";
  if (mode === "single" && arr[0]) return `Hole ${arr[0]}`;
  if (mode === "custom" && arr.length) return `Holes ${arr.join(", ")}`;
  return "All 18";
}

function normalizeHoleArray(arr) {
  const uniq = Array.from(
    new Set(
      (Array.isArray(arr) ? arr : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 36)
    )
  );
  uniq.sort((a, b) => a - b);
  return uniq;
}

function ModalShell({ visible, onClose, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]}
          onPress={onClose}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}
          pointerEvents="box-none"
        >
          <View style={{ width: "100%" }} pointerEvents="auto">
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function TournamentFormatsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [loadingT, setLoadingT] = useState(true);

  const [formats, setFormats] = useState([]);
  const [loadingF, setLoadingF] = useState(true);

  const [chooseOpen, setChooseOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [editorTypeId, setEditorTypeId] = useState(null);

  // editor fields
  const [label, setLabel] = useState("");
  const [customLabelText, setCustomLabelText] = useState("");

  const [holesMode, setHolesMode] = useState("all"); // all/front9/back9/single/custom
  const [selectedHoles, setSelectedHoles] = useState([]);
  const [selectedHole, setSelectedHole] = useState(null); // kept for legacy/single modes
  const [buyIn, setBuyIn] = useState("");

  // in-editor overlay sheet (no nested Modals)
  const [sheet, setSheet] = useState(null); // null | "label" | "customLabel" | "scope" | "holes"

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);
  const u = auth.currentUser;

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const tref = doc(db, "tournaments", tournamentId);
    const unsubT = onSnapshot(
      tref,
      (snap) => {
        setT(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoadingT(false);
      },
      (err) => {
        setLoadingT(false);
        Alert.alert("Tournament error", err?.message || "Could not load tournament.");
      }
    );

    const fref = collection(db, "tournaments", tournamentId, "formats");
    const unsubF = onSnapshot(
      fref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        rows.sort((a, b) => {
          const as = Number(a?.createdAt?.seconds || 0);
          const bs = Number(b?.createdAt?.seconds || 0);
          if (as !== bs) return as - bs;
          return String(a?.id || "").localeCompare(String(b?.id || ""));
        });
        setFormats(rows);
        setLoadingF(false);
      },
      (err) => {
        setLoadingF(false);
        Alert.alert("Formats error", err?.message || "Could not load formats.");
      }
    );

    return () => {
      unsubT();
      unsubF();
    };
  }, [tournamentId, navigation]);

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const editorMeta = useMemo(() => {
    if (!editorTypeId) return null;
    return GAME_META[editorTypeId] || null;
  }, [editorTypeId]);

  const count = formats.length;

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.12)" : "rgba(29,53,87,0.12)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    const dangerBg = "rgba(231,76,60,0.14)";
    const dangerBorder = "rgba(231,76,60,0.28)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 150 },

      hero: {
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
      },
      heroTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 6, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      card: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        marginBottom: 12,
        overflow: "hidden",
      },

      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      rowTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
      rowSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      pill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      actions: { marginTop: 12, flexDirection: "row", gap: 10, alignItems: "center" },
      actionBtn: {
        flex: 1,
        height: 46,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      actionText: { color: theme.text, fontSize: 13, fontWeight: "900" },
      actionBtnDanger: { backgroundColor: dangerBg, borderColor: dangerBorder },

      sectionTitle: {
        marginTop: 12,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
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

      modalCard: {
        width: "100%",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
        overflow: "hidden",
      },

      modalHeader: { padding: 16, paddingBottom: 10 },
      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      modalSub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      modalBody: { paddingHorizontal: 16, paddingBottom: 10 },

      chooserItem: {
        marginTop: 10,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      chooserLabel: { color: theme.text, fontSize: 14, fontWeight: "900" },
      chooserHint: { marginTop: 4, color: theme.text, opacity: 0.65, fontSize: 12, fontWeight: "700" },

      fieldRow: {
        marginTop: 12,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      },
      fieldLeft: { flex: 1 },
      fieldLabel: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.75, letterSpacing: 1.0, textTransform: "uppercase" },
      fieldValue: { marginTop: 6, color: theme.text, fontSize: 15, fontWeight: "900" },
      chevron: { color: theme.text, opacity: 0.55, fontSize: 18, fontWeight: "900" },

      input: {
        marginTop: 12,
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
      helper: { marginTop: 8, color: theme.text, opacity: 0.6, fontSize: 12, fontWeight: "700" },

      modalFooter: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(16, (insets?.bottom || 0) + 10),
        borderTopWidth: 1,
        borderTopColor: theme.divider,
        backgroundColor: theme.bg,
      },
      btnRow: { flexDirection: "row", gap: 10 },
      btn: { flex: 1, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
      btnCancel: { backgroundColor: softBg, borderColor: softBorder },
      btnSave: { backgroundColor: blue, borderColor: blue },
      btnText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      btnTextSave: { color: "#fff" },

      holesGrid: { paddingHorizontal: 16, paddingBottom: 8 },
      holeChip: {
        height: 44,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      holeChipActive: { borderColor: blue, backgroundColor: blueBg },
      holeChipText: { color: theme.text, fontSize: 14, fontWeight: "900" },

      sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
      sheetCard: {
        marginTop: 16,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
        overflow: "hidden",
      },
    });
  }, [theme, isDark, footerPad, insets]);

  async function recalcReady(nextCount) {
    if (!tournamentId) return;
    const c = Number.isFinite(nextCount) ? nextCount : formats.length;
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        formatsReady: c > 0,
        formatsCount: c,
        updatedAt: serverTimestamp(),
      });
    } catch {}
  }

  function openChoose() {
    if (!isHost) {
      Alert.alert("Host only", "Only the host can add or edit formats.");
      return;
    }
    setChooseOpen(true);
  }

  function resetEditor(typeId) {
    setEditorTypeId(typeId);
    setLabel("");
    setCustomLabelText("");
    setBuyIn("");
    setSheet(null);

    // CHANGE: Long Drive defaults to custom multi-hole selection
    if (typeId === "long_drive") {
      setHolesMode("custom");
      setSelectedHoles([]);
      setSelectedHole(null);
      return;
    }

    const meta = GAME_META[typeId] || GAME_META.kp;
    if (meta.holesMode === "single") {
      setHolesMode("single");
      setSelectedHole(null);
      setSelectedHoles([]);
    } else {
      setHolesMode("all");
      setSelectedHole(null);
      setSelectedHoles([]);
    }
  }

  function openEditor(typeId) {
    if (typeId === "putting_contest") {
      Alert.alert("Coming soon", "We’ll implement Total Putts later.");
      return;
    }
    resetEditor(typeId);
    setChooseOpen(false);
    setEditorOpen(true);
  }

  function currentLabelText() {
    if (!label) return "Select (optional)";
    return label;
  }

  function currentHolesText() {
    const meta = editorMeta;
    if (!meta) return "Select";

    if (meta.holesMode === "single") {
      return selectedHole ? `Hole ${selectedHole}` : "Select hole";
    }

    if (holesMode === "custom") {
      const arr = normalizeHoleArray(selectedHoles);
      return arr.length ? `Holes ${arr.join(", ")}` : "Select holes";
    }

    return holesLabelFromMode(holesMode, []);
  }

  function openLabelPicker() {
    setSheet("label");
  }

  function openHolesOrScopePicker() {
    if (!editorMeta) return;
    const type = editorTypeId;

    // CHANGE: long drive now uses the holes picker (multi)
    if (type === "long_drive") {
      setHolesMode("custom");
      setSheet("holes");
      return;
    }

    if (type === "long_drive") setSheet("holes");
    else setSheet("scope");
  }

  function pickLabel(option) {
    if (option === "Custom...") {
      setCustomLabelText(label || "");
      setSheet("customLabel");
      return;
    }
    setLabel(option);
    setSheet(null);
  }

  function saveCustomLabel() {
    const cleaned = String(customLabelText || "").trim();
    setLabel(cleaned);
    setSheet(null);
  }

  function applyScopeChoice(choice) {
    if (choice === "All 18") {
      setHolesMode("all");
      setSelectedHoles([]);
      setSelectedHole(null);
      setSheet(null);
      return;
    }
    if (choice === "Front 9") {
      setHolesMode("front9");
      setSelectedHoles([]);
      setSelectedHole(null);
      setSheet(null);
      return;
    }
    if (choice === "Back 9") {
      setHolesMode("back9");
      setSelectedHoles([]);
      setSelectedHole(null);
      setSheet(null);
      return;
    }
    if (choice === "Select holes...") {
      setHolesMode("custom");
      setSheet("holes");
      return;
    }
    setSheet(null);
  }

  function toggleMultiHole(h) {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 1 || n > 36) return;
    const cur = normalizeHoleArray(selectedHoles);
    const exists = cur.includes(n);
    const next = exists ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b);
    setSelectedHoles(next);
  }

  function pickSingleHole(h) {
    const n = Number(h);
    if (!Number.isFinite(n) || n < 1 || n > 36) return;
    setSelectedHole(n);
  }

  function validateEditor() {
    if (!editorTypeId) return { ok: false, msg: "Missing format type." };

    // CHANGE: Long Drive now requires at least 1 selected hole (multi)
    if (editorTypeId === "long_drive") {
      const arr = normalizeHoleArray(selectedHoles);
      if (!arr.length) return { ok: false, msg: "Please select at least one Long Drive hole." };
      return { ok: true };
    }

    if (editorTypeId === "deuce_pot") {
      if (!["all", "front9", "back9"].includes(holesMode)) {
        return { ok: false, msg: "Please select All 18, Front 9, or Back 9." };
      }
      return { ok: true };
    }

    if (editorTypeId === "skins") {
      if (holesMode === "custom") {
        const arr = normalizeHoleArray(selectedHoles);
        if (!arr.length) return { ok: false, msg: "Please select at least one hole for Skins." };
        return { ok: true };
      }
      if (!["all", "front9", "back9"].includes(holesMode)) {
        return { ok: false, msg: "Please select All 18, Front 9, Back 9, or Select holes." };
      }
      return { ok: true };
    }

    // KP types
    if (holesMode === "custom") {
      const arr = normalizeHoleArray(selectedHoles);
      if (!arr.length) return { ok: false, msg: "Please select at least one hole." };
      return { ok: true };
    }

    if (!["all", "front9", "back9"].includes(holesMode)) {
      return { ok: false, msg: "Please select All 18, Front 9, Back 9, or Select holes." };
    }

    return { ok: true };
  }

  async function createFormat() {
    if (!tournamentId || !isHost) return;
    if (!editorTypeId) return;

    const v = validateEditor();
    if (!v.ok) {
      Alert.alert("Missing info", v.msg || "Please complete the format.");
      return;
    }

    const type = String(editorTypeId || "").trim();
    const typeMeta = SIDE_GAME_TYPES.find((x) => x.id === type);
    const cleanedLabel = String(label || "").trim() || String(typeMeta?.label || "Side Game");

    const buy = String(buyIn || "").trim();
    const buyNum = buy ? Number(buy) : null;
    if (buy && !Number.isFinite(buyNum)) {
      Alert.alert("Cost invalid", "Enter a number (e.g. 20) or leave blank.");
      return;
    }

    let outMode = "all";
    let outHoles = [];

    // CHANGE: long_drive now saves as custom holes list
    if (type === "long_drive") {
      outMode = "custom";
      outHoles = normalizeHoleArray(selectedHoles);
    } else if (type === "deuce_pot") {
      outMode = holesMode;
      outHoles = [];
    } else if (type === "skins") {
      if (holesMode === "custom") {
        outMode = "custom";
        outHoles = normalizeHoleArray(selectedHoles);
      } else {
        outMode = holesMode;
        outHoles = [];
      }
    } else {
      // KP
      if (holesMode === "custom") {
        outMode = "custom";
        outHoles = normalizeHoleArray(selectedHoles);
      } else {
        outMode = holesMode;
        outHoles = [];
      }
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "tournaments", tournamentId, "formats"), {
        type,
        label: cleanedLabel,
        enabled: true,
        holesMode: outMode,
        holes: outHoles,
        buyIn: buyNum,
        payoutMode: "winner_takes",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setEditorOpen(false);
      setEditorTypeId(null);
      setSheet(null);
      Keyboard.dismiss();

      setTimeout(() => recalcReady(formats.length + 1), 250);
    } catch (e) {
      Alert.alert("Create failed", e?.message || "Could not add format.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(item) {
    if (!isHost || !tournamentId) return;
    const id = String(item?.id || "");
    if (!id) return;

    const next = !item?.enabled;
    try {
      await updateDoc(doc(db, "tournaments", tournamentId, "formats", id), {
        enabled: next,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      Alert.alert("Update failed", e?.message || "Could not update format.");
    }
  }

  async function deleteFormat(item) {
    if (!isHost || !tournamentId) return;
    const id = String(item?.id || "");
    if (!id) return;

    Alert.alert("Delete format?", "This removes it from the tournament.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "tournaments", tournamentId, "formats", id));
            setTimeout(() => recalcReady(Math.max(0, formats.length - 1)), 250);
          } catch (e) {
            Alert.alert("Delete failed", e?.message || "Could not delete format.");
          }
        },
      },
    ]);
  }

  function renderHoleChip({ item }) {
    const n = Number(item);
    const meta = editorMeta;

    let active = false;
    if (meta?.holesMode === "single") active = Number(selectedHole) === n;
    else active = normalizeHoleArray(selectedHoles).includes(n);

    return (
      <Pressable
        onPress={() => {
          if (meta?.holesMode === "single") pickSingleHole(n);
          else toggleMultiHole(n);
        }}
        style={({ pressed }) => [
          styles.holeChip,
          active && styles.holeChipActive,
          pressed && styles.pressed,
          { marginBottom: 10, flex: 1 },
        ]}
      >
        <Text style={styles.holeChipText}>{n}</Text>
      </Pressable>
    );
  }

  function renderEditorSheet() {
    if (!sheet) return null;

    const meta = editorMeta;
    const labelOptions = meta?.labelOptions || ["Custom..."];
    const scopeChoices = meta?.scopeChoices || ["All 18", "Front 9", "Back 9", "Select holes..."];
    const isSingle = meta?.holesMode === "single";

    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={styles.sheetOverlay} onPress={() => setSheet(null)} />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }} pointerEvents="box-none">
          <View style={styles.sheetCard} pointerEvents="auto">
            {sheet === "label" ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Choose label</Text>
                  <Text style={styles.modalSub}>Optional (helps for Men/Women/Mixed).</Text>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                >
                  {labelOptions.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => pickLabel(opt)}
                      style={({ pressed }) => [styles.chooserItem, pressed && styles.pressed]}
                    >
                      <Text style={styles.chooserLabel}>{opt}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.modalFooter}>
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setSheet(null)}
                      style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                    >
                      <Text style={styles.btnText}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {sheet === "customLabel" ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Custom label</Text>
                  <Text style={styles.modalSub}>Type your own label (optional).</Text>
                </View>
                <View style={styles.modalBody}>
                  <TextInput
                    value={customLabelText}
                    onChangeText={setCustomLabelText}
                    placeholder="Type label..."
                    placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                    style={styles.input}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                  />
                </View>
                <View style={styles.modalFooter}>
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setSheet(null)}
                      style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                    >
                      <Text style={styles.btnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={saveCustomLabel}
                      style={({ pressed }) => [styles.btn, styles.btnSave, pressed && styles.pressed]}
                    >
                      <Text style={[styles.btnText, styles.btnTextSave]}>Finish</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {sheet === "scope" ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Choose holes</Text>
                  <Text style={styles.modalSub}>Select All/Front/Back, or choose specific holes.</Text>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                >
                  {scopeChoices.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => applyScopeChoice(c)}
                      style={({ pressed }) => [styles.chooserItem, pressed && styles.pressed]}
                    >
                      <Text style={styles.chooserLabel}>{c}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.modalFooter}>
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setSheet(null)}
                      style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                    >
                      <Text style={styles.btnText}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}

            {sheet === "holes" ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{isSingle ? "Pick a hole" : "Select holes"}</Text>
                  <Text style={styles.modalSub}>
                    {isSingle
                      ? "Tap one hole. It will stay highlighted."
                      : "Tap holes to toggle. Selected holes stay highlighted."}
                  </Text>
                </View>

                <View style={styles.holesGrid}>
                  <FlatList
                    data={Array.from({ length: 18 }, (_, i) => i + 1)}
                    keyExtractor={(x) => String(x)}
                    numColumns={6}
                    columnWrapperStyle={{ gap: 10 }}
                    contentContainerStyle={{ gap: 10 }}
                    renderItem={renderHoleChip}
                    scrollEnabled={false}
                  />
                </View>

                <View style={styles.modalFooter}>
                  <View style={styles.btnRow}>
                    <Pressable
                      onPress={() => setSheet(null)}
                      style={({ pressed }) => [styles.btn, styles.btnSave, pressed && styles.pressed]}
                    >
                      <Text style={[styles.btnText, styles.btnTextSave]}>Done</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        navigation={navigation}
        title="Games/Formats"
        subtitle="Add tournament side games with a premium picker-based setup."
      />

      <FlatList
        data={[
          { _type: "hero", key: "hero" },
          { _type: "section", key: "section" },
          ...formats.map((f) => ({ _type: "format", key: `f:${f.id}`, ...f })),
          { _type: "end", key: "end" },
        ]}
        keyExtractor={(x) => x.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item._type === "hero") {
            return (
              <View style={styles.hero}>
                <Text style={styles.heroTitle}>{loadingT ? "Loading..." : `Formats · ${count}`}</Text>
                <Text style={styles.heroSub}>
                  Host-defined tournament games. Player opt-in + who-owes-what summary comes next.
                </Text>
              </View>
            );
          }

          if (item._type === "section") return <Text style={styles.sectionTitle}>Tournament Side Games</Text>;

          if (item._type === "end") {
            if (loadingF) return null;
            if (!formats.length) {
              return (
                <View style={styles.card}>
                  <Text style={styles.rowTitle}>No formats yet</Text>
                  <Text style={styles.rowSub}>Tap Add Format to include KP’s, long drive, deuce pot, skins, etc.</Text>
                </View>
              );
            }
            return null;
          }

          if (item._type !== "format") return null;

          const typeMeta = SIDE_GAME_TYPES.find((x) => x.id === item.type);
          const title = String(item.label || typeMeta?.label || "Side Game");
          const enabled = !!item.enabled;

          return (
            <View style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{title}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{enabled ? "ON" : "OFF"}</Text>
                </View>
              </View>

              <Text style={styles.rowSub}>
                {typeMeta?.label ? `${typeMeta.label} · ` : ""}
                {`Holes: ${holesLabelFromMode(item.holesMode, item.holes)}`}
                {Number.isFinite(item.buyIn) ? ` · Cost: $${item.buyIn}` : ""}
              </Text>

              {isHost ? (
                <View style={styles.actions}>
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={[styles.actionText, { opacity: 0.9 }]}>Enabled</Text>
                    <Switch value={enabled} onValueChange={() => toggleEnabled(item)} />
                  </View>

                  <Pressable
                    onPress={() => deleteFormat(item)}
                    style={({ pressed }) => [styles.actionBtn, styles.actionBtnDanger, pressed && styles.pressed]}
                  >
                    <Text style={styles.actionText}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={openChoose}
          disabled={!isHost}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed, !isHost && { opacity: 0.6 }]}
        >
          <Text style={styles.primaryText}>{!isHost ? "Host Only" : "Add Format"}</Text>
        </Pressable>

        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
      </View>

      {/* Choose Format Modal */}
      <ModalShell visible={chooseOpen} onClose={() => setChooseOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose a format</Text>
              <Text style={styles.modalSub}>Tap a game to configure it.</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {SIDE_GAME_TYPES.map((x) => (
                <Pressable
                  key={x.id}
                  onPress={() => openEditor(x.id)}
                  style={({ pressed }) => [styles.chooserItem, pressed && styles.pressed]}
                >
                  <Text style={styles.chooserLabel}>{x.label}</Text>
                  <Text style={styles.chooserHint}>{GAME_META[x.id]?.subtitle || "Configure this game"}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => setChooseOpen(false)}
                  style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                >
                  <Text style={styles.btnText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </ModalShell>

      {/* Editor Modal */}
      <ModalShell
        visible={editorOpen}
        onClose={() => {
          Keyboard.dismiss();
          setSheet(null);
          setEditorOpen(false);
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editorMeta ? `Add ${editorMeta.title}` : "Add Format"}</Text>
              <Text style={styles.modalSub}>{editorMeta?.subtitle || "Configure this format."}</Text>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}>
              <View style={styles.modalBody}>
                <Pressable onPress={openLabelPicker} style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}>
                  <View style={styles.fieldLeft}>
                    <Text style={styles.fieldLabel}>Label (optional)</Text>
                    <Text style={styles.fieldValue}>{currentLabelText()}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable onPress={openHolesOrScopePicker} style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}>
                  <View style={styles.fieldLeft}>
                    <Text style={styles.fieldLabel}>
                      {editorTypeId === "deuce_pot" ? "Scope" : "Holes"}
                    </Text>
                    <Text style={styles.fieldValue}>{currentHolesText()}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <TextInput
                  value={buyIn}
                  onChangeText={setBuyIn}
                  placeholder="Cost to enter (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                <Text style={styles.helper}>Players opt-in/out + who-owes-what summary will come next.</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setSheet(null);
                    setEditorOpen(false);
                  }}
                  style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]}
                  disabled={saving}
                >
                  <Text style={styles.btnText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={createFormat}
                  style={({ pressed }) => [styles.btn, styles.btnSave, pressed && styles.pressed]}
                  disabled={saving}
                >
                  <Text style={[styles.btnText, styles.btnTextSave]}>{saving ? "Saving..." : "Finish"}</Text>
                </Pressable>
              </View>
            </View>

            {renderEditorSheet()}
          </View>
        </KeyboardAvoidingView>
      </ModalShell>
    </View>
  );
}
