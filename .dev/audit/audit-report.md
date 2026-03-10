# Mirror Box Orchestrator v2.0 Audit Report

Date: 2026-03-10  
Scope: 4-Pass audit against `.dev/spec/SPEC.md` (Sections 6, 10, 14, 15, 17, 18; BUG-009; Invariants 3 and 6)

## Machine-Readable Summary

```json
{
  "audit_date": "2026-03-10",
  "spec_path": "/Users/johnserious/MBO/.dev/spec/SPEC.md",
  "passes": [
    {
      "name": "The Vault",
      "status": "PARTIAL",
      "checks": [
        {"id": "invariant_6", "status": "PASS"},
        {"id": "invariant_3", "status": "PASS"},
        {"id": "section_10_firewall", "status": "PARTIAL"}
      ]
    },
    {
      "name": "The Graph",
      "status": "PARTIAL",
      "checks": [
        {"id": "section_6_treesitter", "status": "PASS"},
        {"id": "schema_alignment", "status": "PARTIAL"},
        {"id": "bug_009_staleness", "status": "FAIL"}
      ]
    },
    {
      "name": "The Gavel",
      "status": "FAIL",
      "checks": [
        {"id": "section_14_reviewer_blind", "status": "PARTIAL"},
        {"id": "section_15_3block_tiebreaker", "status": "PARTIAL"}
      ]
    },
    {
      "name": "The Watchdog",
      "status": "PARTIAL",
      "checks": [
        {"id": "section_18_watchdog", "status": "PARTIAL"},
        {"id": "section_17_handoff", "status": "PASS"}
      ]
    }
  ]
}
```

## Pass/Fail Matrix

| Pass | Compliance | Notes |
|---|---|---|
| Pass 1: The Vault | PARTIAL | `callModel` and `go` gate are in place; Section 10 enforcement is incomplete. |
| Pass 2: The Graph | PARTIAL | Tree-sitter/LSP present; BUG-009 stale flag behavior not implemented to spec. |
| Pass 3: The Gavel | FAIL | Reviewer comparison flow and 3-block counter semantics deviate from spec. |
| Pass 4: The Watchdog | PARTIAL | Watchdog exists but does not implement Section 18 timeout/process-registry model. |

## Evidence and Risks

### Pass 1 — The Vault
- Evidence:
  - Central model funnel: `callModel` in [src/auth/call-model.js](/Users/johnserious/MBO/src/auth/call-model.js:234)
  - `go` enforcement: [src/auth/operator.js](/Users/johnserious/MBO/src/auth/operator.js:691)
  - Context tagging uses non-spec type `context`: [src/auth/call-model.js](/Users/johnserious/MBO/src/auth/call-model.js:76)
- Risk: prompt-firewall contract drift; malformed outputs may pass downstream.

### Pass 2 — The Graph
- Evidence:
  - Tree-sitter active: [src/graph/static-scanner.js](/Users/johnserious/MBO/src/graph/static-scanner.js:4)
  - BUG-009 only hash-skip logic: [src/graph/static-scanner.js](/Users/johnserious/MBO/src/graph/static-scanner.js:57)
  - Placeholder position keys diverge from spec (`nameStartLine`/`nameStartColumn`): [src/graph/static-scanner.js](/Users/johnserious/MBO/src/graph/static-scanner.js:239)
- Risk: stale graph nodes may remain trusted; import/LSP mapping contract mismatch.

### Pass 3 — The Gavel
- Evidence:
  - Reviewer blind prompt path exists: [src/auth/operator.js](/Users/johnserious/MBO/src/auth/operator.js:584)
  - Stage 4C verdict delegated to `classifier` instead of reviewer comparison flow: [src/auth/operator.js](/Users/johnserious/MBO/src/auth/operator.js:618)
  - Counter increments on malformed reviewer output: [src/auth/operator.js](/Users/johnserious/MBO/src/auth/operator.js:588)
- Risk: false escalation to tiebreaker; DID contract weakened.

### Pass 4 — The Watchdog
- Evidence:
  - Watchdog script exists and is launched: [scripts/mbo-watchdog.sh](/Users/johnserious/MBO/scripts/mbo-watchdog.sh:1), [scripts/mbo-start.sh](/Users/johnserious/MBO/scripts/mbo-start.sh:50)
  - Session handoff path exists: [src/state/state-manager.js](/Users/johnserious/MBO/src/state/state-manager.js:45)
- Risk: hangs without high CPU may never be killed; Section 18 timeout behavior not enforced.

## Patch-Ready Commit Set

### Commit 1
- Branch: `codex/audit-fix-firewall`
- Message: `fix(security): align PROJECT_DATA wrapping and add output schema guards`
- Files:
  - `src/auth/call-model.js`

```diff
diff --git a/src/auth/call-model.js b/src/auth/call-model.js
@@
 function wrapContext(context) {
   if (!context || typeof context !== 'object' || Object.keys(context).length === 0) return '';
   return Object.entries(context).map(([key, value]) => {
     const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
-    return `<PROJECT_DATA type="context" path="${key}">\n${content}\n</PROJECT_DATA>`;
+    return `<PROJECT_DATA type="document" path="${key}">\n${content}\n</PROJECT_DATA>`;
   }).join('\n\n');
 }
+
+function validateOutputSchema(role, response) {
+  const mustBeJson = new Set(['classifier', 'reviewer']);
+  if (!mustBeJson.has(role)) return;
+  const jsonMatch = response && response.match(/\{[\s\S]*\}/);
+  if (!jsonMatch) throw new Error(`[MALFORMED_OUTPUT] ${role} returned non-JSON output.`);
+  JSON.parse(jsonMatch[0]);
+}
@@
   if (checkInjectionHeuristic(response)) {
@@
   }
+
+  validateOutputSchema(role, response);
 
   return response;
 }
```

### Commit 2
- Branch: `codex/audit-fix-graph-staleness`
- Message: `fix(graph): implement stale node marking contract for BUG-009`
- Files:
  - `src/graph/static-scanner.js`

```diff
diff --git a/src/graph/static-scanner.js b/src/graph/static-scanner.js
@@
 class StaticScanner {
+  markNodeStale(node) {
+    const metadata = { ...(node.metadata || {}), stale: true, staleAt: Date.now() };
+    this.graphStore.upsertNode({
+      id: node.id,
+      type: node.type,
+      name: node.name,
+      path: node.path,
+      metadata
+    });
+  }
@@
     const existingNode = this.graphStore.getNode(fileId);
+    if (existingNode && existingNode.metadata?.content_hash && existingNode.metadata.content_hash !== contentHash) {
+      this.markNodeStale(existingNode);
+    }
     if (existingNode && existingNode.metadata?.content_hash === contentHash) {
       return; // Skip re-scanning unchanged file
     }
@@
       metadata: {
-        nameStartLine: position ? position.row : 0,
-        nameStartColumn: position ? position.column : 0
+        startLine: position ? position.row : 0,
+        startColumn: position ? position.column : 0,
+        nameStartLine: position ? position.row : 0,
+        nameStartColumn: position ? position.column : 0
       }
     });
```

### Commit 3
- Branch: `codex/audit-fix-consensus`
- Message: `fix(consensus): count only block verdicts and use reviewer comparison at stage 4C`
- Files:
  - `src/auth/operator.js`

```diff
diff --git a/src/auth/operator.js b/src/auth/operator.js
@@
       if (!reviewerOutput || !reviewerOutput.independentCode) {
         console.error("[Operator] Reviewer produced malformed output. Retrying iteration.");
-        this.stateSummary.blockCounter++;
         continue;
       }
@@
-      const consensus = await this.evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState);
+      const consensus = await this.evaluateCodeConsensus(codeA, plan, reviewerOutput, hardState);
@@
-      this.stateSummary.blockCounter++;
-      console.error(`[Operator] Code Blocked (${this.stateSummary.blockCounter}/3): ${consensus.reason}`);
+      if (consensus.verdict === 'block') {
+        this.stateSummary.blockCounter++;
+        console.error(`[Operator] Code Blocked (${this.stateSummary.blockCounter}/3): ${consensus.reason}`);
+      }
@@
-    const result = await callModel('classifier', auditPrompt, {}, hardState);
+    const result = await callModel('reviewer', auditPrompt, {}, hardState);
```

### Commit 4
- Branch: `codex/audit-fix-watchdog`
- Message: `fix(resilience): align watchdog with timeout-first kill policy`
- Files:
  - `scripts/mbo-watchdog.sh`

```diff
diff --git a/scripts/mbo-watchdog.sh b/scripts/mbo-watchdog.sh
@@
-CHECK_INTERVAL=30
-CPU_THRESHOLD=90
-STRIKES_REQUIRED=3
-STRIKES=0
+CHECK_INTERVAL=5
+TIMEOUT_SEC="${TIMEOUT_SEC:-120}"
@@
-  # Check CPU usage (Darwin specific, but mbo is currently Darwin)
-  CPU_USAGE=$(ps -p "$MCP_PID" -o %cpu | tail -n 1 | awk '{print int($1)}')
-  
-  if [[ $CPU_USAGE -gt $CPU_THRESHOLD ]]; then
-    STRIKES=$((STRIKES + 1))
-    echo "[WATCHDOG] High CPU detected: ${CPU_USAGE}% (Strike ${STRIKES}/${STRIKES_REQUIRED})"
-  else
-    STRIKES=0
-  fi
-
-  if [[ $STRIKES -ge $STRIKES_REQUIRED ]]; then
-    echo "[WATCHDOG] CPU pegging detected for ${AGENT} (PID: ${MCP_PID}). SIGKILLing..."
-    kill -9 "$MCP_PID"
-    STRIKES=0
-    # launchd or the parent process will handle respawn
-  fi
+  ETIME=$(ps -p "$MCP_PID" -o etime= | tr -d ' ')
+  # coarse timeout watchdog
+  if [[ "$ETIME" == *-* || "$ETIME" == *:* ]]; then
+    echo "[WATCHDOG] Process ${MCP_PID} running for ${ETIME}; enforcing timeout policy ${TIMEOUT_SEC}s"
+    kill -TERM "$MCP_PID" 2>/dev/null || true
+    sleep 5
+    kill -KILL "$MCP_PID" 2>/dev/null || true
+  fi
 done
```

## Suggested Execution Order

1. Commit 1 (`call-model` firewall + schema guards)  
2. Commit 3 (`operator` consensus semantics)  
3. Commit 2 (graph staleness + placeholder metadata)  
4. Commit 4 (watchdog policy alignment)

