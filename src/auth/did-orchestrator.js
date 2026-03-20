const { callModel, computeContentHashes } = require('./call-model');
const fs = require('fs');
const path = require('path');
const {
  buildPlannerPrompt,
  buildReviewerPrompt,
  buildReviewerRound2Prompt,
  buildTiebreakerPrompt
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

    // Stage 1 — Planner
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

    // Stage 2 — Reviewer Round 1
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
      return this._package(taskId, plannerRaw, reviewerRaw, combinedDiff, 'convergent');
    }

    // Stage 3 — Planner thumbs up/down on combined diff
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
      return this._package(taskId, plannerRaw, reviewerRaw, combinedDiff, 'convergent');
    }

    // Stage 4 — Reviewer Round 2 (final shot)
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
      return this._package(taskId, plannerRaw, reviewerR2Raw, updatedDiff, 'convergent');
    }

    // Stage 5 — Tiebreaker (Opus). Surgical package only — DDR-007.
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
    return this._package(taskId, plannerRaw, reviewerR2Raw, finalDiff, 'convergent', tiebreakerRaw);
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
