"""Greedy evaluation of trained policies on train / val / held-out test (EVAL-01, EVAL-03).

For each run directory, the selected policy is rolled out greedily on every program.
The resulting pass sequence is then replayed from a fresh reset on a separate
CompilerGym service and must reproduce the same instruction count. A program that
raises an error is recorded as a failure (final = O0, i.e. no reduction), never dropped.
"""
import argparse
import json
import os
import sys
import traceback

import pandas as pd
import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.agent import PolicyValueNet, run_episode  # noqa: E402
from rlpo.env import ACTIONS, NOOP, STATE_DIM, PhaseOrderingEnv, bench_uri, make_env  # noqa: E402


def replay(env, program, actions):
    env.reset(benchmark=bench_uri(program))
    flags = list(env.action_space.flags)
    for a in actions:
        if ACTIONS[a] != NOOP:
            env.step(flags.index(ACTIONS[a]))
    return int(env.observation["IrInstructionCount"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="+")
    ap.add_argument("--out", default="results/eval.csv")
    ap.add_argument("--splits", nargs="+", default=["train", "val", "test"])
    ap.add_argument("--programs", nargs="+", help="evaluate these programs only (labelled 'train')")
    args = ap.parse_args()

    split = json.load(open("splits/split.json"))
    if args.programs:
        split, args.splits = {"train": args.programs}, ["train"]
    env = PhaseOrderingEnv()
    renv = make_env()
    rows = []
    try:
        for run in args.runs:
            meta = json.load(open(os.path.join(run, "run.json")))
            net = PolicyValueNet(STATE_DIM, len(ACTIONS))
            net.load_state_dict(torch.load(os.path.join(run, "policy.pt")))
            net.eval()
            for s in args.splits:
                for p in split[s]:
                    row = {"run": os.path.basename(run.rstrip("/")), "reward": meta["reward"],
                           "seed": meta["seed"], "split": s, "benchmark": p}
                    try:
                        ep = run_episode(env, net, p, greedy=True)
                        seq = [ACTIONS[a] for a in ep["actions"]]
                        rep = replay(renv, p, ep["actions"])
                        row.update(O0=ep["o0"], final=ep["final"], sequence=" ".join(seq),
                                   noop_count=seq.count(NOOP), no_effect=ep["no_effect"],
                                   replay_final=rep, replay_ok=rep == ep["final"], error="")
                    except Exception as e:  # noqa: BLE001  crash = failure, kept in the table
                        traceback.print_exc()
                        row.update(final=None, sequence="", replay_ok=False, error=f"{type(e).__name__}: {e}")
                    rows.append(row)
                    print(row, flush=True)
    finally:
        env.close()
        renv.close()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    pd.DataFrame(rows).to_csv(args.out, index=False)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
