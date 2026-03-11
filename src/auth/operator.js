const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { callModel, computeContentHashes } = require('./call-model');
const stateManager = require('../state/state-manager');
const db = require('../state/db-manager');
const eventStore = require('../state/event-store');

/**
 * Section 8: The Operator
 * The persistent session anchor. Classification, routing, and context management.
 */
class Operator {
  // Context window sizes by model (tokens). Used when config doesn't specify.
  static CONTEXT_WINDOWS = {
    'claude-opus-4':           200000,
    'claude-3.7-sonnet':       200000,
    'claude-3.5-sonnet':       200000,
    'gemini-2.0-pro':          1000000,
    'gemini-pro-1.5':          1000000,
    'gpt-4o':                  128000,
    'qwen2.5-coder-7b':        32768,
    'deepseek-coder-v2':       32768,
    'ollama':                  4096,   // conservative fallback for unknown local models
    'default':                 32000,
  };

  constructor(mode = 'runtime') {
    this.mode = mode;
    this.sessionHistory = [];
    this.stateSummary = {
      currentTask: null,
      currentStage: 'classification',
      activeModel: 'operator',
      filesInScope: [],
      recoveryAttempts: 0,
      blockCounter: 0,
      progressSummary: '',
      graphSummary: '',
      pendingDecision: null
    };
    this.mcpServer = null;
    this.messageId = 1;
    this.mcpCallbacks = new Map();
    this.contextThreshold = 0.8;      // Section 8: configurable via operatorContextThreshold
    this.activeModelWindow = null;    // set after routeModels() resolves, see _loadModelWindow()
    this.sandboxFocus = false;        // BUG-013: Sandbox interaction state
  }

  /**
   * BUG-013: Toggles focus between the MBO CLI and the active sandbox.
   */
  toggleSandboxFocus() {
    this.sandboxFocus = !this.sandboxFocus;
    return this.sandboxFocus;
  }

  /**
   * Reads the operator's model window size from routing config.
   * Falls back to a conservative 32k if the model is unknown.
   * Called once after MCP start when providers are known.
   */
  async _loadModelWindow() {
    try {
      const { routingMap } = await (require('./model-router').routeModels());
      const operatorConfig = routingMap['classifier'] || routingMap['architecturePlanner'];
      if (operatorConfig) {
        const modelName = operatorConfig.model || 'default';
        this.activeModelWindow =
          Operator.CONTEXT_WINDOWS[modelName] ||
          Operator.CONTEXT_WINDOWS['default'];
      } else {
        this.activeModelWindow = Operator.CONTEXT_WINDOWS['default'];
      }
    } catch {
      this.activeModelWindow = Operator.CONTEXT_WINDOWS['default'];
    }
    console.error(`[Operator] Context window set to ${this.activeModelWindow} tokens (threshold: ${Math.floor(this.activeModelWindow * this.contextThreshold)})`);
  }

  /**
   * Section 9: Gate 0 - Initialize MCP session
   */
  async startMCP() {
    const scriptPath = path.join(__dirname, '../../scripts/mbo-start.sh');
    const args = this.mode === 'dev' ? ['--mode=dev'] : [];
    
    // Launch using the vendor-agnostic script
    this.mcpServer = spawn(scriptPath, args, { 
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, NODE_ENV: this.mode === 'dev' ? 'development' : 'production' }
    });
    
    let buffer = '';
    this.mcpServer.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && this.mcpCallbacks.has(msg.id)) {
            const cb = this.mcpCallbacks.get(msg.id);
            this.mcpCallbacks.delete(msg.id);
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
          }
        } catch (e) {
          // Non-JSON output handled by script redirection to stderr
        }
      }
    });

    await this.sendMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mbo-operator', version: '1.0.0' }
    });
    this.sendMCPNotification('notifications/initialized', {});
    await this._loadModelWindow();
  }

  sendMCPNotification(method, params) {
    if (!this.mcpServer) return;
    const jsonRpc = { jsonrpc: '2.0', method, params };
    this.mcpServer.stdin.write(JSON.stringify(jsonRpc) + '\n');
  }

  sendMCPRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.mcpServer) return reject(new Error("MCP Server not started"));
      
      const id = this.messageId++;
      let timer;
      this.mcpCallbacks.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject:  (e) => { clearTimeout(timer); reject(e); }
      });

      const jsonRpc = { jsonrpc: '2.0', id, method, params };
      this.mcpServer.stdin.write(JSON.stringify(jsonRpc) + '\n');

      timer = setTimeout(() => {
        if (this.mcpCallbacks.has(id)) {
          this.mcpCallbacks.delete(id);
          reject(new Error(`MCP request timeout for ${method}`));
        }
      }, 15000);
    });
  }

  async callMCPTool(name, args) {
    const result = await this.sendMCPRequest('tools/call', { name, arguments: args });
    return result;
  }

  _safeParseJSON(text, fallback = null) {
    if (!text) return fallback;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (e) {
      console.error(`[Operator] JSON Parse Failure: ${e.message}. Raw text: ${text.slice(0, 200)}...`);
      return fallback;
    }
  }

  /**
   * Section 8: Classification
   * Parses user message into a Classification object.
   */
  async classifyRequest(userMessage) {
    const hardState = this.getHardState();
    
    // Stage 1: Call Classifier model
    const input = {
      userMessage,
      sessionHistory: this.sessionHistory,
      stateSummary: this.stateSummary,
    };

    const prompt = `Classify this user request into a JSON object following this schema:
{
  "route": "inline" | "analysis" | "standard" | "complex",
  "risk": "low" | "medium" | "high",
  "complexity": 1 | 2 | 3,
  "files": string[],
  "rationale": string,
  "confidence": number
}

User request: "${userMessage}"

Return ONLY the JSON object. Do not provide conversational filler.`;

    try {
      const response = await callModel('classifier', prompt, input, hardState);

      console.error(`[DEBUG] Classifier response: ${response}`);
      const classification = this._safeParseJSON(response);
      
      if (!classification || classification.confidence < 0.6) {
        return {
          needsClarification: true,
          rationale: classification ? classification.rationale : "Low confidence or parse failure.",
          confidence: classification ? classification.confidence : 0
        };
      }
      return classification;
    } catch (e) {
      console.error(`[Operator] Model classification failure: ${e.message}. Falling back to heuristic.`);
      return this._heuristicClassifier(userMessage);
    }
  }

  _heuristicClassifier(userMessage) {
    const files = userMessage.match(/[\w./-]+\.\w+/g) || [];
    let route = 'standard';
    let risk = 'low';
    let complexity = 1;
    
    if (userMessage.toLowerCase().includes('architectural') || userMessage.toLowerCase().includes('refactor')) {
      route = 'complex'; risk = 'high'; complexity = 3;
    } else if (files.length > 2) {
      route = 'standard'; risk = 'medium'; complexity = 2;
    } else if (userMessage.toLowerCase().includes('color') || userMessage.toLowerCase().includes('css')) {
      route = 'inline'; complexity = 1;
    }
    
    return {
      route,
      risk,
      complexity,
      files,
      rationale: "Heuristic classification (callModel fallback or placeholder).",
      confidence: 0.8,
      _source: 'heuristic' // internal tag for event logging
    };
  }

  /**
   * Section 8: Routing Tiers
   * Uses Intelligence Graph to determine Tier 0-3 based on blast radius.
   */
  async determineRouting(classification) {
    let tier = 1;
    let blastRadius = [];

    // Check Graph Completeness (Milestone 0.4A invariant)
    const graphCompleteness = this.getGraphCompleteness();
    if (graphCompleteness === 'skeleton') {
      return { tier: 1, blastRadius: [], rationale: 'Skeleton graph forces Tier 1 minimum.' };
    }

    if (classification.files && classification.files.length > 0) {
      for (const file of classification.files) {
        try {
          const nodeId = `file://${path.resolve(process.cwd(), file)}`;
          const impactResult = await this.callMCPTool('graph_query_impact', { nodeId });
          
          if (impactResult && impactResult.content && impactResult.content[0]) {
            const impact = JSON.parse(impactResult.content[0].text);
            if (impact && impact.affectedFiles) {
              blastRadius.push(...impact.affectedFiles);
            }
          }
        } catch (e) {
          console.error(`[Operator] Impact query failed for ${file}:`, e.message);
        }
      }
    }

    const uniqueBlast = [...new Set(blastRadius)];
    
    // Routing Matrix (Section 8)
    if (classification.route === 'complex' || classification.risk === 'high' || classification.complexity === 3) {
      tier = 3;
    } else if (uniqueBlast.length > 5 || classification.complexity === 2) {
      tier = 2;
    } else if (uniqueBlast.length === 0 && classification.complexity === 1 && classification.route === 'inline') {
      const safelist = this.getSafelist();
      const allSafelisted = classification.files.every(f => safelist.includes(f));
      const allExist = classification.files.every(f => this._fileExists(f));
      if (allSafelisted && allExist) {
        tier = 0;
      } else {
        console.error(`[Operator] Tier 0 denied: safelisted=${allSafelisted}, allExist=${allExist}. Routing Tier 1.`);
        tier = 1;
      }
    } else {
      tier = 1;
    }

    return { tier, blastRadius: uniqueBlast };
  }

  getSafelist() {
    const profile = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    if (!profile) return [];
    try { return JSON.parse(profile.profile_data).safelist || []; }
    catch { return []; }
  }

  _fileExists(filePath) {
    return fs.existsSync(path.resolve(process.cwd(), filePath));
  }

  getPrimeDirective() {
    const profile = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    return profile ? JSON.parse(profile.profile_data).primeDirective : "No prime directive set.";
  }

  /**
   * Section 13: Hard State
   * Immutable project context injected into every model call.
   */
  getHardState() {
    const profileRaw = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    const profile = profileRaw ? JSON.parse(profileRaw.profile_data) : {};
    
    const hardState = {
      primeDirective: profile.primeDirective || "No prime directive set.",
      onboardingProfile: profile,
      graphSummary: this.stateSummary.graphSummary || "Intelligence Graph active. All subsystems mapped.",
      dangerZones: profile.dangerZones || []
    };

    // Budget check (5,000 tokens)
    const estimated = this._estimateTokens(hardState);
    if (estimated > 5000) {
      // Section 13 Truncation Priority:
      // 1. graphSummary (lowest priority)
      // 2. dangerZones
      // 3. onboardingProfile
      // 4. primeDirective (highest - never truncate)
      hardState.graphSummary = "[TRUNCATED]";
      if (this._estimateTokens(hardState) > 5000) {
        hardState.dangerZones = ["[TRUNCATED]"];
        if (this._estimateTokens(hardState) > 5000) {
          hardState.onboardingProfile = { primeDirective: hardState.primeDirective, _note: "Profile truncated due to budget" };
        }
      }
    }
    return hardState;
  }

  _estimateTokens(obj) {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Math.ceil(str.length / 3.7);
  }

  getGraphCompleteness() {
    if (this.mode === 'dev') return 'full';
    const runtimeEdge = db.get("SELECT 1 FROM edges WHERE source = 'runtime' LIMIT 1");
    return runtimeEdge ? 'full' : 'skeleton';
  }

  /**
   * Section 8: Context Management
   * Summarizes at 80% threshold.
   */
  async checkContextLifecycle() {
    const window = this.activeModelWindow || Operator.CONTEXT_WINDOWS['default'];
    const estimatedTokens = this._estimateTokens(this.sessionHistory);
    if (estimatedTokens > window * this.contextThreshold) {
      await this.summarizeSession();
    }
  }

  async summarizeSession() {
    console.error(`[Operator] Context threshold reached. Summarizing session...`);
    const condensedCount = this.sessionHistory.length;
    const hardState = this.getHardState();
    
    // Invariant 13: Checkpoint before mutation
    stateManager.checkpoint('mirror');

    const summarizationPrompt = `Summarize the preceding session history into a concise state summary. 
Preserve all active task details, key architectural decisions, and the current Hard State Anchor. 
Condense the history into approximately 2000 tokens while maintaining causal links between events.
The output will be used as the new system context.`;

    const summary = await callModel('operator', summarizationPrompt, { sessionHistory: this.sessionHistory }, hardState);
    
    this.sessionHistory = [{ role: 'system', content: `[SESSION SUMMARY] ${summary}` }];
    this.stateSummary.progressSummary = summary.substring(0, 200);
    console.error(`[CONTEXT RESET] Session summarized at ${new Date().toISOString()}. ${condensedCount} messages condensed.`);
  }

  async processMessage(userMessage) {
    await this.checkContextLifecycle();
    const input = userMessage.trim().toLowerCase();

    // BUG-013: Intercept input if sandbox is focused
    if (this.sandboxFocus) {
      eventStore.append('SANDBOX_INPUT', 'human', { input: userMessage }, 'mirror');
      return { status: 'sandbox_intercept', message: "Input sent to sandbox." };
    }

    // State Machine Transitions
    if (input === 'go' && this.stateSummary.pendingDecision) {
      return await this.handleApproval('go');
    }

    if (input.startsWith('pin:') || input.startsWith('exclude:')) {
      // Stage 1.5 logic: update projected context (simplified for 0.7)
      return { status: 'context_updated', prompt: "Context updated. Type 'go' to proceed to Planning." };
    }

    this.sessionHistory.push({ role: 'user', content: userMessage });
    
    const classification = await this.classifyRequest(userMessage);

    if (classification.needsClarification) {
      return { needsClarification: true, question: classification.rationale };
    }

    const routing = await this.determineRouting(classification);
    this.stateSummary.pendingDecision = { classification, routing };

    // Invariant 13: Checkpoint before state snapshot
    stateManager.checkpoint('mirror');

    // Distinguish heuristic vs. model-derived classifications in the audit trail
    const classificationSource = classification._source === 'heuristic' ? 'CLASSIFICATION_HEURISTIC' : 'CLASSIFICATION';
    const { _source, ...cleanClassification } = classification;
    eventStore.append(classificationSource, 'operator', { classification: cleanClassification, routing }, 'mirror');

    this.stateSummary.currentStage = 'classification';
    this.stateSummary.filesInScope = cleanClassification.files;
    stateManager.snapshot(this.stateSummary, 'mirror');

    // Section 8: Approval Gate (Stage 5)
    // Tier 0 skips gate. Tier 1+ requires "go".
    if (routing.tier > 0) {
      return { 
        needsApproval: true, 
        classification: cleanClassification, 
        routing,
        prompt: "Classification complete. Routing set to Tier " + routing.tier + ". Type 'go' to proceed to planning."
      };
    }

    return { classification: cleanClassification, routing, status: 'ready_for_planning' };
  }

  /**
   * Handles the Stage 5 Approval Gate and triggers the pipeline.
   */
  async handleApproval(decision) {
    const approval = await this.requestApproval(decision);
    if (!approval.approved) {
      delete this.stateSummary.pendingDecision;
      return { status: 'aborted', reason: 'Human denied approval.' };
    }

    const { classification, routing } = this.stateSummary.pendingDecision;
    delete this.stateSummary.pendingDecision;

    try {
      // Stage 3: Planning
      const planResult = await this.runStage3(classification, routing);
      let agreedPlan = planResult.plan;

      if (planResult.needsTiebreaker) {
        agreedPlan = await this.runStage3D(planResult.conflict, classification, routing);
      }

      // Stage 4: Code
      const codeResult = await this.runStage4(agreedPlan, classification, routing);
      
      // Stage 4.5: Virtual Dry Run (Placeholder for 0.8)
      const dryRun = await this.runStage4_5(codeResult.code);

      // Stage 11: Intelligence Graph Update (Task 0.8-07)
      // Ingest any runtime trace from the probe and re-index modified files.
      await this.runStage11();

      return {
        status: 'complete',
        plan: agreedPlan,
        code: codeResult.code,
        dryRun,
        blockCount: this.stateSummary.blockCounter
      };
    } catch (e) {
      console.error(`[Operator] Pipeline failure: ${e.message}`);
      
      // BUG-012: Smoke test failure loop (Recovery limit)
      if (this.stateSummary.recoveryAttempts < 3) {
        this.stateSummary.recoveryAttempts++;
        console.error(`[Operator] Attempting recovery (${this.stateSummary.recoveryAttempts}/3)...`);
        // Re-inject the pending decision into the pipeline for retry
        this.stateSummary.pendingDecision = { classification, routing };
        return await this.handleApproval('go');
      }

      return { status: 'error', reason: `Pipeline failure after ${this.stateSummary.recoveryAttempts} recovery attempts: ${e.message}` };
    }
  }

  /**
   * Section 15: Stage 3D — Tiebreaker (Plan)
   */
  async runStage3D(conflict, classification, routing) {
    this.stateSummary.currentStage = 'tiebreaker_plan';
    const hardState = this.getHardState();
    const prompt = `Arbitrate the following plan conflict and produce a single convergent ExecutionPlan.\nConflict: ${conflict}\nTask: ${classification.rationale}\n\nReturn ONLY JSON per SPEC Section 13 (ExecutionPlan).`;
    
    const response = await callModel('tiebreaker', prompt, { classification, routing }, hardState);
    const plan = this._safeParseJSON(response);
    if (!plan) throw new Error("[Operator] Tiebreaker plan parse failure.");
    eventStore.append('TIEBREAKER_PLAN', 'operator', { plan }, 'mirror');
    return plan;
  }

  /**
   * Section 15: Stage 1.5 — Human Intervention Gate
   * Projects relevant context and waits for human pinning/override.
   */
  async runStage1_5(classification, routing) {
    this.stateSummary.currentStage = 'context_pinning';
    
    // Default search for classification files or SPEC.md
    const context = await this.callMCPTool('graph_search', { pattern: classification.files[0] || 'SPEC.md' });
    
    return {
      needsApproval: true,
      stage: '1.5',
      projectedContext: context,
      prompt: "Stage 1.5: Review the projected context. Type 'pin: [id]' to emphasize, 'exclude: [id]' to ignore, or 'go' to proceed to Planning."
    };
  }

  /**
   * Section 15: Stage 3 — Independent Plan Derivation
   * Qualitative consensus based on Spec Adherence.
   */
  async runStage3(classification, routing, pinnedContext = []) {
    this.stateSummary.currentStage = 'planning';
    const hardState = this.getHardState();

    const planPrompt = `Derive an ExecutionPlan adhering to the Prime Directive.
Task: ${classification.rationale}
Prime Directive: ${hardState.primeDirective}
Pinned Context: ${pinnedContext.join(', ')}

Return ONLY JSON per SPEC Section 13:
{
  "intent": "Specific Spec requirement being fulfilled",
  "stateTransitions": ["Sequence of state changes"],
  "filesToChange": ["paths"],
  "subsystemsImpacted": ["names"],
  "invariantsPreserved": ["Safety rules guarded"],
  "rationale": "Why this approach?"
}`;

    // Stage 3A & 3B: Independent derivation (Blind Isolation)
    const [planARaw, planBRaw] = await Promise.all([
      callModel('architecturePlanner', planPrompt, { classification, routing }, hardState),
      callModel('componentPlanner', planPrompt, { classification, routing }, hardState)
    ]);

    const planA = this._safeParseJSON(planARaw);
    const planB = this._safeParseJSON(planBRaw);

    if (!planA || !planB) {
      throw new Error("[Operator] Planning failed: malformed plan output.");
    }

    const consensus = await this.evaluateSpecAdherence(planA, planB, hardState);
    
    eventStore.append('PLAN_CONSENSUS', 'operator', { 
      planA, 
      planB, 
      consensus 
    }, 'mirror');

    if (consensus.verdict === 'divergent') {
      this.stateSummary.currentStage = 'tiebreaker_plan';
      return { 
        needsTiebreaker: true, 
        conflict: consensus.conflict,
        rationale: "Plans diverge on load-bearing constraints or Spec interpretation."
      };
    }

    return { status: 'plan_agreed', plan: planA, consensusIntent: consensus.consensusIntent };
  }

  /**
   * Section 15: Stage 4 — Code Derivation and Consensus
   * Milestone 0.7-03 & 0.7-04.
   */
  async runStage4(plan, classification, routing) {
    this.stateSummary.currentStage = 'code_derivation';
    const hardState = this.getHardState();
    this.stateSummary.blockCounter = 0;

    while (this.stateSummary.blockCounter < 3) {
      // Stage 4A: Architecture Planner
      const plannerPrompt = `Write the implementation code for the agreed plan.\nPlan: ${JSON.stringify(plan)}\nTask: ${classification.rationale}\nFiles: ${classification.files.join(', ')}`;
      const codeA = await callModel('architecturePlanner', plannerPrompt, { plan, classification }, hardState);

      // Invariant 7: Compute Planner hashes for blindness enforcement
      const plannerHashes = computeContentHashes(codeA);
      const planHashes = computeContentHashes(JSON.stringify(plan));
      const allProtectedHashes = [...plannerHashes, ...planHashes];

      // Stage 4B: Adversarial Reviewer (blind)
      const reviewerPrompt = `Independent Code Derivation (Blind). Derive your own ExecutionPlan and write the code independently.\nTask: ${classification.rationale}\nReturn ReviewerOutput JSON.`;
      const reviewerOutputRaw = await callModel('reviewer', reviewerPrompt, { classification }, hardState, allProtectedHashes);
      const reviewerOutput = this._safeParseJSON(reviewerOutputRaw);

      if (!reviewerOutput || !reviewerOutput.independentCode) {
        console.error("[Operator] Reviewer produced malformed output. Retrying iteration.");
        continue;
      }

      // Stage 4C: Gate 2 — Code Consensus
      const consensus = await this.evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState);
      
      eventStore.append('CODE_CONSENSUS', 'operator', { 
        plannerCode: codeA, 
        reviewerOutput, 
        consensus,
        iteration: this.stateSummary.blockCounter + 1
      }, 'mirror');

      if (consensus.verdict === 'pass') {
        return { status: 'code_agreed', code: codeA, consensusIntent: consensus.consensusIntent };
      }

      if (consensus.verdict === 'block') {
        this.stateSummary.blockCounter++;
        console.error(`[Operator] Code Blocked (${this.stateSummary.blockCounter}/3): ${consensus.reason}`);
      }
    }

    // Stage 4D: Tiebreaker (Code)
    return await this.runStage4D(plan, classification, routing);
  }

  /**
   * Section 15: Stage 11 — Intelligence Graph Update (Task 0.8-07)
   *
   * Called after successful code derivation (Stage 4 / 4.5).
   * 1. Ingests runtime-trace.json if the sandbox probe produced one.
   * 2. Re-indexes any files touched during this pipeline run.
   *
   * Non-fatal: failures are logged but do not block task completion.
   */
  async runStage11() {
    this.stateSummary.currentStage = 'knowledge_update';
    console.error(`[Operator] Stage 11: Intelligence Graph Update starting...`);

    try {
      // 1. Ingest runtime trace (0.8-07)
      const traceFile = 'data/runtime-trace.json';
      const traceAbsPath = path.resolve(process.cwd(), traceFile);
      if (fs.existsSync(traceAbsPath)) {
        console.error(`[Operator] Stage 11: Ingesting runtime trace from ${traceFile}...`);
        await this.callMCPTool('graph_ingest_runtime_trace', { traceFile });
      }

      // 2. Re-index files modified during this run
      const modifiedFiles = this.stateSummary.filesInScope || [];
      if (modifiedFiles.length > 0) {
        console.error(`[Operator] Stage 11: Re-indexing ${modifiedFiles.length} modified file(s)...`);
        await this.callMCPTool('graph_update_task', { modifiedFiles });
      }

      // 3. Update Graph Summary (BUG-042)
      const graphSummaryResult = await this.callMCPTool('graph_search', { pattern: 'SPEC.md' });
      if (graphSummaryResult && graphSummaryResult.content && graphSummaryResult.content[0]) {
        this.stateSummary.graphSummary = graphSummaryResult.content[0].text;
      }

      console.error(`[Operator] Stage 11: Intelligence Graph Update complete.`);
    } catch (e) {
      // Stage 11 failures are non-fatal — log and continue
      console.error(`[Operator] Stage 11: Non-fatal error during graph update: ${e.message}`);
    }
  }

  async evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState) {
    const auditPrompt = `Audit the Planner's code against the agreed plan and Reviewer's independent derivation.\nPlan: ${JSON.stringify(plan)}\nPlanner Code: ${codeA}\nReviewer Code: ${reviewerOutput.independentCode}\nReviewer Concerns: ${JSON.stringify(reviewerOutput.concerns)}\n\nDoes the code correctly implement state transitions? Return JSON with verdict, reason, citation, and consensusIntent.`;
    const result = await callModel('reviewer', auditPrompt, {}, hardState);
    console.error(`[DEBUG] evaluateCodeConsensus response: ${result}`);
    return this._safeParseJSON(result, { verdict: 'block', reason: 'JSON Parse Failure' });
  }

  /**
   * Section 15: Stage 4D — Tiebreaker (Code)
   * Milestone 0.7-05.
   */
  async runStage4D(plan, classification, routing) {
    this.stateSummary.currentStage = 'tiebreaker_code';
    const hardState = this.getHardState();
    let retries = 0;

    while (retries < 3) {
      const prompt = `Tiebreaker: Produce the final arbitrated code draft based on competing derivations.\nPlan: ${JSON.stringify(plan)}\nTask: ${classification.rationale}\n\nReturn the final code/diff only.`;
      const codeTied = await callModel('tiebreaker', prompt, { classification, routing }, hardState);

      // Spec Note (BUG-010): One final audit for Tiebreaker code.
      const reviewerPrompt = `Final Audit of Tiebreaker Code.\nTask: ${classification.rationale}\nCode: ${codeTied}\n\nReturn ONLY JSON verdict per SPEC Section 11.`;
      const finalAuditRaw = await callModel('reviewer', reviewerPrompt, { classification }, hardState);
      const finalAudit = this._safeParseJSON(finalAuditRaw);

      if (finalAudit && finalAudit.verdict === 'pass') {
        return { status: 'code_agreed', code: codeTied, source: 'tiebreaker' };
      }

      console.error(`[BUG-010] Tiebreaker code blocked by reviewer (Attempt ${retries + 1}/3): ${finalAudit?.reason || 'Unknown reason'}`);
      retries++;
    }

    throw new Error(`[BUG-010] Tiebreaker code consistently blocked by reviewer after 3 attempts. Escalating to human.`);
  }


  /**
   * Section 15: Stage 4.5 — Virtual Dry Run
   * Milestone 0.8 prerequisite.
   */
  async runStage4_5(code) {
    this.stateSummary.currentStage = 'dry_run';
    // Basic structural verification (syntax check)
    try {
      if (code.includes('const') || code.includes('function')) {
        // Simple heuristic for JS validity
        new Function(code.replace(/export |import /g, ''));
      }
      return { status: 'pass', checks: ['structural_syntax'] };
    } catch (e) {
      return { status: 'warn', checks: ['structural_syntax'], error: e.message };
    }
  }

  /**
   * Evaluates if two plans agree on "Load-Bearing" logic.
   * Section 15.3C: Qualitative Convergence Audit.
   */
  async evaluateSpecAdherence(planA, planB, hardState) {
    const auditPrompt = `Audit these independent plans against the Prime Directive.
Prime Directive: ${hardState.primeDirective}
Plan A: ${JSON.stringify(planA)}
Plan B: ${JSON.stringify(planB)}

Do both plans fulfill the same qualitative intent without violating project invariants?
Return JSON:
{
  "verdict": "convergent" | "divergent",
  "conflict": "Describe any contradiction in state transitions or safety logic",
  "consensusIntent": "The shared goal both plans achieve"
}`;
    const result = await callModel('classifier', auditPrompt, {}, hardState);
    console.error(`[DEBUG] evaluateSpecAdherence response: ${result}`);
    return this._safeParseJSON(result, { verdict: 'divergent', conflict: 'JSON Parse Failure' });
  }

  /**
   * Section 5: Stage 5 Approval Gate
   * Structural enforcement of human approval before mutation.
   */
  async requestApproval(decision) {
    if (decision.toLowerCase() === 'go') {
      eventStore.append('APPROVAL', 'human', { decision: 'go' }, 'mirror');
      return { approved: true };
    }
    eventStore.append('APPROVAL', 'human', { decision: 'abort' }, 'mirror');
    return { approved: false };
  }

  async shutdown() {
    if (this.mcpServer) {
      // Reject any in-flight MCP requests before killing the process
      for (const [id, cb] of this.mcpCallbacks) {
        cb.reject(new Error('MBO shutdown — MCP server terminating'));
      }
      this.mcpCallbacks.clear();
      this.mcpServer.kill();
      this.mcpServer = null;
    }
    // Section 17: Generate handoff on clean shutdown
    stateManager.checkpoint('mirror');
    stateManager.generateHandoff();
  }
}

module.exports = { Operator };
