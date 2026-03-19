#!/usr/bin/env python3
import hashlib, json, os, shutil, stat, subprocess, sys, time, uuid
from pathlib import Path
from typing import Optional

CONTROLLER_ROOT = Path(__file__).parent.parent
MBO_ROOT = Path(os.environ.get("MBO_PROJECT_ROOT", str(CONTROLLER_ROOT))).resolve()
SRC_DIR = MBO_ROOT / "src"
JOURNAL_DIR = MBO_ROOT / ".journal"
STATE_FILE = JOURNAL_DIR / "state.json"
SESSION_LOCK = JOURNAL_DIR / "session.lock"
AUDIT_LOG = JOURNAL_DIR / "audit.log"
SESSION_TTL_SECONDS = 1800
PULSE_INTERVAL = 300
KEYCHAIN_SERVICE = "com.mbo.auth.user-presence"
CI_POLICY_FLAG = "MBO_CI_AUTH_APPROVED"
CI_POLICY_SCOPES = "MBO_CI_AUTH_SCOPES"
CI_POLICY_ACTIONS = "MBO_CI_AUTH_ACTIONS"


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

    if not leaves:
        return hashlib.sha256(b"__mbo_empty_src__").hexdigest()
    layer = leaves
    while len(layer) > 1:
        next_layer = []
        for i in range(0, len(layer), 2):
            left = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else left
            next_layer.append(hashlib.sha256(f"{left}{right}".encode()).hexdigest())
        layer = next_layer
    return layer[0]


def _write_canonical_state(root_hash: str):
    if not JOURNAL_DIR.exists():
        JOURNAL_DIR.mkdir(parents=True)
    state = {
        "merkle_root": root_hash,
        "merkle_scope": "src",
        "last_verified": time.time(),
        "last_verified_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }
    STATE_FILE.write_text(json.dumps(state, indent=2))


def ensure_canonical_state(auto_init: bool = False) -> Optional[dict]:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())

    if not auto_init:
        return None

    root_hash = compute_merkle_root(SRC_DIR)
    _write_canonical_state(root_hash)
    log_audit("STATE_AUTO_INITIALIZED")
    print("[GATE] INFO: state.json missing. Auto-initialized Merkle baseline for this repo root.", file=sys.stderr)
    return json.loads(STATE_FILE.read_text())


def load_canonical_state() -> dict:
    state = ensure_canonical_state(auto_init=True)
    if state is None:
        print("[GATE] DENIED: state.json not found. Run bin/init_state.py", file=sys.stderr)
        sys.exit(1)
    return state


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
            print("[GATE] CRITICAL: Merkle mismatch detected.", file=sys.stderr)
            print(f"Expected: {state['merkle_root']}", file=sys.stderr)
            print(f"Actual:   {current_root}", file=sys.stderr)
            print(f"Scope:    {scope}", file=sys.stderr)
        return False
    return True


def lock_src():
    if not SRC_DIR.exists():
        return
    # Only lock if src/ is currently writable (avoids expensive redundant chmod).
    if not os.access(SRC_DIR, os.W_OK):
        return

    for item in SRC_DIR.rglob("*"):
        if item.is_file():
            try:
                item.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            except OSError:
                pass
    # Lock src/ dir itself to prevent new file/dir creation
    try:
        SRC_DIR.chmod(stat.S_IRUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    except OSError:
        pass
    # Write deny sentinel so agents can detect lockout without parsing session.lock
    DENY_SENTINEL.parent.mkdir(parents=True, exist_ok=True)
    try:
        DENY_SENTINEL.write_text(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    except OSError:
        pass


def _confirm_risky_scope(cell_name: str, force: bool):
    if cell_name not in (".", "/", ""):
        return
    if not force:
        print("[GATE] DENIED: Scope '.' is high risk. Re-run with --force and explicit confirmation.", file=sys.stderr)
        sys.exit(1)
    print("[GATE] WARNING: Scope '.' grants write access across src/. This can break your project in irreversible ways.", file=sys.stderr)
    if not sys.stdin.isatty():
        print("[GATE] DENIED: Risk confirmation for '.' requires a TTY.", file=sys.stderr)
        sys.exit(1)
    answer = input("Continue? (yes/no): ").strip().lower()
    if answer not in ("y", "yes"):
        print("[GATE] Cancelled by user.", file=sys.stderr)
        sys.exit(1)


def _display_scope(scope: Optional[str]) -> str:
    if scope in ("src", ".", "/", ""):
        return "."
    return scope or "none"


def _is_interactive() -> bool:
    return sys.stdin.isatty() and sys.stdout.isatty()


def _is_ci_context() -> bool:
    ci = os.environ.get("CI", "").strip().lower()
    return ci in ("1", "true", "yes")


def _csv_set(env_key: str) -> set[str]:
    raw = os.environ.get(env_key, "").strip()
    if not raw:
        return set()
    return {x.strip() for x in raw.split(",") if x.strip()}


def _ci_policy_allows(action: str, scope: Optional[str] = None) -> bool:
    # Explicit CI-only policy contract. Default is fail-closed.
    if os.environ.get(CI_POLICY_FLAG, "").strip() != "1":
        return False
    if not _is_ci_context():
        return False

    actions = _csv_set(CI_POLICY_ACTIONS)
    if actions and "*" not in actions and action not in actions:
        return False

    scopes = _csv_set(CI_POLICY_SCOPES)
    if scope is not None and scopes and "*" not in scopes and scope not in scopes:
        return False

    return True


def _keychain_account() -> str:
    # Scope keychain entry to this repo path to avoid cross-project collisions.
    return f"{os.environ.get('USER', 'unknown')}:{MBO_ROOT.resolve()}"


def _ensure_keychain_item() -> bool:
    account = _keychain_account()
    check = subprocess.run(
        ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account],
        capture_output=True,
        text=True,
    )
    if check.returncode == 0:
        return True

    seed = hashlib.sha256(f"{account}:{KEYCHAIN_SERVICE}".encode()).hexdigest()
    create = subprocess.run(
        [
            "security",
            "add-generic-password",
            "-U",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            account,
            "-w",
            seed,
            "-T",
            "/usr/bin/security",
        ],
        capture_output=True,
        text=True,
    )
    return create.returncode == 0


def _macos_local_auth_prompt(action: str, scope: Optional[str]) -> bool:
    if shutil.which("swift") is None:
        return False

    scope_text = scope or "none"
    reason = f"Authorize mbo auth {action} ({scope_text})"
    script = r'''
import LocalAuthentication
import Foundation

let context = LAContext()
context.localizedCancelTitle = "Cancel"
var error: NSError?
if !context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
    fputs("NO_POLICY\n", stderr)
    exit(2)
}
let sem = DispatchSemaphore(value: 0)
var ok = false
context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: CommandLine.arguments[1]) { success, _ in
    ok = success
    sem.signal()
}
_ = sem.wait(timeout: .now() + 30)
if ok {
    print("OK")
    exit(0)
}
fputs("DENIED\n", stderr)
exit(1)
'''

    proc = subprocess.run(
        ["swift", "-e", script, reason],
        capture_output=True,
        text=True,
    )
    return proc.returncode == 0


def _macos_keychain_presence_check() -> bool:
    if not _ensure_keychain_item():
        print("[GATE] DENIED: Could not initialize Keychain presence item.", file=sys.stderr)
        return False

    account = _keychain_account()
    # This lookup is Keychain-backed and may trigger OS user-presence prompts
    # depending on keychain lock state and local security policy.
    check = subprocess.run(
        ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
        capture_output=True,
        text=True,
    )
    return check.returncode == 0


def _require_human_presence(action: str, scope: Optional[str] = None) -> bool:
    if _ci_policy_allows(action, scope):
        return True

    if not _is_interactive():
        print(
            (
                "[GATE] DENIED: Non-interactive auth is blocked. "
                f"For CI-only use set CI=1 {CI_POLICY_FLAG}=1 and optional "
                f"{CI_POLICY_ACTIONS}/{CI_POLICY_SCOPES}."
            ),
            file=sys.stderr,
        )
        return False

    if sys.platform == "darwin":
        if shutil.which("security") is None:
            print("[GATE] DENIED: macOS Keychain tool 'security' is unavailable.", file=sys.stderr)
            return False

        if _macos_local_auth_prompt(action, scope):
            return True

        if _macos_keychain_presence_check():
            return True

        print("[GATE] DENIED: macOS user-presence check failed.", file=sys.stderr)
        return False

    # Non-macOS fallback remains interactive-only.
    return True


def handshake(cell_name: str, force: bool = False):
    if SESSION_LOCK.exists():
        lock_data = json.loads(SESSION_LOCK.read_text())
        if time.time() < lock_data["expires_at"]:
            print(f"[GATE] DENIED: Session active for {_display_scope(lock_data.get('cell_scope'))}.", file=sys.stderr)
            sys.exit(1)

    if not check_integrity():
        if force:
            print("[GATE] WARNING: Forcing handshake despite Merkle mismatch.", file=sys.stderr)
            log_audit(f"HANDSHAKE_FORCED_MERKLE_BYPASS: {cell_name}")
        else:
            print("[GATE] Triggering HYDRATION MODE. Manual intervention required.", file=sys.stderr)
            sys.exit(1)

    _confirm_risky_scope(cell_name, force)

    # Special case: '.' and 'src' grant entire src/ directory
    if cell_name in (".", "/", "", "src"):
        cell_path = SRC_DIR
        granted_scope = "."
    elif cell_name in ("scripts", "tests", "bin"):
        cell_path = MBO_ROOT / cell_name
        granted_scope = cell_name
    else:
        cell_path = SRC_DIR / "cells" / cell_name
        if not cell_path.exists():
            # Allow non-cell src paths if they exist
            cell_path = SRC_DIR / cell_name
            if not cell_path.exists():
                print(f"[GATE] DENIED: Path {cell_name} missing.", file=sys.stderr)
                sys.exit(1)
        granted_scope = cell_name

    lock_src()
    # Restore src/ dir to traversable after lock_src locked it
    SRC_DIR.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR | stat.S_IRGRP | stat.S_IXGRP | stat.S_IROTH | stat.S_IXOTH)
    # Clear deny sentinel on successful grant
    DENY_SENTINEL.unlink(missing_ok=True)
    # Grant write access to the specific cell/path
    if cell_path.is_dir():
        for item in cell_path.rglob("*"):
            if item.is_file():
                item.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)
    else:
        cell_path.chmod(stat.S_IRUSR | stat.S_IWUSR | stat.S_IRGRP | stat.S_IROTH)

    token = {
        "token": str(uuid.uuid4()),
        "cell_scope": granted_scope,
        "expires_at": time.time() + SESSION_TTL_SECONDS,
    }
    SESSION_LOCK.write_text(json.dumps(token))
    if force:
        log_audit(f"HANDSHAKE_GRANTED_FORCED: requested={cell_name}, granted={granted_scope}")
    else:
        log_audit(f"HANDSHAKE_GRANTED: {granted_scope}")
    print(f"[GATE] Handshake complete. Scope: {_display_scope(granted_scope)}")


DENY_SENTINEL = MBO_ROOT / ".dev" / "run" / "write.deny"

HELP_TEXT = """
mboauth — MBO Sovereign Factory handshake tool

USAGE (human):
  mboauth auth <scope> [--force]    Grant write access to src/<scope>
  mboauth revoke                    End session, lock src/, generate handoff
  mboauth reset                     Rebaseline Merkle root after commits to src/ (git must be clean)

USAGE (agent-safe):
  mboauth status                    Show active session scope and expiry
  mboauth pulse                     Integrity check — verify src/ matches baseline
  mboauth --help                    Show this message

SCOPE EXAMPLES:
  mboauth auth relay
  mboauth auth auth/operator
  mboauth auth index.js

NOTES:
  - src/ is locked (555) when no session is active; writes are blocked
  - Session TTL: 30 minutes
"""

if __name__ == "__main__":
    if not JOURNAL_DIR.exists():
        JOURNAL_DIR.mkdir(parents=True)
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "help"):
        print(HELP_TEXT)
        sys.exit(0)

    force = "--force" in sys.argv[2:]

    # Friendly subcommand aliases
    if sys.argv[1] == "auth":
        if len(sys.argv) < 3:
            print("Usage: mbo auth <scope> [--force]", file=sys.stderr)
            sys.exit(1)
        sys.argv[1] = sys.argv[2]
    elif sys.argv[1] in ("revoke", "status", "pulse", "reset"):
        sys.argv[1] = f"--{sys.argv[1]}"

    arg = sys.argv[1]

    # BUG-142: fresh worktrees should not require a manual init_state.py bootstrap
    # before auth/status can operate. Auto-create the Merkle baseline on first use.
    if arg != "--help":
        ensure_canonical_state(auto_init=True)

    is_grant = not arg.startswith("--")
    is_revoke = arg == "--revoke"
    auth_action = "grant" if is_grant else ("revoke" if is_revoke else None)
    auth_scope = arg if is_grant else None
    # Section 36: revoke (lockdown) is always allowed non-interactively.
    if auth_action and auth_action != "revoke" and not _require_human_presence(auth_action, auth_scope):
        sys.exit(1)

    if arg == "--merkle-root":
        target = Path(sys.argv[2]) if len(sys.argv) > 2 else SRC_DIR
        print(compute_merkle_root(target, base_root=target))
        sys.exit(0)
    if arg == "--status":
        if SESSION_LOCK.exists():
            data = json.loads(SESSION_LOCK.read_text())
            expires_at = float(data.get("expires_at", 0))
            remaining = int(expires_at - time.time())
            display_scope = _display_scope(data.get("cell_scope"))
            if remaining > 0:
                print(f"[SESSION] Active: {display_scope} (Expires in {remaining}s)")
            else:
                print(f"[SESSION] Expired: {display_scope} (Expired {-remaining}s ago)")
        else:
            print("[SESSION] None")
    elif arg == "--revoke":
        lock_src()
        SESSION_LOCK.unlink(missing_ok=True)
        log_audit("SESSION_REVOKED")
        print("[GATE] Session revoked. Generating handoff...")
        try:
            subprocess.run(
                ["bash", str(CONTROLLER_ROOT / "scripts" / "mbo-session-close.sh")],
                timeout=45,
                check=False,
                env={**os.environ, "MBO_PROJECT_ROOT": str(MBO_ROOT)},
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
        handshake(arg, force=force)
