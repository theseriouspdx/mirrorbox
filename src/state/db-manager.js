const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '../../data/mirrorbox.db');

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
        FOREIGN KEY (source_id) REFERENCES nodes(id),
        FOREIGN KEY (target_id) REFERENCES nodes(id)
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

    const tableInfo = this.db.prepare('PRAGMA table_info(events)').all();
    const hasEventsTable = tableInfo.length > 0;
    const hasPrevHash = tableInfo.some(col => col.name === 'prev_hash');
    const hasWorldId = tableInfo.some(col => col.name === 'world_id');

    const anchorInfo = this.db.prepare('PRAGMA table_info(chain_anchors)').all();
    const hasRunId = anchorInfo.some(col => col.name === 'run_id');

    if (anchorInfo.length > 0 && !hasRunId) {
      // ... existing anchor migration ...
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

  logTokenUsage({ id, runId, role, model, inputTokens, outputTokens }) {
    try {
      this.db.prepare(`
        INSERT INTO token_log (id, run_id, role, model, input_tokens, output_tokens, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, runId || null, role, model, inputTokens || 0, outputTokens || 0, Date.now());
    } catch (e) {
      console.error('[token_log] Write failed (non-fatal):', e.message);
    }
  }

  getTokenUsage({ runId } = {}) {
    if (runId) {
      return this.db.prepare(
        'SELECT role, model, SUM(input_tokens) as input, SUM(output_tokens) as output FROM token_log WHERE run_id = ? GROUP BY role, model'
      ).all(runId);
    }
    return this.db.prepare(
      'SELECT role, model, SUM(input_tokens) as input, SUM(output_tokens) as output, COUNT(*) as calls FROM token_log GROUP BY role, model'
    ).all();
  }
}

// Default singleton for state/ modules (event store, state manager, etc.)
const defaultManager = new DBManager();
module.exports = defaultManager;
module.exports.DBManager = DBManager;
