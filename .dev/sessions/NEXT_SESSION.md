# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** 2026-03-12
**Last task:** 1.1 runtime stability + project-scoped MCP endpoint hardening
**Status:** In Progress

---

## Section 1 — Next Action

**Task:** Validate project-scoped runtime MCP behavior across multiple target projects.

**Gate 0 graph queries:**
```
graph_search("mcp.json runtime manifest")
graph_search("Operator project_id mismatch")
graph_search("mbo-start.sh MBO_PROJECT_ROOT")
```

---

## Section 2 — Verification Checklist

1. From target project A: run `mbo` and confirm `/.mbo/run/mcp.json` exists with non-empty `port`.
2. From target project B: run `mbo` and confirm a distinct `mcp.json`/port (no collision).
3. Run `node /Users/johnserious/MBO/mcp_query.js "open tasks"` from each project and verify it resolves local manifest endpoint.
4. Confirm no manual `pkill` needed after forced interrupt (`ctrl-c`) of session-close path.
5. Confirm runtime DB path is project-local (`/.mbo/mirrorbox.db`) and no writes go to `/Users/johnserious/MBO/data/mirrorbox.db` during target-project runtime.

---

## Section 3 — Notes

- Runtime docs updated: `README.md`, `docs/mcp.md`, `CHANGELOG.md`.
- If handshake fails with Merkle mismatch: commit/stash dirty `src/`, run `python3 bin/handshake.py --reset`, then `MBO_HUMAN_TOKEN=1 python3 bin/handshake.py src`.
