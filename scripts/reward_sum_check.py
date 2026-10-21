"""Check that dense step rewards sum to the sparse episode reward (MDP-03).

The same random action sequence is played on each program in dense and in sparse
mode; with discount 1 the two returns must be equal (up to float rounding).
Exits 1 on any mismatch.
"""
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.env import ACTIONS, EPISODE_LEN, PhaseOrderingEnv  # noqa: E402

random.seed(0)
split = json.load(open("splits/split.json"))
programs = split["train"][:3]
envs = {m: PhaseOrderingEnv(reward_mode=m) for m in ("dense", "sparse")}
bad = 0
try:
    for p in programs:
        for _ in range(3):
            seq = [random.randrange(len(ACTIONS)) for _ in range(EPISODE_LEN)]
            ret = {}
            for mode, env in envs.items():
                env.reset(p)
                ret[mode] = sum(env.step(a)[1] for a in seq)
            ok = abs(ret["dense"] - ret["sparse"]) < 1e-9
            bad += not ok
            print(f"{p}: dense {ret['dense']:.6f} sparse {ret['sparse']:.6f} {'ok' if ok else 'MISMATCH'}", flush=True)
finally:
    for env in envs.values():
        env.close()
print(f"reward sum check: {'OK' if not bad else f'{bad} MISMATCHES'}")
sys.exit(1 if bad else 0)
