#!/usr/bin/env bash
# Single-seed finish (time-boxed submission): wait for the seed-0 dense/sparse runs,
# then baselines, overfit check, sanity baselines, evaluation, lli check and analysis.
# Two CompilerGym jobs at a time at most (more crashed the WSL VM on this laptop).
set -uo pipefail
cd "$(dirname "$0")"
export PYTHONWARNINGS=ignore
L="$HOME/rlphase-logs"
step() { echo "[finish $(date +%T)] $*"; }

EPISODES="${EPISODES:-320}"
mkdir -p "$L" runs results
# One CompilerGym job at a time: the host has ~2-3 GB free RAM and larger loads kill the WSL VM.
for mode in dense sparse; do
  [ -f "runs/${mode}_s0/policy.pt" ] && continue
  step "training $mode, seed 0 ($EPISODES episodes)"
  python scripts/train.py --reward "$mode" --seed 0 --episodes "$EPISODES"     --out "runs/${mode}_s0" > "$L/${mode}_s0.log" 2>&1 &
  while [ -n "$(jobs -rp)" ]; do
    sleep 60
    echo "  $mode: $(grep '"update"' "$L/${mode}_s0.log" | tail -n 1 | grep -oE '"episodes": [0-9]+|"seconds": [0-9.]+|"mean_reduction": [0-9.]+' | tr '
' ' ')"
  done
  grep -h -E "done:|Error" "$L/${mode}_s0.log"
done

step "overfit check + -O baselines"
python scripts/baselines.py > "$L/baselines.log" 2>&1; tail -n 1 "$L/baselines.log"
[ -f runs/overfit/policy.pt ] || python scripts/train.py --reward dense --seed 0 --episodes 320 --checkpoints 1 \
  --train-on crc32 qsort adpcm --out runs/overfit > "$L/overfit.log" 2>&1
step "sanity baselines";  python scripts/sanity_baselines.py --candidates 50 > "$L/sanity.log" 2>&1; tail -n 1 "$L/sanity.log"
step evaluation
python scripts/evaluate.py runs/overfit --programs crc32 qsort adpcm --out results/overfit_eval.csv > "$L/overfit_eval.log" 2>&1
python scripts/evaluate.py runs/dense_s0 runs/sparse_s0 --out results/eval.csv > "$L/eval.log" 2>&1; tail -n 1 "$L/eval.log"
step "lli validation";    python scripts/lli_validate.py > "$L/lli.log" 2>&1
step analysis;            python scripts/analyze.py > "$L/analyze.log" 2>&1; tail -n 30 "$L/analyze.log"
mkdir -p logs && cp "$L"/*.log logs/
step done
