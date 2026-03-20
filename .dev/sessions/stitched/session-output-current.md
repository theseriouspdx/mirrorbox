# Session Output (Current Workflow)

## Source Files
- `.dev/sessions/analysis/mbo-e2e-20260319-002908.log.copy`
- `.dev/sessions/audit/tests-20260319-1510.txt`
- `.dev/sessions/audit/validator-20260320-033429.txt`
- `.dev/sessions/audit/diff-20260320-033429.patch`

## E2E Interaction Transcript
```text
[Operator] Context window set to 32000 tokens (threshold: 25600)
[Relay] Listening at /Users/johnserious/MBO_Alpha/.dev/run/relay.sock
MBO Engine v0.11.24-20260319.0729 initialized. [ctrl+f to focus sandbox, SHIFT+T for stats]
[1G[0JMBO v0.11.24-20260319.0729> [29GRun readiness-check workflow now and complete one f[1G[0JMBO v0.11.24-20260319.0729> Run readiness-check workflow now and complete one fu [1Gll workflow cycle successfully in plain English.
[Operator] Model classification failure: [BUDGET_EXCEEDED] Input tokens (1649) exceed budget (1500) for role classifier. Falling back to heuristic.
[callModel] classifier produced malformed JSON (Expected ',' or ']' after array element in JSON at position 2081 (line 44 column 6)). Operator _extractDecision will attempt NL recovery.
[Operator] Ledger generation error: [Operator] Ledger generation failed or malformed.

[32mTM [21917] / $0.003344[0m [2m|[0m [31m[158825] / $0.026669[0m

Spec refinement gate: Confirm intent, files, and assumptions before autonomous implementation.

  Entropy Score: 0.5
  Blockers: none
  Critical assumptions requiring confirmation: none
  Autonomous defaults active if you type go: A1
  
Type 'pin: [id]' to emphasize, 'exclude: [id]' to ignore, or 'go' to proceed.
[1G[0JMBO v0.11.24-20260319.0729> [29Ggo
[ALIVE |] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE /] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE -] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE \] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE |] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE /] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE -] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE \] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE |] planning: Heuristic classification (callModel fallback or placeholder).    [callModel] componentPlanner returned non-JSON. Operator _extractDecision will attempt NL recovery.
[ALIVE /] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE -] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE \] planning: Heuristic classification (callModel fallback or placeholder).    [ALIVE |] planning: Heuristic classification (callModel fallback or placeholder).    [callModel] architecturePlanner returned non-JSON. Operator _extractDecision will attempt NL recovery.
[Operator] Planner returned malformed output. Falling back to minimal safe plan.

[32mTM [21917] / $0.003344[0m [2m|[0m [31m[159323] / $0.027665[0m

Audit package ready. Respond "approved" to sync state, or "reject" to roll back.
[1G[0JMBO v0.11.24-20260319.0729> [29Gapproved
[Operator] Intelligence Graph Update starting...
[Operator] Intelligence Graph Update complete.

[AUDIT] Approved. State synced. Intelligence graph updated.
[1G[0JMBO v0.11.24-20260319.0729> [29Gstatus

Status: Idle — ready for input.
Task:   Heuristic classification (callModel fallback or placeholder).
Files:  none
Hints:  none
[1G[0JMBO v0.11.24-20260319.0729> [29G```

## Test Output
```text
--- MBO Test Suite Runner ---

Found 20 test scripts. Running sequentially...

======================================================
▶ RUNNING: test-state.js
======================================================
--- Testing Mirror Box State Management ---
Step 1: Initial snapshot created.
Step 2: Secret payload appended.
Step 2.5: Testing concurrent appends (same millisecond)...
PASS: Concurrent appends ordered deterministically by seq.
Step 3: Final snapshot created.

--- Running Chain Verification ---
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO_Alpha/.mbo/mirrorbox.db
PASS: Verified 111 events. Chain intact from seq 1 → 111.
Anchor run_id: 1df0ea1e-6d6f-4fe8-8d2a-9dcfb3be04b4 | tail hash: 5fe335d50e6bd4bb...

PASS: Secrets were successfully redacted in the database.
--- State Management Validation Passed ---
✅ PASS: test-state.js

======================================================
▶ RUNNING: test-bug-086-149.js
======================================================
--- test-bug-086-149.js ---

PASS  BUG-086 legacy profile without projectRoot triggers profile_drift

[90m[Scan] Scanning your codebase...[0m
[36mBefore questions, here is what I found from your project scan:[0m

[36mConfirmed:[0m
  - Language: JavaScript
  - Build system: npm
  - Files scanned: 1 (~5 tokens)

[36mInferred (please confirm):[0m
  - Framework: none detected
  - CI: not found — treating as intentional until confirmed
  - Test coverage appears low (0%)

Welcome to Mirror Box Orchestrator v0.11.24
Please spend a few minutes to help us get acquainted with you and your project.
Feel free to ask for clarification on any question, or go back to a previous question, or ask for help.


[36mWhat is your top priority for this project?[0m

[36mHere is the Working Agreement we arrived at:[0m

  Prime Directive: Keep auth stable
  Partnership: proactive architect
  Project type: existing
  Deployment target: unknown
  Staging path: internal
  Verification commands: npm test
  Danger zones: src/auth


[Onboarding] Done. Working agreement locked in.
PASS  BUG-149 live interview path exercised with mock provider and persistence

PASS  all bug regression checks
✅ PASS: test-bug-086-149.js

======================================================
▶ RUNNING: test-chain.js
======================================================
--- Testing Chain Integrity and Tamper Detection ---
PASS: All chain tamper tests passed.
✅ PASS: test-chain.js

======================================================
▶ RUNNING: test-client-config-failure-modes.js
======================================================

FM-01: mcpClients entry missing `name` field
  ✓ no exception
  ✓ nothing written for invalid entry

FM-02: mcpClients entry missing `configPath` field
  ✓ no exception
  ✓ nothing written for invalid entry

FM-03: mcpClients entry is null
  ✓ no exception
  ✓ valid entry still written despite null sibling

FM-04: mcpClients is not an array
  ✓ no exception when mcpClients=string
  ✓ nothing written when mcpClients=string
  ✓ no exception when mcpClients=number
  ✓ nothing written when mcpClients=number
  ✓ no exception when mcpClients=object
  ✓ nothing written when mcpClients=object
  ✓ no exception when mcpClients=true
  ✓ nothing written when mcpClients=true

FM-05: .mbo/config.json is a directory
  ✓ no exception when config.json is a directory
  ✓ nothing written

FM-06: .mbo/config.json is zero-byte
  ✓ no exception on zero-byte config
  ✓ nothing written

FM-07: port is negative
  ✓ nothing written for negative port

FM-08: port is a float
  ✓ no exception for float port

FM-09: port is Infinity / NaN
  ✓ no exception for Infinity/NaN port
  ✓ NaN port does not write

FM-10: projectRoot is undefined
  ✓ no unhandled exception for undefined projectRoot

FM-11: projectRoot does not exist
  ✓ no exception for nonexistent root
  ✓ nothing written

FM-12: first client fails, second still written
  ✓ bad path reported as error
  ✓ claude still written despite previous failure

FM-13: configPath with ../ traversal stays inside path.join result
  ✓ returns a result (no crash)
  ✓ traversal path resolved to: /var/folders/2f/6v5npwks0dd4d662c2ynn4_c0000gn/tmp/evil.json

FM-14/15/16: buildClientRegistry with null/undefined/empty providers
  ✓ no exception for null/undefined/empty
  ✓ null → returns array
  ✓ null → claude always present
  ✓ undefined → returns array
  ✓ undefined → claude always present
  ✓ empty {} → returns array
  ✓ empty {} → no gemini without detection

FM-17: readRegistry filters partial entries
  ✓ only one valid entry returned
  ✓ correct entry returned

FM-18: config deleted between readRegistry and write — no crash
  ✓ no crash when config deleted between calls
  ✓ nothing written when config gone
  ✓ first write preserved

FM-19: concurrent calls — both complete without exception
  ✓ first call wrote
  ✓ second call wrote
  ✓ no exception in sequential concurrent-style calls
  ✓ last write wins

FM-20: absolute configPath — path.join behavior
  ✓ path.join result: /var/folders/2f/6v5npwks0dd4d662c2ynn4_c0000gn/T/mbo-fm-fm20-73523-1773958020888/tmp/absolute.json
  ✓ no crash for absolute-looking configPath

FM-21: .mbo/config.json is read-only — readRegistry OK
  ✓ no exception reading read-only config
  ✓ registry read correctly

FM-22: port 65535 (max valid) and port 1 (min) write correctly
  ✓ port 65535 written
  ✓ port 1 written

FM-23: verify installMCPDaemon health-first timeout is 2000ms (static check)
  ✓ installMCPDaemon checks health with 2000ms timeout before restart
  ✓ alreadyHealthy variable present in installMCPDaemon

FM-24: verify mbo mcp preHealth reads manifest port (static check)
  ✓ preHealthPort variable present
  ✓ daemonHealthy guard present
  ✓ skip message present
  ✓ updateClientConfigs called in mbo mcp

FM-25: mcp-server.js passes log function to updateClientConfigs
  ✓ mcp-server requires update-client-configs
  ✓ called with root and actualPort
  ✓ outer catch logs warning without crashing daemon

FM-26: setup.js no longer contains hardcoded client list
  ✓ no hardcoded .mcp.json relPath
  ✓ no hardcoded gemini relPath
  ✓ imports shared util
  ✓ uses buildClientRegistry

──────────────────────────────────────────────────
Results: 64 passed, 0 failed

✓ All failure mode tests passed
✅ PASS: test-client-config-failure-modes.js

======================================================
▶ RUNNING: test-client-config-refresh.js
======================================================

Test 1: writes correct JSON to registered client configs
  ✓ claude .mcp.json written
  ✓ gemini .gemini/settings.json written
  ✓ no errors
  ✓ claude URL correct
  ✓ claude type is http
  ✓ gemini URL correct

Test 2: missing .mbo/config.json → no crash, empty result
  ✓ no exception thrown
  ✓ nothing written
  ✓ no errors

Test 3: empty mcpClients array → no crash, no writes
  ✓ nothing written
  ✓ no errors

Test 4: missing config directory → created automatically
  ✓ file does not exist before
  ✓ file exists after

Test 5: invalid port → skipped gracefully
  ✓ port 0 → nothing written
  ✓ port null → nothing written
  ✓ port string → nothing written
  ✓ file not created for invalid port

Test 6: unwritable path → error reported, no crash
  ✓ no exception thrown
  ✓ error reported
  ✓ nothing written

Test 7: buildClientRegistry with gemini CLI detected
  ✓ claude entry present
  ✓ gemini entry present when geminiCLI=true

Test 8: buildClientRegistry without gemini CLI
  ✓ claude always registered
  ✓ gemini not registered when absent

Test 9: existing file gets overwritten with new port
  ✓ first port written
  ✓ second port overwrites first
  ✓ old port gone

Test 10: readRegistry handles malformed JSON gracefully
  ✓ no exception on bad JSON
  ✓ returns array
  ✓ returns empty array

Test 11: written file is valid JSON with trailing newline
  ✓ file ends with newline
  ✓ file is valid JSON
  ✓ type field present

──────────────────────────────────────────────────
Results: 33 passed, 0 failed

✓ All tests passed
✅ PASS: test-client-config-refresh.js

======================================================
▶ RUNNING: test-graph-v2.js
======================================================
--- Phase 1: Initial Scan ---
GraphQueryResult: {
  "subsystems": [],
  "affectedFiles": [],
  "callers": [],
  "callees": [],
  "coveringTests": [],
  "dependencyChain": [],
  "runtimeEdges": []
}
PASS: Section 13 contract met.

--- Phase 2: Staleness Check (Unchanged) ---
Re-scan (unchanged) took 0ms (should be very fast)

--- Phase 3: Staleness Check (Changed) ---
Node Metadata: {
  size: 4813,
  content_hash: '15352bd7d58548ebadb3dfb68b66497da596897b1f2c483eedcebfc4d488b072',
  last_modified: 1773958021014
}
PASS: content_hash found in metadata.
✅ PASS: test-graph-v2.js

======================================================
▶ RUNNING: test-h36-operator-did-approval.js
======================================================
PASS: H36 operator + DID + approval flow checks
✅ PASS: test-h36-operator-did-approval.js

======================================================
▶ RUNNING: test-invariants.js
======================================================
--- Mirror Box External Invariant Test Suite ---

Testing Invariant 1 & 2: File Protection & Project Root...
  PASS: src/ directory is read-only (mode: 555).
Testing Invariant 4: Event Store Reproducibility...
  PASS: Chain integrity verified.
Testing Invariant 10: Entropy Tax...
  PASS: Entropy tax paid (All files pass).
Testing Invariant 11: Cell Bootstrapping...
  PASS: bin/validator.py exists for bootstrapping enforcement.

--- Invariant Test Suite Complete ---
✅ PASS: test-invariants.js

======================================================
▶ RUNNING: test-mcp-contract-v3.js
======================================================
PASS mcp-contract-v3
✅ PASS: test-mcp-contract-v3.js

======================================================
▶ RUNNING: test-mcp-server.js
======================================================
--- Testing Graph MCP Server (HTTP) ---
SKIP: MCP manifest not found. Run mbo setup first.
✅ PASS: test-mcp-server.js

======================================================
▶ RUNNING: test-onboarding.js
======================================================
--- test-onboarding.js ---

PASS  chat-native onboarding mode gate
PASS  fresh onboarding
PASS  re-onboard additive
PASS  UX-022  scan briefing (confirmed/inferred/unknown)
PASS  UX-023  adaptive questioning (skip HIGH-confidence in update mode)
PASS  UX-026  subjectRoot safety + expandHome
PASS  UX-027  prime directive synthesis (not a verbatim echo)
PASS  UX-028  semantic validation (commands + danger zones)
PASS  UX-023  inferRealConstraints (.nvmrc, vercel.json, .env.example)

PASS  all onboarding tests
✅ PASS: test-onboarding.js

======================================================
▶ RUNNING: test-recovery.js
======================================================
--- Testing State Recovery ---
PASS: All recovery tests passed.
✅ PASS: test-recovery.js

======================================================
▶ RUNNING: test-redactor-v2.js
======================================================
--- Mirror Box Redactor Verification v2 ---
[PASS] Raw string OpenRouter
[PASS] Raw string Anthropic (sk-ant-api03-*)
[PASS] Object with camelCase apiKey
[PASS] Object with secretKey
[PASS] Buffer-encoded key value
[PASS] Nested object
[PASS] Multiple secrets in one string
[PASS] Clean object (must pass through unmodified)
[PASS] String at position 0 (offset regression check)

VERIFICATION_PASS: All Invariant 8 bypass vectors closed.
✅ PASS: test-redactor-v2.js

======================================================
▶ RUNNING: test-redactor.js
======================================================
--- Mirror Box Redactor Verification v2 ---
[PASS] Raw string OpenRouter
[PASS] Raw string Anthropic (sk-ant-api03-*)
[PASS] Object with camelCase apiKey
[PASS] Object with secretKey
[PASS] Buffer-encoded key value
[PASS] Nested object
[PASS] Multiple secrets in one string
[PASS] Clean object (must pass through unmodified)
[PASS] String at position 0 (offset regression check)

VERIFICATION_PASS: All Invariant 8 bypass vectors closed.
✅ PASS: test-redactor.js

======================================================
▶ RUNNING: test-routing-matrix-live.js
======================================================
SKIP: Live MCP manifest not found. Routing matrix test skipped.
✅ PASS: test-routing-matrix-live.js

======================================================
▶ RUNNING: test-routing-matrix-mocked.js
======================================================
--- MBO Routing Matrix Validation (MOCKED MCP TRANSPORT) ---
Test 1: _graphQueryImpact routing (Mirror)
Mirror result (mocked MCP): {"content":[{"text":"{\"affectedFiles\":[\"mock-impacted.js\"]}"}]}

Test 2: _graphQueryImpact routing (Subject - expected null if no subjectRoot)
Subject result: null

Test 3: _graphQueryImpact (Subject - with mock subjectRoot)
Subject result (mocked DB branch reached): { content: [ { text: '{"affectedFiles":[]}' } ] }

--- Validation Complete ---
✅ PASS: test-routing-matrix-mocked.js

======================================================
▶ RUNNING: test-routing-matrix.js
======================================================
--- MBO Routing Matrix Validation (with timeouts) ---
SKIP: MCP manifest not found. Routing matrix test skipped.
✅ PASS: test-routing-matrix.js

======================================================
▶ RUNNING: test-section36.js
======================================================
--- test-section36.js — Section 36 Conversational Onboarding Contract ---

PASS  AC-01  No numeric question labels in prompts

[90m[Scan] Scanning your codebase...[0m
[36mBefore questions, here is what I found from your project scan:[0m

[36mConfirmed:[0m
  - Language: JavaScript
  - Framework: Express
  - Build system: npm
  - Files scanned: 1 (~6 tokens)

[36mInferred (please confirm):[0m
  - CI: not found — treating as intentional until confirmed
  - Test coverage appears low (0%)

Welcome to Mirror Box Orchestrator v0.11.24
Please spend a few minutes to help us get acquainted with you and your project.
Feel free to ask for clarification on any question, or go back to a previous question, or ask for help.


[36m# MBO Onboarding - Scan Analysis

I've completed an initial scan of your project. Here's what I've found:

**Confirmed:**
- JavaScript codebase
- Express framework for backend/API
- npm for package management
- Very small codebase (only 1 file scanned)

**Inferred (please confirm):**
- No CI/CD pipeline detected - is this an early prototype or intentionally simple?
- No tests found - suggesting this may be a proof of concept or rapid development project

**Unknown (I will ask):**
- Project goals and constraints
- Deployment environment
- Key quality priorities
- How you'd like me to collaborate with you

Let's start with understanding the basics of your project. 

What type of application is this - a prototype, internal tool, or production service?[0m

[36m[0m
Run 'mbo setup --verbose' for diagnostic output.

PASS  AC-02  One question per turn

[90m[Scan] Scanning your codebase...[0m
[36mBefore questions, here is what I found from your project scan:[0m

[36mConfirmed:[0m
  - Language: JavaScript
  - Framework: Express
  - Build system: npm
  - Files scanned: 1 (~6 tokens)

[36mInferred (please confirm):[0m
  - CI: not found — treating as intentional until confirmed
  - Test coverage appears low (0%)

Welcome to Mirror Box Orchestrator v0.11.24
Please spend a few minutes to help us get acquainted with you and your project.
Feel free to ask for clarification on any question, or go back to a previous question, or ask for help.


[36m# MBO 0.1 > Welcome to Mirror Box Orchestrator

I've performed an initial scan of your JavaScript project. Let me share what I've found so far:

### Scan Findings
- **Confirmed**: JavaScript with Express framework and npm build system
- **Inferred (please confirm)**: No CI/CD setup detected, which may be intentional
- **Inferred (please confirm)**: Test coverage appears to be low (0%)
- **Unknown (I will ask)**: Project purpose, intended users, deployment strategy

Before we start building together, I'd like to understand your project better. I'll ask a few questions to calibrate how I can best assist you.

Let's start with the basics: What's the primary purpose of this Express application? Is it a REST API, a full-stack web application, or something else?[0m

[36m[0m
MBO 0.11.24 > ✅ PASS: test-section36.js

======================================================
▶ RUNNING: test-tamper-chain.js
======================================================
--- Testing Hash Chain Tamper Proofing ---

Mutating payload of seq 2...
Running verification on tampered DB (should fail):
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO_Alpha/.mbo/tamper-test.db

SUCCESS: Verification caught the payload tamper.

Attempting to "fix" seq 2 hash but leaving chain broken...
Running verification on partially fixed DB (should still fail chain check):
Auditing Mirror Box Chain of Custody: /Users/johnserious/MBO_Alpha/.mbo/tamper-test.db

SUCCESS: Verification caught the chain breach.

--- Hash Chain Tamper Proofing Test PASSED ---
✅ PASS: test-tamper-chain.js

======================================================
▶ RUNNING: test-tokenmiser-dashboard.js
======================================================
--- Testing Tokenmiser Dashboard ---
1. Testing Pricing Fetch...
   Claude 3.7 Pricing: Prompt=$0.000003 Completion=$0.000015
2. Testing Stats Persistence...
   Savings Delta: $0.012000
3. Testing TUI Header Rendering (Exact Format)...
HEADER START
[32mTM [45154] / $0.398694[0m [2m|[0m [31m[53785] / $0.210327[0m
HEADER END
4. Verifying Baseline Calculation...
   Heuristic estimate for 400 chars: 100 tokens

--- ALL TESTS PASSED ---
✅ PASS: test-tokenmiser-dashboard.js

======================================================
--- Test Suite Summary ---
Total:  20
Passed: 20
Failed: 0
======================================================

🎉 All tests passed successfully!
```

## Validator Output
```text
[CYNIC] ENTROPY TAX: PAID.
```

## Unified Diff
```diff
diff --git a/.dev/governance/BUGS.md b/.dev/governance/BUGS.md
index 07453a2..ce76ca6 100644
--- a/.dev/governance/BUGS.md
+++ b/.dev/governance/BUGS.md
@@ -2,7 +2,29 @@
 
 **Protocol:** Bug found → logged immediately with severity. P0 blocks current milestone. P1 must be fixed before milestone complete. P2 deferred.
 **Archive:** Resolved/completed/superseded → `BUGS-resolved.md` (reference only).
-**Next bug number:** BUG-175
+**Next bug number:** BUG-177
+
+---
+
+### BUG-175: Packaged install omitted `.npmignore`, bloating tarball and increasing onboarding latency/timeouts | Milestone: 1.1 | OPEN
+- **Location:** package release artifact (`mbo-0.11.24.tgz`), repository root ignore metadata
+- **Severity:** P1
+- **Status:** OPEN — observed 2026-03-20
+- **Task:** v0.11.175
+- **Description:** In the Alpha worktree, `.npmignore` was not present, so `npm pack` fell back to `.gitignore` and included `.dev/archive`, backups, worktree snapshots, and other heavy artifacts. The packed tarball expanded from expected lightweight package size to ~200MB+, dramatically increasing install churn and first-run startup overhead.
+- **Impact:** Package install/setup/onboarding becomes materially slower and less reliable; large artifact inclusion increases risk of transport/install failures and obscures runtime regressions behind packaging noise.
+- **Acceptance:** `npm pack` in worktree/controller includes only intended runtime files (no `.dev/**`, `backups/**`, worktree archives, or transient logs), with package size back in expected range.
+
+---
+
+### BUG-176: Onboarding interview can hang indefinitely after user response (no progress/no timeout surface) | Milestone: 1.1 | OPEN
+- **Location:** `src/cli/onboarding.js`, `src/auth/call-model.js` onboarding call path
+- **Severity:** P1
+- **Status:** OPEN — observed 2026-03-20
+- **Task:** v0.11.176
+- **Description:** During interactive onboarding in `mbo setup`, after responding to a model prompt, the flow can stall for minutes with no next question, no timeout/error surfaced, and no deterministic recovery signal to the user. Manual interruption is required.
+- **Impact:** First-run setup is non-deterministic and can deadlock unattended E2E workflows; operators cannot distinguish transient model delay from stuck state.
+- **Acceptance:** Onboarding always advances with bounded response time and explicit error/progress signaling (e.g., timeout surfaced and retry path), never silent indefinite hangs.
 
 ---
 
@@ -118,4 +140,3 @@
 - **Task:** v0.11.162
 - **Description:** FILES prompt fired and accepted empty input with no validation. If certain route types require files, the gate should block empty file lists. If FILES is optional for this route, the prompt should not fire at all.
 - **Acceptance:** FILES prompt either (a) does not fire when files are not required for the route, or (b) validates that required file lists are non-empty before proceeding.
-
diff --git a/.dev/governance/projecttracking.md b/.dev/governance/projecttracking.md
index 4468da1..2851d42 100644
--- a/.dev/governance/projecttracking.md
+++ b/.dev/governance/projecttracking.md
@@ -2,7 +2,7 @@
 ## Mirror Box Orchestrator — Canonical Task Ledger
 
 **Current Milestone:** 1.1 — Portability & Hardening [IN PROGRESS]
-**Next Task:** v0.11.170
+**Next Task:** v0.11.175
 **Policy:** This file is the single source of truth for work state.
 
 ---
@@ -10,6 +10,8 @@
 ## Active Tasks
 | Task ID | Type | Title | Status | Owner | Branch | Updated | Links | Acceptance |
 |---|---|---|---|---|---|---|---|---|
+| v0.11.175 | bug | BUG-175 package artifact bloat from missing .npmignore in worktree | IN_PROGRESS | codex | codex/v0.11.171 | 2026-03-20 | BUG-175 | Packed artifact excludes .dev/backups/worktree archives; package size returns to expected range |
+| v0.11.176 | bug | BUG-176 onboarding interview hangs without timeout/progress recovery | READY | unassigned | - | 2026-03-20 | BUG-176 | Onboarding has bounded timeout + explicit retry/error path; no indefinite silent stall |
 | v0.11.170 | bug | BUG-170 first-launch missing-config should force setup before operator prompt | READY | unassigned | - | 2026-03-19 | BUG-170 | First launch with missing required config runs setup/fail-closed; never drops user to operator prompt |
 | v0.11.169 | bug | BUG-169 DID tiebreaker null-verdict silent convergence | COMPLETED | claude | - | 2026-03-19 | BUG-169 | Tiebreaker null-verdict escalates to needs_human; no convergent package emitted without finalDiff |
 | v0.11.166 | bug | BUG-166 global install relay socket path EACCES crash loop | READY | unassigned | - | 2026-03-19 | BUG-166 | Global install resolves relay socket under runtime root and launches cleanly |
diff --git a/src/auth/model-router.js b/src/auth/model-router.js
index b3228f6..78c724f 100644
--- a/src/auth/model-router.js
+++ b/src/auth/model-router.js
@@ -242,11 +242,13 @@ async function routeModels(classification = {}, blastRadius = []) {
   }
 
   // 6. Onboarding
+  // Prefer authenticated local CLI first to avoid network-key drift during
+  // first-run interactive setup and onboarding.
   if (!routingMap.onboarding) {
-    if (or.detected) {
-      routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
-    } else if (cli.claude.authenticated) {
+    if (cli.claude.authenticated) {
       routingMap.onboarding = { provider: 'cli', model: 'claude', binary: cli.claude.binary };
+    } else if (or.detected) {
+      routingMap.onboarding = { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet' };
     } else if (local.ollama.detected) {
       routingMap.onboarding = { provider: 'local', model: 'ollama', url: local.ollama.url };
     }
```
