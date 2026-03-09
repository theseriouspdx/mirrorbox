const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { callModel } = require('./call-model');
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
      progressSummary: ''
    };
    this.mcpServer = null;
    this.messageId = 1;
    this.mcpCallbacks = new Map();
    this.contextThreshold = 0.8;      // Section 8: configurable via operatorContextThreshold
    this.activeModelWindow = null;    // set after routeModels() resolves, see _loadModelWindow()
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

  /**
   * Section 8: Classification
   * Parses user message into a Classification object.
   */
  async classifyRequest(userMessage) {
    // Stage 1: Call Classifier model
    const input = {
      userMessage,
      sessionHistory: this.sessionHistory,
      stateSummary: this.stateSummary,
      primeDirective: this.getPrimeDirective()
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

    const response = await callModel('classifier', prompt, input);

    try {
      // Robust JSON extraction in case model wraps in markdown
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const classification = JSON.parse(jsonMatch ? jsonMatch[0] : response);
      
      if (classification.confidence < 0.6) {
        return {
          needsClarification: true,
          rationale: classification.rationale,
          confidence: classification.confidence
        };
      }
      return classification;
    } catch (e) {
      console.error(`[Operator] Model classification parse error: ${e.message}. Falling back to heuristic.`);
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
    const estimatedTokens = JSON.stringify(this.sessionHistory).length / 4;
    if (estimatedTokens > window * this.contextThreshold) {
      await this.summarizeSession();
    }
  }

  async summarizeSession() {
    console.error(`[Operator] Context threshold reached. Summarizing session...`);
    const condensedCount = this.sessionHistory.length;
    const summary = await callModel('operator', 'Summarize the preceding session history into 2000 tokens.', this.sessionHistory);
    this.sessionHistory = [{ role: 'system', content: summary }];
    this.stateSummary.progressSummary = summary.substring(0, 200);
    console.error(`[CONTEXT RESET] Session summarized at ${new Date().toISOString()}. ${condensedCount} messages condensed.`);
  }

  async processMessage(userMessage) {
    await this.checkContextLifecycle();
    this.sessionHistory.push({ role: 'user', content: userMessage });
    
    const classification = await this.classifyRequest(userMessage);

    if (classification.needsClarification) {
      return { needsClarification: true, question: classification.rationale };
    }

    const routing = await this.determineRouting(classification);

    // Distinguish heuristic vs. model-derived classifications in the audit trail
    const classificationSource = classification._source === 'heuristic' ? 'CLASSIFICATION_HEURISTIC' : 'CLASSIFICATION';
    const { _source, ...cleanClassification } = classification;
    eventStore.append(classificationSource, 'operator', { classification: cleanClassification, routing });

    this.stateSummary.currentStage = 'classification';
    this.stateSummary.filesInScope = cleanClassification.files;
    stateManager.snapshot(this.stateSummary);

    return { classification: cleanClassification, routing };
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
  }
}

module.exports = { Operator };