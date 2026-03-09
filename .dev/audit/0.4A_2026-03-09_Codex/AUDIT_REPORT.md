# Mirror Box Orchestrator — Session 0.4A Audit (Codex)

## 1. Scope Lock

### Session protocol reviewed
- `/Users/johnserious/MBO/.dev/governance/AGENTS.md`
- `/Users/johnserious/MBO/.dev/governance/projecttracking.md`
- `/Users/johnserious/MBO/.dev/governance/BUGS.md`
- `/Users/johnserious/MBO/.dev/spec/SPEC.md` (with focus on Sections 6, 7, 12, 13, 17)

### Commits under audit
- `a62c8a7` — `feat(graph): 0.4B-00 + 0.4A-01/02`
- `4b742cd` — `docs: governance sync`

### Files reviewed for implementation checks
- `/Users/johnserious/MBO/src/state/db-manager.js`
- `/Users/johnserious/MBO/src/state/event-store.js`
- `/Users/johnserious/MBO/src/state/state-manager.js`
- `/Users/johnserious/MBO/src/state/redactor.js`
- `/Users/johnserious/MBO/src/graph/graph-store.js`
- `/Users/johnserious/MBO/src/graph/static-scanner.js`
- `/Users/johnserious/MBO/test-graph-store.js`
- `/Users/johnserious/MBO/test-scanner.js`
- `/Users/johnserious/MBO/.dev/spec/SPEC.md`
- `/Users/johnserious/MBO/.dev/governance/AGENTS.md`

### Audit objective
Validate the six-item session scope (instance separation, tree-sitter language fix, FK fix, graph-store refactor correctness, SPEC alignment, AGENTS Section 11 correctness) and determine readiness before 0.4A-03.

---

## 2. Itemized Verdicts (PASS / FAIL / WARN)

### 1) Instance separation (0.4B-00)
**Verdict: PASS**

Reasoning:
- `DBManager` defaults to `data/mirrorbox.db` when path is omitted (`dbPath || DEFAULT_DB_PATH`).
- Default singleton export remains backward compatible for current `state/*` modules importing `./db-manager`.
- Separate `new DBManager(customPath)` instances create isolated DB handles, enabling dev/runtime split without shared in-memory state.
- `initialize()` creates parent directory recursively from `path.dirname(targetPath)`, so arbitrary nested `dbPath` works.

Key refs:
- `/Users/johnserious/MBO/src/state/db-manager.js:5`
- `/Users/johnserious/MBO/src/state/db-manager.js:8`
- `/Users/johnserious/MBO/src/state/db-manager.js:10`
- `/Users/johnserious/MBO/src/state/db-manager.js:16`
- `/Users/johnserious/MBO/src/state/db-manager.js:17`
- `/Users/johnserious/MBO/src/state/event-store.js:1`
- `/Users/johnserious/MBO/src/state/state-manager.js:3`

---

### 2) Tree-sitter fix
**Verdict: PASS**

Reasoning:
- JS/Python fix is sound: passing full grammar object (`JavaScript`, `Python`) preserves `nodeTypeInfo` for parser internals; `.language` alone omits that metadata.
- TypeScript mapping uses `TypeScript.typescript` for `.ts` and `TypeScript.tsx` for `.tsx`, matching package exports.

Key refs:
- `/Users/johnserious/MBO/src/graph/static-scanner.js:26`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:27`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:28`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:29`

---

### 3) FK constraint fix in `recordImport`
**Verdict: PASS**

Reasoning:
- `recordImport` now inserts placeholder target node first, then `IMPORTS` edge, which is correct for FK constraints.
- No other scanner edge path currently writes edge-before-node; `DEFINES` path also upserts symbol node before edge.

Key refs:
- `/Users/johnserious/MBO/src/graph/static-scanner.js:135`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:142`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:73`
- `/Users/johnserious/MBO/src/graph/static-scanner.js:84`

---

### 4) `GraphStore` class conversion
**Verdict: PASS**

Reasoning:
- `clearGraph()` is valid with this project’s wrapper: `DBManager.transaction(fn)` executes immediately (`return this.db.transaction(fn)();`), so no missed invocation bug.
- All old singleton `db.*` references in graph store are converted to `this.db.*`; no missed direct `db` references found.

Key refs:
- `/Users/johnserious/MBO/src/graph/graph-store.js:100`
- `/Users/johnserious/MBO/src/state/db-manager.js:162`
- `/Users/johnserious/MBO/src/state/db-manager.js:163`

---

### 5) SPEC.md changes vs implementation
**Verdict: FAIL**

Reasoning:
- `chain_anchors` schema in SPEC and `db-manager.js` are aligned (`run_id, seq, event_id, hash, created_at`), but `event-store.js` still writes legacy columns (`id, seq, event_id, hash`), which fails at runtime.
- Runtime proof: append attempt fails with `table chain_anchors has no column named id`.
- Section 7 Event hash-envelope description in SPEC is still not fully aligned with implementation envelope fields used for hash generation.

Exact wrong behavior and correction:
- Wrong behavior: `/Users/johnserious/MBO/src/state/event-store.js:47` inserts into non-existent `id` column and omits required `run_id` + `created_at`.
- Correct version should insert `run_id, seq, event_id, hash, created_at` (and provide a valid run identifier).

Key refs:
- `/Users/johnserious/MBO/src/state/event-store.js:47`
- `/Users/johnserious/MBO/src/state/db-manager.js:44`
- `/Users/johnserious/MBO/src/state/db-manager.js:45`
- `/Users/johnserious/MBO/src/state/db-manager.js:49`
- `/Users/johnserious/MBO/.dev/spec/SPEC.md:523`
- `/Users/johnserious/MBO/.dev/spec/SPEC.md:527`
- `/Users/johnserious/MBO/.dev/spec/SPEC.md:531`

---

### 6) AGENTS.md Section 11 content quality
**Verdict: WARN**

Reasoning:
- Two-instance separation rule is directionally correct and complete enough as governance intent.
- Startup command references `src/graph/mcp-server.js`, which does not exist in this repo snapshot.

WARN-to-FAIL condition:
- Promote to **FAIL** if Section 11 is treated as currently executable workflow instead of future-gated guidance, because the referenced server entrypoint is missing.

Key refs:
- `/Users/johnserious/MBO/.dev/governance/AGENTS.md:150`
- `/Users/johnserious/MBO/.dev/governance/AGENTS.md:162`
- `/Users/johnserious/MBO/src/graph`

---

## 3. Overall Decision

**OVERALL: CONDITIONAL PASS**

Core 0.4A technical changes are solid for DB instance separation, scanner parser correctness, FK-safe import recording, and graph-store refactor consistency. The blocking issue is schema/write-path drift in `event-store.js` against the updated `chain_anchors` contract, which currently causes append-time failure and must be corrected before continuing milestone execution. Section 11 governance guidance is useful but references a non-existent dev-graph server entrypoint, so it remains advisory until implemented or corrected.

### Conditions that must be resolved before 0.4A-03 begins
1. Fix `event-store.js` chain anchor write to `run_id, seq, event_id, hash, created_at` and validate append path end-to-end.
2. Reconcile SPEC Section 7 Event envelope/hash commentary with the actual implementation fields (or adjust code to the documented envelope).
3. Update AGENTS Section 11 startup command to a real entrypoint (or explicitly mark as future/unimplemented instruction).

