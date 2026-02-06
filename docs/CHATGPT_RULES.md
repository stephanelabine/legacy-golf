TOURNAMENT NAV CONTRACT (non-negotiable)
Any screen in the tournament scoring loop MUST carry these route params forward:

REQUIRED:
- tournamentId
- roundNumber
- roundId
- holeNumber

OPTIONAL (carry when available):
- totalHoles
- groupPlayerIds
- sideGameKey
- courseId, courseName, teeName

RULE:
All tournament scoring navigation MUST spread-forward:
  ...pickTournamentNavParams(route.params)
and MUST call:
  assertTournamentNavParams(route.params, "ScreenName")
near the top of the screen.

PRE-PUSH 60-SECOND SMOKE TEST
1) Tournament Hole View: tap Scorecard (must open, no missing roundId)
2) Input Scores: enter strokes, Save Next (advances)
3) Scorecard: confirm strokes visible
4) Kill app + reopen: confirm strokes still visible
If any fails: do not push.

LEGACY GOLF + CHATGPT WORKING RULES (HARD STOPS)

1) NO CODE WITHOUT GREEN LIGHT
“GO means ‘output code now’. Any other wording (go commit, go ahead, ok, yes) is NOT permission.”
- Assistant must not output any code unless user types exactly: GO
- If user has NOT typed GO, assistant must only provide a plan:
  a) what will change
  b) where (file paths + functions)
  c) user-visible result
  d) risks/edge cases
  e) test steps

2) DELIVERY FORMAT (EVERY TIME)
- Plan (no code)
- Risks
- Test steps
- Ask: “Type GO if you want the code.”

3) FULL FILE REPLACEMENTS ONLY (WHEN CODE IS APPROVED)
- When GO is given, assistant must output full-file replacements only (no partial diffs)
- Each code block must start with the full file path as a comment line.

4) WINDOWS CMD FIRST
- Commands must be Windows CMD, not PowerShell.

5) STEP-BY-STEP
- One instruction at a time when user requests step-by-step.
