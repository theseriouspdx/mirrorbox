const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/mirrorbox.db');
const db = new Database(DB_PATH);

console.log(`--- Re-hashing Event Store (with parent fix): ${DB_PATH} ---`);

const events = db.prepare('SELECT * FROM events ORDER BY seq ASC').all();
console.log(`Found ${events.length} events.`);

let prevHash = null;
let lastId = null;
let updatedCount = 0;

db.transaction(() => {
  for (const event of events) {
    // Construct canonical envelope per Section 7
    const envelope = JSON.stringify({
      id: event.id,
      seq: event.seq,
      stage: event.stage,
      actor: event.actor,
      timestamp: event.timestamp,
      world_id: event.world_id,
      parent_event_id: lastId, // Fix: use the actual id of the preceding event
      prev_hash: prevHash,
      payload: event.payload
    });

    const newHash = crypto.createHash('sha256').update(envelope).digest('hex');

    // We update every record to ensure structural integrity (parent_event_id) 
    // and hash compliance.
    db.prepare('UPDATE events SET hash = ?, prev_hash = ?, parent_event_id = ? WHERE id = ?')
      .run(newHash, prevHash, lastId, event.id);
    
    // Update chain_anchors for the final event or as needed
    db.prepare('UPDATE chain_anchors SET hash = ? WHERE event_id = ?').run(newHash, event.id);
    
    prevHash = newHash;
    lastId = event.id;
    updatedCount++;
  }
})();

console.log(`Update complete. ${updatedCount} events re-linked and re-hashed.`);
db.close();
