// src/screens/TournamentStartSplashScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Alert } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

export default function TournamentStartSplashScreen({ navigation, route }) {
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;
  const devPreview = !!route?.params?.devPreview;

  const [starting, setStarting] = useState(true);

  const scale = useRef(new Animated.Value(0.7)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => {
    const gold = isDark ? "rgba(214, 171, 84, 0.90)" : "rgba(214, 171, 84, 0.92)";
    const glow = isDark ? "rgba(214, 171, 84, 0.18)" : "rgba(214, 171, 84, 0.14)";
    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
      halo: {
        width: 220,
        height: 220,
        borderRadius: 110,
        backgroundColor: glow,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      },
      trophy: { fontSize: 64 },
      title: { marginTop: 18, color: theme.text, fontSize: 22, fontWeight: "900", textAlign: "center" },
      sub: { marginTop: 10, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 18, textAlign: "center" },
      tag: { marginTop: 16, color: gold, fontSize: 12, fontWeight: "900", letterSpacing: 1.4, textTransform: "uppercase" },
    });
  }, [theme, isDark]);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const u = auth.currentUser;
    if (!u) {
      Alert.alert("Not signed in", "Please sign in again.");
      navigation.goBack();
      return;
    }

    let cancelled = false;

    async function startNow() {
      setStarting(true);

      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true }),
      ]).start();

      // DEV PREVIEW: show the splash but do NOT lock or change tournament status
      if (__DEV__ && devPreview) {
        setTimeout(() => {
          if (cancelled) return;
          setStarting(false);

          // Replace splash with Overview so Back returns to Payouts (normal dev navigation)
          navigation.replace(ROUTES.TOURNAMENT_OVERVIEW, { tournamentId, devPreview: true });
        }, 900);

        return;
      }

      // REAL START (later for production): lock + set live
      try {
        await updateDoc(doc(db, "tournaments", tournamentId), {
          rosterLocked: true,
          rosterLockedAt: serverTimestamp(),
          status: "live",
          startedAt: serverTimestamp(),
          setupStep: "done",
          updatedAt: serverTimestamp(),
        });
      } catch (e) {
        if (!cancelled) {
          Alert.alert("Start failed", e?.message || "Could not start tournament.");
          navigation.goBack();
        }
        return;
      }

      setTimeout(() => {
        if (cancelled) return;

        setStarting(false);

        // Keep existing behavior for real start:
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: ROUTES.TOURNAMENT_OVERVIEW, params: { tournamentId } }],
          })
        );
      }, 900);
    }

    startNow();

    return () => {
      cancelled = true;
    };
  }, [tournamentId, navigation, opacity, scale, devPreview]);

  return (
    <View style={styles.screen}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <View style={styles.halo}>
          <Text style={styles.trophy}>🏆</Text>
        </View>
      </Animated.View>

      <Text style={styles.title}>Tournament is starting</Text>
      <Text style={styles.sub}>
        {__DEV__ && devPreview ? "Developer preview mode. No tournament data is locked." : "Locking setup and switching to LIVE."}
      </Text>
      <Text style={styles.tag}>{starting ? "please wait" : __DEV__ && devPreview ? "preview" : "live"}</Text>
    </View>
  );
}
