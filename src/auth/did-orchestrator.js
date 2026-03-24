const { callModel, computeContentHashes } = require('./call-model');
const fs = require('fs');
const path = require('path');
const {
  buildPlannerPrompt,
  buildReviewerPrompt,
  buildGate1TiebreakerPrompt,
  buildStage4APrompt,
  buildGate2BlindPrompt,
  buildGate2ComparePrompt,
  buildGate2PlannerRevisePrompt,
  buildGate2TiebreakerPrompt
} = require('./did-prompts');

const DID_STATE_DIR = path.resolve(process.cwd(), '.dev/did');

class DIDOrchestrator {
  // DDR-005: emit is optional streaming callback: (role, text) => void
  constructor({ eventStore, emit = null }) {
    this.eventStore = eventStore;
    this.emit = emit;
  }

  shouldRunDID(routing) {
    return Number(routing && routing.tier) >= 2;
  }

  // DDR-001: Extract labelled section from natural language output.
  _extract(text, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|$)`, 'i');
    const match = (text || '').match(re);
    return match ? match[1].trim() : null;
  }

  // Invariant 13: Persist every agent output before use.
  _persist(taskId, agent, content) {
    const dir = path.join(DID_STATE_DIR, String(taskId).replace(/[\\/]/g, '-').slice(0, 80));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${agent}.md`), content, 'utf8');
  }

  _emitIfWired(role, text) {
    if (this.emit) this.emit(role, text);
  }

  // ─── Gate 1 Tiebreaker (SPEC §14 Stage 3D) ──────────────────────────────────
  //
  // Called when Stage 3C (plan comparison) fails to converge. Receives both
  // independent plans — no dialogue artifacts, no code. Produces a single
  // arbitrated plan. If GO, calls _runStage4A to derive code, then Gate 2.
  // Fires once per task: human rejection → task abort (handled upstream).
  async _runGate1Tiebreaker(taskId, taskContext, plannerRaw, reviewerRaw, classification, routing, hardState, callOpts, wrapChunk) {
    const plannerPlan = this._extract(plannerRaw, 'RATIONALE') || plannerRaw;
    const reviewerPlan = this._extract(reviewerRaw, 'RATIONALE') || reviewerRaw;

    const g1TbRaw = await callModel(
      'tiebreaker',
      buildGate1TiebreakerPrompt(taskContext, plannerPlan, reviewerPlan),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('tiebreaker') }
    );
    this._persist(taskId, 'gate1-3d-tiebreaker', g1TbRaw);
    this._emitIfWired('tiebreaker', g1TbRaw);
    this.eventStore.append('DID_GATE1_TIEBREAKER', 'operator', { taskId }, 'mirror');

    const tbVerdict = (this._extract(g1TbRaw, 'VERDICT') || '').toUpperCase();
    const arbitratedPlan = this._extract(g1TbRaw, 'ARBITRATED PLAN');

    if (tbVerdict.includes('ESCALATE_TO_HUMAN') || (!tbVerdict && !arbitratedPlan)) {
      return this._package(taskId, plannerRaw, reviewerRaw, null, 'needs_human', g1TbRaw);
    }

    // Gate 1 resolved → Stage 4A: planner writes code from the arbitrated plan.
    return await this._runStage4A(
      taskId, taskContext, plannerRaw, g1TbRaw, arbitratedPlan || g1TbRaw,
      classification, routing, hardState, callOpts, wrapChunk
    );
  }

  // ─── Stage 4A (SPEC §14) ─────────────────────────────────────────────────────
  //
  // Architecture Planner writes code against the Gate 1 agreed plan.
  // Used when Gate 1 required tiebreaker arbitration — planner re-derives code
  // from the arbitrated plan rather than re-using its original output.
  // Proceeds to Gate 2 with the newly-derived code as codeA.
  async _runStage4A(taskId, taskContext, plannerRaw, tiebreakerRaw, agreedPlan, classification, routing, hardState, callOpts, wrapChunk) {
    const stage4ARaw = await callModel(
      'architecturePlanner',
      buildStage4APrompt(taskContext, agreedPlan),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('architecturePlanner') }
    );
    this._persist(taskId, 'stage4a-planner-code', stage4ARaw);
    this._emitIfWired('architecturePlanner', stage4ARaw);
    this.eventStore.append('DID_STAGE4A', 'operator', { taskId }, 'mirror');

    const codeA = this._extract(stage4ARaw, 'DIFF') || stage4ARaw;
    // Use the Stage 4A output as the new plannerRaw for packaging purposes.
    const effectivePlannerRaw = stage4ARaw;

    return await this._runGate2(
      taskId, taskContext, effectivePlannerRaw, codeA, agreedPlan,
      classification, routing, hardState, callOpts, wrapChunk
    );
  }

  // ─── Gate 2 — Code Consensus (SPEC Section 14, Stages 4B / 4C / 4D) ────────
  //
  // Called after Gate 1 plan convergence. Architecture Planner's code (codeA /
  // plannerDiff) is treated as the Stage 4A output. The Adversarial Reviewer
  // then derives its own code BLIND (Stage 4B), and only after submitting its
  // own derivation is it shown codeA (Stage 4C). PASS → proceed; BLOCK → planner
  // revises; 3 blocks → Stage 4D tiebreaker.
  async _runGate2(taskId, taskContext, plannerRaw, codeA, agreedPlan, classification, routing, hardState, callOpts, wrapChunk) {
    // Stage 4B: Reviewer derives plan + code BLIND from original spec only.
    // verifyBlindIsolation() is invoked inside callModel via protectedHashes.
    const gate2ProtectedHashes = computeContentHashes(plannerRaw);
    const g2BlindRaw = await callModel(
      'reviewer',
      buildGate2BlindPrompt(taskContext),
      { classification, routing },
      hardState,
      gate2ProtectedHashes,
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('reviewer') }
    );
    this._persist(taskId, 'gate2-4b-blind', g2BlindRaw);
    this._emitIfWired('reviewer', g2BlindRaw);
    this.eventStore.append('DID_GATE2_BLIND', 'operator', {
      taskId,
      protectedHashes: gate2ProtectedHashes.map((x) => x.hash)
    }, 'mirror');

    const reviewerPlan = this._extract(g2BlindRaw, 'INDEPENDENT PLAN');
    const codeB = this._extract(g2BlindRaw, 'DIFF');

    // Stage 4C: Reveal codeA to reviewer — PASS or BLOCK loop (max 3 blocks).
    let currentCodeA = codeA;
    let blockCount = 0;
    const MAX_BLOCKS = 3;

    while (blockCount < MAX_BLOCKS) {
      const g2CompareRaw = await callModel(
        'reviewer',
        buildGate2ComparePrompt(taskContext, agreedPlan, currentCodeA, reviewerPlan, codeB),
        { classification, routing },
        hardState,
        [],
        null,
        { ...callOpts, expectJson: false, onChunk: wrapChunk('reviewer') }
      );
      this._persist(taskId, `gate2-4c-compare-${blockCount}`, g2CompareRaw);
      this._emitIfWired('reviewer', g2CompareRaw);
      this.eventStore.append('DID_GATE2_COMPARE', 'operator', { taskId, blockCount }, 'mirror');

      const g2Verdict = (this._extract(g2CompareRaw, 'VERDICT') || '').toUpperCase();

      if (g2Verdict.startsWith('PASS')) {
        // Gate 2 consensus reached — forward to Stage 5 (human approval).
        return this._package(taskId, plannerRaw, g2BlindRaw, currentCodeA, 'convergent');
      }

      // BLOCK verdict — increment counter, send concerns back to Planner.
      blockCount++;
      this.eventStore.append('DID_GATE2_BLOCK', 'operator', { taskId, blockCount, verdict: g2Verdict }, 'mirror');

      if (blockCount >= MAX_BLOCKS) break;

      const concerns = this._extract(g2CompareRaw, 'CONCERNS') || g2Verdict;
      const plannerReviseRaw = await callModel(
        'architecturePlanner',
        buildGate2PlannerRevisePrompt(taskContext, agreedPlan, currentCodeA, concerns, blockCount),
        { classification, routing },
        hardState,
        [],
        null,
        { ...callOpts, expectJson: false, onChunk: wrapChunk('architecturePlanner') }
      );
      this._persist(taskId, `gate2-4c-planner-revise-${blockCount}`, plannerReviseRaw);
      this._emitIfWired('architecturePlanner', plannerReviseRaw);
      currentCodeA = this._extract(plannerReviseRaw, 'DIFF') || currentCodeA;
    }

    // Stage 4D — Tiebreaker. Receives both plans + both code sets.
    // Per SPEC BUG-010: if this output is subsequently blocked, escalate to human.
    const g2TiebreakerRaw = await callModel(
      'tiebreaker',
      buildGate2TiebreakerPrompt(taskContext, agreedPlan, currentCodeA, reviewerPlan, codeB),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('tiebreaker') }
    );
    this._persist(taskId, 'gate2-4d-tiebreaker', g2TiebreakerRaw);
    this._emitIfWired('tiebreaker', g2TiebreakerRaw);
    this.eventStore.append('DID_GATE2_TIEBREAKER', 'operator', { taskId }, 'mirror');

    const tbVerdict = (this._extract(g2TiebreakerRaw, 'VERDICT') || '').toUpperCase();
    const finalCode = this._extract(g2TiebreakerRaw, 'FINAL DIFF');

    if (tbVerdict.includes('ESCALATE_TO_HUMAN') || (!tbVerdict && !finalCode)) {
      return this._package(taskId, plannerRaw, g2BlindRaw, finalCode, 'needs_human', g2TiebreakerRaw);
    }
    return this._package(taskId, plannerRaw, g2BlindRaw, finalCode || currentCodeA, 'convergent', g2TiebreakerRaw);
  }

  async run(classification, routing, hardState, options = {}) {
    const signal = options.signal || null;
    const taskId = String(classification.rationale || 'did-task');
    const taskContext = {
      task: classification.rationale,
      files: classification.files || [],
      tier: routing.tier,
      blastRadius: routing.blastRadius || []
    };

    const wrapChunk = (role) => {
      if (!options.onChunk) return null;
      return (chunkObj) => options.onChunk({ ...chunkObj, role });
    };

    const callOpts = {
      classification,
      blastRadius: taskContext.blastRadius,
      signal
    };

    // ── Gate 1, Stage 3A — Architecture Planner (independent plan + initial code) ──
    const plannerRaw = await callModel(
      'architecturePlanner',
      buildPlannerPrompt(taskContext),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('architecturePlanner') }
    );
    this._persist(taskId, 'planner', plannerRaw);
    this._emitIfWired('architecturePlanner', plannerRaw);
    this.eventStore.append('DID_PLANNER', 'operator', { taskId }, 'mirror');

    const plannerDiff = this._extract(plannerRaw, 'DIFF');
    // Preserve proof artifact for blind isolation checks in Gate 2.
    const protectedHashes = computeContentHashes(plannerRaw);

    // ── Gate 1, Stage 3B — Component Planner (independent, blind) ──
    const reviewerRaw = await callModel(
      'componentPlanner',
      buildReviewerPrompt(taskContext),
      { classification, routing },
      hardState,
      protectedHashes,
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('componentPlanner') }
    );
    this._persist(taskId, 'reviewer-r1', reviewerRaw);
    this._emitIfWired('componentPlanner', reviewerRaw);
    this.eventStore.append('DID_REVIEWER_R1', 'operator', {
      taskId,
      protectedHashes: protectedHashes.map((x) => x.hash)
    }, 'mirror');

    // ── Gate 1, Stage 3C — Plan Consensus ──
    const r1Verdict = this._extract(reviewerRaw, 'VERDICT') || '';
    const combinedDiff = this._extract(reviewerRaw, 'COMBINED DIFF');

    if (r1Verdict.toUpperCase().startsWith('GO')) {
      // ── Gate 1 convergence → Gate 2 (blind code consensus, SPEC §14) ──
      // plannerDiff is Stage 4A's codeA (planner already wrote code in one shot).
      // agreedPlan: use the combined diff from Gate 1 as the agreed plan artefact.
      const agreedPlan = combinedDiff || plannerDiff || r1Verdict;
      return await this._runGate2(
        taskId, taskContext, plannerRaw, plannerDiff, agreedPlan,
        classification, routing, hardState, callOpts, wrapChunk
      );
    }

    // ── Gate 1 divergence → Stage 3D: Tiebreaker (plan only, no code) ──
    // Context isolation enforced: tiebreaker receives two independent plans,
    // NOT the dialogue artifacts from rounds 3-4 (which no longer exist).
    // Per SPEC §14: "Disagreement → Tiebreaker adjudicates the plan only.
    // No code is written during a Gate 1 dispute."
    return await this._runGate1Tiebreaker(
      taskId, taskContext, plannerRaw, reviewerRaw,
      classification, routing, hardState, callOpts, wrapChunk
    );
  }

  _package(taskId, plannerRaw, reviewerRaw, finalDiff, verdict, tiebreakerRaw = null) {
    // BUG-169: A 'convergent' verdict with no extractable finalDiff is a null-verdict —
    // escalate to needs_human rather than returning an empty plan downstream.
    const resolvedVerdict = (verdict === 'convergent' && !finalDiff) ? 'needs_human' : verdict;
    const pkg = { did: { enabled: true, taskId, verdict: resolvedVerdict, plannerRaw, reviewerRaw, tiebreakerRaw, finalDiff } };
    this.eventStore.append('DID_RECONCILIATION_PACKAGE', 'operator', { taskId, verdict: resolvedVerdict }, 'mirror');
    return pkg;
  }
}

module.exports = { DIDOrchestrator };
