# CLAUDE.md — MBO Session Bootstrap
> Mirror Box Orchestrator · ~/MBO · Auto-loaded every session

---

## 1. Graph Server — Use This First

The MBO graph server indexes the entire codebase (1350+ nodes). **Always query it before reading files.**

### If native tools are available (Claude Code / registered sessions)
```
mcp__mbo-graph__graph_search        {"pattern": "functionName"}
mcp__mbo-graph__graph_get_knowledge_pack  {"files": ["src/foo.js"], "pattern": "topic"}
mcp__mbo-graph__graph_query_impact  {"nodeId": "file:src/foo.js"}
mcp__mbo-graph__graph_query_callers {"nodeId": "fn:MyClass.myMethod"}
mcp__mbo-graph__graph_query_dependencies {"nodeId": "file:src/foo.js"}
mcp__mbo-graph__graph_server_info   {}
```
The server is declared in `.mcp.json` (port 53935) and enabled in `.claude/settings.local.json`.

### Fallback — DC shell (Cowork / any session)
```bash
node scripts/graph_call.js graph_server_info
node scripts/graph_call.js graph_search '{"pattern":"getCostRollup"}'
node scripts/graph_call.js graph_get_knowledge_pack \
  '{"files":["src/state/db-manager.js"],"pattern":"counterfactual"}'
```
If the server is down: `mbo mcp start` (then wait ~2s and retry).

---

## 2. Governance — Non-Negotiable Rules

| Rule | Detail |
|------|--------|
| **src/auth/ is locked (444)** | No writes until `mbo auth src` + explicit operator `go`. Hold at diff-proposal stage. |
| **Assumption Ledger required** | Every task must emit A1–AN ledger before planning. Entropy > 10 = hard stop + decompose. |
| **Entropy gate** | Score: Critical=3.0, High=1.5, Low=0.5. Total must be < 10 to proceed autonomously. |
| **Tier gate** | Tier 0 = read-only/audit only. Tier 1+ = code changes allowed (with unlock). |
| **Blast radius check** | Classify before every change: Low / Medium / High / Critical. |
| **Bug IDs** | BUG-185+ require dual label `BUG-### / vX.Y.ZZ`. Version lane: `0.2.x` scripting, `0.3.x` TUI, `0.4.x` concurrency, `0.11.x`/`0.12.x` runtime. |
| **Hold at diff** | Never apply code diffs to locked files without explicit `go`. Governance files (`.dev/governance/`) are always writable. |

---

## 3. Key Paths

```
.dev/governance/BUGS.md            Active bug ledger (next: BUG-200)
.dev/governance/projecttracking.md  Task ledger (next task: v0.2.08)
.dev/governance/AGENTS.md          Governance rules, section refs
src/auth/operator.js               🔒 Locked — operator pipeline
src/auth/did-orchestrator.js       🔒 Locked — DID/planner logic
src/state/db-manager.js            Token accounting, getCostRollup()
src/graph/mcp-server.js            Graph MCP server source
scripts/graph_call.js              Graph tool CLI helper (this session)
```

---

## 4. Session Startup Checklist

1. Call `graph_server_info` — confirm index is fresh (< 1h) and scanning = false.
2. Read `.dev/governance/BUGS.md` tail — note next bug number.
3. Read `.dev/governance/projecttracking.md` Active Tasks — note next task.
4. If touching `src/auth/`, confirm `mbo auth src` has been run this session before writing anything.

---

## 5. Open Work (as of 2026-03-23)

| ID | Task | Status |
|----|------|--------|
| **BUG-199 / v0.2.08** | Output-contract hardening: entropy fallback `\|\| '0'`, log interleaving, status-label bleed | READY — diffs proposed, awaiting `mbo auth src` + `go` |
| **BUG-200 / v0.2.09** | TM savings inverted: counterfactual must use `SUM(raw_tokens_estimate)` not actual tokens | READY — governance diffs pending |
| **v0.3.23** | TUI build failure (`handleInput` guard) | COMPLETED |
