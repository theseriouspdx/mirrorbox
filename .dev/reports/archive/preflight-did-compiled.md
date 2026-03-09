# Pre-Build DID Analysis — Compiled Results
## Mirror Box Orchestrator — Preflight Experiment

**Date completed:** 2026-03-09
**Instrument:** `.dev/preflight/did-prompt.md` (v1.0)
**Agents:** Claude (independent session), Gemini (independent session)
**Tiebreaker:** Claude adversarial comparative analysis
**Source files:** `.dev/preflight/did-output-claude.md`, `.dev/preflight/did-output-gemini.md`, `.dev/preflight/did-comparative-tiebreaker.md`

**Status: COMPLETE — findings integrated. Preflight phase closed.**

---

## Purpose

This analysis was produced before any MBO code was written. Both agents independently analyzed
the full MBO spec using the DID instrument (`did-prompt.md`). Their outputs were compared by
the tiebreaker. Confirmed findings were filed as bugs or integrated into the spec.

This document is the permanent compiled record. The preflight phase is closed.

---

## CONFIRMED BLOCKERS — Both Agents Agree (CERTAIN)

### B-1: TypeScript Types Do Not Enforce DID Isolation at Runtime
- **Spec ref:** Section 14, Section 22 Invariant 7
- **Finding:** The spec claims context isolation is "enforced structurally" by `ReviewerInput`
  type exclusions. This is false at runtime — TypeScript types are erased. Session history
  bleed-through or Operator StateSummary containing planner output silently contaminates the
  Reviewer. Two agents appear to agree because they shared context, not because of independent
  convergence. False confidence.
- **Resolution:** BUG-003 filed, fixed (PRE-0.1-02). Runtime enforcement required beyond
  type-level. Implementation: context lock / content-hash scanning before Reviewer invocation.
  Deferred to Milestone 0.7 implementation.

### B-2: Intelligence Graph Silent Failure Mode for Tier 0 Routing
- **Spec ref:** Section 8 Routing Tiers
- **Finding:** Static analysis misses dynamic imports, IoC container injection, reflection, and
  new files/functions with no graph nodes. "Graph confirms zero blast radius" means zero in the
  graph we have — a strict subset of real blast radius. A Tier 3 task misclassified as Tier 0
  bypasses DID, human approval gate, and sandbox entirely.
- **Risk:** CATASTROPHIC — highest-consequence failure mode in the spec.
- **Resolution:** BUG-004 filed, fixed (PRE-0.1-03). Tier 0 requires safelist membership AND
  graph confirmation. New files default to Tier 1 minimum. Implemented in `operator.js`
  `getSafelist()`.

### B-3: Docker-in-Docker Feasibility is Empirically Unresolved
- **Spec ref:** Section 16, Appendix B
- **Finding:** DinD requires `--privileged` mode (security risk on shared infra, fails in some
  WSL2 configs) or host socket mounting (gives container root-equivalent Docker daemon access —
  a vector for LLM-generated code to spawn root containers). Neither approach proven across
  Mac, Linux, WSL2.
- **Risk:** CATASTROPHIC if wrong — sandbox architecture must be redesigned from scratch.
- **Resolution:** Research spike required before Milestone 0.8. Candidates: Sysbox, scoped
  socket permissions. Platform test on all three targets.

### B-4: CLI Auth Session Mounting into Docker is Unproven
- **Spec ref:** Section 3, Appendix B
- **Finding:** "Passed into the container via mounted credential files" assumes all three
  providers store credentials as files, that files suffice without keychain/browser flow, and
  that mounting them produces a working session. macOS Keychain, Linux secret-service, and
  Windows Credential Manager may all block headless extraction.
- **Risk:** HIGH — Docker deployment degrades to OpenRouter-only for authenticated model calls.
- **Resolution:** Research spike per provider before Docker deployment code (Milestone 0.8).


---

## KEY DIVERGENCE — Sandbox Ordering (Tiebreaker: Favor Gemini)

**Claude's position:** Build and prove the baseline pipeline on an external codebase first
(Stages 1–5, human approval, patch generation, verification). Add sandbox complexity after the
baseline is proven. Stage 7/8 verification + automatic rollback provides sufficient protection
for baseline E2E testing.

**Gemini's position:** Sandbox must precede Git/patch generation. Applying LLM-generated diffs
to a real codebase before sandbox is proven inverts the safety model. Principle 5 ("failure
defaults to safe rollback") requires ephemeral isolation before real repo writes.

**Tiebreaker adjudication:** Gemini's ordering is more conservative and more aligned with the
spec's safety principles. Claude's counter is a real engineering consideration but underweights
the risk. The spec's own Principle 5 supports Gemini's ordering.

**Current milestone sequence (projecttracking.md):**
`0.8 Sandbox → 0.9 Execution + Git` — Gemini's ordering is what was adopted.

---

## HIGH-CONFIDENCE FINDINGS — Claude Only (Tiebreaker: Confirmed)

### C-1: Spec Claims Adversarial Review Is DID (It Is Not)
- **Spec ref:** Appendix C Development Protocol
- **Finding:** The Appendix C protocol calls itself DID. It is actually adversarial review.
  Gemini reviews Claude's diff — it does not independently derive its own implementation.
  Review of another agent's implementation is a different quality guarantee from independent
  convergence. If the development team believes they have DID guarantees but have adversarial
  review guarantees, they will make architectural decisions based on false confidence.
- **Resolution:** Noted in AGENTS.md Section 2. The DID label was not retroactively changed
  (the protocol is sound for its purpose — spec compliance checking), but the distinction is
  now explicit in governance.

### C-2: Self-Referential Degradation Loop
- **Spec ref:** Appendix A, Milestone 1.0
- **Finding:** When MBO develops itself, the changes go through the pipeline. The pipeline
  evaluates the changes. A change that subtly degrades DID isolation goes through DID — but
  DID is the mechanism that would catch it. If DID is already compromised, it may not catch
  the change that further compromises it. The system bootstraps its own trust from its own
  (possibly already-degraded) mechanisms. No other analysis surfaced this.
- **Risk:** Meta-level failure. Degraded self-referential system has no clear signal that
  trust has been lost.
- **Resolution:** External invariant test suite required before Milestone 1.0. Tests the
  orchestrator from outside, not via its own pipeline. Filed as criterion in Milestone 1.0
  checklist (BUG-008 / PRE-0.1-07).

### C-3: Spec Ordering Error — Operator Before Intelligence Graph
- **Spec ref:** Appendix A Milestone sequence (original)
- **Finding:** Original spec placed Operator (0.3) before Intelligence Graph (0.4). But the
  Operator's Tier 0 classification requires graph queries to confirm zero blast radius. Building
  the operator without the graph means it can only classify by pattern-matching on request
  text — which the spec explicitly forbids for Tier 0 determination.
- **Resolution:** BUG-001 + BUG-002 filed and fixed (PRE-0.1-01). Corrected milestone sequence
  adopted in projecttracking.md: `0.4A Graph (Skeleton) → 0.4B Graph (Enrichment) → 0.5
  callModel → 0.6 Operator`.

---

## HIGH-CONFIDENCE FINDINGS — Gemini Only (Tiebreaker: Confirmed)

### G-1: Sandbox Data Hydration — Real Apps Won't Boot Without Secrets
- **Spec ref:** Section 16, Stage 4.5
- **Finding:** Section 16 requires secrets to never enter sandbox. Most real-world apps
  (requiring Postgres, Stripe, SendGrid, etc.) immediately throw `Missing API Key` exceptions
  on boot. The "interactive test drive" is useless if the app crashes at startup. The sandbox
  only works cleanly for pure-logic libraries.
- **Resolution:** Noted. Requires a defined "Mock Mode" or `.env.sandbox` strategy before
  Milestone 0.8. Filed as BUG-013 (P2, deferred).

---

## OFF-THE-SHELF AUDIT — Consensus Recommendations

| Component | Recommendation | Gap |
|-----------|---------------|-----|
| Tree-sitter Node bindings | USE WITH WRAPPER | Grammar coverage uneven; VML has no grammar |
| LSP client | USE WITH WRAPPER (significant) | Standalone lifecycle management not handled by any lib |
| Docker-in-Docker | PROTOTYPE FIRST | Privileged mode, WSL2 inconsistency — empirically unresolved |
| MCP server (`@modelcontextprotocol/sdk`) | USE | No significant gap |
| SQLite (`better-sqlite3`) | USE WITH WRAPPER | Thin wrapper for integrity check, corruption recovery |
| Process management / watchdog | BUILD | No off-the-shelf lib matches ProcessEntry schema |
| Terminal UI (Ink v5) | USE | High-throughput streaming behavior needs early prototype |
| Model provider abstraction | BUILD | CLI session path requires custom subprocess management |
| Event store | USE WITH WRAPPER | Application enforces append-only; SQLite has no native constraint |
| Git operations (`simple-git`) | USE WITH WRAPPER | Thin wrapper enforces approved-file-list before write |
| Static analysis / linting | USE | Subprocess runner for per-project verificationCommands |
| Test generation | BUILD | No mature off-the-shelf solution for LLM-driven test gen |
| Runtime instrumentation | USE WITH WRAPPER (Node.js) | OpenTelemetry for Node.js; polyglot deferred |


---

## DANGEROUS SPEC ASSUMPTIONS — Both Agents Agree

These were the assumptions flagged by both analyses as most dangerous if wrong:

1. **"Context isolation is enforced structurally by the type system"** — False at runtime.
   Most dangerous assumption in the spec. Addressed by BUG-003.

2. **"Graph confirms zero blast radius" is safe for Tier 0** — Graph is incomplete by design.
   Static analysis misses dynamic dependencies. Addressed by BUG-004.

3. **"CLI auth sessions are passed via mounted credential files"** — Unverified across all
   providers and OS keychain implementations. Deferred to Milestone 0.8 spike.

4. **"The sandbox gives the human meaningful pre-approval signal"** — Sandbox sanitizes
   secrets, cannot reproduce production-dependent behavior, and relies on the human knowing
   what to test. Strong signal for UI changes; weak signal for backend logic involving external
   dependencies.

5. **"The prime directive synthesized by onboarding is load-bearing across all tasks"** — A
   hallucinated or subtly wrong prime directive injected into every model call for the
   lifetime of the project. "Do you agree?" confirmation is insufficient. Paraphrase-back
   validation required. Addressed by BUG-006 (PRE-0.1-05).

---

## TIEBREAKER VERDICT SUMMARY

**Overall winner:** Claude output (depth and completeness)
- 27-step Axis 1 vs. Gemini's 11-step — caught real spec ordering errors
- More complete decision inventory (callModel CLI subprocess reliability unaddressed by Gemini)
- Stronger rationale chains with spec-grounded cascade analysis
- Self-referential degradation loop (C-2) — only Claude surfaced this

**Gemini wins on one finding:** Sandbox-before-Git ordering
- Gemini correctly identified that applying LLM diffs to real repos before sandbox inverts
  the safety model. This finding was adopted in the milestone sequence.

**Residual open question (not a coin flip):** Whether Stage 7/8 verification + rollback is
sufficient protection for baseline E2E testing without the pre-approval sandbox, or whether
the sandbox must exist before any real-codebase execution. Gemini has the stronger position
on spec principles. Both arguments are architecturally sound. This was resolved pragmatically
by adopting Gemini's ordering (`0.8 Sandbox → 0.9 Execution`) in projecttracking.md.

---

## STATUS OF EACH FINDING

| ID | Finding | Status |
|----|---------|--------|
| B-1 | TypeScript types don't enforce DID at runtime | Fixed — BUG-003 / PRE-0.1-02 |
| B-2 | Graph silent failure mode for Tier 0 | Fixed — BUG-004 / PRE-0.1-03 |
| B-3 | DinD feasibility unresolved | Open — spike required before Milestone 0.8 |
| B-4 | CLI auth mounting unproven | Open — spike required before Milestone 0.8 |
| C-1 | Appendix C claims DID, delivers adversarial review | Noted in AGENTS.md §2 |
| C-2 | Self-referential degradation loop | Fixed — BUG-008 / PRE-0.1-07 (ext. test suite) |
| C-3 | Operator-before-graph spec ordering error | Fixed — BUG-001/002 / PRE-0.1-01 |
| G-1 | Sandbox secrets / app boot failure | Open — P2 deferred to Milestone 0.8 design |

---

*Preflight phase closed. Source files preserved in `.dev/preflight/` for reference.*
*Next active work: Milestone 0.6, Task 0.6-02 — classifier wiring and routing validation.*
