#!/usr/bin/env python3
import sqlite3
import json
import hashlib
import sys
import os
import platform
import getpass

# ── Rule 1: Environment Assertions ───────────────────────────────────────────
ENV_CHECKS = [
    {"label": "Platform is macOS", "ok": platform.system() == "Darwin", "detail": f"got {platform.system()}"},
    {"label": "Running as johnserious", "ok": getpass.getuser() == "johnserious", "detail": f"got {getpass.getuser()}"}
]

env_failed = False
print("── Environment checks ──────────────────────────────────────────")
for check in ENV_CHECKS:
    status = "PASS" if check["ok"] else "FAIL"
    detail = f" — {check['detail']}" if not check["ok"] else ""
    print(f"{status}  {check['label']}{detail}")
    if not check["ok"]:
        env_failed = True

if env_failed:
    print("\nEnvironment checks failed — aborting.\n")
    sys.exit(2)
print("── Environment OK — proceeding with chain verification ───────────\n")

DEFAULT_DB_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), '../.mbo/mirrorbox.db'),
    os.path.join(os.path.dirname(__file__), '../data/mirrorbox.db'),
]

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else next((p for p in DEFAULT_DB_CANDIDATES if os.path.exists(p)), DEFAULT_DB_CANDIDATES[0])

results = []
def record(label, ok):
    results.append({"label": label, "status": "PASS" if ok else "FAIL"})
    if ok:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}")

def verify_chain():
    print(f"Auditing Mirror Box Chain of Custody: {DB_PATH}\n")

    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)

    conn = None
    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        cursor = conn.cursor()

        cursor.execute("SELECT id, seq, stage, actor, timestamp, payload, hash, world_id, parent_event_id, prev_hash FROM events ORDER BY seq ASC")
        events = cursor.fetchall()

        if not events:
            record("Event store is empty (Valid State)", True)
            return

        expected_seq = 1
        errors = 0
        last_hash = None
        last_id = None

        for index, event in enumerate(events):
            e_id, e_seq, e_stage, e_actor, e_timestamp, e_payload, e_hash, e_world_id, e_parent_id, e_prev_hash = event

            # 1. Sequence continuity
            if e_seq != expected_seq:
                errors += 1
            expected_seq += 1

            # 2. Hash chaining
            if index > 0 and e_prev_hash != last_hash:
                errors += 1

            # 3. Hash integrity
            envelope = json.dumps({
                "id": e_id,
                "seq": e_seq,
                "stage": e_stage,
                "actor": e_actor,
                "timestamp": e_timestamp,
                "world_id": e_world_id,
                "parent_event_id": e_parent_id,
                "prev_hash": e_prev_hash,
                "payload": e_payload
            }, separators=(',', ':'), ensure_ascii=False)

            calculated_hash = hashlib.sha256(envelope.encode('utf-8')).hexdigest()
            if calculated_hash != e_hash:
                errors += 1

            last_id = e_id
            last_hash = e_hash

        record(f"Verified {len(events)} events (Hash Integrity)", errors == 0)

        # 5. Anchor verification
        cursor.execute("SELECT run_id, seq, event_id, hash FROM chain_anchors ORDER BY created_at DESC LIMIT 1")
        anchor = cursor.fetchone()
        anchor_ok = False
        if anchor:
            a_run_id, a_seq, a_event_id, a_hash = anchor
            anchor_ok = (a_hash == last_hash)
        
        record("Chain Anchor Alignment", anchor_ok)

        # ── Rule 5: Live Output Table ──────────────────────────────────────────
        print("\n── Chain Audit Summary Table ────────────────────────────────────")
        print("| Audit Check                                    | Status       |")
        print("| ---------------------------------------------- | ------------ |")
        for res in results:
            print(f"| {res['label']:<46} | {res['status']:<12} |")
        print("────────────────────────────────────────────────────────────────\n")

        if errors > 0 or not anchor_ok:
            sys.exit(1)

    except sqlite3.Error as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    verify_chain()
