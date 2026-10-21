# RL-Guided Compiler Phase Ordering

Compiler Design project, VIT (Department of CSE).
Aryan V Sangai (24BCI0202), Nikhila Abdul Salam (24BCE2690), Raj Vardhan Singh (24BDS0200).

LLVM applies the same fixed pass order (`-O2`, `-O3`, `-Oz`) to every program, although the best order differs from
program to program. We train a reinforcement-learning agent to pick a program-specific sequence of LLVM passes that
makes the code smaller. We then compare it with LLVM's own pipelines, including on programs the agent never saw in training.

- **Environment:** CompilerGym `llvm-v0` (LLVM 10), cBench programs
- **State:** IR2Vec embedding of the current LLVM IR
- **Actions:** 24 size-related passes from LLVM's `-Oz` pipeline, plus NOOP
- **Reward:** drop in IR instruction count (dense per step, or sparse at the end)
- **Learner:** REINFORCE with a value baseline (PyTorch)

More detail on each choice is in [DESIGN.md](DESIGN.md). Setup notes and known problems are in [SETUP.md](SETUP.md).

## Running it

CompilerGym only runs on Linux, so on Windows everything runs inside WSL2.

```bash
bash setup.sh                         # creates ~/venvs/rlphase with the pinned versions
source ~/venvs/rlphase/bin/activate
python smoke_test.py                  # checks CompilerGym, IR2Vec and output validation
bash run_all.sh                       # baselines, training, evaluation, plots -> results/
```

On our laptop the WSL VM kept crashing under long runs, so `drive.sh` (run from Git Bash on Windows) does the same
steps in short chunks and resumes after a crash.

## Code

| Path | What it does |
|---|---|
| `rlpo/env.py` | The MDP: pass list, IR2Vec state, dense/sparse reward |
| `rlpo/agent.py` | Policy/value network and the REINFORCE update |
| `rlpo/lli_check.py` | Checks that an optimised program still prints the same output (using `lli`) |
| `scripts/make_split.py` | Train / validation / test split, keeping similar programs together |
| `scripts/baselines.py` | Instruction counts after `-O0`, `-O2`, `-O3`, `-Oz` |
| `scripts/sanity_baselines.py` | Random sequences and the best fixed sequence |
| `scripts/train.py` | Training (resumable) with checkpoint choice on the validation set |
| `scripts/evaluate.py` | Runs the trained policy and replays each sequence to check it |
| `scripts/analyze.py` | Tables and plots |
| `report/` | Assessment 10 document and its figures |

## Results so far

Baselines (`results/baselines.csv`, IR instruction counts, all counted the same way): `-Oz` gives the smallest code on
every program we measured, and `-O3` is often *larger* than `-O2` because it optimises for speed. For example, bzip2:
`-O0` 28748, `-O2` 20254, `-O3` 22098, `-Oz` 15973.

The full training runs (dense vs sparse reward) and the comparison on held-out programs are still running. This section
will be updated with the numbers, whether or not the agent beats `-O2`/`-O3`/`-Oz`.

Known limitations:

- `ghostscript`, `jpeg-c` and `jpeg-d` are left out because measuring them crashed our WSL VM.
- CompilerGym's built-in `validate()` doesn't work on our machine, so correctness is checked with a weaker `lli` output comparison.

## Acknowledgement

We used Claude (Anthropic) as an AI coding assistant for parts of the implementation and documentation. Commits made
with its help are marked with a co-author line in the git history.
