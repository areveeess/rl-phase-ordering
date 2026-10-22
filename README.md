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

## Frontend

A static results explorer in `web/` lets you inspect all benchmark comparisons, per-program sequences, training curves, and sanity checks with no WSL and no network connection. An optional Live tab runs a trained policy through a small server in WSL to stream step-by-step CompilerGym optimisations.

To open the explorer locally, double-click `web/index.html` or start a local static file server:

```bash
python -m http.server -d web 8000
```

and open `http://127.0.0.1:8000/`. It is also available on GitHub Pages after the repository owner enables Pages with source "GitHub Actions" in repository settings and runs the "Deploy web explorer" workflow by hand.

To regenerate its data:

```bash
# Inside WSL with the venv active (replays stored sequences into web/traces.json):
python scripts/export_traces.py

# From the repository root (builds web/data.json and web/data.js from results/, splits/, and local runs/):
python scripts/export_web.py

# Verify data equality and vendored asset hashes:
python scripts/check_web.py --require-traces
python scripts/check_vendor.py

# Run the design gate across all routes:
bash scripts/web_gate.sh
```

To run the live server in WSL from the repository root with the venv active:

```bash
python web/server.py
```

Then open `http://localhost:8765/`. The server listens on `127.0.0.1` only, runs one policy at a time and refuses a second concurrent run, and the page compares each live result with `results/eval.csv`.

Neither the export scripts nor the server ever write to `results/` or `runs/`.

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
| `scripts/supplementary.py` | Summary table of the supplementary 2000-episode runs |
| `report/` | Assessment 10 document (updated with the final results) and its figures |
| `web/` | Static results explorer (plain HTML/CSS/JS, vendored assets) |
| `web/server.py` | Local live execution server (WSL, stdlib only, port 8765) |
| `scripts/export_web.py`, `check_web.py` | Builds `web/data.json` and verifies data equality against `results/` |
| `scripts/export_traces.py` | Replays stored sequences into `web/traces.json` in WSL |
| `scripts/web_gate.sh` | Design taste gate and visual measurement suite |

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

### Supplementary: 2000-episode runs (one seed each, added after the main results)

This experiment was added **after** seeing the main results, to test whether the near-uniform policies are just a
training-budget problem. It uses the same code, split, reward definitions and validation-based checkpoint selection, but
2000 training episodes (125 updates) instead of 320, and **only one seed (0) per reward type**. It does not replace the
main 3-seed numbers above. Data: [results/long_eval.csv](results/long_eval.csv) (driver: `drive_long.sh`); the table is generated by `scripts/supplementary.py` ([results/long_summary.md](results/long_summary.md)).

| run | held-out test reduction | vs `-O2` | vs `-O3` | vs `-Oz` | vs best fixed | distinct greedy sequences (all 20 / test 8) | entropy first → last | checkpoint chosen on val |
|---|---|---|---|---|---|---|---|---|
| dense, 2000 ep | 41.4% | 7 / 0 / 1 | 7 / 0 / 1 | 0 / 0 / 8 | 0 / 0 / 8 | 7 / 3 | 3.22 → 2.19 | update 75 (1200 ep) |
| sparse, 2000 ep | 38.2% | 6 / 1 / 1 | 7 / 0 / 1 | 0 / 0 / 8 | 0 / 0 / 8 | 1 / 1 | 3.22 → 1.83 | update 25 (400 ep) |

(For reference on the same test programs: `-O2` 30.6%, `-O3` 27.0%, `-Oz` 49.1%, best fixed sequence 47.3%.)

- With more training the policies do move away from uniform (entropy falls to about 1.8–2.2 nats, against about 3.18 after
  320 episodes), so the main runs were indeed under-trained.
- **The extra training does not change the conclusion.** The agent still beats `-O3` on 7 of 8 held-out programs and `-O2` on 6 to 7 of 8, and
  still loses to `-Oz` and to the best fixed sequence on all 8.
- The dense policy now outputs some `-sroa` repeats followed by `-instcombine` repeats, with the number of `-sroa` repeats
  depending on the program. That gives 7 distinct strings, but in effect it is the same two-pass sequence
  (`-sroa -instcombine`) everywhere: 13 of its 15 steps change nothing on most programs. It is the best RL result we have
  (41.4%, one seed), still 7.7 points short of `-Oz`.
- The sparse run's validation selection chose its earliest checkpoint (400 episodes), because the later checkpoints were
  no better on validation. Its greedy sequence is `-sroa` ×15 on every program, the same collapse as the main runs.
- All 40 evaluations replay to the same count from a fresh reset, with no errors.

**What this means:**

- **The learned policy beats `-O2` and `-O3` on code size on held-out programs, but loses to `-Oz`.** It also loses to a
  single fixed random sequence picked on the training programs. `-O2`/`-O3` optimise for speed and often grow code
  (on qsort, `-O2` gives 2323 instructions against 638 at `-O0`), so beating them on size is a low bar. `-Oz` is the honest
  reference, and the agent does not reach it.
- **The policy is not program-specific.** 5 of the 6 trained policies output the same greedy sequence for every program:
  `-sroa` repeated 15 times. On 17 of the 20 programs only the first application changes anything; on the other 3 a
  few later ones still remove instructions. The sixth (sparse, seed 0) outputs
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
[held-out per program](results/heldout_per_program.png), [validation, dense vs sparse](results/val_dense_vs_sparse.png), [passes chosen](results/action_histogram.png).

Known limitations:

- The training budget (320 episodes, 20 policy updates) is far too small for REINFORCE to move away from a near-uniform policy.
- `ghostscript`, `jpeg-c` and `jpeg-d` are left out because measuring them crashed our WSL VM.
- CompilerGym's built-in `validate()` doesn't work on our machine, so correctness is checked with a weaker `lli` output comparison.
- One benchmark suite (cBench, 20 of 23 programs), LLVM 10, IR instruction count only, greedy evaluation.

## Acknowledgement

We used Claude (Anthropic) as an AI coding assistant for parts of the implementation and documentation. Commits made
with its help are marked with a co-author line in the git history.
