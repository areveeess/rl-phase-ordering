# Design note: RL-guided LLVM phase ordering

## The MDP, in one sentence each

| Part | Choice | Why |
|---|---|---|
| Environment | CompilerGym `llvm-v0` (LLVM 10.0.0), cBench-v1 programs | Real LLVM behind a Gym `reset()`/`step()` API, so effort goes into learning, not tooling. |
| Episode | 15 actions starting from the unoptimised (`-O0`) IR | Fixed length keeps dense and sparse returns comparable; long enough for the useful core of `-Oz`. |
| Actions | 24 curated passes that all occur in LLVM's `-Oz` pipeline, plus `NOOP` (25 total) | All 124 CompilerGym flags would make exploration hopeless on our budget; these are the size-relevant ones. `NOOP` lets the agent stop early. |
| State | IR2Vec flow-aware 300-d program vector of the **current** IR, L2-normalised, plus `log(count / O0 count)` and the fraction of the episode used | IR2Vec turns any program into a fixed-size vector. Raw vectors are unnormalised sums (norm grows with size), so we normalise and add size back as an explicit feature. |
| Reward (dense) | `(count_before - count_after) / O0 count` after every step | Immediate feedback per pass. |
| Reward (sparse) | `(O0 count - final count) / O0 count` once, at the last step | Matches the real goal; harder credit assignment. With discount 1, both give the same episode total, so the comparison isolates *timing*. |
| Learner | REINFORCE with a learned value baseline: a 2x128 tanh MLP with policy and value heads, Adam (lr 1e-3), batch 16 episodes, entropy bonus 0.01, gradient clip 0.5 | The simplest policy-gradient method that is easy to explain; the baseline reduces variance. |
| Metric | LLVM IR instruction count (CompilerGym `IrInstructionCount`) | Deterministic and cheap, and the same counter is used for every column. |

## Evaluation protocol (fixed before any held-out run)

* **Split** (`splits/split.json`, seed 0): cBench families shuffled, then assigned to test, validation, train.
  Near-duplicates (jpeg-c/d, stringsearch/2, the four tiff tools) always stay together.
  Three programs are excluded entirely, so the split has 20 of the 23 cBench programs (9 train, 3 validation,
  8 test): `ghostscript` crashes the 8 GB WSL VM, and `jpeg-c`/`jpeg-d` crashed the WSL service twice during
  baseline measurement (and cost ~1.8 s per IR2Vec step). These exclusions were made before any evaluation.
* **Baselines** (same counter): `-O0`, `-O2`, `-O3`, `-Oz` via the bundled `opt` on the `-O0` bitcode, then reloaded
  into CompilerGym. Sanity baselines on the same action list: uniformly random sequences, and the best of 100 random
  sequences selected on the training programs only and then applied unchanged everywhere.
* **Agent**: checkpoint chosen by validation-set reduction (never test), rolled out greedily (argmax).
  Crashes count as no reduction and as losses. Every sequence is replayed from a fresh reset and must reproduce the count.
* **Overfit check (pre-registered 2026-10-21, before the overfit run started)**: the learner is trained on only
  `crc32`, `qsort` and `adpcm` (dense reward, seed 0, 320 episodes) and evaluated greedily on those same programs.
  It **passes** if, on each of the three programs, its size reduction from `-O0` is at least 80% of the `-Oz`
  reduction (`(O0 - final) >= 0.8 * (O0 - Oz)`, counts from `results/baselines.csv`). The threshold is fixed here and
  is not changed after seeing the result; `scripts/overfit_check.py` applies it and a fail is reported as a fail.
* **Training budget**: every run (dense and sparse, seeds 0, 1, 2) uses the same 320 episodes (20 updates of 16),
  3 checkpoints, and the same hyperparameters.
* **Reported**: geomean size reduction vs `-O0`, and wins/ties/losses against `-O2`, `-O3`, `-Oz` and the best fixed sequence,
  per seed, on train / validation / held-out test.

## Why `-Oz` is reported too

The metric is code size. `-O2`/`-O3` optimise for speed and often *grow* code (unrolling, vectorisation), so beating
them on size is a low bar. `-Oz` is LLVM's size pipeline and the honest reference. This was an approved addition to Review 1.

## Likely viva questions

**Why IR2Vec and not Autophase / raw counts?** It is a pretrained, general embedding of the whole IR (opcodes, types, operands, flow).
It needs no hand-picked features and works on any program size.

**Why not all 124 passes?** The search space grows as |A|^T. With a 1-hour CPU budget the agent must find useful passes quickly,
so we restricted it to passes LLVM itself uses for size.

**Why REINFORCE rather than PPO?** It is the textbook policy gradient and fits in about 50 lines. PPO (SB3) is installed-compatible
and listed as future work.

**Dense vs sparse: what is the difference if the totals are equal?** Credit assignment. Dense tells each step what it
contributed; sparse gives every step the same return, so the network has to work out which pass helped.

**Why the instruction count and not runtime?** It is deterministic, needs no execution, and is exactly what `-Oz` targets.
Runtime is noisy and expensive; it is future work on a subset.

**How do you know the optimised programs are still correct?** CompilerGym's `validate()` fails on this machine for reasons
outside the agent (see SETUP.md), so we run an `lli` output comparison on programs with known inputs. It is a weaker check,
and it is disclosed as such.

**Is it generalising or memorising?** Compare the test-set columns with the train columns, and the agent with the best fixed
sequence. If the agent only matches the best fixed sequence, it has learned a good *generic* order, not a program-specific one.

**Why might the agent lose to `-Oz`?** `-Oz` runs about 90 pass invocations; the agent has 15 steps from a 25-pass subset
and a small training budget. The comparison is still useful because it shows how much of `-Oz` a short learned sequence recovers.

## Limitations

Small budget (320 episodes per run, 3 seeds), one benchmark suite (cBench, 20 of 23 programs), LLVM 10, IR instruction count only,
greedy evaluation, and validation by `lli` on a subset of programs.
