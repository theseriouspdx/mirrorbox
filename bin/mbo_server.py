#!/usr/bin/env python3
import os, sys, subprocess, signal, time, socket
from pathlib import Path

MBO_ROOT = Path(__file__).parent.parent
PID_FILE = MBO_ROOT / ".dev" / "run" / "mbo_server.pid"
PORT = int(os.environ.get("MBO_PORT", 3737))
MCP_SERVER_JS = MBO_ROOT / "src" / "graph" / "mcp-server.js"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def start():
    if PID_FILE.exists():
        pid = int(PID_FILE.read_text())
        try:
            os.kill(pid, 0)
            print(f"[MBO] Server already running (PID {pid}).")
            return
        except OSError:
            PID_FILE.unlink()

    if is_port_in_use(PORT):
        print(f"[MBO] ERROR: Port {PORT} is already in use by another process.")
        sys.exit(1)

    print(f"[MBO] Starting Intelligence Graph MCP Server on port {PORT}...")
    
    # Ensure run directory exists
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Start Node.js process
    cmd = [
        "node", 
        str(MCP_SERVER_JS),
        "--mode=dev",
        f"--root={MBO_ROOT}"
    ]
    
    env = os.environ.copy()
    env["MBO_PORT"] = str(PORT)
    
    # Run in background
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True
    )
    
    PID_FILE.write_text(str(process.pid))
    print(f"[MBO] Server started with PID {process.pid}.")
    print(f"[MBO] MCP URL: http://127.0.0.1:{PORT}/mcp")

def stop():
    if not PID_FILE.exists():
        print("[MBO] No server running.")
        return

    pid = int(PID_FILE.read_text())
    print(f"[MBO] Stopping server (PID {pid})...")
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(5):
            time.sleep(1)
            try:
                os.kill(pid, 0)
            except OSError:
                print("[MBO] Server stopped.")
                PID_FILE.unlink()
                return
        os.kill(pid, signal.SIGKILL)
        PID_FILE.unlink()
        print("[MBO] Server force-killed.")
    except OSError:
        print("[MBO] Server already stopped.")
        PID_FILE.unlink()

def status():
    if PID_FILE.exists():
        pid = int(PID_FILE.read_text())
        try:
            os.kill(pid, 0)
            print(f"[MBO] Status: RUNNING (PID {pid})")
            print(f"[MBO] URL: http://127.0.0.1:{PORT}/mcp")
        except OSError:
            print("[MBO] Status: STALE (PID file exists but process dead)")
    else:
        print("[MBO] Status: STOPPED")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: bin/mbo_server.py [start|stop|status]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "start": start()
    elif cmd == "stop": stop()
    elif cmd == "status": status()
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
