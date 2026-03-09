MBO Development Dependency Audit - Gemini
### AXIS 1 — DEPENDENCY ORDERING

1. **State and Event Store Foundation**
* **Produces**: SQLite schema, append-only event store, core CRUD operations.
* **Requires**: Nothing.
* **Confidence**: High. Principle 3 states "Every decision is reproducible." Without the event store and `mirrorbox.db` initialized, no model calls, graph queries, or user commands can be legally logged.


2. **Model Abstraction and Authorization Layer**
* **Produces**: Unified `callModel` function, CLI auth extraction, OpenRouter fallback, LLM network timeout handling.
* **Requires**: State Foundation (to log requests).
* **Confidence**: High. Nothing can be built or tested without models responding.


3. **Firewall and Input Contract Enforcement**
* **Produces**: `<PROJECT_DATA>` wrapping, token budgeting (Hard State vs Volatile), prompt injection heuristics.
* **Requires**: Model Abstraction.
* **Confidence**: High. Must precede any pipeline logic to ensure the foundational security invariant (Section 10) is deeply embedded, not tacked on.


4. **Intelligence Graph (Static)**
* **Produces**: Tree-sitter + LSP integration, SQLite graph population, `graph_query_impact` tools.
* **Requires**: State Foundation.
* **Confidence**: High. The Operator cannot route tasks (Tier 0-3) without blast radius queries. Planners cannot plan without `architectureContext`.


5. **Workspace and Process Isolation (Sandbox)**
* **Produces**: Ephemeral Docker container lifecycle, volume mounting logic, execution watchdog.
* **Requires**: Intelligence Graph (for baseline comparison).
* **Confidence**: High. *Deviation from spec.* The spec places Sandbox at Milestone 0.8, *after* Execution and Git (0.7). This is highly dangerous. Generating patches and writing them to the host repo before the sandbox is reliable violates Principle 5. The sandbox must exist before real code generation is attempted.


6. **Operator and Session Management**
* **Produces**: Input classification, routing tier decisions, state summarization, context window monitoring.
* **Requires**: Model Abstraction, Intelligence Graph.
* **Confidence**: Medium. Requires the graph to be functional to test Tier 0 vs Tier 3 routing logic.


7. **Patch Generation and Git Isolation**
* **Produces**: Deterministic patch application via 3-way merge on isolated branches, rollback logic.
* **Requires**: Workspace Isolation.
* **Confidence**: High. Needs a safe place to test diff application without ruining the host machine.


8. **The DID Pipeline (No Execution)**
* **Produces**: Stages 3A, 3B, 3C, 3D (Plan Consensus) and 4A, 4B, 4C, 4D (Code Consensus).
* **Requires**: Operator, Firewall, Intelligence Graph.
* **Confidence**: High. Now that all context providers are ready, the multi-agent orchestration can be tested in a dry run.


9. **Verification and Pre-Flight Validation**
* **Produces**: Compilation checks, test execution inside the sandbox, runtime trace collection.
* **Requires**: Sandbox, DID Pipeline, Patch Generation.
* **Confidence**: High. Closing the loop on the dry-run before human approval.


10. **Human Approval Gate and E2E Pipeline**
* **Produces**: Interactive prompts, VS Code / CLI UI binding for `go`, end-to-end task execution on a target repo.
* **Requires**: All previous steps.
* **Confidence**: High.


11. **MBO Self-Referential Transition**
* **Produces**: MBO working on MBO.
* **Requires**: 100% confidence in the DID Pipeline and Human Approval Gate.
* **Confidence**: High. The ultimate test.



### AXIS 2 — DECISION INVENTORY

1. **Decision**: **CLI Auth Extraction Mechanism**
* **Spec Requirement**: Section 3 (Auth Model) mandates detecting and using active Claude/Gemini CLI sessions.
* **Consequences of wrong**: If the mechanism relies on undocumented internal CLI state (e.g., encrypted SQLite DBs, keychain access), OS updates or CLI updates will silently break the orchestrator's primary auth path.
* **Classification**: BLOCKING.
* **Resolution**: Research & Prototyping.


2. **Decision**: **LSP Server Provisioning and Lifecycle**
* **Spec Requirement**: Section 6 mandates LSP for cross-file semantic meaning.
* **Consequences of wrong**: LSPs are language-specific, resource-heavy, and require project build steps (e.g., `npm install`, `mvn clean compile`) to resolve symbols accurately. If MBO does not know how to initialize the correct LSP for a random user project, the Intelligence Graph fails entirely.
* **Classification**: BLOCKING.
* **Resolution**: Research.


3. **Decision**: **Docker Socket vs. Docker-in-Docker Security**
* **Spec Requirement**: Section 3 mentions both "Docker-in-Docker... spawns ephemeral child containers" and "host Docker socket is mounted".
* **Consequences of wrong**: Mounting the host Docker socket into a container gives the container root access to the host machine. This violates the sandbox security model entirely if malicious code is generated. True DinD is safer but requires privileged mode, which fails in many managed environments.
* **Classification**: BLOCKING.
* **Resolution**: Prototyping.


4. **Decision**: **Tiebreaker Output Enforcement**
* **Spec Requirement**: Stage 3D mandates the Tiebreaker produces an arbitrated `ExecutionPlan`.
* **Consequences of wrong**: If the tiebreaker model hallucinates schema or refuses to pick a side (e.g., outputs conversational text), the pipeline halts. There is no fallback defined for tiebreaker failure.
* **Classification**: CONSTRAINING.
* **Resolution**: Building and Observing.


5. **Decision**: **Sandbox Data Mocking / Hydration**
* **Spec Requirement**: Stage 4.5 mandates an interactive sandbox for human review.
* **Consequences of wrong**: A complex app (e.g., requires a Postgres DB with user data) will immediately crash in the ephemeral sandbox because it has no data. The user cannot interactively review a crashed app.
* **Classification**: CONSTRAINING.
* **Resolution**: Research & Prototyping.



### AXIS 3 — OFF-THE-SHELF AUDIT

1. **Component**: **Intelligence Graph construction (Tree-sitter Node bindings)**
* **Spec Requirement**: Section 6.
* **Existing Solutions**: `tree-sitter`, `tree-sitter-javascript`, etc.
* **Maturity**: PRODUCTION-READY.
* **Gap**: BRIDGEABLE. Needs a wrapper to walk the AST and push to SQLite.
* **Recommendation**: USE WITH WRAPPER.


2. **Component**: **LSP client libraries**
* **Spec Requirement**: Section 6.
* **Existing Solutions**: `vscode-languageserver-node`.
* **Maturity**: PRODUCTION-READY.
* **Gap**: SIGNIFICANT. Bootstrapping headless LSP servers per language without VSCode's infrastructure is incredibly difficult.
* **Recommendation**: BUILD (custom LSP lifecycle manager).


3. **Component**: **Sandboxed execution**
* **Spec Requirement**: Section 16.
* **Existing Solutions**: `dockerode`, Docker CLI, `sysbox`.
* **Maturity**: STABLE.
* **Gap**: SIGNIFICANT. Running isolated, deterministic code safely while capturing fine-grained runtime traces (like function call traces inside the container) requires heavy custom instrumentation.
* **Recommendation**: BUILD (custom orchestrator around `dockerode`).


4. **Component**: **MCP server implementation**
* **Spec Requirement**: Section 6.
* **Existing Solutions**: `@modelcontextprotocol/sdk`.
* **Maturity**: STABLE.
* **Gap**: NONE.
* **Recommendation**: USE.


5. **Component**: **SQLite state management**
* **Spec Requirement**: Section 17.
* **Existing Solutions**: `better-sqlite3`, `drizzle-orm`.
* **Maturity**: PRODUCTION-READY.
* **Gap**: NONE.
* **Recommendation**: USE.


6. **Component**: **Process management and watchdog**
* **Spec Requirement**: Section 18.
* **Existing Solutions**: `pm2`, Node `child_process`.
* **Maturity**: STABLE.
* **Gap**: SIGNIFICANT. The spec requires strict SIGTERM/SIGKILL timelines and IPC to capture stdout buffers precisely up to the kill point.
* **Recommendation**: BUILD.


7. **Component**: **Git operations layer**
* **Spec Requirement**: Section 12, Section 15.
* **Existing Solutions**: `isomorphic-git`, `simple-git`.
* **Maturity**: STABLE.
* **Gap**: BRIDGEABLE. Needs a wrapper to enforce the "Invariant 1: No unapproved file modifications" before committing.
* **Recommendation**: USE WITH WRAPPER.


8. **Component**: **Model provider abstraction**
* **Spec Requirement**: Section 11.
* **Existing Solutions**: Vercel AI SDK (`ai`), `langchain`.
* **Maturity**: PRODUCTION-READY.
* **Gap**: BRIDGEABLE. Vercel AI SDK handles multi-vendor routing perfectly, but needs a wrapper to enforce the `<PROJECT_DATA>` firewall tag requirements.
* **Recommendation**: USE WITH WRAPPER.



### AXIS 4 — OPEN QUESTIONS THAT BLOCK

1. **Question**: How does the Intelligence Graph handle dynamic dependencies, reflection, or IoC containers during static analysis?
* **Blocks**: Section 6 (Graph Construction) and Section 8 (Routing Tiers).
* **To Answer**: Test the Tree-sitter + LSP hybrid against a heavily abstracted framework (e.g., NestJS or Spring Boot).
* **Cost**: CATASTROPHIC. If the graph misses an injection dependency, it calculates a blast radius of 0, routes to Tier 0, and bypasses DID and human approval, potentially breaking production.
* **When to Resolve**: Before Milestone 0.4.


2. **Question**: How are API keys and database connections hydrated into the Sandbox for interactive preview?
* **Blocks**: Section 16 (Sandbox) and Section 15 (Stage 4.5 Virtual Dry Run).
* **To Answer**: Prototyping an interactive preview of a standard web app that requires a database.
* **Cost**: HIGH. If the sandbox app crashes on boot due to missing env vars, the "interactive test drive" is useless, degrading the approval gate to a diff review.
* **When to Resolve**: Before Milestone 0.8.


3. **Question**: Does passing the host Docker socket (`/var/run/docker.sock`) into the MBO container compromise the entire host system?
* **Blocks**: Section 3 (Docker Configuration).
* **To Answer**: Security audit of the container architecture.
* **Cost**: CATASTROPHIC. If malicious code generated by the LLM runs in an "ephemeral" container that has access to the host's Docker socket, it can spawn root containers on the user's host machine.
* **When to Resolve**: Before Milestone 0.1.


4. **Question**: How do you extract CLI auth sessions securely across all operating systems without triggering OS-level security warnings or violating keystore protections?
* **Blocks**: Section 3 (Auth Model).
* **To Answer**: Platform tests on MacOS (Keychain), Linux (secret-service), and Windows (Credential Manager).
* **Cost**: HIGH. This is the "Tier 1" preferred auth mechanism. If it requires root access or complex workarounds, user adoption fails.
* **When to Resolve**: Before Milestone 0.2.



### AXIS 5 — RATIONALE CHAIN

1. **First Step: State and Event Store Foundation**
* The spec demands absolute reproducibility (Principle 3) and an append-only log (Section 7).
* Therefore, *before* we can test auth routing, prompt generation, or graph parsing, we must have a mechanism to record those actions.
* If Model Abstraction is built before the Event Store, developers will write tests and manual scripts that execute models off-the-record, baking in technical debt that bypasses the core invariant of the system. Thus, the database must exist on Day 1.


2. **Gate before first code: Sandbox Execution (Docker-in-Docker)**
* The spec places Git operations (0.7) before Sandbox (0.8). This is out of order.
* Stage 6 (Patch Generation) relies on applying a 3-way merge to a branch. But Principle 5 demands failure defaults to a safe rollback, and Section 16 demands that we observe runtime behavior *before* touching the real repository.
* If we build Patch Generation and Git execution before the sandbox is stable, we are testing untrusted, LLM-generated diffs directly on the user's host machine filesystem.
* Therefore, the ephemeral, isolated Sandbox must be proven to securely execute and isolate code *before* we build the Git pipeline that merges code.


3. **Gate before MBO can safely work on its own codebase: End-to-End Tier 3 Pipeline**
* MBO developing itself (Appendix A) requires MBO to read its own complex architecture.
* The Intelligence Graph must be able to accurately map MBO's multi-agent process boundaries.
* If MBO works on itself using only a Tier 1 or Tier 2 pipeline, it lacks the Tiebreaker adjudication and the deep architectural DID checks.
* A bug introduced into MBO's routing logic by MBO could silently disable the DID process for all future tasks.
* Therefore, the full Tier 3 E2E pipeline (including Sandbox runtime trace validation) must be perfectly stable before the self-referential transition.



### AXIS 6 — ADVERSARIAL PROCESS AUDIT

**Process 1: The DID context isolation mechanism (Section 14)**

* **Step 1 — Precondition:** TypeScript typing (`ReviewerInput`) and software architecture boundaries are sufficient to prevent the Reviewer from seeing the Planner's output.
* **Step 2 — Attack:** The orchestrator runs in a single Node.js process. Context window management (Section 8) condenses the session history. If the Operator accidentally includes the Planner's output in the `StateSummary` or `sessionHistory` due to a poorly truncated log, that state bleeds into the `HardState` or volatile history passed to the Reviewer. Types disappear at runtime; strings do not.
* **Step 3 — Cascade:** The Reviewer sees the Planner's plan hidden in the session history. The Reviewer anchors to it, abandoning independent derivation. DID collapses into single-pass rubber-stamping. MBO assumes high confidence because "both agreed", but they agreed because of context leakage.
* **Step 4 — Better Solution:** Cryptographic isolation. The orchestrator must run the Planner and Reviewer in separate, sandboxed child processes with zero shared memory. Before sending the prompt to the Reviewer API, the orchestrator must hash the Planner's output and scan the Reviewer's raw outgoing text string payload. If any text similarity heuristic or hash match is found between the Planner's output and the Reviewer's input string, the pipeline must throw a fatal error.

**Process 2: The human approval gate (Section 5, Principle 1)**

* **Step 1 — Precondition:** A human typing `go` guarantees meaningful supervision.
* **Step 2 — Attack:** Alert fatigue. The sandbox environment boots, but because it's a complex app, the sandbox just shows a blank white screen (missing database). The user knows the change was "just a CSS fix", so they ignore the broken sandbox and type `go` to push it to Git.
* **Step 3 — Cascade:** The user begins typing `go` mechanically. A malicious or hallucinated LLM plan deletes a load-bearing route. The user types `go` anyway because the system trains them that "the sandbox is usually broken but the code is fine." The codebase is destroyed.
* **Step 4 — Better Solution:** Proof of work. For Tier 2 and Tier 3 tasks, typing `go` is insufficient. The orchestrator must generate a one-time 4-character hash or ask a multiple-choice question about the diff (e.g., "This changes the authentication middleware. Type the name of the function being removed to approve"). Active validation, not passive acknowledgment.

**Process 3: The Appendix C development protocol**

* **Step 1 — Precondition:** Gemini CLI reviewing Claude Code's diffs blind works reliably.
* **Step 2 — Attack:** Claude has deep, accumulated context in its session about *why* a hacky workaround was necessary (e.g., an undocumented bug in a library). Gemini CLI is instantiated fresh and blind. Gemini sees the hacky workaround, flags it as a spec violation, and blocks it. Claude refactors to a clean version that crashes.
* **Step 3 — Cascade:** Endless loops of Gemini blocking Claude because Gemini lacks the historical context of *why* the codebase is the way it is. The human is forced to intervene constantly.
* **Step 4 — Better Solution:** Symmetrical Hard State. Blind review means blind to the *current plan*, not blind to the project history. Both agents must receive the exact same `projectNotes`, `BUGS.md`, and `CHANGELOG.md` injected into their system prompts before every run.

**Process 4: The Intelligence Graph as a routing mechanism**

* **Step 1 — Precondition:** Static analysis (Tree-sitter + LSP) accurately maps blast radius to determine Tier 0 (inline) vs Tier 3 (DID).
* **Step 2 — Attack:** A JavaScript project uses dynamic imports (`const module = await import(dynamicPath)`), dependency injection, or string-based reflection.
* **Step 3 — Cascade:** The Intelligence Graph calculates a blast radius of 0 for a critical, dynamically loaded configuration file. The Operator routes the task to Tier 0. The patch generator modifies the file without DID, without sandbox, and without human approval (Tier 0 skips the gate). The application goes down.
* **Step 4 — Better Solution:** Default to untrusted. Tier 0 routing cannot be based solely on "blast radius = 0". Tier 0 must strictly require: Blast Radius = 0 AND File Path matches an explicit user-approved `tier_0_safelist` (e.g., `*.css`, `*.md`). If a file is not explicitly safelisted, the minimum routing is Tier 1, enforcing the human approval gate.

**Process 5: The onboarding prime directive synthesis**

* **Step 1 — Precondition:** An LLM can synthesize the user's *actual* load-bearing constraint better than the user's verbatim Q3 answer.
* **Step 2 — Attack:** The user uses sarcasm ("Just don't make it look like a 90s website") or hyperbole during the interview. The LLM misinterprets the sentiment and synthesizes a rigid, absolute rule: "The aesthetic design must never utilize any UI patterns originating prior to the year 2000."
* **Step 3 — Cascade:** This Prime Directive is injected into *every single prompt*. The architecture planner begins rejecting perfectly valid, robust architectural plans (like using a standard HTML table for tabular data) because it violates the hallucinated Prime Directive.
* **Step 4 — Better Solution:** Human authorship. The LLM can *draft* the Prime Directive based on the interview, but the user must be placed into a text editor (`nano`/`vim`/VSCode) to manually edit and save the final string. The system must never use an LLM-synthesized constraint as load-bearing without literal human keystrokes confirming the exact phrasing.

**Process 6: The sandbox as a pre-approval validation layer**

* **Step 1 — Precondition:** The sandbox container provides an environment similar enough to production to validate runtime behavior.
* **Step 2 — Attack:** The codebase relies on third-party APIs (Stripe, AWS, SendGrid) and environment variables (`.env`). Section 16 explicitly states "secrets must never be injected into sandbox execution."
* **Step 3 — Cascade:** Because secrets are stripped, the application immediately throws `Missing API Key` exceptions on boot. The runtime instrumentation captures a massive stack trace of initialization failures. The pre/post patch comparison shows 100% failure rate. The pipeline halts endlessly.
* **Step 4 — Better Solution:** Sandbox execution modes. The spec needs a "Mock Mode" (requires users to define mock interfaces for external APIs) or an "Isolated Local Mode" (allows non-production dev keys via a specific `.env.sandbox` file). Without a defined strategy for external dependencies, the sandbox only works for pure-logic libraries, not real applications.

---

### HIGHEST CONFIDENCE CONCLUSIONS

* **State precedes execution:** The SQLite database and event log must be the very first things built. Nothing can be executed without an immutable record.
* **Sandbox precedes Git:** Ephemeral code testing must be proven safe before the orchestrator is granted permission to run `git merge` on the user's host machine.
* **Tier 0 is dangerous:** Allowing an LLM to automatically bypass human approval based purely on static analysis of a dynamic language (JS/TS) will result in catastrophic unauthorized writes.
* **DinD architecture is a massive security risk:** Mounting the host's Docker socket into the orchestrator container gives generated LLM code a vector to root the host machine.
* **Types do not guarantee isolation:** Relying on TypeScript types to enforce DID blindness is naive. True isolation requires parsing the runtime strings to ensure context hasn't leaked through the Operator's summary.

### MOST DANGEROUS SPEC ASSUMPTIONS

* **Assuming static analysis (Tree-sitter/LSP) catches all dependencies:** If the graph misses dynamic imports, the blast radius calculations fail, breaking the core cost-routing mechanism.
* **Assuming the sandbox can run the app without secrets:** Real-world apps will fail to boot inside the sandbox if they are completely stripped of environment variables, rendering Stage 4.5 useless.
* **Assuming users will provide meaningful oversight via `go`:** If the sandbox is unreliable or difficult to use, users will suffer alert fatigue and rubber-stamp destructive changes.
* **Assuming LSPs can be universally provisioned headless:** LSPs often require compilation or dependency installation (`node_modules`) to work accurately. A "silent scan" taking "seconds" will fail if the LSP hasn't indexed.
* **Assuming CLI auth is easily extractable:** Relying on undocumented, highly secure local CLI sessions (Claude/Gemini) as the primary auth mechanism is incredibly brittle and likely to fail across different OS permissions.