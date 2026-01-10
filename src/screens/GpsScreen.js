import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MapView from "react-native-maps";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";

export default function GPSScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const initialHole = typeof route?.params?.hole === "number" ? route.params.hole : 1;
  const [hole, setHole] = useState(Math.min(18, Math.max(1, Math.round(initialHole))));
  const [isSatellite, setIsSatellite] = useState(false);

  const par = route?.params?.par ?? 4;
  const si = route?.params?.si ?? 10;

  const yardages = useMemo(() => {
    const y = route?.params?.yardages;
    if (y && typeof y === "object") return y;
    return { front: 145, middle: 158, back: 172 };
  }, [route?.params?.yardages]);

  const region = useMemo(() => {
    const lng = typeof route?.params?.centerLng === "number" ? route.params.centerLng : -122.6609;
    const lat = typeof route?.params?.centerLat === "number" ? route.params.centerLat : 49.1044;

    return {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }, [route?.params?.centerLng, route?.params?.centerLat]);

  const goPrev = () => setHole((h) => Math.max(1, h - 1));
  const goNext = () => setHole((h) => Math.min(18, h + 1));

  function openScore() {
    // Pass through whatever round context exists + current hole.
    navigation.navigate(ROUTES.SCORE_ENTRY, {
      ...(route?.params || {}),
      hole,
    });
  }

  const right = (
    <Pressable
      onPress={() => setIsSatellite((s) => !s)}
      hitSlop={12}
      style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
    >
      <Text style={styles.headerActionText}>{isSatellite ? "Map" : "Sat"}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <MapView
        style={styles.map}
        initialRegion={region}
        mapType={isSatellite ? "satellite" : "standard"}
        showsUserLocation
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
      />

      <View pointerEvents="box-none" style={styles.overlay}>
        <ScreenHeader
          navigation={navigation}
          title={`Hole ${hole}`}
          subtitle={`Par ${par} • SI ${si}`}
          right={right}
        />

        {/* Right yardage capsule */}
        <View pointerEvents="none" style={[styles.yardWrap, { top: insets.top + 92 }]}>
          <BlurView intensity={28} tint="dark" style={styles.yardBlur}>
            <View style={styles.yardTint} />
            <View style={styles.yardInner}>
              {[
                ["FRONT", yardages.front],
                ["MID", yardages.middle],
                ["BACK", yardages.back],
              ].map(([label, val]) => (
                <View key={label} style={styles.yBubble}>
                  <Text style={styles.yLabel}>{label}</Text>
                  <Text style={styles.yValue}>{val}</Text>
                  <Text style={styles.yUnit}>yd</Text>
                </View>
              ))}
            </View>
          </BlurView>
        </View>

        {/* Bottom dock */}
        <View style={[styles.dockWrap, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
          <BlurView intensity={32} tint="dark" style={styles.dockBlur}>
            <View style={styles.dockTint} />

            <View style={styles.dockRow}>
              <Pressable onPress={goPrev} style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}>
                <Text style={styles.squareIcon}>‹</Text>
              </Pressable>

              {/* This is now clickable */}
              <Pressable onPress={openScore} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
                <Text style={styles.primaryTitle}>GPS ACTIVE</Text>
                <Text style={styles.primarySub}>Tap to enter score • Hole {hole}</Text>
              </Pressable>

              <Pressable onPress={goNext} style={({ pressed }) => [styles.squareBtn, pressed && styles.pressed]}>
                <Text style={styles.squareIcon}>›</Text>
              </Pressable>
            </View>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  map: { flex: 1 },

  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, elevation: 999 },

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

  yardWrap: { position: "absolute", right: 14, zIndex: 999, elevation: 999 },
  yardBlur: {
    width: 104,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  yardTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 18, 22, 0.38)" },
  yardInner: { padding: 10, gap: 8 },

  yBubble: {
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  yLabel: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  yValue: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 4 },
  yUnit: { color: "rgba(255,255,255,0.60)", fontSize: 10, fontWeight: "900", marginTop: 2 },

  dockWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    zIndex: 999,
    elevation: 999,
  },
  dockBlur: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  dockTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15, 18, 22, 0.38)" },
  dockRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12 },

  squareBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  squareIcon: { color: "#fff", fontSize: 28, lineHeight: 28, marginTop: -1 },

  primaryBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: theme?.colors?.primary || "#2E7DFF",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryTitle: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.6 },
  primarySub: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 2, letterSpacing: 0.2, fontWeight: "800" },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
