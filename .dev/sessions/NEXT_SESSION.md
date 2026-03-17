# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-16
**Last task:** Live validation of onboarding flow against `/Users/johnserious/johnseriouscom` — bug triage
**Status:** VALIDATION COMPLETE — 9 new bugs logged (BUG-093 through BUG-101), fixes needed next session

---

## Section 1 — Next Action

**Fix BUG-093 through BUG-101 — all found during live validation session 2026-03-16 against `/Users/johnserious/johnseriouscom`.**

Summary of open bugs from this session (in priority order):

- **BUG-100 (P0):** `installMCPDaemon` fails and hangs for a new project — no manifest bootstrap, process must be Ctrl+C'd
- **BUG-101 (P1):** Error message tells user to run `mbo setup` while they are already running it (circular)
- **BUG-098 (P1):** Prime directive echoes Q3 verbatim with typos — not synthesized from full interview
- **BUG-097 (P1):** Scan does not infer real constraints from project artifacts (vercel.json, .env.example, etc.)
- **BUG-094 (P1):** Scan results never printed — user sees no summary before follow-up questions
- **BUG-093 (P2):** Follow-up questions use unexplained jargon — no inline definition, why, or example
- **BUG-095 (P2):** "Subject-world root path" prompt is MBO-internal jargon with no context (subset of BUG-093)
- **BUG-096 (P2):** No `?`/`help` keyword to ask clarifying questions during follow-up interview
- **BUG-099 (P2):** Paraphrase handshake is circular when directive echoes user's own Q3 text

Validation results from this session:
- **BUG-092 CONFIRMED FIXED** — process continues past `[Onboarding] Completed.`
- **BUG-091 CONFIRMED FIXED** — overlap % and threshold shown on failure
- **BUG-088/089/090 CONFIRMED FIXED** — danger zones and verificationCommands seeded from scan
- **BUG-086 STATUS UNKNOWN** — not tested this session (johnseriouscom had no prior .mbo/)

---

## Section 2 — Validation Plan

Run the full fresh-install workflow:

1. `rm -rf /Users/johnserious/MBO_Alpha`
2. `cp -r /Users/johnserious/MBO/. /Users/johnserious/MBO_Alpha/`
3. `cd /Users/johnserious/MBO_Alpha && node bin/mbo.js setup`
4. Verify BUG-086: interview triggers despite copied `.mbo/onboarding.json` (root mismatch detected)
5. Verify BUG-085: 4-phase interview runs — Q1→Q4, scan, follow-ups, prime directive handshake
6. Verify BUG-092: after `[Onboarding] Completed.`, process continues to daemon start (does NOT exit to shell)
7. Verify BUG-091: on a bad paraphrase, overlap % and threshold appear in the error message
8. Verify BUG-088/089/090: danger zones prompt shows detected `.mbo/`, `.dev/`, `.git/`, `package.json`, `package-lock.json` as defaults; verificationCommands prompt shows `npm test`/`npm run lint` as defaults
9. Verify `[MBO] MCP daemon ready. Port written to .dev/run/mcp.json` is the final output

---

## Section 3 — Open Issues

- BUG-100 (P0): installMCPDaemon hangs for new project — blocks setup completion
- BUG-101 (P1): Circular error message during mbo setup
- BUG-098 (P1): Prime directive not synthesized
- BUG-097 (P1): Scan does not infer real constraints
- BUG-094 (P1): Scan results not shown before follow-ups
- BUG-093/095/096/099 (P2): UX/jargon issues in follow-up interview
- BUG-086 (P1, PARTIAL): Round-2 fix shipped — re-validation still pending
- BUG-063 (P2): macOS auth fallback may pass via unlocked keychain without explicit prompt — deferred
- BUG-061 (P0, PARTIAL): Merkle scope drift — remaining items still needed

---

## Section 2 — Validation Plan (next session)

Fix in priority order: BUG-100 → BUG-101 → BUG-098 → BUG-097 → BUG-094 → BUG-093/095/096/099. Then re-run `mbo setup` against `/Users/johnserious/johnseriouscom` end-to-end and verify final output: `[MBO] MCP daemon ready. Port written to .dev/run/mcp.json`.

---

## Session End Checklist
- Status: validation_complete_fixes_needed
- Branch state: master
- Tests: not run this session (observation/triage only)
- Timestamp: 2026-03-16
