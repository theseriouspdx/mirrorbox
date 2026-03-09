const db = require('./db-manager');
const { redact } = require('./redactor');
const crypto = require('crypto');

class EventStore {
  /**
   * Section 7: Append-only Event Store
   * Invariant 4: Every operation is reproducible from the event store.
   */
  append(stage, actor, payload) {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    
    // Invariant 8: Secrets never enter the persistent state
    const redactedPayload = redact(payload);
    const payloadStr = typeof redactedPayload === 'string' 
      ? redactedPayload 
      : JSON.stringify(redactedPayload);

    return db.transaction(() => {
      const lastEvent = db.get('SELECT id FROM events ORDER BY seq DESC LIMIT 1');
      const parent_event_id = lastEvent ? lastEvent.id : null;

      const result = db.run(`
        INSERT INTO events (id, timestamp, stage, actor, payload, hash, parent_event_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, timestamp, stage, actor, payloadStr, 'PENDING', parent_event_id]);
      
      const seq = result.lastInsertRowid;

      const envelope = JSON.stringify({
        id, seq, stage, actor, timestamp,
        parent_event_id: parent_event_id ?? null,
        payload: payloadStr
      });
      const hash = crypto.createHash('sha256').update(envelope).digest('hex');

      db.run('UPDATE events SET hash = ? WHERE seq = ?', [hash, seq]);
      db.run('INSERT OR REPLACE INTO chain_anchors (id, seq, event_id, hash) VALUES (1, ?, ?, ?)', [seq, id, hash]);

      return id;
    });
  }

  getChain() {
    return db.query('SELECT * FROM events ORDER BY seq ASC');
  }
}

module.exports = new EventStore();
