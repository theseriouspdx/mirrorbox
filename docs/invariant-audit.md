# Mirror Box Invariant Audit Suite

## Overview

The **External Invariant Test Suite** is a black-box validation layer that ensures Mirror Box Orchestrator (MBO) adheres to its core security and structural invariants defined in **SPEC Section 22**.

Milestone 1.0 (Production Alpha) requires these tests to pass before the orchestrator is permitted to develop its own codebase.

## Invariants Under Test

| Invariant | Name | Description |
|-----------|------|-------------|
| **Inv 1 & 2** | Project Protection | Verifies `src/` is read-only (555) and traversal is controlled. |
| **Inv 4** | Event Integrity | Verifies the append-only SHA-256 hash chain across all events. |
| **Inv 8** | Redaction | Ensures secrets (API keys, tokens) never enter the persistent state. |
| **Inv 10** | Entropy Tax | Enforces Max LOC (500), Complexity (15), and Nesting (3) limits. |
| **Inv 11** | Bootstrapping | Ensures `bin/validator.py` is present and active. |
| **Inv 13** | Atomic Backup | Topology-preserving backup to `.dev/bak/` before mutation. |
| **Inv 14** | Write-File Lock | Prohibits `write_file` for overwriting existing files. |

## Running the Audit

The suite is composed of several independent scripts that provide full coverage:

### 1. The Consolidated Invariant Suite
Checks file permissions, chain integrity (via Python verifier), and Entropy Tax.
```bash
node scripts/test-invariants.js
```

### 2. State & Redaction Audit
Verifies deterministic event ordering and secret redaction.
```bash
node scripts/test-state.js
```

### 3. Tamper-Proofing Proof
Demonstrates that the system detects and rejects manual database mutations.
```bash
node scripts/test-tamper-chain.js
```

### 4. Direct Chain Verification (Scale-Ready)
Audits the entire event store (millions of rows) using memory-efficient cursor iteration.
```bash
node scripts/verify-chain.js
```

## Troubleshooting Failures

### Hash Mismatches
If `verify-chain.js` reports hash mismatches after a schema update or logic change, use the re-hash tool to reconcile the database:
```bash
node scripts/rehash-events.js
```
*Note: This script re-links parent IDs and re-calculates hashes for all events in place.*

### Permission Denied
If Invariant 1 fails, Ensure the orchestrator session is closed:
```bash
mbo --revoke
```

## Maintenance

The audit tools are located in the `scripts/` directory. Any change to the **Canonical Event Envelope** in `src/state/event-store.js` MUST be synchronized with the envelopes in `scripts/verify-chain.js` and `scripts/rehash-events.js`.
