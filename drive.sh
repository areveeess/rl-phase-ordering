#!/usr/bin/env bash
# Crash-tolerant driver, run from Windows (Git Bash). On this laptop the WSL VM crashes
# after a few minutes of sustained load, so every step runs in short WSL calls that
# resume from saved state, and each step is retried until it exits 0.
# Usage (Git Bash on Windows): bash drive.sh
set -u
REPO_WSL="/mnt/c/Users/rvsre/Documents/compiler project"
EPISODES="${EPISODES:-320}"
CHUNK="${CHUNK:-150}"   # seconds of training per WSL call

say() { echo "[drive $(date +%T)] $*"; }

run_wsl() {  # run one command inside WSL with the venv; returns its exit code
  MSYS_NO_PATHCONV=1 timeout 1500 wsl -d Ubuntu -- bash -lc \
    "cd \"$REPO_WSL\" && source ~/venvs/rlphase/bin/activate && export PYTHONWARNINGS=ignore && $1" 2>&1 \
    | tr -d '\0\r' | grep -E --line-buffered "resumed|done:|wrote|chunk|Traceback|Error|candidate (0|10|20|30|40):|benchmark'" | cut -c1-200
  return "${PIPESTATUS[0]}"
}

retry() {  # retry <name> <command>
  local name="$1" cmd="$2" n=0
  while [ $n -lt 40 ]; do
    n=$((n + 1))
    run_wsl "$cmd"; rc=$?
    if [ $rc -eq 0 ]; then say "$name: done"; return 0; fi
    say "$name: exit $rc (attempt $n), retrying"
    [ $rc -eq 3 ] || sleep 20   # 3 = chunk finished normally; anything else = WSL crash, let it recover
  done
  say "$name: giving up"; return 1
}

for mode in dense sparse; do
  retry "train $mode" "python scripts/train.py --reward $mode --seed 0 --episodes $EPISODES --checkpoints 3 --max-seconds $CHUNK --out runs/${mode}_s0 >> ~/rlphase-logs/${mode}_s0.log 2>&1; rc=\$?; tail -n 2 ~/rlphase-logs/${mode}_s0.log; exit \$rc"
done
retry "baselines" "python scripts/baselines.py"
retry "overfit" "python scripts/train.py --reward dense --seed 0 --episodes 320 --checkpoints 1 --max-seconds $CHUNK --train-on crc32 qsort adpcm --out runs/overfit"
retry "sanity baselines" "python scripts/sanity_baselines.py --candidates 50"
retry "eval overfit" "python scripts/evaluate.py runs/overfit --programs crc32 qsort adpcm --out results/overfit_eval.csv"
retry "eval" "python scripts/evaluate.py runs/dense_s0 runs/sparse_s0 --out results/eval.csv"
retry "lli" "python scripts/lli_validate.py"
retry "analyze" "python scripts/analyze.py"
say "ALL DONE"
