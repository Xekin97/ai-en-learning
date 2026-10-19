#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
source "$script_dir/common.sh"

status_failed=0
for process_spec in "$PRON_CANDIDATE_RUNTIME/frontend-server.pid:$PRON_ENTRY" "$PRON_CANDIDATE_RUNTIME/frontend-proxy.pid:$script_dir/candidate-proxy.mjs"; do
  pid_file=${process_spec%%:*}
  expected_entry=${process_spec#*:}
  if [[ ! -f "$pid_file" ]]; then
    echo "NOT_RUNNING missing_pid_file=$pid_file"
    status_failed=1
    continue
  fi
  process_pid=$(cat "$pid_file")
  if ! kill -0 "$process_pid" 2>/dev/null; then
    echo "NOT_RUNNING stale_pid=$process_pid"
    status_failed=1
    continue
  fi
  process_command=$(ps -p "$process_pid" -o command=)
  if [[ "$process_command" != *"$expected_entry"* ]]; then
    echo "MISMATCH pid=$process_pid expected_entry=$expected_entry"
    status_failed=1
    continue
  fi
  echo "RUNNING pid=$process_pid entry=$expected_entry"
done

for candidate_route in / /login /api/v1/bootstrap; do
  response_code=$(/usr/bin/curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:3019$candidate_route" || true)
  echo "GET http://localhost:3019$candidate_route -> ${response_code:-000}"
  [[ "$response_code" == "200" ]] || status_failed=1
done

echo "topology=localhost:3019 -> candidate:3018 + real_backend:43331 mock_flags=none_by_harness"
exit "$status_failed"
