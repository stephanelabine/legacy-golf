// src/screens/TournamentTeamVsTeamPairingsScreen.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";

import ROUTES from "../navigation/routes";
import { db } from "../firebase/firebase";
import ScreenHeader from "../components/ScreenHeader";

function safeStr(x) {
  return String(x ?? "");
}

function getPlayerId(p) {
  return String(p?.uid || p?.id || p?._id || "");
}
function getPlayerName(p) {
  return String(p?.name || p?.displayName || p?.fullName || p?.email || "Player");
}

function sortLowToHigh(players) {
  const arr = Array.isArray(players) ? [...players] : [];
  return arr.sort((a, b) => Number(a?.handicap || 0) - Number(b?.handicap || 0));
}

// deterministic seed helpers (no jitter)
function hashStringToSeed(str) {
  const s = String(str || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function seededRandFactory(seed0) {
  let x = seed0 >>> 0;
  return function rand() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function shuffleCopySeeded(arr, seedStr) {
  const a = [...arr];
  const rand = seededRandFactory(hashStringToSeed(seedStr));
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
function shuffleCopyRandom(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function makeRoundMatchups1v1(teamA, teamB, roundNumber, seedKey) {
  const a = sortLowToHigh(teamA);
  const baseB = sortLowToHigh(teamB);

  // round 1 stays ordered; rounds 2–3 are deterministic (no jitter)
  const b = roundNumber === 1 ? baseB : shuffleCopySeeded(baseB, `${seedKey}-r${roundNumber}`);

  const max = Math.max(a.length, b.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    out.push({
      aUid: getPlayerId(a[i] || null),
      bUid: getPlayerId(b[i] || null),
      teeTime: "",
    });
  }
  return out;
}

// Tee time parsing → minutes since midnight (for sorting)
function parseTeeTimeToMinutes(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;

  let s = raw.replace(/\s+/g, "");

  let isAM = false;
  let isPM = false;

  if (s.endsWith("am")) {
    isAM = true;
    s = s.slice(0, -2);
  } else if (s.endsWith("pm")) {
    isPM = true;
    s = s.slice(0, -2);
  }

  if (!s) return null;

  let hh = 0;
  let mm = 0;

  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;
    hh = Number(parts[0]);
    mm = Number(parts[1]);
  } else {
    hh = Number(s);
    mm = 0;
  }

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || mm < 0 || mm >= 60) return null;

  if (isAM || isPM) {
    if (hh < 1 || hh > 12) return null;
    if (isAM) {
      hh = hh === 12 ? 0 : hh;
    } else {
      hh = hh === 12 ? 12 : hh + 12;
    }
  }

  if (hh < 0 || hh > 23) return null;

  return hh * 60 + mm;
}

function minutesToPicker(minutes) {
  const m = typeof minutes === "number" && Number.isFinite(minutes) ? minutes : null;
  if (m === null) return { hour: 9, minute: 0, ampm: "AM" };

  const hh24 = Math.floor(m / 60);
  const mm = m % 60;

  const ampm = hh24 >= 12 ? "PM" : "AM";
  let hh12 = hh24 % 12;
  if (hh12 === 0) hh12 = 12;

  return { hour: hh12, minute: mm, ampm };
}

function formatPickerTime(hour12, minute, ampm) {
  const h = Number(hour12) || 12;
  const m = Number(minute) || 0;
  const mm = String(Math.max(0, Math.min(59, m))).padStart(2, "0");
  const ap = ampm === "PM" ? "PM" : "AM";
  return `${h}:${mm} ${ap}`;
}

export default function TournamentTeamVsTeamPairingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const tournamentId = String(route?.params?.tournamentId || "");

  const [loading, setLoading] = useState(true);
  const [tournament, setTournament] = useState(null);

  const [activeRound, setActiveRound] = useState(1);
  const scrollRef = useRef(null);

  // modal time picker state
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [timeModalGroupStart, setTimeModalGroupStart] = useState(null); // start index of group (0,2,4...)
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmPm, setPickerAmPm] = useState("AM");

  const hourRef = useRef(null);
  const minRef = useRef(null);

  const ROW_H = 38;
  const VISIBLE_ROWS = 5;
  const PAD = Math.floor(VISIBLE_ROWS / 2) * ROW_H;

  const HOURS = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const MINS = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  useEffect(() => {
    if (!tournamentId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setTournament(data);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [tournamentId]);

  const teamVsTeam = tournament?.teamVsTeam || null;

  const teamAName = safeStr(teamVsTeam?.teamAName || "Team A");
  const teamBName = safeStr(teamVsTeam?.teamBName || "Team B");

  const teamAList = useMemo(() => (Array.isArray(teamVsTeam?.teamA) ? teamVsTeam.teamA : []), [teamVsTeam]);
  const teamBList = useMemo(() => (Array.isArray(teamVsTeam?.teamB) ? teamVsTeam.teamB : []), [teamVsTeam]);

  const playersById = useMemo(() => {
    const m = new Map();
    for (const p of [...teamAList, ...teamBList]) {
      const id = getPlayerId(p);
      if (id) m.set(id, p);
    }
    return m;
  }, [teamAList, teamBList]);

  const resolvePlayerByUid = (uid) => {
    const key = String(uid || "");
    if (!key) return null;
    return playersById.get(key) || { uid: key, name: "Player" };
  };

  const savedByRound = useMemo(() => {
    const raw = teamVsTeam?.pairingsByRound;
    return raw && typeof raw === "object" ? raw : null;
  }, [teamVsTeam]);

  const [localByRound, setLocalByRound] = useState({ 1: [], 2: [], 3: [], 4: [] });

  useEffect(() => {
    if (!teamVsTeam) return;

    const next = { 1: [], 2: [], 3: [], 4: [] };

    if (savedByRound) {
      for (const r of [1, 2, 3, 4]) {
        const bucket = savedByRound[String(r)];
        const matchups = Array.isArray(bucket?.matchups) ? bucket.matchups : [];
        next[r] = matchups.map((m) => ({
          aUid: String(m?.aUid || ""),
          bUid: String(m?.bUid || ""),
          teeTime: safeStr(m?.teeTime || ""),
        }));
      }
      setLocalByRound(next);
      return;
    }

    const legacy = Array.isArray(teamVsTeam?.matchups) ? teamVsTeam.matchups : [];
    const round1 =
      legacy.length > 0
        ? legacy.map((m) => ({
          aUid: String(m?.aUid || ""),
          bUid: String(m?.bUid || ""),
          teeTime: safeStr(m?.teeTime || ""),
        }))
        : makeRoundMatchups1v1(teamAList, teamBList, 1, tournamentId || "seed");

    next[1] = round1;
    next[2] = makeRoundMatchups1v1(teamAList, teamBList, 2, tournamentId || "seed");
    next[3] = makeRoundMatchups1v1(teamAList, teamBList, 3, tournamentId || "seed");
    next[4] = [];

    setLocalByRound(next);
  }, [teamVsTeam, savedByRound, teamAList, teamBList, tournamentId]);

  const activeMatchups = useMemo(() => {
    const rows = localByRound?.[activeRound] || [];
    return Array.isArray(rows) ? rows : [];
  }, [localByRound, activeRound]);

  // round 4 placeholders so tee times can still be set
  const ensureRound4Placeholders = () => {
    if (activeRound !== 4) return;
    setLocalByRound((prev) => {
      const curr = Array.isArray(prev[4]) ? prev[4] : [];
      if (curr.length > 0) return prev;

      const max = Math.max(teamAList.length, teamBList.length);
      const rows = [];
      for (let i = 0; i < max; i += 1) rows.push({ aUid: "", bUid: "", teeTime: "" });
      return { ...prev, 4: rows };
    });
  };

  useEffect(() => {
    Keyboard.dismiss();
    if (activeRound === 4) ensureRound4Placeholders();
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }));
  }, [activeRound]);

  const onRoundPress = (r) => {
    Keyboard.dismiss();
    setActiveRound(r);
  };

  const canRender = !!tournamentId && !loading && !!teamVsTeam;

  // group helpers (2 matchups per group; last group may have 1 matchup)
  const groupsSorted = useMemo(() => {
    const groups = [];
    for (let i = 0; i < activeMatchups.length; i += 2) {
      const rows = activeMatchups.slice(i, i + 2);
      const t0 = safeStr(rows?.[0]?.teeTime || "").trim();
      const t1 = safeStr(rows?.[1]?.teeTime || "").trim();
      const teeTime = t0 || t1 || "";
      const teeMin = parseTeeTimeToMinutes(teeTime);
      groups.push({
        start: i,
        rows,
        teeTime,
        teeMin,
        originalOrder: i,
      });
    }

    groups.sort((g1, g2) => {
      const a = g1.teeMin;
      const b = g2.teeMin;
      const aKey = a === null ? 1e9 : a;
      const bKey = b === null ? 1e9 : b;
      if (aKey !== bKey) return aKey - bKey;
      return g1.originalOrder - g2.originalOrder;
    });

    return groups;
  }, [activeMatchups]);

  const getGroupPlayerCount = (rows) => {
    const r = Array.isArray(rows) ? rows : [];
    let count = 0;
    for (const m of r) {
      if (String(m?.aUid || "").trim()) count += 1;
      if (String(m?.bUid || "").trim()) count += 1;
    }
    return count;
  };

  const getGroupTagText = (rows) => {
    const n = getGroupPlayerCount(rows);
    if (n >= 4) return "Foursome";
    if (n === 3) return "Threesome";
    if (n === 2) return "Twosome";
    return "Group";
  };

  const setGroupTeeTime = (groupStartIndex, val) => {
    const v = safeStr(val);
    setLocalByRound((prev) => {
      const next = { ...prev };
      const rows = Array.isArray(next[activeRound]) ? [...next[activeRound]] : [];

      const r0 = rows[groupStartIndex] || { aUid: "", bUid: "", teeTime: "" };
      rows[groupStartIndex] = { ...r0, teeTime: v };

      if (rows[groupStartIndex + 1]) {
        const r1 = rows[groupStartIndex + 1];
        rows[groupStartIndex + 1] = { ...r1, teeTime: v };
      }

      next[activeRound] = rows;
      return next;
    });
  };

  const openTimeModalForGroup = (groupStartIndex, existingTeeTime) => {
    const existingMinutes = parseTeeTimeToMinutes(existingTeeTime);
    const init = minutesToPicker(existingMinutes);

    setTimeModalGroupStart(groupStartIndex);
    setPickerHour(init.hour);
    setPickerMinute(init.minute);
    setPickerAmPm(init.ampm);

    setTimeModalOpen(true);

    requestAnimationFrame(() => {
      const hourIndex = Math.max(0, HOURS.indexOf(init.hour));
      const minIndex = Math.max(0, MINS.indexOf(init.minute));
      try {
        hourRef.current?.scrollTo?.({ y: hourIndex * ROW_H, animated: false });
      } catch { }
      try {
        minRef.current?.scrollTo?.({ y: minIndex * ROW_H, animated: false });
      } catch { }
    });
  };

  const closeTimeModal = () => {
    setTimeModalOpen(false);
    setTimeModalGroupStart(null);
  };

  const onSetTime = () => {
    if (timeModalGroupStart === null) {
      closeTimeModal();
      return;
    }
    const formatted = formatPickerTime(pickerHour, pickerMinute, pickerAmPm);
    setGroupTeeTime(timeModalGroupStart, formatted);
    closeTimeModal();
  };

  const onReshuffleActiveRound = () => {
    if (!teamVsTeam) {
      Alert.alert("Missing data", "Go back and build teams first.");
      return;
    }
    if (activeRound === 4) {
      Alert.alert("Round 4", "Round 4 opponents are set later by the organizer.");
      return;
    }

    const aIds = teamAList.map(getPlayerId).filter(Boolean);
    const bIds = teamBList.map(getPlayerId).filter(Boolean);

    if (aIds.length === 0 || bIds.length === 0) {
      Alert.alert("Missing players", "Both teams need players to reshuffle pairings.");
      return;
    }

    // Preserve tee times per group-slot
    const currentRows = Array.isArray(localByRound?.[activeRound]) ? localByRound[activeRound] : [];
    const groupSlotTeeTimes = [];
    for (let i = 0; i < currentRows.length; i += 2) {
      const t0 = safeStr(currentRows?.[i]?.teeTime || "").trim();
      const t1 = safeStr(currentRows?.[i + 1]?.teeTime || "").trim();
      groupSlotTeeTimes.push(t0 || t1 || "");
    }

    const shuffledA = shuffleCopyRandom(aIds);
    const shuffledB = shuffleCopyRandom(bIds);

    const max = Math.max(shuffledA.length, shuffledB.length);

    const nextRows = [];
    for (let i = 0; i < max; i += 1) {
      nextRows.push({
        aUid: String(shuffledA[i] || ""),
        bUid: String(shuffledB[i] || ""),
        teeTime: "",
      });
    }

    // re-apply tee times to group slots
    for (let gi = 0; gi < groupSlotTeeTimes.length; gi += 1) {
      const t = safeStr(groupSlotTeeTimes[gi]);
      const start = gi * 2;
      if (nextRows[start]) nextRows[start].teeTime = t;
      if (nextRows[start + 1]) nextRows[start + 1].teeTime = t;
    }

    setLocalByRound((prev) => ({ ...prev, [activeRound]: nextRows }));
    requestAnimationFrame(() => scrollRef.current?.scrollTo?.({ y: 0, animated: true }));
  };

  const reorderRowsByTeeTime = (rows) => {
    const arr = Array.isArray(rows) ? rows : [];
    const groupObjs = [];
    for (let i = 0; i < arr.length; i += 2) {
      const chunk = arr.slice(i, i + 2);
      const t0 = safeStr(chunk?.[0]?.teeTime || "").trim();
      const t1 = safeStr(chunk?.[1]?.teeTime || "").trim();
      const teeTime = t0 || t1 || "";
      const teeMin = parseTeeTimeToMinutes(teeTime);
      groupObjs.push({ start: i, chunk, teeMin, originalOrder: i });
    }

    groupObjs.sort((g1, g2) => {
      const a = g1.teeMin;
      const b = g2.teeMin;
      const aKey = a === null ? 1e9 : a;
      const bKey = b === null ? 1e9 : b;
      if (aKey !== bKey) return aKey - bKey;
      return g1.originalOrder - g2.originalOrder;
    });

    const out = [];
    for (const g of groupObjs) out.push(...g.chunk);
    return out;
  };

  const onSaveAndContinue = async () => {
    if (!tournamentId) return;
    if (!teamVsTeam) {
      Alert.alert("Missing data", "Go back and build teams first.");
      return;
    }

    try {
      const makeGroupTeeTimesMap = (rows) => {
        const map = {};
        const arr = Array.isArray(rows) ? rows : [];
        for (let i = 0; i < arr.length; i += 2) {
          const gi = Math.floor(i / 2) + 1;
          const t0 = safeStr(arr[i]?.teeTime || "").trim();
          const t1 = safeStr(arr[i + 1]?.teeTime || "").trim();
          const tt = t0 || t1 || "";
          if (tt) map[String(gi)] = tt;
        }
        return map;
      };

      const r1 = reorderRowsByTeeTime(localByRound[1] || []);
      const r2 = reorderRowsByTeeTime(localByRound[2] || []);
      const r3 = reorderRowsByTeeTime(localByRound[3] || []);
      const r4 = reorderRowsByTeeTime(localByRound[4] || []);

      const pairingsByRound = {
        "1": {
          matchups: r1.map((m) => ({
            aUid: String(m.aUid || ""),
            bUid: String(m.bUid || ""),
            teeTime: safeStr(m.teeTime || ""),
          })),
          groupTeeTimes: makeGroupTeeTimesMap(r1),
        },
        "2": {
          matchups: r2.map((m) => ({
            aUid: String(m.aUid || ""),
            bUid: String(m.bUid || ""),
            teeTime: safeStr(m.teeTime || ""),
          })),
          groupTeeTimes: makeGroupTeeTimesMap(r2),
        },
        "3": {
          matchups: r3.map((m) => ({
            aUid: String(m.aUid || ""),
            bUid: String(m.bUid || ""),
            teeTime: safeStr(m.teeTime || ""),
          })),
          groupTeeTimes: makeGroupTeeTimesMap(r3),
        },
        "4": {
          matchups: r4.map((m) => ({
            aUid: String(m.aUid || ""),
            bUid: String(m.bUid || ""),
            teeTime: safeStr(m.teeTime || ""),
          })),
          groupTeeTimes: makeGroupTeeTimesMap(r4),
        },
      };

      const payload = {
        ...(teamVsTeam || {}),
        matchType: "1v1",
        pairingsByRound,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "tournaments", tournamentId), {
        "teamVsTeam.matchType": payload.matchType || "1v1",
        "teamVsTeam.pairingsByRound": payload.pairingsByRound || {},
        "teamVsTeam.groupTeeTimes": payload.groupTeeTimes || {},
        "teamVsTeam.updatedAt": serverTimestamp(),
        updatedAt: serverTimestamp(),
      });


      navigation.navigate(ROUTES.TOURNAMENT_TEAM_VS_TEAM_PAIRINGS_OVERVIEW, { tournamentId });
    } catch (e) {
      Alert.alert("Save failed", "Could not save pairings.");
    }
  };

  const renderGrouped = () => {
    return (
      <View style={styles.list}>
        {groupsSorted.map((g, sortedIndex) => {
          const groupLabelNumber = sortedIndex + 1;
          const tagText = getGroupTagText(g.rows);

          return (
            <View key={`g-${g.start}`} style={styles.foursomeWrap}>
              <View style={styles.foursomeHeader}>
                <View style={styles.groupHeaderLeft}>
                  <Text style={styles.foursomeHeaderText}>Group {groupLabelNumber}</Text>
                  <Text style={styles.groupDash}>-</Text>

                  <Pressable
                    onPress={() => openTimeModalForGroup(g.start, g.teeTime)}
                    hitSlop={10}
                    style={styles.groupTeeChip}
                  >
                    <Text style={[styles.groupTeeChipText, !g.teeTime ? styles.groupTeeChipTextPlaceholder : null]}>
                      {g.teeTime ? g.teeTime : "Set tee time"}
                    </Text>
                  </Pressable>
                </View>

                <Text style={styles.foursomeHeaderSub}>{tagText}</Text>
              </View>

              <View style={styles.foursomeInner}>
                {g.rows.map((m, idx) => {
                  const rowIndex = g.start + idx;
                  const a = resolvePlayerByUid(m?.aUid);
                  const b = resolvePlayerByUid(m?.bUid);

                  return (
                    <View key={`${activeRound}-${rowIndex}`} style={styles.matchCard}>
                      <View style={styles.matchHeaderRow}>
                        <View style={[styles.teamHeaderPill, styles.teamHeaderPillA]}>
                          <Text style={styles.teamHeaderText} numberOfLines={1}>
                            {teamAName}
                          </Text>
                        </View>

                        <Text style={styles.vs}>vs</Text>

                        <View style={[styles.teamHeaderPill, styles.teamHeaderPillB]}>
                          <Text style={styles.teamHeaderText} numberOfLines={1}>
                            {teamBName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.playersRow}>
                        <View style={[styles.playerSide, styles.playerSideA]}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {a && getPlayerId(a) ? getPlayerName(a) : "TBD"}
                          </Text>
                        </View>

                        <View style={[styles.playerSide, styles.playerSideB]}>
                          <Text style={styles.playerName} numberOfLines={1}>
                            {b && getPlayerId(b) ? getPlayerName(b) : "TBD"}
                          </Text>
                        </View>
                      </View>

                      {activeRound === 4 ? (
                        <View style={styles.round4Note}>
                          <Text style={styles.round4NoteText}>
                            Round 4 opponents are set by the organizer after Round 3.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // wheel helpers
  const snapIndex = (y) => Math.round(Math.max(0, y) / ROW_H);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const onHourEnd = (e) => {
    const y = e?.nativeEvent?.contentOffset?.y || 0;
    const idx = clamp(snapIndex(y), 0, HOURS.length - 1);
    setPickerHour(HOURS[idx]);
  };

  const onMinEnd = (e) => {
    const y = e?.nativeEvent?.contentOffset?.y || 0;
    const idx = clamp(snapIndex(y), 0, MINS.length - 1);
    setPickerMinute(MINS[idx]);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader navigation={navigation} title="Pairings" subtitle="Set tee times and reshuffle matchups." />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 140 + Math.max(insets.bottom, 10) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Pairings</Text>
            <Text style={styles.heroSub}>Round-by-round 1v1 matchups, grouped for the tee sheet.</Text>

            <View style={styles.roundTabs}>
              {[1, 2, 3, 4].map((r) => {
                const active = r === activeRound;
                return (
                  <Pressable
                    key={String(r)}
                    onPress={() => onRoundPress(r)}
                    style={({ pressed }) => [
                      styles.roundTab,
                      active ? styles.roundTabActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.roundTabText, active ? styles.roundTabTextActive : null]}>
                      Round {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeRound === 4 ? (
              <View style={styles.noteBadge}>
                <Text style={styles.noteText}>Round 4 is organizer-set (not auto-generated).</Text>
              </View>
            ) : null}
          </View>

          <Pressable
            onPress={onReshuffleActiveRound}
            disabled={!canRender || activeRound === 4}
            style={({ pressed }) => [
              styles.reshuffleBtn,
              !canRender || activeRound === 4 ? styles.reshuffleDisabled : null,
              pressed && canRender && activeRound !== 4 ? styles.pressed : null,
            ]}
          >
            <Text style={styles.reshuffleText}>
              {activeRound === 4 ? "Reshuffle unavailable for Round 4" : "Reshuffle pairings"}
            </Text>
          </Pressable>

          {!tournamentId ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Missing tournamentId</Text>
              <Text style={styles.noticeSub}>This screen needs a tournamentId param.</Text>
            </View>
          ) : loading ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Loading…</Text>
              <Text style={styles.noticeSub}>Fetching tournament.</Text>
            </View>
          ) : !teamVsTeam ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>No Team vs Team data</Text>
              <Text style={styles.noticeSub}>Go back and build teams first.</Text>
            </View>
          ) : (
            renderGrouped()
          )}

          <View style={{ height: 18 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            onPress={onSaveAndContinue}
            disabled={!canRender}
            style={({ pressed }) => [
              styles.primary,
              !canRender ? styles.disabled : null,
              pressed && canRender ? styles.pressed : null,
            ]}
          >
            <Text style={styles.primaryText}>Save and Continue</Text>
          </Pressable>
        </View>

        <Modal visible={timeModalOpen} transparent animationType="fade" onRequestClose={closeTimeModal}>
          <Pressable style={styles.modalBackdrop} onPress={closeTimeModal} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={closeTimeModal} hitSlop={10} style={styles.modalHeaderBtn}>
                <Text style={styles.modalHeaderBtnText}>Cancel</Text>
              </Pressable>

              <Text style={styles.modalTitle}>Set tee time</Text>

              <Pressable onPress={onSetTime} hitSlop={10} style={styles.modalHeaderBtn}>
                <Text style={[styles.modalHeaderBtnText, styles.modalHeaderBtnTextSet]}>Set</Text>
              </Pressable>
            </View>

            <View style={styles.modalPickerWrap}>
              <View style={styles.modalPickersRow}>
                <View style={styles.pickerCol}>
                  <Text style={styles.pickerLabel}>Hour</Text>
                  <View style={styles.wheelWrap}>
                    <ScrollView
                      ref={hourRef}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={ROW_H}
                      decelerationRate="fast"
                      contentContainerStyle={{ paddingVertical: PAD }}
                      onMomentumScrollEnd={onHourEnd}
                      onScrollEndDrag={onHourEnd}
                    >
                      {HOURS.map((h) => (
                        <View key={`h-${h}`} style={[styles.wheelRow, { height: ROW_H }]}>
                          <Text style={styles.wheelText}>{h}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={[styles.wheelSelection, { height: ROW_H }]} pointerEvents="none" />
                  </View>
                </View>

                <View style={styles.pickerCol}>
                  <Text style={styles.pickerLabel}>Minute</Text>
                  <View style={styles.wheelWrap}>
                    <ScrollView
                      ref={minRef}
                      showsVerticalScrollIndicator={false}
                      snapToInterval={ROW_H}
                      decelerationRate="fast"
                      contentContainerStyle={{ paddingVertical: PAD }}
                      onMomentumScrollEnd={onMinEnd}
                      onScrollEndDrag={onMinEnd}
                    >
                      {MINS.map((m) => (
                        <View key={`m-${m}`} style={[styles.wheelRow, { height: ROW_H }]}>
                          <Text style={styles.wheelText}>{String(m).padStart(2, "0")}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <View style={[styles.wheelSelection, { height: ROW_H }]} pointerEvents="none" />
                  </View>
                </View>

                <View style={styles.pickerCol}>
                  <Text style={styles.pickerLabel}>AM/PM</Text>
                  <View style={styles.ampmWrap}>
                    <Pressable
                      onPress={() => setPickerAmPm("AM")}
                      style={({ pressed }) => [
                        styles.ampmBtn,
                        pickerAmPm === "AM" ? styles.ampmBtnActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text style={[styles.ampmText, pickerAmPm === "AM" ? styles.ampmTextActive : null]}>
                        AM
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPickerAmPm("PM")}
                      style={({ pressed }) => [
                        styles.ampmBtn,
                        pickerAmPm === "PM" ? styles.ampmBtnActive : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <Text style={[styles.ampmText, pickerAmPm === "PM" ? styles.ampmTextActive : null]}>
                        PM
                      </Text>
                    </Pressable>

                    <View style={{ height: 10 }} />
                    <View style={styles.previewPill}>
                      <Text style={styles.previewText}>
                        {formatPickerTime(pickerHour, pickerMinute, pickerAmPm)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={{ height: 6 }} />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </View>
  );
}

const BG = "#071017";
const CARD = "#0D1A24";
const CARD2 = "#0B151E";
const TEXT = "#EAF2FF";

// brighter active round highlight
const GREEN_BG = "rgba(15,122,74,0.22)";
const GREEN_RING = "rgba(15,122,74,0.72)";
const GREEN_SOFT = "rgba(15,122,74,0.10)";

const GOLD_RING = "rgba(201,162,74,0.70)";
const GOLD_SOFT = "rgba(201,162,74,0.10)";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: BG },

  content: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14 },

  hero: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: GOLD_RING,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  heroSub: {
    marginTop: 8,
    color: "rgba(234,242,255,0.76)",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },

  roundTabs: {
    marginTop: 14,
    flexDirection: "row",
    gap: 8,
  },
  roundTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundTabActive: {
    backgroundColor: GREEN_BG,
    borderColor: GREEN_RING,
  },
  roundTabText: {
    color: "rgba(234,242,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  roundTabTextActive: { color: TEXT },

  noteBadge: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.12)",
  },
  noteText: {
    color: "rgba(234,242,255,0.86)",
    fontSize: 12,
    fontWeight: "900",
  },

  reshuffleBtn: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.14)",
  },
  reshuffleDisabled: { opacity: 0.45 },
  reshuffleText: {
    color: "rgba(234,242,255,0.90)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  notice: {
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD2,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  noticeTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
  noticeSub: {
    marginTop: 6,
    color: "rgba(234,242,255,0.72)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center",
  },

  list: { marginTop: 12, gap: 12 },

  foursomeWrap: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(201,162,74,0.40)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 10,
    gap: 10,
  },
  foursomeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },

  groupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 10,
  },
  groupDash: {
    color: "rgba(234,242,255,0.70)",
    fontSize: 13,
    fontWeight: "900",
    marginHorizontal: 2,
  },

  foursomeHeaderText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  foursomeHeaderSub: {
    color: "rgba(234,242,255,0.68)",
    fontSize: 12,
    fontWeight: "900",
  },

  groupTeeChip: {
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.14)",
  },
  groupTeeChipText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  groupTeeChipTextPlaceholder: {
    color: "rgba(234,242,255,0.68)",
  },

  foursomeInner: {
    gap: 10,
  },

  matchCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },

  matchHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teamHeaderPill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  teamHeaderPillA: {
    backgroundColor: GREEN_SOFT,
    borderColor: GREEN_RING,
  },
  teamHeaderPillB: {
    backgroundColor: GOLD_SOFT,
    borderColor: GOLD_RING,
  },
  teamHeaderText: {
    color: "rgba(234,242,255,0.88)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  vs: {
    color: "rgba(234,242,255,0.70)",
    fontSize: 12,
    fontWeight: "900",
  },

  playersRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  playerSide: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  playerSideA: {
    backgroundColor: "rgba(15,122,74,0.06)",
    borderColor: "rgba(15,122,74,0.28)",
  },
  playerSideB: {
    backgroundColor: "rgba(201,162,74,0.06)",
    borderColor: "rgba(201,162,74,0.28)",
  },
  playerName: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },

  round4Note: {
    marginTop: 10,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  round4NoteText: {
    color: "rgba(234,242,255,0.72)",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },

  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: "rgba(7,16,23,0.92)",
    borderTopWidth: 1,
    borderTopColor: "rgba(234,242,255,0.10)",
  },
  primary: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,122,74,0.95)",
    borderWidth: 1,
    borderColor: GREEN_RING,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  disabled: { opacity: 0.5 },

  pressed: {
    opacity: Platform.OS === "ios" ? 0.88 : 0.9,
    transform: [{ scale: 0.99 }],
  },

  // modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CARD,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: "rgba(234,242,255,0.10)",
    paddingTop: 12,
    paddingHorizontal: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  modalHeaderBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  modalHeaderBtnText: {
    color: "rgba(234,242,255,0.82)",
    fontSize: 12.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  modalHeaderBtnTextSet: {
    color: TEXT,
  },
  modalTitle: {
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  modalPickerWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 12,
    marginBottom: 12,
  },
  modalPickersRow: {
    flexDirection: "row",
    gap: 10,
  },
  pickerCol: { flex: 1 },
  pickerLabel: {
    color: "rgba(234,242,255,0.70)",
    fontSize: 11.5,
    fontWeight: "900",
    letterSpacing: 0.2,
    marginBottom: 8,
    textAlign: "center",
  },
  wheelWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.14)",
    overflow: "hidden",
    height: 38 * 5,
  },
  wheelRow: {
    alignItems: "center",
    justifyContent: "center",
  },
  wheelText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  wheelSelection: {
    position: "absolute",
    left: 10,
    right: 10,
    top: (38 * 5) / 2 - 38 / 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(201,162,74,0.55)",
    backgroundColor: "rgba(201,162,74,0.10)",
  },

  ampmWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.14)",
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    height: 38 * 5,
  },
  ampmBtn: {
    width: "100%",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
  },
  ampmBtnActive: {
    backgroundColor: "rgba(15,122,74,0.18)",
    borderColor: "rgba(15,122,74,0.55)",
  },
  ampmText: {
    color: "rgba(234,242,255,0.72)",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  ampmTextActive: {
    color: TEXT,
  },
  previewPill: {
    marginTop: 6,
    width: "100%",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(234,242,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
