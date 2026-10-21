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
    ap.add_argument("--max-seconds", type=float, default=0, help="exit (code 3) after this long; rerun resumes")
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
    log, ckpts, sel, start = [], [], [], 1
    n_updates = args.episodes // args.batch
    ckpt_every = max(1, n_updates // args.checkpoints)
    t0 = time.time()
    # Crash-tolerant resume: the full training state is saved after every update, so a
    # WSL crash loses at most one update. Resuming changes the random stream, not the method.
    state_path = os.path.join(args.out, "state.pt")
    if os.path.exists(state_path):
        st = torch.load(state_path, weights_only=False)
        net.load_state_dict(st["net"])
        opt.load_state_dict(st["opt"])
        log, ckpts, sel, start = st["log"], st["ckpts"], st["sel"], st["u"] + 1
        random.setstate(st["py_random"])
        np.random.set_state(st["np_random"])
        torch.set_rng_state(st["torch_rng"])
        t0 -= st["seconds"]
        print(f"resumed at update {start}", flush=True)

    def save_state(u):
        st = {"net": net.state_dict(), "opt": opt.state_dict(), "log": log, "ckpts": ckpts, "sel": sel, "u": u,
              "py_random": random.getstate(), "np_random": np.random.get_state(),
              "torch_rng": torch.get_rng_state(), "seconds": time.time() - t0}
        torch.save(st, state_path + ".tmp")
        os.replace(state_path + ".tmp", state_path)

    def out_of_time():
        return args.max_seconds and time.time() - t_start > args.max_seconds

    t_start = time.time()
    try:
        for u in range(start, n_updates + 1):
            if out_of_time():
                print("chunk time limit reached; rerun to resume", flush=True)
                sys.exit(3)
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
            save_state(u)
            save_csv(pd.DataFrame(log), os.path.join(args.out, "train_log.csv"))

        # Checkpoint selection on the validation split only (never on test).
        if val:
            done = {s["checkpoint"] for s in sel}
            for path in ckpts:
                if os.path.basename(path) in done:
                    continue
                if out_of_time():
                    print("chunk time limit reached during selection; rerun to resume", flush=True)
                    sys.exit(3)
                net.load_state_dict(torch.load(path))
                red = greedy_reduction(env, net, val)
                sel.append({"checkpoint": os.path.basename(path),
                            "val_mean_reduction": float(np.mean(list(red.values()))), **red})
                save_state(n_updates)
            save_csv(pd.DataFrame(sel), os.path.join(args.out, "val_selection.csv"))
            best = os.path.join(args.out, max(sel, key=lambda s: s["val_mean_reduction"])["checkpoint"])
        else:
            best = ckpts[-1]
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
