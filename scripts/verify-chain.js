const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.argv[2] || path.join(process.env.MBO_PROJECT_ROOT || process.cwd(), '.mbo', 'mirrorbox.db');

/**
 * Section 7: Audit Tool
 * Verifies Invariant 4: Every operation is reproducible from the event store.
 * Checks SHA-256 hashes, sequence continuity, and hash chaining (prev_hash).
 * Scaled for multi-million row databases via cursor iteration.
 */
function verifyChain() {
  console.log(`Auditing Mirror Box Chain of Custody: ${DB_PATH}`);
  const db = new Database(DB_PATH, { readonly: true });

  try {
    const statement = db.prepare('SELECT id, seq, stage, actor, timestamp, payload, hash, world_id, parent_event_id, prev_hash FROM events ORDER BY seq ASC');

    let lastId = null;
    let expectedSeq = 1;
    let errors = 0;
    let maxSeq = 0;
    let lastHash = null;
    let count = 0;

    for (const event of statement.iterate()) {
      // 1. Verify Sequence Continuity
      if (event.seq !== expectedSeq) {
        console.error(`\nFAIL [Sequence Gap]: Expected seq ${expectedSeq}, found ${event.seq} (Event ${event.id})`);
        errors++;
      }
      expectedSeq++;
      maxSeq = event.seq;

      // 2. Verify Hash Chaining
      if (count === 0) {
        if (event.prev_hash !== null) {
          console.error(`\nFAIL [Root Chain]: Root event ${event.id} should have prev_hash null, found ${event.prev_hash}`);
          errors++;
        }
      } else {
        if (event.prev_hash !== lastHash) {
          console.error(`\nFAIL [Chain Breach]: Event ${event.id} (seq ${event.seq}) refers to prev_hash ${event.prev_hash}, expected ${lastHash}`);
          errors++;
        }
      }

      // 3. Verify Hash Integrity
      const envelope = JSON.stringify({
        id: event.id,
        seq: event.seq,
        stage: event.stage,
        actor: event.actor,
        timestamp: event.timestamp,
        world_id: event.world_id,
        parent_event_id: event.parent_event_id ?? null,
        prev_hash: event.prev_hash ?? null,
        payload: event.payload
      });
      const calculatedHash = crypto.createHash('sha256').update(envelope).digest('hex');
      if (calculatedHash !== event.hash) {
        console.error(`\nFAIL [Hash Mismatch]: Event ${event.id} (seq ${event.seq})`);
        errors++;
      }

      // 4. Verify Parent Linkage
      if (count > 0 && event.parent_event_id !== lastId) {
        console.error(`\nFAIL [Broken Link]: Event ${event.id} refers to parent ${event.parent_event_id}, expected ${lastId}`);
        errors++;
      }

      lastId = event.id;
      lastHash = event.hash;
      count++;

      if (count % 50000 === 0) {
        process.stderr.write(`\rVerified ${count} events...`);
      }
    }

    process.stderr.write(`\rVerification complete. Checking anchor...\n`);

    if (count === 0) {
      console.log('PASS: Event store is empty.');
      return;
    }

    // 5. Verify Anchor — uses run_id PK (migrated schema)
    const anchor = db.prepare('SELECT run_id, seq, event_id, hash FROM chain_anchors ORDER BY created_at DESC LIMIT 1').get();
    if (!anchor) {
      console.error(`FAIL [Missing Anchor]: No anchor found in chain_anchors.`);
      errors++;
    } else if (anchor.hash !== lastHash) {
      console.error(`FAIL [Anchor Mismatch]: Anchor hash ${anchor.hash.slice(0,12)} does not match chain tail hash ${lastHash.slice(0,12)}.`);
      errors++;
    }

    if (errors === 0) {
      console.log(`PASS: Verified ${count} events. Chain intact from seq 1 → ${maxSeq}.`);
      console.log(`Anchor run_id: ${anchor.run_id} | tail hash: ${lastHash.slice(0,16)}...`);
    } else {
      console.error(`FAILED: ${errors} integrity error(s) found.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\nERROR: ${error.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

verifyChain();
