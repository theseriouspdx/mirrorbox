// DDR-004: Universal adversarial mandate injected into every prompt.
const ADVERSARIAL_MANDATE = `\
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

module.exports = {
  buildPlannerPrompt,
  buildReviewerPrompt,
  buildReviewerRound2Prompt,
  buildTiebreakerPrompt
};
