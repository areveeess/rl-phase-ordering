#!/usr/bin/env bash
# Reproduce every result in results/ (run inside WSL with the venv active).
# Notes for this machine (see SETUP.md): keep the launching wsl.exe attached (WSL stops
# the distro when no client is attached), and do not read files under /mnt/c from
# Windows while jobs write them - that has crashed the WSL service. Logs therefore go
# to the WSL disk and are copied into logs/ at the end; progress goes to stdout.
set -uo pipefail
cd "$(dirname "$0")"
export PYTHONWARNINGS=ignore
EPISODES="${EPISODES:-320}"
L="$HOME/rlphase-logs"
mkdir -p "$L" runs results
step() { echo "[run_all $(date +%T)] $*"; }

step smoke test;          python smoke_test.py > "$L/smoke.log" 2>&1; grep -E '^\[' "$L/smoke.log"
step split;               python scripts/make_split.py
# Training (TRAIN-02): dense vs sparse, identical network / hyperparameters / episode
# budget, 3 seeds each, all six in parallel. The -O levels (BASE-01), the overfit
# check (TRAIN-01) and the sanity baselines (BASE-02) run alongside.
# At most two CompilerGym jobs at a time: more than that exhausted host RAM and
# crashed the WSL VM on this 16 GB laptop.
step "training ($EPISODES episodes per run), two jobs at a time"
for seed in 0 1 2; do
  for mode in dense sparse; do
    if [ ! -f "runs/${mode}_s$seed/policy.pt" ]; then
      python scripts/train.py --reward "$mode" --seed "$seed" --episodes "$EPISODES" \
        --checkpoints 3 --out "runs/${mode}_s$seed" > "$L/${mode}_s$seed.log" 2>&1 &
    fi
  done
  wait
  step "seed $seed done"; grep -h "done:" "$L"/*_s$seed.log
done
step "overfit check and -O baselines"
[ -f runs/overfit/policy.pt ] || python scripts/train.py --reward dense --seed 0 --episodes 320 --checkpoints 1 \
  --train-on crc32 qsort adpcm --out runs/overfit > "$L/overfit.log" 2>&1 &
python scripts/baselines.py > "$L/baselines.log" 2>&1 &
wait
step "sanity baselines"; python scripts/sanity_baselines.py --candidates 50 > "$L/sanity.log" 2>&1
grep -h -E "done:|Traceback|Error" "$L"/*_s*.log "$L/overfit.log" "$L/sanity.log" | head -20

step evaluation
python scripts/evaluate.py runs/overfit --programs crc32 qsort adpcm --out results/overfit_eval.csv > "$L/overfit_eval.log" 2>&1
python scripts/evaluate.py runs/dense_s* runs/sparse_s* --out results/eval.csv > "$L/eval.log" 2>&1; tail -n 1 "$L/eval.log"
step checks
for c in reward_sum_check leakage_check overfit_check; do   # outputs: results/<name>.txt
  python scripts/$c.py > "results/$c.txt" 2>&1; tail -n 1 "results/$c.txt"
done
step lli validation;      python scripts/lli_validate.py > "$L/lli.log" 2>&1
step analysis;            python scripts/analyze.py > "$L/analyze.log" 2>&1; cat "$L/analyze.log"
mkdir -p logs && cp "$L"/*.log logs/
step done
