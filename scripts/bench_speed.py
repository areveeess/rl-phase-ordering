"""Time random episodes per program to size the training budget."""
import json
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rlpo.env import ACTIONS, PhaseOrderingEnv  # noqa: E402

split = json.load(open("splits/split.json"))
env = PhaseOrderingEnv()
try:
    for p in split["train"] + split["val"] + split["test"]:
        t = time.time()
        for _ in range(2):
            env.reset(p)
            done = False
            while not done:
                _, _, done = env.step(random.randrange(len(ACTIONS)))
        print(f"{p:14s} O0={env.o0:7d}  {(time.time() - t) / 2:6.2f}s/episode", flush=True)
finally:
    env.close()
