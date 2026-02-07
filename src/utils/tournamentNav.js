// src/utils/tournamentNav.js

export const TOURNAMENT_NAV_REQUIRED_KEYS = ["tournamentId", "roundNumber", "holeNumber"]; // roundId is derived

function toStr(x) {
    return String(x ?? "").trim();
}

function toNum(x, fallback) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

export function computeRoundId(tournamentId, roundNumber) {
    const t = toStr(tournamentId);
    const r = toNum(roundNumber, 1);
    if (!t) return "";
    return `${t}__r${r}`;
}

export function pickTournamentNavParams(params) {
    const p = params || {};

    const tournamentId = toStr(p.tournamentId);
    const roundNumber = toNum(p.roundNumber, 1);

    const roundIdIncoming = toStr(p.roundId);
    const roundId = roundIdIncoming || computeRoundId(tournamentId, roundNumber);

    const holeNumber = toNum(p.holeNumber ?? p.hole, 1);

    const totalHoles = toNum(p.totalHoles, 18);

    const groupPlayerIds = Array.isArray(p.groupPlayerIds) ? p.groupPlayerIds.map(String) : null;

    const sideGameKey = p.sideGameKey != null ? String(p.sideGameKey) : null;

    const courseId = p.courseId != null ? String(p.courseId) : null;
    const courseName = p.courseName != null ? String(p.courseName) : null;
    const teeName = p.teeName != null ? String(p.teeName) : null;

    return {
        tournamentId,
        roundNumber,
        roundId,
        holeNumber,
        totalHoles,
        groupPlayerIds,
        sideGameKey,
        courseId,
        courseName,
        teeName,
    };
}

const _seen = new Set();

export function assertTournamentNavParams(params, screenName = "TournamentScreen") {
    const picked = pickTournamentNavParams(params);

    const missing = [];
    if (!picked.tournamentId) missing.push("tournamentId");
    if (!Number.isFinite(Number(picked.roundNumber))) missing.push("roundNumber");
    if (!Number.isFinite(Number(picked.holeNumber))) missing.push("holeNumber");

    if (missing.length) {
        const msg = `[LegacyGolf] Missing tournament nav params on ${screenName}: ${missing.join(
            ", "
        )}. Params keys: ${Object.keys(params || {}).join(", ")}`;

        if (__DEV__) {
            const sig = `${screenName}::${missing.join("|")}::${Object.keys(params || {}).join(",")}`;
            if (!_seen.has(sig)) {
                _seen.add(sig);
                // eslint-disable-next-line no-console
                console.error(msg);
            }
        }
    }

    return { ok: missing.length === 0, missing, picked };
}
