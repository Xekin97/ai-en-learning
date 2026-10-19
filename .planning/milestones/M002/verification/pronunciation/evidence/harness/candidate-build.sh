#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
source "$script_dir/common.sh"

pron_require_file "$PRON_FRONTEND_ROOT/package.json"
pron_require_file "$PRON_FRONTEND_ROOT/pnpm-lock.yaml"
pron_require_file "$PRON_NODE_BIN"

mkdir -p "$PRON_CANDIDATE_RUNTIME/logs" "$PRON_CANDIDATE_RUNTIME/manifests"
rm -rf "$PRON_BUILD_DIR" "$PRON_OUTPUT_DIR"

git -C "$PRON_REPO_ROOT" status --short -- frontend >"$PRON_CANDIDATE_RUNTIME/manifests/frontend-status-before-build.txt"
git -C "$PRON_REPO_ROOT" rev-parse HEAD >"$PRON_CANDIDATE_RUNTIME/manifests/git-head.txt"
find "$PRON_FRONTEND_ROOT/app" "$PRON_FRONTEND_ROOT/nuxt.config.ts" "$PRON_FRONTEND_ROOT/package.json" "$PRON_FRONTEND_ROOT/pnpm-lock.yaml" \
  -type f -print0 | sort -z | xargs -0 shasum -a 256 >"$PRON_CANDIDATE_RUNTIME/manifests/frontend-source-before.sha256"

(
  cd "$PRON_FRONTEND_ROOT"
  export NUXT_BUILD_DIR="$PRON_BUILD_DIR"
  export NUXT_OUTPUT_DIR="$PRON_OUTPUT_DIR"
  export NUXT_BACKEND_INTERNAL_ORIGIN="$PRON_BACKEND_ORIGIN"
  pnpm build
) 2>&1 | tee "$PRON_CANDIDATE_RUNTIME/logs/build.log"

pron_require_file "$PRON_ENTRY"
shasum -a 256 "$PRON_ENTRY" >"$PRON_CANDIDATE_RUNTIME/manifests/output-entry.sha256"
git -C "$PRON_REPO_ROOT" status --short -- frontend >"$PRON_CANDIDATE_RUNTIME/manifests/frontend-status-after-build.txt"
find "$PRON_FRONTEND_ROOT/app" "$PRON_FRONTEND_ROOT/nuxt.config.ts" "$PRON_FRONTEND_ROOT/package.json" "$PRON_FRONTEND_ROOT/pnpm-lock.yaml" \
  -type f -print0 | sort -z | xargs -0 shasum -a 256 >"$PRON_CANDIDATE_RUNTIME/manifests/frontend-source-after.sha256"

if ! cmp -s "$PRON_CANDIDATE_RUNTIME/manifests/frontend-status-before-build.txt" "$PRON_CANDIDATE_RUNTIME/manifests/frontend-status-after-build.txt"; then
  echo "frontend worktree changed during build; output is not a fixed candidate" >&2
  exit 1
fi
if ! cmp -s "$PRON_CANDIDATE_RUNTIME/manifests/frontend-source-before.sha256" "$PRON_CANDIDATE_RUNTIME/manifests/frontend-source-after.sha256"; then
  echo "frontend source content changed during build; output is not a fixed candidate" >&2
  exit 1
fi
cp "$PRON_CANDIDATE_RUNTIME/manifests/frontend-source-after.sha256" "$PRON_CANDIDATE_RUNTIME/manifests/frontend-source.sha256"

cat <<EOF
candidate build complete
runtime=$PRON_CANDIDATE_RUNTIME
entry=$PRON_ENTRY
status=BUILD_ONLY_NOT_VERIFIED
EOF
