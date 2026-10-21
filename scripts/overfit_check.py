"""Apply the pre-registered overfit pass rule (DESIGN.md, TRAIN-01).

Pass if, on every overfit program, the greedy policy recovers at least 80% of the
-Oz reduction from -O0: (O0 - final) >= 0.8 * (O0 - Oz). The threshold is fixed in
DESIGN.md before the overfit run; do not change it after seeing the result.
"""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.io import save_csv  # noqa: E402

THRESHOLD = 0.8

ev = pd.read_csv("results/overfit_eval.csv")
base = pd.read_csv("results/baselines.csv").set_index("benchmark")
rows = []
for _, r in ev.iterrows():
    b = base.loc[r.benchmark]
    final = r.final if pd.notna(r.final) else b.O0  # a crash counts as no reduction
    frac = (b.O0 - final) / (b.O0 - b.Oz)
    rows.append({"benchmark": r.benchmark, "O0": int(b.O0), "Oz": int(b.Oz), "final": int(final),
                 "fraction_of_Oz_reduction": round(float(frac), 4), "pass": bool(frac >= THRESHOLD)})
out = pd.DataFrame(rows)
save_csv(out, "results/overfit_check.csv")
print(out.to_string(index=False))
print(f"overfit check: {'PASS' if out['pass'].all() else 'FAIL'} (threshold {THRESHOLD:.0%} of -Oz reduction)")
