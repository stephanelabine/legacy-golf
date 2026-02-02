Legacy Golf — Beta Readiness Plan (Target: May 1, 2026)

Purpose
This checklist defines the minimum, ordered build path required to run a real tournament (Hackers & Slackers) with confidence. It prioritizes stability, organizer workload reduction, and trustworthy math over optional polish.

Definition of “Beta-Ready” (May 1)

A tournament can be created, configured, started, played, and completed end-to-end.

Players can participate even if some refuse to use the app (proxy/admin entry exists).

Organizer is not overwhelmed: the app absorbs tallying, leaderboards, and summaries.

No accidental Firestore writes from dev-only preview flows.

Navigation is predictable and cannot strand users.

Core math is correct and auditable.

Non-goals for May 1 (explicitly not required)

Public App Store release

Payments / monetization

Full Legacy Mode / Legacy Card

Every game format in Normal Play

Full push notifications (in-app callouts are sufficient)

Perfect animations everywhere (polish only where it matters)

Build sequence checklist (in order)

Stability and navigation hardening (must be solid before features)

Verify Formats navigation across every entry/exit path (no Home jumps).

Verify all Tournament setup screens use consistent navigation patterns (pop/back vs replace only when intentional).

Confirm Tournament start preview mode never writes to Firestore.

Confirm recovery path is documented and safe (until in-app admin revert exists).

Confirm no accidental duplicate Overview stacking.

Tournament state contract (single source of truth)

Define tournament status and required fields (setup, live, complete).

Define roster lock behavior at start (roster can allow late “start round” but roster membership is locked when tournament starts, unless organizer explicitly reopens roster).

Define per-round state and current round index.

Ensure every screen gates itself based on tournament state (no guessing).

Manual course scorecard entry (no API dependency)

Organizer can enter per-round course scorecard data:

hole numbers

par per hole

stroke index (SI)

tees per round (already present conceptually)

Ensure relative-to-par math and leaderboard can function from manual data.

Live tournament entry for players (reduces organizer messaging load)

Home callout appears for participants when tournament is live:
“Tournament has begun — start your round. Good luck.”

Tap deep-links to the tournament’s player entry flow.

Player assignment screen (clarity before play)

Show:

group members

opponent/team context (if applicable)

tee time

course/tees

Primary button: Start Round

Round start and core play loop (reuse existing Hole View)

Start Round creates/restores a tournament-scoped active round state for that player.

Hole View is the same shared engine used elsewhere (no forked tournament hole UI).

Score entry minimal fields:

gross score

putts

Optional “add stats” affordance is permitted but not required for May 1.

Round submission, lock, and organizer override (integrity)

End-of-round scorecard review screen.

Player submits/attests:

locks their round (no player edits after submission).

Organizer can unlock/edit if needed, with audit trail.

Proxy scoring and organizer fallback (handles non-app users)

Allow a player to enter scores for another participant in their group (proxy entry).

Organizer can also input/edit a player’s round from a scorecard if needed.

Participation modes supported:

self-entered

proxy-entered

organizer-entered

Leaderboards (tournament confidence)

In-round leaderboard screen:

relative-to-par (E, +1, -1)

return to exact hole position on exit

End-of-day leaderboard generation after submissions:

PGA Tour style list

stable sorting rules

Ensure leaderboard math uses the correct per-round par source.

Format essentials for Hackers & Slackers (minimum viable format support)

Format hole interstitials for:

Long Drive

KP

Second Shot KP

Long Drive UX:

“Set Long Drive Pin” (GPS)

second player confirmation

provisional leader shown during play

organizer can override after round (placard is final)

Ensure format results can be finalized by organizer and reflected in payouts.

Organizer workload reducers (high value, keep lightweight)

Automatic “who has submitted / who hasn’t” visibility.

Auto summaries after round/day:

leaderboard

format winners/leaders

Optional: post-round email summary per player (opt-in).

Tournament completion experience (simple, premium closure)

Winner/trophy screen.

Final leaderboard.

Payout summary.

Thank-you message sent to all players.

Beta readiness QA pass (protect May 1)

Run a full simulated tournament using test accounts:

setup → start → play → submit → finalize → complete

Test late starting player.

Test proxy scoring.

Test organizer override on a long drive result.

Test recovery path (until in-app revert exists).

Confirm clean navigation in all flows.

Milestone outcome
If items 1–13 are complete and stable, the product is beta-ready for real tournament use.