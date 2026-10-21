"""Sanity baselines on the same action list and episode length as the agent (BASE-02).

* random: the mean final count of 10 uniformly random action sequences per program.
* best fixed sequence: 100 random sequences are scored on the TRAIN programs only
  (geometric mean of final/O0); the best one is then applied unchanged to every program.
"""
import argparse
import json
import os
import random
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.io import save_csv  # noqa: E402
from rlpo.env import ACTIONS, EPISODE_LEN, NOOP, bench_uri, make_env  # noqa: E402


def final_count(env, program, seq):
    env.reset(benchmark=bench_uri(program))
    flags = list(env.action_space.flags)
    for a in seq:
        if ACTIONS[a] != NOOP:
            env.step(flags.index(ACTIONS[a]))
    return int(env.observation["IrInstructionCount"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", type=int, default=100)
    ap.add_argument("--random", type=int, default=10)
    ap.add_argument("--out", default="results/sanity_baselines.csv")
    args = ap.parse_args()

    rng = random.Random(0)
    cands = [[rng.randrange(len(ACTIONS)) for _ in range(EPISODE_LEN)] for _ in range(args.candidates)]
    split = json.load(open("splits/split.json"))
    env = make_env()
    # Resumable: every (candidate, program) count is cached on disk as it is measured.
    cache_path = os.path.splitext(args.out)[0] + "_cache.json"
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}

    def final_count_cached(env, p, seq):
        key = f"{' '.join(map(str, seq))}|{p}"
        if key not in cache:
            cache[key] = final_count(env, p, seq)
            with open(cache_path + ".tmp", "w") as fh:
                json.dump(cache, fh)
            os.replace(cache_path + ".tmp", cache_path)
        return cache[key]

    try:
        o0 = {}
        for s in ("train", "val", "test"):
            for p in split[s]:
                env.reset(benchmark=bench_uri(p))
                o0[p] = int(env.observation["IrInstructionCount"])

        scores = []
        train_counts = {}
        for i, seq in enumerate(cands):
            counts = {p: final_count_cached(env, p, seq) for p in split["train"]}
            train_counts[i] = counts
            scores.append(float(np.exp(np.mean([np.log(counts[p] / o0[p]) for p in split["train"]]))))
            print(f"candidate {i}: train geomean final/O0 = {scores[-1]:.4f}", flush=True)
        best = int(np.argmin(scores))
        best_seq = cands[best]

        rows = []
        for s in ("train", "val", "test"):
            for p in split[s]:
                rand = [train_counts[i][p] if p in split["train"] else final_count_cached(env, p, cands[i])
                        for i in range(args.random)]
                fixed = train_counts[best][p] if p in split["train"] else final_count_cached(env, p, best_seq)
                rows.append({"split": s, "benchmark": p, "O0": o0[p], "random_mean": float(np.mean(rand)),
                             "random_best": min(rand), "best_fixed": fixed})
                print(rows[-1], flush=True)
    finally:
        env.close()
    save_csv(pd.DataFrame(rows), args.out)
    with open(os.path.splitext(args.out)[0] + "_best_fixed_sequence.txt", "w") as fh:
        fh.write(" ".join(ACTIONS[a] for a in best_seq) + "\n")
    print("best fixed sequence:", " ".join(ACTIONS[a] for a in best_seq))


if __name__ == "__main__":
    main()
