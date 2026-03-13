#!/usr/bin/env python3
import hashlib, json, os, stat, sys, time, uuid, subprocess
from pathlib import Path
from typing import Optional

MBO_ROOT = Path(__file__).parent.parent
SRC_DIR = MBO_ROOT / "src"
JOURNAL_DIR = MBO_ROOT / ".journal"
STATE_FILE = JOURNAL_DIR / "state.json"
SESSION_LOCK = JOURNAL_DIR / "session.lock"
AUDIT_LOG = JOURNAL_DIR / "audit.log"
SESSION_TTL_SECONDS = 1800
PULSE_INTERVAL = 300

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()

def compute_merkle_root(src_dir: Path, base_root: Optional[Path] = None, file_list: Optional[list[Path]] = None) -> str:
    leaves = []
    base = base_root or MBO_ROOT

    if file_list is not None:
        found_files = [Path(f) for f in file_list]
    else:
        # BUG-009: Include all source types for 1.0 Alpha
        patterns = ["*.py", "*.js", "*.json", "*.md", "*.spec"]
        found_files = []
        for p in patterns:
            found_files.extend(src_dir.rglob(p))

    # BUG-009: Include all source types for 1.0 Alpha
    # Filter out ignored directories
    ignored = {".git", "node_modules", ".dev", "data", "audit", "__pycache__"}

    for filepath in sorted(found_files):
        if any(part in ignored for part in filepath.parts):
            continue
        if not filepath.is_file():
            continue
        relative = str(filepath.relative_to(base))
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

def log_audit(event):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(AUDIT_LOG, "a") as f:
        f.write(f"[{timestamp}] {event}\n")

def check_integrity(silent=False):
    state = load_canonical_state()
    scope = state.get("merkle_scope", "src")
    if scope != "src":
        if not silent:
            print(f"[GATE] CRITICAL: Unsupported merkle scope in state.json: {scope}", file=sys.stderr)
        return False

    current_root = compute_merkle_root(SRC_DIR)
    
    # If a session is active, we expect changes in the specific cell_scope.
    # But for 1.0 Alpha, we enforce global integrity at handshake.
    if current_root != state["merkle_root"]:
        log_audit("EXTERNAL_MUTATION_DETECTED")
        if not silent:
            print(f"[GATE] CRITICAL: Merkle mismatch detected.", file=sys.stderr)
            print(f"Expected: {state['merkle_root']}", file=sys.stderr)
            print(f"Actual:   {current_root}", file=sys.stderr)
            print(f"Scope:    {scope}", file=sys.stderr)
        return False
    return True

def lock_src():
    for item in SRC_DIR.rglob("*"):
        if item.is_file(): item.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    # Lock src/ dir itself to prevent new file/dir creation
    SRC_DIR.chmod(stat.S_IRUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    # Write deny sentinel so agents can detect lockout without parsing session.lock
    DENY_SENTINEL.parent.mkdir(parents=True, exist_ok=True)
    DENY_SENTINEL.write_text(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

def handshake(cell_name):
    if SESSION_LOCK.exists():
        lock_data = json.loads(SESSION_LOCK.read_text())
        if time.time() < lock_data["expires_at"]:
            print(f"[GATE] DENIED: Session active for {lock_data['cell_scope']}.", file=sys.stderr)
            sys.exit(1)
    
    if not check_integrity():
        print("[GATE] Triggering HYDRATION MODE. Manual intervention required.", file=sys.stderr)
        sys.exit(1)

    # Reject '.' — too broad, agents must name an explicit scope
    if cell_name in (".", "/", ""):
        print("[GATE] DENIED: Scope '.' is too broad. Use 'src', 'bin', or a named subdirectory.", file=sys.stderr)
        sys.exit(1)

    # Special case: 'src' grants the entire src/ directory
    if cell_name == "src":
        cell_path = SRC_DIR
    else:
        cell_path = SRC_DIR / "cells" / cell_name
        if not cell_path.exists():
            # Allow non-cell src paths if they exist
            cell_path = SRC_DIR / cell_name
            if not cell_path.exists():
                print(f"[GATE] DENIED: Path {cell_name} missing.", file=sys.stderr); sys.exit(1)
            
    lock_src()
    # Restore src/ dir to traversable after lock_src locked it
    SRC_DIR.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    # Clear deny sentinel on successful grant
    DENY_SENTINEL.unlink(missing_ok=True)
    # Grant write access to the specific cell/path
    if cell_path.is_dir():
        for item in cell_path.rglob("*"):
            if item.is_file(): item.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    else:
        cell_path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

    token = {"token": str(uuid.uuid4()), "cell_scope": cell_name, "expires_at": time.time() + SESSION_TTL_SECONDS}
    SESSION_LOCK.write_text(json.dumps(token))
    log_audit(f"HANDSHAKE_GRANTED: {cell_name}")
    print(f"[GATE] Handshake complete. Scope: {cell_name}")

DENY_SENTINEL = MBO_ROOT / ".dev" / "run" / "write.deny"

HELP_TEXT = """
mboauth — MBO Sovereign Factory handshake tool

USAGE (human):
  mboauth auth <scope>    Grant write access to src/<scope> (requires MBO_HUMAN_TOKEN)
  mboauth revoke          End session, lock src/, generate handoff (requires MBO_HUMAN_TOKEN)
  mboauth reset           Rebaseline Merkle root after commits to src/ (git must be clean)

USAGE (agent-safe, no token required):
  mboauth status          Show active session scope and expiry
  mboauth pulse           Integrity check — verify src/ matches baseline
  mboauth --help          Show this message

SCOPE EXAMPLES:
  mboauth auth relay
  mboauth auth auth/operator
  mboauth auth index.js

NOTES:
  - alias mboauth='MBO_HUMAN_TOKEN=1 python3 ~/MBO/bin/handshake.py'
  - src/ is locked (555) when no session is active; writes are blocked
  - Session TTL: 30 minutes
"""

if __name__ == "__main__":
    if not JOURNAL_DIR.exists(): JOURNAL_DIR.mkdir(parents=True)
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "help"):
        print(HELP_TEXT); sys.exit(0)

    # Friendly subcommand aliases
    if sys.argv[1] == "auth":
        if len(sys.argv) < 3:
            print("Usage: mbo auth <scope>", file=sys.stderr); sys.exit(1)
        sys.argv[1] = sys.argv[2]
    elif sys.argv[1] in ("revoke", "status", "pulse", "reset"):
        sys.argv[1] = f"--{sys.argv[1]}"

    # Human-only guard: grant and revoke require MBO_HUMAN_TOKEN in environment.
    # Agents may only run --status, --pulse, and --reset without the token.
    HUMAN_TOKEN = os.environ.get("MBO_HUMAN_TOKEN", "")
    arg = sys.argv[1]
    is_grant = not arg.startswith("--")
    is_revoke = arg == "--revoke"
    if (is_grant or is_revoke) and not HUMAN_TOKEN:
        print("[GATE] DENIED: Grant/revoke requires MBO_HUMAN_TOKEN env var. Agents may only run --status, --pulse, or --reset.", file=sys.stderr)
        sys.exit(1)

    if arg == "--merkle-root":
        target = Path(sys.argv[2]) if len(sys.argv) > 2 else SRC_DIR
        print(compute_merkle_root(target, base_root=target))
        sys.exit(0)
    if arg == "--status":
        if SESSION_LOCK.exists():
            data = json.loads(SESSION_LOCK.read_text())
            print(f"[SESSION] Active: {data['cell_scope']} (Expires in {int(data['expires_at'] - time.time())}s)")
        else: print("[SESSION] None")
    elif arg == "--revoke":
        lock_src()
        SESSION_LOCK.unlink(missing_ok=True)
        log_audit("SESSION_REVOKED")
        print("[GATE] Session revoked. Generating handoff...")
        try:
            subprocess.run(
                ["bash", str(MBO_ROOT / "scripts" / "mbo-session-close.sh")],
                timeout=45,
                check=False,
            )
        except subprocess.TimeoutExpired:
            log_audit("SESSION_CLOSE_TIMEOUT")
            print("[GATE] WARN: Session close exceeded 45s and was aborted. Handoff may be partial.", file=sys.stderr)
    elif arg == "--pulse":
        if check_integrity(silent=True):
            print("[PULSE] OK")
        else:
            print("[PULSE] FAIL: EXTERNAL_MUTATION_DETECTED")
            sys.exit(1)
    elif arg == "--reset":
        result = subprocess.run(["git", "diff", "--quiet", "HEAD", "--", str(SRC_DIR)], cwd=MBO_ROOT)
        if result.returncode != 0:
            print("[GATE] DENIED: src/ has uncommitted changes. Commit or stash before reset.", file=sys.stderr)
            sys.exit(1)
        sys.path.insert(0, str(Path(__file__).parent))
        from init_state import init
        init()
        log_audit("MERKLE_REBASELINE")
    else:
        handshake(arg)
