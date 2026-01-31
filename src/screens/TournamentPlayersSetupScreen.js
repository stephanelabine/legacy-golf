// src/screens/TournamentPlayersSetupScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Share,
  FlatList,
  TouchableWithoutFeedback,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  doc,
  collection,
  onSnapshot,
  onSnapshot as onSnapshotQuery,
  query,
  orderBy,
  updateDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";
import PremiumSwipeRow from "../components/PremiumSwipeRow";
import { getBuddies } from "../storage/buddies";

function makeGuestId() {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseHandicap(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return { ok: false, value: null };
  const num = Number(raw);
  if (!Number.isFinite(num)) return { ok: false, value: null };
  const rounded = Math.round(num * 10) / 10;
  return { ok: true, value: rounded };
}

function displayNameFor(p, fallback) {
  const a = String(p?.displayName || "").trim();
  const b = String(p?.name || "").trim();
  return a || b || String(fallback || "Player");
}

function normalizeName(p, fallback) {
  return displayNameFor(p, fallback).trim().toLowerCase();
}

export default function TournamentPlayersSetupScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);
  const [rawMembers, setRawMembers] = useState([]);
  const [formatDocs, setFormatDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState("menu"); // menu | guest | buddies

  const [guestName, setGuestName] = useState("");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState(null);
  const [editName, setEditName] = useState("");
  const [editHandicap, setEditHandicap] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Buddy picker state
  const [buddyList, setBuddyList] = useState([]);
  const [buddySearch, setBuddySearch] = useState("");
  const [buddySelected, setBuddySelected] = useState(new Set());

  const autoHostWroteRef = useRef(false);
  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const openSwipeRef = useRef(null);
  function closeAnyOpenSwipe() {
    try {
      openSwipeRef.current?.close?.();
    } catch (e) {}
    openSwipeRef.current = null;
  }

  // Input refs + stable focus (no autoFocus props)
  const guestNameRef = useRef(null);
  const editNameRef = useRef(null);
  const buddySearchRef = useRef(null);

  const u = auth.currentUser;

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => setT(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId, navigation]);

  useEffect(() => {
    if (!tournamentId) return;

    const mref = collection(db, "tournaments", tournamentId, "members");
    const unsub = onSnapshotQuery(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRawMembers(rows);
      },
      (err) => Alert.alert("Players error", err?.message || "Could not load players.")
    );

    return () => unsub();
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;

    const fref = collection(db, "tournaments", tournamentId, "formats");
    const fq = query(fref, orderBy("createdAt", "asc"));
    const unsub = onSnapshotQuery(
      fq,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setFormatDocs(rows);
      },
      () => {}
    );

    return () => unsub();
  }, [tournamentId]);

  const ownerUid = String(t?.ownerUid || "");
  const joinCode = String(t?.joinCode || t?.code || "").trim().toUpperCase();
  const tournamentName = String(t?.name || t?.tournamentName || "Tournament").trim();

  const isHost = useMemo(() => {
    if (!u || !ownerUid) return false;
    return String(u.uid || "") === ownerUid;
  }, [u, ownerUid]);

  // Organizer pinned first (Player 1), others alphabetical
  const members = useMemo(() => {
    const rows = Array.isArray(rawMembers) ? [...rawMembers] : [];

    rows.sort((a, b) => {
      const au = String(a?.uid || a?.id || "");
      const bu = String(b?.uid || b?.id || "");

      const aHostRank = au && ownerUid && au === ownerUid ? 0 : 1;
      const bHostRank = bu && ownerUid && bu === ownerUid ? 0 : 1;
      if (aHostRank !== bHostRank) return aHostRank - bHostRank;

      const an = normalizeName(a, "player");
      const bn = normalizeName(b, "player");
      if (an !== bn) return an < bn ? -1 : 1;

      return au.localeCompare(bu);
    });

    return rows;
  }, [rawMembers, ownerUid]);

  const playerCount = members.length;

  const firstMissingHcp = useMemo(() => {
    return (members || []).find((p) => !parseHandicap(p?.handicap).ok) || null;
  }, [members]);

  const hasTeamVsTeam = useMemo(() => {
    const list = Array.isArray(formatDocs) ? formatDocs : [];
    return list.some((f) => {
      const key = String(f?.key || f?.id || "").toLowerCase();
      const name = String(f?.name || "").toLowerCase();
      return key.includes("team") || name.includes("team vs team") || name.includes("team versus team");
    });
  }, [formatDocs]);

  const teamRoute =
    ROUTES.TOURNAMENT_TEAM_VS_TEAM ||
    ROUTES.TOURNAMENT_TEAMS ||
    ROUTES.TOURNAMENT_TEAM_ASSIGN ||
    null;

  // Auto-create host row if missing
  useEffect(() => {
    if (!tournamentId || !ownerUid || !isHost) return;
    if (autoHostWroteRef.current) return;

    const hasHostRow = (members || []).some((m) => String(m.uid || m.id || "") === ownerUid);
    if (hasHostRow) {
      autoHostWroteRef.current = true;
      return;
    }

    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", ownerUid));
        const profile = userSnap.exists() ? userSnap.data() : {};

        const name =
          String(profile?.displayName || "").trim() ||
          String(profile?.name || "").trim() ||
          String(profile?.fullName || "").trim() ||
          String(u?.displayName || "").trim() ||
          "Organizer";

        const h = profile?.handicap;
        const hNum =
          typeof h === "number"
            ? h
            : h === null || h === undefined || h === ""
            ? NaN
            : Number(String(h).trim());

        const hStr = Number.isFinite(hNum) ? String(Math.round(hNum * 10) / 10) : "";

        await setDoc(
          doc(db, "tournaments", tournamentId, "members", ownerUid),
          {
            uid: ownerUid,
            displayName: name,
            isGuest: false,
            handicap: hStr,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await updateDoc(doc(db, "tournaments", tournamentId), {
          memberIds: arrayUnion(ownerUid),
          updatedAt: serverTimestamp(),
        });

        autoHostWroteRef.current = true;
      } catch (e) {}
    })();
  }, [tournamentId, ownerUid, isHost, members, u?.displayName]);

  // Modal focus behavior (one-time, stable)
  useEffect(() => {
    if (!addOpen) return;

    if (addMode === "guest") {
      const t0 = setTimeout(() => {
        try {
          guestNameRef.current?.focus?.();
        } catch (e) {}
      }, 220);
      return () => clearTimeout(t0);
    }

    if (addMode === "buddies") {
      const t0 = setTimeout(() => {
        try {
          buddySearchRef.current?.focus?.();
        } catch (e) {}
      }, 220);
      return () => clearTimeout(t0);
    }
  }, [addOpen, addMode]);

  useEffect(() => {
    if (!editOpen) return;
    const t0 = setTimeout(() => {
      try {
        editNameRef.current?.focus?.();
      } catch (e) {}
    }, 220);
    return () => clearTimeout(t0);
  }, [editOpen]);

  // Load buddies when opening buddy picker
  useEffect(() => {
    if (!addOpen) return;
    if (addMode !== "buddies") return;

    (async () => {
      try {
        const list = await getBuddies();
        setBuddyList(Array.isArray(list) ? list : []);
      } catch (e) {
        setBuddyList([]);
      }
    })();
  }, [addOpen, addMode]);

  const buddyFiltered = useMemo(() => {
    const q = String(buddySearch || "").trim().toLowerCase();
    const base = Array.isArray(buddyList) ? buddyList : [];
    if (!q) return base;
    return base.filter((b) => String(b?.name || "").toLowerCase().includes(q));
  }, [buddyList, buddySearch]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const bronzeBorder = isDark ? "rgba(214, 171, 84, 0.78)" : "rgba(214, 171, 84, 0.82)";
    const bronzeBg = isDark ? "rgba(214, 171, 84, 0.10)" : "rgba(214, 171, 84, 0.13)";

    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.16)";
    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const green = "rgba(15,122,74,0.92)";

    const inkBtn = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";

    const sheetBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(10,15,26,0.12)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 200 },

      hero: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: bronzeBorder, backgroundColor: bronzeBg, marginBottom: 12 },
      heroKicker: { color: theme.text, fontSize: 12, fontWeight: "900", letterSpacing: 1.4, opacity: 0.78, textTransform: "uppercase" },
      heroTitle: { marginTop: 10, color: theme.text, fontSize: 18, fontWeight: "900" },
      heroSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 19 },

      playersCard: { borderRadius: 22, padding: 14, borderWidth: 2.5, borderColor: bronzeBorder, backgroundColor: theme.card2, marginBottom: 14 },
      playersTitle: { color: theme.text, fontSize: 13, fontWeight: "900", letterSpacing: 1.2, opacity: 0.78, textTransform: "uppercase" },
      playersSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 17 },

      addBtn: { marginTop: 12, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: greenBg, borderWidth: 1, borderColor: greenRing },
      addBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },

      listWrap: { marginTop: 12 },
      rowOuter: { marginBottom: 10 },

      rowInner: { padding: 14 },
      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      rowName: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },
      pill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: greenRing, backgroundColor: greenBg },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },
      rowSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800" },

      empty: { borderRadius: 18, padding: 14, borderWidth: 1, borderColor: softBorder, backgroundColor: softBg },
      emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      emptySub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", textAlign: "center", lineHeight: 18 },

      footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingBottom: footerPad, paddingTop: 12, backgroundColor: theme.bg, borderTopWidth: 1, borderTopColor: theme.divider },
      primaryBtn: { height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: inkBtn },
      primaryBtnDisabled: { opacity: 0.6 },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      // Bottom sheet modal
      modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
      sheetWrap: { width: "100%" },
      sheetCard: {
        width: "100%",
        maxHeight: "88%",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderWidth: 1,
        borderColor: sheetBorder,
        backgroundColor: theme.bg,
        overflow: "hidden",
      },
      sheetHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
      sheetTitle: { color: theme.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
      sheetSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18, textAlign: "center" },

      sheetBody: { paddingHorizontal: 16, paddingBottom: 10 },
      sheetFooter: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(14, (insets?.bottom || 0) + 10), borderTopWidth: 1, borderTopColor: theme.divider, backgroundColor: theme.bg },

      choiceBtn: { height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: softBg, borderWidth: 1, borderColor: softBorder, marginTop: 10 },
      choiceBtnPrimary: { backgroundColor: green, borderColor: greenRing },
      choiceText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      choiceTextPrimary: { color: "#fff" },

      input: { marginTop: 12, height: 52, borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card2, color: theme.text, fontSize: 15, fontWeight: "800" },

      rowBtns: { flexDirection: "row", gap: 10 },
      modalBtn: { flex: 1, height: 52, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: softBg, borderWidth: 1, borderColor: softBorder },
      modalBtnPrimary: { backgroundColor: green, borderColor: greenRing },
      modalBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },
      modalBtnTextPrimary: { color: "#fff" },

      spacer: { height: 10 },

      buddyTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
      buddyCountPill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: greenRing, backgroundColor: greenBg },
      buddyCountText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      buddyRow: {
        marginTop: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        paddingVertical: 12,
        paddingHorizontal: 14,
      },
      buddyRowOn: {
        borderColor: greenRing,
        backgroundColor: greenBg,
      },
      buddyName: { color: theme.text, fontSize: 15, fontWeight: "900" },
      buddyMeta: { marginTop: 4, color: theme.text, opacity: 0.70, fontSize: 12, fontWeight: "800" },
    });
  }, [theme, isDark, footerPad, insets?.bottom, insets?.top]);

  function closeAdd() {
    Keyboard.dismiss();
    setAddOpen(false);
    setTimeout(() => {
      setAddMode("menu");
      setBuddySearch("");
      setBuddySelected(new Set());
    }, 0);
  }

  function openAdd() {
    closeAnyOpenSwipe();
    if (!isHost) {
      Alert.alert("Host only", "Only the organizer can edit the roster.");
      return;
    }
    setAddMode("menu");
    setAddOpen(true);
  }

  function startGuest() {
    setGuestName("");
    setGuestHandicap("");
    setGuestEmail("");
    setGuestPhone("");
    setAddMode("guest");
  }

  function startBuddies() {
    setBuddySearch("");
    setBuddySelected(new Set());
    setAddMode("buddies");
  }

  async function shareInvite() {
    if (!joinCode) {
      Alert.alert("No code", "This tournament does not have a join code yet.");
      return;
    }
    try {
      await Share.share({
        message: `You’re invited to join: ${tournamentName}\nJoin code: ${joinCode}\n\nAlready have Legacy Golf? Open the app and join with this code.\nDon’t have it? Download Legacy Golf from the App Store.`,
      });
    } catch (e) {}
  }

  async function addGuest() {
    if (!isHost) return;

    const name = String(guestName || "").trim();
    const h = parseHandicap(guestHandicap);

    if (!name) {
      Alert.alert("Guest name", "Type a name for the guest.");
      return;
    }
    if (!h.ok) {
      Alert.alert("Handicap required", "Enter a valid handicap (example: 12.4).");
      return;
    }

    const email = String(guestEmail || "").trim();
    const phone = String(guestPhone || "").trim();
    const guestId = makeGuestId();

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", guestId),
        {
          uid: guestId,
          displayName: name,
          isGuest: true,
          handicap: String(h.value),
          email: email || "",
          phone: phone || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateDoc(doc(db, "tournaments", tournamentId), {
        guestIds: arrayUnion(guestId),
        updatedAt: serverTimestamp(),
      });

      closeAdd();
    } catch (e) {
      Alert.alert("Add guest failed", e?.message || "Could not add guest.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(p) {
    closeAnyOpenSwipe();
    if (!isHost) {
      Alert.alert("Host only", "Only the organizer can edit the roster.");
      return;
    }

    setEditPlayer(p);

    const nm = displayNameFor(p, "");
    const h = parseHandicap(p?.handicap);

    setEditName(nm);
    setEditHandicap(h.ok ? String(h.value) : "");
    setEditEmail(String(p?.email || "").trim());
    setEditPhone(String(p?.phone || "").trim());

    setEditOpen(true);
  }

  function closeEdit() {
    Keyboard.dismiss();
    setEditOpen(false);
    setEditPlayer(null);
  }

  async function saveEdit() {
    if (!isHost) {
      Alert.alert("Host only", "Only the organizer can edit the roster.");
      return;
    }

    const p = editPlayer || {};
    const uid = String(p?.uid || p?.id || "");
    if (!uid) return;

    const nm = String(editName || "").trim();
    const h = parseHandicap(editHandicap);

    if (!nm) {
      Alert.alert("Name", "Enter a name.");
      return;
    }
    if (!h.ok) {
      Alert.alert("Handicap", "Enter a valid handicap (example: 12.4).");
      return;
    }

    const patch = { displayName: nm, handicap: String(h.value), updatedAt: serverTimestamp() };
    if (p?.isGuest) {
      patch.email = String(editEmail || "").trim();
      patch.phone = String(editPhone || "").trim();
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "tournaments", tournamentId, "members", uid), patch, { merge: true });
      closeEdit();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save player.");
    } finally {
      setSaving(false);
    }
  }

  async function trulyRemovePlayer(p) {
    if (!isHost) return;

    const uid = String(p?.uid || p?.id || "");
    if (!uid) return;

    if (uid === ownerUid) {
      Alert.alert("Not allowed", "You can’t remove the organizer.");
      return;
    }

    Alert.alert("Remove player?", "This will permanently remove the player from the tournament roster.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteDoc(doc(db, "tournaments", tournamentId, "members", uid));

            if (p?.isGuest) {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                guestIds: arrayRemove(uid),
                updatedAt: serverTimestamp(),
              });
            } else {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                memberIds: arrayRemove(uid),
                updatedAt: serverTimestamp(),
              });
            }

            closeAnyOpenSwipe();
            if (editOpen) closeEdit();
          } catch (e) {
            Alert.alert("Remove failed", e?.message || "Could not remove player.");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  function toggleBuddy(id) {
    if (!id) return;
    setBuddySelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelectedBuddies() {
    if (!isHost) return;

    const ids = Array.from(buddySelected || []);
    if (!ids.length) {
      Alert.alert("No selection", "Select at least one buddy to add.");
      return;
    }

    const existing = new Set((members || []).map((m) => String(m?.uid || m?.id || "")));
    const toAdd = (buddyList || []).filter((b) => ids.includes(String(b?.id || "")));

    const rows = toAdd
      .map((b) => {
        const uid = String(b?.id || "").trim();
        if (!uid) return null;
        if (existing.has(uid)) return null;

        const nm = String(b?.name || "").trim();
        const h = parseHandicap(b?.handicap);

        // BuddyList handicap is usually integer; we store as string for consistency here
        const hStr = h.ok ? String(h.value) : String(Number(b?.handicap ?? 0) || 0);

        return {
          uid,
          displayName: nm || "Player",
          handicap: hStr,
          email: String(b?.email || "").trim(),
          phone: String(b?.phone || "").trim(),
        };
      })
      .filter(Boolean);

    if (!rows.length) {
      Alert.alert("Nothing to add", "Those buddies are already in the roster.");
      return;
    }

    setSaving(true);
    try {
      for (const r of rows) {
        await setDoc(
          doc(db, "tournaments", tournamentId, "members", r.uid),
          {
            uid: r.uid,
            displayName: r.displayName,
            isGuest: false,
            handicap: r.handicap,
            email: r.email || "",
            phone: r.phone || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await updateDoc(doc(db, "tournaments", tournamentId), {
        memberIds: arrayUnion(...rows.map((r) => r.uid)),
        updatedAt: serverTimestamp(),
      });

      closeAdd();
    } catch (e) {
      Alert.alert("Add buddies failed", e?.message || "Could not add buddies.");
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    if (saving) return;

    if (playerCount < 2) {
      Alert.alert("Add players", "Add at least 2 players to continue.");
      return;
    }

    if (firstMissingHcp) {
      Alert.alert("Handicap missing", `${displayNameFor(firstMissingHcp, "Player")} needs a handicap before you continue.`);
      openEdit(firstMissingHcp);
      return;
    }

    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        playersReady: true,
        setupStep: "players",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {}

    if (hasTeamVsTeam && teamRoute) {
      navigation.navigate(teamRoute, { tournamentId });
      return;
    }

    navigation.navigate(ROUTES.TOURNAMENT_SETUP, { tournamentId });
  }

  function AddMenuBody() {
    return (
      <>
        <Pressable
          onPress={startGuest}
          disabled={saving}
          style={({ pressed }) => [styles.choiceBtn, styles.choiceBtnPrimary, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={[styles.choiceText, styles.choiceTextPrimary]}>Add Guest</Text>
        </Pressable>

        <Pressable
          onPress={startBuddies}
          disabled={saving}
          style={({ pressed }) => [styles.choiceBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.choiceText}>Add from Buddy List</Text>
        </Pressable>

        <Pressable
          onPress={shareInvite}
          disabled={saving || !joinCode}
          style={({ pressed }) => [styles.choiceBtn, pressed && !saving && styles.pressed, (saving || !joinCode) && { opacity: 0.6 }]}
        >
          <Text style={styles.choiceText}>Share invite</Text>
        </Pressable>

        <View style={styles.spacer} />
      </>
    );
  }

  function AddGuestBody() {
    return (
      <>
        <TextInput
          ref={guestNameRef}
          value={guestName}
          onChangeText={setGuestName}
          placeholder="Guest name"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!saving}
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            // move to next input by letting RN pick; no scroll jump
          }}
        />

        <TextInput
          value={guestHandicap}
          onChangeText={(s) => setGuestHandicap(String(s || "").replace(/[^0-9.]/g, ""))}
          placeholder="Handicap (required) — example: 12.4"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
          editable={!saving}
          returnKeyType="next"
          blurOnSubmit={false}
        />

        <TextInput
          value={guestEmail}
          onChangeText={setGuestEmail}
          placeholder="Email (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!saving}
          returnKeyType="next"
          blurOnSubmit={false}
        />

        <TextInput
          value={guestPhone}
          onChangeText={setGuestPhone}
          placeholder="Phone (optional)"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType="phone-pad"
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <View style={styles.spacer} />
      </>
    );
  }

  function BuddyPickerBody() {
    return (
      <>
        <View style={styles.buddyTopRow}>
          <View style={styles.buddyCountPill}>
            <Text style={styles.buddyCountText}>{buddySelected.size} selected</Text>
          </View>
        </View>

        <TextInput
          ref={buddySearchRef}
          value={buddySearch}
          onChangeText={setBuddySearch}
          placeholder="Search buddies"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
          returnKeyType="search"
        />

        <FlatList
          data={buddyFiltered}
          keyExtractor={(it) => String(it?.id || "")}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 10 }}
          renderItem={({ item }) => {
            const id = String(item?.id || "");
            const on = buddySelected.has(id);

            const h = Number(item?.handicap ?? 0);
            const phone = String(item?.phone || "").trim();
            const email = String(item?.email || "").trim();
            const metaParts = [`HCP ${Number.isFinite(h) ? h : 0}`];
            if (phone) metaParts.push(phone);
            if (email) metaParts.push(email);

            return (
              <Pressable
                onPress={() => toggleBuddy(id)}
                style={({ pressed }) => [
                  styles.buddyRow,
                  on && styles.buddyRowOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.buddyName} numberOfLines={1}>
                  {String(item?.name || "Buddy")}
                </Text>
                <Text style={styles.buddyMeta} numberOfLines={1}>
                  {metaParts.join("  •  ")}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingTop: 12 }}>
              <Text style={[styles.sheetSub, { textAlign: "left" }]}>
                No buddies found. Add buddies in your Buddy List first.
              </Text>
            </View>
          }
        />

        <View style={styles.spacer} />
      </>
    );
  }

  function renderAddHeader() {
    if (addMode === "guest") {
      return (
        <>
          <Text style={styles.sheetTitle}>Add guest</Text>
          <Text style={styles.sheetSub}>Name + handicap required. Email/phone optional.</Text>
        </>
      );
    }
    if (addMode === "buddies") {
      return (
        <>
          <Text style={styles.sheetTitle}>Add from Buddy List</Text>
          <Text style={styles.sheetSub}>Select one or more buddies to add to this tournament.</Text>
        </>
      );
    }
    return (
      <>
        <Text style={styles.sheetTitle}>Add a player</Text>
        <Text style={styles.sheetSub}>Choose how you want to add someone.</Text>
      </>
    );
  }

  function renderAddBody() {
    if (addMode === "guest") return <AddGuestBody />;
    if (addMode === "buddies") return <BuddyPickerBody />;
    return <AddMenuBody />;
  }

  function renderAddFooter() {
    if (addMode === "guest") {
      return (
        <View style={styles.rowBtns}>
          <Pressable
            onPress={() => setAddMode("menu")}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={styles.modalBtnText}>Back</Text>
          </Pressable>

          <Pressable
            onPress={addGuest}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{saving ? "Saving..." : "Save guest"}</Text>
          </Pressable>
        </View>
      );
    }

    if (addMode === "buddies") {
      return (
        <View style={styles.rowBtns}>
          <Pressable
            onPress={() => setAddMode("menu")}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={styles.modalBtnText}>Back</Text>
          </Pressable>

          <Pressable
            onPress={addSelectedBuddies}
            disabled={saving}
            style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
          >
            <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>
              {saving ? "Saving..." : "Add selected"}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.rowBtns}>
        <Pressable
          onPress={closeAdd}
          disabled={saving}
          style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.modalBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  function renderEditFooter() {
    const uid = String(editPlayer?.uid || editPlayer?.id || "");
    const isOwner = uid && ownerUid && uid === ownerUid;

    return (
      <View style={styles.rowBtns}>
        <Pressable
          onPress={closeEdit}
          disabled={saving}
          style={({ pressed }) => [styles.modalBtn, pressed && !saving && styles.pressed, saving && { opacity: 0.6 }]}
        >
          <Text style={styles.modalBtnText}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={saveEdit}
          disabled={saving || !isHost}
          style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && !saving && styles.pressed, (saving || !isHost) && { opacity: 0.6 }]}
        >
          <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>

        {!isOwner ? (
          <Pressable
            onPress={() => trulyRemovePlayer(editPlayer)}
            disabled={saving || !isHost}
            style={({ pressed }) => [
              styles.modalBtn,
              { backgroundColor: "rgba(190, 40, 40, 0.92)", borderColor: "rgba(190,40,40,0.35)" },
              pressed && !saving && styles.pressed,
              (saving || !isHost) && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderEditBody() {
    const p = editPlayer || {};
    const isGuest = !!p?.isGuest;

    return (
      <>
        <TextInput
          ref={editNameRef}
          value={editName}
          onChangeText={setEditName}
          placeholder="Player name"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!saving && isHost}
          returnKeyType="next"
          blurOnSubmit={false}
        />

        <TextInput
          value={editHandicap}
          onChangeText={(s) => setEditHandicap(String(s || "").replace(/[^0-9.]/g, ""))}
          placeholder="Handicap — example: 12.4"
          placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
          style={styles.input}
          keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
          editable={!saving && isHost}
          returnKeyType={isGuest ? "next" : "done"}
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        {isGuest ? (
          <>
            <TextInput
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="Email (optional)"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!saving && isHost}
              returnKeyType="next"
              blurOnSubmit={false}
            />

            <TextInput
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
              style={styles.input}
              keyboardType="phone-pad"
              editable={!saving && isHost}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </>
        ) : null}

        <View style={styles.spacer} />
      </>
    );
  }

  function PlayerRow({ p, index }) {
    const uid = String(p?.uid || p?.id || "");
    const isOwner = uid && ownerUid && uid === ownerUid;

    const nm = displayNameFor(p, `Player ${index + 1}`);
    const h = parseHandicap(p?.handicap);

    const canEdit = !!isHost;
    const canDelete = !!isHost && !isOwner;

    const rowShellBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const rowShellBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(10,15,26,0.02)";

    return (
      <View style={styles.rowOuter}>
        <PremiumSwipeRow
          openSwipeRef={openSwipeRef}
          closeAnyOpenSwipe={closeAnyOpenSwipe}
          onEdit={canEdit ? () => openEdit(p) : undefined}
          onDelete={canDelete ? () => trulyRemovePlayer(p) : undefined}
          editLabel="Edit"
          deleteLabel="Remove"
          borderColor={rowShellBorder}
          backgroundColor={rowShellBg}
          radius={18}
          actionWidth={120}
        >
          <Pressable onPress={() => (canEdit ? openEdit(p) : null)} style={({ pressed }) => [styles.rowInner, pressed && canEdit && styles.pressed]}>
            <View style={styles.rowTop}>
              <Text style={styles.rowName} numberOfLines={1}>
                {nm}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{h.ok ? `HCP ${h.value}` : "HCP ?"}</Text>
              </View>
            </View>

            <Text style={styles.rowSub}>
              {isOwner ? "Organizer" : p?.isGuest ? "Guest" : "Player"}
              {"  •  "}
              {h.ok ? "Handicap set" : "Handicap required"}
            </Text>
          </Pressable>
        </PremiumSwipeRow>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament Players" subtitle="Build the roster, then continue." />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Players</Text>
          <Text style={styles.heroTitle}>{tournamentName}</Text>
          <Text style={styles.heroSub}>Add everyone playing today. Handicap is required so payouts and results stay clean.</Text>
        </View>

        <View style={styles.playersCard}>
          <Text style={styles.playersTitle}>Who’s in the tournament?</Text>
          <Text style={styles.playersSub}>Organizer is Player 1. Swipe right to edit, swipe left to remove.</Text>

          <Pressable
            onPress={openAdd}
            disabled={saving || !isHost}
            style={({ pressed }) => [styles.addBtn, pressed && !saving && styles.pressed, (saving || !isHost) && { opacity: 0.6 }]}
          >
            <Text style={styles.addBtnText}>Add a player</Text>
          </Pressable>

          <View style={styles.listWrap}>
            {members.length ? (
              members.map((p, idx) => <PlayerRow key={String(p?.uid || p?.id || `p-${idx}`)} p={p} index={idx} />)
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No players yet</Text>
                <Text style={styles.emptySub}>Tap “Add a player” to add guests or invite others.</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={handleContinue}
          disabled={saving}
          style={({ pressed }) => [styles.primaryBtn, pressed && !saving && styles.pressed, saving && styles.primaryBtnDisabled]}
        >
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Continue"}</Text>
        </Pressable>
      </View>

      {/* Add bottom-sheet modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAdd}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeAdd} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(10, (insets?.top || 0) + 10) : 0}
            style={styles.sheetWrap}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.sheetCard}>
                <View style={styles.sheetHeader}>{renderAddHeader()}</View>

                <View style={styles.sheetBody}>
                  {renderAddBody()}
                </View>

                <View style={styles.sheetFooter}>{renderAddFooter()}</View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit bottom-sheet modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEdit} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(10, (insets?.top || 0) + 10) : 0}
            style={styles.sheetWrap}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={styles.sheetCard}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Edit player</Text>
                  <Text style={styles.sheetSub}>Name + handicap required.</Text>
                </View>

                <View style={styles.sheetBody}>{renderEditBody()}</View>

                <View style={styles.sheetFooter}>{renderEditFooter()}</View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
