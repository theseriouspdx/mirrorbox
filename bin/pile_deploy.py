#!/usr/bin/env python3
import os, sys, shutil, subprocess, stat
from pathlib import Path

MIRROR_ROOT = Path(__file__).parent.parent
ALPHA_ROOT = Path("/Users/johnserious/MBO_Alpha")

def lock_files(path: Path):
    """Set all files in path to read-only (444)."""
    for item in path.rglob("*"):
        if item.is_file():
            item.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)

def main():
    if len(sys.argv) < 2 or sys.argv[1] != "--world_id=subject":
        print("[DEPLOY] ERROR: Deployment requires --world_id=subject flag.", file=sys.stderr)
        sys.exit(1)

    print(f"[DEPLOY] Starting 1.0 Alpha Deployment (Mirror -> MBO_Alpha)...")

    # 1. Ensure Alpha Root exists
    if not ALPHA_ROOT.exists():
        print(f"[DEPLOY] Creating MBO_Alpha directory at {ALPHA_ROOT}...")
        ALPHA_ROOT.mkdir(parents=True)

    # 2. Atomic Sync of core folders
    folders = ["src", "bin"]
    for folder in folders:
        src_path = MIRROR_ROOT / folder
        target_path = ALPHA_ROOT / folder
        
        if target_path.exists():
            print(f"[DEPLOY] Wiping existing {folder} in Alpha world...")
            shutil.rmtree(target_path)
        
        print(f"[DEPLOY] Syncing {folder} to Alpha...")
        shutil.copytree(src_path, target_path)

    # 3. Handle data and governance stubs
    (ALPHA_ROOT / "data").mkdir(exist_ok=True)
    (ALPHA_ROOT / ".dev" / "governance").mkdir(parents=True, exist_ok=True)
    (ALPHA_ROOT / ".journal").mkdir(exist_ok=True)

    # 4. Permissions (444 for src)
    print("[DEPLOY] Locking Alpha source world (444)...")
    lock_files(ALPHA_ROOT / "src")

    # 5. Baselining the Subject
    print("[DEPLOY] Baselining MBO_Alpha Merkle Root...")
    subprocess.run([sys.executable, str(ALPHA_ROOT / "bin" / "init_state.py")], check=True, cwd=ALPHA_ROOT)

    print("[DEPLOY] SUCCESS. MBO_Alpha environment initialized and anchored.")

if __name__ == "__main__":
    main()
