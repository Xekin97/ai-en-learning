#!/bin/zsh
set -euo pipefail

script_dir="${0:A:h}"
source "$script_dir/common.sh"

proxy_entry="$script_dir/candidate-proxy.mjs"

for process_spec in "$PRON_CANDIDATE_RUNTIME/frontend-proxy.pid:$proxy_entry" "$PRON_CANDIDATE_RUNTIME/frontend-server.pid:$PRON_ENTRY"; do
  pid_file=${process_spec%%:*}
  expected_entry=${process_spec#*:}
  [[ -f "$pid_file" ]] || continue
  process_pid=$(cat "$pid_file")
  [[ "$process_pid" == <-> ]] || { echo "refusing invalid pid file: $pid_file" >&2; exit 1; }
  if kill -0 "$process_pid" 2>/dev/null; then
    process_command=$(ps -p "$process_pid" -o command=)
    [[ "$process_command" == *"$expected_entry"* ]] || {
      echo "refusing unexpected process pid=$process_pid" >&2
      exit 1
    }
    kill "$process_pid"
    for _ in {1..50}; do
      kill -0 "$process_pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -0 "$process_pid" 2>/dev/null && {
      echo "candidate process did not stop pid=$process_pid" >&2
      exit 1
    }
  fi
  rm -f "$pid_file"
done

echo "candidate stopped; build output retained; existing 3016/3017/43331 untouched"
