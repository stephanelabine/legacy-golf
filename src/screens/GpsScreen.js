import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ROUTES from "../navigation/routes";

export default function GPSScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

  const initialHole =
    typeof route?.params?.hole === "number" ? route.params.hole : 1;

  const [hole, setHole] = useState(
    Math.min(18, Math.max(1, Math.round(initialHole)))
  );

  const [isSatellite, setIsSatellite] = useState(false);

  const cameraCenter = useMemo(() => {
    const lng =
      typeof route?.params?.centerLng === "number"
        ? route.params.centerLng
        : -122.6609;
    const lat =
      typeof route?.params?.centerLat === "number"
        ? route.params.centerLat
        : 49.1044;
    return [lng, lat];
  }, [route?.params?.centerLng, route?.params?.centerLat]);

  const styleURL = isSatellite
    ? MapboxGL.StyleURL.SatelliteStreet
    : MapboxGL.StyleURL.Street;

  const goPrev = () => setHole((h) => Math.max(1, h - 1));
  const goNext = () => setHole((h) => Math.min(18, h + 1));

  const openScore = () => {
    navigation.navigate(ROUTES.SCORE_ENTRY, { hole });
  };

  return (
    <View style={styles.root}>
      <MapboxGL.MapView
        style={styles.map}
        styleURL={styleURL}
        logoEnabled
        attributionEnabled={false}
        compassEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <MapboxGL.Camera
          zoomLevel={15}
          centerCoordinate={cameraCenter}
          animationMode="none"
        />
        <MapboxGL.UserLocation visible />
      </MapboxGL.MapView>

      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={[styles.header, { top: insets.top + 10 }]}>
          <Text style={styles.headerHole}>#{hole}</Text>
          <Text style={styles.headerSub}>HDCP 10 | PAR 4</Text>
        </View>

        <View style={[styles.leftTools, { top: insets.top + 88 }]}>
          <Pressable
            onPress={() => setIsSatellite((s) => !s)}
            style={({ pressed }) => [
              styles.toolBtn,
              pressed ? styles.toolBtnPressed : null,
            ]}
          >
            <Text style={styles.toolIcon}>🛰️</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.dockWrap,
            { paddingBottom: Math.max(12, insets.bottom + 10) },
          ]}
        >
          <BlurView intensity={32} tint="dark" style={styles.dockBlur}>
            <View style={styles.dockTint} />

            <View style={styles.dockRow}>
              <Pressable
                onPress={goPrev}
                style={({ pressed }) => [
                  styles.squareBtn,
                  pressed ? styles.squarePressed : null,
                ]}
              >
                <Text style={styles.squareIcon}>‹</Text>
              </Pressable>

              <Pressable
                onPress={openScore}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed ? styles.primaryPressed : null,
                ]}
              >
                <Text style={styles.primaryTitle}>ENTER SCORE</Text>
                <Text style={styles.primarySub}>Hole {hole}</Text>
              </Pressable>

              <Pressable
                onPress={goNext}
                style={({ pressed }) => [
                  styles.squareBtn,
                  pressed ? styles.squarePressed : null,
                ]}
              >
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

  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },

  header: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    elevation: 999,
  },
  headerHole: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    marginTop: 2,
  },

  leftTools: {
    position: "absolute",
    left: 16,
    zIndex: 999,
    elevation: 999,
  },
  toolBtn: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(15,18,22,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolBtnPressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
  toolIcon: { fontSize: 20 },

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
  dockTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 18, 22, 0.38)",
  },
  dockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

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
  squarePressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  squareIcon: {
    color: "#fff",
    fontSize: 28,
    lineHeight: 28,
    marginTop: -1,
  },

  primaryBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#D62828",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryPressed: { transform: [{ scale: 0.99 }], opacity: 0.96 },
  primaryTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  primarySub: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
