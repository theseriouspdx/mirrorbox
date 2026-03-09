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

    this.db.run(`
      INSERT INTO edges (source_id, target_id, relation, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
        source = excluded.source
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

  /**
   * Section 13: Formal Input Contract for GraphQueryResult
   */
  getGraphQueryResult(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return null;

    const impact = this.getImpact(nodeId);
    const callers = this.getCallers(nodeId);
    const dependencies = this.getDependencies(nodeId);

    // Simple subsystem heuristic: first directory under src/ or root
    const extractSubsystem = (p) => {
      const parts = p.split('/');
      return parts[0] === 'src' ? parts[1] : parts[0];
    };

    const affectedFiles = [...new Set(
      impact
        .map(edge => this.getNode(edge.id))
        .filter(n => n && n.type === 'file')
        .map(n => n.path)
    )];

    const subsystems = [...new Set(affectedFiles.map(extractSubsystem))];

    return {
      subsystems,
      affectedFiles,
      callers: callers.map(c => c.id),
      callees: dependencies.filter(d => d.relation === 'CALLS').map(d => d.id),
      coveringTests: this.db.query(`
        SELECT source_id FROM edges 
        WHERE target_id = ? AND relation = 'COVERS'
      `, [nodeId]).map(r => r.source_id),
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

  clearGraph() {
    this.db.transaction(() => {
      this.db.run('DELETE FROM edges');
      this.db.run('DELETE FROM nodes');
    });
  }
}

module.exports = GraphStore;
