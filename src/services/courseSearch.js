// src/services/courseSearch.js
// Unified course search for Legacy Golf
// - Uses local list immediately
// - Uses GolfCourseAPI ONLY during setup/search (never during live play)
// - Safe fallback: if API fails, local still works

import { COURSES_LOCAL } from "../data/coursesLocal";
import { searchCourses as apiSearchCourses } from "../api/golfCourseApi";

function safeStr(x) {
    return String(x == null ? "" : x);
}

function norm(s) {
    return safeStr(s).trim().toLowerCase();
}

function asLocalResult(c) {
    const id = safeStr(c?.id || "").trim();
    const name = safeStr(c?.name || "").trim();
    return {
        id,
        name,
        source: "local",
        clubName: "",
        city: "",
        state: "",
        country: "",
        raw: null,
    };
}

function asApiResult(x) {
    // Our api wrapper normalizes to: { id, courseName, clubName, city, state, country, raw }
    const id = safeStr(x?.id || "").trim();
    const name = safeStr(x?.courseName || x?.name || "").trim();
    return {
        id,
        name,
        source: "api",
        clubName: safeStr(x?.clubName || "").trim(),
        city: safeStr(x?.city || "").trim(),
        state: safeStr(x?.state || "").trim(),
        country: safeStr(x?.country || "").trim(),
        raw: x?.raw || null,
    };
}

function dedupeByIdThenName(list) {
    const out = [];
    const seenId = new Set();
    const seenName = new Set();

    for (const it of list) {
        const id = safeStr(it?.id || "").trim();
        const name = safeStr(it?.name || "").trim();

        if (id && seenId.has(id)) continue;
        if (!id && name && seenName.has(norm(name))) continue;

        if (id) seenId.add(id);
        if (name) seenName.add(norm(name));

        out.push(it);
    }

    return out;
}

function sortResults(list) {
    // Light preference: local first when query is short; otherwise just alphabetical
    return [...list].sort((a, b) => safeStr(a?.name).localeCompare(safeStr(b?.name)));
}

export async function searchCoursesUnified(query, opts = {}) {
    const q = safeStr(query).trim();
    const limit = Number.isFinite(Number(opts?.limit)) ? Number(opts.limit) : 50;

    // Always include local results (filter client-side)
    const localAll = Array.isArray(COURSES_LOCAL) ? COURSES_LOCAL.map(asLocalResult) : [];
    const qn = norm(q);

    const localFiltered = !qn
        ? localAll
        : localAll.filter((c) => {
            const name = norm(c?.name);
            const id = norm(c?.id);
            return name.includes(qn) || id.includes(qn);
        });

    // Only call API when user has typed enough to be intentional
    // (keeps usage low and avoids “spam” calls)
    if (qn.length < 3) {
        return sortResults(localFiltered).slice(0, limit);
    }

    try {
        const apiList = await apiSearchCourses(q, { limit: Math.min(25, limit) });
        const apiResults = Array.isArray(apiList) ? apiList.map(asApiResult) : [];

        // Merge: local + api (dedupe)
        const merged = dedupeByIdThenName([...localFiltered, ...apiResults]);

        return sortResults(merged).slice(0, limit);
    } catch (e) {
        // API down? key issue? network? -> still return local
        return sortResults(localFiltered).slice(0, limit);
    }
}
