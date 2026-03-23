class GraphStore {
  /**
   * Section 6: Intelligence Graph
   * The authoritative structural map of the codebase.
   * Accepts a DBManager instance — not a singleton.
   */
  constructor(db) {
    this.db = db;
  }

  upsertNode(node) {
    const { id, type, name, path, metadata } = node;
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    this.db.run(`
      INSERT INTO nodes (id, type, name, path, metadata)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        name = excluded.name,
        path = excluded.path,
        metadata = excluded.metadata
    `, [id, type, name, path, metadataStr]);
  }

  upsertEdge(edge) {
    const { source_id, target_id, relation, source } = edge;

    // Section 22 Invariant 7: Ensure static edges do not overwrite runtime edges.
    this.db.run(`
      INSERT INTO edges (source_id, target_id, relation, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
        source = CASE 
          WHEN edges.source = 'runtime' THEN 'runtime'
          ELSE excluded.source 
        END
    `, [source_id, target_id, relation, source]);
  }

  /**
   * resolveImport: Atomic placeholder rewriting.
   * Required for Milestone 0.4B.
   */
  resolveImport(sourceId, placeholderId, realTargetId) {
    this.db.run(`
      UPDATE edges 
      SET target_id = ? 
      WHERE source_id = ? AND target_id = ? AND relation = 'IMPORTS'
    `, [realTargetId, sourceId, placeholderId]);
  }

  getNode(id) {
    const node = this.db.get('SELECT * FROM nodes WHERE id = ?', [id]);
    if (node && node.metadata) {
      node.metadata = JSON.parse(node.metadata);
    }
    return node;
  }

  /**
   * graph_query_impact: Given a node ID, return all nodes affected by a change.
   * Recursive search up to 3 degrees of separation.
   */
  getImpact(nodeId, maxDepth = 3) {
    const affected = new Set();
    const queue = [{ id: nodeId, depth: 0 }];
    const results = [];

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= maxDepth || affected.has(id)) continue;

      affected.add(id);

      const dependents = this.db.query(`
        SELECT source_id as id, relation, source
        FROM edges
        WHERE target_id = ?
      `, [id]);

      for (const dep of dependents) {
        if (!affected.has(dep.id)) {
          results.push(dep);
          queue.push({ id: dep.id, depth: depth + 1 });
        }
      }
    }

    return results;
  }

  getCallers(nodeId) {
    return this.db.query(`
      SELECT source_id as id, source
      FROM edges
      WHERE target_id = ? AND relation = 'CALLS'
    `, [nodeId]);
  }

  getDependencies(nodeId) {
    return this.db.query(`
      SELECT target_id as id, relation, source
      FROM edges
      WHERE source_id = ? AND relation IN ('IMPORTS', 'CALLS', 'DEPENDS_ON')
    `, [nodeId]);
  }

  getCoverage(nodeId) {
    return this.db.query(`
      SELECT source_id FROM edges 
      WHERE target_id = ? AND relation = 'COVERS'
    `, [nodeId]).map(r => r.source_id);
  }

  /**
   * Section 13: Formal Input Contract for GraphQueryResult
   */
  getGraphQueryResult(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return null;

    const impact = this.getImpact(nodeId);
    const callers = this.getCallers(nodeId);
    const dependencies = this.getDependencies(nodeId);
    const coveringTests = this.getCoverage(nodeId);

    // Section 13: Improved subsystem heuristic
    // Identifies the top-level directory of the node's file.
    const extractSubsystem = (p) => {
      const parts = p.split('/');
      if (parts.length > 1) {
        return parts[0] === 'src' ? parts[1] : parts[0];
      }
      return 'root';
    };

    const affectedNodes = impact.map(edge => this.getNode(edge.id)).filter(n => n !== null);
    const affectedFiles = [...new Set(
      affectedNodes
        .filter(n => n.type === 'file' || n.type === 'function' || n.type === 'class')
        .map(n => n.path)
    )];

    const subsystems = [...new Set(affectedFiles.map(extractSubsystem))];

    return {
      subsystems,
      affectedFiles,
      callers: callers.map(c => c.id),
      callees: dependencies.filter(d => d.relation === 'CALLS').map(d => d.id),
      coveringTests,
      dependencyChain: dependencies.map(d => d.id),
      runtimeEdges: [] // To be populated in Milestone 0.8
    };
  }

  search(pattern) {
    return this.db.query(`
      SELECT * FROM nodes
      WHERE name LIKE ? OR path LIKE ? OR id LIKE ?
    `, [`%${pattern}%`, `%${pattern}%`, `%${pattern}%`]);
  }

  /**
   * v0.12.01: Assemble a task-scoped knowledge pack.
   * anchor_nodes     — direct file nodes for files[]
   * dependency_nodes — 1-hop IMPORTS/DEPENDS_ON targets of anchors
   * spec_sections    — spec_section nodes whose name matches pattern
   * edges            — edges connecting the assembled node set
   * Deduplicates and trims to maxNodes (anchors preserved first).
   */
  getKnowledgePack(files, pattern, maxNodes = 40) {
    const cap = Math.min(maxNodes, 80);
    const nodeMap = new Map(); // id → node

    // 1. Anchor nodes
    for (const f of files) {
      const relPath = f.startsWith('file://') ? f.slice(7) : f;
      const nodeId = `file://${relPath}`;
      const node = this.getNode(nodeId);
      if (node) {
        if (node.metadata) node.metadata = typeof node.metadata === 'string'
          ? JSON.parse(node.metadata) : node.metadata;
        nodeMap.set(nodeId, { ...node, _role: 'anchor' });
      }
    }

    // 2. 1-hop dependency nodes (IMPORTS + DEPENDS_ON edges from anchors)
    const anchorIds = [...nodeMap.keys()];
    for (const anchorId of anchorIds) {
      if (nodeMap.size >= cap) break;
      const deps = this.db.query(
        `SELECT target_id as id FROM edges
         WHERE source_id = ? AND relation IN ('IMPORTS','DEPENDS_ON')`,
        [anchorId]
      );
      for (const dep of deps) {
        if (nodeMap.size >= cap) break;
        if (nodeMap.has(dep.id)) continue;
        const node = this.getNode(dep.id);
        if (node) {
          if (node.metadata) node.metadata = typeof node.metadata === 'string'
            ? JSON.parse(node.metadata) : node.metadata;
          nodeMap.set(dep.id, { ...node, _role: 'dependency' });
        }
      }
    }

    // 3. Spec sections matching pattern (only if budget remains)
    if (pattern && nodeMap.size < cap) {
      const specRows = this.db.query(
        `SELECT * FROM nodes WHERE type = 'spec_section' AND name LIKE ? LIMIT ?`,
        [`%${pattern}%`, cap - nodeMap.size]
      );
      for (const row of specRows) {
        if (nodeMap.has(row.id)) continue;
        if (row.metadata) row.metadata = typeof row.metadata === 'string'
          ? JSON.parse(row.metadata) : row.metadata;
        nodeMap.set(row.id, { ...row, _role: 'spec' });
      }
    }

    // 4. Edges within the assembled node set only (no orphan edges)
    const ids = [...nodeMap.keys()];
    const edges = ids.length > 1
      ? this.db.query(
          `SELECT source_id, target_id, relation, source FROM edges
           WHERE source_id IN (${ids.map(() => '?').join(',')})
           AND target_id IN (${ids.map(() => '?').join(',')})`,
          [...ids, ...ids]
        )
      : [];

    const tokenEstimate = Math.ceil(
      JSON.stringify([...nodeMap.values()]).length / 4
    );

    return {
      anchor_nodes:     [...nodeMap.values()].filter(n => n._role === 'anchor'),
      dependency_nodes: [...nodeMap.values()].filter(n => n._role === 'dependency'),
      spec_sections:    [...nodeMap.values()].filter(n => n._role === 'spec'),
      edges,
      token_estimate:   tokenEstimate,
      truncated:        nodeMap.size >= cap,
    };
  }

  clearGraph() {
    this.db.transaction(() => {
      this.db.run('DELETE FROM edges');
      this.db.run('DELETE FROM nodes');
    });
  }
}

module.exports = GraphStore;
