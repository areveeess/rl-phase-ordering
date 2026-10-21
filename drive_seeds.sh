#!/usr/bin/env bash
# Second stage of the crash-tolerant driver: seeds 1 and 2 for both reward modes (TRAIN-02
# asks for 3 seeds; drive.sh trains seed 0 only), then the checks, evaluation of all six
# runs, lli validation and analysis. Start it only after drive.sh has printed ALL DONE.
# Usage (Git Bash on Windows): bash drive_seeds.sh
set -u
REPO_WSL="/mnt/c/Users/rvsre/Documents/compiler project"
EPISODES="${EPISODES:-320}"   # must match drive.sh so all seeds share one budget
CHUNK="${CHUNK:-150}"

say() { echo "[seeds $(date +%T)] $*"; }

run_wsl() {
  MSYS_NO_PATHCONV=1 timeout 1500 wsl -d Ubuntu --exec bash -lc \
    "cd \"$REPO_WSL\" && source ~/venvs/rlphase/bin/activate && export PYTHONWARNINGS=ignore && $1" 2>&1 \
    | tr -d '\0\r' | grep -E --line-buffered "resumed|done:|wrote|check|ok|MISMATCH|FAIL|PASS|Traceback|Error|benchmark'" | cut -c1-200
  return "${PIPESTATUS[0]}"
}

retry() {  # retry <name> <command>; exit 3 = chunk finished, anything else = WSL crash
  local name="$1" cmd="$2" n=0
  while [ $n -lt 40 ]; do
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    if [ $rc -eq 0 ]; then say "$name: done"; return 0; fi
    say "$name: exit $rc (attempt $n), retrying"
    [ $rc -eq 3 ] || sleep 20
  done
  say "$name: giving up"; return 1
}

check() {  # check <name> <command>; a failing check (exit 1) is reported, not retried
  local name="$1" cmd="$2" n=0
  while [ $n -lt 5 ]; do
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    case $rc in
      0) say "$name: passed"; return 0 ;;
      1) say "$name: FAILED (see results/$name.txt)"; return 1 ;;
      *) say "$name: exit $rc (WSL crash?), retrying"; sleep 20 ;;
    esac
  done
}

for seed in 1 2; do
  for mode in dense sparse; do
    retry "train ${mode}_s$seed" "python scripts/train.py --reward $mode --seed $seed --episodes $EPISODES --checkpoints 3 --max-seconds $CHUNK --out runs/${mode}_s$seed >> ~/rlphase-logs/${mode}_s$seed.log 2>&1; rc=\$?; tail -n 2 ~/rlphase-logs/${mode}_s$seed.log; exit \$rc"
  done
done
check reward_sum_check "python scripts/reward_sum_check.py > results/reward_sum_check.txt 2>&1; rc=\$?; tail -n 1 results/reward_sum_check.txt; exit \$rc"
check leakage_check "python scripts/leakage_check.py > results/leakage_check.txt 2>&1; rc=\$?; tail -n 1 results/leakage_check.txt; exit \$rc"
check overfit_check "python scripts/overfit_check.py > results/overfit_check.txt 2>&1; rc=\$?; tail -n 1 results/overfit_check.txt; exit 0"
retry "eval" "python scripts/evaluate.py runs/dense_s0 runs/sparse_s0 runs/dense_s1 runs/sparse_s1 runs/dense_s2 runs/sparse_s2 --out results/eval.csv"
retry "lli" "python scripts/lli_validate.py"
retry "analyze" "python scripts/analyze.py"
retry "copy logs" "mkdir -p logs && cp ~/rlphase-logs/*.log logs/"
say "ALL DONE"
