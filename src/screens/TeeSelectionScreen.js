import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { getTeesForCourse } from "../services/tees";
import { loadCourseData } from "../storage/courseData";
import { updateActiveRound } from "../storage/roundState";

export default function TeeSelectionScreen({ navigation, route }) {
  const { course } = route.params;

  const [loading, setLoading] = useState(true);
  const [tees, setTees] = useState([]);
  const [holeMeta, setHoleMeta] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [data, saved] = await Promise.all([getTeesForCourse(course.id), loadCourseData(course.id)]);

      if (!mounted) return;

      const list = Array.isArray(data) ? data : [];
      setTees(list);
      setHoleMeta(saved?.holeMeta || null);
      setSelectedCode(list?.[0]?.code || null);
      setLoading(false);
    })();

    return () => (mounted = false);
  }, [course.id]);

  const selectedTee = useMemo(() => tees.find((t) => t.code === selectedCode), [tees, selectedCode]);

  function openCourseData() {
    navigation.navigate(ROUTES.COURSE_DATA, { course });
  }

  async function onContinue() {
    if (!selectedTee) {
      Alert.alert("Select tees to continue");
      return;
    }

    const scoring = route?.params?.scoring || route?.params?.scoringType || "net";

    // IMPORTANT:
    // Do NOT default playerCount to 4 here.
    // Leave it null/undefined so the Player Setup screen can show a blank input on arrival.
    const playerCount = route?.params?.playerCount ?? null;

    // Persist tee + holeMeta into Active Round (stability for downstream screens)
    const patch = {
      tee: selectedTee,
      holeMeta: holeMeta || null,
      scoring,
      playerCount,
    };

    const next = await updateActiveRound(patch);

    if (__DEV__) {
      console.log("[LegacyGolf] Active round updated on Tee continue:", next);
    }

    navigation.navigate(ROUTES.PLAYER_SETUP, {
      ...(route?.params || {}),
      course,
      tee: selectedTee,
      holeMeta,
      scoring,
      playerCount,
    });
  }

  const right = (
    <Pressable onPress={openCourseData} hitSlop={12} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}>
      <Text style={styles.headerActionText}>Edit</Text>
    </Pressable>
  );

  function renderHeader() {
    return (
      <View>
        <ScreenHeader
          navigation={navigation}
          title="Select Tees"
          subtitle={course?.name || ""}
          right={right}
          fallbackRoute={ROUTES.NEW_ROUND}
        />

        <View style={styles.headerBody}>
          <Pressable onPress={openCourseData} style={({ pressed }) => [styles.editCard, pressed && styles.pressed]}>
            <View style={styles.editLeft}>
              <View style={styles.editIconWrap}>
                <MaterialCommunityIcons name="pencil" size={18} color="rgba(255,255,255,0.85)" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editTitle}>Edit Course Hole Data</Text>
                <Text style={styles.editSub}>Set Par + Stroke Index (for Net scoring)</Text>
              </View>
            </View>

            <View style={styles.chevWrap}>
              <MaterialCommunityIcons name="chevron-right" size={22} color="rgba(255,255,255,0.65)" />
            </View>
          </Pressable>

          {selectedTee ? (
            <View style={styles.selectedSummary}>
              <View style={styles.summaryLeft}>
                <View style={styles.summaryIcon}>
                  <MaterialCommunityIcons name="flag-variant" size={18} color="rgba(255,255,255,0.90)" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>Selected tee</Text>
                  <Text style={styles.summaryTitle} numberOfLines={1}>
                    {selectedTee.name}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryPill}>
                <Text style={styles.summaryPillText}>{selectedTee.yardage} yds</Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  function renderItem({ item }) {
    const active = item.code === selectedCode;

    return (
      <Pressable
        onPress={() => setSelectedCode(item.code)}
        style={({ pressed }) => [styles.teeCard, styles.rowShadow, active && styles.teeCardActive, pressed && styles.pressed]}
      >
        <View style={styles.teeTop}>
          <Text style={styles.teeTitle} numberOfLines={1}>
            {item.name}
          </Text>

          {active ? (
            <View style={styles.selectedPill}>
              <Text style={styles.selectedText}>Selected</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.teeMeta}>
          <View style={styles.kmPill}>
            <Text style={styles.kmText}>{item.yardage} yds</Text>
          </View>
          <Text style={styles.teeSub}>Tap to select</Text>
        </View>
      </Pressable>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading tees…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={tees}
        keyExtractor={(t) => t.code}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={onContinue}
          disabled={!selectedTee}
          style={({ pressed }) => [
            styles.primaryBtn,
            !selectedTee && styles.primaryBtnDisabled,
            pressed && selectedTee && styles.pressed,
          ]}
        >
          <Text style={styles.primaryText}>Continue to Player Set Up</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.colors?.bg || "#0B1220" },

  listContent: { paddingBottom: 132 },

  headerAction: {
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
  headerActionText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  headerBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },

  editCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  editLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  editIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  editTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  editSub: { marginTop: 6, color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  chevWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  selectedSummary: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  summaryLabel: { color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "800" },
  summaryTitle: { marginTop: 4, color: "#fff", fontSize: 14, fontWeight: "900" },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  summaryPillText: { color: "#fff", fontSize: 12, fontWeight: "900", opacity: 0.9 },

  teeCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  teeCardActive: {
    borderColor: "rgba(15,122,74,0.78)",
    backgroundColor: "rgba(15,122,74,0.16)",
  },

  rowShadow: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }),

  teeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  teeTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "900" },

  selectedPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(15,122,74,0.65)",
    backgroundColor: "rgba(15,122,74,0.22)",
  },
  selectedText: { color: "#fff", fontSize: 12, fontWeight: "900" },

  teeMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },

  kmPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  kmText: { color: "#fff", fontSize: 12, fontWeight: "900", opacity: 0.9 },
  teeSub: { color: "#fff", opacity: 0.62, fontSize: 12, fontWeight: "800" },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.colors?.bg || "#0B1220",
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
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.2 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#fff", opacity: 0.72, fontSize: 12, fontWeight: "800" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
