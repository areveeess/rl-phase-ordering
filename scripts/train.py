"""Train a REINFORCE-with-baseline phase-ordering policy (TRAIN-01, TRAIN-02).

Dense and sparse runs use the same network, hyperparameters and episode budget;
only the reward timing differs. Checkpoints are saved at regular intervals and the
one with the best greedy size reduction on the validation split is kept.
"""
import argparse
import json
import os
import random
import sys
import time

import numpy as np
import pandas as pd
import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.io import save_csv  # noqa: E402
from rlpo.agent import PolicyValueNet, reinforce_update, run_episode  # noqa: E402
from rlpo.env import ACTIONS, NOOP, STATE_DIM, PhaseOrderingEnv  # noqa: E402

NOOP_ID = ACTIONS.index(NOOP)


def greedy_reduction(env, net, programs):
    out = {}
    for p in programs:
        ep = run_episode(env, net, p, greedy=True)
        out[p] = (ep["o0"] - ep["final"]) / ep["o0"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reward", choices=["dense", "sparse"], required=True)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--episodes", type=int, default=2000)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--checkpoints", type=int, default=5)
    ap.add_argument("--train-on", nargs="*", help="override training programs (overfit check)")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    torch.set_num_threads(1)  # several runs share the CPU
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    os.makedirs(args.out, exist_ok=True)
    split = json.load(open("splits/split.json"))
    train = args.train_on or split["train"]
    val = [] if args.train_on else split["val"]

    env = PhaseOrderingEnv(reward_mode=args.reward)
    net = PolicyValueNet(STATE_DIM, len(ACTIONS))
    opt = torch.optim.Adam(net.parameters(), lr=args.lr)
    log, ckpts = [], []
    n_updates = args.episodes // args.batch
    ckpt_every = max(1, n_updates // args.checkpoints)
    t0 = time.time()
    try:
        for u in range(1, n_updates + 1):
            eps = [run_episode(env, net, random.choice(train)) for _ in range(args.batch)]
            stats = reinforce_update(net, opt, eps)
            acts = np.concatenate([e["actions"] for e in eps])
            log.append({
                "update": u, "episodes": u * args.batch, "seconds": round(time.time() - t0, 1),
                "mean_reduction": float(np.mean([(e["o0"] - e["final"]) / e["o0"] for e in eps])),
                "noop_frac": float(np.mean(acts == NOOP_ID)),
                "no_effect_frac": float(np.mean([e["no_effect"] / len(e["actions"]) for e in eps])),
                **stats,
            })
            if u % 10 == 0:
                print(json.dumps(log[-1]), flush=True)
            if u % ckpt_every == 0 or u == n_updates:
                path = os.path.join(args.out, f"ckpt_{u:05d}.pt")
                torch.save(net.state_dict(), path)
                ckpts.append(path)
        save_csv(pd.DataFrame(log), os.path.join(args.out, "train_log.csv"))

        # Checkpoint selection on the validation split only (never on test).
        best, best_score, sel = ckpts[-1], -1e9, []
        if val:
            for path in ckpts:
                net.load_state_dict(torch.load(path))
                red = greedy_reduction(env, net, val)
                score = float(np.mean(list(red.values())))
                sel.append({"checkpoint": os.path.basename(path), "val_mean_reduction": score, **red})
                if score > best_score:
                    best, best_score = path, score
            save_csv(pd.DataFrame(sel), os.path.join(args.out, "val_selection.csv"))
        net.load_state_dict(torch.load(best))
        torch.save(net.state_dict(), os.path.join(args.out, "policy.pt"))
        json.dump({**vars(args), "selected": os.path.basename(best), "train_programs": train,
                   "wall_seconds": round(time.time() - t0, 1), "embedding_cache": len(env.cache)},
                  open(os.path.join(args.out, "run.json"), "w"), indent=2)
        print(f"done: selected {best}, {time.time() - t0:.0f}s", flush=True)
    finally:
        env.close()


if __name__ == "__main__":
    main()
