const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const rpc = require('vscode-jsonrpc/node');
const {
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DefinitionRequest,
  PrepareCallHierarchyRequest,
  CallHierarchyIncomingCallsRequest,
  CallHierarchyOutgoingCallsRequest
} = require('vscode-languageserver-protocol');

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
  }

  registerWithWatchdog() {
    // R-06: Placeholder for Watchdog registration
  }

  async start() {
    this.serverProcess = spawn(this.serverCommand, this.serverArgs, {
      cwd: this.projectRoot,
      stdio: ['pipe', 'pipe', 'inherit']
    });

    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(this.serverProcess.stdout),
      new rpc.StreamMessageWriter(this.serverProcess.stdin)
    );

    this.connection.listen();
    this.registerWithWatchdog();

    this.connection.onNotification('$/progress', (params) => {
      if (params.value && params.value.kind === 'end') {
        this.isReady = true;
        if (this.resolveReady) {
          this.resolveReady();
        }
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
      await this.connection.sendRequest(InitializeRequest.type, initParams);
      this.connection.sendNotification(InitializedNotification.type, {});
      await this.waitForReady();
    } catch (err) {
      console.warn(`[LSP:${this.language}] Initialization failed:`, err.message);
    }
  }

  waitForReady(timeoutMs = 30000) {
    if (this.isReady) return Promise.resolve();
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
      setTimeout(() => {
        if (!this.isReady) {
          resolve();
        }
      }, timeoutMs);
    });
    return this.readyPromise;
  }

  async openDocument(absolutePath) {
    const uri = pathToFileURL(absolutePath).href;
    await this.connection.sendNotification(DidOpenTextDocumentNotification.type, {
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
    await this.connection.sendNotification(DidCloseTextDocumentNotification.type, {
      textDocument: { uri }
    });
  }

  async resolveDefinition(absolutePath, line, character) {
    const uri = pathToFileURL(absolutePath).href;
    try {
      const result = await this.connection.sendRequest(DefinitionRequest.type, {
        textDocument: { uri },
        position: { line, character }
      });
      if (!result) return null;
      const loc = Array.isArray(result) ? result[0] : result;
      return { targetUri: loc.uri || loc.targetUri, targetRange: loc.range || loc.targetSelectionRange };
    } catch (e) { return null; }
  }

  async getCallHierarchy(absolutePath, line, character) {
    const uri = pathToFileURL(absolutePath).href;
    try {
      const items = await this.connection.sendRequest(PrepareCallHierarchyRequest.type, {
        textDocument: { uri },
        position: { line, character }
      });
      if (!items || items.length === 0) return null;
      const item = items[0];
      const [incoming, outgoing] = await Promise.all([
        this.connection.sendRequest(CallHierarchyIncomingCallsRequest.type, { item }),
        this.connection.sendRequest(CallHierarchyOutgoingCallsRequest.type, { item })
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
  for (const cmd of (candidates[language] || [])) {
    try {
      const check = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
      execSync(check, { stdio: 'ignore' });
      return cmd;
    } catch (e) {}
  }
  return null;
}

module.exports = { LSPClient, detectServer };
