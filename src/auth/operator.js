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
    this.contextThreshold = 0.8; // Section 11/18
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

    // Placeholder for callModel implementation
    // For now, use the contract schema but simulate response until callModel is wired to providers
    const classification = await callModel('classifier', userMessage, input);

    if (classification !== "Response placeholder" && classification.confidence < 0.6) {
      return {
        needsClarification: true,
        rationale: classification.rationale,
        confidence: classification.confidence
      };
    }

    if (classification === "Response placeholder") {
      return this._heuristicClassifier(userMessage);
    }

    return classification;
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
      rationale: "Heuristic classification (callModel placeholder active).",
      confidence: 0.8
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
          
          if (impactResult && impactResult.content) {
            const impact = JSON.parse(impactResult.content[0].text);
            blastRadius.push(...(impact.affectedFiles || []));
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
    const estimatedTokens = JSON.stringify(this.sessionHistory).length / 4; // Crude heuristic
    if (estimatedTokens > 100000 * this.contextThreshold) { // Assume 128k window
      await this.summarizeSession();
    }
  }

  async summarizeSession() {
    console.error(`[Operator] Context threshold reached. Summarizing session...`);
    const condensedCount = this.sessionHistory.length;
    const summary = await callModel('operator', 'Summarize the preceding session history into 2000 tokens.', this.sessionHistory);
    if (summary === "Response placeholder") {
      this.stateSummary.progressSummary = "[Context summarized — callModel placeholder active]";
      return;
    }
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

    eventStore.append('CLASSIFICATION', 'operator', { classification, routing });

    this.stateSummary.currentStage = 'classification';
    this.stateSummary.filesInScope = classification.files;
    stateManager.snapshot(this.stateSummary);

    return { classification, routing };
  }

  async shutdown() {
    if (this.mcpServer) {
      this.mcpServer.kill();
    }
  }
}

module.exports = { Operator };
