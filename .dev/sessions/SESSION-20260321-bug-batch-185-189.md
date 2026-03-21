# Session: Bug Batch BUG-185 — BUG-189
**Date:** 2026-03-21  
**Agent:** Claude (Cowork)  
**Tasks:** v0.3.21, v0.2.05, v0.11.183  

Full operator requirements and implementation notes are in **BUGS.md** entries for each bug. SPEC §30.3, §34.9, §34.10, §35.4 updated this session.

---

## Decisions made this session

**BUG-185/186 — MouseFilterStream**  
Port verbatim from `~/orchestrator/src/utils/mouseFilter.ts` + `scrollEmitter.ts`. Wire in `src/tui/index.tsx` same as orchestrator. Add `\x1b[?1002h\x1b[?1006h` on mount / `\x1b[?1002l\x1b[?1006l` on exit in `App.tsx`. This single change resolves both bugs.

**BUG-187 — Tokenmiser**  
Tokens out of header entirely. Per-panel role scoping (see SPEC §30.3). Every number labeled. Savings = most-expensive-model-in-workflow vs actual. SHIFT-T overlay = full §30.4 breakdown.

**BUG-188 — Header layout**  
Stray glyph = hyphen + underscore adjacent to "Ready for the next instruction". Timer → header row 2, right side, bold. Programmatic window resize on launch is acceptable. 80-col non-wrapping is the minimum target.

**BUG-189 — Operator governance**  
Three sub-problems: (1) `parseTaskLedger` returns 0 — parse failure, debug first. (2) Idle branch passes no `sessionHistory` + has no tools → model hallucinates capability then forgets. Fix: slash commands hard-coded in `handleInput`, idle branch passes history, governance NL queries route through `graph_search`. (3) Startup surfaces next tasks automatically (§34.9). Tool calls shown in operator panel (§34.10). Graph server confirmed running.

**Onboarding**  
`/onboarding` = follow-up interview against existing profile. Not a cold-start re-interview.

**Token budget**  
Session start with no pipeline work should cost ~200 tokens. Governance queries ≤300 tokens round-trip (§35.4).

---

## Implementation order
1. `governance.ts` — fix `parseTaskLedger` (unblocks startup display and /tasks)
2. `src/tui/utils/mouseFilter.ts` + `scrollEmitter.ts` — new files, port from orchestrator
3. `src/tui/index.tsx` — wire MouseFilterStream + launch resize
4. `src/tui/App.tsx` — mouse escapes, slash commands, startup task display
5. `src/tui/components/StatusBar.tsx` — remove tokens, fix layout, timer row 2 bold
6. `src/auth/operator.js` — idle branch sessionHistory, graph_search routing, tool transparency
7. Panel token displays — OperatorPanel, PipelinePanel, ExecutorPanel, StatsPanel, StatsOverlay

## Worktree
`git worktree add .dev/worktree/claude-bug-batch-185-189 -b claude/bug-batch-185-189`
