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
      CREATE INDEX IF NOT EXISTS idx_nodes_coords ON nodes(path, nameStartLine, nameStartColumn);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
    `);

    const tableInfo = this.db.prepare('PRAGMA table_info(events)').all();
    const hasEventsTable = tableInfo.length > 0;
    const hasPrevHash = tableInfo.some(col => col.name === 'prev_hash');

    const anchorInfo = this.db.prepare('PRAGMA table_info(chain_anchors)').all();
    const hasRunId = anchorInfo.some(col => col.name === 'run_id');

    if (anchorInfo.length > 0 && !hasRunId) {
      this.db.exec(`
        PRAGMA foreign_keys=off;
        BEGIN TRANSACTION;
        DROP TABLE IF EXISTS chain_anchors_new;
        CREATE TABLE chain_anchors_new (
          run_id     TEXT PRIMARY KEY,
          seq        INTEGER NOT NULL,
          event_id   TEXT NOT NULL,
          hash       TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        INSERT INTO chain_anchors_new (run_id, seq, event_id, hash, created_at)
          SELECT 'migration-seed', seq, event_id, hash, strftime('%s', 'now') * 1000
          FROM chain_anchors;
        DROP TABLE chain_anchors;
        ALTER TABLE chain_anchors_new RENAME TO chain_anchors;
        COMMIT;
        PRAGMA foreign_keys=on;
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
          parent_event_id TEXT,
          prev_hash       TEXT,
          FOREIGN KEY(parent_event_id) REFERENCES events(id)
        );
      `);
    } else if (!hasPrevHash) {
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
          parent_event_id TEXT,
          prev_hash       TEXT,
          FOREIGN KEY(parent_event_id) REFERENCES events(id)
        );
        INSERT INTO events_new (id, timestamp, stage, actor, payload, hash, parent_event_id)
          SELECT id, timestamp, stage, actor, payload, hash, parent_event_id
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
}

// Default singleton for state/ modules (event store, state manager, etc.)
const defaultManager = new DBManager();
module.exports = defaultManager;
module.exports.DBManager = DBManager;
