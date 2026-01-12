// src/screens/PlayerEntryScreen.js
import React, { useEffect, useMemo, useState } from "react";
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

import theme from "../theme";
import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { getBuddies } from "../storage/buddies";
import { saveActiveRound } from "../storage/roundState";

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

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "G";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
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
    { id: "me", name: "Stephane L", handicap: 0, phone: "", email: "", source: "me" },
  ]);

  const [buddyModal, setBuddyModal] = useState(false);
  const [buddyQuery, setBuddyQuery] = useState("");

  // when true, Buddy modal "Done" becomes blue
  const [buddyAddedThisSession, setBuddyAddedThisSession] = useState(false);

  const [guestModal, setGuestModal] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestHcp, setGuestHcp] = useState("");

  const [inviteModal, setInviteModal] = useState(false);
  const joinCode = useMemo(() => makeJoinCode(), []);

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
            : [{ id: "me", name: "Stephane L", handicap: 0, phone: "", email: "", source: "me" }, ...prev];

          return base.map((p) => {
            if (p.id !== "me") return p;

            const nextName = parsed?.name || "Stephane L";
            const nextHcp = parsed?.handicap ?? clampHandicap(p.handicap ?? 0);

            return { ...p, name: nextName, handicap: nextHcp, source: "me" };
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
        name: b.name || "Buddy",
        handicap: clampHandicap(Number(b.handicap ?? 0)),
        phone: b.phone || "",
        email: b.email || "",
        source: "buddy",
      },
    ]);

    setBuddyAddedThisSession(true);
  }

  function removePlayer(id) {
    if (id === "me") return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function bumpHandicap(id, delta) {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, handicap: clampHandicap((p.handicap ?? 0) + delta) } : p))
    );
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

    setPlayers((prev) => [...prev, { id, name, handicap: h, phone: "", email: "", source: "guest" }]);
    setGuestModal(false);
    Keyboard.dismiss();
  }

  async function onShareInvite() {
    try {
      await Share.share({
        message: `Legacy Golf — Join my game\nJoin Code: ${joinCode}\n(QR join coming soon)`,
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
        joinCode,
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
        joinCode,
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
        renderItem={({ item, index }) => {
          const isMe = item.id === "me";
          const sourceLabel = isMe ? "You" : item.source === "buddy" ? "Buddy" : "Guest";

          return (
            <View style={[styles.playerCard, isMe && styles.playerCardMe]}>
              <View style={styles.playerRing} pointerEvents="none" />

              <View style={styles.playerInner}>
                <View style={[styles.avatar, isMe && styles.avatarMe]}>
                  <Text style={styles.avatarText}>{initials(item.name)}</Text>
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.playerTopRow}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <View style={[styles.typePill, isMe && styles.typePillMe]}>
                      <Text style={styles.typePillText}>{sourceLabel}</Text>
                    </View>
                  </View>

                  <Text style={styles.playerMeta} numberOfLines={1}>
                    HCP {item.handicap ?? 0} • Player {index + 1}
                  </Text>
                </View>

                <View style={styles.hcpControls}>
                  <Pressable
                    onPress={() => bumpHandicap(item.id, -1)}
                    style={({ pressed }) => [styles.hcpBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.hcpBtnText}>−</Text>
                  </Pressable>

                  <View style={styles.hcpBubble}>
                    <Text style={styles.hcpBubbleText}>{item.handicap ?? 0}</Text>
                  </View>

                  <Pressable
                    onPress={() => bumpHandicap(item.id, +1)}
                    style={({ pressed }) => [styles.hcpBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.hcpBtnText}>+</Text>
                  </Pressable>
                </View>

                {!isMe ? (
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

      {/* Invite Modal */}
      <Modal visible={inviteModal} transparent animationType="fade" onRequestClose={() => setInviteModal(false)}>
        <Pressable style={styles.modalWrap} onPress={() => setInviteModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Invite Players</Text>

            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>JOIN CODE</Text>
              <Text style={styles.codeValue}>{joinCode}</Text>
              <Text style={styles.codeNote}>Share now. QR join coming soon.</Text>
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

  // PLAYER CARDS (green border premium look)
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GREEN_ACCENT_BORDER_SOFT,
    backgroundColor: GREEN_ACCENT_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMe: { borderColor: GREEN_ACCENT_BORDER, backgroundColor: "rgba(255,255,255,0.10)" },
  avatarText: { color: "#fff", fontWeight: "900" },

  playerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  playerName: { color: "#fff", fontWeight: "900", fontSize: 16, flex: 1 },

  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GREEN_ACCENT_BORDER_SOFT,
    backgroundColor: GREEN_ACCENT_SOFT,
  },
  typePillMe: { borderColor: GREEN_ACCENT_BORDER_SOFT, backgroundColor: "rgba(255,255,255,0.08)" },
  typePillText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.4, opacity: 0.95 },

  playerMeta: { marginTop: 4, color: "rgba(255,255,255,0.62)", fontWeight: "800", fontSize: 12 },

  hcpControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  hcpBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  hcpBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  hcpBubble: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN_ACCENT_BORDER_SOFT,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  hcpBubbleText: { color: "#fff", fontWeight: "900" },

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

  emptyText: { color: "rgba(255,255,255,0.6)", fontWeight: "800", fontSize: 12 },

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

  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
