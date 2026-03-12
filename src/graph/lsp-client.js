const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const rpc = require('vscode-jsonrpc/node');

// HACK: Some versions of vscode-languageserver-protocol use a different instance of 
// vscode-jsonrpc than the one we have, leading to "Unknown parameter structure byName"
// when the ProtocolRequestType instances are used. We've replaced them with strings,
// but the underlying library might still be checking against its own internal list.
if (rpc.ParameterStructures && !rpc.ParameterStructures.byName) {
  rpc.ParameterStructures.byName = new rpc.ParameterStructures('byName');
}

// Axis 2: Orphan Process Prevention Registry
const activeLSPProcesses = new Set();

process.on('exit', () => {
  for (const proc of activeLSPProcesses) {
    try { proc.kill('SIGKILL'); } catch (e) {}
  }
});

class LSPClient {
  constructor(language, serverCommand, serverArgs = [], projectRoot) {
    this.language = language;
    this.serverCommand = serverCommand;
    this.serverArgs = serverArgs;
    this.projectRoot = projectRoot;
    this.serverProcess = null;
    this.connection = null;
    this.isReady = false;
    this.readyPromise = null;
    this.resolveReady = null;
    this.initStatus = 'uninitialized';
  }

  registerWithWatchdog() {
    // R-06: Placeholder for Watchdog registration
  }

  async start() {
    this.serverProcess = spawn(this.serverCommand, this.serverArgs, {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    activeLSPProcesses.add(this.serverProcess);
    this.serverProcess.on('exit', () => activeLSPProcesses.delete(this.serverProcess));

    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.serverProcess.stdout),
      new rpc.StreamMessageWriter(this.serverProcess.stdin)
    );

    this.connection.listen();
    this.registerWithWatchdog();

    // Enhanced state monitoring
    this.connection.onNotification('$/progress', (params) => {
      if (params.value && params.value.kind === 'end') {
        this.isReady = true;
        if (this.resolveReady) this.resolveReady();
      }
    });

    await this.initialize();
  }

  async initialize() {
    const rootUri = pathToFileURL(this.projectRoot).href;
    const initParams = {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: path.basename(this.projectRoot) }],
      capabilities: {
        textDocument: {
          definition: { dynamicRegistration: true },
          callHierarchy: { dynamicRegistration: true }
        }
      }
    };

    try {
      this.initStatus = 'initializing';
      await this.connection.sendRequest('initialize', initParams);
      this.connection.sendNotification('initialized', {});
      this.initStatus = 'initialized';
      // Axis 2: Don't block indefinitely on $/progress. 
      // Many servers (vtsls) are ready immediately after initialized.
      await this.waitForReady(5000); 
    } catch (err) {
      this.initStatus = 'failed';
      console.warn(`[LSP:${this.language}] Initialization failed:`, err.message);
    }
  }

  waitForReady(timeoutMs = 30000) {
    if (this.isReady) return Promise.resolve();
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
      setTimeout(() => {
        // Fallback: Assume ready if timeout reached to prevent blocking Harvester
        this.isReady = true; 
        resolve();
      }, timeoutMs);
    });
    return this.readyPromise;
  }

  async openDocument(absolutePath) {
    const uri = pathToFileURL(absolutePath).href;
    await this.connection.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: this.language,
        version: 1,
        text: fs.readFileSync(absolutePath, 'utf8')
      }
    });
    return uri;
  }

  async closeDocument(absolutePath) {
    const uri = pathToFileURL(absolutePath).href;
    await this.connection.sendNotification('textDocument/didClose', {
      textDocument: { uri }
    });
  }

  // BUG-044 fix: wrap every sendRequest in a timeout so a dead/unresponsive
  // LSP process cannot hang the MCP server startup indefinitely.
  _withTimeout(promise, ms = 5000) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`LSP request timed out after ${ms}ms`)), ms)
      )
    ]);
  }

  async resolveDefinition(absolutePath, line, character) {
    const uri = pathToFileURL(absolutePath).href;
    try {
      const result = await this._withTimeout(
        this.connection.sendRequest('textDocument/definition', {
          textDocument: { uri },
          position: { line, character }
        })
      );
      if (!result) return null;
      const loc = Array.isArray(result) ? result[0] : result;
      return { targetUri: loc.uri || loc.targetUri, targetRange: loc.range || loc.targetSelectionRange };
    } catch (e) { return null; }
  }

  async getCallHierarchy(absolutePath, line, character) {
    const uri = pathToFileURL(absolutePath).href;
    try {
      const items = await this._withTimeout(
        this.connection.sendRequest('textDocument/prepareCallHierarchy', {
          textDocument: { uri },
          position: { line, character }
        })
      );
      if (!items || items.length === 0) return null;
      const item = items[0];
      const [incoming, outgoing] = await Promise.all([
        this._withTimeout(this.connection.sendRequest('callHierarchy/incomingCalls', { item })),
        this._withTimeout(this.connection.sendRequest('callHierarchy/outgoingCalls', { item }))
      ]);
      return { incoming, outgoing };
    } catch (e) { return null; }
  }

  async shutdown() {
    if (this.connection) {
      try { await this.connection.sendRequest('shutdown'); } catch (e) {}
      this.connection.sendNotification('exit');
      this.connection.dispose();
    }
    if (this.serverProcess) this.serverProcess.kill();
  }
}

function detectServer(language) {
  const { execSync } = require('child_process');
  const candidates = {
    typescript: ['vtsls', 'typescript-language-server'],
    javascript: ['vtsls', 'typescript-language-server'],
    python: ['pyright-langserver', 'jedi-language-server']
  };
  // Resolve node_modules/.bin relative to THIS file (src/graph/lsp-client.js → ../../node_modules/.bin)
  // This works in launchd context where $PATH may not include the project's .bin directory.
  const localBinDir = path.join(__dirname, '../../node_modules/.bin');

  for (const cmd of (candidates[language] || [])) {
    // 1. Check project-local node_modules/.bin first — always works regardless of shell PATH
    const localBin = path.join(localBinDir, cmd);
    if (fs.existsSync(localBin)) return localBin;

    // 2. Fall back to $PATH lookup (works in interactive shell sessions)
    try {
      const check = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
      execSync(check, { stdio: 'ignore' });
      return cmd;
    } catch (e) {}
  }
  return null;
}

module.exports = { LSPClient, detectServer };
