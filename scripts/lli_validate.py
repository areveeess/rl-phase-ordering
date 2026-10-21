"""lli output check of every final RL sequence (validated yes / no / not available)."""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.env import ACTIONS, make_env  # noqa: E402
from rlpo.lli_check import lli_equivalent  # noqa: E402

ev = pd.read_csv("results/eval.csv")
env = make_env()
rows = []
try:
    for _, r in ev.iterrows():
        if not isinstance(r.sequence, str) or not r.sequence:
            status = "not available (no sequence)"
        else:
            try:
                status = lli_equivalent(env, r.benchmark, [ACTIONS.index(a) for a in r.sequence.split()])
            except Exception as e:  # noqa: BLE001
                status = f"error: {type(e).__name__}"
        rows.append({"run": r.run, "benchmark": r.benchmark, "split": r.split, "lli_check": status})
        print(rows[-1], flush=True)
finally:
    env.close()
pd.DataFrame(rows).to_csv("results/lli_validation.csv", index=False)
