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
      WHERE source_id = ?
    `, [nodeId]);
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
