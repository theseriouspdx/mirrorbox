#!/usr/bin/env python3
import hashlib, json, os, stat, sys, time, uuid
from pathlib import Path
from typing import Optional

MBO_ROOT = Path(__file__).parent.parent
SRC_DIR = MBO_ROOT / "src"
JOURNAL_DIR = MBO_ROOT / ".journal"
STATE_FILE = JOURNAL_DIR / "state.json"
SESSION_LOCK = JOURNAL_DIR / "session.lock"
SESSION_TTL_SECONDS = 1800

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()

def compute_merkle_root(src_dir: Path) -> str:
    leaves = []
    for filepath in sorted(src_dir.rglob("*.py")):
        relative = str(filepath.relative_to(src_dir))
        content_hash = _sha256_file(filepath)
        leaf = hashlib.sha256(f"{relative}:{content_hash}".encode()).hexdigest()
        leaves.append(leaf)
    if not leaves: return hashlib.sha256(b"__mbo_empty_src__").hexdigest()
    layer = leaves
    while len(layer) > 1:
        next_layer = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else left
            next_layer.append(hashlib.sha256(f"{left}{right}".encode()).hexdigest())
        layer = next_layer
    return layer[0]

def load_canonical_state() -> dict:
    if not STATE_FILE.exists(): print("[GATE] DENIED: state.json not found. Run bin/init_state.py", file=sys.stderr); sys.exit(1)
    return json.loads(STATE_FILE.read_text())

def lock_src():
    for item in SRC_DIR.rglob("*"):
        if item.is_file(): item.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)

def handshake(cell_name):
    if SESSION_LOCK.exists(): print(f"[GATE] DENIED: Session active.", file=sys.stderr); sys.exit(1)
    state = load_canonical_state()
    if compute_merkle_root(SRC_DIR) != state["merkle_root"]: print("[GATE] DENIED: Merkle mismatch.", file=sys.stderr); sys.exit(1)
    cell_path = SRC_DIR / "cells" / cell_name
    if not cell_path.exists(): print(f"[GATE] DENIED: Cell {cell_name} missing.", file=sys.stderr); sys.exit(1)
    lock_src()
    for item in cell_path.rglob("*"):
        if item.is_file(): item.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    token = {"token": str(uuid.uuid4()), "cell_scope": cell_name, "expires_at": time.time() + SESSION_TTL_SECONDS}
    SESSION_LOCK.write_text(json.dumps(token))
    print(f"[GATE] Handshake complete. Scope: {cell_name}")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(1)
    if sys.argv[1] == "--status":
        if SESSION_LOCK.exists(): print(f"[SESSION] Active: {json.loads(SESSION_LOCK.read_text())['cell_scope']}")
        else: print("[SESSION] None")
    elif sys.argv[1] == "--revoke":
        lock_src(); SESSION_LOCK.unlink(missing_ok=True); print("[GATE] Session revoked.")
    else: handshake(sys.argv[1])
