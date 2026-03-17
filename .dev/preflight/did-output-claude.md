# Mirror Box Orchestrator — DID Pre-Build Analysis
## Instrument v1.1 — Claude Output

---

## AXIS 1 — DEPENDENCY ORDERING

**Step 1 — Project Skeleton and Governance**
- Produces: Repository structure, `AGENTS.md`, `projecttracking.md`, `BUGS.md`, `CHANGELOG.md`, `SPEC.md`, development protocol ratified
- Requires: Nothing. This is ground zero.
- Confidence: HIGH — nothing can be tracked, reviewed, or built without this frame. The Appendix C protocol is explicit that no code gets written before this.

**Step 2 — Technology Stack Validation and Dependency Spikes**
- Produces: Confirmed answers to the three Appendix B open questions (Docker-in-Docker feasibility, CLI session mounting into Docker, VS Code extension distribution); confirmed Tree-sitter Node bindings work; confirmed LSP client library choice; confirmed Ink v5 runs on all three target platforms
- Requires: Step 1 (tracking doc to log spike results)
- Confidence: HIGH — these are not optional research items. Docker-in-Docker feasibility directly determines whether the sandbox architecture is buildable. If DinD doesn't work in the target environments, Section 16 must be redesigned before any code is written. Doing this after building would be catastrophic.

**Step 3 — Core Runtime and Process Infrastructure**
- Produces: Node.js project scaffolding, `child_process.spawn` wrapper, watchdog process, timeout enforcement, `SIGTERM`/`SIGKILL` lifecycle, shell injection prevention
- Requires: Step 2 (confirmed Node version, confirmed platform behavior)
- Confidence: HIGH — every downstream component spawns or supervises processes. The watchdog is infrastructure, not a feature.

**Step 4 — SQLite State Layer (`mirrorbox.db`)**
- Produces: Database initialization, schema creation, transaction wrapper, integrity check on startup, corruption recovery path, all table definitions from Section 17
- Requires: Step 3 (runtime exists)
- Confidence: HIGH — the Event Store, Intelligence Graph, onboarding profile, session handoff, and pipeline run logs all write here. Nothing persistent works without this.

**Step 5 — Event Store**
- Produces: Append-only event log, `Event` schema, secret redaction pass, parent reference chain, SHA-256 payload hash
- Requires: Step 4 (SQLite layer)
- Confidence: HIGH — every pipeline stage logs to the event store. It must exist before any pipeline stage is built.

**Step 6 — Configuration and Auth Layer**
- Produces: `~/.orchestrator/config.json` schema and loader, CLI session detection (Claude, Gemini, OpenAI), local model detection (Ollama, LM Studio), OpenRouter key validation, provider map stored in session
- Requires: Step 3 (process infrastructure to run detection commands), Step 4 (session state storage)
- Confidence: HIGH — Gate 0 depends on this entirely. Nothing routes to a model without it.

**Step 7 — Gate 0: Preflight**
- Produces: Dependency checker, binary version validation, server health check with auto-start, auth provider detection, `gate0.config.json` schema and loader
- Requires: Step 6 (auth layer), Step 4 (state), Step 3 (process spawning for server start)
- Confidence: HIGH — no pipeline run begins without Gate 0 passing. This is the entry gate to everything.

**Step 8 — `callModel` Function and Firewall**
- Produces: Single model invocation function, `<PROJECT_DATA>` tag wrapping, firewall directive prepended to every system prompt, firewall warning heuristic, provider routing through `callModel`, all providers reachable through one interface
- Requires: Step 6 (provider config and auth), Step 5 (event store to log every call)
- Confidence: HIGH — Section 22 Invariant 6 is absolute: no model call bypasses `callModel`. This must be built and hardened before any agent is built on top of it.

**Step 9 — Operator: Classification Only**
- Produces: `Classification` object from user input, `OperatorInput` schema, `Classification` schema, routing tier logic, `reclassify` command
- Requires: Step 8 (`callModel`), Step 4 (state), Step 7 (Gate 0 has passed before operator runs)
- Confidence: HIGH — classification is the first pipeline action after Gate 0. All downstream routing depends on it. Build and test this in isolation before adding session management.

**Step 10 — Intelligence Graph: Construction**
- Produces: Tree-sitter scan of real codebase, LSP cross-file resolution, `nodes` and `edges` tables populated, `GraphQueryResult` format verified, `graph_query_impact` working
- Requires: Step 4 (SQLite), Step 2 (Tree-sitter and LSP libraries confirmed), a real test codebase (spec names `johnseriouscom`)
- Confidence: HIGH — the spec is explicit that models never receive raw files, only graph query results. The operator's Tier 0 determination requires graph queries. Without the graph, classification cannot be trusted and no pipeline tier can be correctly assigned.
- **Note on spec ordering:** The spec places Intelligence Graph at Milestone 0.4, after Operator at Milestone 0.3. This is wrong. The operator's classification logic requires graph queries to determine blast radius. Building the operator without the graph means the operator can only classify by pattern-matching on the request text — which the spec explicitly forbids for Tier 0 determination. Graph must precede or be built simultaneously with the operator's blast-radius logic.

**Step 11 — Operator: Full Session Management**
- Produces: `StateSummary`, `HardState`, context window monitoring at 80% threshold, session summarization, `sessionSummary` generation, context reset display, `AGENTS.md` detection and injection, `NEXT_SESSION.md` read on startup
- Requires: Step 9 (classification working), Step 10 (graph queryable), Step 4 (state persistence), Step 5 (event logging)
- Confidence: HIGH — session management wraps classification. But classification must be testable independently first.

**Step 12 — Formal Input Contract Types**
- Produces: All TypeScript interfaces from Section 13 — `OperatorInput`, `PlannerInput`, `ReviewerInput`, `ReviewerComparisonInput`, `PatchGeneratorInput`, `HardState`, `StateSummary`, `GraphQueryResult`, `ExecutionPlan`, `RuntimeEdge`; serializer with token budget enforcement; `ReviewerInput` structurally excludes planner output fields
- Requires: Step 10 (graph schema known), Step 11 (operator state schema known)
- Confidence: HIGH — the DID isolation guarantee is enforced at the type level. These contracts must be locked before any pipeline stage is built. Building stages first and retrofitting types is how isolation breaks.

**Step 13 — DID Pipeline: Stages 3A/3B (Plan Derivation) and Gate 1**
- Produces: Architecture Planner and Component Planner running independently, `ExecutionPlan` output from both, Gate 1 comparison logic, agreement/disagreement detection on `subsystemsImpacted`, `filesToChange`, `changeDescription`
- Requires: Step 12 (typed contracts), Step 8 (`callModel`), Step 10 (graph queries feed `architectureContext`), Step 11 (operator provides task and state)
- Confidence: HIGH

**Step 14 — Tiebreaker (Plan): Stage 3D**
- Produces: Tiebreaker invocation on plan divergence, arbitrated `ExecutionPlan` output, single-fire-per-task enforcement
- Requires: Step 13 (Gate 1 disagreement path exists)
- Confidence: HIGH

**Step 15 — DID Pipeline: Stages 4A/4B/4C (Code Derivation) and Gate 2**
- Produces: Architecture Planner code output, Adversarial Reviewer blind derivation, `ReviewerOutput`, `ReviewerComparisonInput` injection (after reviewer submits), `ReviewerComparisonOutput`, block counter, 3-block threshold
- Requires: Step 13, Step 14 (Gate 1 complete), Step 12 (typed contracts, especially `ReviewerInput` isolation)
- Confidence: HIGH

**Step 16 — Tiebreaker (Code): Stage 4D**
- Produces: Tiebreaker on code divergence after 3 blocks, final plan and code draft, no-disk-write enforcement
- Requires: Step 15 (Gate 2 block path exists)
- Confidence: HIGH

**Step 17 — Human Approval Gate (Stage 5, no sandbox)**
- Produces: Approval display, `go` detection, abort/replan paths, tier-based gate logic (Tier 0 skips, Tier 1–3 require `go`)
- Requires: Step 15/16 (code draft exists), Step 11 (operator surfaces approval)
- Confidence: HIGH — build and test this without the sandbox first. The gate must be solid before the sandbox is wired into it.

**Step 18 — Patch Generator (Stage 6) and Git Operations**
- Produces: File writes within approved scope only, `writeFile` path validation, Git branch creation, `BaseHash` verification, 3-way merge, conflict abort path, branch deletion on conflict
- Requires: Step 17 (human has typed `go`), Step 12 (approved file list from plan), Step 4 (event logging before/after write), Step 5 (event store records merge)
- Confidence: HIGH — this is the first moment code touches a real repository. It must not be built before all gates upstream are solid.

**Step 19 — Structural and Runtime Verification (Stages 7/8)**
- Produces: Compilation check, static analysis, linter, test suite execution, automatic rollback on failure, log capture and display
- Requires: Step 18 (patch applied to real repo), Step 3 (process spawning for test runs)
- Confidence: HIGH

**Step 20 — Smoke Test and Knowledge Update (Stages 10/11)**
- Produces: `pass`/`fail`/`partial` prompt, task status update, changelog entry, Intelligence Graph update post-merge, runtime edges from sandbox added to graph
- Requires: Step 19 (verification passed), Step 10 (graph updatable)
- Confidence: HIGH

**Step 21 — End-to-End Test on External Codebase**
- Produces: First real task executed on `johnseriouscom` (or equivalent), all invariants verified manually
- Requires: Steps 1–20 all functional
- Confidence: HIGH — this is Milestone 0.7 in the spec. It is correctly placed as a gate before sandbox work begins, because sandbox complexity should not be introduced until the baseline pipeline is proven.

**Step 22 — Docker-in-Docker Sandbox (Section 16)**
- Produces: Ephemeral container per task, isolated filesystem copy, instrumented execution, runtime trace collection, pre/post patch comparison, regression detection, sandbox staying live for interactive review, sandbox failure returning signals to Stage 3A
- Requires: Step 21 (baseline pipeline proven), Step 2 (DinD feasibility confirmed from spikes), Step 10 (graph receives runtime edges)
- Confidence: HIGH for placement; MEDIUM for implementation — DinD has known constraints that the spikes in Step 2 must have resolved.

**Step 23 — Stage 4.5: Virtual Dry Run Wired into Pipeline**
- Produces: Sandbox integrated before Stage 5, validation report generated, interactive sandbox live at approval gate, `replan` path from sandbox failure re-entering Stage 3A with failure context, sandbox failure loop counter separate from Gate 2 block counter
- Requires: Step 22 (sandbox exists), Step 17 (approval gate exists to wire into)
- Confidence: HIGH

**Step 24 — Onboarding Interview**
- Produces: Four fixed questions, silent scan (leveraging existing graph construction), targeted follow-up (max 10), prime directive synthesis, `AGENTS.md` proposal, gate 0 config proposal, verification baseline, all outputs displayed before write, `OnboardingProfile` schema populated, stored in `mirrorbox.db`
- Requires: Step 10 (graph construction for Phase 2 scan), Step 8 (`callModel` for interview), Step 4 (state storage), Step 12 (profile schema)
- Confidence: MEDIUM on placement — the spec places onboarding at Milestone 0.5, before the DID pipeline. This is defensible because onboarding feeds the prime directive into every pipeline call. However, onboarding's interview logic requires `callModel` and the graph scanner — both of which exist by this point in the sequence. The reason I place it here rather than earlier is that onboarding should be tested against a pipeline that can actually use the prime directive it produces. Testing onboarding in isolation (writing a profile that nothing reads) delays discovery of integration failures.
- **Spec ordering note:** Milestone 0.5 (onboarding) before Milestone 0.6 (DID pipeline) is acceptable if and only if `callModel` and the graph scanner are built first. The spec's ordering implies this but does not state it explicitly.

**Step 25 — MCP Server Interface**
- Produces: MCP server exposing `graph_query_impact`, `graph_query_callers`, `graph_query_dependencies`, `graph_query_coverage`, `graph_search` — accessible to any MCP-speaking client
- Requires: Step 10 (graph populated), Step 4 (SQLite queries)
- Confidence: MEDIUM — the spec describes MCP as the graph's external interface. It is not required for the internal pipeline (internal calls go directly to graph query functions). It is required only if external agents or IDE extensions need graph access. Placement here (post-baseline, pre-VS Code) is correct.

**Step 26 — VS Code Extension**
- Produces: Extension renders all panels, wire protocol events consumed, approval gate functional inside VS Code, all Milestone 0.7 tasks working via extension
- Requires: Step 21 (baseline pipeline proven on CLI), Step 25 (MCP server for graph access if needed by extension)
- Confidence: HIGH — the spec is explicit that VS Code is built in parallel with CLI from Milestone 0.9. Building it before the CLI pipeline is proven is waste.

**Step 27 — Self-Referential Task (Milestone 1.0)**
- Produces: Orchestrator runs its first task on its own codebase. All invariants hold. Claude Code and Gemini CLI step back.
- Requires: Steps 1–26 all functional; all seven security invariants verified; self-referential transition criteria from Appendix C met
- Confidence: HIGH for placement — this is definitionally last.

---

## AXIS 2 — DECISION INVENTORY

**Decision 1: Docker-in-Docker runtime strategy**
- What the spec requires: Section 16 describes ephemeral child containers spawned by the orchestrator container. The host Docker socket is mounted read-only. Docker-in-Docker is named explicitly.
- Consequences of getting it wrong: DinD has well-documented security and stability problems in CI environments, rootless Docker contexts, and some cloud providers. If DinD doesn't work in the target environment, the entire sandbox architecture (Section 16) must be redesigned — potentially replacing it with gVisor, Firecracker, or a lighter VM approach. This is not a patch; it is a component replacement.
- Classification: BLOCKING
- Resolution: Prototyping only — must be tested on Mac, Linux, and WSL2 before any sandbox code is written.

**Decision 2: CLI auth session mounting into Docker**
- What the spec requires: Section 3 states "CLI auth sessions are passed into the container via mounted credential files." The exact mechanism is listed as an open question in Appendix B.
- Consequences: Claude CLI, Gemini CLI, and OpenAI CLI store credentials in different locations with different formats. Some use keychain integration that cannot be mounted as a file. If any provider's credentials are not file-mountable, that provider cannot be used inside Docker — reducing Docker deployments to OpenRouter-only, which breaks the spec's tier system.
- Classification: BLOCKING for Docker deployment path
- Resolution: Research spike per provider, then prototyping.

**Decision 3: LSP client library choice and lifecycle**
- What the spec requires: Section 6 describes LSP providing cross-file semantic meaning. It does not specify which LSP client library to use, how the language server process is managed, or what happens when the LSP server crashes or becomes stale.
- Consequences: Different LSP clients have different APIs, different initialization latencies, and different behavior on large codebases. A bad choice means the graph construction is slow, unreliable, or fails on some languages. LSP server lifecycle management (start, stop, health check, restart) must be designed explicitly or graph queries become flaky.
- Classification: BLOCKING for graph construction
- Resolution: Research + prototyping against a real polyglot codebase.

**Decision 4: Tree-sitter grammar coverage**
- What the spec requires: Section 6 names Tree-sitter for AST parsing across all languages the orchestrator will encounter.
- Consequences: Tree-sitter grammar coverage is uneven. JavaScript, TypeScript, Python, and Rust are excellent. VML (used in `johnseriouscom`) has no official Tree-sitter grammar. If the orchestrator encounters a language without a grammar, it cannot build graph nodes for that language's code — silent gaps in the graph with no error surfaced.
- Classification: CONSTRAINING (pipeline degrades gracefully if a language is missing, but silently)
- Resolution: Research — audit grammar availability for the languages in target codebases. Define fallback behavior (file node with no function nodes) explicitly in the spec.

**Decision 5: `callModel` abstraction boundary for local models**
- What the spec requires: Local models (Ollama, LM Studio) are treated as providers in the same routing table as cloud APIs. Section 12 states the patch generator uses local CLI only, never cloud API.
- Consequences: Local models are invoked differently from cloud APIs — typically via HTTP to a local server, not via a CLI tool with auth sessions. The `callModel` function must abstract this without leaking provider details into callers. If the abstraction is wrong, adding or changing providers requires touching every model call site.
- Classification: CONSTRAINING
- Resolution: Design decision — make it before writing `callModel`.

**Decision 6: How `ReviewerInput` structural isolation is enforced at runtime**
- What the spec requires: Section 22 Invariant 7 states context isolation is "enforced structurally" because `ReviewerInput` doesn't have planner output fields. Section 14 says "passing planner output to the reviewer before Stage 4C is a type error."
- Consequences: TypeScript's type system is compile-time only. At runtime, nothing prevents passing a superset object that happens to satisfy `ReviewerInput` structurally while containing planner output in additional fields. If the reviewer receives planner context through any channel — prompt construction, shared state, ambient context in the operator — the DID guarantee is violated silently.
- Classification: BLOCKING for DID integrity
- Resolution: Design decision — must define runtime enforcement (not just type enforcement) before building Stage 4B.

**Decision 7: Prime directive synthesis trust model**
- What the spec requires: Section 5 describes the system synthesizing a prime directive that "may differ from the Q3 answer." This LLM-generated string is injected into every model call at every pipeline stage.
- Consequences: If the synthesis gets it wrong — hallucinates a constraint, misinterprets a stated concern, over-constrains or under-constrains — every downstream task runs against a wrong prime directive. There is no runtime check that the prime directive is accurate. The user confirms it once at onboarding, but may not fully understand the implications of a subtly wrong synthesis.
- Classification: CONSTRAINING (user can always re-onboard, but silent drift is possible)
- Resolution: Design decision — define what "user confirms" means (must the user paraphrase it back? edit it? accept a displayed version?).

**Decision 8: Tiebreaker invocation authority and abort condition**
- What the spec requires: Section 15 says the tiebreaker fires once per task. If the human rejects the tiebreaker plan, the task is aborted. But who decides the tiebreaker's output is "rejected" — the human at Stage 5, or an earlier evaluation?
- Consequences: If the human rejects a tiebreaker plan at Stage 5 but the system treats this as a general `replan` rather than a tiebreaker rejection, it could loop indefinitely — tiebreaker, approval gate rejection, tiebreaker again. The spec says one fire per task, but the `replan` path from Stage 5 re-enters Stage 3A with failure context. Does that count as a new task?
- Classification: CONSTRAINING
- Resolution: Design decision — explicit abort semantics when `replan` is used after tiebreaker output.

**Decision 9: Context window budget for `HardState`**
- What the spec requires: `HardState` is capped at 5,000 tokens and injected before every model call. It contains the onboarding profile, prime directive, graph summary, and danger zones. The onboarding profile worked example in Section 5 is already several hundred tokens.
- Consequences: On a complex project with a large onboarding profile, the 5,000-token budget may force truncation of the graph summary or danger zones — the very fields that inform safe classification. If truncation is silent, models make routing decisions against incomplete hard state.
- Classification: CONSTRAINING
- Resolution: Design decision — define truncation priority order within `HardState` and whether truncation is surfaced to the user.

**Decision 10: Smoke test ownership and loop behavior**
- What the spec requires: Stage 10 smoke test accepts `fail {reason}`. The spec says "pipeline can restart from planning with failure reason injected into planner context." But it does not define a maximum retry count for smoke-test-triggered restarts, separate from the Gate 2 block counter.
- Consequences: A task that consistently fails smoke test can loop indefinitely: plan → execute → smoke test fail → replan → execute → smoke test fail. There is no escalation path.
- Classification: CONSTRAINING
- Resolution: Design decision — define a smoke test failure loop limit and escalation behavior.

---

## AXIS 3 — OFF-THE-SHELF AUDIT

**Component 1: Tree-sitter Node bindings**
- Spec reference: Section 6
- Best available: `node-tree-sitter` (official Node.js bindings), grammar packages per language (`tree-sitter-javascript`, `tree-sitter-typescript`, etc.)
- Maturity: PRODUCTION-READY for major languages; grammar coverage varies
- Gap: No official VML grammar; no built-in incremental file-watch integration; grammar management (which grammars to load, how to handle missing ones) must be built
- Gap classification: BRIDGEABLE for major languages; SIGNIFICANT for VML and edge cases
- Recommendation: USE WITH WRAPPER — wrapper handles grammar loading, missing-grammar fallback, and incremental re-scan trigger

**Component 2: LSP client**
- Spec reference: Section 6
- Best available: `vscode-languageclient` (most mature, originally VS Code internal), `@sourcegraph/lsp-client`, `languageserver` npm package
- Maturity: `vscode-languageclient` is PRODUCTION-READY but designed for VS Code extension context; standalone use requires abstraction layer
- Gap: Managing LSP server process lifecycle (start, health, crash recovery) outside VS Code is not handled by any library out of the box; cross-language server routing (different server per language) must be built; initialization latency on large codebases is uncharacterized
- Gap classification: SIGNIFICANT
- Recommendation: USE WITH WRAPPER — significant wrapper required for standalone LSP lifecycle management

**Component 3: Docker-in-Docker sandbox**
- Spec reference: Section 16, Section 3
- Best available: Docker's official DinD image (`docker:dind`), Sysbox runtime (security-focused DinD alternative), Podman as rootless alternative
- Maturity: Docker DinD is STABLE but requires privileged mode or `--privileged` flag, which is a security concern; Sysbox is STABLE and avoids privileged mode; Podman is PRODUCTION-READY as an alternative
- Gap: Privileged mode requirement conflicts with hosted deployment on shared infrastructure; DinD behavior on WSL2 is inconsistent across WSL2 kernel versions; socket mounting (`/var/run/docker.sock`) is an alternative but has its own security implications
- Gap classification: SIGNIFICANT — the right choice depends on target deployment environment
- Recommendation: PROTOTYPE FIRST — resolve via Step 2 spike before any sandbox code is written. Sysbox or socket-mount approach likely preferable to naive DinD.

**Component 4: MCP server implementation**
- Spec reference: Section 6
- Best available: `@modelcontextprotocol/sdk` (official Anthropic SDK), `fastmcp` (lightweight alternative)
- Maturity: `@modelcontextprotocol/sdk` is STABLE, actively maintained
- Gap: None significant — the five tools required by the spec map cleanly to MCP tool definitions; the SDK handles transport and protocol
- Gap classification: BRIDGEABLE
- Recommendation: USE WITH WRAPPER — thin wrapper registers the five tools and connects them to graph query functions

**Component 5: SQLite state management**
- Spec reference: Section 17
- Best available: `better-sqlite3` (synchronous, fast, well-maintained), `sqlite3` (async, older), Drizzle ORM or Kysely for type-safe queries
- Maturity: `better-sqlite3` is PRODUCTION-READY; Drizzle is STABLE
- Gap: None significant for `better-sqlite3`; transaction wrapping, integrity check on startup, and corruption recovery are straightforward to implement
- Gap classification: BRIDGEABLE
- Recommendation: USE WITH WRAPPER — `better-sqlite3` with Kysely for typed queries; thin wrapper handles integrity check and corruption recovery

**Component 6: Process management and watchdog**
- Spec reference: Section 18
- Best available: Node.js `child_process` built-in (spawn, not exec), `execa` (better ergonomics, same safety properties)
- Maturity: Built-in is PRODUCTION-READY; `execa` is PRODUCTION-READY
- Gap: The watchdog (background interval, timeout tracking, SIGTERM/SIGKILL lifecycle) must be built; no off-the-shelf watchdog library matches the spec's `ProcessEntry` schema exactly
- Gap classification: BRIDGEABLE
- Recommendation: USE WITH WRAPPER — `execa` for process spawning; custom watchdog loop is ~100 lines

**Component 7: Terminal UI**
- Spec reference: Section 21
- Best available: Ink v5 (spec names it explicitly), Blessed/Blessed-contrib, Charm/Bubbletea (Go, not applicable)
- Maturity: Ink v5 is STABLE; React-based, SSR-capable
- Gap: Ink v5's multi-panel layout for the six named panels requires careful layout management; streaming token output (the `token` event type) requires incremental rendering; Ink v5's behavior with very high token throughput is uncharacterized
- Gap classification: BRIDGEABLE
- Recommendation: USE — build panel layout and streaming renderer on top of Ink v5; prototype high-throughput streaming behavior early

**Component 8: Model provider abstraction**
- Spec reference: Section 11, `callModel` in Section 10
- Best available: LangChain (heavy, opinionated), LiteLLM (Python), Vercel AI SDK (JavaScript, multi-provider), `openai` npm package with base URL override for OpenRouter
- Maturity: Vercel AI SDK is STABLE; `openai` package is PRODUCTION-READY
- Gap: The spec requires a single `callModel` function that routes to local models (Ollama HTTP), CLI sessions (subprocess invocation), and cloud APIs (HTTP). No single library covers all three. CLI session invocation (writing a prompt to Claude CLI's stdin and reading stdout) is not supported by any existing provider SDK.
- Gap classification: SIGNIFICANT — the CLI session path requires custom subprocess management
- Recommendation: BUILD — custom `callModel` with provider adapters per tier: HTTP adapter for cloud/OpenRouter, HTTP adapter for Ollama/LM Studio, subprocess adapter for CLI sessions

**Component 9: Event store append-only log**
- Spec reference: Section 7
- Best available: SQLite (already chosen), append-only enforcement via application logic since SQLite has no native append-only constraint
- Maturity: N/A — this is a design pattern, not a library
- Gap: SQLite doesn't enforce append-only natively; application must enforce "no UPDATE, no DELETE on events table." This must be tested, not just asserted.
- Gap classification: BRIDGEABLE
- Recommendation: USE WITH WRAPPER — wrapper function that only exposes INSERT on the events table; no raw SQL access to events table from application code

**Component 10: Git operations**
- Spec reference: Section 15, Stage 6
- Best available: `simple-git` (npm, wraps git CLI), `isomorphic-git` (pure JS, no git binary required), `nodegit` (libgit2 bindings, abandoned)
- Maturity: `simple-git` is PRODUCTION-READY; `isomorphic-git` is STABLE
- Gap: The spec requires branch creation, `BaseHash` verification, 3-way merge, and abort-on-conflict. `simple-git` covers all of these. The spec also requires working directory clean state check before pipeline start — trivial with `simple-git`.
- Gap classification: BRIDGEABLE
- Recommendation: USE WITH WRAPPER — `simple-git` with a thin wrapper that enforces the spec's Git operation sequence

**Component 11: Static analysis and linting integration**
- Spec reference: Stages 7/8
- Best available: ESLint (JavaScript/TypeScript), TypeScript compiler (`tsc`), language-specific tools (pylint, rubocop, etc.) invoked as subprocesses
- Maturity: PRODUCTION-READY for major languages
- Gap: The spec requires per-project verification commands defined at onboarding (`verificationCommands`). The integration is subprocess invocation, not library integration — this is already the right design. The gap is the runner that maps verification commands to subprocess calls and parses exit codes.
- Gap classification: BRIDGEABLE
- Recommendation: USE — subprocess runner that executes verification commands, captures stdout/stderr, interprets exit codes

**Component 12: Test generation**
- Spec reference: Section 16
- Best available: No mature off-the-shelf solution for LLM-driven test generation that integrates with arbitrary test frameworks
- Maturity: N/A — this is a novel capability
- Gap: The spec says "the orchestrator generates additional tests" when coverage is below threshold. This implies an LLM-driven test generation pass with awareness of the test framework, coverage tool, and existing test patterns. No library provides this.
- Gap classification: UNBRIDGEABLE as a library; must be built as a pipeline stage
- Recommendation: BUILD — treat as a mini-pipeline: coverage report → `callModel` with coverage gap → generated test code → sandbox execution only → human approval before commit

**Component 13: Program instrumentation for runtime traces**
- Spec reference: Section 16
- Best available: Node.js `--inspect` flag and CDP protocol (Chrome DevTools Protocol), OpenTelemetry (vendor-neutral instrumentation), V8 coverage tools
- Maturity: OpenTelemetry is PRODUCTION-READY; CDP is PRODUCTION-READY for Node.js; coverage for other languages varies significantly
- Gap: The spec describes collecting function call traces, dependency loading order, API request logs, database access patterns, configuration reads, and environment variable usage. OpenTelemetry covers most of this for Node.js. For other languages, instrumentation must be added per-language — significant work for polyglot support.
- Gap classification: SIGNIFICANT for polyglot; BRIDGEABLE for Node.js-only
- Recommendation: USE WITH WRAPPER for Node.js (OpenTelemetry); BUILD per-language adapters for others; scope to Node.js for Milestone 0.8, defer polyglot instrumentation

---

## AXIS 4 — OPEN QUESTIONS THAT BLOCK

**Q1: Does Docker-in-Docker work in all three target environments?**
- Spec reference: Section 16, Appendix B open question
- What blocks: The entire sandbox architecture (Section 16, Stage 4.5)
- Resolution: Platform tests on Mac (Docker Desktop), Lin(native Docker), WSL2 (Docker Desktop for Windows). Test both DinD and socket-mount approaches. Test with and without privileged mode.
- Cost if wrong: CATASTROPHIC — sandbox must be redesigned from scratch
- Resolve before code: YES — before any sandbox code is written

**Q2: Can CLI auth sessions be reliably mounted into a Docker container?**
- Spec reference: Section 3, Appendix B open question
- What blocks: Docker deployment path for any tier above OpenRouter
- Resolution: Research credential file locations per provider; test mount into container; test session validity inside container; test keychain-backed credentials (likely not mountable)
- Cost if wrong: HIGH — Docker deployment degrades to OpenRouter-only, which the spec does not acknowledge as an acceptable degradation
- Resolve before code: YES — before Docker deployment code is written

**Q3: What is the actual latency and reliability of LSP on large codebases?**
- Spec reference: Section 6 ("Together they cover everything the graph needs")
- What blocks: Intelligence Graph construction time expectations; whether LSP is viable as a synchronous component of onboarding Phase 2
- Resolution: Prototype LSP graph construction on `johnseriouscom` and a medium-size open-source codebase; measure initialization time, query latency, and crash rate
- Cost if wrong: HIGH — if LSP is too slow or unreliable, the hybrid approach must be replaced with a different cross-file resolution strategy
- Resolve before code: YES — before graph construction code is finalized

**Q4: Does the `callModel` subprocess interface for Claude CLI / Gemini CLI actually work reliably?**
- Spec reference: Section 11, Gate 0 auth detection
- What blocks: All CLI-session-based model calls
- Resolution: Prototype stdin/stdout communication with Claude CLI and Gemini CLI; test with prompts of varying length; test streaming output capture; test behavior on timeout
- Cost if wrong: HIGH — if CLI subprocess communication is unreliable (buffering, encoding, process supervision issues), the entire CLI session auth tier collapses
- Resolve before code: YES — before `callModel` CLI adapter is finalized

**Q5: What are the actual token budgets of target models?**
- Spec reference: Section 13, `HardState` 5,000-token cap; Section 8, 80% context threshold
- What blocks: Correct context window management, operator summarization triggers
- Resolution: Confirm context window sizes for all configured models (Claude Opus 4, Gemini 2.0 Pro, local models); verify 5,000-token `HardState` fits within these windows without consuming excessive context
- Cost if wrong: MEDIUM — wrong budget causes either premature summarization or context overflow
- Resolve before code: BEFORE context management code is written (can be deferred to Milestone 0.3)

**Q6: How does the human interact with the live sandbox in a CLI context?**
- Spec reference: Stage 4.5 — "the human can interact with the live result before approving — resize the browser, click the button, double-click the icon"
- What blocks: Stage 4.5 design for CLI
- Resolution: Design decision — the sandbox exposes a port, the human opens a browser manually, or the CLI opens a browser automatically. This must be specified before Stage 4.5 is built.
- Cost if wrong: MEDIUM — wrong interaction model makes the interactive sandbox useless in CLI context
- Resolve before code: YES — before Stage 4.5 implementation

**Q7: Does Tree-sitter incremental parsing work correctly when the patch generator modifies files?**
- Spec reference: Section 6 ("only the files touched by the patch generator are re-scanned")
- What blocks: Correct post-task graph updates (Stage 11)
- Resolution: Prototype: apply a diff to a file, trigger incremental re-scan, verify the graph correctly reflects the new state without requiring a full rebuild
- Cost if wrong: MEDIUM — incorrect incremental updates silently corrupt the graph, causing future classification errors
- Resolve before code: Can be deferred to Milestone 0.4 spike

**Q8: What is the behavior of the Gate 2 block counter when a tiebreaker plan is revised and resubmitted?**
- Spec reference: Section 15, Stage 4D — "fires after 3 block verdicts"
- What blocks: Correct tiebreaker trigger logic
- Resolution: Design decision — does a tiebreaker plan go back through Gate 2 from zero? If so, a sufficiently adversarial reviewer could block indefinitely. The spec says "fires once per task" for the tiebreaker but is silent on what happens if the reviewer blocks the tiebreaker's code.
- Cost if wrong: MEDIUM — infinite loop possibility if the reviewer blocks the tiebreaker's output
- Resolve before code: YES — before Stage 4C/4D is implemented

---

## AXIS 5 — RATIONALE CHAIN

### Rationale Chain 1: The True First Step Is Governance and Spikes, Not Code

**Claim:** The first step is project governance (AGENTS.md, projecttracking.md, protocol), followed immediately by technology validation spikes — before any application code is written.

**Chain:**

1. The MBO spec describes a system that coordinates multiple AI models to write code safely. Every safety guarantee in the system depends on the pipeline running in a defined order with defined contracts between stages.

2. If any foundational architectural assumption is wrong — DinD doesn't work, CLI session mounting isn't possible, LSP is too slow — then code written before that discovery must be partially or fully rewritten. The cost of discovery scales with how much has been built on top of the wrong assumption.

3. The three most dangerous unknown assumptions in the spec are exactly the ones Appendix B names as open questions: DinD, CLI session mounting, and VS Code extension distribution. These are not incidental — they are architectural unknowns that could force major component redesigns.

4. Therefore: before any `npm init`, before any database schema, before any TypeScript interface — run the spikes. Write minimal throwaway proofs-of-concept for DinD, CLI session mounting, and LSP latency. These produce answers, not artifacts.

5. Governance comes first not because it produces code but because it ensures every spike result is tracked, every decision is logged, and every discovered constraint is immediately reflected in the tracking document. Without governance, spike results get lost.

6. The spec's Milestone 0.1 correctly places environment setup first. What it does not make explicit is that the technology spikes should happen *before* Milestone 0.2 (auth and model routing), not as late as "open questions to resolve before Milestone 0.1." The Appendix B questions read like afterthoughts. They are blocking prerequisites.

### Rationale Chain 2: The Gate Between Pre-Build Work and First Code Is `callModel` and the Firewall

**Claim:** The gate between pre-build work (governance, spikes, scaffolding, state layer, event store) and actual agent development is `callModel` — the single model invocation function with the firewall applied.

**Chain:**

1. Every agent in the system (Operator, Architecture Planner, Component Planner, Adversarial Reviewer, Tiebreaker, Patch Generator, Onboarding Interview) is built on top of `callModel`. There is no agent that bypasses it. Section 22 Invariant 6 is absolute.

2. If `callModel` is wrong — incorrect firewall application, incorrect provider routing, incorrect context wrapping — then every agent built on top of it inherits the defect. The defect is invisible until a model responds in a way that reveals it.

3. The firewall directive is security-critical. If it is applied inconsistently (some calls have it, some don't), or if it can be accidentally bypassed, the system's primary defense against prompt injection is degraded. This cannot be discovered by code review alone — it requires testing with adversarial project content.

4. Therefore: `callModel` must be built, hardened, and tested against adversarial input before any agent logic is written. The test is: pass a project file containing instructions to the model through `callModel`, and verify the model treats it as data, not as a directive.

5. The SQLite layer and event store must exist before `callModel` is finalized, because `callModel` logs every invocation to the event store. Testing `callModel` in isolation (without the event store) means the event-logging path is never exercised during development — and the logging path is where secrets redaction must happen.

6. This places `callModel` at approximately Step 8 in the dependency order — after infrastructure (process management, SQLite, event store, auth/config) and before any agent.

### Rationale Chain 3: The Gate Before MBO Can Safely Work on Its Own Codebase

**Claim:** MBO cannot safely work on its own codebase until: (a) the baseline pipeline has been proven on at least one external codebase end-to-end, (b) all seven security invariants have been verified empirically (not just by code review), and (c) the Intelligence Graph has been built from the MBO codebase itself and its blast-radius queries have been validated against known dependency relationships in MBO's own code.

**Chain:**

1. The self-referential risk is specific: if MBO misclassifies a change to its own pipeline logic as Tier 0 (zero blast radius), it could make a direct change to the `callModel` function or the DID isolation logic without going through the full pipeline. This would silently degrade the system's own safety guarantees.

2. The blast-radius misclassification risk is not hypothetical — it is the expected condition at first launch. The Intelligence Graph built from MBO's own codebase will be incomplete at Milestone 1.0 because the graph is enriched by runtime traces, and MBO's runtime behavior on its own codebase has never been observed. The first self-referential task runs against a graph built entirely from static analysis.

3. Therefore: before the first self-referential task, a human must manually verify at least three blast-radius queries against MBO's own codebase — specifically: "what calls `callModel`?", "what does Stage 4B's `ReviewerInput` construction touch?", and "what does the `writeFile` wrapper depend on?" If the graph answers these correctly, there is reasonable confidence it will correctly classify changes to safety-critical components as high-blast-radius.

4. The baseline pipeline must be proven on an external codebase first (Milestone 0.7 equivalent) because: proving it on MBO's own codebase first means the tool is unproven when it makes its first real change. If the first real change is to MBO itself and it introduces a bug in the approval gate, the approval gate is now broken and the next task cannot be safely reviewed. The blast radius of a failure in the first self-referential task is the entire system.

5. Appendix C names the criteria correctly: Milestone 0.7 complete, all invariants verified, both Claude Code and Gemini CLI agree the system is ready. The third criterion (two-agent agreement) is the DID principle applied to the transition decision itself — which is exactly right.

---

## AXIS 6 — ADVERSARIAL PROCESS AUDIT

### Process 1: DID Context Isolation (Type Boundary as Enforcement)

**Assumed precondition:** TypeScript's type system prevents planner output from reaching the reviewer before Stage 4C because `ReviewerInput` structurally excludes planner output fields.

**Attack:** TypeScript types are erased at runtime. JavaScript has no structural enforcement at runtime. The spec says "passing planner output to the reviewer before Stage 4C is a type error" — this is true at compile time, not at runtime. The real enforcement mechanism must be runtime, not type-level.

Specific failure modes:
1. A developer constructs the `ReviewerInput` object by spreading a larger context object that happens to contain planner output as a side-loaded field. TypeScript won't catch this if the spread is `as ReviewerInput`.
2. The operator accumulates session history that includes planner output. If any of that history is passed to the reviewer's system prompt (rather than isolated to `ReviewerInput`), the reviewer has seen the plan.
3. The `HardState` injected before every model call contains a `graphSummary` that, after Gate 1, might implicitly describe the agreed plan. If the graph summary is updated after Gate 1 to reflect new information, it becomes an indirect channel for plan leakage.

**Cascade:** Silent DID failure. The reviewer's "independent" derivation is contaminated by the planner's framing. Two agents appear to agree because they started from the same context, not because they independently converged. The system's primary quality mechanism produces false confidence.

**Better solution:** Runtime enforcement via a context registry. Before invoking the reviewer (Stage 4B), the orchestrator registers a "context lock" for that invocation — a whitelist of allowed data sources. The `callModel` function for reviewer calls validates that no data from the planner's outputs is reachable in the assembled prompt. This is implemented as a content-hash comparison: hash the planner's outputs at Stage 3A/3B completion; before reviewer invocation, scan the assembled prompt for any content matching those hashes. Any match is a hard error, not a type error.

---

### Process 2: Human Approval Gate ("go" as a Guarantee)

**Assumed precondition:** Requiring the human to type `go` ensures meaningful human review before any code touches the repository.

**Attack:** The approval gate is only as strong as the information presented at it. The spec describes a validation report and a live sandbox. But:

1. **Information overload degradation:** For a Tier 3 task with many files changed, many reviewer warnings, and a complex validation report, the human is reviewing a large document under time pressure. The practical result is rubber-stamping — the human types `go` without fully understanding what they are approving. The gate exists but provides no real check.

2. **Sandbox divergence from production:** The sandbox runs against a copy of the codebase with sanitized environment variables. If the task's behavior depends on production credentials, external API calls, or production-specific configuration, the sandbox cannot reproduce production behavior. The human approves a result that works in sandbox and fails in production. This is named in Axis 4 Q6 but the spec does not address the production/sandbox divergence problem explicitly.

3. **Approval fatigue in self-referential development:** Once MBO is developing itself, every change requires a `go`. If tasks are small and frequent, the human types `go` many times per session. The psychological tendency toward automatic approval grows with repetition. The gate degrades from active review to ritual.

4. **No gate on the tiebreaker's authority:** The tiebreaker's output "proceeds to human approval gate" — but the human has no basis for evaluating whether the tiebreaker adjudicated correctly. The human sees two divergent plans/code sets and a tiebreaker verdict, but cannot easily determine which was right. The `go` is approving a decision the human cannot evaluate.

**Cascade:** A degraded approval gate means the system's primary safety guarantee (no code without human approval) technically holds but practically fails. The human is a rubber stamp, not a reviewer.

**Better solution:**
1. **Tiered review interface:** For Tier 1, show a minimal diff and ask "does this look right?" For Tier 3, require the human to acknowledge specific items: each danger zone touched, each reviewer warning, the prime directive confirmation. Make acknowledgment of individual items mandatory — not a single `go` for everything.
2. **Divergence summary at gate:** When tiebreaker was invoked, show the human exactly what the two agents disagreed about and which position the tiebreaker chose, in plain language. Don't just show the final output.
3. **Sandbox confidence score:** Display explicitly whether sandbox behavior is complete (all dependencies available) or degraded (sanitized environment, missing external services). "This sandbox ran without production credentials — behavior involving authentication was not verified."

---

### Process 3: Appendix C Development Protocol (Claude Code + Gemini Blind Review)

**Assumed precondition:** Claude Code proposes an implementation, Gemini reviews it blind against the spec, and the review produces genuine independent judgment.

**Attack:**

1. **Context limit on Gemini review:** The MBO spec is ~77KB. The spec section relevant to any given task may be 2,000–10,000 tokens. The diff from Claude Code may be 1,000–5,000 tokens. Gemini receives the task description, the relevant spec section, and the diff. For complex tasks, "the relevant spec section" is a judgment call — whoever decides what to include has already framed the review. If the relevant section is wrong or incomplete, Gemini's review is against the wrong context.

2. **"Blind" doesn't mean "independent":** Gemini sees Claude's diff. It reviews the diff against the spec. But reviewing someone else's implementation is different from deriving your own. Gemini is in confirmation mode — it is looking for spec violations in Claude's code, not deriving what the correct implementation should be. This is adversarial review, which is valuable, but it is not DID. The protocol describes adversarial review while calling it DID.

3. **Reviewer fatigue across sessions:** The protocol requires every diff to go through Gemini review. For high-velocity development sessions, this means many Gemini invocations. Each Gemini session is fresh (no memory between sessions). Quality of review degrades if the reviewer doesn't have full project context. The "read AGENTS.md and projecttracking.md first" instruction helps but doesn't fully substitute for accumulated context.

4. **The protocol reviews code, not behavior:** Gemini can check whether Claude's diff matches the spec. It cannot run the code, verify runtime behavior, or check whether the diff integrates correctly with existing code. The protocol relies entirely on static review.

**Cascade:** The development protocol provides valuable spec-compliance checking but provides weaker guarantees than full DID. This is fine for Phase 1 — it's a reasonable development process. The risk is if Phase 1 development produces subtle context-isolation bugs that only manifest under specific runtime conditions, and the static review process doesn't catch them.

**Better solution:** The protocol is sound for its stated purpose (spec compliance checking). What it lacks is a runtime verification step. Add: after Gemini passes a diff, Claude Code runs the changed code against a test suite before implementation is marked complete. For MBO-specific guarantees (firewall, DID isolation), add specific behavioral tests that can be run in CI: a test that passes planner output to the reviewer invocation and verifies it is rejected at the context-lock layer; a test that passes adversarial project content through `callModel` and verifies the model response doesn't follow embedded instructions.

---

### Process 4: Intelligence Graph as a Routing Mechanism

**Assumed precondition:** The graph's blast-radius queries correctly classify every change's scope, allowing the operator to route tasks to the appropriate tier.

**Attack:**

1. **Graph staleness between builds:** The spec says the graph updates after every successful task (Stage 11). But if a developer makes changes to the codebase outside of MBO (direct git commits, manual file edits, dependency updates), the graph becomes stale. A stale graph can misclassify a change as Tier 0 because the new dependency that makes it Tier 3 doesn't exist in the graph yet. The spec provides `re-onboard --rebuild-graph` but does not describe any automatic staleness detection.

2. **Static analysis misses dynamic dependencies:** The spec acknowledges this — runtime traces fill in edges that static analysis misses. But runtime traces only exist after the first sandbox execution. For the first task on any given code path, the graph has only static edges. Dynamic dependencies (lazy-loaded modules, runtime-resolved call targets, conditional imports based on environment) are invisible. The operator classifies a task using an incomplete graph.

3. **Blast radius is computed in the graph's world, not the real world:** If `graph_query_impact` runs a recursive search 3 degrees of separation, it can only find edges that exist in the graph. A component that is dynamically injected at runtime may have 0 graph edges but enormous real-world blast radius. The Tier 0 determination — "graph explicitly confirms zero blast radius" — means "zero blast radius in the graph we have," which may be a strict subset of real blast radius.

4. **New files and new functions:** A task that creates a new file has no graph nodes for that file. The operator queries impact for a function that doesn't exist yet. The query returns empty — which could be interpreted as zero blast radius, triggering Tier 0. Creating a new file that integrates with existing code is not a zero-blast-radius operation.

**Cascade:** Misclassification as Tier 0 means direct file modification without DID, without human approval (Tier 0 skips the gate entirely), and without sandbox. A Tier 3 task incorrectly classified as Tier 0 bypasses every safety mechanism in the system. This is the highest-consequence failure mode in the entire spec.

**Better solution:**
1. **Conservative default for new files/functions:** Any task that creates a new file or new exported function defaults to Tier 1 minimum, regardless of graph query result. The operator cannot query the impact of nodes that don't exist yet.
2. **Staleness detection:** At the start of every session, compare the last-modified timestamps of all tracked files against the graph's `lastModified` metadata. Any file modified outside MBO since the last graph update triggers a targeted re-scan before any task runs.
3. **Confidence floor for Tier 0:** Tier 0 requires not just zero graph blast radius but also: file exists in graph, function exists in graph, last graph update was more recent than last file modification. If any of these conditions fail, route to Tier 1.

---

### Process 5: Onboarding Prime Directive Synthesis

**Assumed precondition:** The frontier model synthesizes a prime directive from interview data that accurately captures the load-bearing constraint for the project. The user confirms this synthesis before it is committed.

**Attack:**

1. **Synthesis hallucination:** The model synthesizes a prime directive that "may differ from the Q3 answer." This is the spec's feature — the system finds the real constraint behind the stated one. But LLMs hallucinate plausible-sounding constraints. A hallucinated prime directive that sounds authoritative ("The authentication flow must never be stateful due to the CDN layer") could severely constrain all future planning even if the constraint is fabricated.

2. **Confirmation bias at display time:** The user is shown the synthesized prime directive and asked if they agree. The prime directive is presented with reasoning ("You told me X was most important. Based on everything I've learned, I think the real constraint is Y. Here's why."). Humans defer to authority. A confidently-stated prime directive with a plausible explanation will typically be confirmed even if subtly wrong. The confirmation step is not a real check.

3. **Prime directive drift:** The prime directive is injected into every model call. If it is wrong or over-constraining, every task is subject to that wrong constraint. The user may not notice until a task produces surprising output and they trace it back to the prime directive — which may be many tasks later.

4. **No versioning of prime directive effects:** The spec versions the onboarding profile and increments `onboardingVersion`. But it does not log which tasks ran under which prime directive version. If the prime directive is changed on re-onboard, there is no way to audit which prior tasks were constrained by the old directive.

**Cascade:** A wrong prime directive silently degrades every subsequent task. Because it is injected into every model call, it acts as a systematic bias — not a one-time error.

**Better solution:**
1. **Require the user to rephrase, not confirm:** Instead of "Do you agree?", ask the user to "describe in your own words what this means for how I should work on your project." If the paraphrase matches the synthesis, confidence is high. If it diverges, the synthesis is revised.
2. **Prime directive sandbox:** Before committing the prime directive, run one sample task prompt through the planner with the prime directive injected, and show the user what kind of constraint it introduces. "Here's an example of how this prime directive would affect a task like 'add a login button.' Does this look right?"
3. **Task-level prime directive audit:** Log which prime directive version was active for each pipeline run. If the user re-onboards and the directive changes, surface a summary: "Your last 7 tasks ran under a different prime directive. Would you like me to review any of them?"

---

### Process 6: Sandbox as Pre-Approval Validation

**Assumed precondition:** The sandbox accurately represents production behavior, allowing the human to approve based on observable results rather than code review.

**Attack:**

1. **Environment sanitization creates a different environment:** The spec requires secrets to never enter the sandbox. But many applications behave fundamentally differently without real credentials. An OAuth flow that requires a live token cannot be tested. An API integration that requires a real endpoint returns mock errors. The human interacts with a degraded application and approves it — then it fails in production in ways the sandbox could never have surfaced.

2. **Port conflicts in CLI context:** The spec says "sandbox available at: {url or port}" and the human can interact with it via browser. In a CLI context with multiple projects, port assignment is not managed by the spec. If the sandbox picks a port that conflicts with an existing service (including the dev server checked by Gate 0), the sandbox fails to start or the human interacts with the wrong server.

3. **Sandbox timing divergence:** The sandbox runs against a point-in-time copy of the codebase. If the task takes a long time to plan and review, the production codebase may have received concurrent changes (from another developer, from a dependency update, from an automated process). The human approves a change that was correct against the codebase as of Stage 2, but is now incorrect against the current codebase.

4. **Interactive review theater:** "The human can interact with the live result" is only meaningful if the human knows how to interact with the application in a way that exercises the changed behavior. For a change to an authentication flow, the human must know to attempt a login. For a change to a payment processing function, the human must know to attempt a payment. If the human doesn't know what to test, the interactive sandbox is a checkbox, not a review.

**Cascade:** The sandbox provides false confidence. The human approves based on sandbox behavior that does not represent production behavior. The first sign of failure is in production, after the `go` has already been typed.

**Better solution:**
1. **Explicit sandbox coverage declaration:** The validation report must include: "The following behaviors were NOT testable in this sandbox due to: [list missing credentials/services]." Make the gap visible, not invisible.
2. **Managed port allocation:** Gate 0 should claim and register the sandbox port. Port conflicts are a Gate 0 failure, not a runtime surprise.
3. **Change-targeted test prompts:** When the sandbox starts, display not just "interact with the result" but specifically "to verify this change, try: [list of specific actions that exercise the changed behavior]." These prompts are generated from the execution plan's `changeDescription` and the affected functions.

---

### Process 7: Self-Referential Development Transition

**Assumed precondition:** Once Milestone 0.7 is complete and all invariants are verified, MBO can safely run tasks on its own codebase under human supervision.

**Attack:**

1. **The invariant verification problem:** The spec says "all seven security invariants verified" as a criterion. But how? The invariants are architectural properties that emerge from the interaction of multiple components. "No model bypasses `callModel`" is only verifiable by exhaustive code review or by instrumenting every model invocation and checking the caller. The spec provides no verification methodology for the invariants — it names them as criteria without specifying how they are checked.

2. **The feedback loop:** When MBO develops itself, it produces changes to its own pipeline code. Those changes go through the pipeline. The pipeline evaluates the changes. A change that subtly degrades the DID isolation goes through DID — but DID is the mechanism that would catch it. If DID is already compromised, it may not catch the change that further compromises it. The system bootstraps its own trust from its own (possibly already-degraded) mechanisms.

3. **The prime directive on MBO's own codebase:** The prime directive for MBO development would presumably include something like "maintain all security invariants." But LLMs optimize for stated objectives. If the prime directive and the task goal conflict (e.g., "improve pipeline speed" conflicts with "never bypass `callModel`"), the model may propose a solution that appears to satisfy both but actually trades off the invariant for performance in a subtle way.

4. **No rollback semantics for pipeline behavior:** The spec describes automatic rollback for code changes (branch deletion on failure). But "pipeline behavior" is not just code — it is configuration, it is the event store state, it is the onboarding profile. If a self-referential task corrupts the event store (an append-only violation), there is no rollback for the corruption — only a `mirrorbox.db.corrupt.{timestamp}` file and a fresh start. The spec does not describe what "fresh start" means for a system in the middle of self-referential development.

**Cascade:** A degraded self-referential system is the most dangerous failure mode in the entire spec. The system is trusted precisely because of its safety mechanisms. If those mechanisms degrade as the system develops itself, trust is lost without a clear signal that trust has been lost.

**Better solution:**
1. **External invariant test suite:** Before the self-referential transition, implement a separate test suite that does not use the orchestrator itself — it tests the orchestrator's properties from the outside. Test: "Does invoking the reviewer with planner output in context produce the expected context-lock error?" Test: "Does writing to a file not in the approved list produce an error?" These tests run against the live orchestrator as a black box.
2. **Invariant monitoring in production:** During self-referential development, run the invariant test suite before every `go`. If any invariant test fails, the approval gate is locked. The human must manually inspect and re-enable.
3. **Parallel verification:** For the first N self-referential tasks (configurable), run the task through the orchestrator AND run the same task manually (Claude Code + Gemini review, the Phase 1 protocol). Compare outputs. If they diverge significantly, the self-referential result is flagged for human review before `go` is available.

---

## HIGHEST CONFIDENCE CONCLUSIONS

- **`callModel` is the structural keystone.** Every safety guarantee in the spec (firewall, event logging, provider isolation) flows through this single function. It must be the most hardened component in the system and must be built and tested before any agent logic.

- **TypeScript types do not enforce DID isolation at runtime.** The spec's claim that context isolation is "enforced structurally" by the type system is false at runtime. Runtime enforcement (content-hash scanning or context registry) must be built explicitly or the DID guarantee is nominal.

- **The Intelligence Graph has a silent failure mode that bypasses all safety gates.** A stale or incomplete graph can misclassify a high-blast-radius change as Tier 0, skipping DID, skipping human approval, and skipping the sandbox. Conservative defaults (new files always Tier 1, staleness detection) must be implemented before any Tier 0 path is activated.

- **Docker-in-Docker feasibility must be resolved by platform testing before any sandbox code is written.** This is not a design question — it is an empirical question. The answer determines whether the sandbox architecture is buildable as described.

- **The self-referential transition requires external invariant verification, not just internal self-assessment.** The spec's criteria (Milestone 0.7 complete, invariants verified, two-agent agreement) are necessary but not sufficient. The mechanism by which invariants are verified must be specified, and that mechanism cannot be the orchestrator evaluating itself.

---

## MOST DANGEROUS SPEC ASSUMPTIONS

- **"Context isolation is enforced structurally by the type system."** (Section 14, Section 22 Invariant 7) — This is the most dangerous assumption in the spec. It is false at runtime. If this assumption is not corrected before Stage 4B is built, the DID mechanism is security theater from day one.

- **"The graph explicitly confirms zero blast radius" is a safe condition for Tier 0.** (Section 8 routing logic) — The graph is incomplete by design (static analysis misses dynamic dependencies; new files have no nodes; stale graph misses out-of-band changes). Treating graph silence as confirmed safety is a false-negative failure mode with catastrophic consequences.

- **"CLI auth sessions are passed into the container via mounted credential files."** (Section 3) — This assumes all three CLI providers store credentials as files, that files are sufficient for auth without keychain or browser flow, and that mounting those files into a container produces a working session. None of these assumptions has been verified. If any fails, the entire Docker deployment path for non-OpenRouter tiers is broken.

- **"The sandbox gives the human meaningful pre-approval signal."** (Stage 4.5) — The sandbox sanitizes secrets, cannot reproduce production-dependent behavior, and relies on the human knowing what to test. In practice, the sandbox provides strong signal for UI changes and weak signal for backend logic changes involving external dependencies. The spec presents the sandbox as a universal quality gate. It is not.

- **"The prime directive synthesized by the onboarding LLM is load-bearing across all subsequent tasks."** (Section 5) — A hallucinated or subtly wrong prime directive injected into every model call for the lifetime of the project is the highest-leverage single point of failure in the spec. The confirmation step ("Do you agree?") is insufficient to catch subtle synthesis errors. This assumption requires stronger user validation — paraphrase-back at minimum — before the prime directive is committed.

---

*End of Claude output — Instrument v1.1. Compare against independent Gemini output before drawing conclusions. Where these two analyses agree, confidence is high. Where they diverge, that divergence is the work.*