const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');

class DBManager {
  constructor(dbPath = null) {
    this.db = null;
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    this.initialize();
  }

  initialize() {
    const targetPath = this.dbPath;
    if (!fs.existsSync(path.dirname(targetPath))) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    }

    try {
      this.db = new Database(targetPath);

      // Section 17: Integrity Check
      const integrityResult = this.db.prepare('PRAGMA integrity_check').get();
      if (integrityResult.integrity_check !== 'ok') {
        throw new Error(`Integrity check failed: ${JSON.stringify(integrityResult)}`);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`DB corruption in production — operator action required: ${error.message}`);
      }
      console.error('[WARN] Dev mode: corrupt DB renamed, starting fresh.', error.message);
      if (fs.existsSync(targetPath)) {
        fs.renameSync(targetPath, `${targetPath}.corrupt.${Date.now()}`);
      }
      this.db = new Database(targetPath);
    }

    this.createSchema();
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chain_anchors (
        run_id     TEXT PRIMARY KEY,
        seq        INTEGER NOT NULL,
        event_id   TEXT NOT NULL,
        hash       TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS onboarding_profiles (
        version INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS nodes (
        id       TEXT PRIMARY KEY,
        type     TEXT NOT NULL,
        name     TEXT NOT NULL,
        path     TEXT NOT NULL,
        content  TEXT CONSTRAINT token_cap CHECK (LENGTH(content) <= 4000),
        metadata TEXT, -- JSON blob
        -- Virtual columns for performance indexing of coordinates
        nameStartLine INTEGER GENERATED ALWAYS AS (json_extract(metadata, '$.nameStartLine')) VIRTUAL,
        nameStartColumn INTEGER GENERATED ALWAYS AS (json_extract(metadata, '$.nameStartColumn')) VIRTUAL
      );

      CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        relation  TEXT NOT NULL,
        source    TEXT NOT NULL, -- 'static' or 'runtime'
        PRIMARY KEY (source_id, target_id, relation),
        FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);

      CREATE TABLE IF NOT EXISTS token_log (
        id           TEXT PRIMARY KEY,
        run_id       TEXT,
        role         TEXT NOT NULL,
        model        TEXT NOT NULL,
        input_tokens  INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd      REAL NOT NULL DEFAULT 0,
        raw_tokens_estimate INTEGER NOT NULL DEFAULT 0,
        raw_cost_estimate   REAL NOT NULL DEFAULT 0,
        timestamp    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id        TEXT PRIMARY KEY,
        label     TEXT NOT NULL,
        snapshot  TEXT NOT NULL,
        world_id  TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id          TEXT PRIMARY KEY,
        task_id     TEXT NOT NULL,
        verdict     TEXT,  -- 'pass' | 'fail' | 'partial'
        notes       TEXT,
        attempt     INTEGER NOT NULL DEFAULT 1,
        timestamp   INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_token_log_run ON token_log(run_id);
      CREATE INDEX IF NOT EXISTS idx_token_log_role ON token_log(role);

      CREATE TABLE IF NOT EXISTS tool_token_log (
        id               TEXT PRIMARY KEY,
        session_id       TEXT,
        agent            TEXT NOT NULL,
        tool_name        TEXT NOT NULL,
        estimated_tokens INTEGER NOT NULL DEFAULT 0,
        timestamp        INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_token_log_session ON tool_token_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_token_log_agent  ON tool_token_log(agent);

      CREATE TABLE IF NOT EXISTS server_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Legacy migration: older nodes table lacks virtual coordinate columns.
    const nodesInfo = this.db.prepare('PRAGMA table_xinfo(nodes)').all();
    const hasNodesTable = nodesInfo.length > 0;
    const hasNameStartLine = nodesInfo.some(col => col.name === 'nameStartLine');
    const hasNameStartColumn = nodesInfo.some(col => col.name === 'nameStartColumn');
    const hasContent = nodesInfo.some(col => col.name === 'content');
    const nodesSqlRow = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nodes'").get();
    const hasTokenCapConstraint = !!(nodesSqlRow && nodesSqlRow.sql && /token_cap\s+CHECK\s*\(LENGTH\(content\)\s*<=\s*4000\)/i.test(nodesSqlRow.sql));

    if (hasNodesTable && (!hasNameStartLine || !hasNameStartColumn || !hasContent || !hasTokenCapConstraint)) {
      this.db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        -- Section 17: Non-destructive migration using temporary storage
        CREATE TABLE nodes_migration AS SELECT * FROM nodes;
        
        DROP TABLE nodes;
        
        CREATE TABLE nodes (
          id       TEXT PRIMARY KEY,
          type     TEXT NOT NULL,
          name     TEXT NOT NULL,
          path     TEXT NOT NULL,
          content  TEXT CONSTRAINT token_cap CHECK (LENGTH(content) <= 4000),
          metadata TEXT,
          nameStartLine INTEGER GENERATED ALWAYS AS (json_extract(metadata, '$.nameStartLine')) VIRTUAL,
          nameStartColumn INTEGER GENERATED ALWAYS AS (json_extract(metadata, '$.nameStartColumn')) VIRTUAL
        );
        
        INSERT INTO nodes (id, type, name, path, content, metadata)
          SELECT id, type, name, path, ${hasContent ? 'content' : 'NULL'}, metadata FROM nodes_migration;
          
        DROP TABLE nodes_migration;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
        CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      `);
    }

    const nodesInfoAfter = this.db.prepare('PRAGMA table_xinfo(nodes)').all();
    const hasCoordsAfter = nodesInfoAfter.some(col => col.name === 'nameStartLine')
      && nodesInfoAfter.some(col => col.name === 'nameStartColumn');
    if (hasCoordsAfter) {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_coords ON nodes(path, nameStartLine, nameStartColumn)');
    }

    // Task 1.1-H31: Migration to add ON DELETE CASCADE to edges table.
    const edgesSqlRow = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'edges'").get();
    const hasCascade = !!(edgesSqlRow && edgesSqlRow.sql && /ON DELETE CASCADE/i.test(edgesSqlRow.sql));

    if (edgesSqlRow && !hasCascade) {
      this.db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        -- Section 17: Non-destructive migration using temporary storage
        CREATE TABLE edges_migration AS SELECT * FROM edges;
        DROP TABLE edges;
        CREATE TABLE edges (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation  TEXT NOT NULL,
          source    TEXT NOT NULL,
          PRIMARY KEY (source_id, target_id, relation),
          FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
        );
        INSERT INTO edges (source_id, target_id, relation, source)
          SELECT source_id, target_id, relation, source FROM edges_migration;
        DROP TABLE edges_migration;
        COMMIT;
        PRAGMA foreign_keys=on;
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
      `);
    }

    const tableInfo = this.db.prepare('PRAGMA table_info(events)').all();

    const hasEventsTable = tableInfo.length > 0;
    const hasPrevHash = tableInfo.some(col => col.name === 'prev_hash');
    const hasWorldId = tableInfo.some(col => col.name === 'world_id');

    const tokenLogInfo = this.db.prepare('PRAGMA table_info(token_log)').all();
    const hasCostUsd = tokenLogInfo.some(col => col.name === 'cost_usd');
    const hasRawTokens = tokenLogInfo.some(col => col.name === 'raw_tokens_estimate');
    const hasRawCost = tokenLogInfo.some(col => col.name === 'raw_cost_estimate');

    if (tokenLogInfo.length > 0 && (!hasCostUsd || !hasRawTokens || !hasRawCost)) {
      this.db.exec(`
        ALTER TABLE token_log ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0;
        ALTER TABLE token_log ADD COLUMN raw_tokens_estimate INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE token_log ADD COLUMN raw_cost_estimate REAL NOT NULL DEFAULT 0;
      `);
    }

    if (!hasEventsTable) {
      this.db.exec(`
        CREATE TABLE events (
          seq             INTEGER PRIMARY KEY AUTOINCREMENT,
          id              TEXT UNIQUE NOT NULL,
          timestamp       INTEGER NOT NULL,
          stage           TEXT NOT NULL,
          actor           TEXT NOT NULL,
          payload         TEXT NOT NULL,
          hash            TEXT NOT NULL,
          world_id        TEXT NOT NULL DEFAULT 'mirror',
          parent_event_id TEXT,
          prev_hash       TEXT,
          FOREIGN KEY(parent_event_id) REFERENCES events(id)
        );
      `);
    } else if (!hasPrevHash || !hasWorldId) {
      this.db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        DROP TABLE IF EXISTS events_new;
        CREATE TABLE events_new (
          seq             INTEGER PRIMARY KEY AUTOINCREMENT,
          id              TEXT UNIQUE NOT NULL,
          timestamp       INTEGER NOT NULL,
          stage           TEXT NOT NULL,
          actor           TEXT NOT NULL,
          payload         TEXT NOT NULL,
          hash            TEXT NOT NULL,
          world_id        TEXT NOT NULL DEFAULT 'mirror',
          parent_event_id TEXT,
          prev_hash       TEXT,
          FOREIGN KEY(parent_event_id) REFERENCES events(id)
        );
        INSERT INTO events_new (id, timestamp, stage, actor, payload, hash, world_id, parent_event_id, prev_hash)
          SELECT id, timestamp, stage, actor, payload, hash, ${hasWorldId ? 'world_id' : "'mirror'"}, parent_event_id, ${hasPrevHash ? 'prev_hash' : 'NULL'}
          FROM events ORDER BY seq ASC;
        DROP TABLE events;
        ALTER TABLE events_new RENAME TO events;
        COMMIT;
        PRAGMA foreign_keys=on;
      `);
    }
  }

  transaction(fn) {
    return this.db.transaction(fn)();
  }

  query(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  run(sql, params = []) {
    return this.db.prepare(sql).run(...params);
  }

  logTokenUsage({ id, runId, role, model, inputTokens, outputTokens, costUsd, rawTokensEstimate, rawCostEstimate }) {
    try {
      this.db.prepare(`
        INSERT INTO token_log (id, run_id, role, model, input_tokens, output_tokens, cost_usd, raw_tokens_estimate, raw_cost_estimate, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, runId || null, role, model, inputTokens || 0, outputTokens || 0, costUsd || 0, rawTokensEstimate || 0, rawCostEstimate || 0, Date.now());
    } catch (e) {
      console.error('[token_log] Write failed (non-fatal):', e.message);
    }
  }

  getTokenUsage({ runId } = {}) {
    if (runId) {
      return this.db.prepare(
        'SELECT role, model, SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(cost_usd) as cost, SUM(raw_tokens_estimate) as raw_tokens, SUM(raw_cost_estimate) as raw_cost FROM token_log WHERE run_id = ? GROUP BY role, model'
      ).all(runId);
    }
    return this.db.prepare(
      'SELECT role, model, SUM(input_tokens) as input, SUM(output_tokens) as output, SUM(cost_usd) as cost, SUM(raw_tokens_estimate) as raw_tokens, SUM(raw_cost_estimate) as raw_cost, COUNT(*) as calls FROM token_log GROUP BY role, model'
    ).all();
  }

  logToolUsage({ id, sessionId, agent, toolName, estimatedTokens }) {
    try {
      this.db.prepare(`
        INSERT INTO tool_token_log (id, session_id, agent, tool_name, estimated_tokens, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, sessionId || null, agent, toolName, estimatedTokens || 0, Date.now());
    } catch (e) {
      console.error('[tool_token_log] Write failed (non-fatal):', e.message);
    }
  }

  getToolTokenSummary({ sessionId } = {}) {
    try {
      const where = sessionId ? 'WHERE session_id = ?' : '';
      const params = sessionId ? [sessionId] : [];
      const rows = this.db.prepare(
        `SELECT tool_name, agent, SUM(estimated_tokens) AS tokens, COUNT(*) AS calls
         FROM tool_token_log ${where} GROUP BY tool_name, agent ORDER BY tokens DESC`
      ).all(...params);
      return { rows, total: rows.reduce((s, r) => s + (r.tokens || 0), 0) };
    } catch (_) {
      return { rows: [], total: 0 };
    }
  }

  /**
   * v0.12.01: Cross-agent cost rollup and counterfactual routing savings.
   * Groups token_log by model, computes actual total cost, then calculates a
   * counterfactual cost (what this run would have cost if every callModel
   * invocation used the most expensive model present in the set).
   *
   * @returns {{ byModel, actualCost, counterfactualCost, routingSavings, maxRateModel, totalCalls }}
   */
  getCostRollup() {
    const rows = this.db.prepare(`
      SELECT
        model,
        SUM(input_tokens)        AS total_input,
        SUM(output_tokens)       AS total_output,
        SUM(cost_usd)            AS actual_cost,
        SUM(raw_cost_estimate)   AS raw_cost,
        COUNT(*)                 AS calls
      FROM token_log
      GROUP BY model
      ORDER BY actual_cost DESC
    `).all();

    const byModel = rows.map(r => ({
      model:       r.model,
      totalInput:  r.total_input  || 0,
      totalOutput: r.total_output || 0,
      actualCost:  r.actual_cost  || 0,
      rawCost:     r.raw_cost     || 0,
      calls:       r.calls        || 0,
    }));

    const actualCost = byModel.reduce((s, r) => s + r.actualCost, 0);
    const totalCalls = byModel.reduce((s, r) => s + r.calls, 0);

    // BUG-155: Project highest UNIT rate (USD/1k tokens) to avoid task-size bias.
    let maxRatePer1k = 0;
    let maxRateModel   = 'unknown';
    for (const r of byModel) {
      const totalTokens = r.totalInput + r.totalOutput;
      if (totalTokens > 0) {
        const rate = (r.actualCost / totalTokens) * 1000;
        if (rate > maxRatePer1k) {
          maxRatePer1k = rate;
          maxRateModel   = r.model;
        }
      }
    }

    const totalSessionTokens = byModel.reduce((s, r) => s + r.totalInput + r.totalOutput, 0);
    const counterfactualCost = (maxRatePer1k / 1000) * totalSessionTokens;
    const routingSavings     = Math.max(0, counterfactualCost - actualCost);

    return { byModel, actualCost, counterfactualCost, routingSavings, maxRateModel, totalCalls };
  }

  // ─── Server Meta (Task 1.1-10: Graph Trust Contract) ──────────────────────

  getServerMeta(key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM server_meta WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  setServerMeta(key, value) {
    this.db.prepare(
      'INSERT INTO server_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }

  // Atomically increments index_revision and updates last_indexed_at.
  // Returns the new revision number. Called only after a successful scan completes.
  incrementIndexRevision() {
    const current = parseInt(this.getServerMeta('index_revision', '0'), 10);
    const next = current + 1;
    this.setServerMeta('index_revision', next);
    this.setServerMeta('last_indexed_at', new Date().toISOString());
    return next;
  }
}

// Default singleton for state/ modules (event store, state manager, etc.)
const defaultManager = new DBManager();
module.exports = defaultManager;
module.exports.DBManager = DBManager;
