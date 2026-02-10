// src/screens/TournamentPlayersScreen.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  Share,
  Platform,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PremiumSwipeRow from "../components/PremiumSwipeRow";
import {
  doc,
  onSnapshot,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayRemove,
  arrayUnion,
  writeBatch,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { auth, db } from "../firebase/firebase";

function initialsFromName(name, fallback) {
  const s = String(name || "").trim();
  if (!s) return String(fallback || "?").slice(0, 2).toUpperCase();
  const parts = s.split(" ").filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : parts[0]?.[1] || "";
  return (a + b).toUpperCase();
}

function makeGuestId() {
  return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function TournamentPlayersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  // IMPORTANT: when opened from Overview, return by POP (goBack) so we don't stack Overview screens
  const fromOverview = !!route?.params?.fromOverview;
  const returnTo = String(route?.params?.returnTo || ROUTES.TOURNAMENT_OVERVIEW);

  const [t, setT] = useState(null);
  const [rawMembers, setRawMembers] = useState([]);
  const [loadingT, setLoadingT] = useState(true);
  const [loadingM, setLoadingM] = useState(true);

  const [saving, setSaving] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);

  // Organizer modal
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgHandicap, setOrgHandicap] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [orgEmail, setOrgEmail] = useState("");

  // Add Players modal
  const [addOpen, setAddOpen] = useState(false);

  // Buddy Picker modal
  const [buddyOpen, setBuddyOpen] = useState(false);
  const [buddySearch, setBuddySearch] = useState("");
  const [buddyRaw, setBuddyRaw] = useState([]);
  const [buddyLoading, setBuddyLoading] = useState(false);
  const [buddySelected, setBuddySelected] = useState({}); // uid -> true

  // Guest modal
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestHandicap, setGuestHandicap] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  // Edit Player modal (non-organizer)
  const [editOpen, setEditOpen] = useState(false);
  const [editUid, setEditUid] = useState(null);
  const [editName, setEditName] = useState("");
  const [editHcp, setEditHcp] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editIsGuest, setEditIsGuest] = useState(false);

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  // keep only one swipe row open at a time
  const openSwipeRef = useRef(null);
  function closeAnyOpenSwipe() {
    try {
      if (openSwipeRef.current && openSwipeRef.current.close) openSwipeRef.current.close();
    } catch (e) { }
    openSwipeRef.current = null;
  }

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

    const mref = collection(db, "tournaments", tournamentId, "members");
    const unsubM = onSnapshot(
      mref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setRawMembers(rows);
        setLoadingM(false);
      },
      (err) => {
        setLoadingM(false);
        Alert.alert("Players error", err?.message || "Could not load players.");
      }
    );

    return () => {
      unsubT();
      unsubM();
    };
  }, [tournamentId]);

  const u = auth.currentUser;

  const ownerUid = String(t?.ownerUid || "");
  const rosterLocked = !!t?.rosterLocked;

  const isHost = useMemo(() => {
    if (!u || !t) return false;
    return String(t.ownerUid || "") === String(u.uid || "");
  }, [t, u]);

  const joinCode = String(t?.joinCode || "").toUpperCase();
  const tournamentName = String(t?.name || "Tournament");

  const members = useMemo(() => {
    const rows = Array.isArray(rawMembers) ? [...rawMembers] : [];
    rows.sort((a, b) => {
      const au = String(a.uid || a.id || "");
      const bu = String(b.uid || b.id || "");

      const aHost = au && ownerUid && au === ownerUid ? 0 : 1;
      const bHost = bu && ownerUid && bu === ownerUid ? 0 : 1;
      if (aHost !== bHost) return aHost - bHost;

      const ag = a?.isGuest ? 1 : 0;
      const bg = b?.isGuest ? 1 : 0;
      if (ag !== bg) return ag - bg;

      const an = String(a.displayName || a.name || "").trim().toLowerCase();
      const bn = String(b.displayName || b.name || "").trim().toLowerCase();
      if (an && bn && an !== bn) return an < bn ? -1 : 1;
      if (an && !bn) return -1;
      if (!an && bn) return 1;

      return au.localeCompare(bu);
    });
    return rows;
  }, [rawMembers, ownerUid]);

  const existingMemberUidSet = useMemo(() => {
    const s = new Set();
    (members || []).forEach((m) => {
      const uid = String(m.uid || m.id || "");
      if (uid) s.add(uid);
    });
    return s;
  }, [members]);

  const hostMember = useMemo(() => {
    const byUid = members.find((m) => String(m.uid || m.id || "") === ownerUid);
    return byUid || null;
  }, [members, ownerUid]);

  const organizer = useMemo(() => {
    const n =
      String(t?.organizerName || "").trim() ||
      String(hostMember?.displayName || "").trim() ||
      String(u?.displayName || "").trim();

    const h =
      String(t?.organizerHandicap ?? "").trim() ||
      String(hostMember?.handicap ?? "").trim() ||
      "";

    const p =
      String(t?.organizerPhone || "").trim() ||
      String(hostMember?.phone || "").trim() ||
      "";

    const e =
      String(t?.organizerEmail || "").trim() ||
      String(hostMember?.email || "").trim() ||
      "";

    return { name: n, handicap: h, phone: p, email: e };
  }, [t, hostMember, u]);

  useEffect(() => {
    setOrgName(organizer.name || "");
    setOrgHandicap(String(organizer.handicap || ""));
    setOrgPhone(organizer.phone || "");
    setOrgEmail(organizer.email || "");
  }, [organizer.name, organizer.handicap, organizer.phone, organizer.email]);

  // Load Buddy List (Firestore) when buddy modal is opened
  useEffect(() => {
    if (!buddyOpen) return;
    if (!u?.uid) {
      setBuddyRaw([]);
      setBuddyLoading(false);
      return;
    }

    setBuddyLoading(true);

    // Expected path: users/{uid}/buddies
    const bref = collection(db, "users", String(u.uid), "buddies");

    const unsub = onSnapshot(
      bref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setBuddyRaw(rows);
        setBuddyLoading(false);
      },
      (err) => {
        setBuddyLoading(false);
        Alert.alert("Buddy List error", err?.message || "Could not load Buddy List.");
      }
    );

    return () => unsub();
  }, [buddyOpen, u?.uid]);

  const buddies = useMemo(() => {
    const rows = Array.isArray(buddyRaw) ? [...buddyRaw] : [];
    rows.sort((a, b) => {
      const an = String(a.displayName || a.name || "").trim().toLowerCase();
      const bn = String(b.displayName || b.name || "").trim().toLowerCase();
      if (an && bn && an !== bn) return an < bn ? -1 : 1;
      if (an && !bn) return -1;
      if (!an && bn) return 1;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    return rows;
  }, [buddyRaw]);

  const filteredBuddies = useMemo(() => {
    const q = String(buddySearch || "").trim().toLowerCase();
    if (!q) return buddies;

    return buddies.filter((b) => {
      const name = String(b.displayName || b.name || "").toLowerCase();
      const email = String(b.email || "").toLowerCase();
      const phone = String(b.phone || "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [buddies, buddySearch]);

  const selectedCount = useMemo(() => Object.keys(buddySelected || {}).length, [buddySelected]);

  const styles = useMemo(() => {
    const blue = isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)";
    const blueBg = isDark ? "rgba(46,125,255,0.10)" : "rgba(29,53,87,0.10)";

    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.55)" : "rgba(255, 210, 92, 0.58)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.10)" : "rgba(255, 210, 92, 0.14)";

    const greenBg = isDark ? "rgba(15,122,74,0.14)" : "rgba(15,122,74,0.12)";
    const greenBorder = isDark ? "rgba(15,122,74,0.40)" : "rgba(15,122,74,0.40)";

    const selectedBg = isDark ? "rgba(46,125,255,0.16)" : "rgba(29,53,87,0.12)";
    const selectedBorder = isDark ? "rgba(46,125,255,0.42)" : "rgba(29,53,87,0.34)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 190 },

      codeCard: {
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
        borderColor: blue,
        backgroundColor: blueBg,
        marginBottom: 12,
      },
      codeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
      codeLabel: {
        color: theme.text,
        opacity: 0.8,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.2,
        textTransform: "uppercase",
      },
      codeValue: { color: theme.text, fontSize: 18, fontWeight: "900", letterSpacing: 3 },

      codeActions: { marginTop: 10, flexDirection: "row", gap: 10 },
      smallBtn: {
        flex: 1,
        height: 46,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      smallBtnText: { color: theme.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.2 },

      organizerCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
      },
      orgTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      orgSub: { marginTop: 4, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "800" },
      orgLines: { marginTop: 12, gap: 6 },
      orgLine: { color: theme.text, opacity: 0.88, fontSize: 13, fontWeight: "800" },
      orgBtn: {
        marginTop: 12,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      orgBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },

      addCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: greenBorder,
        backgroundColor: greenBg,
        marginBottom: 12,
      },
      addTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      addSub: { marginTop: 8, color: theme.text, opacity: 0.74, fontSize: 13, fontWeight: "700", lineHeight: 18 },
      addBtn: {
        marginTop: 12,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      addBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },

      sectionTitle: {
        marginTop: 8,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      swipeWrap: {
        marginBottom: 12,
        borderRadius: 18,
        overflow: "hidden",
      },

      row: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
      },

      rowAlt: {
        backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(10,15,26,0.04)",
      },

      playerRow: {
        borderWidth: 1,
        borderColor: softBorder,
      },
      playerRowReady: {
        borderColor: isDark ? "rgba(46, 204, 113, 0.78)" : "rgba(46, 204, 113, 0.72)",
      },
      playerRowReadyA: {
        backgroundColor: isDark ? "rgba(46, 204, 113, 0.14)" : "rgba(46, 204, 113, 0.12)",
      },
      playerRowReadyB: {
        backgroundColor: isDark ? "rgba(46, 204, 113, 0.18)" : "rgba(46, 204, 113, 0.15)",
      },

      rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },

      avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      avatarText: { color: theme.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.6 },

      rowTitle: { color: theme.text, fontSize: 16, fontWeight: "900" },
      rowSub: { marginTop: 4, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800" },

      pill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      pillText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      swipeAction: {
        width: 96,
        alignItems: "center",
        justifyContent: "center",
      },
      swipeEdit: {
        backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(29,53,87,0.92)",
      },
      swipeDelete: {
        backgroundColor: "rgba(231,76,60,0.92)",
      },
      swipeText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 0.2,
      },

      empty: {
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        marginTop: 8,
      },
      emptyTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      emptySub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

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
      footerRow: { flexDirection: "row", gap: 10 },
      footerBtn: { flex: 1, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },

      primaryBtn: { backgroundColor: isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)" },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      secondaryBtn: { backgroundColor: softBg, borderWidth: 1, borderColor: softBorder },
      secondaryText: { color: theme.text, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

      pressed: { opacity: Platform.OS === "ios" ? 0.88 : 0.9, transform: [{ scale: 0.99 }] },

      modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.55)",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      },

      modalCard: {
        width: "100%",
        maxHeight: "86%",
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
      },

      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900" },
      modalSub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },

      input: {
        marginTop: 12,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 15,
        fontWeight: "800",
      },

      modalBtnRow: { marginTop: 14, flexDirection: "row", gap: 10 },
      modalBtn: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
      },
      modalBtnCancel: { backgroundColor: softBg, borderColor: softBorder },
      modalBtnSave: { backgroundColor: blue, borderColor: blue },
      modalBtnText: { color: theme.text, fontSize: 15, fontWeight: "900" },
      modalBtnTextSave: { color: "#fff" },

      optionList: { marginTop: 12, gap: 10 },
      optionItem: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      },
      optionTitle: { color: theme.text, fontSize: 15, fontWeight: "900" },
      optionSub: { marginTop: 6, color: theme.text, opacity: 0.7, fontSize: 13, fontWeight: "700", lineHeight: 18 },
      optionRight: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.06)",
      },
      optionRightText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },

      buddyRow: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 10,
      },
      buddyRowSelected: {
        backgroundColor: selectedBg,
        borderColor: selectedBorder,
      },
      buddyLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
      buddyName: { color: theme.text, fontSize: 15, fontWeight: "900" },
      buddyMeta: { marginTop: 4, color: theme.text, opacity: 0.7, fontSize: 12, fontWeight: "800" },

      checkPill: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: "rgba(255,255,255,0.04)",
      },
      checkPillOn: {
        borderColor: blue,
        backgroundColor: blueBg,
      },
      checkText: { color: theme.text, fontSize: 12, fontWeight: "900" },
    });
  }, [theme, isDark, footerPad]);

  function openSetup() {
    if (!isHost) return;
    Keyboard.dismiss();
    setSetupOpen(true);
  }

  function goSetup(routeName) {
    if (!tournamentId) return;
    setSetupOpen(false);

    if (fromOverview) {
      navigation.navigate(routeName, { tournamentId, fromOverview: true, returnTo });
      return;
    }

    navigation.navigate(routeName, { tournamentId });
  }

  async function shareInvite() {
    if (!joinCode) return;

    const message =
      `Legacy Golf Tournament Invite\n\n` +
      `Tournament: ${tournamentName}\n` +
      `Join code: ${joinCode}\n\n` +
      `Open Legacy Golf → Games → Tournaments → Join with Code → enter: ${joinCode}`;

    try {
      await Share.share({ message });
    } catch (e) {
      Alert.alert("Share failed", e?.message || "Could not open share sheet.");
    }
  }

  async function saveOrganizer() {
    if (!isHost || !tournamentId) return;

    const cleanedName = String(orgName || "").trim();
    const cleanedHcp = String(orgHandicap || "").trim();
    const cleanedPhone = String(orgPhone || "").trim();
    const cleanedEmail = String(orgEmail || "").trim();

    if (!cleanedName) {
      Alert.alert("Name required", "Enter the tournament organizer's name.");
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        organizerName: cleanedName,
        organizerHandicap: cleanedHcp,
        organizerPhone: cleanedPhone,
        organizerEmail: cleanedEmail,
        updatedAt: serverTimestamp(),
      });

      if (ownerUid) {
        await setDoc(
          doc(db, "tournaments", tournamentId, "members", ownerUid),
          {
            uid: ownerUid,
            displayName: cleanedName,
            handicap: cleanedHcp,
            phone: cleanedPhone,
            email: cleanedEmail,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      setOrgOpen(false);
      Keyboard.dismiss();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "Could not save organizer.");
    } finally {
      setSaving(false);
    }
  }

  function openAddPlayers() {
    if (!isHost) return;
    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to add players.");
      return;
    }
    Keyboard.dismiss();
    setAddOpen(true);
  }

  function openBuddyPicker() {
    if (!isHost) return;
    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to add players.");
      return;
    }
    Keyboard.dismiss();
    setAddOpen(false);
    setBuddySearch("");
    setBuddySelected({});
    setBuddyOpen(true);
  }

  function openGuest() {
    if (!isHost) return;
    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to add a guest.");
      return;
    }
    setAddOpen(false);
    setGuestName("");
    setGuestHandicap("");
    setGuestPhone("");
    setGuestEmail("");
    setGuestOpen(true);
  }

  async function addGuestNow() {
    if (!isHost || !tournamentId) return;
    if (rosterLocked) return;

    const n = String(guestName || "").trim();
    const h = String(guestHandicap || "").trim();
    const p = String(guestPhone || "").trim();
    const e = String(guestEmail || "").trim();

    if (!n) {
      Alert.alert("Name required", "Enter the guest name.");
      return;
    }
    if (!h) {
      Alert.alert("Handicap required", "Enter the guest handicap.");
      return;
    }

    const guestId = makeGuestId();

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", guestId),
        {
          uid: guestId,
          displayName: n,
          handicap: h,
          phone: p,
          email: e,
          isGuest: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateDoc(doc(db, "tournaments", tournamentId), {
        guestIds: arrayUnion(guestId),
        updatedAt: serverTimestamp(),
      });

      setGuestOpen(false);
      Keyboard.dismiss();
    } catch (e2) {
      Alert.alert("Add failed", e2?.message || "Could not add guest.");
    } finally {
      setSaving(false);
    }
  }

  function toggleBuddy(uid) {
    const k = String(uid || "");
    if (!k) return;
    setBuddySelected((prev) => {
      const next = { ...(prev || {}) };
      if (next[k]) delete next[k];
      else next[k] = true;
      return next;
    });
  }

  async function addSelectedBuddiesToTournament() {
    if (!isHost || !tournamentId) return;
    if (rosterLocked) return;

    const keys = Object.keys(buddySelected || {});
    if (!keys.length) {
      Alert.alert("No selection", "Select at least one buddy to add.");
      return;
    }

    const toAdd = keys
      .map((k) => String(k))
      .filter((k) => k && k !== ownerUid && !existingMemberUidSet.has(k));

    if (!toAdd.length) {
      Alert.alert("Nothing to add", "All selected buddies are already in the roster.");
      return;
    }

    const buddyByUid = new Map();
    (buddies || []).forEach((b) => {
      const uid = String(b.buddyUid || b.uid || b.id || "");
      if (uid) buddyByUid.set(uid, b);
    });

    setSaving(true);
    try {
      const batch = writeBatch(db);

      toAdd.forEach((uid) => {
        const b = buddyByUid.get(uid) || {};
        const displayName = String(b.displayName || b.name || "").trim();
        const handicap = String(b.handicap ?? "").trim();
        const phone = String(b.phone || "").trim();
        const email = String(b.email || "").trim();

        batch.set(
          doc(db, "tournaments", tournamentId, "members", uid),
          {
            uid,
            displayName,
            handicap,
            phone,
            email,
            isGuest: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      batch.update(doc(db, "tournaments", tournamentId), {
        memberUids: arrayUnion(...toAdd),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      setBuddyOpen(false);
      setBuddySelected({});
      setBuddySearch("");
      Keyboard.dismiss();
    } catch (e) {
      Alert.alert("Add failed", e?.message || "Could not add buddies to roster.");
    } finally {
      setSaving(false);
    }
  }

  function openEditPlayer(member) {
    if (!isHost) return;
    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to edit players.");
      return;
    }

    const uid = String(member?.uid || member?.id || "");
    if (!uid) return;
    if (uid === ownerUid) {
      setOrgOpen(true);
      return;
    }

    setEditUid(uid);
    setEditIsGuest(!!member?.isGuest);
    setEditName(String(member?.displayName || "").trim());
    setEditHcp(String(member?.handicap ?? "").trim());
    setEditPhone(String(member?.phone ?? "").trim());
    setEditEmail(String(member?.email ?? "").trim());
    setEditOpen(true);
  }

  async function savePlayerEdit() {
    if (!isHost || !tournamentId || !editUid) return;
    if (rosterLocked) return;

    const n = String(editName || "").trim();
    const h = String(editHcp || "").trim();
    const p = String(editPhone || "").trim();
    const e = String(editEmail || "").trim();

    if (!n) {
      Alert.alert("Name required", "Enter a name to save.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "tournaments", tournamentId, "members", editUid),
        {
          uid: editUid,
          displayName: n,
          handicap: h,
          phone: p,
          email: e,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setEditOpen(false);
      setEditUid(null);
      Keyboard.dismiss();
    } catch (e2) {
      Alert.alert("Save failed", e2?.message || "Could not save player.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(member) {
    if (!isHost) return;

    if (rosterLocked) {
      Alert.alert("Roster locked", "Unlock the roster to remove players.");
      return;
    }

    const uid = String(member?.uid || member?.id || "");
    if (!uid) return;

    if (uid === ownerUid) {
      Alert.alert("Not allowed", "You can’t remove the organizer/host.");
      return;
    }

    const isGuest = !!member?.isGuest;

    Alert.alert("Remove player?", "This will remove the player from the tournament roster.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            if (isGuest) {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                guestIds: arrayRemove(uid),
                updatedAt: serverTimestamp(),
              });
            } else {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                memberUids: arrayRemove(uid),
                updatedAt: serverTimestamp(),
              });
            }

            await deleteDoc(doc(db, "tournaments", tournamentId, "members", uid));
          } catch (e2) {
            Alert.alert("Remove failed", e2?.message || "Could not remove player.");
          }
        },
      },
    ]);
  }

  const rosterCount = members.length || (Array.isArray(t?.memberUids) ? t.memberUids.length : 0);
  const playerCount = members.length;

  const missingHcpCount = useMemo(() => {
    let n = 0;
    (members || []).forEach((p) => {
      const h = p?.handicap;
      const num =
        typeof h === "number"
          ? h
          : h === null || h === undefined || h === ""
            ? NaN
            : Number(String(h).trim());
      if (!Number.isFinite(num)) n += 1;
    });
    return n;
  }, [members]);

  const canContinue = playerCount >= 2 && missingHcpCount === 0;

  async function handleContinue() {
    if (saving) return;

    if (playerCount < 2) {
      Alert.alert("Add players", "Add at least 2 players to continue.");
      return;
    }
    if (missingHcpCount > 0) {
      Alert.alert("Handicaps missing", "Every player needs a handicap before you continue.");
      return;
    }

    try {
      const patch = {
        playersReady: true,
        updatedAt: serverTimestamp(),
      };
      if (!fromOverview) patch.setupStep = "groups";

      await updateDoc(doc(db, "tournaments", tournamentId), patch);
    } catch (e) { }

    if (fromOverview) {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.navigate(returnTo, { tournamentId });
      return;
    }

    // NEW: go to Groups (tee times / pairings) before Formats
    navigation.navigate(ROUTES.TOURNAMENT_GROUPS, { tournamentId });

  }

  async function toggleRosterLock() {
    if (!isHost || !tournamentId) return;

    const next = !rosterLocked;

    Alert.alert(
      next ? "Lock roster?" : "Unlock roster?",
      next
        ? "This will prevent new players from joining and disable removals until you unlock it."
        : "This will allow new players to join again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: next ? "Lock" : "Unlock",
          style: next ? "destructive" : "default",
          onPress: async () => {
            setSaving(true);
            try {
              await updateDoc(doc(db, "tournaments", tournamentId), {
                rosterLocked: next,
                updatedAt: serverTimestamp(),
              });
            } catch (e) {
              Alert.alert("Update failed", e?.message || "Could not update roster lock.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  const canSwipe = isHost && !rosterLocked && !saving;

  function playerNumberFor(uid) {
    const order = members.map((m) => String(m.uid || m.id || ""));
    const idx = order.indexOf(String(uid || ""));
    return idx >= 0 ? idx + 1 : null;
  }

  function renderRow({ item }) {
    const uid = String(item?.uid || item?.id || "");
    const isOwner = uid && ownerUid && uid === ownerUid;
    const isGuest = !!item?.isGuest;

    const displayName = String(item?.displayName || "").trim();
    const hcpRaw = item?.handicap;
    const hcp = String(hcpRaw ?? "").trim();
    const pnum = playerNumberFor(uid);

    const sub = isOwner ? "Tournament Organizer" : isGuest ? "Guest" : "Player";
    const badge = isOwner ? "P1" : pnum ? `P${pnum}` : "P";

    const hNum =
      typeof hcpRaw === "number"
        ? hcpRaw
        : hcpRaw === null || hcpRaw === undefined || hcpRaw === ""
          ? NaN
          : Number(String(hcpRaw).trim());
    const hasHcp = Number.isFinite(hNum);

    const isAlt = pnum ? pnum % 2 === 0 : false;

    const rowInner = (
      <View
        style={[
          styles.row,
          !hasHcp && isAlt && styles.rowAlt,
          styles.playerRow,
          hasHcp && styles.playerRowReady,
          hasHcp && (isAlt ? styles.playerRowReadyB : styles.playerRowReadyA),
        ]}
      >
        <View style={styles.rowTop}>
          <View style={styles.rowLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsFromName(displayName, isOwner ? "P1" : "P")}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {displayName ||
                  (isOwner ? "Organizer (name not set)" : isGuest ? "Guest (name not set)" : "Player (name not set)")}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {sub}
                {hcp ? ` • HCP ${hcp}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.pill}>
            <Text style={styles.pillText}>{badge}</Text>
          </View>
        </View>
      </View>
    );

    if (!canSwipe) return <View style={styles.swipeWrap}>{rowInner}</View>;

    return (
      <View style={styles.swipeWrap}>
        <PremiumSwipeRow
          openSwipeRef={openSwipeRef}
          closeAnyOpenSwipe={closeAnyOpenSwipe}
          enabled={canSwipe}
          actionWidth={120}
          friction={2}
          threshold={48}
          radius={18}
          borderColor={theme.border}
          backgroundColor={theme.card2}
          editColor={"rgba(15,122,74,0.92)"}
          deleteColor={isDark ? "rgba(220, 52, 52, 0.92)" : "rgba(190, 40, 40, 0.92)"}
          onEdit={() => openEditPlayer(item)}
          onDelete={isOwner ? null : () => removePlayer(item)}
        >
          {rowInner}
        </PremiumSwipeRow>
      </View>
    );
  }

  function renderBuddyRow({ item }) {
    const uid = String(item?.buddyUid || item?.uid || item?.id || "");
    const displayName = String(item?.displayName || item?.name || "").trim();
    const hcp = String(item?.handicap ?? "").trim();
    const email = String(item?.email || "").trim();

    const isSelected = !!buddySelected?.[uid];
    const isAlreadyInRoster = uid && existingMemberUidSet.has(uid);
    const isOrganizer = uid && ownerUid && uid === ownerUid;

    const disabled = !uid || isAlreadyInRoster || isOrganizer;

    const metaBits = [];
    if (hcp) metaBits.push(`HCP ${hcp}`);
    if (email) metaBits.push(email);
    if (isOrganizer) metaBits.push("Organizer");
    else if (isAlreadyInRoster) metaBits.push("Already added");

    const meta = metaBits.join(" • ");

    return (
      <Pressable
        onPress={() => {
          if (disabled) return;
          toggleBuddy(uid);
        }}
        style={({ pressed }) => [
          styles.buddyRow,
          isSelected && styles.buddyRowSelected,
          disabled && { opacity: 0.55 },
          pressed && !disabled && styles.pressed,
        ]}
      >
        <View style={styles.buddyLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsFromName(displayName, "B")}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.buddyName} numberOfLines={1}>
              {displayName || "Buddy (name not set)"}
            </Text>
            {meta ? (
              <Text style={styles.buddyMeta} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.checkPill, isSelected && styles.checkPillOn]}>
          <Text style={styles.checkText}>{disabled ? "Locked" : isSelected ? "Selected" : "Select"}</Text>
        </View>
      </Pressable>
    );
  }

  const primaryLabel = fromOverview ? "Save and return to overview" : "Continue to groups";

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Players" subtitle="Add Players." />

      <FlatList
        data={[
          { _type: "code", key: "code" },
          { _type: "organizer", key: "organizer" },
          { _type: "add", key: "add" },
          { _type: "section", key: "section" },
          ...(canSwipe ? [{ _type: "swipeHint", key: "swipeHint" }] : []),
          ...members.map((m) => ({ _type: "member", key: `m:${m.uid || m.id}`, ...m })),
          { _type: "end", key: "end" },
        ]}
        keyExtractor={(x) => x.key}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item._type === "code") {
            return (
              <View style={styles.codeCard}>
                <View style={styles.codeTop}>
                  <Text style={styles.codeLabel}>Join Code</Text>
                  <Text style={styles.codeValue}>{joinCode || "—"}</Text>
                </View>

                <View style={styles.codeActions}>
                  <Pressable onPress={shareInvite} style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}>
                    <Text style={styles.smallBtnText}>Share Invite</Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      Alert.alert(
                        "How to Join",
                        "Open Legacy Golf → Games → Tournaments → Join with Code, then enter this join code."
                      )
                    }
                    style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.smallBtnText}>How to Join</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          if (item._type === "organizer") {
            return (
              <View style={styles.organizerCard}>
                <Text style={styles.orgTitle}>Tournament Organizer</Text>
                <Text style={styles.orgSub}>Player 1</Text>

                <View style={styles.orgLines}>
                  <Text style={styles.orgLine}>Name: {organizer.name || "—"}</Text>
                  <Text style={styles.orgLine}>Handicap: {String(organizer.handicap || "—")}</Text>
                  <Text style={styles.orgLine}>Phone: {organizer.phone || "—"}</Text>
                  <Text style={styles.orgLine}>Email: {organizer.email || "—"}</Text>
                </View>

                {isHost ? (
                  <Pressable
                    onPress={() => {
                      Keyboard.dismiss();
                      setOrgOpen(true);
                    }}
                    style={({ pressed }) => [styles.orgBtn, pressed && styles.pressed]}
                  >
                    <Text style={styles.orgBtnText}>Edit Organizer</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }

          if (item._type === "add") {
            return (
              <View style={styles.addCard}>
                <Text style={styles.addTitle}>Add Players</Text>
                <Text style={styles.addSub}>Add from Buddy List, add a Guest, or send an invitation (SMS coming next).</Text>

                {isHost ? (
                  <Pressable
                    onPress={openAddPlayers}
                    style={({ pressed }) => [styles.addBtn, pressed && styles.pressed, rosterLocked && { opacity: 0.6 }]}
                    disabled={rosterLocked}
                  >
                    <Text style={styles.addBtnText}>{rosterLocked ? "Unlock roster to add" : "Add Players"}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }

          if (item._type === "section") return <Text style={styles.sectionTitle}>{`Players • ${rosterCount}`}</Text>;

          if (item._type === "swipeHint") {
            return (
              <Text style={[styles.rowSub, { marginTop: -6, marginBottom: 10, opacity: 0.55 }]}>
                Swipe right to edit • Swipe left to delete
              </Text>
            );
          }

          if (item._type === "end") {
            if (loadingM) return null;
            if (!members.length) {
              return (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No players yet</Text>
                  <Text style={styles.emptySub}>Share the join code or add guests/buddies as host.</Text>
                </View>
              );
            }
            return null;
          }

          return renderRow({ item });
        }}
      />

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.footerBtn,
              styles.primaryBtn,
              pressed && canContinue && styles.pressed,
              (!canContinue || saving) && { opacity: 0.6 },
            ]}
            disabled={!canContinue || saving}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>
        </View>
      </View>


      {/* Setup modal */}
      <Modal visible={setupOpen} transparent animationType="fade" onRequestClose={() => setSetupOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setSetupOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Tournament Setup</Text>
                <Text style={styles.modalSub}>Jump back to any setup step.</Text>

                <View style={styles.optionList}>
                  <Pressable onPress={() => goSetup(ROUTES.TOURNAMENT_ROUNDS)} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <Text style={styles.optionTitle}>Edit Rounds</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable onPress={() => goSetup(ROUTES.TOURNAMENT_COURSE)} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <Text style={styles.optionTitle}>Edit Courses</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable onPress={() => goSetup(ROUTES.TOURNAMENT_TEES)} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <Text style={styles.optionTitle}>Edit Tees</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable onPress={() => goSetup(ROUTES.TOURNAMENT_FORMATS)} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <Text style={styles.optionTitle}>Edit Formats</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable onPress={() => goSetup(ROUTES.TOURNAMENT_PLAYERS_SETUP)} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <Text style={styles.optionTitle}>Edit Players</Text>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>
                </View>

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setSetupOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                  >
                    <Text style={styles.modalBtnText}>Close</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setSetupOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed]}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>Done</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Add Players options */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setAddOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Add Players</Text>
                <Text style={styles.modalSub}>Choose how you want to add players.</Text>

                <View style={styles.optionList}>
                  <Pressable onPress={openBuddyPicker} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>Add Buddies from List</Text>
                      <Text style={styles.optionSub}>Pick one or more buddies and add them to this tournament.</Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable onPress={openGuest} style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>Add Guest</Text>
                      <Text style={styles.optionSub}>Manual entry (name + handicap required). Phone/email optional.</Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Open</Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setAddOpen(false);
                      Alert.alert("Invite by SMS", "Premium automated SMS invite is coming next.");
                    }}
                    style={({ pressed }) => [styles.optionItem, pressed && styles.pressed]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>Invite by SMS (Join with Code)</Text>
                      <Text style={styles.optionSub}>Send an invite link + join code by text message.</Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text style={styles.optionRightText}>Next</Text>
                    </View>
                  </Pressable>
                </View>

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setAddOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                  >
                    <Text style={styles.modalBtnText}>Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Buddy picker modal */}
      <Modal visible={buddyOpen} transparent animationType="fade" onRequestClose={() => setBuddyOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setBuddyOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Select Buddies</Text>
                <Text style={styles.modalSub}>Choose one or more buddies to add to the roster (saved to the cloud).</Text>

                <TextInput
                  value={buddySearch}
                  onChangeText={setBuddySearch}
                  placeholder="Search buddies"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="none"
                />

                {buddyLoading ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>Loading Buddy List…</Text>
                    <Text style={styles.emptySub}>Pulling your buddies from the cloud.</Text>
                  </View>
                ) : filteredBuddies.length ? (
                  <FlatList data={filteredBuddies} keyExtractor={(x) => String(x.buddyUid || x.uid || x.id)} renderItem={renderBuddyRow} scrollEnabled={false} />
                ) : (
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No buddies found</Text>
                    <Text style={styles.emptySub}>Add buddies in your Buddy List first, then come back here.</Text>
                  </View>
                )}

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setBuddyOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={addSelectedBuddiesToTournament}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed, (!selectedCount || saving) && { opacity: 0.6 }]}
                    disabled={!selectedCount || saving}
                  >
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>
                      {saving ? "Adding..." : selectedCount ? `Add Selected (${selectedCount})` : "Add Selected"}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Organizer edit modal */}
      <Modal visible={orgOpen} transparent animationType="fade" onRequestClose={() => setOrgOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setOrgOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Tournament Organizer</Text>
                <Text style={styles.modalSub}>Player 1 details (saved to the cloud).</Text>

                <TextInput
                  value={orgName}
                  onChangeText={setOrgName}
                  placeholder="Organizer name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                />
                <TextInput
                  value={orgHandicap}
                  onChangeText={setOrgHandicap}
                  placeholder="Handicap"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="number-pad"
                />
                <TextInput
                  value={orgPhone}
                  onChangeText={setOrgPhone}
                  placeholder="Phone (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                <TextInput
                  value={orgEmail}
                  onChangeText={setOrgEmail}
                  placeholder="Email (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setOrgOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable onPress={saveOrganizer} style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed]} disabled={saving}>
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>{saving ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Guest modal */}
      <Modal visible={guestOpen} transparent animationType="fade" onRequestClose={() => setGuestOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setGuestOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Add Guest</Text>
                <Text style={styles.modalSub}>Name + handicap are required. Phone/email optional.</Text>

                <TextInput
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="Guest name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                />
                <TextInput
                  value={guestHandicap}
                  onChangeText={setGuestHandicap}
                  placeholder="Handicap"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="number-pad"
                />
                <TextInput
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  placeholder="Phone (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                <TextInput
                  value={guestEmail}
                  onChangeText={setGuestEmail}
                  placeholder="Email (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setGuestOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable onPress={addGuestNow} style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed]} disabled={saving}>
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>{saving ? "Saving..." : "Add Guest"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Edit Player modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setEditOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => { }}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>{editIsGuest ? "Edit Guest" : "Edit Player"}</Text>
                <Text style={styles.modalSub}>Update name, handicap, and optional contact details.</Text>

                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Name"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  autoCapitalize="words"
                />
                <TextInput
                  value={editHcp}
                  onChangeText={setEditHcp}
                  placeholder="Handicap"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="number-pad"
                />
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Phone (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="phone-pad"
                />
                <TextInput
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="Email (optional)"
                  placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <View style={styles.modalBtnRow}>
                  <Pressable
                    onPress={() => {
                      setEditOpen(false);
                      Keyboard.dismiss();
                    }}
                    style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.pressed]}
                    disabled={saving}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>

                  <Pressable onPress={savePlayerEdit} style={({ pressed }) => [styles.modalBtn, styles.modalBtnSave, pressed && styles.pressed]} disabled={saving}>
                    <Text style={[styles.modalBtnText, styles.modalBtnTextSave]}>{saving ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
