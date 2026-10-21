"""Check that no held-out test program reached training or checkpoint selection (TRAIN-02).

For every runs/*_s*/ directory: the training programs in run.json and the programs
scored in val_selection.csv must not include any test program, and the training
programs must equal the split's train list. Exits 1 on any violation.
"""
import glob
import json
import os
import sys

import pandas as pd

split = json.load(open("splits/split.json"))
test = set(split["test"])
problems, rows = [], []
for run in sorted(glob.glob("runs/*_s[0-9]*")):
    meta = json.load(open(os.path.join(run, "run.json")))
    train = set(meta["train_programs"])
    sel_path = os.path.join(run, "val_selection.csv")
    selected_on = set(pd.read_csv(sel_path).columns) - {"checkpoint", "val_mean_reduction"} if os.path.exists(sel_path) else set()
    leak = (train | selected_on) & test
    if leak:
        problems.append(f"{run}: test programs used: {sorted(leak)}")
    if train != set(split["train"]):
        problems.append(f"{run}: train programs differ from split.json")
    if selected_on != set(split["val"]):
        problems.append(f"{run}: checkpoint selection not on exactly the validation split")
    rows.append(f"{run}: train={len(train)} selection={sorted(selected_on)} test-overlap={sorted(leak) or 'none'}")
print("\n".join(rows))
if problems:
    print("LEAKAGE CHECK FAILED\n" + "\n".join(problems))
    sys.exit(1)
print(f"leakage check: OK ({len(rows)} runs, no test program used in training or selection)")
