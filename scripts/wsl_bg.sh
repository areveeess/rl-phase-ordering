#!/usr/bin/env bash
# Run a command detached inside WSL with the project venv; output goes to logs/<name>.log.
# Usage: bash scripts/wsl_bg.sh <name> <command...>
set -euo pipefail
cd "$(dirname "$0")/.."
name="$1"; shift
mkdir -p logs
# shellcheck disable=SC1090
source "$HOME/venvs/rlphase/bin/activate"
export PYTHONWARNINGS=ignore
setsid nohup bash -c "$* ; echo \"exit=\$?\"" > "logs/$name.log" 2>&1 < /dev/null &
echo "started $name (pid $!)"
