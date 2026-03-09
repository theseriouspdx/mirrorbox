const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/mirrorbox.db');

class DBManager {
  constructor() {
    this.db = null;
    this.initialize();
  }

  initialize() {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }

    try {
      this.db = new Database(DB_PATH);
      
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
      if (fs.existsSync(DB_PATH)) {
        fs.renameSync(DB_PATH, `${DB_PATH}.corrupt.${Date.now()}`);
      }
      this.db = new Database(DB_PATH);
    }

    this.createSchema();
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chain_anchors (
        id       INTEGER PRIMARY KEY CHECK (id = 1),
        seq      INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        hash     TEXT NOT NULL
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
    `);

    const tableInfo = this.db.prepare('PRAGMA table_info(events)').all();
    const hasEventsTable = tableInfo.length > 0;
    const hasSeq = tableInfo.some(col => col.name === 'seq');
    const hasPrevHash = tableInfo.some(col => col.name === 'prev_hash');

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
      // Handle upgrade for seq and prev_hash simultaneously
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
        -- Migrating existing data; prev_hash will be null for migrated records
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

module.exports = new DBManager();
