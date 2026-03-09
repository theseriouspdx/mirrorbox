import sqlite3
import json
import hashlib
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '../data/mirrorbox.db')

def verify_chain():
    print(f"Auditing Mirror Box Chain of Custody: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)

    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        cursor.execute("SELECT id, seq, stage, actor, timestamp, payload, hash, parent_event_id, prev_hash FROM events ORDER BY seq ASC")
        events = cursor.fetchall()

        if not events:
            print("PASS: Event store is empty.")
            return

        last_id = None
        expected_seq = 1
        errors = 0
        max_seq = 0
        last_hash = None

        for index, event in enumerate(events):
            e_id, e_seq, e_stage, e_actor, e_timestamp, e_payload, e_hash, e_parent_id, e_prev_hash = event
            
            # 1. Verify Sequence Continuity
            if e_seq != expected_seq:
                print(f"FAIL [Sequence Gap]: Expected seq {expected_seq}, found {e_seq} (Event {e_id})")
                errors += 1
            expected_seq += 1
            max_seq = e_seq

            # 2. Verify Hash Chaining
            if index == 0:
                if e_prev_hash is not None:
                    print(f"FAIL [Root Chain]: Root event {e_id} should have prev_hash null, found {e_prev_hash}")
                    errors += 1
            else:
                if e_prev_hash != last_hash:
                    print(f"FAIL [Chain Breach]: Event {e_id} (seq {e_seq}) refers to prev_hash {e_prev_hash}, expected {last_hash}")
                    errors += 1

            # 3. Verify Hash Integrity (Envelope Verification)
            envelope = json.dumps({
                "id": e_id,
                "seq": e_seq,
                "stage": e_stage,
                "actor": e_actor,
                "timestamp": e_timestamp,
                "parent_event_id": e_parent_id if e_parent_id is not None else None,
                "prev_hash": e_prev_hash if e_prev_hash is not None else None,
                "payload": e_payload
            }, separators=(',', ':'))
            
            calculated_hash = hashlib.sha256(envelope.encode('utf-8')).hexdigest()
            if calculated_hash != e_hash:
                print(f"FAIL [Hash Mismatch]: Event {e_id} (seq {e_seq})")
                errors += 1

            # 4. Verify Parent Linkage
            if index > 0 and e_parent_id != last_id:
                print(f"FAIL [Broken Link]: Event {e_id} refers to parent {e_parent_id}, expected {last_id}")
                errors += 1

            last_id = e_id
            last_hash = e_hash

        # 5. Verify Anchor
        cursor.execute("SELECT seq, event_id, hash FROM chain_anchors WHERE id = 1")
        anchor = cursor.fetchone()
        if not anchor:
            print("FAIL [Missing Anchor]: No anchor found in chain_anchors.")
            errors += 1
        else:
            a_seq, a_event_id, a_hash = anchor
            if a_seq != max_seq or a_hash != last_hash or a_event_id != last_id:
                print(f"FAIL [Anchor Mismatch]: Anchor points to seq {a_seq} (hash {a_hash}), but chain ends at seq {max_seq} (hash {last_hash}).")
                errors += 1

        if errors == 0:
            print(f"PASS: Verified {len(events)} events in the chain, ending at seq {max_seq}.")
        else:
            print(f"FAILED: {errors} integrity errors found.")
            sys.exit(1)

    except sqlite3.Error as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    verify_chain()
