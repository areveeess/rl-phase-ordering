#!/usr/bin/env bash
# Supplementary experiment, run after the main pipeline: does a larger budget help?
# The main results (320 episodes, 3 seeds) left the policy near uniform. This trains one
# seed per reward mode with 2000 episodes, otherwise identical, into runs/long_* and
# evaluates into results/long_eval.csv. It never touches the main runs or results.
# Usage (Git Bash on Windows): bash drive_long.sh
set -u
REPO_WSL="/mnt/c/Users/rvsre/Documents/compiler project"
REPO_WIN="$(cd "$(dirname "$0")" && pwd)"
EPISODES="${EPISODES:-2000}"
CHUNK="${CHUNK:-150}"

say() { echo "[long $(date +%T)] $*"; }

run_wsl() {
  MSYS_NO_PATHCONV=1 timeout 1500 wsl -d Ubuntu --exec bash -lc \
    "cd \"$REPO_WSL\" && source ~/venvs/rlphase/bin/activate && export PYTHONWARNINGS=ignore && $1" 2>&1 \
    | tr -d '\0\r' | grep -E --line-buffered "done:|wrote|Traceback|Error" | cut -c1-200
  return "${PIPESTATUS[0]}"
}

until_ok() {  # until_ok <name> <command> <completion test run on Windows>
  local name="$1" cmd="$2" test="$3" n=0
  while [ $n -lt 200 ]; do
    if (cd "$REPO_WIN" && eval "$test"); then say "$name: complete"; return 0; fi
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 3 ] || { say "$name: exit $rc (attempt $n)"; sleep 20; }
  done
  say "$name: giving up"; return 1
}

for mode in dense sparse; do
  run="long_${mode}_s0"
  until_ok "train $run" \
    "python scripts/train.py --reward $mode --seed 0 --episodes $EPISODES --checkpoints 5 --max-seconds $CHUNK --out runs/$run >> ~/rlphase-logs/$run.log 2>&1; rc=\$?; tail -n 1 ~/rlphase-logs/$run.log; exit \$rc" \
    "[ -f runs/$run/policy.pt ] && [ -f runs/$run/run.json ]"
done
until_ok "eval" \
  "python scripts/evaluate.py runs/long_dense_s0 runs/long_sparse_s0 --out results/long_eval.csv" \
  "[ \"\$(python -c \"import pandas as p; d=p.read_csv('results/long_eval.csv'); print(d.groupby('run').size().ge(20).sum())\" 2>/dev/null)\" = 2 ]"
say "ALL DONE"
