const db = require('./db-manager');
const { redact } = require('./redactor');
const crypto = require('crypto');

const RUN_ID = crypto.randomUUID();

class EventStore {
  /**
   * Section 7: Append-only Event Store
   * Invariant 4: Every operation is reproducible from the event store.
   * Invariant 10: Every operation shall explicitly declare its target scope.
   */
  append(stage, actor, payload, worldId) {
    // Invariant 10: world_id must be 'mirror' or 'subject'. Reject unknowns.
    if (worldId !== 'mirror' && worldId !== 'subject') {
      throw new Error(`[INVARIANT VIOLATION] Invalid world_id: ${worldId}. Must be 'mirror' or 'subject'.`);
    }

    const targetWorld = worldId;
    // Invariant 8: Secrets never enter the persistent state
    const redactedPayload = redact(payload);
    const payloadStr = typeof redactedPayload === 'string' 
      ? redactedPayload 
      : JSON.stringify(redactedPayload);

    return db.transaction(() => {
      // 1. Immutable Data Generation inside transaction
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      
      // 2. Fetch previous event for chaining
      const lastEvent = db.get('SELECT id, hash, seq FROM events ORDER BY seq DESC LIMIT 1');
      const parent_event_id = lastEvent ? lastEvent.id : null;
      const prev_hash = lastEvent ? lastEvent.hash : null;
      const seq = lastEvent ? lastEvent.seq + 1 : 1;

      // 3. Compute final hash before INSERT (Eliminate PENDING state)
      // Section 7: Canonical envelope includes chaining fields
      const envelope = JSON.stringify({
        id,
        seq,
        stage,
        actor,
        timestamp,
        world_id: targetWorld,
        parent_event_id: parent_event_id ?? null,
        prev_hash: prev_hash ?? null,
        payload: payloadStr
      });
      const hash = crypto.createHash('sha256').update(envelope).digest('hex');

      // 4. Single Immutable INSERT
      db.run(`
        INSERT INTO events (id, seq, timestamp, stage, actor, payload, hash, world_id, parent_event_id, prev_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, seq, timestamp, stage, actor, payloadStr, hash, targetWorld, parent_event_id, prev_hash]);
      
      // Section 7: Chain Anchor update (run_id is the PK)
      db.run(`
        INSERT OR REPLACE INTO chain_anchors (run_id, seq, event_id, hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [RUN_ID, seq, id, hash, timestamp]);

      return id;
    });
  }

  getChain() {
    return db.query('SELECT * FROM events ORDER BY seq ASC');
  }
}

module.exports = new EventStore();
