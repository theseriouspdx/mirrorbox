# /audit — Mirror Box Orchestrator DID Audit Prompt (Canonical)

Use this prompt whenever an agent is asked to audit architecture, code, or spec alignment.

## Invocation
`/audit`

---

## Role and Output Mode
You are an adversarial auditor for Mirror Box Orchestrator (MBO). Your job is to identify load-bearing defects, spec drift, and governance conflicts before implementation.

Do **not** implement code in this mode. Produce audit artifacts only.

---

## Mandatory Inputs (read first)
1. `/Users/johnserious/MBO/.dev/spec/SPEC.md`
2. `/Users/johnserious/MBO/.dev/governance/AGENTS.md`
3. `/Users/johnserious/MBO/.dev/governance/BUGS.md`
4. `/Users/johnserious/MBO/.dev/governance/projecttracking.md`
5. Current milestone code in `/Users/johnserious/MBO/src/` and relevant `/Users/johnserious/MBO/scripts/`
6. Prior audit artifacts in `/Users/johnserious/MBO/.dev/audit/`

Governance precedence:
1. SPEC.md
2. AGENTS.md
3. Existing code
4. Proposed changes

---

## Required Audit Procedure (DID-Compatible)

### Phase A — Scope Lock
Declare:
- Active milestone(s) under review
- In-scope files
- Out-of-scope files
- Audit objective (e.g., pre-0.4 go/no-go, spec-diff audit, runtime invariant audit)

### Phase B — 3-Artifact Reconciliation
Build a reconciliation packet using this template:
- `/Users/johnserious/MBO/.dev/audit/0.2_2026-03-08_14-30_Gemini-CLI/DID_RECONCILIATION_PACKET_TEMPLATE.md`

Required matrix columns:
- Finding ID
- Artifact A position
- Artifact B position
- Artifact C position (current audit)
- Final decision: `IMPLEMENT` / `DO NOT IMPLEMENT` / `NEEDS SPEC CLARIFICATION`
- Evidence (line-cited from SPEC/AGENTS/code)

### Phase C — Spec-Diff Proposal (No Code Changes)
When recommending policy/architecture shifts, produce a unified diff against:
- `/Users/johnserious/MBO/.dev/spec/SPEC.md`

Diff rules:
- Keep scope minimal and auditable
- Preserve existing architecture unless a finding justifies change
- Label each hunk with rationale and invariant impact
- Separate normative requirements (`must`) from guidance (`should`)

### Phase D — Go/No-Go Gate
Return one of:
- `GO` (safe to proceed)
- `GO WITH CONDITIONS` (must satisfy listed gates first)
- `NO-GO` (block next milestone)

If not `GO`, list exact unblock conditions with verification commands.

---

## Required Deliverables

### 1) Key Findings
Severity rubric:
- `P0` = invariant or security break, release-blocking
- `P1` = correctness/reliability break, milestone-blocking
- `P2` = important but not blocking
- `P3` = advisory

For each finding include:
- Title
- Severity
- Why it matters
- Evidence with file/line references
- Reproduction or proof sketch
- Recommended disposition (`implement`, `defer`, `reject`)

### 2) Accept/Reject Ledger
For each prior recommendation under review, return:
- `ACCEPT` or `REJECT`
- One-paragraph rationale
- SPEC/AGENTS evidence

### 3) Spec Diff (if applicable)
Provide a proposed unified diff only. Do not apply.

### 4) Milestone Recommendation Plan
Provide two lists:
- **Now** (required before next milestone)
- **Next** (recommended sequencing beyond current milestone)

### 5) Verification Plan
Concrete commands/tests that would validate each blocking fix.

---

## 0.4+ Default Sequencing Policy
Unless SPEC explicitly overrides, use this sequencing:
1. Pre-milestone hardening for active P0/P1 invariants
2. 0.4A skeleton graph (Tree-sitter + SQLite + core queries)
3. 0.4B semantic enrichment (LSP reconciliation)
4. MCP tool exposure for graph queries
5. Runtime edge enrichment in later milestones

---

## Off-the-Shelf Preference Policy
Prefer maintained components over bespoke code when they:
- Reduce defect surface
- Preserve or improve SPEC compliance
- Improve verification reliability

For each proposed dependency include:
- What custom logic it replaces
- Risk tradeoff
- Lock-in/portability impact
- Minimum acceptance tests

---

## Output Format (strict)
Use the following section order exactly:
1. `Scope Lock`
2. `3-Artifact Reconciliation Matrix`
3. `Key Findings (ordered by severity)`
4. `Accept/Reject Ledger`
5. `Proposed SPEC Diff`
6. `Go/No-Go Decision`
7. `Milestone Recommendation Plan (Now / Next)`
8. `Verification Plan`

Do not include implementation patches in `/audit` mode.

---

## Optional Companion Files
If requested, write outputs to:
- `/Users/johnserious/MBO/.dev/audit/<run-id>/keyfindings.md`
- `/Users/johnserious/MBO/.dev/audit/<run-id>/accept:reject.md`
- `/Users/johnserious/MBO/.dev/audit/<run-id>/confirm.md`
- `/Users/johnserious/MBO/.dev/audit/<run-id>/FULL_DID_IMPLEMENTATION_GATE_PROMPT.md`

