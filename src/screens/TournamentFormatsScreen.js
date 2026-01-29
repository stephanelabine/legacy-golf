// src/screens/TournamentFormatsScreen.js
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  TextInput,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  getDocs,
} from "firebase/firestore";

import ROUTES from "../navigation/routes";
import ScreenHeader from "../components/ScreenHeader";
import { useTheme } from "../theme/ThemeProvider";
import { db } from "../firebase/firebase";

const TEAM_VS_TEAM_TYPE = "hackers_slackers";

const FORMAT_LIBRARY = [
  {
    type: "kp",
    title: "KP",
    subtitle: "Closest to the pin",
    needsHoles: true,
    info:
      "KP (Closest to the Pin): pick one or more holes for this round (usually all par 3s). Winner is confirmed by the group/organizer.",
  },
  {
    type: "second_shot_kp",
    title: "Second Shot KP",
    subtitle: "Closest after second shot",
    needsHoles: true,
    info:
      "Second Shot KP: pick one or more holes for this round. Closest-to-the-pin from second shots (often par 5 approaches). Winner is confirmed by the group/organizer.",
  },
  {
    type: "long_drive",
    title: "Long Drive",
    subtitle: "Longest drive on a hole",
    needsHoles: true,
    info:
      "Long Drive: pick one or more holes for this round. Later we’ll support pin-drop + peer validation. For now, organizer/group confirms the winner.",
  },
  {
    type: "deuce_pot",
    title: "Deuce Pot",
    subtitle: "Split pot among all deuces",
    needsHoles: false,
    info:
      "Deuce Pot: every deuce made in the round counts. The pot is split evenly among deuce makers. Example: $10 x 10 players = $100. If 5 deuces are made, each deuce pays $20.",
  },
  {
    type: "hackers_slackers",
    title: "Team vs Team",
    subtitle: "Team vs Team • Net points",
    needsHoles: false,
    info:
      "Hackers vs Slackers (Team vs Team): players are split into two teams. Each day a Hacker plays a Slacker. Win = 1 point, tie = 0.5 each. Handicap is required (net). You can choose Match Play (net) or Stroke Play (net) for how each pairing is decided. Team totals are tracked across the tournament.",
  },
  {
    type: "putting_contest",
    title: "Putting Contest",
    subtitle: "Lowest total putts wins",
    needsHoles: false,
    info:
      "Putting Contest: tracks total putts across the tournament (and by round). Lowest total putts wins. Ties are handled by the organizer (putt-off / split / etc.).",
  },
  {
    type: "skins",
    title: "Skins",
    subtitle: "Net skins carry over",
    needsHoles: false,
    info:
      "Skins: in net play, skins are won outright after handicap adjustments. If not won outright, the skin carries over. Exact carryover/wash rules can be organizer-defined later.",
  },
];

function roundIdFromIndex(n) {
  const v = Number(n);
  const i = !Number.isFinite(v) || v < 1 ? 1 : Math.floor(v);
  return `r${i}`;
}

function normalizeHoles(value) {
  if (Array.isArray(value)) {
    const clean = value
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n >= 1)
      .map((n) => Math.floor(n));
    return Array.from(new Set(clean)).sort((a, b) => a - b);
  }

  const n = Number(value);
  if (Number.isFinite(n) && n >= 1) return [Math.floor(n)];
  return [];
}

function formatMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  const fixed = Math.round(v * 100) / 100;
  return fixed % 1 === 0 ? `$${fixed.toFixed(0)}` : `$${fixed.toFixed(2)}`;
}

function getEntryFeeValue(f) {
  const a = Number(f?.entryFee);
  if (Number.isFinite(a)) return a;
  const b = Number(f?.buyIn);
  if (Number.isFinite(b)) return b;
  return null;
}

function roundsLabel(selected) {
  const xs = (Array.isArray(selected) ? selected : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  if (!xs.length) return "Round";
  if (xs.length === 1) return `Round ${xs[0]}`;
  return `Rounds ${xs.join(" & ")}`;
}

export default function TournamentFormatsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { scheme, theme } = useTheme();
  const isDark = scheme === "dark";

  const tournamentId = route?.params?.tournamentId;

  const [t, setT] = useState(null);

  // Multi-select rounds (primary round is the first one)
  const [selectedRounds, setSelectedRounds] = useState([1]);
  const primaryRound = Number(selectedRounds?.[0] || 1);

  const [formats, setFormats] = useState([]);

  const [holesCount, setHolesCount] = useState(18);

  // add modal
  const [addOpen, setAddOpen] = useState(false);

  // holes modal
  const [holesOpen, setHolesOpen] = useState(false);
  const [holesForType, setHolesForType] = useState("");
  const [holesDraft, setHolesDraft] = useState([]);

  // entry fee modal
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeForType, setFeeForType] = useState("");
  const [feeValue, setFeeValue] = useState("");

  const footerPad = Math.max(18, (insets?.bottom || 0) + 14);

  const roundsTotal = Math.max(1, Number(t?.roundsTotal || 1));
  const tournamentName = String(t?.name || t?.tournamentName || "Tournament").trim();

  // Keep selected rounds valid when roundsTotal changes
  useEffect(() => {
    setSelectedRounds((prev) => {
      const cur = Array.isArray(prev) ? prev : [1];
      const cleaned = cur
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= roundsTotal);

      if (!cleaned.length) return [1];
      // Dedup + sort
      const uniq = Array.from(new Set(cleaned)).sort((a, b) => a - b);
      return uniq;
    });
  }, [roundsTotal]);

  useEffect(() => {
    if (!tournamentId) {
      Alert.alert("Missing tournament", "No tournamentId provided.");
      navigation.goBack();
      return;
    }

    const ref = doc(db, "tournaments", tournamentId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setT(data);

        const rt = Math.max(1, Number(data?.roundsTotal || 1));
        setSelectedRounds((prev) => {
          const cur = Array.isArray(prev) ? prev : [1];
          const cleaned = cur
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n >= 1 && n <= rt);
          if (!cleaned.length) return [1];
          const uniq = Array.from(new Set(cleaned)).sort((a, b) => a - b);
          return uniq;
        });
      },
      (err) => Alert.alert("Tournament error", err?.message || "Could not load tournament.")
    );

    return () => unsub();
  }, [tournamentId, navigation]);

  // formats per PRIMARY round
  useEffect(() => {
    if (!tournamentId) return;

    const rid = roundIdFromIndex(primaryRound);
    const fref = collection(db, "tournaments", tournamentId, "rounds", rid, "formats");

    const unsub = onSnapshot(
      fref,
      (snap) => {
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        rows.sort((a, b) => String(a?.type || a?.id || "").localeCompare(String(b?.type || b?.id || "")));
        setFormats(rows);
      },
      (err) => Alert.alert("Formats error", err?.message || "Could not load formats.")
    );

    return () => unsub();
  }, [tournamentId, primaryRound]);

  // load course holes count (best-effort) for PRIMARY round
  useEffect(() => {
    let alive = true;

    async function loadRoundMeta() {
      if (!tournamentId) return;

      try {
        const rid = roundIdFromIndex(primaryRound);
        const rdocRef = doc(db, "tournaments", tournamentId, "rounds", rid);
        const rSnap = await getDoc(rdocRef);

        const courseId = rSnap.exists() ? String(rSnap.data()?.courseId || "").trim() : "";
        if (!courseId) {
          if (alive) setHolesCount(18);
          return;
        }

        const cRef = doc(db, "courses", courseId);
        const cSnap = await getDoc(cRef);

        let hc = 18;
        if (cSnap.exists()) {
          const c = cSnap.data() || {};
          if (Number.isFinite(Number(c?.holeCount))) hc = Math.max(1, Math.min(36, Number(c.holeCount)));
          else if (Array.isArray(c?.holes)) hc = Math.max(1, Math.min(36, c.holes.length));
          else if (Array.isArray(c?.holeMeta)) hc = Math.max(1, Math.min(36, c.holeMeta.length));
        }

        if (alive) setHolesCount(hc || 18);
      } catch (e) {
        if (alive) setHolesCount(18);
      }
    }

    loadRoundMeta();
    return () => {
      alive = false;
    };
  }, [tournamentId, primaryRound]);

  const styles = useMemo(() => {
    const softBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(10,15,26,0.12)";
    const softBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(10,15,26,0.06)";

    const goldBorder = isDark ? "rgba(255, 210, 92, 0.60)" : "rgba(255, 210, 92, 0.62)";
    const goldBg = isDark ? "rgba(255, 210, 92, 0.08)" : "rgba(255, 210, 92, 0.12)";

    const green = "rgba(15,122,74,0.92)";
    const greenRing = isDark ? "rgba(15,122,74,0.60)" : "rgba(15,122,74,0.70)";
    const greenBg = isDark ? "rgba(15,122,74,0.18)" : "rgba(15,122,74,0.16)";

    const inkBtn = isDark ? "rgba(46,125,255,0.92)" : "rgba(10,15,26,0.92)";

    return StyleSheet.create({
      screen: { flex: 1, backgroundColor: theme.bg },
      content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 190 },

      hero: {
        borderRadius: 20,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: goldBorder,
        backgroundColor: goldBg,
        marginBottom: 12,
      },
      heroTitle: { color: theme.text, fontSize: 17, fontWeight: "900", textAlign: "center" },
      heroSub: { marginTop: 4, color: theme.text, opacity: 0.74, fontSize: 12, fontWeight: "900", textAlign: "center" },

      roundBar: {
        borderRadius: 18,
        padding: 12,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 12,
      },
      roundLabel: {
        color: theme.text,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
        textAlign: "center",
      },

      roundGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 10,
      },
      roundCell: {
        paddingVertical: 8,
        alignItems: "center",
        justifyContent: "center",
      },
      roundBubble: {
        aspectRatio: 1,
        width: 56,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        alignItems: "center",
        justifyContent: "center",
      },
      roundBubbleActive: { borderColor: greenRing, backgroundColor: greenBg },
      roundBubbleText: { color: theme.text, fontSize: 13, fontWeight: "900" },

      sectionTitle: {
        marginTop: 4,
        marginBottom: 10,
        color: theme.text,
        fontSize: 13,
        fontWeight: "900",
        letterSpacing: 1.4,
        opacity: 0.75,
        textTransform: "uppercase",
      },

      formatCard: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: theme.card2,
        marginBottom: 10,
      },
      formatTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
      formatTitle: { flex: 1, color: theme.text, fontSize: 15, fontWeight: "900" },

      toggle: {
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      toggleOn: { borderColor: greenRing, backgroundColor: greenBg },
      toggleText: { color: theme.text, fontSize: 12, fontWeight: "900", opacity: 0.95 },

      formatSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "800", lineHeight: 18 },

      metaLine: { marginTop: 8, color: theme.text, opacity: 0.82, fontSize: 12, fontWeight: "900" },

      chipsRow: { marginTop: 10 },
      chipsLabel: { color: theme.text, opacity: 0.72, fontSize: 12, fontWeight: "900", marginBottom: 8 },
      chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

      chip: {
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        alignItems: "center",
        justifyContent: "center",
      },
      chipActive: { borderColor: greenRing, backgroundColor: greenBg },
      chipText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      actionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
      pillBtn: {
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      pillBtnActive: { borderColor: greenRing, backgroundColor: greenBg },
      pillBtnText: { color: theme.text, fontSize: 12, fontWeight: "900" },

      infoBtn: {
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: "auto",
      },
      infoText: { color: theme.text, fontSize: 14, fontWeight: "900" },

      addBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: green,
        borderWidth: 1,
        borderColor: greenRing,
        marginTop: 10,
        marginBottom: 14,
      },
      addText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.3 },

      empty: {
        borderRadius: 18,
        padding: 14,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      emptyTitle: { color: theme.text, fontSize: 14, fontWeight: "900", textAlign: "center" },
      emptySub: {
        marginTop: 8,
        color: theme.text,
        opacity: 0.72,
        fontSize: 12,
        fontWeight: "800",
        textAlign: "center",
        lineHeight: 18,
      },

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
      primaryBtn: {
        height: 56,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: inkBtn,
      },
      primaryBtnDisabled: { opacity: 0.45 },
      primaryText: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 0.4 },

      helper: {
        marginTop: 10,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: softBorder,
        backgroundColor: softBg,
      },
      helperText: { color: theme.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 17, textAlign: "center" },

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
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.bg,
      },
      modalTitle: { color: theme.text, fontSize: 18, fontWeight: "900", textAlign: "center" },
      modalSub: { marginTop: 8, color: theme.text, opacity: 0.72, fontSize: 13, fontWeight: "700", lineHeight: 18, textAlign: "center" },

      choiceBtn: {
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
        marginTop: 10,
      },
      choiceText: { color: theme.text, fontSize: 15, fontWeight: "900" },

      holeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 10 },
      holeBtn: {
        width: 62,
        height: 50,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      holeBtnActive: { backgroundColor: greenBg, borderColor: greenRing },
      holeText: { color: theme.text, fontSize: 14, fontWeight: "900" },

      input: {
        marginTop: 12,
        height: 52,
        borderRadius: 16,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.card2,
        color: theme.text,
        fontSize: 16,
        fontWeight: "900",
        textAlign: "center",
      },

      modalRow: { flexDirection: "row", gap: 10, marginTop: 12 },
      modalBtn: {
        flex: 1,
        height: 52,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: softBg,
        borderWidth: 1,
        borderColor: softBorder,
      },
      modalBtnPrimary: { backgroundColor: green, borderColor: greenRing },
      modalBtnText: { color: theme.text, fontSize: 14, fontWeight: "900" },
      modalBtnTextPrimary: { color: "#fff" },
    });
  }, [theme, isDark, footerPad]);

  const enabledCount = useMemo(() => (formats || []).filter((f) => !!f?.enabled).length, [formats]);
  const canContinue = enabledCount >= 1;

  function toggleRoundSelection(i) {
    const n = Number(i);
    if (!Number.isFinite(n) || n < 1 || n > roundsTotal) return;

    setSelectedRounds((prev) => {
      const cur = Array.isArray(prev) ? [...prev] : [1];
      const has = cur.includes(n);

      // If only one selected and user taps it again, keep it selected.
      if (has && cur.length === 1) return cur;

      let next;
      if (has) next = cur.filter((x) => x !== n);
      else next = [...cur, n];

      next = Array.from(new Set(next)).sort((a, b) => a - b);

      // Ensure primary round is first item
      return next.length ? next : [1];
    });
  }

  async function applyToSelectedRounds(asyncPerRoundRid) {
    const rounds = Array.isArray(selectedRounds) && selectedRounds.length ? selectedRounds : [1];
    for (const r of rounds) {
      const rid = roundIdFromIndex(r);
      // eslint-disable-next-line no-await-in-loop
      await asyncPerRoundRid(rid, r);
    }
  }

  async function addFormat(type) {
    if (!tournamentId) return;

    const lib = FORMAT_LIBRARY.find((x) => x.type === type);
    if (!lib) return;

    const now = serverTimestamp();

    const base = {
      type,
      title: lib.title,
      subtitle: lib.subtitle,
      enabled: true,
      holes: [],
      entryFee: null,
      buyIn: null,
      createdAt: now,
      updatedAt: now,

      // Special defaults for Hackers vs Slackers
      ...(type === TEAM_VS_TEAM_TYPE
        ? {
            scoringMode: "match", // "match" or "stroke"
            tiePoints: 0.5,
            requiresHandicap: true,
            teams: ["Hackers", "Slackers"],
          }
        : {}),
    };

    try {
      await applyToSelectedRounds(async (rid) => {
        const fdoc = doc(db, "tournaments", tournamentId, "rounds", rid, "formats", type);
        await setDoc(fdoc, base, { merge: true });
      });

      setAddOpen(false);

      if (lib.needsHoles) {
        setHolesForType(type);
        setHolesDraft([]);
        setHolesOpen(true);
      }
    } catch (e) {
      Alert.alert("Add format failed", e?.message || "Could not add format.");
    }
  }

  async function toggleEnabled(f) {
    if (!tournamentId) return;
    const type = String(f?.type || f?.id || "").trim();
    if (!type) return;

    try {
      await applyToSelectedRounds(async (rid) => {
        const fdoc = doc(db, "tournaments", tournamentId, "rounds", rid, "formats", type);
        await updateDoc(fdoc, { enabled: !f?.enabled, updatedAt: serverTimestamp() });
      });
    } catch (e) {
      Alert.alert("Update failed", e?.message || "Could not update format.");
    }
  }

  async function toggleTeamScoringMode(f) {
    if (!tournamentId) return;
    const type = String(f?.type || f?.id || "").trim();
    if (type !== TEAM_VS_TEAM_TYPE) return;

    const cur = String(f?.scoringMode || "match");
    const next = cur === "stroke" ? "match" : "stroke";

    try {
      await applyToSelectedRounds(async (rid) => {
        const fdoc = doc(db, "tournaments", tournamentId, "rounds", rid, "formats", type);
        await updateDoc(fdoc, { scoringMode: next, updatedAt: serverTimestamp() });
      });
    } catch (e) {
      Alert.alert("Update failed", e?.message || "Could not update scoring mode.");
    }
  }

  function showInfo(type) {
    const lib = FORMAT_LIBRARY.find((x) => x.type === type);
    if (!lib) return;
    Alert.alert(lib.title, lib.info);
  }

  function openHolesPicker(type) {
    const f = (formats || []).find((x) => String(x?.type || x?.id || "") === String(type));
    const existing = normalizeHoles(f?.holes ?? f?.hole);
    setHolesForType(type);
    setHolesDraft(existing);
    setHolesOpen(true);
  }

  function toggleHole(n) {
    const holeNum = Number(n);
    if (!Number.isFinite(holeNum) || holeNum < 1) return;

    setHolesDraft((prev) => {
      const cur = normalizeHoles(prev);
      if (cur.includes(holeNum)) return cur.filter((x) => x !== holeNum);
      return normalizeHoles([...cur, holeNum]);
    });
  }

  async function saveHoles() {
    if (!tournamentId) return;

    const type = String(holesForType || "").trim();
    if (!type) return;

    const selected = normalizeHoles(holesDraft);

    if (!selected.length) {
      Alert.alert("Pick holes", "Select at least one hole for this format.");
      return;
    }

    try {
      await applyToSelectedRounds(async (rid) => {
        const fdoc = doc(db, "tournaments", tournamentId, "rounds", rid, "formats", type);
        await updateDoc(fdoc, { holes: selected, hole: null, updatedAt: serverTimestamp() });
      });

      setHolesOpen(false);
      setHolesForType("");
      setHolesDraft([]);
    } catch (e) {
      Alert.alert("Save holes failed", e?.message || "Could not save holes.");
    }
  }

  function openFeePicker(type) {
    const f = (formats || []).find((x) => String(x?.type || x?.id || "") === String(type));
    const existing = getEntryFeeValue(f);
    setFeeForType(type);
    setFeeValue(Number.isFinite(Number(existing)) && Number(existing) > 0 ? String(existing) : "");
    setFeeOpen(true);
  }

  async function saveFee() {
    if (!tournamentId) return;

    const type = String(feeForType || "").trim();
    if (!type) return;

    const raw = String(feeValue || "").trim();

    let entryFee = null;
    if (raw) {
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) {
        Alert.alert("Entry fee", "Entry fee must be a number (example: 10 or 10.00).");
        return;
      }
      entryFee = Math.round(v * 100) / 100;
    }

    try {
      await applyToSelectedRounds(async (rid) => {
        const fdoc = doc(db, "tournaments", tournamentId, "rounds", rid, "formats", type);
        await updateDoc(fdoc, { entryFee, buyIn: null, updatedAt: serverTimestamp() });
      });

      Keyboard.dismiss();
      setFeeOpen(false);
      setFeeForType("");
      setFeeValue("");
    } catch (e) {
      Alert.alert("Save fee failed", e?.message || "Could not save entry fee.");
    }
  }

  async function roundHasEnabledFormats(roundNum) {
    const rid = roundIdFromIndex(roundNum);
    const fref = collection(db, "tournaments", tournamentId, "rounds", rid, "formats");
    const snap = await getDocs(fref);

    let enabled = 0;
    snap.forEach((d) => {
      const data = d.data() || {};
      if (data.enabled) enabled += 1;
    });

    return enabled >= 1;
  }

  async function handleContinue() {
    if (!tournamentId) return;

    // Only validate current primary round has at least one enabled
    if (!canContinue) {
      Alert.alert("Add formats", "Enable at least one format for this round to continue.");
      return;
    }

    // Validate ALL rounds before leaving this screen
    try {
      const missing = [];
      for (let i = 1; i <= roundsTotal; i++) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await roundHasEnabledFormats(i);
        if (!ok) missing.push(i);
      }

      if (missing.length) {
        const first = missing[0];
        Alert.alert(
          "Formats missing",
          `You still need formats for:\n\n• Round(s): ${missing.join(", ")}\n\nWe’ll jump you to the next one now.`,
          [{ text: "OK" }]
        );

        // Jump to first missing round (single-select it)
        setSelectedRounds([first]);
        return;
      }
    } catch (e) {
      // If validation fails for any reason, do not navigate away silently.
      Alert.alert("Check failed", e?.message || "Could not verify formats across rounds. Try again.");
      return;
    }

    // All rounds have formats: mark complete + go back to setup hub/review
    try {
      await updateDoc(doc(db, "tournaments", tournamentId), {
        formatsReady: true,
        setupStep: "review",
        updatedAt: serverTimestamp(),
      });
    } catch (e) {}

    navigation.navigate(ROUTES.TOURNAMENT_SETUP, { tournamentId });
  }

  function RoundChooser() {
    const cols = roundsTotal <= 4 ? roundsTotal : 4;
    const cellWidth = `${100 / cols}%`;

    const bubbles = [];
    for (let i = 1; i <= roundsTotal; i++) {
      const active = selectedRounds.includes(i);

      bubbles.push(
        <View key={`r-${i}`} style={[styles.roundCell, { width: cellWidth }]}>
          <Pressable
            onPress={() => toggleRoundSelection(i)}
            style={({ pressed }) => [styles.roundBubble, active && styles.roundBubbleActive, pressed && styles.pressed]}
          >
            <Text style={styles.roundBubbleText}>{i}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.roundBar}>
        <Text style={styles.roundLabel}>Choose rounds (tap to toggle)</Text>
        <View style={styles.roundGrid}>{bubbles}</View>
      </View>
    );
  }

  function FormatCard({ f }) {
    const type = String(f?.type || f?.id || "").trim();
    const lib = FORMAT_LIBRARY.find((x) => x.type === type);

    const title = String(lib?.title || f?.title || type || "Format");
    const sub = String(lib?.subtitle || f?.subtitle || "").trim();
    const needsHoles = !!lib?.needsHoles;

    const selectedHoles = normalizeHoles(f?.holes ?? f?.hole);
    const hasHoles = selectedHoles.length > 0;

    const entryFeeValue = getEntryFeeValue(f);
    const entryFeeLabel = formatMoney(entryFeeValue);
    const feeText = entryFeeLabel ? `Entry ${entryFeeLabel}` : "Set entry fee";

    const enabled = !!f?.enabled;

    const isTeam = type === TEAM_VS_TEAM_TYPE;
    const mode = String(f?.scoringMode || "match"); // match | stroke
    const modeLabel = mode === "stroke" ? "Stroke Play (Net)" : "Match Play (Net)";

    return (
      <View style={[styles.formatCard, !enabled && { opacity: 0.72 }]}>
        <View style={styles.formatTop}>
          <Text style={styles.formatTitle}>{title}</Text>

          <Pressable
            onPress={() => toggleEnabled(f)}
            style={({ pressed }) => [styles.toggle, enabled && styles.toggleOn, pressed && styles.pressed]}
          >
            <Text style={styles.toggleText}>{enabled ? "Enabled" : "Disabled"}</Text>
          </Pressable>
        </View>

        <Text style={styles.formatSub}>
          {sub || "Format"} {needsHoles ? "• Pick holes for this round." : "• Applies across the round."}
        </Text>

        {isTeam ? <Text style={styles.metaLine}>{`Scoring: ${modeLabel}`}</Text> : null}
        {isTeam ? <Text style={styles.metaLine}>Handicap required (net)</Text> : null}

        {entryFeeLabel ? <Text style={styles.metaLine}>{`${entryFeeLabel} entry`}</Text> : null}

        {needsHoles ? (
          <View style={styles.chipsRow}>
            <Text style={styles.chipsLabel}>Holes</Text>

            {hasHoles ? (
              <View style={styles.chipsWrap}>
                {selectedHoles.map((n) => (
                  <View key={`chip-${type}-${n}`} style={[styles.chip, styles.chipActive]}>
                    <Text style={styles.chipText}>{n}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.chipsWrap}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>—</Text>
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
  {needsHoles ? (
    <Pressable
      onPress={() => openHolesPicker(type)}
      style={({ pressed }) => [styles.pillBtn, hasHoles && styles.pillBtnActive, pressed && styles.pressed]}
    >
      <Text style={styles.pillBtnText}>{hasHoles ? "Edit holes" : "Pick holes"}</Text>
    </Pressable>
  ) : null}

  <Pressable
    onPress={() => openFeePicker(type)}
    style={({ pressed }) => [styles.pillBtn, entryFeeLabel && styles.pillBtnActive, pressed && styles.pressed]}
  >
    <Text style={styles.pillBtnText}>{feeText}</Text>
  </Pressable>

  {isTeam ? (
    <Pressable
      onPress={() => toggleTeamScoringMode(f)}
      style={({ pressed }) => [styles.pillBtn, styles.pillBtnActive, pressed && styles.pressed]}
    >
      <Text style={styles.pillBtnText}>{mode === "stroke" ? "Use match" : "Use stroke"}</Text>
    </Pressable>
  ) : null}


          <Pressable onPress={() => showInfo(type)} style={({ pressed }) => [styles.infoBtn, pressed && styles.pressed]}>
            <Text style={styles.infoText}>i</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader navigation={navigation} title="Tournament" subtitle="Formats" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{tournamentName}</Text>
          <Text style={styles.heroSub}>Formats</Text>
        </View>

        <RoundChooser />

        <Pressable onPress={() => setAddOpen(true)} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
          <Text style={styles.addText}>Add Formats</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>
          {roundsLabel(selectedRounds)} (editing Round {primaryRound})
        </Text>

        {formats.length ? (
          formats.map((f) => <FormatCard key={String(f?.type || f?.id || "")} f={f} />)
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No formats yet</Text>
            <Text style={styles.emptySub}>Tap “Add Formats” to add KP, Long Drive, Skins and more.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue}
          style={({ pressed }) => [
            styles.primaryBtn,
            !canContinue && styles.primaryBtnDisabled,
            pressed && canContinue && styles.pressed,
          ]}
        >
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>

        {!canContinue ? (
          <View style={styles.helper}>
            <Text style={styles.helperText}>Enable at least one format for this round to continue.</Text>
          </View>
        ) : null}
      </View>

      {/* Add Formats Modal */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Add formats</Text>
              <Text style={styles.modalSub}>These formats will apply to {roundsLabel(selectedRounds)}.</Text>

              {FORMAT_LIBRARY.map((x) => (
                <Pressable
                  key={x.type}
                  onPress={() => addFormat(x.type)}
                  style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.choiceText}>{x.title}</Text>
                </Pressable>
              ))}

              <View style={styles.modalRow}>
                <Pressable onPress={() => setAddOpen(false)} style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}>
                  <Text style={styles.modalBtnText}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Multi-hole Picker Modal */}
      <Modal visible={holesOpen} transparent animationType="fade" onRequestClose={() => setHolesOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setHolesOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Pick holes</Text>
              <Text style={styles.modalSub}>
                Select one or more holes for {roundsLabel(selectedRounds)}. (1–{holesCount || 18})
              </Text>

              <View style={styles.holeGrid}>
                {Array.from({ length: Math.max(1, holesCount || 18) }).map((_, i) => {
                  const n = i + 1;
                  const active = normalizeHoles(holesDraft).includes(n);
                  return (
                    <Pressable
                      key={`h-${n}`}
                      onPress={() => toggleHole(n)}
                      style={({ pressed }) => [styles.holeBtn, active && styles.holeBtnActive, pressed && styles.pressed]}
                    >
                      <Text style={styles.holeText}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalRow}>
                <Pressable
                  onPress={() => {
                    setHolesOpen(false);
                    setHolesForType("");
                    setHolesDraft([]);
                  }}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>

                <Pressable onPress={saveHoles} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}>
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Entry Fee Modal */}
      <Modal visible={feeOpen} transparent animationType="fade" onRequestClose={() => setFeeOpen(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setFeeOpen(false);
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>Entry fee</Text>
              <Text style={styles.modalSub}>Optional. Example: 10 or 10.00</Text>

              <TextInput
                value={feeValue}
                onChangeText={(s) => setFeeValue(String(s || "").replace(/[^0-9.]/g, ""))}
                placeholder="0"
                placeholderTextColor={isDark ? "rgba(255,255,255,0.35)" : "rgba(10,15,26,0.35)"}
                style={styles.input}
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                returnKeyType="done"
                onSubmitEditing={saveFee}
              />

              <View style={styles.modalRow}>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setFeeOpen(false);
                    setFeeForType("");
                    setFeeValue("");
                  }}
                  style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.modalBtnText}>Cancel</Text>
                </Pressable>

                <Pressable onPress={saveFee} style={({ pressed }) => [styles.modalBtn, styles.modalBtnPrimary, pressed && styles.pressed]}>
                  <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Save</Text>
                </Pressable>
              </View>

              <View style={styles.modalRow}>
                <Pressable onPress={() => setFeeValue("")} style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}>
                  <Text style={styles.modalBtnText}>Clear fee</Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}
