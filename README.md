# RL-Guided Compiler Phase Ordering

A reinforcement-learning agent (REINFORCE with a value baseline) learns a program-specific sequence of LLVM passes to
shrink code. It is compared against LLVM's fixed `-O2`, `-O3` and `-Oz` pipelines on cBench programs it never trained on.
Built on CompilerGym (`llvm-v0`, LLVM 10) with IR2Vec program embeddings as the state.

VIT Compiler Design project: Aryan V Sangai, Nikhila Abdul Salam, Raj Vardhan Singh.

**Results:** see [`results/RESULTS.md`](results/RESULTS.md) (generated) and the summary below.
**Design and viva notes:** [`DESIGN.md`](DESIGN.md). **Setup and known issues:** [`SETUP.md`](SETUP.md).

## Reproduce

Inside WSL2 (Ubuntu 24.04+):

```bash
cd "/mnt/c/.../compiler project"
bash setup.sh                       # pinned Python 3.10 env, ~10 min
source ~/venvs/rlphase/bin/activate
python smoke_test.py                # every line must be PASS/INFO
bash run_all.sh                     # baselines, training (6 runs), evaluation, plots; ~1 h on 16 CPU threads
```

`run_all.sh` writes everything under `results/` and `runs/`. Logs are written to `~/rlphase-logs` and copied to `logs/` at the end.

## Layout

| Path | What |
|---|---|
| `rlpo/env.py` | The MDP: actions, IR2Vec state, dense/sparse reward, embedding cache |
| `rlpo/agent.py` | Policy/value network, episode rollout, REINFORCE update |
| `rlpo/lli_check.py` | `lli` output-equivalence check (validation fallback) |
| `scripts/make_split.py` | Family-grouped train/val/test split -> `splits/split.json` |
| `scripts/baselines.py` | `-O0/-O2/-O3/-Oz` instruction counts -> `results/baselines.csv` |
| `scripts/sanity_baselines.py` | Random and best-fixed-sequence baselines |
| `scripts/train.py` | Training with validation-based checkpoint selection |
| `scripts/evaluate.py` | Greedy evaluation and replay check -> `results/eval.csv` |
| `scripts/lli_validate.py` | `lli` check of every final sequence |
| `scripts/analyze.py` | Tables, plots, `results/RESULTS.md` |

## Summary of results

**Status (21 Oct 2026, Assessment 10):** the environment, smoke test, MDP, agent, baselines and analysis pipeline all work
(see `report/` for captured output). The full dense-vs-sparse training runs and the held-out comparison are in progress.
The WSL2 VM on our laptop crashes under sustained load, so training is crash-tolerant and resumes from saved state.
This section is updated when results land.

Measured so far (`results/baselines.csv`, IR instruction counts, same counter for every column): `-Oz` is the smallest
on every program measured, and `-O3` is often *larger* than `-O2` for size (e.g. bzip2: -O0 28748, -O2 20254, -O3 22098, -Oz 15973).

Exclusions, stated up front: `ghostscript`, `jpeg-c` and `jpeg-d` are excluded because measuring them crashed the
8 GB WSL VM. CompilerGym's `env.validate()` does not work on this machine, so output correctness is checked with a
disclosed, weaker `lli` comparison (see `SETUP.md`).
