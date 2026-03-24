#!/usr/bin/env bash
set -euo pipefail

# alpha-runtime.sh
# Sync latest tracked files from controller repo to Alpha runtime repo,
# then run Alpha from controller cwd (avoids self-run guard false positives).

DEFAULT_CONTROLLER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTROLLER_ROOT="${MBO_CONTROLLER_ROOT:-$DEFAULT_CONTROLLER_ROOT}"
# Ensure CONTROLLER_ROOT is absolute even if passed as relative
CONTROLLER_ROOT="$(cd "$CONTROLLER_ROOT" && pwd)"
DEFAULT_ALPHA_ROOT="/Users/johnserious/MBO_Alpha"
ALPHA_ROOT="${MBO_ALPHA_ROOT:-$DEFAULT_ALPHA_ROOT}"

usage() {
  cat <<USAGE
Usage:
  scripts/alpha-runtime.sh sync [--alpha <path>]
  scripts/alpha-runtime.sh run [--alpha <path>] [-- <extra mbo args>]
  scripts/alpha-runtime.sh e2e [--alpha <path>]

Env overrides:
  MBO_CONTROLLER_ROOT   Source/controller repo used for sync + mirrored transcript output
  MBO_ALPHA_ROOT        Target runtime repo (default: ${DEFAULT_ALPHA_ROOT})
USAGE
}

parse_alpha_arg() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --alpha)
        shift
        [[ $# -gt 0 ]] || { echo "Missing value for --alpha" >&2; exit 2; }
        ALPHA_ROOT="$1"
        shift
        ;;
      --)
        shift
        break
        ;;
      *)
        break
        ;;
    esac
  done
  REM_ARGS=("$@")
}

require_paths() {
  [[ -d "$CONTROLLER_ROOT" ]] || { echo "Controller root not found: $CONTROLLER_ROOT" >&2; exit 1; }
  [[ -d "$ALPHA_ROOT" ]] || { echo "Alpha root not found: $ALPHA_ROOT" >&2; exit 1; }
  [[ -f "$CONTROLLER_ROOT/bin/mbo.js" ]] || { echo "Missing controller bin/mbo.js" >&2; exit 1; }
}

sync_alpha() {
  require_paths

  if [[ "$CONTROLLER_ROOT" == "$ALPHA_ROOT" ]]; then
    echo "[alpha-runtime] Sync skipped (controller root matches alpha root)"
    return 0
  fi

  if ! git -C "$CONTROLLER_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[alpha-runtime] Sync skipped (controller root is not a git worktree): $CONTROLLER_ROOT"
    return 0
  fi

  echo "[alpha-runtime] Syncing tracked files from $CONTROLLER_ROOT -> $ALPHA_ROOT"

  local tmp
  tmp="$(mktemp)"
  git -C "$CONTROLLER_ROOT" ls-files > "$tmp"

  rsync -a --files-from="$tmp" "$CONTROLLER_ROOT/" "$ALPHA_ROOT/"
  rm -f "$tmp"

  echo "[alpha-runtime] Sync complete"
}

run_alpha() {
  require_paths
  echo "[alpha-runtime] Running Alpha runtime from controller cwd"
  (
    cd "$ALPHA_ROOT"
    npx mbo "${REM_ARGS[@]}"
  )
}

run_e2e() {
  require_paths
  local ts alpha_log controller_analysis_dir controller_log
  ts="$(date +%Y%m%d-%H%M%S)"
  alpha_log="$ALPHA_ROOT/.mbo/logs/mbo-e2e-$ts.log"
  controller_analysis_dir="$CONTROLLER_ROOT/.dev/sessions/analysis"
  controller_log="$controller_analysis_dir/mbo-e2e-$ts.log.copy"

  mkdir -p "$ALPHA_ROOT/.mbo/logs"
  mkdir -p "$controller_analysis_dir"

  echo "[alpha-runtime] Capturing E2E transcript to: $alpha_log"
  echo "[alpha-runtime] Mirroring E2E transcript to: $controller_log"

  # E2E must run against the current controller worktree, not a stale Alpha checkout.
  sync_alpha

  (
    cd "$CONTROLLER_ROOT"
    node scripts/alpha-e2e-driver.js \
      --alpha-root "$ALPHA_ROOT" \
      --alpha-log "$alpha_log" \
      --mirror-log "$controller_log"
  )
}

main() {
  [[ $# -gt 0 ]] || { usage; exit 2; }
  local cmd="$1"
  shift

  case "$cmd" in
    sync)
      parse_alpha_arg "$@"
      sync_alpha
      ;;
    run)
      parse_alpha_arg "$@"
      run_alpha
      ;;
    e2e)
      parse_alpha_arg "$@"
      run_e2e
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
