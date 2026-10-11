# Project Research Summary

**Project:** RL-Guided Compiler Phase Ordering (CompilerGym + IR2Vec + policy gradient)
**Domain:** Small-scale ML-for-compilers replication (LLVM pass sequencing for code size)
**Researched:** 2026-10-11
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a controlled replication of the full-sequence phase-ordering formulation. An MLP policy reads an IR2Vec embedding of the current IR and picks a pass from a curated 15-30 pass set. The reward is the change in IR instruction count. Results are judged by per-program size ratios against -O0/-O2/-O3 (and -Oz), aggregated by geometric mean, on train and held-out programs. The recommended architecture is five decoupled parts (compiler session, featurizer, MDP env, agent, evaluation) joined only by CSV/JSON files. That is why baselines plus random search already form a valid PRELIMINARY deliverable for 14 Oct.

The committed stack is feasible, so no swap is needed. CompilerGym 0.2.5, ir2vec 2.1.1, torch and SB3 were installed and run end to end on this laptop. The cost is a fragile install. CompilerGym is archived and frozen at 2022 dependencies, and the user's WSL is Ubuntu 26.04 with Python 3.14. Four failures stack: Python ABI, gym 0.21 build, missing libtinfo.so.5 (LLVM service returns code 127), and numpy 2. All have verified no-sudo fixes. IR2Vec is NOT a CompilerGym observation. It is called on `env.observation["Ir"]`, costs about 13 ms per step on small programs, and takes 40+ s per call on bzip2 and ghostscript, so those must be excluded from training.

The main risks are the schedule, evaluation honesty, and a misleading baseline picture. -O3 is not a size optimizer: it is larger than -O0 on qsort and equal on sha, and -Oz beats service -O3 on all 23 cBench programs. Random search is strong in the literature, so the project must beat random and a single fixed sequence, or it has shown nothing. cBench has 23 programs in near-duplicate families (tiff*, jpeg-*), so split by family with a separate validation set. Freeze the evaluation protocol before any result exists.

## Key Findings

### Recommended Stack (HIGH, all verified on this machine)

uv-managed Python 3.10 venv in WSL `~` (not /mnt/c); compiler_gym 0.2.5 (LLVM 10.0.0, 124 flags) with gym 0.21.0, installed with pip/setuptools==65.5.0/wheel==0.38.4 and `--no-build-isolation`; numpy==1.23.5 and pydantic<2; ir2vec 2.1.1 (300-d `fa`, `initEmbedding(file,"fa","p")` takes 3 args, the README `dim` argument is wrong for this wheel, wheels only to cp311); libtinfo5 extracted from the 22.04 deb onto LD_LIBRARY_PATH; torch 2.5.1 CPU; SB3 1.8.0 (last gym-based). Archive the wheels, because the repo is read-only and the datasets are Meta-hosted. Freeze with `requirements.lock`.

### Expected Features

The must-haves are T1 env, T2 family split, T3 baselines (O0/O2/O3/Oz through one counter; -O2 is not a CompilerGym observation), T4 MDP spec and action list, T5 IR2Vec state, T6 policy-gradient loop, T7 random and best-of-N baselines, T8-T10 train and held-out evaluation with geomean and wins/ties/losses, T11 dense vs sparse, T12 failure analysis, T13 logging, T14 >= 3 seeds, T15 validation and replay, T16 outputs, T17 written protocol. The cheap, high-value extras are the best fixed-sequence baseline (R4), state ablation (R6), greedy search, and cost accounting. Defer pass groups, runtime comparison, a genetic algorithm, and PPO as the headline.

### Architecture Approach

`compiler.session` is the only module importing compiler_gym, and `embed` is the only one importing ir2vec. The pieces are an action table as YAML, pure reward functions, an IR2Vec cache keyed on IrSha1 with a frozen train-set z-score normalizer, a fixed-length episode (truncation), a 2x256 MLP with a value head, an evaluation harness that counts crashes as failures, and numbered scripts. Build the agent against a `FakeEnv` on day 1.

### Critical Pitfalls

1. Install stack failure: use the pinned recipe and time-box the smoke test.
2. `env.validate()` returned "Runtime error (127)" on qsort in the PITFALLS run, cause unknown (STACK never ran it). Diagnose for 2-3 h, then use an `lli` fallback and disclose.
3. Wrong baselines or mixed counters.
4. Reward blowups: the built-in O3-normalized reward divides by max(O0-O3, 1), which is 1 on qsort.
5. Leakage and weak evaluation: family split, val set, frozen protocol, greedy headline, >= 3 seeds.
6. Policy collapse (log entropy, repeat-action mask, per-program baseline) and IR2Vec latency (cap training programs at about 15k instructions).

## Researcher Discrepancies, Reconciled

- **Python:** STACK verified the full stack, including torch and SB3, on 3.10.22. PITFALLS reproduced on 3.9 with pip 23.3.2 and found that pydantic 2.x breaks import. ir2vec wheels stop at cp311 and CompilerGym classifiers at 3.10. **Use 3.10, add `pydantic<2` defensively, treat 3.9 as a fallback, avoid 3.11+.** The pip pin (22.2 vs 23.3.2) is whichever passes the smoke test. A second Ubuntu 22.04 distro is the fallback if the 26.04 recipe or `validate()` stays broken.
- **-O2/-O3 baseline:** STACK measured qsort service O3 = 1163 but CLI `opt -O2` and `-O3` (reloaded via `Benchmark.from_file`) both = 2323. Oz matched (315 vs 316). ARCHITECTURE and PITFALLS assume the CLI and service counts match. **That is probably false, and the cause is unresolved** (STACK's untested hypothesis is that the service builds the pipeline without a target machine). Pick one method for O2/O3/Oz on every benchmark, document it, and report the service O3/Oz as a labeled secondary column. Do not assert equality as a check. Resolve this first in the baselines phase.
- **Dense vs sparse at gamma = 1:** all three files agree the dense sum telescopes to the sparse terminal reward, so the difference is variance and credit assignment, not the optimum. FEATURES suggests gamma < 1; PITFALLS says keep gamma = 1 and calls dense "myopic". The myopia claim only holds for gamma < 1. **Primary comparison at gamma = 1**, same network, hyperparameters, budget and seeds, framed as speed and stability. State the telescoping in the report. A gamma < 1 arm is optional and must be labeled as changing the objective.
- **Reward normalization:** default to c0-normalized `(prev-cur)/O0_count`, which is bounded. O3/Oz-normalized is an ablation only, with a floor.
- **Algorithm:** own REINFORCE with baseline and entropy is primary (full control of dense/sparse and diagnostics, no gym/gymnasium clash). SB3 PPO is the verified fallback or second algorithm.
- **IR2Vec cost:** 13 ms (small programs) vs 40+ s (bzip2, ghostscript) are both true. Budget from small programs.
- **Datasets:** cBench plus small suites only (npb, mibench, blas, opencv, chstone). Re-test IR2Vec per suite. Skip anghabench, poj104, github-v0 (C: is 92% full, about 40 GB free).
- **Minor:** 123 vs 124 actions (read the flags at runtime). Episode length is 20-45; choose after measuring steps/sec.

## PROPOSED DEVIATIONS FROM REVIEW 1

Consolidated from all four research files. **NONE is approved or adopted.** The user's rule: explain, then ask first.

| # | Proposal (source) | Evidence | Recommendation to put to the user |
|---|---|---|---|
| 1 | Add -Oz as an extra reference column beside -O2/-O3 (STACK D-1, FEATURES R1, PITFALLS D1) | Oz is smaller than service O3 on all 23 cBench programs (qsort O0/O3/Oz = 638/1163/315; ghostscript 406198/289350/177416). Near-zero cost. | Yes. Keep -O2/-O3 primary and remove nothing. The report must say so if the agent loses to Oz. |
| 2 | Make -Oz the headline reference instead of -O2/-O3 (FEATURES D2) | Community norm for size. | No. Item 1 is enough. |
| 3 | Add random-sequence and best-single-fixed-sequence sanity baselines (PITFALLS D2, FEATURES T7/R2/R4) | Random search beats a GNN agent on the cBench leaderboard. | Yes, cheap and credibility-critical. Label offline search as costing many compiles. |
| 4 | Train on extra small bundled suites, test on cBench families (PITFALLS D4, FEATURES D3/R5) | cBench has 23 programs in near-duplicate families, and cross-suite transfer is poor. | Yes, modestly. Fallback is a cBench-only family split. |
| 5 | Augment the state with step index, a multi-hot of applied passes, and a size feature (ARCHITECTURE D2, PITFALLS D3; STACK suggests a log-size feature) | The IR2Vec state is nearly non-Markov. | Not by default. Ablation only if learning stalls. |
| 6 | Fallback state Autophase/InstCount if IR2Vec fails (FEATURES D1, ARCHITECTURE D1) | IR2Vec now verified 23/23 on cBench. | Not needed now. Keep only as a contingency for new suites, labeled. |
| 7 | STOP action / variable-length episodes (ARCHITECTURE D3) | Harder sparse credit assignment. | No. A NOOP in the action list is enough. |
| 8 | Algorithm naming: REINFORCE+baseline first, PPO optional (FEATURES D4, ARCHITECTURE D5) | Review 1 says only "policy gradient". | Confirm the name used in the write-up with the user. |
| 9 | Replace CompilerGym with a custom `opt` env (ARCHITECTURE D4, PITFALLS D5, STACK contingency) | Multi-day work, drops a committed dependency. | No. CompilerGym works today. If the install fails, fall back to baselines plus design and ask. |

Not deviations: val split, family split, `.text` size reported at the end, NOOP, `fa` vs `sym`, excluding bzip2/ghostscript, environment fixes, the `lli` validation fallback.

## Implications for Roadmap

Suggested 7 phases (today is 11 Oct):

1. **Environment and smoke test (11 Oct, 3-4 h box).** Pinned venv in `~`, `requirements.lock`, wheel archive, `smoke_test.py` (including `validate()`), SETUP.md. Addresses T1 and T13. Avoids Pitfalls 1, 2, 3, 15, 21. Escalate to the user if red on 12 Oct.
2. **Baselines, split, eval protocol (11-12 Oct).** `splits.json` (family-level, hashed), `baselines.csv` (O0/O2/O3/Oz via one counter, with the -O3 discrepancy resolved), `EVAL_PROTOCOL.md`, and the curated action list chosen a priori (exclude `-structurizecfg` and `-gvn-sink`). This is the fallback 14 Oct deliverable. Avoids Pitfalls 4, 10, 12, 14, 16.
3. **Env wrapper, IR2Vec state, random/best-of-N baselines (12 Oct).** Session, ActionTable, c0-normalized reward with tests, cached normalized featurizer, PhaseOrderEnv, FakeEnv, logging schema, steps/sec measurement. Avoids Pitfalls 5, 6, 18, 19, 22, 23.
4. **First REINFORCE run and PRELIMINARY results (12-14 Oct).** Overfit 2-3 tiny programs first (bitcount, crc32, sha), then a short run, labeled PRELIMINARY with the budget stated, frozen as `results/prelim_*` on 14 Oct. If it is not working by 13 Oct, present Phase 2-3 outputs. Avoids Pitfalls 7, 8, 13, 14.
5. **Scale, dense vs sparse, seeds (15-17 Oct).** Larger train pool (if deviation 4 is approved), at most 4 workers, 3 seeds x 2 arms under identical config, held-out evaluation once, fixed-sequence and state-ablation checks. Check for leakage on 15 Oct.
6. **Failure analysis, validation, replay (17-19 Oct).** Regression table, action histograms, entropy, no-op fraction, validated column (or `lli` fallback), replay of all stored sequences, `.text` size on final sequences.
7. **Export and reproducibility (19-21 Oct, no new experiments on 20 Oct).** Scripted CSVs and plots, tables, demo script and screenshots from the reporting run, README, tagged commit. Runtime comparison only if time allows.

**Research flags.** Needs deeper research or measurement: Phase 1 (`validate()` 127 cause), Phase 2 (-O3 service vs CLI discrepancy, CLI -O2 route), Phase 3 (IR2Vec on non-cBench suites, per-step cost, `sym` vs `fa`), Phase 5 (training budget unmeasured). Standard patterns: Phases 4, 6, 7.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified end to end on this machine. Archive and hosting risk remain. |
| Features | MEDIUM-HIGH | Practice checked against the CompilerGym paper and CompilerDream. Cost estimates are unmeasured. |
| Architecture | MEDIUM-HIGH | Standard pattern. Some helper paths are only partly verified. |
| Pitfalls | HIGH (install, behaviour) / MEDIUM (RL practice) | The `validate()` cause is unknown. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- `validate()` fails with error 127, cause unknown.
- The -O2/-O3 method discrepancy is unresolved.
- Training budget is unmeasured.
- IR2Vec is untested outside cBench.
- A negative or non-generalizing result is plausible and reportable.
- Disk (about 40 GB free on C:) and RAM (7.8 GB) are tight.
- STACK's RLlib and numpy >= 1.24 claims are unverified but low-stakes.

## Sources

- HIGH: on-machine tests on 2026-10-11, PyPI/GitHub API, CompilerGym docs, source and issues (#833, #796, #787, #696, #103, #46), the CompilerGym paper, CompilerDream, POSET-RL.
- MEDIUM: AutoPhase via secondary summaries, general RL practice, the PyTorch and NVIDIA WSL docs.
- LOW: RLlib/Ray and numpy compatibility, MLGO and Mammadli results via PROJECT.md only, CHStone build-on-first-use (not run).

Detailed inputs: `STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md` in this directory.

---
*Research completed: 2026-10-11*
*Ready for roadmap: yes, pending user decisions on the deviations above*
