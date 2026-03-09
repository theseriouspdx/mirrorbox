const fs = require('fs');
const path = require('path');
const db = require('./db-manager');
const eventStore = require('./event-store');

const STATE_JSON_PATH = path.join(__dirname, '../../data/state.json');
const HANDOFF_MD_PATH = path.join(__dirname, '../../data/NEXT_SESSION.md');

class StateManager {
  /**
   * Section 17: State Persistence
   * Human-readable snapshot at every stage transition.
   */
  snapshot(summary) {
    fs.writeFileSync(STATE_JSON_PATH, JSON.stringify(summary, null, 2));
    eventStore.append(summary.currentStage || 'STATE', summary.activeModel || 'ORCHESTRATOR', summary);
  }

  /**
   * Section 17: Session Handoff
   * Generates NEXT_SESSION.md on clean shutdown.
   */
  generateHandoff(handoffData) {
    const { lastTask, completedCount, unresolvedIssues, suggestedNextTask } = handoffData;
    
    const content = `# NEXT_SESSION.md
## Mirror Box Orchestrator — Session Handoff

**Session ended:** ${new Date().toISOString().split('T')[0]}
**Last task:** ${lastTask.name} (${lastTask.status})
**Status:** ${lastTask.status === 'COMPLETED' ? 'Milestone Progressing' : 'Task Pending'}

---

## Section 1 — Next Action

**${suggestedNextTask || 'TBD'}**

---

## Section 2 — Session Summary

- Tasks completed this session: ${completedCount}
- Unresolved issues: ${unresolvedIssues.length > 0 ? unresolvedIssues.join(', ') : 'None'}

---

## Section 3 — Directory State
(Reconstructed from mirrorbox.db)
`;

    fs.writeFileSync(HANDOFF_MD_PATH, content);
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
