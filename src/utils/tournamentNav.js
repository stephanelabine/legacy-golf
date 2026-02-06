// src/utils/tournamentNav.js

export const TOURNAMENT_NAV_REQUIRED_KEYS = ["tournamentId", "roundNumber", "roundId", "holeNumber"];

export function pickTournamentNavParams(params) {
    const p = params || {};

    const tournamentId = p?.tournamentId != null ? String(p.tournamentId) : "";
    const roundNumber = Number(p?.roundNumber || 1);
    const roundId = p?.roundId != null ? String(p.roundId).trim() : "";
    const holeNumber = Number(p?.holeNumber ?? p?.hole ?? 1);

    const totalHoles = Number(p?.totalHoles || 18);

    const groupPlayerIds = Array.isArray(p?.groupPlayerIds) ? p.groupPlayerIds.map(String) : null;

    const sideGameKey = p?.sideGameKey != null ? String(p.sideGameKey) : null;

    const courseId = p?.courseId != null ? String(p.courseId) : null;
    const courseName = p?.courseName != null ? String(p.courseName) : null;
    const teeName = p?.teeName != null ? String(p.teeName) : null;

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

export function assertTournamentNavParams(params, screenName = "TournamentScreen") {
    const p = pickTournamentNavParams(params);

    const missing = [];
    if (!p.tournamentId) missing.push("tournamentId");
    if (!Number.isFinite(Number(p.roundNumber))) missing.push("roundNumber");
    if (!p.roundId) missing.push("roundId");
    if (!Number.isFinite(Number(p.holeNumber))) missing.push("holeNumber");

    if (missing.length) {
        const msg = `[LegacyGolf] Missing tournament nav params on ${screenName}: ${missing.join(
            ", "
        )}. Params keys: ${Object.keys(params || {}).join(", ")}`;

        // DEV-only loud failure mode
        if (__DEV__) {
            // eslint-disable-next-line no-console
            console.error(msg);
        }
    }

    return { ok: missing.length === 0, missing, picked: p };
}
