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
steps in short chunks and resumes after a crash. `drive.sh` trains seed 0 of each reward mode; `drive_seeds.sh`, started
after it, adds seeds 1 and 2, runs the reward-sum, leakage and overfit checks, and re-evaluates and analyses all six runs.

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
| `scripts/overfit_check.py`, `leakage_check.py`, `reward_sum_check.py` | Pre-registered overfit rule, no test program in training or checkpoint choice, dense rewards sum to the sparse reward |
| `report/` | Assessment 10 document and its figures |

## Results

All numbers come from `scripts/analyze.py` ([results/RESULTS.md](results/RESULTS.md)). They use LLVM IR instruction
counts from one counter for every column. The setup is 3 seeds per reward type, 320 training episodes per run, and the
checkpoint chosen on the validation split. "Reduction" is 1 − geomean(final / `-O0`); higher is better.

**Held-out test programs (8 programs the agent never trained on):**

| `-O2` | `-O3` | `-Oz` | random sequence | best fixed sequence | RL dense (3 seeds) | RL sparse (3 seeds) |
|---|---|---|---|---|---|---|
| 30.6% | 27.0% | **49.1%** | 19.9% | 47.3% | 38.2% ± 0.0 | 40.5% ± 3.2 |

Wins/ties/losses of each RL run against each reference on the 8 test programs:

| reference | RL dense, each seed | RL sparse, each seed |
|---|---|---|
| `-O2` | 6 / 1 / 1 | 7/0/1, 6/1/1, 6/1/1 |
| `-O3` | 7 / 0 / 1 | 7 / 0 / 1 |
| `-Oz` | 0 / 0 / 8 | 1/0/7, 0/0/8, 0/0/8 |
| best fixed sequence | 0 / 0 / 8 | 0 / 0 / 8 |

**What this means:**

- **The learned policy beats `-O2` and `-O3` on code size on held-out programs, but loses to `-Oz`.** It also loses to a
  single fixed random sequence picked on the training programs. `-O2`/`-O3` optimise for speed and often grow code
  (on qsort, `-O2` gives 2323 instructions against 638 at `-O0`), so beating them on size is a low bar. `-Oz` is the honest
  reference, and the agent does not reach it.
- **The policy is not program-specific.** 5 of the 6 trained policies output the same greedy sequence for every program:
  `-sroa` repeated 15 times, where only the first application changes anything. The sixth (sparse, seed 0) outputs
  `-sroa` followed by `-gvn`. That is why the dense runs have zero spread: different weights, identical greedy output.
- **Why: the policies are barely trained.** Policy entropy moved only from 3.22 to about 3.18 nats (the maximum for 25
  actions is 3.22), so after 320 episodes the policy is still close to uniform. Greedy (argmax) evaluation turns its small
  preference for `-sroa` into a one-pass sequence. A single `-sroa` already removes about 38% of the instructions, which is
  enough to beat `-O2`/`-O3` on these programs.
- **Dense vs sparse:** no meaningful difference. Sparse is ahead on average only because of one seed (sparse seed 0 found
  `-sroa -gvn`).
- **Overfit check (pre-registered rule: at least 80% of the `-Oz` reduction on crc32, qsort and adpcm):** PASS (0.92, 0.91,
  0.81). The overfit policy is also `-sroa` ×15, so the rule turned out to be passable by a one-pass sequence. It was
  fixed in advance and is reported as is ([results/overfit_check.txt](results/overfit_check.txt)).
- **Checks:**
  - All 120 evaluations replay to the same count from a fresh reset, with no crashes, and no program ends larger than `-O0`.
  - The `lli` output comparison matched on all 42 sequences it could check; the other 78 are recorded as "not available".
  - Dense step rewards sum exactly to the sparse reward ([results/reward_sum_check.txt](results/reward_sum_check.txt)).
  - No test program was used for training or checkpoint selection ([results/leakage_check.txt](results/leakage_check.txt)).

Plots: [training curves](results/training_curves.png), [entropy and NOOP use](results/entropy_noop.png),
[held-out per program](results/heldout_per_program.png), [passes chosen](results/action_histogram.png).

Known limitations:

- The training budget (320 episodes, 20 policy updates) is far too small for REINFORCE to move away from a near-uniform policy.
- `ghostscript`, `jpeg-c` and `jpeg-d` are left out because measuring them crashed our WSL VM.
- CompilerGym's built-in `validate()` doesn't work on our machine, so correctness is checked with a weaker `lli` output comparison.
- One benchmark suite (cBench, 20 of 23 programs), LLVM 10, IR instruction count only, greedy evaluation.

## Acknowledgement

We used Claude (Anthropic) as an AI coding assistant for parts of the implementation and documentation. Commits made
with its help are marked with a co-author line in the git history.
