# Context Loading Experiment Suite — Compiled Results
## Mirror Box Orchestrator — Pre-0.7 Architecture Validation

**Date compiled:** 2026-03-09
**Source:** E1, E2, E2B, E6, original Prompt A/B
**Status:** 6 clean data points confirmed. E3, E4, E5 not run.

---

## THE 6 DATA POINTS

| # | Model | Interface | MCP at start | Tokens |
|---|-------|-----------|-------------|--------|
| 1 | Gemini | Browser | No — files attached | ~24,500 |
| 2 | Gemini | Browser | No — graph output pasted | ~26,300 |
| 3 | Gemini | CLI | No — files loaded manually | ~25–30k |
| 4 | Claude | CLI | No — files loaded manually | ~25–30k |
| 5 | Gemini | CLI | Yes — MCP live at session start | ~2,500 |
| 6 | Claude | CLI | Yes — MCP live at session start | ~2,100 |

**Contaminated run (excluded):** E2/E2B — Gemini CLI, MCP failed to start mid-session.
Token count (~92k) reflected agent thrashing to debug MCP startup, not a clean no-MCP baseline.
Excluded from analysis.


---

## HEADLINE FINDING

**MCP availability at session start is the only variable that matters.**

Without MCP: all 4 conditions (browser files, browser graph-pasted, Claude CLI, Gemini CLI)
converge at 24–30k tokens. Model doesn't matter. Interface doesn't matter.

With MCP: both CLI conditions converge at 2,100–2,500 tokens. ~12x reduction, consistent
across models.

The graph output injected into browser Tab 2 (point 2, ~26,300 tokens) did NOT achieve graph-
driven efficiency even though the content was graph-derived. This is because without live MCP
tools, the model cannot issue targeted follow-up queries — it gets one context block and works
with it. The token cost of that block is comparable to file attachment.

---

## BEHAVIORAL FINDING (more significant than token cost)

E6 Tab 2 (Gemini browser, graph output injected) asked 3 clarifying questions before planning.
E6 Tab 1 (Gemini browser, full files) proceeded directly to implementation.

Same model. Same task. Same token budget (~25k). Only context strategy differed.

The 3 questions were legitimate — they surfaced real spec ambiguities that the full-load model
resolved silently by assumption. All 3 were answerable from spec sections the graph query
hadn't included (Sections 10 and 13). The model correctly identified it lacked context to
proceed. This is the right behavior.

**For DID pipeline design:** Full-load planners make silent assumptions. Graph-context planners
surface ambiguity as questions. Surfacing ambiguity before planning is correct DID behavior —
silent assumptions produce false consensus, which defeats the purpose of running two planners.

---

## UNRESOLVED (E3, E4, E5 not run)

- **E3 Quality Parity:** No formal side-by-side comparison. E6 behavioral finding suggests
  graph-context may produce better planner behavior, but not confirmed. Defer to post-0.7.
- **E4 Tier-Stratified Tokens:** Does graph context scale with task complexity? Not measured.
  Defer — not blocking.
- **E5 Stale Graph Fallback:** Does AGENTS.md §1.5 fallback activate correctly on empty graph?
  Defer to pre-0.8 (BUG-038 makes this partially observable now anyway).

---

## IMPLEMENTATION ROBUSTNESS ASSESSMENT

The core finding — MCP must be live at session start — places the entire ~12x cost reduction
on the reliability of auto-start. Current implementation:

**Claude CLI:** `.mcp.json` → `bash scripts/mbo-start.sh --mode=dev --agent=claude`
**Gemini CLI:** `.gemini/settings.json` → `bash /Users/johnserious/mbo/scripts/mbo-start.sh --mode=dev --agent=gemini`

### Identified gaps:

**Gap 1: No readiness signal back to the CLI client**
`mbo-start.sh` runs integrity check + WAL checkpoint, then `exec`s into `mcp-server.js`.
The CLI client (Claude or Gemini) receives the MCP server process but has no confirmed signal
that the server is ready to accept tool calls before the first message is sent. If the agent's
first message arrives while the server is still initializing, the tool call fails silently and
the agent falls back to file loading — exactly the E2 failure mode, now baked into auto-start.

**Gap 2: No health check on reconnect**
If the MCP server crashes mid-session (OOM, DB lock, uncaught exception), the agent loses tool
access silently. No reconnect logic. No alert to the agent. Agent falls back to file loading
without knowing why graph tools stopped responding.

**Gap 3: PID file written before exec — race condition**
`echo $$ > run/${AGENT}.pid` writes the bash PID. `exec node ...` replaces that PID with
Node's PID. The PID file is stale the moment exec runs. `mbo-session-close.sh` reading this
file will SIGTERM the wrong process (or nothing if bash PID is already gone).

**Gap 4: Gemini config uses absolute path, Claude uses relative**
`.mcp.json` uses `"args": ["scripts/mbo-start.sh", ...]` (relative, depends on cwd).
`.gemini/settings.json` uses the absolute path. If Claude CLI's cwd is not the project root,
the script won't be found. Inconsistent and fragile.

**Gap 5: No fallback behavior defined in the configs**
Neither config specifies what happens if `mbo-start.sh` exits non-zero (DB corruption, Node
not found, etc.). The CLI client gets a dead MCP server and no guidance. Agent falls back to
full load silently.


### Proposed fixes (in priority order):

**Fix 1 (P1): Normalize both configs to absolute paths**
`.mcp.json` `args` should use the absolute path like Gemini's config does. One-line change.
Eliminates cwd dependency entirely.

**Fix 2 (P1): Fix PID file race — write Node PID, not bash PID**
Two options:
  a) Have `mcp-server.js` write its own PID on startup: `fs.writeFileSync(pidPath, process.pid)`
  b) Use `$BASHPID` and wrap with a separate watcher script (more complex, not needed)
Option (a) is correct. The node process is what needs to be killed, so node should own the file.

**Fix 3 (P2): Add readiness probe to mcp-server.js**
On successful startup, emit a single `[MBO_READY]` line to stderr. The CLI client configs
can't act on this directly, but AGENTS.md §1.5 can instruct agents: "if first graph tool call
fails, MCP server is not ready — wait 2s and retry once before falling back."

**Fix 4 (P2): Add crash detection note to AGENTS.md §1.5**
If graph tools stop responding mid-session, agent should state: "MCP server appears
unavailable — falling back to full SPEC.md load" rather than silently degrading.

---

## KEY NUMBER FOR 0.7 DESIGN

**Target planner context budget: ~2,000–3,000 tokens** (graph queries + targeted reads).
Full SPEC.md load (~85k tokens) is never justified for a single planner invocation.
The 5,000 token HardState ceiling is comfortable at this level.

---

## ACTIONS TAKEN

| Action | Status |
|--------|--------|
| letsgo.md Gate 0: graph-first branch added | Done (0.6.3) |
| AGENTS.md §11: absolute DB paths, tool names, auto-start table | Done (0.6.3) |
| NEXT_SESSION.md §1: explicit graph queries per task | Done (0.6.3) |
| Gemini MCP auto-start (.gemini/settings.json) | Done (0.6.3) |
| Fix 1: Normalize .mcp.json to absolute path | **OPEN** |
| Fix 2: mcp-server.js writes own PID | **OPEN** |
| Fix 3: Readiness probe on startup | **OPEN** |
| Fix 4: Crash detection note in AGENTS.md §1.5 | **OPEN** |
| 0.7 planner prompt design: use E1 query sequence as template | Pending — 0.7 work |

---

*Source reports preserved in `.dev/reports/archive/`. Contaminated E2/E2B runs preserved
for reference but excluded from analysis. Next active work: 0.6-02.*
