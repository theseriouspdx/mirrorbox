import sqlite3
import hashlib
import json
import os
import sys

def verify_event_chain(db_path):
    """
    Verifies Invariant 4: Every operation is reproducible from the event store.
    Checks SHA-256 hashes, sequence continuity, and parent-child linkage.
    """
    if not os.path.exists(db_path):
        return {"status": "FAIL", "reason": f"Database file not found at {db_path}"}

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id, seq, stage, actor, timestamp, payload, hash, parent_event_id FROM events ORDER BY seq ASC")
        events = cursor.fetchall()
        
        if not events:
            return {"status": "PASS", "note": "Event store is empty."}

        last_id = None
        expected_seq = 1
        max_seq = 0
        last_hash = None

        for i, (event_id, seq, stage, actor, timestamp, payload, stored_hash, parent_id) in enumerate(events):
            if seq != expected_seq:
                return {"status": "FAIL", "event_id": event_id, "reason": f"Sequence gap. Expected {expected_seq}, found {seq}"}
            expected_seq += 1
            max_seq = seq
            last_hash = stored_hash

            envelope = json.dumps({
                "id": event_id,
                "seq": seq,
                "stage": stage,
                "actor": actor,
                "timestamp": timestamp,
                "parent_event_id": parent_id,
                "payload": payload
            }, separators=(',', ':'))
            
            calculated_hash = hashlib.sha256(envelope.encode('utf-8')).hexdigest()
            if calculated_hash != stored_hash:
                return {"status": "FAIL", "event_id": event_id, "reason": f"Hash mismatch. Expected {stored_hash}, got {calculated_hash}"}
            
            if i > 0 and parent_id != last_id:
                return {"status": "FAIL", "event_id": event_id, "reason": f"Broken parent link. Expected {last_id}, got {parent_id}"}
            
            last_id = event_id

        cursor.execute("SELECT seq, event_id, hash FROM chain_anchors WHERE id = 1")
        anchor = cursor.fetchone()
        
        if not anchor:
            return {"status": "FAIL", "reason": "Missing chain anchor"}
            
        anchor_seq, anchor_event_id, anchor_hash = anchor
        if anchor_seq != max_seq or anchor_hash != last_hash or anchor_event_id != last_id:
            return {"status": "FAIL", "reason": "Anchor mismatch with chain tail"}

        return {"status": "PASS", "event_count": len(events), "tail_seq": max_seq}
    except Exception as e:
        return {"status": "ERROR", "reason": str(e)}
    finally:
        conn.close()

if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'data/mirrorbox.db'
    results = verify_event_chain(db_path)
    print(json.dumps(results, indent=2))
