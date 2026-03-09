const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.argv[2] || path.join(__dirname, '../data/mirrorbox.db');

/**
 * Section 7: Audit Tool
 * Verifies Invariant 4: Every operation is reproducible from the event store.
 * Checks SHA-256 hashes, sequence continuity, and parent-child linkage.
 */
function verifyChain() {
  console.log(`Auditing Mirror Box Chain of Custody: ${DB_PATH}`);
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    const events = db.prepare('SELECT id, seq, stage, actor, timestamp, payload, hash, parent_event_id FROM events ORDER BY seq ASC').all();
    
    if (events.length === 0) {
      console.log('PASS: Event store is empty.');
      return;
    }

    let lastId = null;
    let expectedSeq = 1;
    let errors = 0;
    let maxSeq = 0;
    let lastHash = null;

    events.forEach((event, index) => {
      // 1. Verify Sequence Continuity
      if (event.seq !== expectedSeq) {
        console.error(`FAIL [Sequence Gap]: Expected seq ${expectedSeq}, found ${event.seq} (Event ${event.id})`);
        errors++;
      }
      expectedSeq++;
      maxSeq = event.seq;
      lastHash = event.hash;

      // 2. Verify Hash Integrity
      const envelope = JSON.stringify({
        id: event.id,
        seq: event.seq,
        stage: event.stage,
        actor: event.actor,
        timestamp: event.timestamp,
        parent_event_id: event.parent_event_id,
        payload: event.payload
      });
      const calculatedHash = crypto.createHash('sha256').update(envelope).digest('hex');
      if (calculatedHash !== event.hash) {
        console.error(`FAIL [Hash Mismatch]: Event ${event.id} (seq ${event.seq})`);
        errors++;
      }

      // 3. Verify Parent Linkage
      if (index > 0 && event.parent_event_id !== lastId) {
        console.error(`FAIL [Broken Link]: Event ${event.id} refers to parent ${event.parent_event_id}, expected ${lastId}`);
        errors++;
      }

      lastId = event.id;
    });

    // 4. Verify Anchor
    const anchor = db.prepare('SELECT seq, event_id, hash FROM chain_anchors WHERE id = 1').get();
    if (!anchor) {
      console.error(`FAIL [Missing Anchor]: No anchor found in chain_anchors.`);
      errors++;
    } else if (anchor.seq !== maxSeq || anchor.hash !== lastHash || anchor.event_id !== lastId) {
      console.error(`FAIL [Anchor Mismatch]: Anchor points to seq ${anchor.seq} (hash ${anchor.hash}), but chain ends at seq ${maxSeq} (hash ${lastHash}).`);
      errors++;
    }

    if (errors === 0) {
      console.log(`PASS: Verified ${events.length} events in the chain, ending at seq ${maxSeq}.`);
    } else {
      console.error(`FAILED: ${errors} integrity errors found.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

verifyChain();
