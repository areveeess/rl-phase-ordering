#!/usr/bin/env bash
# Final stage, run after drive_seeds.sh. It does not trust exit codes alone: a WSL restart
# during a call once returned 0 for an unfinished training chunk. Every step is repeated
# until its output is verifiably complete (policy.pt for each run, eval rows for all six
# runs), then the checks, lli validation and analysis are rerun on the complete data.
# Usage (Git Bash on Windows): bash drive_finish.sh
set -u
REPO_WSL="/mnt/c/Users/rvsre/Documents/compiler project"
REPO_WIN="$(cd "$(dirname "$0")" && pwd)"
EPISODES="${EPISODES:-320}"
CHUNK="${CHUNK:-150}"
RUNS="dense_s0 sparse_s0 dense_s1 sparse_s1 dense_s2 sparse_s2"

say() { echo "[finish $(date +%T)] $*"; }

run_wsl() {
  MSYS_NO_PATHCONV=1 timeout 1500 wsl -d Ubuntu --exec bash -lc \
    "cd \"$REPO_WSL\" && source ~/venvs/rlphase/bin/activate && export PYTHONWARNINGS=ignore && $1" 2>&1 \
    | tr -d '\0\r' | grep -E --line-buffered "done:|wrote|check|MISMATCH|FAIL|PASS|Traceback|Error" | cut -c1-200
  return "${PIPESTATUS[0]}"
}

until_ok() {  # until_ok <name> <command> <completion test run on Windows>
  local name="$1" cmd="$2" test="$3" n=0
  while [ $n -lt 60 ]; do
    if (cd "$REPO_WIN" && eval "$test"); then say "$name: complete"; return 0; fi
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 3 ] || { say "$name: exit $rc (attempt $n)"; sleep 20; }
  done
  say "$name: giving up"; return 1
}

check() {  # a failing check (exit 1) is reported, not retried
  local name="$1" cmd="$2" n=0
  while [ $n -lt 5 ]; do
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    case $rc in
      0) say "$name: passed"; return 0 ;;
      1) say "$name: FAILED (see results/$name.txt)"; return 1 ;;
      *) say "$name: exit $rc, retrying"; sleep 20 ;;
    esac
  done
}

for run in $RUNS; do
  mode="${run%_s*}"; seed="${run##*_s}"
  until_ok "train $run" \
    "python scripts/train.py --reward $mode --seed $seed --episodes $EPISODES --checkpoints 3 --max-seconds $CHUNK --out runs/$run >> ~/rlphase-logs/$run.log 2>&1; rc=\$?; tail -n 1 ~/rlphase-logs/$run.log; exit \$rc" \
    "[ -f runs/$run/policy.pt ] && [ -f runs/$run/run.json ]"
done
check reward_sum_check "python scripts/reward_sum_check.py > results/reward_sum_check.txt 2>&1; rc=\$?; tail -n 1 results/reward_sum_check.txt; exit \$rc"
check leakage_check "python scripts/leakage_check.py > results/leakage_check.txt 2>&1; rc=\$?; tail -n 1 results/leakage_check.txt; exit \$rc"
check overfit_check "python scripts/overfit_check.py > results/overfit_check.txt 2>&1; rc=\$?; tail -n 1 results/overfit_check.txt; exit 0"
until_ok "eval" \
  "python scripts/evaluate.py $(for r in $RUNS; do printf 'runs/%s ' "$r"; done)--out results/eval.csv" \
  "[ \"\$(python -c \"import pandas as p; d=p.read_csv('results/eval.csv'); print(d.groupby('run').size().ge(20).sum())\" 2>/dev/null)\" = 6 ]"
until_ok "lli" "python scripts/lli_validate.py && touch results/.lli_done" "[ results/.lli_done -nt results/eval.csv ]"
until_ok "analyze" "python scripts/analyze.py && touch results/.analyze_done" "[ results/.analyze_done -nt results/lli_validation.csv ]"
run_wsl "mkdir -p logs && cp ~/rlphase-logs/*.log logs/"
rm -f "$REPO_WIN/results/.lli_done" "$REPO_WIN/results/.analyze_done"
say "ALL DONE"
