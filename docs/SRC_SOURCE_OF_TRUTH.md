SOURCE OF TRUTH RULE (LEGACY GOLF)

Goal:
- Every piece of data must have ONE canonical Firestore home.
- Anything else is derived/read-only (UI computed) or a temporary migration bridge with a clear deletion date.

Tournament format winners / claims (CANONICAL):
- tournaments/{tournamentId}/rounds/r{roundNumber}/formatClaims

Doc IDs:
- {formatKey}_h{holeNumber}

Doc fields (minimum):
- formatKey: string
- holeNumber: number
- claimedByPid: string (player id used in scores docs)
- claimedByPlayerName: string
- claimedAt: timestamp or ISO string
- roundNumber: number
- tournamentId: string

Non-canonical (NOT allowed as source of truth):
- tournaments/{tournamentId}/formats.claimsByRound  (do not write claims here)
- scores docs (do not store claims inside scores)

Migration rule:
- If old data exists (e.g., formats.claimsByRound), the app may READ it only as a temporary fallback.
- The app must WRITE only to the canonical collection.
- Once verified, remove the fallback read.