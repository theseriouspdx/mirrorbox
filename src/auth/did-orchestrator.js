const { callModel, computeContentHashes } = require('./call-model');
const fs = require('fs');
const path = require('path');
const {
  buildPlannerPrompt,
  buildReviewerPrompt,
  buildReviewerRound2Prompt,
  buildTiebreakerPrompt,
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

  // Naive line-set intersection — agreed lines between two diffs.
  _agreedLines(diffA, diffB) {
    if (!diffA || !diffB) return diffA || diffB || '';
    const setA = new Set(diffA.split('\n'));
    return diffB.split('\n').filter((l) => setA.has(l)).join('\n');
  }

  // Lines present in one diff but not the other — disputed segments.
  _disputedLines(diffA, diffB) {
    if (!diffA || !diffB) return `Planner:\n${diffA || '(none)'}\n\nReviewer:\n${diffB || '(none)'}`;
    const setA = new Set(diffA.split('\n'));
    const setB = new Set(diffB.split('\n'));
    const onlyA = diffA.split('\n').filter((l) => !setB.has(l));
    const onlyB = diffB.split('\n').filter((l) => !setA.has(l));
    return `Planner only:\n${onlyA.join('\n')}\n\nReviewer only:\n${onlyB.join('\n')}`;
  }

  _emitIfWired(role, text) {
    if (this.emit) this.emit(role, text);
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
    // Preserve proof artifact for blind isolation checks in later rounds.
    const protectedHashes = computeContentHashes(plannerRaw);

    // ── Gate 1, Stage 3B — Component Planner / initial Reviewer (blind) ──
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

    const r1Verdict = this._extract(reviewerRaw, 'VERDICT') || '';
    const combinedDiff = this._extract(reviewerRaw, 'COMBINED DIFF');

    if (r1Verdict.toUpperCase().startsWith('GO')) {
      // ── Gate 1 convergence → enter Gate 2 (blind code consensus, SPEC §14) ──
      // agreedPlan: the component planner's combined diff serves as the agreed plan
      // artefact going into Gate 2. plannerDiff is Stage 4A's codeA.
      const agreedPlan = combinedDiff || plannerDiff || r1Verdict;
      return await this._runGate2(
        taskId, taskContext, plannerRaw, plannerDiff, agreedPlan,
        classification, routing, hardState, callOpts, wrapChunk
      );
    }

    // ── Gate 1 divergence — Stage 3: Planner reviews combined diff ──
    // TODO(v1.0.03): This dialogue loop breaks context isolation — rounds 3-4
    // share intermediate outputs. Replace with independent re-derivation passes.
    const plannerR2Raw = await callModel(
      'architecturePlanner',
      `[DID - PLANNER REVIEW]\nReviewer produced a combined diff. Reply YES (accept) or NO with specific objections.\n\nTASK: ${taskContext.task}\n\nCOMBINED DIFF:\n${combinedDiff}\n\nReply YES or NO followed by objection lines only.`,
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('architecturePlanner') }
    );
    this._persist(taskId, 'planner-r2', plannerR2Raw);
    this._emitIfWired('architecturePlanner', plannerR2Raw);

    if (plannerR2Raw.trim().toUpperCase().startsWith('YES')) {
      // Gate 1 resolved via planner acceptance → Gate 2
      const agreedPlan = combinedDiff || plannerDiff;
      return await this._runGate2(
        taskId, taskContext, plannerRaw, plannerDiff, agreedPlan,
        classification, routing, hardState, callOpts, wrapChunk
      );
    }

    // ── Gate 1, Stage 4 — Reviewer Round 2 (final shot before Gate 1 tiebreaker) ──
    const reviewerR2Raw = await callModel(
      'componentPlanner',
      buildReviewerRound2Prompt(taskContext, plannerR2Raw, combinedDiff),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('componentPlanner') }
    );
    this._persist(taskId, 'reviewer-r2', reviewerR2Raw);
    this._emitIfWired('componentPlanner', reviewerR2Raw);
    this.eventStore.append('DID_REVIEWER_R2', 'operator', { taskId }, 'mirror');

    const r2Verdict = this._extract(reviewerR2Raw, 'VERDICT') || '';
    const updatedDiff = this._extract(reviewerR2Raw, 'UPDATED COMBINED DIFF');

    if (r2Verdict.toUpperCase().startsWith('GO')) {
      // Gate 1 resolved via reviewer round 2 → Gate 2
      const agreedPlan = updatedDiff || combinedDiff || plannerDiff;
      return await this._runGate2(
        taskId, taskContext, plannerRaw, plannerDiff, agreedPlan,
        classification, routing, hardState, callOpts, wrapChunk
      );
    }

    // ── Gate 1 Tiebreaker — surgical package only (DDR-007) ──
    // After tiebreaker resolves Gate 1, the result still proceeds to Gate 2.
    // TODO(v1.0.03): Gate 1 tiebreaker should arbitrate plan only, not code.
    const finalCombined = updatedDiff || combinedDiff;
    const agreedDiff = this._agreedLines(plannerDiff, finalCombined);
    const disputedSegments = this._extract(reviewerR2Raw, 'DISPUTED SEGMENTS')
      || this._disputedLines(plannerDiff, finalCombined);

    const tiebreakerRaw = await callModel(
      'tiebreaker',
      buildTiebreakerPrompt(taskContext, agreedDiff, disputedSegments, plannerR2Raw, reviewerR2Raw),
      { classification, routing },
      hardState,
      [],
      null,
      { ...callOpts, expectJson: false, onChunk: wrapChunk('tiebreaker') }
    );
    this._persist(taskId, 'tiebreaker', tiebreakerRaw);
    this._emitIfWired('tiebreaker', tiebreakerRaw);
    this.eventStore.append('DID_TIEBREAKER', 'operator', { taskId }, 'mirror');

    const tbVerdict = this._extract(tiebreakerRaw, 'VERDICT') || '';
    const finalDiff = this._extract(tiebreakerRaw, 'FINAL DIFF');

    if (tbVerdict.toUpperCase().includes('ESCALATE_TO_HUMAN')) {
      return this._package(taskId, plannerRaw, reviewerR2Raw, finalDiff, 'needs_human', tiebreakerRaw);
    }
    // BUG-169: If the tiebreaker produced no parseable VERDICT and no FINAL DIFF,
    // do not silently claim convergence — treat as needs_human to surface the failure.
    if (!tbVerdict && !finalDiff) {
      return this._package(taskId, plannerRaw, reviewerR2Raw, null, 'needs_human', tiebreakerRaw);
    }

    // Gate 1 tiebreaker resolved → Gate 2 with tiebreaker's plan as the agreed plan.
    return await this._runGate2(
      taskId, taskContext, plannerRaw, finalDiff || plannerDiff, finalDiff || agreedDiff,
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
