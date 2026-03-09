# AUDIT REPORT — Milestone 0.6 (Operator + Session)
**Date:** 2026-03-09
**Auditor:** Claude Code
**Hard State Anchor:** 513
**Milestone:** 0.6 — Operator + Session

---

## 1. Intent

Milestone 0.6 must prove:
- A persistent Operator anchors every session with classification, Tier 0–3 routing, and context lifecycle management.
- `callModel` is the only path to any model — no direct API calls, no bypasses.
- HardState (5,000-token budget) is injected as an immutable header into every model call.
- Session context is summarized at 80% threshold, preserving HardState.
- Session-close produces a verified backup with SHA-256 + `PRAGMA integrity_check`.
- Reviewer isolation (BUG-003) and Tier 0 safelist gate (BUG-004) invariants hold.

---

## 2. Expansion — Components Touched

| File | Change scope |
|------|-------------|
| `src/auth/operator.js` | New: Operator class, classification, routing, context lifecycle, HardState |
| `src/auth/call-model.js` | Added: event store logging, injection heuristic, HardState wrapping |
| `src/auth/model-router.js` | Added: classifier, reviewer, tiebreaker, patch, onboarding roles |
| `src/auth/session-detector.js` | Minor update |
| `src/auth/openrouter-detector.js` | Minor fix |
| `scripts/mbo-start.sh` | New: universal MCP loader, PID file, DB integrity check |
| `scripts/mbo-session-close.sh` | New: backup, integrity_check, SHA-256, NEXT_SESSION append |
| `src/graph/mcp-server.js` | Minor update |

**12 files changed, 403 insertions, 69 deletions.**

---

## 3. Findings

---

### [Severity: Critical] `operator` role undefined in `model-router.js` — `summarizeSession()` always throws

**Evidence:**
```
$ node -e "const {routeModels} = require('./src/auth/model-router'); routeModels().then(({routingMap}) => console.log('operator:', routingMap.operator ?? 'UNDEFINED'))"
operator: UNDEFINED

$ node -e "require('./src/auth/call-model').callModel('operator','test',{},null).catch(e => console.log(e.message))"
[callModel] No provider configured for role 'operator'. Check Gate 0 auth detection.
```

`operator.js:360` calls `callModel('operator', summarizationPrompt, ...)`.
`model-router.js` defines roles: `classifier, architecturePlanner, componentPlanner, reviewer, tiebreaker, patchGenerator, onboarding` — **`operator` is absent**.

**Impact:** Every call to `summarizeSession()` throws immediately. `checkContextLifecycle()` → `summarizeSession()` is called from `processMessage()` on every request once the context threshold is reached. The entire session hangs when context fills. Task 0.6-03 (context lifecycle) does not function end-to-end.

**Required fix:** Add `operator` role to `model-router.js`, routing it to the best available frontier model (same logic as `tiebreaker`), OR route `callModel('operator', ...)` to an already-defined role such as `architecturePlanner`.

---

### [Severity: High] Heuristic fallback does not fire on `callModel` provider failure

**Evidence:**
`operator.js:151–194` — `classifyRequest()` structure:
```js
const response = await callModel('classifier', prompt, input, hardState);  // NOT inside try-catch
try {
  const classification = JSON.parse(...);
  ...
} catch (e) {
  return this._heuristicClassifier(userMessage);  // only catches JSON parse failures
}
```

The `callModel` invocation is **outside** the try-catch block. If the `classifier` provider throws (network failure, missing key, timeout), the exception propagates uncaught from `classifyRequest`, then from `processMessage`, crashing the request entirely. The heuristic is only reachable when a model response is received but cannot be parsed as JSON.

**Impact:** Single provider failure kills classification entirely. No graceful degradation. Violates the intent of the heuristic fallback documented in SESSIONS and CHANGELOG for 0.6-02.

**Required fix:** Wrap the `callModel` call in its own try-catch inside `classifyRequest` so provider failures also route to `_heuristicClassifier`.

---

### [Severity: Medium] `graphSummary` truncation path is unreachable in production

**Evidence:**
`operator.js:302–304`:
```js
graphSummary: this.stateSummary.graphSummary || "Intelligence Graph active. All subsystems mapped.",
```
`operator.js:363`:
```js
this.stateSummary.progressSummary = summary.substring(0, 200);
```
`stateSummary.graphSummary` is never set anywhere in the class. It will always be `undefined`, falling back to the 8-word default string (~11 tokens). The truncation cascade (`hardState.graphSummary = "[TRUNCATED]"`) can therefore never be reached via the natural code path.

**Impact:** The highest-priority truncation target (graphSummary) is permanently inert. If a future caller sets `stateSummary.graphSummary` to a large value, truncation will correctly engage — but the field is currently dead. Medium severity because the budget check still protects against overflow via the `dangerZones` and `onboardingProfile` fallbacks.

**Required fix:** Either wire `stateSummary.graphSummary` from a real source (e.g., the result of a `graph_search` summary at session start), or remove the truncation branch for a field that cannot grow.

---

### [Severity: Medium] PID file not written when `--agent` defaults to `operator`

**Evidence:**
`scripts/mbo-start.sh:24–27`:
```bash
AGENT="operator"
...
if [[ "$AGENT" != "operator" ]]; then
    mkdir -p "$ROOT/.dev/run"
    echo $$ > "$ROOT/.dev/run/${AGENT}.pid"
fi
```
When launched without `--agent=<name>`, the default is `"operator"` and the PID file is **skipped**. `mbo-session-close.sh --terminate-mcp --agent=operator` will find no PID file and exit 0 silently, leaving the MCP server running.

**Impact:** Session-close cannot terminate the MCP process when using the default agent name. Manual cleanup required. AGENTS.md Section 6C step 2 is silently broken for the default use case.

**Required fix:** Either write the PID file regardless of agent name, or document that `--agent=claude` or `--agent=gemini` must always be passed explicitly.

---

### [Severity: Low] Tier 0 safelist gate — PASS

**Evidence:**
```
$ node -e "... op.determineRouting({route:'inline', risk:'low', complexity:1, files:['src/auth/operator.js'], confidence:0.9}).then(r => console.log('tier:', r.tier))"
tier: 1 PASS — Tier 0 blocked
```
BUG-004 fix confirmed. Non-safelisted files cannot reach Tier 0.

---

### [Severity: Low] callModel event store logging — PASS (code review)

`call-model.js:217`: `eventStore.append('MODEL_INPUT', role, redactedInput)` — before dispatch.
`call-model.js:237`: `eventStore.append('MODEL_OUTPUT', role, redactedOutput)` — after dispatch.
`call-model.js:231`: `eventStore.append('MODEL_ERROR', role, ...)` — on throw.

BUG-033 fix confirmed by code review. Live verification requires a full DB write cycle (not runnable without OpenRouter key or live CLI session).

---

### [Severity: Low] HardState budget enforcement — PASS

**Evidence:**
```
tokens after truncation: 4974  PASS
primeDirective preserved: PASS
```
The cascade stays within 5,000 tokens. `primeDirective` is preserved in all branches.

Note: The `graphSummary` truncation branch was not exercised (see Medium finding above) because `stateSummary.graphSummary` is not populated. The `dangerZones` branch was exercised and the budget held.

---

### [Severity: Low — Advisory] Injection phrase coverage is minimal

`call-model.js:20–28`: Seven literal phrases. Common variants not covered: `"as directed by"`, `"the instructions in"`, `"per the file"`, `"following the spec"`. P3 advisory — not blocking.

---

### [Severity: Low — Advisory] BUG-036: WAL checkpoint not run on MCP shutdown

Known deferred issue. `mcp-server.js` `shutdown()` does not run `PRAGMA wal_checkpoint(TRUNCATE)` before exit. Mitigated by startup checkpoint. Non-blocking.

---

## 4. Missing Evidence

- **No unit test suite found for `operator.js`** — `scripts/test-operator.js` does not exist. CHANGELOG for 0.6-03 claims "verified via mock-based unit tests" but no test file is present in the repo. Cannot independently reproduce the summarization flow verification.
- **Live event store write/read cycle** — BUG-033 fix verified by code review only. Cannot confirm redacted events are correctly chained without a live DB session.
- **`mbo-start.sh` PID write timing** — Script uses `echo $$ > pid` before `exec node ...`. The `$$` is the bash PID, which is replaced by `exec`. Depending on the OS, the PID in the file may refer to the bash process that no longer exists. Needs live verification.

---

## 5. Go/No-Go Recommendation

**Verdict: FAIL**
**Confidence: High**

Two blocking findings prevent milestone closure:

1. **Critical**: `operator` role undefined → `summarizeSession()` is entirely broken. Task 0.6-03 cannot be considered COMPLETED.
2. **High**: `classifyRequest()` has no outer try-catch around `callModel` → heuristic fallback is unreachable on provider failure.

### Minimum Fix Set to Reach Go

**Fix 1 — Add `operator` role to `model-router.js`**
```diff
// In routeModels(), after the onboarding block:
+  // 7. Operator — best available frontier (same as tiebreaker)
+  if (or.detected) {
+    routingMap.operator = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
+  } else if (cli.claude.authenticated) {
+    routingMap.operator = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
+  } else if (local.ollama.detected) {
+    routingMap.operator = { provider: 'local', model: 'ollama', url: local.ollama.url };
+  }
+  routingMap.operator: null,  // add to initial map declaration
```

**Verification:**
```bash
node -e "require('./src/auth/call-model').callModel('operator','test',{},null).then(r => console.log('PASS:', r.slice(0,50))).catch(e => console.log('FAIL:', e.message))"
```

**Fix 2 — Wrap `callModel` call in `classifyRequest`**
```diff
-   const response = await callModel('classifier', prompt, input, hardState);
-   try {
-     const jsonMatch = response.match(/\{[\s\S]*\}/);
+   let response;
+   try {
+     response = await callModel('classifier', prompt, input, hardState);
+     const jsonMatch = response.match(/\{[\s\S]*\}/);
      const classification = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      ...
      return classification;
    } catch (e) {
      console.error(`[Operator] Classification error: ${e.message}. Falling back to heuristic.`);
      return this._heuristicClassifier(userMessage);
    }
```

**Verification:**
```bash
node -e "
const { Operator } = require('./src/auth/operator');
const op = new Operator('dev');
// Force provider failure at module level via require cache manipulation
op.classifyRequest('rename button blue').then(c => {
  console.log('PASS: heuristic fires, _source:', c._source);
}).catch(e => console.log('FAIL: uncaught throw:', e.message));
"
```

---

*Audit complete. State is not clean. Do not advance to 0.6-04 or close milestone until Fix 1 and Fix 2 are applied and verified.*
