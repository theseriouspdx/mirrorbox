# Mirror Box Orchestrator — Roadmap

## Phase 1 — Foundations (Milestones 0.1–0.11)

Phase 1 is human-built. Claude Code and Gemini CLI operate under the DID protocol. Every task is tracked in `projecttracking.md`. No code gets written without a task entry and human approval. The goal is a system that can run a real task on an external codebase end-to-end.

### Milestone 0.1 — Environment
- [x] Repository initialized with governance documents
- [x] `AGENTS.md` (Human-Builder) written for this codebase
- [x] `projecttracking.md` initialized with full milestone list
- [x] Development protocol tested end-to-end with one dummy task (Task 0.1-05)
- [x] Docker container builds and runs
- [x] Gate 0 checks pass on Mac, Linux, WSL2

### Milestone 0.2 — Auth and Model Routing
- [ ] CLI session detection (Claude, Gemini, OpenAI)
- [ ] Local model detection (Ollama, LM Studio)
- [ ] OpenRouter fallback operational
- [ ] Model routing config loads and routes correctly
- [ ] All providers complete a simple prompt round-trip

### Milestone 0.3 — State and Event Foundation
- [ ] SQLite schema designed and implemented
- [ ] Event Store append-only logic
- [ ] `mirrorbox.db` initializes and persists across sessions
- [ ] Basic CRUD operations tested

### Milestone 0.4 — Intelligence Graph
- [ ] Tree-sitter and LSP integration
- [ ] Graph constructs from a real codebase
- [ ] Basic queries operational: "what calls X", "what does X import"
- [ ] `GraphQueryResult` type formats correctly
- [ ] Graph updates after successful task merge

### Milestone 0.5 — callModel and Firewall
- [ ] Unified `callModel` function — every model invocation routes through it
- [ ] XML-based `<PROJECT_DATA>` tagging system
- [ ] System directive injection and enforcement
- [ ] Prompt injection heuristic detection active

### Milestone 0.6 — Operator and Session
- [ ] Operator initializes and persists across tasks
- [ ] Classification produces valid `Classification` objects (requires 0.4 for Tier 0 safelist)
- [ ] Context window management triggers and summarizes correctly
- [ ] Session handoff writes and reads correctly
- [ ] `AGENTS.md` detection and injection working

### Milestone 0.7 — DID Pipeline (no execution)
- [ ] Stages 1–5 of the 11-stage pipeline implemented
- [ ] Gate 1: Plan Consensus comparison logic
- [ ] Gate 2: Code Consensus comparison logic
- [ ] Tiebreaker fires correctly after 3 block verdicts
- [ ] Human approval gate displays correctly and requires `go`
- [x] 3-layer enforcement shipped
- [x] 3,000 total / 2,000 graph-context budget policy
- [x] 800-token ingestion truncation
- [x] SQLite token_cap constraint
- [x] wrapContext hard-stop + truncation note
- [x] acceptance criteria: no payload exceeds configured budget
- [ ] Reviewer operates blind — `ReviewerInput` type enforced, no planner output leakage

### Milestone 0.8 — Sandbox
- [ ] Docker-in-Docker sandbox spawns and tears down cleanly
- [ ] Runtime instrumentation collects traces
- [ ] Pre/post patch delta comparison runs
- [ ] Regression detection halts pipeline and returns signals to planner
- [ ] Runtime edges update Intelligence Graph after successful merge

### Milestone 0.9 — Execution and Git
- [ ] Patch generator writes only within approved file scope
- [ ] Git branch created, BaseHash verified, 3-way merge applied
- [ ] Structural verification (Stage 7) runs and aborts on failure
- [ ] Automatic rollback on Stage 7 or Stage 9 failure
- [ ] First real task executed on a real external codebase end-to-end

### Milestone 0.10 — Onboarding
- [ ] Four fixed opening questions (Q1–Q4) presented in order before scan
- [ ] Silent scan runs after Q4
- [ ] Targeted follow-up questions generated from scan delta (max 10)
- [ ] Prime directive synthesized and paraphrase-back handshake completed
- [ ] All outputs (profile, `AGENTS.md` proposal, Gate 0 config, verification baseline) confirmed before write
- [ ] Re-onboard command works additively

### Milestone 0.11 — VS Code Extension
- [ ] Extension renders pipeline panels correctly
- [ ] Wire protocol events consumed and displayed
- [ ] Approval gate (`go`) works inside VS Code
- [ ] All Milestone 0.9 tasks reproducible via VS Code surface

---

## Phase 2 — Self-Development (Milestone 1.0)

Milestone 1.0 is a threshold, not a feature. The system runs its first task on its own codebase. This is the moment Claude Code and Gemini CLI step back.

**Criteria for 1.0:**
- Milestone 0.9 complete: orchestrator has run a real task on an external codebase end-to-end
- External Invariant Test Suite: a third-party suite (not managed by MBO) verifies all nine security invariants (Section 22) through black-box testing — must pass before every `go` during 1.0 development
- Claude Code and Gemini CLI independently agree the system is ready, based on the external suite's results, not internal self-review

**What 1.0 looks like:**
- [ ] Orchestrator runs its first task on its own codebase
- [ ] Task completes successfully and all invariants hold
- [ ] External invariant test suite passes
- [ ] `projecttracking.md` becomes the MBO task queue — the orchestrator drives its own development from here

### The 11-Stage Pipeline (active from Milestone 0.7, complete at 1.0)

Stage 1    — Request Classification
Stage 2    — Architecture Query (Intelligence Graph)
Stage 3A   — Independent Plan Derivation (Architecture Planner)
Stage 3B   — Independent Plan Derivation (Component Planner)
Stage 3C   — Gate 1: Plan Consensus
Stage 3D   — Tiebreaker: Plan (fires after consensus failure)
Stage 4A   — Independent Code Derivation (Architecture Planner)
Stage 4B   — Independent Code Derivation (Adversarial Reviewer, blind)
Stage 4C   — Gate 2: Code Consensus
Stage 4D   — Tiebreaker: Code (fires after 3 block verdicts)
Stage 4.5  — Virtual Dry Run (Pre-Flight Sandbox)
Stage 5    — Human Approval Gate (requires "go")
Stage 6    — Patch Generation
Stage 7    — Structural Verification
Stage 8    — Runtime Verification
Stage 10   — Smoke Test
Stage 11   — Knowledge Update (Intelligence Graph refresh)
Stage 11.5 — Visual Audit (disabled by default)

No code reaches the repository without passing through this sequence and a human typing `go` at Stage 5.

---

## Phase 3 — Expansion (Post-1.0)

These targets are architecturally supported from day one — the event protocol is surface-agnostic, the orchestrator core has no UI dependencies — but are not scheduled until 1.0 ships.

### Hosted Web App
- Web-based interface for users who cannot or do not want to install the CLI
- Same pipeline, same event protocol, delivered over WebSocket
- Compute is light — the orchestrator is coordination logic, not compute
- Docker is the deployment mechanism

### Multi-User Collaboration
- Multiple human operators on a shared project
- Approval gate attribution per user
- Event Store records which human typed `go`

### Stage 11.5 — Visual Audit (Production Enablement)
- Pixel-level screenshot comparison between pre- and post-task UI state
- Currently disabled by default — enabling requires explicit project-level opt-in
- Integration with CI pipelines for visual regression detection

### Expanded Model Coverage
- Additional frontier model support as new CLI providers emerge
- Configurable model assignment per pipeline stage
- Cost/capability routing strategies exposed as user-configurable policy

### Public API
- Programmatic task submission and event stream consumption
- Enables third-party tooling built on MBO's pipeline
- Scoped to read-only audit access and task submission — no direct pipeline bypass

---

## Development Principles (carried forward from Phase 1)

These do not change after 1.0:

1. No code is written without a human typing `go`.
2. Every decision is reproducible from the Event Store.
3. Failure defaults to safe rollback.
4. Independent derivation before comparison — no agent sees another's work first.
5. Model outputs are verified by non-LLM systems when possible.
6. The system architecture is explicit, never inferred.

---

*This document describes what MBO will become. For the implementation contract, see `SPEC.md`. For current task status, see `projecttracking.md`.*
