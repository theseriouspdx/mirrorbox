const fs = require('fs');
const path = require('path');
const Parser = require('tree-sitter');
const JavaScript = require('tree-sitter-javascript');
const TypeScript = require('tree-sitter-typescript');
const Python = require('tree-sitter-python');

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
    const parser = this.parsers[ext];
    if (!parser) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const tree = parser.parse(content);
    const relativePath = path.relative(projectRoot, filePath);
    const fileId = `file://${relativePath}`;

    this.graphStore.upsertNode({
      id: fileId,
      type: 'file',
      name: path.basename(filePath),
      path: relativePath,
      metadata: { size: content.length }
    });

    this.extractSymbols(tree.rootNode, fileId, relativePath);
    this.extractImports(tree.rootNode, fileId);
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
          const symbolId = `${fileId}#${name}`;

          this.graphStore.upsertNode({
            id: symbolId,
            type: node.type.includes('class') ? 'class' : 'function',
            name: name,
            path: relativePath,
            metadata: {
              start: node.startPosition,
              end: node.endPosition
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
          this.recordImport(fileId, importPath);
        }
      }

      if (node.type === 'call_expression') {
        const fnNode = node.childForFieldName('function');
        if (fnNode && fnNode.text === 'require') {
          const argNode = node.childForFieldName('arguments')?.children.find(c => c.type === 'string');
          if (argNode) {
            const importPath = argNode.text.replace(/['"]/g, '');
            this.recordImport(fileId, importPath);
          }
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i));
      }
    };

    walk(rootNode);
  }

  recordImport(fileId, importPath) {
    // Raw string for now — LSP resolves paths in 0.4B.
    // Node must be upserted before edge to satisfy FK constraint.
    const targetId = `import://${importPath}`;

    this.graphStore.upsertNode({
      id: targetId,
      type: 'placeholder',
      name: importPath,
      path: importPath
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
    const defaultExclude = ['node_modules', '.git', '.dev'];
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
}

module.exports = StaticScanner;
