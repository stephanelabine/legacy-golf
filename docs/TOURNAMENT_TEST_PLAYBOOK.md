# Tournament Hub – Test Playbook

## Baseline smoke test (must stay true)
1) Tournament Hub → Start round
2) Confirm per-hole format/side-game splash is correct across multiple holes (spot check: 1, 3, 9, 18)
3) Tournament Hole View loads correct hole
4) Tournament Score Entry:
   - Enter strokes for your group
   - Save
   - Next Hole
5) Go back to a previous hole → confirm scores persist
6) Open Scorecard → confirm all saved scores display (no dashes)

## Hole Map (tournament-aware) acceptance test
1) From Tournament Hole View, tap Hole Map
2) Hole Map shows:
   - Correct hole number
   - Correct course context (same course/tee for the tournament)
   - Any hole-specific meta (if displayed) matches the tournament holeMeta
3) Back returns to Tournament Hole View on the same hole (same tournamentId, roundNumber, holeNumber)
4) No blank states / no “loading roster” stalls / no route param loss

## Green View (tournament-aware) acceptance test
1) From Tournament Hole View, tap Green View
2) Shows correct hole + green points relevant to course/tee
3) Back returns to Tournament Hole View on same hole

## Hazards (tournament-aware) acceptance test
1) From Tournament Hole View, tap Hazards
2) Shows correct hole hazards relevant to course/tee
3) Back returns to Tournament Hole View on same hole
