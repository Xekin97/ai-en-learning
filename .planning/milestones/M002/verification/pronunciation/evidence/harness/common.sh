#!/bin/zsh
set -euo pipefail

export PRON_CANDIDATE_RUNTIME="${PRON_CANDIDATE_RUNTIME:-/private/tmp/wordweave-m002-pronunciation-candidate-20261016}"
case "$PRON_CANDIDATE_RUNTIME" in
  /private/tmp/wordweave-m002-pronunciation-candidate-*) ;;
  *) echo "refusing runtime outside pronunciation candidate prefix: $PRON_CANDIDATE_RUNTIME" >&2; return 2 ;;
esac

export PRON_REPO_ROOT="/Users/xekinzhuo/Desktop/xekin_develop/ai-en-learning-development/ai-en-learning"
export PRON_FRONTEND_ROOT="$PRON_REPO_ROOT/frontend"
export PRON_NODE_BIN="/Users/xekinzhuo/.npm/_npx/387698761821791d/node_modules/node/bin/node"
export PRON_NITRO_PORT=3018
export PRON_PUBLIC_PORT=3019
export PRON_BACKEND_ORIGIN="http://127.0.0.1:43331"
export PRON_BUILD_DIR="$PRON_CANDIDATE_RUNTIME/frontend-build"
export PRON_OUTPUT_DIR="$PRON_CANDIDATE_RUNTIME/frontend-output"
export PRON_ENTRY="$PRON_OUTPUT_DIR/server/index.mjs"
export PRON_HARNESS_DIR="${0:A:h}"
export PATH="${PRON_NODE_BIN:h}:$PATH"

pron_require_file() {
  [[ -f "$1" ]] || { echo "missing required file: $1" >&2; return 1; }
}

pron_require_port_free() {
  local checked_port="$1"
  if /usr/sbin/lsof -nP -iTCP:"$checked_port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "refusing occupied candidate port: $checked_port" >&2
    /usr/sbin/lsof -nP -iTCP:"$checked_port" -sTCP:LISTEN >&2 || true
    return 1
  fi
}
