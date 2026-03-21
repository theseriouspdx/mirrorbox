# TEST STANDARDS
## Mirror Box Orchestrator — Test Authoring Contract

**Purpose:** Mandatory standards for all test scripts in `scripts/`. Every agent must
read this before writing, modifying, or reviewing any `test-*.js` file.
**Applies to:** All `scripts/test-*.js`, `scripts/verify-*.js` files.
**Owner:** John Erickson (operator)
**Last updated:** 2026-03-21

---

## Rule 1 — Environment Assertions Come First

Every test file must open with an environment assertion block that verifies the test
is running on the correct machine before touching anything else.

If any environment check fails, the test must print a clear message and exit with
code 2 (distinct from test failure code 1). This prevents false passes on the wrong
machine — an LLM cannot infer target environment the way a human would.

**Required checks for this codebase:**
- Platform is macOS (`os.platform() === 'darwin'`)
- User is `johnserious` (`os.userInfo().username === 'johnserious'`)
- Any CLI tools used exist in PATH (`which pgrep`, `which ps`, etc.)
- Any project directories or files the test depends on actually exist


**Minimum env block template:**
```js
const ENV_CHECKS = [
  { label: 'Platform is macOS', ok: os.platform() === 'darwin', detail: `got ${os.platform()}` },
  { label: 'Running as johnserious', ok: os.userInfo().username === 'johnserious', detail: `got ${os.userInfo().username}` },
  // add tool/path checks specific to this test
];
let envFailed = false;
for (const check of ENV_CHECKS) {
  console.log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.label + (check.ok ? '' : ' — ' + check.detail));
  if (!check.ok) envFailed = true;
}
if (envFailed) { console.log('\nEnvironment checks failed — aborting.\n'); process.exit(2); }
```

---

## Rule 2 — Tests Must Execute the Code, Not Inspect It

Tests that grep source files for string patterns are **not** functional tests. They
verify what was written, not whether it works. This is the grape/lemon problem: an
agent writes code, writes tests that check the code looks right, both pass, but the
code doesn't actually run correctly on the target machine.

**Wrong:**
```js
assert('function defined', src.includes('function enumerateMcpProcesses')); // tests text
```

**Right:**
```js
const procs = enumerateMcpProcesses(); // actually runs it
assert('finds processes', procs.length > 0);
```

Source inspection is only acceptable for checking governance properties
(e.g. "does this file contain a required header comment"). It must never substitute
for running the actual function.

---

## Rule 3 — Tests Must Use Live System State Where Applicable

If a function depends on running processes, files on disk, or network state, the
test must interact with the real system — not mock data — as its primary assertion.
Mocked unit tests are acceptable as supplements but not as the sole coverage.


**Example:** A test for `enumerateMcpProcesses()` must call `pgrep` for real and
assert it found live processes — not mock a process list.

---

## Rule 4 — Exit Codes Are Meaningful

- Exit 0: all tests passed
- Exit 1: one or more tests failed
- Exit 2: environment checks failed (wrong machine, missing tool, missing file)

Never `process.exit(0)` when tests have failed. Never swallow errors silently.

---

## Rule 5 — Print a Live Output Table for Inspectable State

Any test that queries live system state (processes, ports, files, DB rows) must
print a human-readable table of what it found, even if all assertions pass. This
lets the operator do a visual sanity check without running a separate diagnostic.

---

## Rule 6 — Test Files Are Permanent, Not Throwaway

Test files written during a session stay in `scripts/`. They are the regression
baseline for that feature. The next agent must run existing tests before modifying
the code they cover, and must update the test if behavior intentionally changes.

Do not delete test files. Do not re-run them just to make them pass after breaking
the underlying code.

---

## Rule 7 — One Test File Per Feature Surface

Name test files to match what they test:
- `test-mcp-kill.js` → `enumerateMcpProcesses`, `reapStaleMcpProcesses`, `runMcpKillCommand`
- `test-mcp-server.js` → MCP server lifecycle, health endpoint, manifest behavior
- Not: `test-misc.js`, `test-stuff.js`, `test-new.js`

---

## Brainstorm — Rules To Add Next Session

The following areas are not yet covered by this document and should be designed
with the operator before being added as rules:

- **Timeout standards** — how long a test is allowed to run before it's considered hung
- **Shared setup/teardown** — when tests need to spin up MCP or other services, how
  to do it safely without leaving orphan processes
- **Coverage expectations** — does every new function in `src/` require a test?
  What's the minimum bar?
- **Failure output format** — should failed assertions print diffs? Stack traces?
- **CI integration** — which tests run in the workflow audit, which are manual only?
- **Test isolation** — rules about tests that mutate state (files, DB, processes)
  vs tests that are purely read-only
- **Versioning** — when a bug is fixed, is there a standard for adding a regression
  test named after the bug (e.g. `test-bug-192.js`)?
