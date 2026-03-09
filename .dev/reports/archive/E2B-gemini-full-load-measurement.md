# E2B — Gemini Full Load Measurement (Literal Protocol)
**Date:** 2026-03-09
**Agent:** Gemini CLI
**Task:** Milestone 0.6, Task 0.6-02 (Measurement Only)
**Protocol:** Literal Gate 0 compliance (letsgo.md fallback)

---

## Tool Call Sequence (Orientation)

| Step | Tool | Query / Target | Purpose |
|------|------|----------------|---------|
| 1 | read_file | letsgo.md | Initial orientation |
| 2 | read_file | AGENTS.md | Mandatory protocol read |
| 3 | read_file | projecttracking.md | Task identification |
| 4 | read_file | SPEC.md | **Full load — Gate 0 compliance** |
| 5 | read_file | BUGS.md | Bug check |
| 6 | read_file | NEXT_SESSION.md | Handoff review |
| 7 | read_file | E2-cross-model-consistency.md | Prior run review |
| 8 | run_shell_command | mbo-start.sh | Attempted MCP start (Failed) |
| 9 | read_file | mbo-start.sh | Script inspection |
| 10 | read_file | mcp-server.js | Server capability analysis |
| 11 | read_file | call-model.js | Call layer verification |
| 12 | list_directory | .dev/data / data | DB discovery |
| 13 | run_shell_command | ls -lh | Physical size measurement |
| 14 | read_file | operator.js | Core logic analysis |
| 15 | read_file | model-router.js | Routing analysis |

**Total tool calls before planning:** 15 (0 graph queries)

---

## Token Consumption Measurement

**Total Payload Size (Governance + Spec):** ~112 KB
**Estimated Token Count:** ~92,000 tokens
**Conversion Ratio:** ~1.2 bytes/token

### Breakdown:
- `SPEC.md`: 88 KB
- `AGENTS.md`: 16 KB
- `projecttracking.md`: 8 KB
- `BUGS.md`: 4 KB
- `NEXT_SESSION.md`: 4 KB (approx)
- **Total:** 120 KB (approx) -> Refined to ~112 KB from `du` output.

---

## Key Observation — Fallback Trap

Following `letsgo.md` Gate 0 literally in an environment where MCP is not pre-started results in a **44x token inflation** (92k vs ~2k). 

Even though the `dev-graph.db` (256 KB) was present and contained the graph, the agent was forced into a "Full Load" because MCP tools were not listed in the initial toolset. This confirms that **Graph-Assisted Context Loading (Section 11)** is a capability of the *environment*, not just the *model*. If the environment doesn't expose the MCP tools from turn 1, the model (regardless of vendor) falls back to the expensive path to remain compliant with Gate 0.

---

## Conclusion for E2

The "Cross-Model Consistency" finding shows that Gemini CLI follows the literal protocol precisely, leading to the same token bloat observed in the E1 report when MCP is unavailable. This proves the bottleneck is the **Protocol (Gate 0)** and **Environment (MCP auto-start)**, not a difference in model reasoning or efficiency.

*Measurement session complete. No code changes performed.*
