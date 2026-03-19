#!/usr/bin/env bash
set -euo pipefail

ALPHA_ROOT="${1:-/Users/johnserious/MBO_Alpha}"
shift || true

cd "$ALPHA_ROOT"
exec npx mbo "$@"
