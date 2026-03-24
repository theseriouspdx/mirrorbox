// DDR-004: Universal adversarial mandate injected into every prompt.
// DDR-005: Failure-mode-first — identify before building, not after.
const ADVERSARIAL_MANDATE = `\
Before finalising anything: identify all failure modes in your solution and solve for each one.
Once your plan and diff are complete, find every way to break them and fix each one.
When you receive the other agent's work, attack it the same way.
Reconcile the best of both into a single combined output, attack that, and fix it before sending.`;

// DDR-001: Natural language output. No JSON forcing.
function buildPlannerPrompt(taskContext) {
  return `[DID - PLANNER]
You are the Architecture Planner. Derive an implementation plan for this task independently.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}
FILES IN SCOPE: ${(taskContext.files || []).join(', ') || 'none'}
TIER: ${taskContext.tier}
BLAST RADIUS: ${(taskContext.blastRadius || []).join(', ') || 'unknown'}

Respond in these sections:

RATIONALE:
<Why this approach. What invariants it preserves. What risks it avoids.>

FILES:
<Each file and the nature of its change, one per line>

INVARIANTS:
<Constraints that must not be violated>

DIFF:
<Unified diff of your proposed changes>`;
}

// DDR-003: Reviewer derives blind. No planner output is visible in round 1.
function buildReviewerPrompt(taskContext) {
  return `[DID - REVIEWER]
You are the Component Planner. Derive your own plan independently and blindly.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}
FILES IN SCOPE: ${(taskContext.files || []).join(', ') || 'none'}
TIER: ${taskContext.tier}

--- BLIND ROUND 1: Independent derivation ---

RATIONALE:
<Your independent rationale>

DIFF:
<Your independent unified diff>

COMBINED DIFF:
<Use your independent diff in round 1. Reconciliation happens in later rounds.>

VERDICT:
<GO if your independent solution is complete. NO followed by specific objections if not.>`;
}

// DDR-003: Reviewer round 2 — addresses Planner objections, final shot before escalation.
function buildReviewerRound2Prompt(taskContext, plannerObjections, combinedDiff) {
  return `[DID - REVIEWER ROUND 2]
You are the Component Planner on your second and final pass.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}

The Planner has objected to your combined diff. These are their specific objections:

PLANNER OBJECTIONS:
${plannerObjections}

PRIOR COMBINED DIFF:
${combinedDiff}

Address each objection. Update the combined diff. Attack it once more before sending.

UPDATED COMBINED DIFF:
<The revised diff addressing Planner objections>

VERDICT:
<GO if you can sign off. ESCALATE if genuinely unresolvable - state exactly what is disputed.>

DISPUTED SEGMENTS:
<Only if ESCALATE: each agent's version of the contested sections, side by side>`;
}

// DDR-003/007: Tiebreaker receives surgical package only — agreed + disputed. Not full transcript.
function buildTiebreakerPrompt(taskContext, agreedDiff, disputedSegments, plannerArgs, reviewerArgs) {
  return `[DID - TIEBREAKER]
You are the Tiebreaker. You own this task fully - produce the final unified diff.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}

The Planner and Reviewer converged on most of the diff but could not resolve the following sections.
Do not re-litigate the agreed portions.

AGREED DIFF:
${agreedDiff}

DISPUTED SEGMENTS:
${disputedSegments}

PLANNER POSITION:
${plannerArgs}

REVIEWER POSITION:
${reviewerArgs}

Make the call. Produce the final unified diff.

FINAL DIFF:
<Complete unified diff: agreed sections + your resolution of disputed sections>

VERDICT:
<GO or ESCALATE_TO_HUMAN with precise description of what is unresolvable>`;
}

// ─── Gate 2 Prompts (SPEC Section 14, Stage 4B / 4C / 4D) ───────────────────

// Stage 4B: Adversarial Reviewer derives its own plan and code BLIND from the
// original task spec only. No Gate 1 plan, no Planner code in context.
// verifyBlindIsolation() must be called on this prompt before dispatch.
function buildGate2BlindPrompt(taskContext) {
  return `[DID - GATE 2 STAGE 4B - BLIND CODE DERIVATION]
You are the Adversarial Reviewer. You have NOT seen the Planner's work.
Derive your own execution plan and implementation independently from the original specification.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}
FILES IN SCOPE: ${(taskContext.files || []).join(', ') || 'none'}
TIER: ${taskContext.tier}
BLAST RADIUS: ${(taskContext.blastRadius || []).join(', ') || 'unknown'}

You are starting from the original specification with no knowledge of the Planner's approach.

INDEPENDENT PLAN:
<Your own execution plan, derived from the spec>

RATIONALE:
<Why this approach. What invariants it preserves. What failure modes it solves.>

DIFF:
<Your independent unified diff>`;
}

// Stage 4C: Reviewer is shown the Planner's code AFTER submitting its own derivation.
// Produces PASS or BLOCK. A BLOCK requires a specific spec violation citation.
// Stylistic differences are not grounds for a block (SPEC Section 14).
function buildGate2ComparePrompt(taskContext, agreedPlan, codeA, reviewerPlan, codeB) {
  return `[DID - GATE 2 STAGE 4C - CODE CONSENSUS REVIEW]
You are the Adversarial Reviewer. You have already submitted your own independent derivation.
Now you are shown the Planner's code. Audit it against the agreed plan.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}

AGREED PLAN (Gate 1 output — both agents converged on this):
${agreedPlan}

YOUR INDEPENDENT DERIVATION (Stage 4B — for reference; do not alter):
YOUR PLAN: ${reviewerPlan || '(not extracted)'}
YOUR DIFF: ${codeB || '(not extracted)'}

PLANNER'S CODE (now revealed for audit):
${codeA}

Audit the Planner's code against the agreed plan and your own independent derivation.
A BLOCK verdict requires a specific spec section or invariant citation.
Stylistic differences, formatting preferences, and equivalent implementations are not grounds for a block.

ASSESSMENT:
<Qualitative comparison of both implementations against the agreed plan>

VERDICT:
<PASS — if the Planner's code correctly implements the agreed plan. OR BLOCK: <cite specific spec section or invariant violated>>

CONCERNS:
<Only if BLOCK: each concern with severity (blocking/warning), description, and affected files>`;
}

// Stage 4C retry: Planner revises code in response to Reviewer BLOCK concerns.
function buildGate2PlannerRevisePrompt(taskContext, agreedPlan, codeA, concerns, blockCount) {
  return `[DID - GATE 2 PLANNER CODE REVISION - attempt ${blockCount}/3]
You are the Architecture Planner. The Adversarial Reviewer has blocked your code.
Address each concern and revise your implementation.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}

AGREED PLAN:
${agreedPlan}

YOUR PREVIOUS CODE:
${codeA}

REVIEWER CONCERNS (each is a spec violation — address all):
${concerns}

Address every concern. Revise your implementation. Attack the revised version before sending.

RATIONALE:
<How you addressed each concern. Cite the concern by description.>

DIFF:
<Revised unified diff>`;
}

// Stage 4D: Tiebreaker receives both plans + both code sets after 3 BLOCK verdicts.
// Per SPEC BUG-010: if a tiebreaker's code is subsequently blocked, escalate to human immediately.
function buildGate2TiebreakerPrompt(taskContext, agreedPlan, codeA, reviewerPlan, codeB) {
  return `[DID - GATE 2 TIEBREAKER - Stage 4D]
You are the Tiebreaker. The Planner and Reviewer failed to reach code consensus after 3 blocks.
You own this task. Produce the final unified diff.
${ADVERSARIAL_MANDATE}

TASK: ${taskContext.task}

AGREED PLAN (Gate 1 — both agents converged on this):
${agreedPlan}

PLANNER'S CODE:
${codeA}

REVIEWER'S INDEPENDENT PLAN:
${reviewerPlan || '(not extracted)'}

REVIEWER'S CODE:
${codeB || '(not extracted)'}

Evaluate both implementations against the agreed plan.
Do not re-litigate the plan. Make the call on code only.
Produce the best final implementation. Attack it before sending.

FINAL DIFF:
<Complete unified diff — the authoritative final implementation>

VERDICT:
<GO or ESCALATE_TO_HUMAN with precise description of what is unresolvable>`;
}

module.exports = {
  buildPlannerPrompt,
  buildReviewerPrompt,
  buildReviewerRound2Prompt,
  buildTiebreakerPrompt,
  // Gate 2 (SPEC Section 14, Stages 4B / 4C / 4D)
  buildGate2BlindPrompt,
  buildGate2ComparePrompt,
  buildGate2PlannerRevisePrompt,
  buildGate2TiebreakerPrompt
};
