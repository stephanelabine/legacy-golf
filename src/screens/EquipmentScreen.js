import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const PROFILE_KEY = "LEGACY_GOLF_PROFILE_V1";

const EQUIPMENT_CATEGORIES = [
  "Driver",
  "3 Wood",
  "5 Wood",
  "Hybrids",
  "Driving Iron",
  "Irons",
  "Wedges",
  "Putter",
  "Ball",
];

function safeParse(raw) {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function normalizeBag(bag) {
  const arr = Array.isArray(bag) ? bag : [];
  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => ({
      category: String(x.category || "").trim(),
      model: String(x.model || "").trim(),
    }))
    .filter((x) => x.category.length > 0);
}

export default function EquipmentScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState(null);
  const [bag, setBag] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [model, setModel] = useState("");

  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    const nextProfile = parsed || {};
    const nextBag = normalizeBag(nextProfile.equipmentBag);
    setProfile(nextProfile);
    setBag(nextBag);
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const hasAny = bag.length > 0;

  const headerSubtitle = useMemo(() => {
    if (!hasAny) return "Tap a category to add a model.";
    return `${bag.length} item${bag.length === 1 ? "" : "s"} saved`;
  }, [bag.length, hasAny]);

  async function persist(nextBag) {
    const nextProfile = { ...(profile || {}), equipmentBag: nextBag };
    setProfile(nextProfile);
    setBag(nextBag);
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
  }

  function enterCategory(cat) {
    const c = String(cat || "").trim();
    if (!c) return;

    const existingIdx = bag.findIndex((x) => x.category === c);
    if (existingIdx >= 0) {
      setEditingIndex(existingIdx);
      setModel(bag[existingIdx]?.model || "");
    } else {
      setEditingIndex(null);
      setModel("");
    }
    setSelectedCategory(c);
  }

  function onClear() {
    setModel("");
  }

  function onRemoveSelection() {
    Keyboard.dismiss();
    setSelectedCategory(null);
    setEditingIndex(null);
    setModel("");
  }

  async function onSave() {
    const cat = String(selectedCategory || "").trim();
    if (!cat) return;

    const nextItem = { category: cat, model: String(model || "").trim() };
    const nextBag = [...bag];

    const existingIdx = nextBag.findIndex((x) => x.category === cat);
    if (existingIdx >= 0) nextBag[existingIdx] = nextItem;
    else nextBag.push(nextItem);

    await persist(nextBag);
    Keyboard.dismiss();

    setSelectedCategory(null);
    setEditingIndex(null);
    setModel("");
  }

  function onDone() {
    Keyboard.dismiss();
    navigation.goBack();
  }

  function onBottomDonePress() {
    if (keyboardOpen) {
      Keyboard.dismiss();
      return;
    }
    onDone();
  }

  const editorTitle = selectedCategory ? "Edit equipment" : "Add equipment";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topGlowA} pointerEvents="none" />
        <View style={styles.topGlowB} pointerEvents="none" />

        <View style={styles.topRow}>
          <Pressable
            onPress={onDone}
            hitSlop={12}
            style={({ pressed }) => [styles.headerPill, pressed && styles.pressed]}
          >
            <Text style={styles.headerPillText}>Back</Text>
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Equipment</Text>
            <Text style={styles.headerSub}>{headerSubtitle}</Text>
          </View>

          <View style={styles.headerRightSpacer} />
        </View>
      </View>

      <Pressable style={{ flex: 1 }} onPress={() => Keyboard.dismiss()}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: 140 + insets.bottom,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.editorCard}>
            <Text style={styles.editorTitle}>{editorTitle}</Text>

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.grid}>
              {EQUIPMENT_CATEGORIES.map((cat) => {
                const active = cat === selectedCategory;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => enterCategory(cat)}
                    style={({ pressed }) => [
                      styles.catPill,
                      active && styles.catPillActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.catText, active && styles.catTextActive]}>{cat}</Text>
                  </Pressable>
                );
              })}
            </View>

            {selectedCategory ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Model</Text>
                <View style={styles.modelShell}>
                  <TextInput
                    value={model}
                    onChangeText={setModel}
                    placeholder="Ex: Titleist TSR3 10° / T100 / Vokey SM10"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    style={styles.modelInput}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <Pressable
                    onPress={onClear}
                    style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.ghostBtnText}>Clear</Text>
                  </Pressable>

                  <Pressable
                    onPress={onRemoveSelection}
                    style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.dangerBtnText}>Remove</Text>
                  </Pressable>

                  <Pressable
                    onPress={onSave}
                    style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Your Bag</Text>
            <Text style={styles.sectionHint}>Tap an item to edit</Text>
          </View>

          {!hasAny ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="golf" size={22} color="rgba(255,255,255,0.65)" />
              <Text style={styles.emptyTitle}>No equipment saved</Text>
              <Text style={styles.emptyText}>Tap a category above to add your first item.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {bag.map((item, idx) => (
                <Pressable
                  key={`${item.category}-${idx}`}
                  onPress={() => enterCategory(item.category)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.category}
                    </Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {item.model ? item.model : "Add model"}
                    </Text>
                  </View>

                  <View style={styles.rowIcon}>
                    <MaterialCommunityIcons name="pencil" size={16} color="rgba(255,255,255,0.75)" />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: 14 + insets.bottom }]}>
          <Pressable
            onPress={onBottomDonePress}
            style={({ pressed }) => [styles.donePill, pressed && styles.pressed]}
          >
            <Text style={styles.donePillText}>Done</Text>
          </Pressable>
        </View>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const COLORS = {
  bg: "#0B1220",
  green: "#0F7A4A",
};

const styles = StyleSheet.create({
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
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  headerSub: { marginTop: 4, color: "rgba(255,255,255,0.60)", fontSize: 12, fontWeight: "800" },
  headerRightSpacer: { minWidth: 70, height: 38 },

  editorCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  editorTitle: { color: "#fff", fontSize: 16, fontWeight: "900" },
  sectionLabel: { marginTop: 12, color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: "900" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  catPillActive: {
    borderColor: "rgba(46,125,255,0.40)",
    backgroundColor: "rgba(46,125,255,0.14)",
  },
  catText: { color: "rgba(255,255,255,0.78)", fontSize: 12, fontWeight: "900" },
  catTextActive: { color: "#fff" },

  modelShell: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modelInput: { color: "#fff", fontSize: 14, fontWeight: "900", paddingVertical: 6 },

  ghostBtn: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  ghostBtnText: { color: "#fff", fontWeight: "900", fontSize: 14, opacity: 0.9 },

  dangerBtn: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,90,90,0.35)",
    backgroundColor: "rgba(255,90,90,0.12)",
  },
  dangerBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  saveBtn: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.green,
  },
  saveBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  sectionHeaderRow: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  sectionHint: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "800" },

  emptyCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  emptyText: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: "800", textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rowTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  rowValue: { marginTop: 4, color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: "800" },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
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
  donePill: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.green,
    alignSelf: "center",
    width: "78%",
    maxWidth: 360,
  },
  donePillText: { color: "#fff", fontSize: 16, fontWeight: "900" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
