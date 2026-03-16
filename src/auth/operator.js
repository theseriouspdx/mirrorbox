const { execSync, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { callModel, computeContentHashes } = require('./call-model');
const { DIDOrchestrator } = require('./did-orchestrator');
const stateManager = require('../state/state-manager');
const db = require('../state/db-manager');
const eventStore = require('../state/event-store');
const { RUN_ID } = require('../state/event-store');
const { routeModels } = require('./model-router');

const RUNTIME_ROOT = path.resolve(process.env.MBO_PROJECT_ROOT || process.cwd());
const SESSION_HISTORY_PATH = path.join(RUNTIME_ROOT, '.mbo', 'session_history.json');
const MBO_ROOT = path.resolve(__dirname, '../..');

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
      worldId: 'mirror',
      currentTask: null,
      currentStage: 'classification',
      activeModel: 'operator',
      filesInScope: [],
      recoveryAttempts: 0,
      blockCounter: 0,
      progressSummary: '',
      graphSummary: '',
      pendingDecision: null,
      mcp: {
        url: null,
        projectId: null
      },
      executorLogs: []
    };
    this.messageId = 1;
    this.contextThreshold = 0.8;      // Section 8: configurable via operatorContextThreshold
    this.activeModelWindow = null;    // set after routeModels() resolves, see _loadModelWindow()
    this.sandboxFocus = false;        // BUG-013: Sandbox interaction state
    this.didOrchestrator = new DIDOrchestrator({
      eventStore,
      // DDR-005: Stream agent messages to operator window as produced.
      emit: (role, text) => {
        // Fallback for non-streaming output or legacy code
        if (this.onChunk) {
          this.onChunk({ role, chunk: text, sequence: 0 });
        } else {
          process.stdout.write(`\n[${role}] ${text}\n`);
        }
      }
    });
    this.didStreamBuffer = [];
    this.userHintBuffer = [];
    this._pipelineRunning = false;
    this.abortController = null;
    this.sessionId = crypto.randomUUID();
    this.currentTaskId = null;
    this.onChunk = null; // Replaced by REPL/CLI at runtime
    
    this._loadHistory();
  }

  _loadHistory() {
    if (fs.existsSync(SESSION_HISTORY_PATH)) {
      try {
        this.sessionHistory = JSON.parse(fs.readFileSync(SESSION_HISTORY_PATH, 'utf8'));
      } catch (e) {
        this.sessionHistory = [];
      }
    }
  }

  saveHistory() {
    if (!fs.existsSync(path.dirname(SESSION_HISTORY_PATH))) {
      fs.mkdirSync(path.dirname(SESSION_HISTORY_PATH), { recursive: true });
    }
    fs.writeFileSync(SESSION_HISTORY_PATH, JSON.stringify(this.sessionHistory, null, 2), 'utf8');
  }

  _status(text, role = 'operator') {
    if (this.onChunk) {
      this.onChunk({ role, chunk: text, sequence: 0, sessionId: this.sessionId, taskId: this.currentTaskId, stage: this.stateSummary.currentStage });
    } else {
      process.stderr.write(`\n[${role}] ${text}\n`);
    }
  }

  async callMCPTool(name, args) {
    const mcpPort = this._getMcpPort();
    return this._queryMcp(mcpPort, name, args);
  }

  _getMcpPort() {
    const candidates = [
      path.join(RUNTIME_ROOT, '.mbo/run/mcp.json'),
      path.join(RUNTIME_ROOT, '.dev/run/mcp.json'),
    ];

    const manifestPath = candidates.find((p) => fs.existsSync(p));
    if (!manifestPath) {
      throw new Error(`MCP manifest not found at ${candidates.join(' or ')}. Run 'mbo setup' or 'mbo mcp'.`);
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const status = String(manifest.status || '').toLowerCase();
      if (status && status !== 'healthy' && status !== 'ready') {
        throw new Error(`MCP server status is ${manifest.status}`);
      }
      if (!Number.isInteger(manifest.port) || manifest.port <= 0) {
        throw new Error('Invalid MCP port in manifest');
      }
      return manifest.port;
    } catch (e) {
      throw new Error(`Failed to read MCP port: ${e.message}`);
    }
  }

  async startMCP() {
    const port = this._getMcpPort();
    this.stateSummary.mcp = {
      url: `http://127.0.0.1:${port}/mcp`,
      projectId: null
    };
    return { status: 'ready', port };
  }

  _queryMcp(port, name, args) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args }
      });

      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mcp-session-id': 'operator-session'
        },
        timeout: 30000
      }, (res) => {
        let data = '';
        res.on('data', (d) => data += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message));
            resolve(json.result);
          } catch (e) {
            reject(new Error(`MCP parse error: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  _safeParseJSON(text, fallback = null, role = 'unknown') {
    if (!text) return fallback;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return this._extractDecision(text, role) || fallback;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      return this._extractDecision(text, role) || fallback;
    }
  }

  _extractDecision(text, role) {
    const src = { text, role };
    if (role === 'classifier') {
      const route = text.match(/route[:\s]+(inline|analysis|standard|complex)/i);
      const risk = text.match(/risk[:\s]+(low|medium|high)/i);
      const complexity = text.match(/complexity[:\s]+(1|2|3)/i);
      return {
        route:      route ? route[1].toLowerCase() : 'standard',
        risk:       risk ? risk[1].toLowerCase() : 'medium',
        complexity: complexity ? parseInt(complexity[1]) : 2,
        files:      text.match(/[\w./-]+\.\w+/g) || [],
        rationale:  text.slice(0, 300),
        confidence: 0.7,
        _source:    src,
      };
    }
    
    if (role === 'architecturePlanner' || role === 'componentPlanner') {
      const filesMatch = text.match(/(?:file[s]?|path[s]?|modif(?:y|ying)|edit(?:ing)?|touch(?:ing)?)[:\s]+([^\n.]+)/i);
      return {
        intent:              text.slice(0, 250),
        stateTransitions:    [],
        filesToChange:       filesMatch ? filesMatch[1].split(/[,\s]+/).map(s => s.trim()).filter(Boolean) : [],
        subsystemsImpacted:  [],
        invariantsPreserved: [],
        rationale:           text.slice(0, 400),
        _source:             src,
      };
    }

    if (role === 'tiebreaker') {
      return {
        verdict:   'arbitrated',
        rationale: text.slice(0, 500),
        _source:   src,
      };
    }

    return null;
  }

  /**
   * Section 8: Classification
   * Parses user message into a Classification object.
   */
  async classifyRequest(userMessage) {
    const hardState = this.getHardState();

    const input = {
      userMessage,
      sessionHistory: this.sessionHistory,
      stateSummary: this.stateSummary,
    };

    const prompt = `Classify this user request into a JSON object following this schema:
{
  "route": "inline" | "analysis" | "standard" | "complex",
  "worldId": "mirror" | "subject",
  "risk": "low" | "medium" | "high",
  "complexity": 1 | 2 | 3,
  "files": string[],
  "rationale": string,
  "confidence": number
}

User request: "${userMessage}"

Return ONLY the JSON object. Do not provide conversational filler.`;

    try {
      const { routingMap } = await routeModels();
      const onChunk = routingMap.classifier?.streaming ? this.onChunk : null;
      const response = await callModel('classifier', prompt, input, hardState, [], null,
        { onChunk, sessionId: this.sessionId, taskId: this.currentTaskId, stage: this.stateSummary.currentStage });
      const classification = this._safeParseJSON(response, null, 'classifier');

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
      worldId: 'mirror',
      risk,
      complexity,
      files,
      rationale: "Heuristic classification (callModel fallback or placeholder).",
      confidence: 0.8,
      _source: 'heuristic'
    };
  }

  /**
   * Section 8: Routing Tiers / Section 35.4: Tiered Routing Policy
   * Uses Intelligence Graph to determine Tier 0-3 based on blast radius.
   */
  async determineRouting(classification) {
    const worldId = classification.worldId || 'mirror';
    let blastRadius = [];

    // Check Graph Completeness (Milestone 0.4A invariant)
    const graphCompleteness = this.getGraphCompleteness();
    if (graphCompleteness === 'skeleton') {
      return { tier: 1, blastRadius: [], rationale: 'Skeleton graph forces Tier 1 minimum.' };
    }

    if (classification.files && classification.files.length > 0) {
      for (const file of classification.files) {
        try {
          const impactResult = await this._graphQueryImpact(file, worldId);
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
    const { tier } = await routeModels(classification, uniqueBlast);

    return { tier, blastRadius: uniqueBlast };
  }

  async _graphQueryImpact(file, worldId) {
    if (worldId === 'subject') {
      const profileRow = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
      if (!profileRow) return null;
      const { subjectRoot } = JSON.parse(profileRow.profile_data);
      if (!subjectRoot) return null;
      const subjectDbPath = path.join(subjectRoot, 'data/mirrorbox.db');
      const { DBManager } = require('../state/db-manager');
      const subjectDb = new DBManager(subjectDbPath);
      const nodeId = `file://${path.resolve(subjectRoot, file)}`;
      const rows = subjectDb.query(`SELECT target_id FROM edges WHERE source_id = ? AND relation = 'calls'`, [nodeId]);
      return { content: [{ type: 'text', text: JSON.stringify({ affectedFiles: rows.map(r => r.target_id.split('//')[1].split('#')[0]) }) }] };
    } else {
      return this.callMCPTool('graph_query_impact', { nodeId: `file://${file}` });
    }
  }

  getGraphCompleteness() {
    return 'complete'; // Placeholder for 0.4B
  }

  getSafelist() {
    return ['SPEC.md', 'README.md', 'AGENTS.md', 'ROADMAP.md'];
  }

  _fileExists(p) {
    return fs.existsSync(path.resolve(RUNTIME_ROOT, p));
  }

  async checkContextLifecycle() {
    const estimated = this._estimateTokens(this.sessionHistory);
    if (estimated > (this.activeModelWindow || 32000) * this.contextThreshold) {
      await this.summarizeSession();
    }
  }

  _estimateTokens(obj) {
    const str = JSON.stringify(obj);
    return Math.ceil(str.length / 4);
  }

  async summarizeSession() {
    const condensedCount = this.sessionHistory.length;
    const summaryPrompt = `Summarize the current session state into a max 2,000 token summary.\nHistory: ${JSON.stringify(this.sessionHistory)}`;
    const hardState = this.getHardState();
    const summary = await callModel('operator', summaryPrompt, {}, hardState, [], null, { stage: 'summary' });
    this.sessionHistory = [{ role: 'system', content: `Session Summary: ${summary}` }];
    this.saveHistory();
    this.stateSummary.progressSummary = summary.substring(0, 200);
    console.error(`[CONTEXT RESET] Session summarized at ${new Date().toISOString()}. ${condensedCount} messages condensed.`);
  }

  async processMessage(userMessage) {
    await this.checkContextLifecycle();
    const input = userMessage.trim().toLowerCase();

    if (this.sandboxFocus) {
      eventStore.append('SANDBOX_INPUT', 'human', { input: userMessage }, 'mirror');
      return { status: 'sandbox_intercept', message: "Input sent to sandbox." };
    }

    if (input === 'go' && this.stateSummary.pendingDecision) {
      this._pipelineRunning = true;
      return this.handleApproval('go');
    }

    if (input.startsWith('pin:') || input.startsWith('exclude:')) {
      return {
        status: 'spec_refinement_updated',
        prompt: "Spec refinement updated. Type 'go' to run autonomous DID."
      };
    }

    this.sessionHistory.push({ role: 'user', content: userMessage });
    this.saveHistory();

    const classification = await this.classifyRequest(userMessage);

    if (classification.needsClarification) {
      return { needsClarification: true, question: classification.rationale };
    }

    const routing = await this.determineRouting(classification);
    this.stateSummary.pendingDecision = { classification, routing };
    this.stateSummary.worldId = classification.worldId || 'mirror';
    this.stateSummary.executorLogs = null;

    stateManager.checkpoint('mirror');

    const classificationSource = classification._source === 'heuristic' ? 'CLASSIFICATION_HEURISTIC' : 'CLASSIFICATION';
    const { _source, ...cleanClassification } = classification;
    eventStore.append(classificationSource, 'operator', { classification: cleanClassification, routing }, 'mirror');

    this.stateSummary.currentStage = 'classification';
    this.stateSummary.filesInScope = cleanClassification.files;
    this.stateSummary.currentTask = cleanClassification.rationale || userMessage.slice(0, 120);
    stateManager.snapshot(this.stateSummary, 'mirror');

    if (routing.tier > 0) {
      const stage1_5 = await this.runStage1_5(cleanClassification, routing);
      if (stage1_5.status === 'blocked') return stage1_5;
      this.stateSummary.pendingDecision.ledger = stage1_5.assumptionLedger;
      if (stage1_5.assumptionLedger.blockers.length > 0) {
        stage1_5.prompt = `[BLOCKED] ${stage1_5.prompt}\nCannot proceed until blockers are resolved.`;
      }
      return stage1_5;
    }

    return { classification: cleanClassification, routing, status: 'ready_for_planning' };
  }

  getStatus() {
    const stage = this.stateSummary.currentStage || 'idle';
    const task  = this.stateSummary.currentTask  || 'No active task.';
    const files = (this.stateSummary.filesInScope || []).join(', ') || 'none';
    const descriptions = {
      idle:             'Idle — ready for input.',
      classification:   'Classifying your request.',
      context_pinning:  'Stage 1.5: Reviewing assumptions before planning.',
      planning:         'Stage 3: Deriving independent implementation plans.',
      tiebreaker_plan:  'Stage 3D: Arbitrating conflicting plans.',
      code_derivation:  'Stage 4: Deriving implementation code.',
      tiebreaker_code:  'Stage 4D: Arbitrating conflicting code.',
      dry_run:          'Stage 4.5: Virtual dry run.',
      implement:        'Stage 6: Writing files and running validator.',
      audit_gate:       'Stage 7: Audit gate — type "approved" or "reject".',
      state_sync:       'Stage 8: Syncing state after approval.',
      knowledge_update: 'Stage 11: Updating intelligence graph.',
    };
    const description = descriptions[stage] || `Running: ${stage}.`;
    return [
      `Status: ${description}`,
      `Task:   ${task}`,
      `Files:  ${files}`,
      `Hints:  ${this.userHintBuffer ? this.userHintBuffer.length + ' queued' : 'none'}`
    ].join('\n');
  }

  requestAbort() {
    if (this.abortController) this.abortController.abort();
    this._pipelineRunning = false;
  }

  async handleApproval(decision) {
    if (this.stateSummary.pendingDecision && this.stateSummary.pendingDecision.ledger) {
      const blockers = this.stateSummary.pendingDecision.ledger.blockers;
      if (blockers.length > 0 && decision.toLowerCase() === 'go') {
        return {
          status: 'blocked',
          reason: `Task is BLOCKED: ${blockers.join(', ')}. Resolve blockers before typing 'go'.`,
          ledger: this.stateSummary.pendingDecision.ledger
        };
      }
    }

    this.abortController = new AbortController();
    const approval = await this.requestApproval(decision);
    if (!approval.approved) {
      delete this.stateSummary.pendingDecision;
      return { status: 'aborted', reason: 'Human denied approval.' };
    }

    const { classification, routing } = this.stateSummary.pendingDecision;
    delete this.stateSummary.pendingDecision;
    this.currentTaskId = crypto.randomUUID();

    try {
      const planResult = await this.runStage3(classification, routing, [], this.stateSummary.executorLogs);
      let agreedPlan = planResult.plan;
      if (planResult.needsTiebreaker) agreedPlan = await this.runStage3D(planResult.conflict, classification, routing);
      const codeResult = await this.runStage4(agreedPlan, classification, routing);
      const dryRun = await this.runStage4_5(codeResult.code);
      const writeResult = await this.runStage6(codeResult.code, classification.files);
      if (!writeResult.validatorPassed) throw new Error(`Validator failed: ${writeResult.validatorOutput.slice(0, 200)}...`);
      this.abortController = null;
      this.stateSummary.pendingAuditContext = { classification, routing, modifiedFiles: writeResult.modifiedFiles };
      const auditPkg = await this.runStage7(writeResult);
      return { status: 'audit_pending', auditPackage: auditPkg, prompt: 'Audit package ready. Respond "approved" to sync state, or "reject" to roll back.' };
    } catch (e) {
      console.error(`[Operator] Pipeline failure: ${e.message}`);
      this.abortController = null;
      this._pipelineRunning = false;
      if (this.stateSummary.recoveryAttempts < 3) {
        this.stateSummary.recoveryAttempts++;
        this.stateSummary.executorLogs = e.validatorOutput || e.message;
        this.stateSummary.pendingDecision = { classification, routing };
        return await this.handleApproval('go');
      }
      return { status: 'error', reason: `Pipeline failure after ${this.stateSummary.recoveryAttempts} recovery attempts: ${e.message}` };
    }
  }

  async requestApproval(decision) {
    return { approved: decision.toLowerCase() === 'go' };
  }

  async runStage3(classification, routing, pinnedContext = [], executorLogs = null) {
    this.stateSummary.currentStage = 'planning';
    const hardState = this.getHardState();
    const options = { signal: this.abortController?.signal, onChunk: this.onChunk, sessionId: this.sessionId, taskId: this.currentTaskId, stage: this.stateSummary.currentStage };
    if (this.didOrchestrator.shouldRunDID(routing)) {
      const didPackage = await this.didOrchestrator.run(classification, routing, hardState, options);
      if (didPackage.did.verdict === 'needs_human') return { escalatedToHuman: true, conflict: 'DID tiebreaker could not converge.', didPackage };
      return { status: 'plan_agreed', plan: { intent: 'DID converged', diff: didPackage.did.finalDiff }, didPackage };
    }
    // Standard planning logic...
    return { status: 'plan_agreed', plan: { intent: 'Standard plan' } };
  }

  async runStage3D(conflict, classification, routing) {
    this.stateSummary.currentStage = 'tiebreaker_plan';
    const prompt = `Arbitrate: ${conflict}\nTask: ${classification.rationale}`;
    const response = await callModel('tiebreaker', prompt, { classification, routing }, this.getHardState(), [], null, { sessionId: this.sessionId, taskId: this.currentTaskId, stage: 'tiebreaker_plan' });
    return this._safeParseJSON(response, null, 'tiebreaker');
  }

  async runStage4(plan, classification, routing) {
    this.stateSummary.currentStage = 'code_derivation';
    const prompt = `Write code: ${JSON.stringify(plan)}\nTask: ${classification.rationale}`;
    const code = await callModel('architecturePlanner', prompt, { plan, classification, routing }, this.getHardState(), [], null, { sessionId: this.sessionId, taskId: this.currentTaskId, stage: 'code_derivation' });
    return { status: 'code_agreed', code };
  }

  async runStage4_5(code) {
    this.stateSummary.currentStage = 'dry_run';
    return { status: 'pass' };
  }

  async runStage6(code, files) {
    this.stateSummary.currentStage = 'implement';
    // Mock write + validate...
    return { validatorPassed: true, modifiedFiles: files, validatorOutput: 'PASS' };
  }

  async runStage7(writeResult) {
    this.stateSummary.currentStage = 'audit_gate';
    return { summary: 'Audit package', validatorPassed: writeResult.validatorPassed };
  }

  async runStage1_5(classification, routing) {
    this.stateSummary.currentStage = 'context_pinning';
    const ledger = { assumptions: [], blockers: [], entropyScore: 5 };
    return { status: 'ready', assumptionLedger: ledger, signOffBlock: 'Score: 5', prompt: 'Stage 1.5 ready.' };
  }

  getHardState() {
    return { primeDirective: "Implement Section 35." };
  }

  async shutdown() {
    this.saveHistory();
    return { status: 'shutdown_complete' };
  }
}

module.exports = { Operator };
