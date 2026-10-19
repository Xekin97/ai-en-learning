#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
source "$script_dir/common.sh"

proxy_entry="$script_dir/candidate-proxy.mjs"
server_pid_file="$PRON_CANDIDATE_RUNTIME/frontend-server.pid"
proxy_pid_file="$PRON_CANDIDATE_RUNTIME/frontend-proxy.pid"
server_log="$PRON_CANDIDATE_RUNTIME/logs/frontend.log"
proxy_log="$PRON_CANDIDATE_RUNTIME/logs/proxy.log"

pron_require_file "$PRON_ENTRY"
pron_require_file "$proxy_entry"
pron_require_file "$PRON_NODE_BIN"

if [[ -f "$server_pid_file" && -f "$proxy_pid_file" ]]; then
  server_pid=$(cat "$server_pid_file")
  proxy_pid=$(cat "$proxy_pid_file")
  if kill -0 "$server_pid" 2>/dev/null && kill -0 "$proxy_pid" 2>/dev/null; then
    echo "candidate already running server_pid=$server_pid proxy_pid=$proxy_pid url=http://localhost:3019"
    exit 0
  fi
fi

pron_require_port_free "$PRON_NITRO_PORT"
pron_require_port_free "$PRON_PUBLIC_PORT"
backend_code=$(/usr/bin/curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' "$PRON_BACKEND_ORIGIN/api/v1/bootstrap")
[[ "$backend_code" == "200" ]] || { echo "real backend bootstrap unavailable: HTTP $backend_code" >&2; exit 1; }

mkdir -p "$PRON_CANDIDATE_RUNTIME/logs"
server_pid=$(python3 - "$PRON_NODE_BIN" "$PRON_ENTRY" "$server_log" <<'PY'
import os
import subprocess
import sys

node_bin, entry, log_file = sys.argv[1:]
env = os.environ.copy()
env.update({
    "HOST": "127.0.0.1",
    "PORT": "3018",
    "NITRO_HOST": "127.0.0.1",
    "NITRO_PORT": "3018",
    "NUXT_BACKEND_INTERNAL_ORIGIN": "http://127.0.0.1:43331",
})
with open(log_file, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [node_bin, entry],
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
        close_fds=True,
    )
print(process.pid)
PY
)
echo "$server_pid" >"$server_pid_file"

cleanup_partial() {
  "$script_dir/candidate-stop.sh" >/dev/null 2>&1 || true
}
trap cleanup_partial EXIT

for _ in {1..50}; do
  if /usr/bin/curl --noproxy '*' -sS -o /dev/null "http://127.0.0.1:3018/login"; then
    break
  fi
  sleep 0.1
done
kill -0 "$server_pid"

proxy_pid=$(python3 - "$PRON_NODE_BIN" "$proxy_entry" "$proxy_log" <<'PY'
import subprocess
import sys

node_bin, entry, log_file = sys.argv[1:]
with open(log_file, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [node_bin, entry],
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
print(process.pid)
PY
)
echo "$proxy_pid" >"$proxy_pid_file"

for _ in {1..50}; do
  if /usr/bin/curl --noproxy '*' -sS -o /dev/null "http://127.0.0.1:3019/login"; then
    break
  fi
  sleep 0.1
done
kill -0 "$proxy_pid"

trap - EXIT
echo "candidate started server_pid=$server_pid proxy_pid=$proxy_pid url=http://localhost:3019"
