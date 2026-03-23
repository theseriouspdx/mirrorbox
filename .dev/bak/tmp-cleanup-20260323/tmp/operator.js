const { execSync, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { callModel, computeContentHashes } = require('./call-model');
const { DIDOrchestrator } = require('./did-orchestrator');
const stateManager = require('../state/state-manager');
const db = require('../state/db-manager');
const eventStore = require('../state/event-store');

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
    this.abortController = null;
    this._pipelineRunning = false;
    this.onChunk = null; // Section 33: Streaming callback
    this.loadHistory();
  }

  _streamDIDMessage(msg) {
    if (!msg || !msg.text) return;
    const line = `[DID:${msg.phase}:${msg.role}] ${String(msg.text).replace(/\s+/g, ' ').trim().slice(0, 400)}`;
    this.didStreamBuffer.push(line);
    console.error(line);
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

  _resolveMCP() {
    const devManifest = path.join(RUNTIME_ROOT, '.dev/run/mcp.json');
    const userManifest = path.join(RUNTIME_ROOT, '.mbo/run/mcp.json');
    let manifest = null;
    try {
      if (fs.existsSync(devManifest)) manifest = JSON.parse(fs.readFileSync(devManifest, 'utf8'));
      else if (fs.existsSync(userManifest)) manifest = JSON.parse(fs.readFileSync(userManifest, 'utf8'));
    } catch (_) {}

    if (!manifest || !manifest.port) {
      throw new Error(`No MCP manifest found in ${RUNTIME_ROOT}. Run 'mbo setup' first.`);
    }

    const canonicalRuntimeRoot = fs.realpathSync(RUNTIME_ROOT);
    const expectedProjectId = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(canonicalRuntimeRoot, 'utf8'))
      .digest('hex')
      .slice(0, 16);

    if (manifest.project_id !== expectedProjectId || fs.realpathSync(manifest.project_root) !== canonicalRuntimeRoot) {
      throw new Error(`MCP identity mismatch! Expected ${canonicalRuntimeRoot} (${expectedProjectId}), got ${manifest.project_root} (${manifest.project_id})`);
    }

    this.stateSummary.mcp.url = `http://127.0.0.1:${manifest.port}`;
  }

  /**
   * Section 9: Gate 0 - Initialize MCP session
   */
  async startMCP() {
    this._resolveMCP();
    await this._assertDaemonHealthy();
    await this._loadModelWindow();
  }

  async _assertDaemonHealthy() {
    const healthUrl = `${this.stateSummary.mcp.url}/health`;
    const info = await this._httpGetJson(healthUrl).catch(() => null);
    if (!info || info.status !== 'ok') {
      throw new Error(`Graph server at ${healthUrl} not healthy. Run 'mbo setup' to restore.`);
    }
  }

  _httpGetJson(url, attempt = 1) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        let body = '';
        res.on('data', (c) => { body += c.toString(); });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error('timeout')));
      req.on('error', (err) => {
        if (attempt === 1 && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
          try {
            this._resolveMCP();
            return resolve(this._httpGetJson(`${this.stateSummary.mcp.url}/health`, 2));
          } catch (e) { return reject(err); }
        }
        reject(err);
      });
    });
  }

  sendMCPRequest(method, params) {
    const id = this.messageId++;
    return this._postMCP({
      jsonrpc: '2.0',
      id,
      method,
      params
    });
  }

  _postMCP(payload, attempt = 1) {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const req = http.request(`${this.stateSummary.mcp.url}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        const contentType = String(res.headers['content-type'] || '').toLowerCase();
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`MCP HTTP ${res.statusCode}: ${responseBody || 'no response body'}`));
          }

          if (!responseBody.trim()) {
            return resolve(null);
          }

          const parseAndResolve = (jsonText) => {
            const msg = JSON.parse(jsonText);
            if (msg && msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              return true;
            }
            resolve(msg.result);
            return true;
          };

          try {
            if (contentType.includes('text/event-stream')) {
              // Parse first JSON-RPC payload from SSE frames.
              const lines = responseBody.split(/\r?\n/);
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (!data || data === '[DONE]') continue;
                try {
                  if (parseAndResolve(data)) return;
                } catch (_) {
                  // ignore non-JSON SSE payloads (comments, pings, etc.)
                }
              }
              return reject(new Error(`Invalid MCP SSE response: ${responseBody.slice(0, 300)}`));
            }
            parseAndResolve(responseBody);
          } catch (e) {
            reject(new Error(`Invalid MCP JSON response: ${e.message}`));
          }
        });
      });

      req.setTimeout(15000, () => {
        req.destroy(new Error(`Timeout ${payload.method}`));
      });

      req.on('error', (err) => {
        if (attempt === 1 && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
          try {
            this._resolveMCP();
            return resolve(this._postMCP(payload, 2));
          } catch (e) { return reject(err); }
        }
        reject(err);
      });
      req.write(body);
      req.end();
    });
  }

  async callMCPTool(name, args) {
    const result = await this.sendMCPRequest('tools/call', { name, arguments: args });
    return result;
  }

  _safeParseJSON(text, fallback = null, role = null) {
    if (!text) return fallback;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      
      // DDR-001: Conversational Extraction Pass
      if (role) return this._extractDecision(text, role);

      return JSON.parse(text);
    } catch (e) {
      if (role) return this._extractDecision(text, role);
      console.error(`[Operator] JSON Parse Failure: ${e.message}. Raw text: ${text.slice(0, 200)}...`);
      return fallback;
    }
  }

  /**
   * DDR-001: Extraction pass for natural language agent responses.
   *
   * Attempts JSON extraction first (delegates to _safeParseJSON).
   * On failure, applies role-specific keyword/pattern extraction to recover
   * a structured decision object from conversational text.
   *
   * Returns a structured object on success, null if extraction fails entirely.
   * Recovered objects carry _source: 'nl_extraction' for audit trail.
   */
  _extractDecision(text, role) {
    if (!text) return null;

    // 1. JSON-first — reuse existing safe parser (avoid recursion)
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (_) {}

    // 2. Natural language fallback — role-specific extraction
    const lower = text.toLowerCase();
    const src   = 'nl_extraction';

    if (role === 'classifier') {
      const routeMatch = lower.match(/\b(inline|analysis|standard|complex)\b/);
      const riskMatch  = lower.match(/\b(low|medium|high)\s+risk\b|\brisk[:\s]*(low|medium|high)\b/);
      const worldMatch = lower.match(/\b(mirror|subject)\s+world\b|\bworld[:\s]*(mirror|subject)\b/);
      if (routeMatch) {
        const riskVal = riskMatch ? (riskMatch[1] || riskMatch[2]) : 'medium';
        return {
          route:      routeMatch[1],
          worldId:    worldMatch ? (worldMatch[1] || worldMatch[2]) : 'mirror',
          risk:       riskVal,
          complexity: routeMatch[1] === 'complex' ? 3 : routeMatch[1] === 'standard' ? 2 : 1,
          files:      [],
          rationale:  text.slice(0, 300),
          confidence: 0.65,
          _source:    src,
        };
      }
    }

    if (role === 'reviewer') {
      const approved = /\b(approved?|pass|accept|looks? good|ship it|lgtm)\b/.test(lower);
      const rejected = /\b(reject(ed)?|block(ed)?|fail(ed)?|den(y|ied)|concern)\b/.test(lower);
      if (approved || rejected) {
        return {
          verdict:         approved ? 'pass' : 'block',
          reason:          text.slice(0, 400),
          independentCode: null,
          concerns:        rejected ? [text.slice(0, 300)] : [],
          _source:         src,
        };
      }
    }

    if (role === 'architecturePlanner' || role === 'componentPlanner') {
      // Recover a minimal plan shape from prose output
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
    
    // Stage 1: Call Classifier model
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
      const { routingMap } = await (require('./model-router').routeModels());
      const onChunk = routingMap.classifier?.streaming ? this.onChunk : null;
      const response = await callModel('classifier', prompt, input, hardState, [], null, { onChunk });
      if (process.env.MBO_DEBUG) console.error(`\n[DEBUG] Classifier response: ${response}`);
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
    const worldId = classification.worldId || 'mirror';

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

  /**
   * §11 / 1.0-07: Route graph query to correct DB by world_id.
   * mirror → dev MCP (graph_query_impact via HTTP).
   * subject → direct DBManager query on subjectRoot/data/mirrorbox.db.
   */
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
      const rows = subjectDb.query(
        `SELECT target_id FROM edges WHERE source_id = ? AND relation = 'calls'`, [nodeId]
      );
      return { content: [{ text: JSON.stringify({ affectedFiles: rows.map(r => r.target_id) }) }] };
    }
    const nodeId = `file://${path.resolve(RUNTIME_ROOT, file)}`;
    return this.callMCPTool('graph_query_impact', { nodeId });
  }

  getSafelist() {
    const profile = db.get('SELECT profile_data FROM onboarding_profiles ORDER BY version DESC LIMIT 1');
    if (!profile) return [];
    try { return JSON.parse(profile.profile_data).safelist || []; }
    catch { return []; }
  }

  _fileExists(filePath) {
    return fs.existsSync(path.resolve(RUNTIME_ROOT, filePath));
  }

  /**
   * §12 Step 5: Implement & Validate
   * Grants write access, applies code to filesystem, runs validator.py.
   */
  async runStage6(code, files) {
    this.stateSummary.currentStage = 'implement';
    const modifiedFiles = [];

    for (const filePath of files) {
      const absPath = path.resolve(RUNTIME_ROOT, filePath);
      const cellName = path.relative(path.join(RUNTIME_ROOT, 'src'), absPath);

      // §12 Step 2: Permission check
      const hs = spawnSync('python3', [path.join(MBO_ROOT, 'bin/handshake.py'), cellName], { encoding: 'utf8' });
      if (hs.status !== 0) throw new Error(`[Stage6] Handshake denied for ${cellName}: ${hs.stderr}`);

      // Extract code block for this file (convention: fenced block tagged with filename)
      const blockRe = new RegExp(`\`\`\`[\\w.]*\\s*//\\s*${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?\`\`\``, 'g');
      const match = blockRe.exec(code);
      const fileContent = match
        ? match[0].replace(/^```[\w.]*\n/, '').replace(/\n```$/, '')
        : code;

      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, fileContent, 'utf8');
      modifiedFiles.push(filePath);
      eventStore.append('FILE_WRITTEN', 'operator', { path: filePath }, 'mirror');
    }

    // §12 Step 5: Run validator
    const val = spawnSync('python3', [path.join(MBO_ROOT, 'bin/validator.py'), '--all'], {
      encoding: 'utf8',
      env: { ...process.env, MBO_PROJECT_ROOT: RUNTIME_ROOT }
    });
    const validatorOutput = val.stdout + val.stderr;
    const validatorPassed = val.status === 0;

    eventStore.append('VALIDATE', 'operator', { passed: validatorPassed, output: validatorOutput.slice(0, 500) }, 'mirror');

    return { modifiedFiles, validatorOutput, validatorPassed };
  }

  /**
   * §6A / §12 Step 5.5: Audit Gate
   * Presents diff + validator output + summary. Sets pendingAudit for REPL to resolve.
   */
  async runStage7(writeResult) {
    this.stateSummary.currentStage = 'audit_gate';

    let diff = '';
    try { diff = execSync('git diff HEAD', { cwd: RUNTIME_ROOT, encoding: 'utf8' }); }
    catch (e) { diff = '[git diff unavailable]'; }

    const pkg = {
      diff,
      validatorOutput: writeResult.validatorOutput,
      summary: `Modified: ${writeResult.modifiedFiles.join(', ')}. Validator: ${writeResult.validatorPassed ? 'PASS' : 'FAIL'}.`
    };

    eventStore.append('AUDIT_PACKAGE', 'operator', { summary: pkg.summary, validatorPassed: writeResult.validatorPassed }, 'mirror');

    this.stateSummary.pendingAudit = pkg;
    // Approval is resolved by the REPL on 'approved'/'reject' input
    return { approved: false, pendingAuditPackage: pkg };
  }

  async runStage7Rollback(modifiedFiles) {
    try {
      execSync(`git checkout HEAD -- ${modifiedFiles.map(f => `"${f}"`).join(' ')}`, { cwd: RUNTIME_ROOT });
      eventStore.append('ROLLBACK', 'operator', { files: modifiedFiles, reason: 'audit_rejected' }, 'mirror');
    } catch (e) {
      console.error(`[Stage7] Rollback failed: ${e.message}`);
    }
  }

  /**
   * §6B / §12 Steps 6-8: State Sync, Lock, Baseline
   */
  async runStage8(classification, routing) {
    this.stateSummary.currentStage = 'state_sync';

    // §12 Step 7: Lock src
    spawnSync('python3', [path.join(MBO_ROOT, 'bin/handshake.py'), '--revoke'], {
      encoding: 'utf8',
      env: { ...process.env, MBO_PROJECT_ROOT: RUNTIME_ROOT }
    });

    // §12 Step 8: Baseline
    const init = path.join(MBO_ROOT, 'bin/init_state.py');
    if (fs.existsSync(init)) {
      spawnSync('python3', [init], {
        encoding: 'utf8',
        env: { ...process.env, MBO_PROJECT_ROOT: RUNTIME_ROOT }
      });
    }

    eventStore.append('STATE_SYNCED', 'operator', { task: classification.files, tier: routing.tier }, 'mirror');
    this.stateSummary.currentStage = 'idle';
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
    const options = { signal: this.abortController?.signal };
    console.error(`[Operator] Context threshold reached. Summarizing session...`);
    const condensedCount = this.sessionHistory.length;
    const hardState = this.getHardState();
    
    // Invariant 13: Checkpoint before mutation
    stateManager.checkpoint('mirror');

    const summarizationPrompt = `Summarize the preceding session history into a concise state summary. 
Preserve all active task details, key architectural decisions, and the current Hard State Anchor. 
Condense the history into approximately 2000 tokens while maintaining causal links between events.
The output will be used as the new system context.`;

    const summary = await callModel('operator', summarizationPrompt, { sessionHistory: this.sessionHistory }, hardState, [], null, options);
    
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
      this._pipelineRunning = true;
      return this.handleApproval('go'); // caller awaits or handles promise
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

    // Invariant 13: Checkpoint before state snapshot
    stateManager.checkpoint('mirror');

    // Distinguish heuristic vs. model-derived classifications in the audit trail
    const classificationSource = classification._source === 'heuristic' ? 'CLASSIFICATION_HEURISTIC' : 'CLASSIFICATION';
    const { _source, ...cleanClassification } = classification;
    eventStore.append(classificationSource, 'operator', { classification: cleanClassification, routing }, 'mirror');

    this.stateSummary.currentStage = 'classification';
    this.stateSummary.filesInScope = cleanClassification.files;
    this.stateSummary.currentTask = cleanClassification.rationale || userMessage.slice(0, 120);
    stateManager.snapshot(this.stateSummary, 'mirror');

    // Section 8: Approval Gate (Stage 5)
    // Tier 0 skips gate. Tier 1+ enters Stage 1.5 Assumption Ledger.
    if (routing.tier > 0) {
      const stage1_5 = await this.runStage1_5(cleanClassification, routing);
      
      // Section 27: Entropy hard stop propagates directly — do not set pendingDecision
      if (stage1_5.status === 'blocked') return stage1_5;

      this.stateSummary.pendingDecision.ledger = stage1_5.assumptionLedger;
      
      // Section 27: Blocker enforcement
      if (stage1_5.assumptionLedger.blockers.length > 0) {
        stage1_5.prompt = `[BLOCKED] ${stage1_5.prompt}\nCannot proceed until blockers are resolved.`;
      }

      return stage1_5;
    }

    return { classification: cleanClassification, routing, status: 'ready_for_planning' };
  }

  /**
   * Handles the Stage 5 Approval Gate and triggers the pipeline.
   */
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
      `Hints:  ${this.userHintBuffer.length > 0 ? this.userHintBuffer.length + ' queued' : 'none'}`
    ].join('\n');
  }

  requestAbort() {
    if (this.abortController) {
      this.abortController.abort();
    }
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

    try {
      // Stage 3: Planning
      const planResult = await this.runStage3(classification, routing, [], this.stateSummary.executorLogs);
      let agreedPlan = planResult.plan;

      if (planResult.needsTiebreaker) {
        agreedPlan = await this.runStage3D(planResult.conflict, classification, routing);
      }

      // Stage 4: Code
      const codeResult = await this.runStage4(agreedPlan, classification, routing);
      
      // Stage 4.5: Virtual Dry Run (Placeholder for 0.8)
      const dryRun = await this.runStage4_5(codeResult.code);

      // Stage 6: Write + Validate
      const writeResult = await this.runStage6(codeResult.code, classification.files);

      if (!writeResult.validatorPassed) {
        const errorHash = require('crypto').createHash('sha256').update(writeResult.validatorOutput).digest('hex').slice(0, 16);
        eventStore.append('VALIDATION_FAILED', 'operator', { 
          files: writeResult.modifiedFiles, 
          errorHash 
        }, 'mirror');
        const err = new Error(`Validator failed: ${writeResult.validatorOutput.slice(0, 200)}...`);
        err.validatorOutput = writeResult.validatorOutput;
        throw err;
      }

      this.abortController = null;
      // Stage 5.5: Surface audit package to REPL — pause here.
      // REPL resolves via 'approved' → runStage8(), or 'reject' → runStage7Rollback().
      // Do NOT auto-approve, auto-rollback, or continue to Stage 11 here.
      this.stateSummary.pendingAuditContext = { classification, routing, modifiedFiles: writeResult.modifiedFiles };
      const auditPkg = await this.runStage7(writeResult);
      return {
        status: 'audit_pending',
        auditPackage: auditPkg,
        prompt: 'Audit package ready. Respond "approved" to sync state, or "reject" to roll back.'
      };
      // NOTE: Stage 11 (graph update) runs after 'approved' in runStage8(), not here.
    } catch (e) {
      console.error(`[Operator] Pipeline failure: ${e.message}`);
      
      this.abortController = null;
      this._pipelineRunning = false;
      const isAbort = e.message && (e.message.includes('abort') || e.message.includes('Abort'));
      if (isAbort) {
        return { status: 'aborted', reason: 'Pipeline aborted by user.' };
      }
      
      // BUG-012: Smoke test failure loop (Recovery limit)
      if (this.stateSummary.recoveryAttempts < 3) {
        this.stateSummary.recoveryAttempts++;
        console.error(`[Operator] Attempting recovery (${this.stateSummary.recoveryAttempts}/3)...`);
        // Re-inject the pending decision into the pipeline for retry
        this.stateSummary.executorLogs = e.validatorOutput || e.message;
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
    const { routingMap } = await (require('./model-router').routeModels());
    const onChunk = routingMap.tiebreaker?.streaming ? this.onChunk : null;
    const options = { signal: this.abortController?.signal, onChunk };
    this.stateSummary.currentStage = 'tiebreaker_plan';
    const hardState = this.getHardState();
    const prompt = `Arbitrate the following plan conflict and produce a single convergent ExecutionPlan.\nConflict: ${conflict}\nTask: ${classification.rationale}\n\nReturn ONLY JSON per SPEC Section 13 (ExecutionPlan).`;
    
    const response = await callModel('tiebreaker', prompt, { classification, routing }, hardState, [], null, options);
    const plan = this._safeParseJSON(response, null, 'tiebreaker');
    if (!plan) throw new Error("[Operator] Tiebreaker plan parse failure.");
    eventStore.append('TIEBREAKER_PLAN', 'operator', { plan }, 'mirror');
    return plan;
  }

  /**
   * Section 27: Pre-Execution Assumption Ledger
   * Audit every assumption before planning begins.
   */
  async generateAssumptionLedger(classification, routing, context) {
    const { routingMap } = await (require('./model-router').routeModels());
    const onChunk = routingMap.classifier?.streaming ? this.onChunk : null;
    const options = { signal: this.abortController?.signal, onChunk };
    const hardState = this.getHardState();
    const prompt = `Audit every assumption for the following task. 
  Task: ${classification.rationale}
  Files: ${classification.files.join(', ')}
  Routing Tier: ${routing.tier}

  Return ONLY a JSON object following this schema:
  {
  "assumptions": [
    {
      "id": "A1",
      "category": "Logic" | "Architecture" | "Data" | "UX" | "Security",
      "statement": "One falsifiable sentence.",
      "impact": "Critical" | "High" | "Low",
      "autonomousDefault": "Specific decision if human types go."
    }
  ],
  "blockers": ["Specific missing info preventing go"],
  "entropyScore": number
  }

  Calculate entropyScore as: (Critical × 3) + (High × 1.5) + (Low × 0.5).`;

    try {
      const response = await callModel('classifier', prompt, { classification, routing, context }, hardState, [], null, options);
      const ledger = this._safeParseJSON(response, null, 'classifier');

      if (!ledger || !ledger.assumptions) {
        throw new Error("[Operator] Ledger generation failed or malformed.");
      }

      // Ensure score is derived correctly if model missed it
      ledger.entropyScore = this._calculateEntropy(ledger.assumptions);
      return ledger;
    } catch (e) {
      console.error(`[Operator] Ledger generation error: ${e.message}`);
      return { assumptions: [], blockers: ["Ledger generation failed"], entropyScore: 0 };
    }
  }

  _calculateEntropy(assumptions) {
    const weights = { 'Critical': 3, 'High': 1.5, 'Low': 0.5 };
    return assumptions.reduce((sum, a) => sum + (weights[a.impact] || 0), 0);
  }

  /**
   * Section 27: Sign-Off Block Formatting
   */
  _formatSignOffBlock(ledger) {
    const critical = ledger.assumptions.filter(a => a.impact === 'Critical').map(a => a.id);
    const defaults = ledger.assumptions.map(a => a.id);

    return `
  Entropy Score: ${ledger.entropyScore}
  Blockers: ${ledger.blockers.length > 0 ? ledger.blockers.join(', ') : 'none'}
  Critical assumptions requiring confirmation: ${critical.length > 0 ? critical.join(', ') : 'none'}
  Autonomous defaults active if you type go: ${defaults.join(', ')}
  `;
  }

  /**
   * Section 15: Stage 1.5 — Human Intervention Gate
   * Section 27: Assumption Ledger
   */
  async runStage1_5(classification, routing) {
    this.stateSummary.currentStage = 'context_pinning';

    // 1. Default search for classification files or SPEC.md
    const context = await this.callMCPTool('graph_search', { pattern: classification.files[0] || 'SPEC.md' });

    // 2. Generate Section 27 Assumption Ledger
    const ledger = await this.generateAssumptionLedger(classification, routing, context);
    const signOff = this._formatSignOffBlock(ledger);

    // Section 27: Entropy Gate — hard stop before any planning begins
    if (ledger.entropyScore > 10) {
      eventStore.append('ENTROPY_GATE_BLOCKED', 'operator', {
        entropyScore: ledger.entropyScore,
        assumptionCount: ledger.assumptions.length,
        blockers: ledger.blockers,
      }, 'mirror');
      return {
        status:           'blocked',
        stage:            '1.5',
        assumptionLedger: ledger,
        signOffBlock:     signOff,
        prompt: `[ENTROPY GATE — HARD STOP] Entropy score ${ledger.entropyScore.toFixed(1)} exceeds limit of 10.\n` +
                `Decompose this task into smaller independent subtasks before proceeding.\n\n${signOff}`,
      };
    }

    return {
      needsApproval: true,
      stage: '1.5',
      projectedContext: context,
      assumptionLedger: ledger,
      signOffBlock: signOff,
      prompt: `Stage 1.5: Spec refinement gate. Confirm intent/files/assumptions before autonomous DID.\n${signOff}\nType 'pin: [id]' to emphasize, 'exclude: [id]' to ignore, or 'go' to proceed.`
    };
  }
  /**
   * Section 15: Stage 3 — Independent Plan Derivation
   * Qualitative consensus based on Spec Adherence.
   */
  async runStage3(classification, routing, pinnedContext = [], executorLogs = null) {
    const { routingMap } = await (require('./model-router').routeModels());
    const options = { signal: this.abortController?.signal, onChunk: this.onChunk };
    this.stateSummary.currentStage = 'planning';
    const hardState = this.getHardState();

    // Task 1.1-H24: Tier 2/3 must trigger DID automatically.
    if (this.didOrchestrator.shouldRunDID(routing)) {
      const didPackage = await this.didOrchestrator.run(classification, routing, hardState, options);

      if (didPackage.did.verdict === 'needs_human') {
        return {
          escalatedToHuman: true,
          conflict: 'DID tiebreaker could not converge. Human decision required.',
          finalDiff: didPackage.did.finalDiff,
          didPackage
        };
      }

      if (!didPackage.did.finalDiff) {
        return {
          needsTiebreaker: true,
          conflict: 'No convergent output from DID bounce loop.',
          rationale: 'DID produced no final diff.',
          didPackage
        };
      }

      return {
        status: 'plan_agreed',
        plan: { intent: 'DID converged plan', diff: didPackage.did.finalDiff },
        consensusIntent: 'DID autonomous bounce loop converged',
        didPackage
      };
    }

    let promptPrefix = `Derive an ExecutionPlan adhering to the Prime Directive.\nTask: ${classification.rationale}`;
    if (this.userHintBuffer.length > 0) {
      promptPrefix += `\n\nUSER HINTS (Incorporate these):\n- ${this.userHintBuffer.join('\n- ')}`;
      this.userHintBuffer = [];
    }

    const planPrompt = `${promptPrefix}
Prime Directive: ${hardState.primeDirective}
Failure Context (Retry): ${executorLogs || 'None'}
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
      callModel('architecturePlanner', planPrompt, { classification, routing }, hardState, [], null, 
        { ...options, onChunk: routingMap.architecturePlanner?.streaming ? this.onChunk : null }),
      callModel('componentPlanner', planPrompt, { classification, routing }, hardState, [], null, 
        { ...options, onChunk: routingMap.componentPlanner?.streaming ? this.onChunk : null })
    ]);

    const planA = this._safeParseJSON(planARaw, null, 'architecturePlanner');
    const planB = this._safeParseJSON(planBRaw, null, 'componentPlanner');

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
    const { routingMap } = await (require('./model-router').routeModels());
    const options = { signal: this.abortController?.signal, onChunk: this.onChunk };
    this.stateSummary.currentStage = 'code_derivation';
    const hardState = this.getHardState();
    this.stateSummary.blockCounter = 0;

    while (this.stateSummary.blockCounter < 3) {
      // Stage 4A: Architecture Planner
      const plannerPrompt = `Write the implementation code for the agreed plan.\nPlan: ${JSON.stringify(plan)}\nTask: ${classification.rationale}\nFiles: ${classification.files.join(', ')}`;
      const codeA = await callModel('architecturePlanner', plannerPrompt, { plan, classification }, hardState, [], null, 
        { ...options, onChunk: routingMap.architecturePlanner?.streaming ? this.onChunk : null });

      // Invariant 7: Compute Planner hashes for blindness enforcement
      const plannerHashes = computeContentHashes(codeA);
      const planHashes = computeContentHashes(JSON.stringify(plan));
      const allProtectedHashes = [...plannerHashes, ...planHashes];

      // Stage 4B: Adversarial Reviewer (blind)
      const reviewerPrompt = `Independent Code Derivation (Blind). Derive your own ExecutionPlan and write the code independently.\nTask: ${classification.rationale}\nReturn ReviewerOutput JSON.`;
      const reviewerOutputRaw = await callModel('reviewer', reviewerPrompt, { classification }, hardState, allProtectedHashes, null, 
        { ...options, onChunk: routingMap.reviewer?.streaming ? this.onChunk : null });
      const reviewerOutput = this._safeParseJSON(reviewerOutputRaw);

      if (!reviewerOutput || !reviewerOutput.independentCode) {
        console.error("[Operator] Reviewer produced malformed output. Retrying iteration.");
        continue;
      }

      // Stage 4C: Gate 2 — Code Consensus
      const consensus = await this.evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState, options);
      
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
        // Capture revision before and after to verify the scan completed successfully.
        const beforeInfo = await this.callMCPTool('graph_server_info', {});
        const revBefore = JSON.parse(beforeInfo.content[0].text).index_revision;

        await this.callMCPTool('graph_update_task', { modifiedFiles });

        const afterInfo = await this.callMCPTool('graph_server_info', {});
        const revAfter = JSON.parse(afterInfo.content[0].text).index_revision;
        if (revAfter <= revBefore) {
          console.error(`[Operator] Stage 11: WARN: index_revision did not increment after graph_update_task (was ${revBefore}, still ${revAfter}). Scan may have failed.`);
        } else {
          console.error(`[Operator] Stage 11: index_revision: ${revBefore} → ${revAfter}`);
        }
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

  async evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState, options = {}) {
    const { routingMap } = await (require('./model-router').routeModels());
    const onChunk = routingMap.reviewer?.streaming ? this.onChunk : null;
    const auditPrompt = `Audit the Planner's code against the agreed plan and Reviewer's independent derivation.\nPlan: ${JSON.stringify(plan)}\nPlanner Code: ${codeA}\nReviewer Code: ${reviewerOutput.independentCode}\nReviewer Concerns: ${JSON.stringify(reviewerOutput.concerns)}\n\nDoes the code correctly implement state transitions? Return JSON with verdict, reason, citation, and consensusIntent.`;
    const result = await callModel('reviewer', auditPrompt, {}, hardState, [], null, { ...options, onChunk });
    if (process.env.MBO_DEBUG) console.error(`[DEBUG] evaluateCodeConsensus response: ${result}`);
    return this._safeParseJSON(result, { verdict: 'block', reason: 'JSON Parse Failure' }, 'reviewer');
  }

  /**
   * Section 15: Stage 4D — Tiebreaker (Code)
   * Milestone 0.7-05.
   */
  async runStage4D(plan, classification, routing) {
    const { routingMap } = await (require('./model-router').routeModels());
    const options = { signal: this.abortController?.signal, onChunk: this.onChunk };
    this.stateSummary.currentStage = 'tiebreaker_code';
    const hardState = this.getHardState();
    let retries = 0;

    while (retries < 3) {
      const prompt = `Tiebreaker: Produce the final arbitrated code draft based on competing derivations.\nPlan: ${JSON.stringify(plan)}\nTask: ${classification.rationale}\n\nReturn the final code/diff only.`;
      const codeTied = await callModel('tiebreaker', prompt, { classification, routing }, hardState, [], null, 
        { ...options, onChunk: routingMap.tiebreaker?.streaming ? this.onChunk : null });

      // Spec Note (BUG-010): One final audit for Tiebreaker code.
      const reviewerPrompt = `Final Audit of Tiebreaker Code.\nTask: ${classification.rationale}\nCode: ${codeTied}\n\nReturn ONLY JSON verdict per SPEC Section 11.`;
      const finalAuditRaw = await callModel('reviewer', reviewerPrompt, { classification }, hardState, [], null, 
        { ...options, onChunk: routingMap.reviewer?.streaming ? this.onChunk : null });
      const finalAudit = this._safeParseJSON(finalAuditRaw, null, 'reviewer');

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
    const { routingMap } = await (require('./model-router').routeModels());
    const onChunk = routingMap.classifier?.streaming ? this.onChunk : null;
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
    const result = await callModel('classifier', auditPrompt, {}, hardState, [], null, { onChunk });
    if (process.env.MBO_DEBUG) console.error(`[DEBUG] evaluateSpecAdherence response: ${result}`);
    return this._safeParseJSON(result, { verdict: 'divergent', conflict: 'JSON Parse Failure' }, 'classifier');
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

  saveHistory() {
    try {
      const dir = path.dirname(SESSION_HISTORY_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SESSION_HISTORY_PATH, JSON.stringify(this.sessionHistory, null, 2), 'utf8');
    } catch (e) {
      console.error(`[Operator] History save failure: ${e.message}`);
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(SESSION_HISTORY_PATH)) {
        const data = fs.readFileSync(SESSION_HISTORY_PATH, 'utf8');
        this.sessionHistory = JSON.parse(data);
      }
    } catch (e) {
      console.error(`[Operator] History load failure: ${e.message}`);
    }
  }

  async shutdown() {
    // Section 17: Generate handoff on clean shutdown
    stateManager.checkpoint('mirror');
    stateManager.generateHandoff();
  }
}

module.exports = { Operator };
