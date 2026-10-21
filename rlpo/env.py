"""Phase-ordering MDP on top of CompilerGym's llvm-v0 environment.

State  : L2-normalised IR2Vec flow-aware program vector (300-d) of the current IR,
         plus log(current / O0 instruction count) and the fraction of the episode used.
Action : one pass from a curated list of LLVM passes, or NOOP.
Reward : reduction in IR instruction count, normalised by the -O0 count.
         dense  = per-step reduction; sparse = whole-episode reduction at the last step.
"""
import hashlib
import math
import os
import tempfile

import compiler_gym  # noqa: F401  (registers llvm-v0)
import gym
import ir2vec
import numpy as np

# Curated action list: size-relevant passes that all appear in LLVM's -Oz pipeline.
PASSES = [
    "-mem2reg", "-sroa", "-instcombine", "-simplifycfg", "-early-cse",
    "-gvn", "-dce", "-adce", "-dse", "-licm",
    "-loop-rotate", "-loop-deletion", "-indvars", "-sccp", "-ipsccp",
    "-globalopt", "-globaldce", "-deadargelim", "-inline", "-reassociate",
    "-jump-threading", "-correlated-propagation", "-tailcallelim", "-mergefunc",
]
NOOP = "NOOP"
ACTIONS = PASSES + [NOOP]
EMB_DIM = 300
STATE_DIM = EMB_DIM + 2
EPISODE_LEN = 15


def make_env():
    env = gym.make("llvm-v0")
    env.observation_space = "IrInstructionCount"
    env.reward_space = None
    return env


def bench_uri(name):
    return name if name.startswith("benchmark://") else f"benchmark://cbench-v1/{name}"


def embed_ir(ir_text):
    """IR2Vec flow-aware program vector of an LLVM IR string (written to /dev/shm)."""
    tmpdir = "/dev/shm" if os.path.isdir("/dev/shm") else None
    with tempfile.NamedTemporaryFile("w", suffix=".ll", dir=tmpdir, delete=False) as f:
        f.write(ir_text)
        path = f.name
    try:
        vec = np.asarray(ir2vec.initEmbedding(path, "fa", "p").getProgramVector(), dtype=np.float64)
    finally:
        os.unlink(path)
    if vec.shape != (EMB_DIM,) or not np.all(np.isfinite(vec)):
        raise RuntimeError(f"bad IR2Vec vector: shape={vec.shape}")
    return vec


class PhaseOrderingEnv:
    """Fixed-length episodes on one CompilerGym service, with an embedding cache.

    Pass application is deterministic, so the IR (and its embedding) after a given
    action prefix on a given benchmark never changes; caching it skips repeated
    IR2Vec calls during training. Counts always come from the live environment.
    """

    def __init__(self, episode_len=EPISODE_LEN, reward_mode="dense", cache_size=200_000):
        assert reward_mode in ("dense", "sparse")
        self.env = make_env()
        self.T = episode_len
        self.reward_mode = reward_mode
        flags = list(self.env.action_space.flags)
        missing = [p for p in PASSES if p not in flags]
        if missing:
            raise RuntimeError(f"passes missing from CompilerGym action space: {missing}")
        self.flag_index = [flags.index(p) for p in PASSES]
        self.cache = {}
        self.cache_size = cache_size
        self.o0_cache = {}

    def close(self):
        self.env.close()

    def _embedding(self):
        key = (self.uri, hashlib.sha1(",".join(map(str, self.prefix)).encode()).hexdigest())
        vec = self.cache.get(key)
        if vec is None:
            vec = embed_ir(self.env.observation["Ir"])
            norm = np.linalg.norm(vec)
            vec = vec / norm if norm > 0 else vec
            if len(self.cache) < self.cache_size:
                self.cache[key] = vec
        return vec

    def _state(self):
        size = math.log(max(self.count, 1) / self.o0)
        return np.concatenate([self.emb, [size, self.t / self.T]]).astype(np.float32)

    def reset(self, benchmark):
        self.uri = bench_uri(benchmark)
        self.env.reset(benchmark=self.uri)
        self.count = int(self.env.observation["IrInstructionCount"])
        self.o0 = self.o0_cache.setdefault(self.uri, self.count)
        self.start = self.count
        self.t = 0
        self.prefix = []  # effective (state-changing) actions only
        self.actions = []
        self.no_effect = 0
        self.emb = self._embedding()
        return self._state()

    def step(self, a):
        prev = self.count
        changed = False
        if ACTIONS[a] != NOOP:
            obs, _, done, info = self.env.step(self.flag_index[a])
            if done:
                raise RuntimeError(f"CompilerGym ended the episode early: {info}")
            self.count = int(obs)
            changed = not info.get("action_had_no_effect", False)
        self.actions.append(a)
        self.t += 1
        if changed:
            self.prefix.append(a)
            self.emb = self._embedding()
        else:
            self.no_effect += 1
        done = self.t >= self.T
        if self.reward_mode == "dense":
            r = (prev - self.count) / self.o0
        else:
            r = (self.start - self.count) / self.o0 if done else 0.0
        return self._state(), r, done
