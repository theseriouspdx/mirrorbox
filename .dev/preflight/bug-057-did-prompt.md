# bug-057-did-prompt.md
## DID Problem Statement — BUG-057
## MCP Stream-Destroyed Incident → Malformed Planner Output Cascade

**How to use:**
Run this prompt in a fresh session against each agent independently.
Do not share one agent's output with the other before both have responded.
If outputs diverge on the fix approach, bring in a third agent as tiebreaker.

---

## CONTEXT

Mirror Box Orchestrator (MBO) uses a persistent MCP server (`src/graph/mcp-server.js`)
that handles graph queries over HTTP using `StreamableHTTPServerTransport` from the
`@modelcontextprotocol/sdk`. The server maintains a `sessions` Map of active transports,
keyed by session ID. Sessions are created on `initialize` and deleted on close via
`onsessionclosed`.

The Operator (`src/auth/operator.js`) connects to this server at session start,
validates a manifest file (`.dev/run/mcp.json`), and uses the server for graph queries
throughout the pipeline.

---

## THE PROBLEM

The MCP server manifest is currently showing:

```json
{
  "status": "incident",
  "incident_reason": "Cannot call write after a stream was destroyed"
}
```

This incident propagates as follows:

1. MCP manifest status is `incident` — not `ready`
2. `_validateManifestV3()` in `operator.js` throws on `status !== 'ready'`
3. Operator cannot fully initialize
4. Graph context passed to `callModel` is empty (skeleton only)
5. `classifyRequest()` calls `callModel('classifier', ...)` with no graph context
6. Model returns a conversational or partial response instead of the required JSON schema
7. `validateOutputSchema()` throws `[MALFORMED_OUTPUT] classifier returned non-JSON output`
8. Pipeline halts at classification stage

The root symptom ("malformed JSON from planner") is downstream of the real failure
("stream was destroyed" in MCP server).

---

## ROOT CAUSE HYPOTHESIS

`StreamableHTTPServerTransport` creates a per-session transport tied to an HTTP
`ServerResponse` object. When a client disconnects, `onsessionclosed` fires and
deletes the transport from the sessions Map.

However, in-flight async operations (queued writes, scan completion callbacks,
`enqueueWrite` promise chain) may still hold a reference to the transport and
attempt to write a response after the underlying `ServerResponse` has been
destroyed. Node.js throws `ERR_HTTP_HEADERS_SENT` or `write after end` on
this attempt.

This error is caught by the manifest incident writer in `main()` and written
as `incident_reason: "Cannot call write after a stream was destroyed"`.

There is also a possible secondary issue: the Operator is starting in dev mode
(port 4737 per stdout log) but the manifest at `.dev/run/mcp.json` shows port
3737. The Operator may be connecting to the wrong server instance.

---

## WHAT YOU NEED TO SOLVE

Propose a fix for the stream-destroyed error in `src/graph/mcp-server.js`.

Constraints:
- Fix must be a unified diff — no full-file replacements
- Fix must not introduce new state that breaks the session Map lifecycle
- Fix must handle the case where `enqueueWrite` operations complete after
  client disconnect without throwing or corrupting server state
- Fix must not suppress legitimate errors — only guard against write-after-destroy
- Do not touch `src/auth/operator.js` in this fix — the Operator behavior is
  correct; the server is the source of the problem
- Do not attempt to fix the port mismatch in this diff — flag it separately
  if you find evidence of it

Deliverable:
1. Your diagnosis — do you agree with the hypothesis above, or is the root cause
   different? Show your reasoning.
2. A unified diff for `src/graph/mcp-server.js` only
3. A one-paragraph explanation of what your fix does and why it is correct
4. Any secondary issues you identified that should be filed as separate bugs

---
