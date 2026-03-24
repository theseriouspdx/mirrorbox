# operator.js — Locked File Diff Proposal
## Task Activation Pathway (DID Reconciliation Final)

**File:** `src/auth/operator.js` (permissions: 444)
**Unlock command:** `mbo auth src` → operator types `go`
**Version lane:** v0.14.x

This document contains three surgical diffs (A1, A2, A3) to be applied in order.
Each diff is presented as a unified-diff-style block with exact line context.

---

## A1: Add `_isTransitioning` flag + guard in `processMessage()`

### A1a: Constructor addition (after line 214)

```diff
 // In constructor(), after this._pipelineRunning = false;
 
     this._pipelineRunning = false;
+    this._isTransitioning = false;   // SPEC 37.3F §1: async serialization guard
     this.onboardingState = {
```

**Location:** Line 214, immediately after `this._pipelineRunning = false;`

### A1b: Guard at top of `processMessage()` (after line 1591)

```diff
   async processMessage(userMessage) {
     if (this.onboardingState.active) {
       return this.processOnboardingMessage(userMessage);
     }
+
+    // SPEC 37.3F §1: Serialization guard — prevents abort-then-activate race
+    if (this._isTransitioning) {
+      return { status: 'error', reason: 'Operator is in transition. Wait for current operation to complete.' };
+    }
 
     await this.checkContextLifecycle();
```

**Location:** Line ~1594, immediately after the onboarding early return.

### A1c: Import task-reader (top of file, after existing requires)

```diff
 const {
   getManifestPreference,
   getMcpLogDir,
   isWithinPath,
 } = require('../utils/runtime-context');
+const taskReader = require('../utils/task-reader');
```

**Location:** Line ~25, after the last `require()` block.

---

## A2: Add `activateTask()` method

Insert this method on the Operator prototype. Recommended location: after `processMessage()` (line ~1850, before `handleApproval()`).

```javascript
  /**
   * Section 37.3F: Task Activation Pathway
   * Bypasses LLM classifier for governance-sourced tasks.
   * TUI passes only taskId + user additions — never a TaskRecord.
   */
  async activateTask(taskId, activationInput = {}) {
    // §1 Preconditions
    if (this.onboardingState.active) {
      return { status: 'error', reason: 'Cannot activate tasks during onboarding.' };
    }
    if (this._isTransitioning) {
      return { status: 'error', reason: 'Operator is in transition. Wait for current operation to complete.' };
    }
    if (this._pipelineRunning) {
      return { status: 'error', reason: 'Pipeline is already running.' };
    }

    this._isTransitioning = true;
    try {
      // §2 Canonical fetch — operator re-reads from governance ledger
      const { task: taskRecord, section } = taskReader.findTaskById(RUNTIME_ROOT, taskId);
      if (!taskRecord) {
        return { status: 'error', reason: `TASK_NOT_FOUND: '${taskId}'` };
      }
      if (section !== 'active') {
        return { status: 'error', reason: `TASK_NOT_ACTIVE: '${taskId}' is ${taskRecord.status}.` };
      }

      // §3 Classification synthesis — deterministic, no LLM
      const TYPE_ROUTE = { bug: 'standard', feature: 'complex', plan: 'analysis', docs: 'standard', chore: 'standard', audit: 'analysis' };
      const TYPE_RISK  = { audit: 'high', bug: 'medium', feature: 'medium', plan: 'low', docs: 'low', chore: 'low' };
      const TYPE_CPLX  = { plan: 3, audit: 2, feature: 2, bug: 1, docs: 1, chore: 1 };

      const type = String(taskRecord.type || '').toLowerCase();
      const files = [
        ...(taskRecord.proposedFiles || []),
        ...((activationInput.additionalFiles || []).map(f => String(f).trim()).filter(Boolean)),
      ];

      const route = TYPE_ROUTE[type] ?? 'standard';

      const risk = (() => {
        if (taskRecord.riskLevel && ['low', 'medium', 'high'].includes(taskRecord.riskLevel)) return taskRecord.riskLevel;
        if (files.some(f => String(f).includes('src/auth/'))) return 'high';
        return TYPE_RISK[type] ?? 'medium';
      })();

      const complexity = (() => {
        const n = Number(taskRecord.complexity);
        if (n === 1 || n === 2 || n === 3) return n;
        const fallback = TYPE_CPLX[type] ?? 1;
        console.error(`[WARN] Task ${taskId} missing complexity. Type fallback: ${fallback}.`);
        return fallback;
      })();

      const classification = {
        route, risk, complexity, files,
        rationale: `[TASK ACTIVATION] ${taskRecord.id}: ${taskRecord.title}`,
        confidence: 1.0,
        _source: 'task_activation',
        taskId: taskRecord.id,
        taskType: taskRecord.type,
      };

      // §4 Structured file-conflict detection (before Stage 1.5)
      const conflict = this._detectFileConflict(taskRecord);
      if (conflict) {
        this.stateSummary.pendingDecision = { classification, conflict: conflict.prompt };
        return conflict;
      }

      // §5 Prompt construction — operator-owned, governance-data delimited
      const prompt = this._buildActivationPrompt(taskRecord, activationInput);
      this.sessionHistory.push({ role: 'user', content: prompt });
      this.saveHistory();

      // §6 Routing + checkpoint
      const routing = await this.determineRouting(classification);
      stateManager.checkpoint(this.stateSummary);

      // §7 Event logging — CLASSIFICATION_TASK_ACTIVATION
      eventStore.append('CLASSIFICATION_TASK_ACTIVATION', 'operator', {
        classification,
        routing,
        activationContext: {
          taskId: taskRecord.id,
          taskType: taskRecord.type,
          canonicalFiles: taskRecord.proposedFiles || [],
          additionalFiles: activationInput.additionalFiles || [],
          riskLevelSource: taskRecord.riskLevel ? 'explicit' : 'type_default',
          complexitySource: (Number(taskRecord.complexity) >= 1 && Number(taskRecord.complexity) <= 3) ? 'explicit' : 'type_default',
        },
      }, 'mirror');

      // §8 Enter pipeline at Stage 1.5
      this._pipelineRunning = true;
      this.stateSummary.currentStage = 'stage_1_5';
      this.stateSummary.currentTask = taskRecord.title;
      this.stateSummary.activeAction = `Task activation: ${taskRecord.id}`;

      // Sandbox handling: if sandboxFocus is true but task doesn't touch sandbox files, log bypass
      if (this.sandboxFocus) {
        eventStore.append('SANDBOX_BYPASS_GOVERNANCE', 'operator', { taskId, reason: 'governance_task_activation' }, 'mirror');
      }

      const knowledgePack = null; // Task activation does not bundle knowledge packs
      const locks = {
        lockedWorld: this.stateSummary.worldId || 'mirror',
        lockedFiles: [...files],
      };

      const planResult = await this.runStage3(classification, routing, knowledgePack ? [knowledgePack] : [], this.stateSummary.executorLogs, locks);

      if (planResult.escalatedToHuman) {
        this.abortController = null;
        this._pipelineRunning = false;
        return {
          status: 'blocked',
          reason: planResult.conflict || 'DID could not converge and requires human decision.',
          didPackage: planResult.didPackage,
        };
      }

      if (locks.lockedFiles.length > 0 && (!planResult.plan || !planResult.plan.filesToChange || planResult.plan.filesToChange.length === 0)) {
        throw new Error('[Operator] File scope lost during planning. Derivation returned empty FILES.');
      }

      this.stateSummary.pendingDecision = {
        classification,
        routing,
        plan: planResult.plan,
        knowledgePack,
        ledger: planResult.ledger || null,
      };

      return {
        status: 'started',
        needsApproval: true,
        classification,
        plan: planResult.plan,
        ledger: planResult.ledger || null,
      };
    } catch (err) {
      console.error(`[Operator] activateTask error: ${err.message}`);
      return { status: 'error', reason: err.message };
    } finally {
      this._isTransitioning = false;
    }
  }

  /**
   * Section 37.3F §6: Operator-owned prompt construction.
   * Wraps governance-sourced content in <governance-data> delimiters.
   */
  _buildActivationPrompt(taskRecord, activationInput) {
    const wrap = (text) => {
      const s = String(text || '').slice(0, 2000);
      if (s.includes('<governance-data>')) throw new Error(`INJECTION_ATTEMPT in task ${taskRecord.id}`);
      return `<governance-data>\n${s}\n</governance-data>`;
    };
    return [
      `Activate task ${taskRecord.id}.`,
      `Goal: ${wrap(taskRecord.title)}`,
      `Type: ${taskRecord.type} | Risk: ${taskRecord.riskLevel || '(type default)'} | Complexity: ${taskRecord.complexity || '(type default)'}`,
      '',
      'Proposed files:',
      ...(taskRecord.proposedFiles?.length > 0 ? taskRecord.proposedFiles.map(f => `- ${f}`) : ['- none identified yet']),
      '',
      activationInput.context ? `Operator context:\n${wrap(activationInput.context)}` : '',
      taskRecord.specExcerpt ? `SPEC excerpt:\n${wrap(taskRecord.specExcerpt)}` : '',
      taskRecord.description ? `Description:\n${wrap(taskRecord.description)}` : '',
      taskRecord.bugAcceptance ? `Bug acceptance:\n${wrap(taskRecord.bugAcceptance)}` : '',
    ].filter(Boolean).join('\n');
  }

  /**
   * Section 37.3F §4: Structured file-conflict detection.
   * Compares specExcerpt file paths vs proposedFiles before Stage 1.5.
   */
  _detectFileConflict(taskRecord) {
    if (!taskRecord.specExcerpt) return null;
    const specFiles = [...taskRecord.specExcerpt.matchAll(/([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/g)]
      .map(m => m[1]).filter(f => f.includes('/'));
    const trackingFiles = taskRecord.proposedFiles || [];
    if (specFiles.length === 0) return null;
    const onlyInSpec = [...new Set(specFiles)].filter(f => !trackingFiles.includes(f));
    const onlyInTracking = trackingFiles.filter(f => !specFiles.includes(f));
    if (onlyInSpec.length === 0 && onlyInTracking.length === 0) return null;
    return {
      status: 'conflict',
      prompt: [
        `[FILE CONFLICT] Proposed files differ between SPEC excerpt and tracking ledger.`,
        `  Tracking only: ${onlyInTracking.join(', ') || 'none'}`,
        `  SPEC only:     ${onlyInSpec.join(', ') || 'none'}`,
        `Resolve: type  pin: tracking  |  pin: spec  |  pin: both`,
      ].join('\n'),
    };
  }
```

---

## A3: Remove BUG-221 Regex Bypass (lines 1641–1662)

Delete the entire block:

```diff
-    // BUG-221: Task activation prompts from buildTaskActivationPrompt() are pre-scoped —
-    // bypass the classifier entirely so they never hit the file-path requirement gate.
-    const taskActivationMatch = String(userMessage || '').match(/^Activate task (v\d+\.\d+\.\d+)\./);
-    let classification;
-    if (taskActivationMatch) {
-      // Extract proposed files from the prompt itself (lines after "Proposed files:")
-      const filesSection = String(userMessage).split('Proposed files:')[1] || '';
-      const proposedFiles = filesSection
-        .split('\n')
-        .map(l => l.replace(/^[\s-]*/, '').trim())
-        .filter(l => l && l !== 'none identified yet' && !l.startsWith('Operator') && !l.startsWith('SPEC'));
-      classification = {
-        route: proposedFiles.length > 0 ? 'standard' : 'analysis',
-        files: proposedFiles,
-        taskId: taskActivationMatch[1],
-        confidence: 1.0,
-        rationale: `Governance task activation: ${taskActivationMatch[1]}`,
-        complexity: 'moderate',
-      };
-    } else {
-      classification = await this.classifyRequest(userMessage);
-    }
+    const classification = await this.classifyRequest(userMessage);
```

**Location:** Lines 1641–1662 in the current file. After removal, the `let classification;` / `if-else` collapses to a single `const classification = await this.classifyRequest(userMessage);`.

---

## Application Sequence

1. `mbo auth src` → operator types `go` to unlock
2. Apply **A1a** (constructor flag)
3. Apply **A1b** (processMessage guard)
4. Apply **A1c** (task-reader import)
5. Apply **A2** (activateTask + helpers)
6. Apply **A3** (BUG-221 removal)
7. `mbo auth lock` to re-lock at 444
8. Run full test suite: `npm test -- --grep "operator"`
9. Manual smoke: type `v0.14.09` in TUI input bar → should open overlay preflight → confirm → pipeline starts via `activateTask()`

---

## Verification Checklist

- [ ] `_isTransitioning` is `false` in constructor
- [ ] `processMessage()` checks `_isTransitioning` before any async work
- [ ] `activateTask()` sets `_isTransitioning = true` at entry, clears in `finally`
- [ ] `taskReader` import does NOT import from `src/tui/`
- [ ] Classification `_source: 'task_activation'` is never stripped
- [ ] `<governance-data>` injection guard rejects literal tags in content
- [ ] `CLASSIFICATION_TASK_ACTIVATION` event is emitted after checkpoint, before Stage 1.5
- [ ] BUG-221 regex block is fully removed from `processMessage()`
- [ ] No references to `buildTaskActivationPrompt` remain in operator.js
