#!/usr/bin/env python3
import os, sys, subprocess, signal, time, socket
from pathlib import Path

MIRROR_ROOT = Path(__file__).parent.parent
ALPHA_ROOT = Path(os.environ.get("MBO_ALPHA_ROOT", str(MIRROR_ROOT.parent / "MBO_Alpha")))
PORT_MIRROR = int(os.environ.get("MBO_PORT", 3737))
PORT_SUBJECT = int(os.environ.get("MBO_PORT_ALPHA", 3738))

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start(world):
    if world == "mirror":
        root = MIRROR_ROOT
        port = PORT_MIRROR
    elif world == "subject":
        root = ALPHA_ROOT
        port = PORT_SUBJECT
    else:
        print(f"[MBO] ERROR: Invalid world_id: {world}")
        sys.exit(1)

    if not root.exists():
        print(f"[MBO] ERROR: {world.capitalize()} root not found at {root}. Run bin/pile_deploy.py --world_id=subject if needed.")
        sys.exit(1)

    pid_file = MIRROR_ROOT / ".dev" / "run" / f"mbo_server_{world}.pid"
    mcp_server_js = MIRROR_ROOT / "src" / "graph" / "mcp-server.js"

    if pid_file.exists():
        pid = int(pid_file.read_text())
        try:
            os.kill(pid, 0)
            print(f"[MBO] Server ({world}) already running (PID {pid}).")
            return
        except OSError:
            pid_file.unlink()

    if is_port_in_use(port):
        print(f"[MBO] ERROR: Port {port} is already in use by another process.")
        sys.exit(1)

    print(f"[MBO] Starting {world.capitalize()} Intelligence Graph MCP Server on port {port}...")
    
    # Ensure run directory exists
    pid_file.parent.mkdir(parents=True, exist_ok=True)

    # Start Node.js process
    cmd = [
        "node", 
        str(mcp_server_js),
        "--mode=dev" if world == "mirror" else "--mode=runtime",
        f"--root={root}"
    ]
    
    env = os.environ.copy()
    env["MBO_PORT"] = str(port)
    env["PROJECT_ROOT"] = str(root)
    env["MBO_WORLD_ID"] = world
    
    # Run in background
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True
    )
    
    pid_file.write_text(str(process.pid))
    print(f"[MBO] {world.capitalize()} Server started with PID {process.pid}.")
    print(f"[MBO] MCP URL: http://127.0.0.1:{port}/mcp")

def stop(world):
    pid_file = MIRROR_ROOT / ".dev" / "run" / f"mbo_server_{world}.pid"
    if not pid_file.exists():
        print(f"[MBO] No {world} server running.")
        return

    pid = int(pid_file.read_text())
    print(f"[MBO] Stopping {world} server (PID {pid})...")
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(5):
            time.sleep(1)
            try:
                os.kill(pid, 0)
            except OSError:
                print(f"[MBO] {world.capitalize()} Server stopped.")
                pid_file.unlink()
                return
        os.kill(pid, signal.SIGKILL)
        pid_file.unlink()
        print(f"[MBO] {world.capitalize()} Server force-killed.")
    except OSError:
        print(f"[MBO] {world.capitalize()} Server already stopped.")
        pid_file.unlink()

def status(world):
    pid_file = MIRROR_ROOT / ".dev" / "run" / f"mbo_server_{world}.pid"
    if pid_file.exists():
        pid = int(pid_file.read_text())
        try:
            os.kill(pid, 0)
            print(f"[MBO] {world.capitalize()} Status: RUNNING (PID {pid})")
            port = PORT_MIRROR if world == "mirror" else PORT_SUBJECT
            print(f"[MBO] URL: http://127.0.0.1:{port}/mcp")
        except OSError:
            print(f"[MBO] {world.capitalize()} Status: STALE (PID file exists but process dead)")
    else:
        print(f"[MBO] {world.capitalize()} Status: STOPPED")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: bin/mbo_server.py [start|stop|status] [mirror|subject]")
        sys.exit(1)

    cmd = sys.argv[1]
    world = sys.argv[2]
    if cmd == "start": start(world)
    elif cmd == "stop": stop(world)
    elif cmd == "status": status(world)
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
