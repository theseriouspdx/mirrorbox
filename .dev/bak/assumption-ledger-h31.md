# Section 27 Assumption Ledger

**Task:** 1.1-H31 — Fix Scan Health Regression

| ID | Assumption | Rationale | Risk |
|----|------------|-----------|------|
| A01 | `FOREIGN KEY constraint failed` is caused by `DELETE FROM nodes` on symbols with incoming edges. | Direct observation of scan failures and dependency analysis in `src/index.js`. | Low |
| A02 | `ON DELETE CASCADE` on `edges` foreign keys will safely prune stale edges when their target nodes are deleted. | Standard relational pattern for graph/tree structures in SQLite. | Low |
| A03 | The migration logic in `DBManager` should be non-destructive and idempotent. | Necessary to prevent data loss in existing project databases. | Medium |
| A04 | `better-sqlite3` enforces foreign keys once they are enabled via `PRAGMA foreign_keys=on`, even if not enabled globally. | Verified via `check-fk.js` script. | Low |
| A05 | Enrichment (LSP) re-adds resolved edges, so `CASCADE` won't permanently lose dependency data. | `enrich()` runs after `scanDirectorySafe` completes its file scans. | Low |
