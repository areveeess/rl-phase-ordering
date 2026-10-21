#!/usr/bin/env bash
# Reproduce every result in results/ (run inside WSL with the venv active).
# Keep the launching wsl.exe attached: WSL stops the distro when no client is attached,
# and starting other wsl.exe sessions while this runs has crashed the WSL service here.
set -uo pipefail
cd "$(dirname "$0")"
export PYTHONWARNINGS=ignore
EPISODES="${EPISODES:-800}"
mkdir -p logs runs results
step() { echo "[run_all $(date +%T)] $*"; }

step smoke test;          python smoke_test.py > logs/smoke.log 2>&1
step split;               python scripts/make_split.py
step baselines;           python scripts/baselines.py > logs/baselines.log 2>&1

# Training (TRAIN-02): dense vs sparse, identical network / hyperparameters / episode
# budget, 3 seeds each, all six in parallel. The overfit check (TRAIN-01) and the
# sanity baselines (BASE-02) run alongside.
step training, overfit check and sanity baselines
for seed in 0 1 2; do
  for mode in dense sparse; do
    python scripts/train.py --reward "$mode" --seed "$seed" --episodes "$EPISODES" \
      --out "runs/${mode}_s$seed" > "logs/${mode}_s$seed.log" 2>&1 &
  done
done
python scripts/train.py --reward dense --seed 0 --episodes 480 --checkpoints 1 \
  --train-on crc32 qsort adpcm --out runs/overfit > logs/overfit.log 2>&1 &
python scripts/sanity_baselines.py > logs/sanity.log 2>&1 &
wait

step evaluation
python scripts/evaluate.py runs/overfit --programs crc32 qsort adpcm --out results/overfit_eval.csv > logs/overfit_eval.log 2>&1
python scripts/evaluate.py runs/dense_s* runs/sparse_s* --out results/eval.csv > logs/eval.log 2>&1
step lli validation;      python scripts/lli_validate.py > logs/lli.log 2>&1
step analysis;            python scripts/analyze.py > logs/analyze.log 2>&1
step done
