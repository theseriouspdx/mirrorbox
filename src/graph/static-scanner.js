const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript');
const Python = require('tree-sitter-python');
const { LSPClient, detectServer } = require('./lsp-client');
const { fileURLToPath } = require('url');

class StaticScanner {
  /**
   * @param {GraphStore} graphStore - GraphStore instance for this scan
   * @param {object} config - Instance config: { scanRoots, exclude, instanceType }
   */
  constructor(graphStore, config = {}) {
    this.graphStore = graphStore;
    this.config = {
      scanRoots: config.scanRoots || [],
      exclude: config.exclude || [],
      instanceType: config.instanceType || 'runtime',
      ...config
    };

    // FIX: pass full grammar object (not .language) so nodeTypeInfo is available
    // to tree-sitter's setLanguage for nodeSubclasses population.
    // TypeScript is the exception — it exports named grammars { typescript, tsx }.
    this.parsers = {
      '.js': this.createParser(JavaScript),
      '.ts': this.createParser(TypeScript.typescript),
      '.tsx': this.createParser(TypeScript.tsx),
      '.py': this.createParser(Python)
    };
  }

  createParser(language) {
    const parser = new Parser();
    parser.setLanguage(language);
    return parser;
  }

  heuristicTokenCount(str) {
    return Math.ceil(String(str || '').length / 4);
  }

  logIngestionError(nodeId, name, sourcePath, tokens, reason) {
    const logDir = path.join(process.cwd(), '.mbo/logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'ingestion.log');
    const entry = {
      timestamp: new Date().toISOString(),
      nodeId,
      name,
      sourcePath,
      estimatedTokens: tokens,
      reason
    };
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  }

  extractDocstring(node, text) {
    let leadingDoc = '';
    let prev = node && node.previousNamedSibling;
    while (prev && (prev.type === 'comment' || prev.type === 'line_comment' || prev.type === 'block_comment')) {
      leadingDoc = `${prev.text}\n${leadingDoc}`;
      prev = prev.previousNamedSibling;
    }

    const bodyNode = node && node.childForFieldName
      ? (node.childForFieldName('body') || node.children.find(c => c.type === 'block' || c.type === 'compound_statement' || c.type === 'suite'))
      : null;

    if (!bodyNode || typeof node.startIndex !== 'number') {
      return leadingDoc.trim();
    }

    const relStart = Math.max(0, bodyNode.startIndex - node.startIndex);
    const relEnd = Math.max(0, bodyNode.endIndex - node.startIndex);
    const bodyText = text.slice(relStart, relEnd);
    const jsDoc = bodyText.match(/^\s*\/\*\*[\s\S]*?\*\//);
    const pyDoc = bodyText.match(/^\s*(?:'''[\s\S]*?'''|"""[\s\S]*?""")/);
    const inlineDoc = jsDoc ? jsDoc[0] : (pyDoc ? pyDoc[0] : '');

    return [leadingDoc.trim(), inlineDoc.trim()].filter(Boolean).join('\n');
  }

  truncateNodeContent(node, text) {
    const source = String(text || '');
    if (this.heuristicTokenCount(source) <= 800) return source;

    const bodyNode = node && node.childForFieldName
      ? (node.childForFieldName('body') || node.children.find(c => c.type === 'block' || c.type === 'compound_statement' || c.type === 'suite'))
      : null;

    let signature = source.split('\n')[0] || '';
    if (bodyNode && typeof node.startIndex === 'number' && typeof bodyNode.startIndex === 'number') {
      signature = source.substring(0, Math.max(0, bodyNode.startIndex - node.startIndex)).trim();
    }

    const docstring = this.extractDocstring(node, source);
    return [signature, docstring, '[TRUNCATED: Exceeds 800 token node limit. Implementation hidden.]']
      .filter(Boolean)
      .join('\n');
  }

  safeUpsertNode(node) {
    const { id, type, name, path: relPath, content, metadata } = node;
    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    const tokens = this.heuristicTokenCount(content);

    try {
      this.graphStore.db.run(`
        INSERT INTO nodes (id, type, name, path, content, metadata)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          name = excluded.name,
          path = excluded.path,
          content = excluded.content,
          metadata = excluded.metadata
      `, [id, type, name, relPath, content ?? null, metadataStr]);
    } catch (e) {
      if (String(e.message || '').includes('token_cap')) {
        this.logIngestionError(id, name, relPath, tokens, 'Rule 2.1: SQLite token_cap violation');
        return;
      }
      throw e;
    }
  }

  markNodeStale(node) {
    const metadata = { ...(node.metadata || {}), stale: true, staleAt: Date.now() };
    this.safeUpsertNode({
      id: node.id,
      type: node.type,
      name: node.name,
      path: node.path,
      content: node.content || null,
      metadata
    });
  }

  async scanFile(filePath, projectRoot) {
    const ext = path.extname(filePath);
    
    if (ext === '.md') {
      await this.scanMarkdown(filePath, projectRoot);
      return;
    }

    const parser = this.parsers[ext];
    if (!parser) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileId = `file://${relativePath}`;

    // BUG-009: Staleness logic
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const existingNode = this.graphStore.getNode(fileId);
    
    if (existingNode && existingNode.metadata?.content_hash && existingNode.metadata.content_hash !== contentHash) {
      this.markNodeStale(existingNode);
    }

    if (existingNode && existingNode.metadata?.content_hash === contentHash) {
      return; // Skip re-scanning unchanged file
    }

    // Finding #5: Purge stale symbol nodes and edges owned by this file before re-scan
    this.graphStore.db.transaction(() => {
      // Delete edges where this file is the source (DEFINES, IMPORTS, etc.)
      this.graphStore.db.run("DELETE FROM edges WHERE source_id = ?", [fileId]);
      // Delete edges where a child symbol of this file is the source (CALLS)
      this.graphStore.db.run("DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE path = ? AND type != 'file')", [relativePath]);
      // Delete the symbols themselves
      this.graphStore.db.run("DELETE FROM nodes WHERE path = ? AND type != 'file'", [relativePath]);
    });

    const tree = parser.parse(content);

    this.safeUpsertNode({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
      content: this.truncateNodeContent({ startIndex: 0 }, content),
      metadata: { 
        size: content.length,
        content_hash: contentHash,
        last_modified: Date.now()
      }
    });

    this.extractSymbols(tree.rootNode, fileId, relativePath);
    this.extractImports(tree.rootNode, fileId);
  }

  async scanMarkdown(filePath, projectRoot) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(projectRoot, filePath);
    const fileId = `file://${relativePath}`;

    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const existingNode = this.graphStore.getNode(fileId);
    if (existingNode && existingNode.metadata?.content_hash === contentHash) {
      return;
    }

    // Finding #5: Purge stale spec sections
    this.graphStore.db.transaction(() => {
      this.graphStore.db.run("DELETE FROM edges WHERE source_id = ?", [fileId]);
      this.graphStore.db.run("DELETE FROM nodes WHERE path = ? AND type = 'spec_section'", [relativePath]);
    });

    this.safeUpsertNode({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
      content: this.truncateNodeContent({ startIndex: 0 }, content),
      metadata: {
        size: content.length,
        content_hash: contentHash,
        last_modified: Date.now()
      }
    });

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match ## Section or ### Sub-header
      const match = line.match(/^(#{2,3})\s+(.*)/);
      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        const sectionId = `${fileId}#${title.replace(/\s+/g, '-')}`;

        this.safeUpsertNode({
          id: sectionId,
          type: 'spec_section',
          name: title,
          path: relativePath,
          content: null,
          metadata: {
            level,
            startLine: i
          }
        });

        this.graphStore.upsertEdge({
          source_id: fileId,
          target_id: sectionId,
          relation: 'DEFINES',
          source: 'static'
        });
      }
    }
  }

  extractSymbols(rootNode, fileId, relativePath) {
    const walk = (node) => {
      if (
        node.type === 'function_declaration' ||
        node.type === 'method_definition' ||
        node.type === 'class_declaration'
      ) {
        const nameNode = node.childForFieldName('name') || node.children.find(c => c.type === 'identifier');
        if (nameNode) {
          const name = nameNode.text;
          // Finding #4: Identifier-level uniqueness for symbol IDs
          const symbolId = `${fileId}#${name}@${nameNode.startPosition.row}:${nameNode.startPosition.column}`;

          this.safeUpsertNode({
            id: symbolId,
            type: node.type.includes('class') ? 'class' : 'function',
            name: name,
            path: relativePath,
            content: this.truncateNodeContent(node, node.text),
            metadata: {
              // Store the identifier's specific coordinates for LSP matching
              nameStartLine: nameNode.startPosition.row,
              nameStartColumn: nameNode.startPosition.column,
              // Keep block coordinates for scope analysis
              blockStartLine: node.startPosition.row,
              blockEndLine: node.endPosition.row,
              content_hash: crypto.createHash('sha256').update(node.text).digest('hex')
            }
          });

          this.graphStore.upsertEdge({
            source_id: fileId,
            target_id: symbolId,
            relation: 'DEFINES',
            source: 'static'
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i));
      }
    };

    walk(rootNode);
  }

  extractImports(rootNode, fileId) {
    const walk = (node) => {
      if (node.type === 'import_statement' || node.type === 'export_statement') {
        const sourceNode = node.children.find(c => c.type === 'string');
        if (sourceNode) {
          const importPath = sourceNode.text.replace(/['"]/g, '');
          this.recordImport(fileId, importPath, sourceNode.startPosition);
        }
      }

      if (node.type === 'call_expression') {
        const fnNode = node.childForFieldName('function');
        if (fnNode && fnNode.text === 'require') {
          const argNode = node.childForFieldName('arguments')?.children.find(c => c.type === 'string');
          if (argNode) {
            const importPath = argNode.text.replace(/['"]/g, '');
            this.recordImport(fileId, importPath, argNode.startPosition);
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i));
      }
    };

    walk(rootNode);
  }

  recordImport(fileId, importPath, position) {
    // BUG-038: Ensure relative placeholders are unique per source file to avoid collisions
    const targetId = importPath.startsWith('.') 
      ? `import://${fileId}:${importPath}` 
      : `import://${importPath}`;

    this.safeUpsertNode({
      id: targetId,
      type: 'placeholder',
      name: importPath,
      path: importPath,
      content: null,
      metadata: {
        startLine: position ? position.row : 0,
        startColumn: position ? position.column : 0,
        nameStartLine: position ? position.row : 0,
        nameStartColumn: position ? position.column : 0
      }
    });

    this.graphStore.upsertEdge({
      source_id: fileId,
      target_id: targetId,
      relation: 'IMPORTS',
      source: 'static'
    });
  }

  async scanDirectory(dirPath, projectRoot) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const defaultExclude = ['node_modules', '.git', '.dev', 'data', 'audit'];
    const excluded = new Set([...defaultExclude, ...this.config.exclude]);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue;
        await this.scanDirectory(fullPath, projectRoot);
      } else {
        await this.scanFile(fullPath, projectRoot);
      }
    }
  }

  /**
   * Phase 2: The Semantic Muscle (LSP Enrichment)
   */
  async enrich(projectRoot) {
    const nodes = this.graphStore.db.query("SELECT * FROM nodes WHERE type IN ('function', 'class', 'placeholder')");
    
    // R-03: Amortize — open once, run all queries, then close. Group nodes by file.
    const nodesByFile = new Map();
    for (const node of nodes) {
      if (node.type === 'placeholder') {
        // BUG-038: A placeholder may be imported by multiple files; group it under each.
        const edges = this.graphStore.db.query("SELECT source_id FROM edges WHERE target_id = ? AND relation = 'IMPORTS'", [node.id]);
        for (const edge of edges) {
          const filePath = edge.source_id.replace('file://', '');
          if (!nodesByFile.has(filePath)) nodesByFile.set(filePath, []);
          nodesByFile.get(filePath).push({ ...node, source_id: edge.source_id });
        }
      } else {
        const filePath = node.path;
        if (!nodesByFile.has(filePath)) nodesByFile.set(filePath, []);
        nodesByFile.get(filePath).push(node);
      }
    }

    const clients = new Map();
    const missingLSPs = new Set();

    for (const [filePath, fileNodes] of nodesByFile) {
      const ext = path.extname(filePath);
      const lang = ext === '.py' ? 'python' : (ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript');
      
      if (!clients.has(lang)) {
        if (missingLSPs.has(lang)) {
          // Already known missing, fall through to static fallback
        } else {
          const cmd = detectServer(lang);
          if (!cmd) {
            console.warn(`[WARN] No LSP server found for ${lang}. Fallback to static enrichment for ${lang} files.`);
            missingLSPs.add(lang);
            clients.set(lang, null);
          } else {
            // R-05: Ephemeral instances per task handled by scan lifecycle.
            const client = new LSPClient(lang, cmd, ['--stdio'], projectRoot);
            try {
              await client.start();
              clients.set(lang, client);
            } catch (err) {
              console.error(`[ERROR] Failed to start LSP server for ${lang}:`, err.message);
              missingLSPs.add(lang);
              clients.set(lang, null);
            }
          }
        }
      }

      const client = clients.get(lang);
      if (!client) {
        // R-07: Static Fallback for JS/TS when LSP is missing
        if (lang === 'javascript' || lang === 'typescript') {
          await this.staticEnrich(projectRoot, filePath, fileNodes);
        }
        continue;
      }

      const absPath = path.resolve(projectRoot, filePath);
      await client.openDocument(absPath);
      
      for (const node of fileNodes) {
        const metadata = JSON.parse(node.metadata || '{}');
        const { nameStartLine, nameStartColumn } = metadata;
        
        if (node.type === 'placeholder') {
          // Finding #1: Robust warmup retries
          let def = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            def = await client.resolveDefinition(absPath, nameStartLine, nameStartColumn);
            if (def) break;
            await new Promise(r => setTimeout(r, 500));
          }

          if (def) {
            const targetRelPath = path.relative(projectRoot, fileURLToPath(def.targetUri));
            // Finding #2: Robust metadata search using virtual columns for indexed performance
            const targetNode = this.graphStore.db.get(
              "SELECT id FROM nodes WHERE path = ? AND nameStartLine = ? AND nameStartColumn = ?", 
              [targetRelPath, def.targetRange.start.line, def.targetRange.start.character]
            );
            if (targetNode) {
              const edge = this.graphStore.db.get("SELECT source_id FROM edges WHERE target_id = ? AND relation = 'IMPORTS'", [node.id]);
              if (edge) {
                this.graphStore.resolveImport(edge.source_id, node.id, targetNode.id);
              }
            }
          }
        } else {
          // Finding #1: Robust warmup retries
          let calls = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            calls = await client.getCallHierarchy(absPath, nameStartLine, nameStartColumn);
            if (calls && (calls.incoming.length > 0 || calls.outgoing.length > 0)) break;
            await new Promise(r => setTimeout(r, 500));
          }

          if (calls && calls.outgoing) {
            for (const out of calls.outgoing) {
              const targetRelPath = path.relative(projectRoot, fileURLToPath(out.to.uri));
              // Finding #2: Robust metadata search using virtual columns for indexed performance
              const targetNode = this.graphStore.db.get(
                "SELECT id FROM nodes WHERE path = ? AND nameStartLine = ? AND nameStartColumn = ?",
                [targetRelPath, out.to.selectionRange.start.line, out.to.selectionRange.start.character]
              );
              if (targetNode) {
                this.graphStore.upsertEdge({
                  source_id: node.id,
                  target_id: targetNode.id,
                  relation: 'CALLS',
                  source: 'static'
                });
              }
            }
          }
        }
      }

      await client.closeDocument(absPath);
    }

    // R-05: Shutdown ephemeral clients
    for (const client of clients.values()) {
      if (client) await client.shutdown();
    }
  }

  /**
   * BUG-038: Static Fallback for import resolution without LSP
   */
  async staticEnrich(projectRoot, filePath, fileNodes) {
    for (const node of fileNodes) {
      if (node.type !== 'placeholder') continue;

      const importPath = node.name; // recordImport stores raw path in 'name'
      const targetId = this.resolveLocalPath(filePath, importPath, projectRoot);
      
      if (targetId) {
        this.graphStore.resolveImport(node.source_id, node.id, targetId);
      }
    }
  }

  /**
   * Task 0.8-07: Runtime Edge Ingestion
   *
   * Reads a runtime-trace.json produced by src/sandbox/probe.js and upserts
   * DEPENDS_ON edges into the Intelligence Graph with source: 'runtime'.
   *
   * Expected trace entry shape (from probe.js):
   *   { type: 'dependency', source: 'relative/path', target: 'relative/path', timestamp: number }
   *
   * Only entries with type === 'dependency' are ingested. Unknown types are
   * silently skipped so future probe output types don't break ingestion.
   */
  async ingestRuntimeTrace(traceFilePath, projectRoot) {
    let traces;
    try {
      traces = JSON.parse(fs.readFileSync(traceFilePath, 'utf8'));
    } catch (e) {
      console.error(`[StaticScanner] ingestRuntimeTrace: failed to parse ${traceFilePath}: ${e.message}`);
      return;
    }

    if (!Array.isArray(traces)) {
      console.error(`[StaticScanner] ingestRuntimeTrace: expected array, got ${typeof traces}`);
      return;
    }

    let ingested = 0;
    for (const entry of traces) {
      if (entry.type !== 'dependency') continue;
      if (!entry.source || !entry.target) continue;

      const sourceId = `file://${entry.source}`;
      const targetId = `file://${entry.target}`;

      this.graphStore.upsertEdge({
        source_id: sourceId,
        target_id: targetId,
        relation: 'DEPENDS_ON',
        source: 'runtime'
      });
      ingested++;
    }

    console.error(`[StaticScanner] ingestRuntimeTrace: ingested ${ingested} runtime edge(s) from ${path.basename(traceFilePath)}`);
  }

  resolveLocalPath(sourcePath, importPath, projectRoot) {
    if (!importPath.startsWith('.')) return null;

    const sourceDir = path.dirname(path.join(projectRoot, sourcePath));
    const targetAbsPath = path.resolve(sourceDir, importPath);
    
    // Support common JS/TS resolution patterns
    const candidates = [
      '', 
      '.js', '.ts', '.tsx', 
      '/index.js', '/index.ts', '/index.tsx'
    ];

    for (const ext of candidates) {
      const fullPath = targetAbsPath + ext;
      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        const relPath = path.relative(projectRoot, fullPath);
        const fileId = `file://${relPath}`;
        // Ensure the node exists in our graph before linking
        if (this.graphStore.getNode(fileId)) {
          return fileId;
        }
      }
    }
    return null;
  }
}

module.exports = StaticScanner;
