#!/usr/bin/env python3
import json, time, sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))
from handshake import compute_merkle_root, SRC_DIR, STATE_FILE, JOURNAL_DIR

def init():
    if not JOURNAL_DIR.exists(): JOURNAL_DIR.mkdir(parents=True)
    root = compute_merkle_root(SRC_DIR)
    state = {"merkle_root": root, "last_verified": time.time(), "last_verified_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    STATE_FILE.write_text(json.dumps(state, indent=2))
    print(f"[INIT] Fortress 2.0 Baselined. Merkle Root: {root}")

if __name__ == "__main__": init()
