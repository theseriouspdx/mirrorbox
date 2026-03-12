# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-12
**Last task:** MCP runtime stability investigation and 99/1 contract planning
**Status:** Ready for implementation

---

## Section 1 — Next Action

**Task:** Implement 1.1-H08 — MCP Runtime Contract v3 (99/1 Reliability).

**Gate 0 graph queries:**
```
graph_search("manifest_version checksum epoch instance_id")
graph_search("graph_server_info initialize health contract")
graph_search("mcp lock dual start split brain")
```

---

## Section 2 — Verification Checklist

1. 50 concurrent cold starts in one project produce exactly one active MCP instance.
2. Corrupt/partial `.mbo/run/mcp.json` is rejected and recovered via fresh atomic write.
3. PID reuse simulation is rejected by process fingerprint validation.
4. Crash-loop simulation trips circuit breaker and emits explicit incident state.
5. Cross-project concurrent starts do not share manifest, pid, or port authority.
6. Mid-session server replacement is detected via `instance_id` mismatch and reconnect path succeeds.

---

## Section 3 — Notes

- Maintain governance-safe recovery: no broad `pkill`, no `rm -f`, no destructive cleanup patterns.
- Runtime authority remains project-scoped `.mbo/run/mcp.json`; static defaults are bootstrap only, never trust source.
- Keep MCP health checks protocol-level (`initialize` + `graph_server_info`), not TCP-only.
