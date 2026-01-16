// src/screens/PlayerEntryScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Modal,
  TextInput,
  Keyboard,
  Platform,
  Share,
  Alert,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { getBuddies } from "../storage/buddies";
import { saveActiveRound } from "../storage/roundState";
import { auth, db } from "../firebase/firebase";

const PROFILE_KEY = "LEGACY_GOLF_PROFILE_V1";

function clampHandicap(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(36, Math.round(n)));
}

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pickGameLabel(params) {
  const raw =
    params?.gameFormat ||
    params?.format ||
    params?.gameType ||
    params?.game ||
    params?.mode ||
    params?.rules ||
    "";

  const s = String(raw || "").trim();
  if (!s) return "Stroke Play";

  const lower = s.toLowerCase();
  if (lower.includes("stroke")) return "Stroke Play";
  if (lower.includes("match")) return "Match Play";
  if (lower.includes("skins")) return "Skins";
  if (lower.includes("nassau")) return "Nassau";
  if (lower.includes("vegas")) return "Vegas";
  if (lower.includes("wolf")) return "Wolf";
  if (lower.includes("snake")) return "Snake";
  if (lower.includes("stableford")) return "Stableford";
  if (lower.includes("kp") || lower.includes("kps")) return "KPs";

  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function parseProfile(raw) {
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;

    const name = String(obj.name || "").trim();
    const h = Number(obj.handicap);

    return {
      name: name || null,
      handicap: Number.isFinite(h) ? clampHandicap(h) : null,
    };
  } catch {
    return null;
  }
}

function makeActiveRoundSnapshot({
  params,
  course,
  tee,
  holeMeta,
  scoring,
  players,
  playerCount,
  joinCode,
}) {
  const gameId = params?.gameId || params?.gameFormat || params?.format || params?.gameType || null;
  const gameTitle = params?.gameTitle || params?.title || null;

  return {
    version: 1,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),

    gameId,
    gameTitle,

    scoring,
    course,
    tee,
    holeMeta,

    wagers: params?.wagers || null,

    players,
    playerCount,

    joinCode,

    startHole: 1,
    currentHole: 1,
  };
}

function displayNameFirstLastInitial(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "Guest";
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const last = parts[parts.length - 1];
  const li = last?.[0] ? `${last[0].toUpperCase()}` : "";
  return li ? `${first} ${li}` : first;
}

function normalizeJoinCode(v) {
  return String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim()
    .slice(0, 8);
}

export default function PlayerEntryScreen({ navigation, route }) {
  const params = route?.params || {};

  const course = params?.course || null;
  const tee = params?.tee || null;
  const holeMeta = params?.holeMeta || null;

  const scoringRaw = params?.scoring || params?.scoringType || params?.scoringMode || "net";
  const scoring = String(scoringRaw || "net").toLowerCase() === "gross" ? "gross" : "net";

  const gameLabel = useMemo(() => pickGameLabel(params), [params]);
  const playerCount = Math.max(1, Math.min(16, Number(params?.playerCount || 4)));

  const [buddies, setBuddies] = useState([]);

  // Player 1 ("me") always exists
  const [players, setPlayers] = useState([
    {
      id: "me",
      uid: auth?.currentUser?.uid || null,
      name: "Stephane L",
      handicap: 0,
      phone: "",
      email: "",
      source: "me",
      trackStats: true,
    },
  ]);

  const [buddyModal, setBuddyModal] = useState(false);
  const [buddyQuery, setBuddyQuery] = useState("");

  // when true, Buddy modal "Done" becomes blue
  const [buddyAddedThisSession, setBuddyAddedThisSession] = useState(false);

  const [guestModal, setGuestModal] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestHcp, setGuestHcp] = useState("");

  const [inviteModal, setInviteModal] = useState(false);

  // Host code (generated once)
  const hostJoinCode = useMemo(() => makeJoinCode(), []);

  // Join UI (for now, inside Invite modal)
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joining, setJoining] = useState(false);

  // Live lobby state
  const [lobbyCode, setLobbyCode] = useState(hostJoinCode);
  const [lobbyDoc, setLobbyDoc] = useState(null);

  const lobbyUnsubRef = useRef(null);
  const lobbyCreatedRef = useRef(false);

  // Edit Handicap modal (tap HCP pill)
  const [editHcpModal, setEditHcpModal] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState(null);
  const [editHcpValue, setEditHcpValue] = useState("");

  function openEditHandicap(player) {
    if (!player?.id) return;
    setEditPlayerId(player.id);
    setEditHcpValue(String(player.handicap ?? 0));
    setEditHcpModal(true);
  }

  function closeEditHandicap() {
    setEditHcpModal(false);
    setEditPlayerId(null);
    setEditHcpValue("");
    Keyboard.dismiss();
  }

  function saveEditHandicap() {
    if (!editPlayerId) return;

    const n = Number.parseInt(String(editHcpValue || "").trim() || "0", 10);
    const next = clampHandicap(n);

    setPlayers((prev) => prev.map((p) => (p.id === editPlayerId ? { ...p, handicap: next } : p)));
    closeEditHandicap();
  }

  // Always pull Player 1 from Profile (name + handicap)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (!mounted) return;

        const parsed = raw ? parseProfile(raw) : null;

        setPlayers((prev) => {
          const hasMe = prev.some((p) => p?.id === "me");
          const base = hasMe
            ? prev
            : [
                {
                  id: "me",
                  uid: auth?.currentUser?.uid || null,
                  name: "Stephane L",
                  handicap: 0,
                  phone: "",
                  email: "",
                  source: "me",
                  trackStats: true,
                },
                ...prev,
              ];

          return base.map((p) => {
            if (p.id !== "me") return p;

            const nextName = parsed?.name || "Stephane L";
            const nextHcp = parsed?.handicap ?? clampHandicap(p.handicap ?? 0);

            return {
              ...p,
              uid: auth?.currentUser?.uid || p.uid || null,
              name: nextName,
              handicap: nextHcp,
              source: "me",
              trackStats: true,
            };
          });
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getBuddies();
        if (mounted) setBuddies(Array.isArray(list) ? list : []);
      } catch {
        if (mounted) setBuddies([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const canStart = players.length === playerCount;

  const filteredBuddies = useMemo(() => {
    const q = (buddyQuery || "").trim().toLowerCase();
    if (!q) return buddies;
    return buddies.filter((b) => (b?.name || "").toLowerCase().includes(q));
  }, [buddies, buddyQuery]);

  function isAlreadyAdded(id) {
    return players.some((p) => p.id === id);
  }

  function addBuddy(b) {
    if (!b?.id) return;
    if (players.length >= playerCount) return;
    if (isAlreadyAdded(b.id)) return;

    setPlayers((prev) => [
      ...prev,
      {
        id: b.id,
        uid: b.uid || null,
        name: b.name || "Buddy",
        handicap: clampHandicap(Number(b.handicap ?? 0)),
        phone: b.phone || "",
        email: b.email || "",
        source: "buddy",
        trackStats: true,
      },
    ]);

    setBuddyAddedThisSession(true);
  }

  function removePlayer(id) {
    if (id === "me") return;
    const p = players.find((x) => x.id === id);
    if (p?.source === "remote") return; // joined players not removable in v1
    setPlayers((prev) => prev.filter((pp) => pp.id !== id));
  }

  function openGuest() {
    if (players.length >= playerCount) return;
    setGuestName("");
    setGuestHcp("");
    setGuestModal(true);
  }

  function addGuest() {
    const name = (guestName || "").trim();
    if (!name) return;
    if (players.length >= playerCount) return;

    const h = clampHandicap(Number.parseInt((guestHcp || "").trim() || "0", 10));
    const id = `guest-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    setPlayers((prev) => [
      ...prev,
      {
        id,
        uid: null,
        name,
        handicap: h,
        phone: "",
        email: "",
        source: "guest",
        trackStats: false,
      },
    ]);
    setGuestModal(false);
    Keyboard.dismiss();
  }

  async function onShareInvite() {
    try {
      await Share.share({
        message: `Legacy Golf — Join my game\nJoin Code: ${lobbyCode}\n(QR join coming soon)`,
      });
    } catch {}
  }

  async function onStartRound() {
    if (!canStart) return;

    // Save Active Round snapshot (for Resume + stable downstream screens)
    try {
      const activeRound = makeActiveRoundSnapshot({
        params,
        course,
        tee,
        holeMeta,
        scoring,
        players,
        playerCount,
        joinCode: lobbyCode,
      });
      await saveActiveRound(activeRound);
    } catch {
      // do not block starting the round
    }

    // Go to Round Hub (Hole View screen)
    try {
      navigation.navigate(ROUTES.HOLE_VIEW, {
        ...params,
        course,
        tee,
        holeMeta,
        scoring,
        players,
        playerCount,
        joinCode: lobbyCode,
        startHole: 1,
      });
    } catch {
      Alert.alert("Next screen not wired", 'Wire the next route ("HoleView") in your navigator.');
    }
  }

  const courseName = course?.name || "Course";
  const teeName = tee?.name || "Tee";
  const teeYards = tee?.yardage ? `${tee.yardage} yds` : "";

  const progressPct = Math.min(1, players.length / playerCount);

  const summaryLine1 = `${gameLabel} • ${scoring === "gross" ? "Gross" : "Net"} • ${players.length}/${playerCount}`;
  const summaryLine2 = `${courseName} • ${teeName}${teeYards ? ` (${teeYards})` : ""}`;

  const rightInvite = (
    <Pressable
      onPress={() => setInviteModal(true)}
      style={({ pressed }) => [styles.headerRight, pressed && styles.pressed]}
    >
      <Text style={styles.headerRightText}>Invite</Text>
    </Pressable>
  );

  function openBuddyModal() {
    if (players.length >= playerCount) return;
    setBuddyQuery("");
    setBuddyAddedThisSession(false);
    setBuddyModal(true);
  }

  function closeBuddyModal() {
    setBuddyModal(false);
  }

  const doneIsPrimary = buddyAddedThisSession;

  // LOBBY: create + subscribe
  async function ensureLobbyCreated() {
    const uid = auth?.currentUser?.uid || null;
    if (!uid) return;

    if (lobbyCreatedRef.current) return;
    lobbyCreatedRef.current = true;

    const code = normalizeJoinCode(hostJoinCode);
    setLobbyCode(code);

    try {
      const ref = doc(db, "lobbies", code);
      await setDoc(
        ref,
        {
          code,
          status: "open",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          hostUid: uid,
          course: course || null,
          tee: tee || null,
          playerCount: playerCount,
          scoring: scoring,
          gameLabel: gameLabel,
          members: {
            [uid]: {
              uid,
              name: players?.find((p) => p.id === "me")?.name || "Player",
              handicap: Number(players?.find((p) => p.id === "me")?.handicap ?? 0),
              joinedAt: serverTimestamp(),
              role: "host",
            },
          },
        },
        { merge: true }
      );

      setLobbyCode(code);
      subscribeToLobby(code);
    } catch (e) {
      // If Firestore rules block, we want a very clear message
      Alert.alert(
        "Lobby not created",
        "Firestore could not create the lobby. This usually means Firestore rules are blocking writes.\n\nWe can fix this next."
      );
    }
  }

  function subscribeToLobby(code) {
    const clean = normalizeJoinCode(code);
    if (!clean) return;

    try {
      if (lobbyUnsubRef.current) {
        lobbyUnsubRef.current();
        lobbyUnsubRef.current = null;
      }

      const ref = doc(db, "lobbies", clean);
      lobbyUnsubRef.current = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setLobbyDoc(null);
            return;
          }

          const data = snap.data() || {};
          setLobbyDoc(data);

          const members = data?.members && typeof data.members === "object" ? data.members : {};
          const myUid = auth?.currentUser?.uid || null;

          const remotePlayers = Object.values(members)
            .filter((m) => m && typeof m === "object")
            .map((m) => ({
              id: String(m.uid || ""),
              uid: String(m.uid || ""),
              name: String(m.name || "Player"),
              handicap: clampHandicap(Number(m.handicap ?? 0)),
              phone: "",
              email: "",
              source: "remote",
              trackStats: true,
            }))
            .filter((p) => p.uid && p.uid !== myUid);

          setPlayers((prev) => {
            const me = prev.find((p) => p.id === "me") || {
              id: "me",
              uid: myUid,
              name: "Me",
              handicap: 0,
              source: "me",
              trackStats: true,
            };

            const manual = prev.filter((p) => p.id !== "me" && p.source !== "remote");

            const next = [me, ...remotePlayers, ...manual].slice(0, playerCount);

            // If remote players push out manual players, that’s expected in v1
            return next;
          });
        },
        () => {
          // ignore for now
        }
      );
    } catch {
      // ignore
    }
  }

  // Create lobby when screen mounts (host flow)
  useEffect(() => {
    ensureLobbyCreated();

    return () => {
      if (lobbyUnsubRef.current) {
        lobbyUnsubRef.current();
        lobbyUnsubRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // JOIN: enter code, join lobby, then subscribe
  async function joinLobbyByCode() {
    const uid = auth?.currentUser?.uid || null;
    if (!uid) {
      Alert.alert("Not signed in", "You must be signed in to join a game.");
      return;
    }

    const code = normalizeJoinCode(joinCodeInput);
    if (!code || code.length < 4) {
      Alert.alert("Invalid code", "Please enter a valid join code.");
      return;
    }

    setJoining(true);

    try {
      const ref = doc(db, "lobbies", code);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        Alert.alert("Not found", "No lobby found for that join code.");
        setJoining(false);
        return;
      }

      const me = players.find((p) => p.id === "me") || {};
      const payload = {
        uid,
        name: String(me.name || "Player"),
        handicap: clampHandicap(Number(me.handicap ?? 0)),
        joinedAt: serverTimestamp(),
        role: "player",
      };

      await updateDoc(ref, {
        [`members.${uid}`]: payload,
        updatedAt: serverTimestamp(),
      });

      setLobbyCode(code);
      setJoinCodeInput("");
      subscribeToLobby(code);

      Alert.alert("Joined", `You joined game ${code}.`);
    } catch (e) {
      Alert.alert(
        "Join failed",
        "Could not join the lobby. This is usually Firestore rules blocking reads/writes."
      );
    } finally {
      setJoining(false);
    }
  }

  const lobbyMembersList = useMemo(() => {
    const members = lobbyDoc?.members && typeof lobbyDoc.members === "object" ? lobbyDoc.members : {};
    const arr = Object.values(members)
      .filter((m) => m && typeof m === "object" && m.uid)
      .map((m) => ({
        uid: String(m.uid),
        name: String(m.name || "Player"),
        handicap: clampHandicap(Number(m.handicap ?? 0)),
        role: String(m.role || "player"),
      }));

    // host first
    arr.sort((a, b) => (a.role === "host" ? -1 : 1) - (b.role === "host" ? -1 : 1));
    return arr;
  }, [lobbyDoc]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        navigation={navigation}
        title="Add Players"
        subtitle={`${players.length} of ${playerCount}`}
        right={rightInvite}
      />

      <View style={styles.topSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>ROUND SUMMARY</Text>
          <Text style={styles.summaryTitle} numberOfLines={1}>
            {summaryLine1}
          </Text>
          <Text style={styles.summarySub} numberOfLines={1}>
            {summaryLine2}
          </Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={openBuddyModal}
            style={({ pressed }) => [styles.actionPillPrimary, pressed && styles.pressed]}
          >
            <Text style={styles.actionPillText}>Buddy List</Text>
          </Pressable>

          <Pressable
            onPress={openGuest}
            style={({ pressed }) => [styles.actionPillGhost, pressed && styles.pressed]}
          >
            <Text style={styles.actionPillText}>Guest</Text>
          </Pressable>

          <Pressable
            onPress={() => setInviteModal(true)}
            style={({ pressed }) => [styles.actionPillGhost, pressed && styles.pressed]}
          >
            <Text style={styles.actionPillText}>Invite</Text>
          </Pressable>
        </View>

        <View style={styles.divider} pointerEvents="none" />
      </View>

      <FlatList
        data={players}
        keyExtractor={(it) => it.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const isMe = item.id === "me";
          const isRemote = item.source === "remote";
          const nameShort = displayNameFirstLastInitial(item.name);

          return (
            <View style={[styles.playerCard, isMe && styles.playerCardMe]}>
              <View style={styles.playerRing} pointerEvents="none" />

              <View style={styles.playerInner}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.playerName} numberOfLines={1}>
                    {nameShort}
                  </Text>
                  {isRemote ? (
                    <Text style={styles.playerMeta} numberOfLines={1}>
                      Joined via code
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  onPress={() => openEditHandicap(item)}
                  style={({ pressed }) => [styles.hcpPill, pressed && styles.pressed]}
                >
                  <Text style={styles.hcpPillText}>HCP {item.handicap ?? 0}</Text>
                </Pressable>

                {!isMe && !isRemote ? (
                  <Pressable
                    onPress={() => removePlayer(item.id)}
                    style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 70 }} />
                )}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.bottomBar}>
        <Pressable
          onPress={onStartRound}
          disabled={!canStart}
          style={({ pressed }) => [styles.cta, !canStart && styles.ctaDisabled, pressed && canStart && styles.pressed]}
        >
          <Text style={styles.ctaText}>{canStart ? "Start Round" : `Add ${playerCount - players.length} more`}</Text>
        </Pressable>
      </View>

      {/* Buddy Modal */}
      <Modal visible={buddyModal} transparent animationType="fade" onRequestClose={closeBuddyModal}>
        <Pressable style={styles.modalWrap} onPress={closeBuddyModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add from Buddy List</Text>

            <TextInput
              style={styles.modalInput}
              value={buddyQuery}
              onChangeText={setBuddyQuery}
              placeholder="Search buddies"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="none"
              returnKeyType="search"
            />

            <FlatList
              data={filteredBuddies}
              keyExtractor={(it) => it.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No buddies found.</Text>}
              renderItem={({ item }) => {
                const disabled = isAlreadyAdded(item.id) || players.length >= playerCount;
                return (
                  <View style={styles.pickRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.pickMeta}>HCP {item.handicap ?? 0}</Text>
                    </View>

                    <Pressable
                      disabled={disabled}
                      onPress={() => addBuddy(item)}
                      style={({ pressed }) => [
                        styles.pickBtn,
                        disabled && styles.pickBtnDisabled,
                        pressed && !disabled && styles.pressed,
                      ]}
                    >
                      <Text style={styles.pickBtnText}>{disabled ? "Added" : "Add"}</Text>
                    </Pressable>
                  </View>
                );
              }}
            />

            {/* Done becomes BLUE after at least one Add */}
            <Pressable
              onPress={closeBuddyModal}
              style={({ pressed }) => [
                styles.modalClose,
                doneIsPrimary && styles.modalClosePrimary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.modalCloseText, doneIsPrimary && styles.modalCloseTextPrimary]}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Guest Modal */}
      <Modal visible={guestModal} transparent animationType="fade" onRequestClose={() => setGuestModal(false)}>
        <Pressable style={styles.modalWrap} onPress={() => setGuestModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add Guest</Text>

            <TextInput
              style={styles.modalInput}
              value={guestName}
              onChangeText={setGuestName}
              placeholder="Guest name"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="words"
              returnKeyType="done"
            />

            <TextInput
              style={styles.modalInput}
              value={guestHcp}
              onChangeText={setGuestHcp}
              placeholder="Handicap (0–36)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="done"
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => setGuestModal(false)}
                style={({ pressed }) => [styles.modalGhostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>

              <Pressable onPress={addGuest} style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]}>
                <Text style={styles.modalPrimaryText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Invite / Lobby Modal */}
      <Modal visible={inviteModal} transparent animationType="fade" onRequestClose={() => setInviteModal(false)}>
        <Pressable style={styles.modalWrap} onPress={() => setInviteModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Invite Players</Text>

            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>JOIN CODE</Text>
              <Text style={styles.codeValue}>{lobbyCode}</Text>
              <Text style={styles.codeNote}>Share now. Players can join by entering this code.</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => setInviteModal(false)}
                style={({ pressed }) => [styles.modalGhostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalGhostText}>Close</Text>
              </Pressable>

              <Pressable onPress={onShareInvite} style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]}>
                <Text style={styles.modalPrimaryText}>Share</Text>
              </Pressable>
            </View>

            <View style={styles.modalSectionDivider} />

            <Text style={styles.sectionTitle}>Joined Players</Text>
            {lobbyMembersList.length ? (
              <View style={{ marginTop: 8 }}>
                {lobbyMembersList.map((m) => (
                  <View key={m.uid} style={styles.joinedRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.joinedName} numberOfLines={1}>
                        {displayNameFirstLastInitial(m.name)} {m.role === "host" ? "(Host)" : ""}
                      </Text>
                      <Text style={styles.joinedMeta}>HCP {m.handicap}</Text>
                    </View>
                    <View style={styles.joinedBadge}>
                      <Text style={styles.joinedBadgeText}>Joined</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No one has joined yet.</Text>
            )}

            <View style={styles.modalSectionDivider} />

            <Text style={styles.sectionTitle}>Join a Game (for testing)</Text>
            <TextInput
              style={styles.modalInput}
              value={joinCodeInput}
              onChangeText={(v) => setJoinCodeInput(normalizeJoinCode(v))}
              placeholder="Enter join code"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="characters"
              returnKeyType="done"
            />

            <Pressable
              onPress={joinLobbyByCode}
              disabled={joining}
              style={({ pressed }) => [
                styles.joinBtn,
                joining && { opacity: 0.7 },
                pressed && !joining && styles.pressed,
              ]}
            >
              <Text style={styles.joinBtnText}>{joining ? "Joining..." : "Join Game"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Handicap Modal */}
      <Modal visible={editHcpModal} transparent animationType="fade" onRequestClose={closeEditHandicap}>
        <Pressable style={styles.modalWrap} onPress={closeEditHandicap}>
          <Pressable style={styles.modalCardSmall} onPress={() => {}}>
            <Text style={styles.modalTitle}>Edit Handicap</Text>

            <TextInput
              style={styles.modalInput}
              value={editHcpValue}
              onChangeText={setEditHcpValue}
              placeholder="0–36"
              placeholderTextColor="rgba(255,255,255,0.35)"
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="done"
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable onPress={closeEditHandicap} style={({ pressed }) => [styles.modalGhostBtn, pressed && styles.pressed]}>
                <Text style={styles.modalGhostText}>Cancel</Text>
              </Pressable>

              <Pressable onPress={saveEditHandicap} style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]}>
                <Text style={styles.modalPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const GREEN_BG = "#0F7A4A";
const GREEN_BORDER = "rgba(255,255,255,0.18)";

// Premium green accents (same family as your other screens)
const GREEN_ACCENT = "rgba(15, 122, 74, 0.92)";
const GREEN_ACCENT_SOFT = "rgba(15, 122, 74, 0.14)";
const GREEN_ACCENT_BORDER = "rgba(15, 122, 74, 0.70)";
const GREEN_ACCENT_BORDER_SOFT = "rgba(15, 122, 74, 0.45)";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220" },

  topSection: { paddingTop: 12, paddingBottom: 10 },

  headerRight: {
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
  headerRightText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  progressTrack: {
    marginHorizontal: 16,
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
  },

  summaryCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    backgroundColor: GREEN_BG,
    padding: 14,
  },
  summaryKicker: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12, letterSpacing: 1.1 },
  summaryTitle: { marginTop: 10, color: "#fff", fontWeight: "900", fontSize: 16 },
  summarySub: { marginTop: 6, color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 13 },

  actionRow: { paddingHorizontal: 16, marginTop: 12, flexDirection: "row", gap: 10 },
  actionPillPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 4 },
    }),
  },
  actionPillGhost: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  actionPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  divider: { marginTop: 12, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  playerCard: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GREEN_ACCENT_BORDER,
    backgroundColor: "rgba(0,0,0,0.18)",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 2 },
    }),
  },
  playerCardMe: {
    borderColor: GREEN_ACCENT_BORDER_SOFT,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  playerRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GREEN_ACCENT,
    opacity: 0.14,
  },
  playerInner: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  playerName: { color: "#fff", fontWeight: "900", fontSize: 16 },
  playerMeta: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "800", fontSize: 12 },

  hcpPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN_ACCENT_BORDER_SOFT,
    backgroundColor: GREEN_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  hcpPillText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.2 },

  removeBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  emptyText: { color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12, marginTop: 8 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 12,
    backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  cta: {
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  ctaDisabled: { opacity: 0.35 },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxHeight: "82%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220",
    padding: 14,
  },
  modalCardSmall: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: theme?.bg || theme?.colors?.bg || "#0B1220",
    padding: 14,
  },
  modalTitle: { color: "#fff", fontWeight: "900", fontSize: 18, marginBottom: 10 },
  modalInput: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },

  pickRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  pickName: { color: "#fff", fontWeight: "900", fontSize: 15 },
  pickMeta: { marginTop: 4, color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12 },
  pickBtn: {
    width: 74,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
  },
  pickBtnDisabled: { opacity: 0.45 },
  pickBtnText: { color: "#fff", fontWeight: "900" },

  modalClose: {
    marginTop: 6,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalCloseText: { color: "#fff", fontWeight: "900" },

  modalClosePrimary: {
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
    borderColor: "rgba(255,255,255,0.18)",
  },
  modalCloseTextPrimary: { color: "#fff" },

  modalGhostBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  modalGhostText: { color: "#fff", fontWeight: "900" },

  modalPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
  },
  modalPrimaryText: { color: "#fff", fontWeight: "900" },

  codeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  codeLabel: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 12, letterSpacing: 1.1 },
  codeValue: { marginTop: 10, color: "#fff", fontWeight: "900", fontSize: 30, letterSpacing: 3 },
  codeNote: { marginTop: 10, color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12 },

  modalSectionDivider: { marginTop: 14, marginBottom: 10, height: 1, backgroundColor: "rgba(255,255,255,0.08)" },
  sectionTitle: { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.4 },

  joinedRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  joinedName: { color: "#fff", fontWeight: "900", fontSize: 14 },
  joinedMeta: { marginTop: 4, color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12 },
  joinedBadge: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(46,125,255,0.35)",
    backgroundColor: "rgba(46,125,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  joinedBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  joinBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme?.primary || theme?.colors?.primary || "#2E7DFF",
  },
  joinBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
