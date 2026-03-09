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

    this.graphStore.upsertNode({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
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

    this.graphStore.upsertNode({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
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

        this.graphStore.upsertNode({
          id: sectionId,
          type: 'spec_section',
          name: title,
          path: relativePath,
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

          this.graphStore.upsertNode({
            id: symbolId,
            type: node.type.includes('class') ? 'class' : 'function',
            name: name,
            path: relativePath,
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
    const targetId = `import://${importPath}`;

    this.graphStore.upsertNode({
      id: targetId,
      type: 'placeholder',
      name: importPath,
      path: importPath,
      metadata: {
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
      let filePath;
      if (node.type === 'placeholder') {
        const edge = this.graphStore.db.get("SELECT source_id FROM edges WHERE target_id = ? AND relation = 'IMPORTS'", [node.id]);
        if (!edge) continue;
        filePath = edge.source_id.replace('file://', '');
      } else {
        filePath = node.path;
      }
      if (!nodesByFile.has(filePath)) nodesByFile.set(filePath, []);
      nodesByFile.get(filePath).push(node);
    }

    const clients = new Map();
    const missingLSPs = new Set();

    for (const [filePath, fileNodes] of nodesByFile) {
      const ext = path.extname(filePath);
      const lang = ext === '.py' ? 'python' : (ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript');
      
      if (!clients.has(lang)) {
        if (missingLSPs.has(lang)) continue;

        const cmd = detectServer(lang);
        if (!cmd) {
          console.warn(`[WARN] No LSP server found for ${lang}. Cross-file enrichment skipped for ${lang} files.`);
          missingLSPs.add(lang);
          clients.set(lang, null);
          continue;
        }
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

      const client = clients.get(lang);
      if (!client) continue;

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
}

module.exports = StaticScanner;
