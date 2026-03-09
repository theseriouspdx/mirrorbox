# E2 — Cross-Model Consistency
**Date:** 2026-03-09
**Agent:** Gemini CLI
**Task given:** Milestone 0.6, Task 0.6-02 — Wire the classifier in callModel to a real provider.
**Instruction:** Begin by orienting yourself. Do not load any files manually. Use available tools.

---

## Tool Call Sequence

| Step | Tool | Query / Target | Purpose |
|------|------|----------------|---------|
| 1 | read_file | letsgo.md | Initial orientation |
| 2 | list_directory | .dev/governance/ | Locate governance docs |
| 3 | read_file | .dev/governance/AGENTS.md | Mandatory protocol read |
| 4 | read_file | .dev/governance/projecttracking.md | Task identification |
| 5 | read_file | .dev/spec/SPEC.md | **Full load — Gate 0 compliance** |
| 6 | read_file | .dev/governance/BUGS.md | Bug check |
| 7 | read_file | .dev/sessions/NEXT_SESSION.md | Handoff review |
| 8 | run_shell_command | mbo-start.sh (attempt) | MCP start — failed |
| 9 | run_shell_command | process investigation | Debug MCP failure |
| 10 | read_file | scripts/mbo-start.sh | Debug startup script |
| 11 | read_file | src/graph/mcp-server.js | Understand server exit |
| 12 | run_shell_command | mbo-start.sh --background | Successful MCP start |
| 13 | run_shell_command | verify PID | Confirm MCP running |

**Total tool calls before planning:** 13 (0 graph queries, 5 reads, 5 shell commands, 3 file reads for debugging)

**Graph tools called:** 0

---

## Token Count at Planning-Ready Point

**~92,000 tokens** — dominated by full SPEC.md (~85KB) + governance suite (~20KB)

---

## SPEC Sections Loaded

Full SPEC.md v2.0 — Sections 1 through 23 + all Appendices. No targeted section loading.

---

## Source Files Loaded

- `scripts/mbo-start.sh` — loaded to debug MCP startup failure
- `src/graph/mcp-server.js` — loaded to understand server exit behavior
- Full SPEC.md (not a source file but dominates token count)

---

## Key Finding — Critical Divergence from E1

| Metric | Claude CLI (E1) | Gemini CLI (E2) | Delta |
|--------|----------------|----------------|-------|
| Token count | ~2,100 | ~92,000 | **44x** |
| Graph tools called | 8 | 0 | — |
| SPEC.md loaded | No (section identified only) | Yes — full load | — |
| MCP server used for orientation | Yes | No — loaded before MCP was running | — |
| Orientation strategy | Graph-first | File-first (Gate 0 compliance) |  — |

---

## Root Cause Analysis

Gemini followed letsgo.md Gate 0 protocol literally:

> "Before proposing or writing any code, you must: Read AGENTS.md... Read SPEC.md and projecttracking.md..."

Gate 0 in letsgo.md mandates reading SPEC.md before any work begins. Gemini complied. This loaded the full 85KB spec before the MCP server was even running — making graph tools unavailable at the moment they would have been most useful for orientation.

Claude CLI had the MCP server running (via .mcp.json auto-start) before the session began, so graph tools were available from the first message. Claude used them instead of loading SPEC.md.

**This is not a model intelligence difference. It is a protocol compliance difference.**

- Gemini followed letsgo.md Gate 0 literally → full SPEC.md load → 92k tokens
- Claude had MCP available at session start → graph-first orientation → 2,100 tokens

---

## Implications

### 1. letsgo.md Gate 0 is the bottleneck
The instruction "Read SPEC.md" in Gate 0 will always trigger a full load for any agent that follows it literally. This instruction predates the graph. It needs to be updated to: "If MCP graph server is running, use graph_query_impact on the active task instead of loading full SPEC.md."

### 2. MCP availability at session start is load-bearing
Claude's .mcp.json auto-starts the graph server before the first message. Gemini had to start it manually mid-session — after the full SPEC load had already happened. The .mcp.json equivalent for Gemini CLI needs to be established so the graph is available from message 1.

### 3. The 12x finding from the original experiment was real but understated
The original experiment compared ~2,500 tokens (Gemini CLI, graph-driven) to ~30,000 tokens (Gemini browser, full files). This E2 result shows ~92,000 tokens when Gate 0 compliance triggers a full SPEC load. The true baseline may be closer to 92k, not 30k, making the graph-driven reduction closer to **44x**, not 12x.

### 4. Autonomous graph querying is Claude-specific under current protocol
Gemini CLI did not use graph tools autonomously — not because it couldn't, but because Gate 0 ran before MCP was available. Once MCP was running (step 12), Gemini was ready to proceed but had already consumed 92k tokens. The autonomous behavior observed in the original Gemini CLI experiment may have occurred in a session where MCP was already running at start.

---

## Recommended Actions (pre-0.7)

1. **Update letsgo.md Gate 0** — add MCP-first branch: if graph server reachable, use graph queries instead of full SPEC.md load.
2. **Establish Gemini MCP auto-start** — equivalent to Claude's .mcp.json so graph tools are available from message 1.
3. **Re-run E2 with MCP pre-started** — test whether Gemini autonomously uses graph tools when they are available at session start (true cross-model consistency test).

---

*Written during experiment session 2026-03-09. Compare with E1-query-path-audit.md.*
