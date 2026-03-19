const fs = require('fs');
const path = require('path');
const db = require('./db-manager');
const eventStore = require('./event-store');
const { randomUUID } = require('crypto');

function getRuntimeRoot() {
  return path.resolve(process.env.MBO_PROJECT_ROOT || process.cwd());
}

function getControllerRoot() {
  return path.resolve(__dirname, '../..');
}

function getStatePath() {
  return path.join(getRuntimeRoot(), 'data/state.json');
}

class StateManager {
  /**
   * Invariant 13: Immutable Pre-Mutation Checkpoint
   * Required before any mutation in either world.
   */
  checkpoint(worldId) {
    // Invariant 13: world_id must be 'mirror' or 'subject'.
    if (worldId !== 'mirror' && worldId !== 'subject') {
      throw new Error(`[INVARIANT VIOLATION] Invalid world_id: ${worldId}. Must be 'mirror' or 'subject'.`);
    }

    const snapshot = JSON.stringify(this.recover() || {});
    const id = randomUUID();

    db.run(`
      INSERT INTO checkpoints (id, label, snapshot, world_id, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [id, `checkpoint-${Date.now()}`, snapshot, worldId, Date.now()]);

    const lastEvent = db.get('SELECT id, hash, seq FROM events ORDER BY seq DESC LIMIT 1');
    const checkpoint = {
      checkpointId: id,
      worldId,
      timestamp: Date.now(),
      parentHash: lastEvent ? lastEvent.hash : 'anchor',
      parentSeq: lastEvent ? lastEvent.seq : 0,
      snapshotSize: snapshot.length
    };
    eventStore.append('CHECKPOINT', 'state-manager', checkpoint, worldId);
    return checkpoint;
  }

  rollback(checkpointId) {
    const row = db.get('SELECT snapshot FROM checkpoints WHERE id = ?', [checkpointId]);
    if (!row) throw new Error(`Checkpoint ${checkpointId} not found.`);
    const state = JSON.parse(row.snapshot);
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
    eventStore.append('ROLLBACK', 'state-manager', { checkpointId }, 'mirror');
  }

  /**
   * Section 17: State Persistence
   * Human-readable snapshot at every stage transition.
   */
  snapshot(summary, worldId = 'mirror') {
    if (worldId !== 'mirror' && worldId !== 'subject') {
      throw new Error(`[INVARIANT VIOLATION] Invalid world_id: ${worldId}. Must be 'mirror' or 'subject'.`);
    }
    const statePath = getStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(statePath, JSON.stringify(summary, null, 2));
    eventStore.append(summary.currentStage || 'STATE', summary.activeModel || 'ORCHESTRATOR', summary, worldId);
  }

  /**
   * Section 17: Session Handoff
   * Triggers the session-close script to generate timestamped handoff artifacts and backups.
   */
  generateHandoff() {
    const { spawnSync } = require('child_process');
    const scriptPath = path.join(getControllerRoot(), 'scripts/mbo-session-close.sh');
    const result = spawnSync('bash', [scriptPath], {
      stdio: 'inherit',
      env: { ...process.env, MBO_PROJECT_ROOT: getRuntimeRoot() }
    });
    if (result.error || result.status !== 0) {
      console.error(`[StateManager] Handoff failed: ${result.error || result.status}`);
    }
  }

  /**
   * Section 17: Recovery
   * Reconstruct current session state from DB if handoff is missing.
   */
  recover() {
    const snap = db.get(
      "SELECT payload FROM events WHERE stage = 'STATE' ORDER BY seq DESC LIMIT 1"
    );
    if (!snap) return { ok: false, reason: 'no_snapshot' };
    const state = JSON.parse(snap.payload);
    if (!state.currentTask || !state.currentStage) {
      return { ok: false, reason: 'invalid_snapshot_schema' };
    }
    return state;
  }
}

module.exports = new StateManager();
