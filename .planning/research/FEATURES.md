# Feature Research

**Domain:** RL-guided LLVM phase ordering, student replication scale (CompilerGym + IR2Vec + policy gradient)
**Researched:** 2026-10-11
**Confidence:** MEDIUM-HIGH (evaluation practice and baselines verified against the CompilerGym docs/paper and CompilerDream; per-step cost estimates and the IR2Vec integration route are unverified, see Gaps)

"Features" here means capabilities of the pipeline and experiment suite, not product features.

**Feasibility key** (today is 11 Oct; 14 Oct is about 3 days away, 21 Oct about 10 days away):
- **14-Oct** = feasible for the early-results deadline
- **21-Oct** = feasible for the final deadline but not realistic by 14 Oct
- **Stretch** = only if everything else is done

**Complexity key:** LOW (under half a day), MED (about 1 day), HIGH (2 or more days or high uncertainty).

---

## What the field actually does (calibration for "credible")

| Practice | What papers do | Source / confidence |
|----------|----------------|---------------------|
| Primary metric | **Geometric mean** of per-benchmark reduction ratio relative to a reference compiler pipeline. For size: `-Oz`. Value > 1.0 means better than the reference. CompilerGym's own reward spaces `IrInstructionCountOz` / `IrInstructionCountO3` are scaled by the reference's improvement, with success threshold 1.0. | CompilerGym docs, CompilerGym paper, CompilerDream (HIGH) |
| Reference pipeline | **`-Oz` is the standard for code size**; `-O3` is for runtime. The CompilerGym paper reports "geomean over -Oz for code and binary size, over -O3 for runtime". POSET-RL compares against Oz. Review 1 specifies `-O2`/`-O3`, so `-Oz` should be added as the fairer size reference (see Recommended Additions). | CompilerGym paper, POSET-RL (HIGH) |
| Size metric | IR instruction count (`IrInstructionCount`) is the cheap, deterministic, platform-independent default. CompilerGym docs state it "is not a measure of true codesize reduction" because it ignores lowering. `ObjectTextSizeBytes` is closer to real size but costlier and platform-dependent. POSET-RL uses object-file size. | CompilerGym docs (HIGH) |
| Episode shape | Fixed horizon of **45 steps** (CompilerGym paper and CompilerDream). AutoPhase found little gain going from 12 to 24 passes. | HIGH |
| Baselines in CompilerGym paper | Autotuners: **random search, greedy search**, plus LaMCTS, Nevergrad, OpenTuner. RL: PPO, A2C, APEX, IMPALA (PPO generally best). | HIGH |
| Baselines in CompilerDream (cBench leaderboard) | Random Search (1.061x at 1 h, 1.062x at 3 h), Greedy (1.055x), GATv2+DD-PPO (1.047x), PPO + guided search (1.070x). On the general-optimization table: -O0 0.481, random policy 0.737, random search 0.858, PPO-Autophase 1.010 (cBench geomean vs -Oz). | HIGH for numbers as reported |
| Key calibration fact | **Random search is a strong baseline.** On the cBench leaderboard it beat a GNN+DD-PPO agent. A small replication should expect to land near or below `-Oz` and must show it beats random, or it has shown nothing. | CompilerDream table (HIGH) |
| Generalization | CompilerGym paper: a PPO agent trained on Csmith reached 1.245x on Csmith test but 0.567x on GitHub and 0.723x on TensorFlow. "Agents perform best on the dataset they were trained on." A negative held-out result is the normal finding, not an anomaly. | CompilerGym paper (HIGH) |
| Splits | CompilerDream: datasets over 100 programs use first 50 test / next 50 validation / rest train; datasets under 100 (cBench=23, CHStone, MiBench) are test-only. | CompilerDream (HIGH) |
| Seeds / non-determinism | Experiments reporting min-max or std were replicated with **3 seeds** (CompilerDream). CompilerGym paper: IR-instruction-count is deterministic; **runtime is non-deterministic** (median of 3 during search, median of 30 for final numbers); replaying states exposed a real LLVM bug (`-gvn-sink` sorted by pointer address, now removed). Checkpoint selection on a validation split. | HIGH |
| Validation | Differential testing of runnable benchmarks (cBench is "partially validatable"); most other datasets (csmith, llvm-stress, anghabench, poj104, etc.) are **not** validatable. `compiler_gym.bin.validate` and `env.validate()` check that optimized binaries still behave identically. | CompilerGym docs (HIGH) |
| AutoPhase-style evidence | Compared RL vs genetic algorithm vs random vs greedy vs `-O3`; observed RL and GA reach similar quality, RL cheaper per sample. | MEDIUM (secondary summary) |
| POSET-RL-style evidence | Reported min/avg/max size reduction vs Oz per suite; avg gains small (1.9% MiBench, 6.2% SPEC17 x86) and the manual sub-sequence variant had negative minimums. Reporting the *worst case* per benchmark is part of honest practice. | HIGH |

Important IR2Vec note: the CompilerGym LLVM observation list documents Autophase, InstCount, Inst2vec, ProGraML, raw IR and BitcodeFile. **IR2Vec is not a built-in CompilerGym observation space** (the docs list Inst2vec instead). IR2Vec has to be computed outside CompilerGym on the module's IR/bitcode at each step. This is the single most expensive integration item (see dependencies).

---

## Feature Landscape

### Table Stakes (results are not credible without these)

All of these map to Review 1 objectives unless stated.

| # | Feature | Why Expected | Complexity | Feasible by | Notes |
|---|---------|--------------|------------|-------------|-------|
| T1 | Working CompilerGym `llvm-v0` env on WSL2 with written, re-runnable setup steps | Nothing else exists without it. Main schedule risk. | MED-HIGH | 14-Oct (gate) | Pin Python/LLVM versions; record in README. Smoke test: reset, apply 3 passes, read instruction count. If this is not green by 12 Oct, escalate. |
| T2 | Fixed, documented benchmark subset with **disjoint train / held-out split** (split by program, written to a file and committed) | Without a split there is no generalization claim (Review 1 obj. 4). | LOW | 14-Oct | cBench has only 23 programs, so a test set of about 5-7 is high-variance; report per-program numbers, not just the mean. Consider also a larger training set (see Recommended Additions R5). Fix the split before looking at results. |
| T3 | Measured `-O0`, `-O2`, `-O3` baselines (instruction count) on every train and test program, exported to CSV | Review 1 obj. 3. These are the yardsticks. | LOW-MED | 14-Oct | `-O0/-O3/-Oz` counts are built-in observations (`IrInstructionCountO0/O3/Oz`). **`-O2` is not a built-in CompilerGym baseline**, so it needs a small helper (run LLVM `opt -O2` on the bitcode and count instructions) and must use the same counter as the env. Verify that the helper's count matches the env's count on `-O3` as a cross-check. |
| T4 | MDP definition implemented and documented: state = IR2Vec vector of current IR; action = pass (or pass group) from a curated subset; reward = change in instruction count; fixed episode length; defined termination | Review 1 primary objective. | MED | 14-Oct (design + code skeleton) | Write the MDP as a one-page spec (state dim, action list, reward formula, gamma, horizon). The curated action list should be explicit and justified (about 15-40 passes, drawn from the -Oz pipeline, e.g. mem2reg, simplifycfg, instcombine, gvn, sroa, early-cse, dce/adce, inline, licm, loop-simplify, sccp, reassociate, jump-threading). |
| T5 | IR2Vec state extraction wired to the env, cached by IR hash, with a normalization step | Review 1 obj. 1. | HIGH | 14-Oct if it works first try; otherwise 21-Oct | Highest-uncertainty item (not built into CompilerGym). See deviation D1 for the fallback if blocked. Normalize/standardize the vector; check it actually changes after passes (a state that never changes makes the policy blind). |
| T6 | Policy-gradient training loop (REINFORCE with a baseline, or PPO) with a small MLP policy over the IR2Vec vector | Review 1 obj. 2. | MED | 14-Oct for a short run; 21-Oct for the full run | Keep it simple: REINFORCE + moving-average or learned value baseline is the cheapest correct choice; PPO is the field's choice but adds tuning risk. Entropy bonus matters in small action spaces. Algorithm choice is a planning decision. |
| T7 | **Random-policy / random-search baseline over the same action space and same horizon** | Reviewers' first question: "does the agent beat random?" CompilerGym and CompilerDream both treat random search as the key sanity baseline. Cheap and prevents a misleading claim. Listed as an addition in the change-control wording but treated here as credibility-critical. | LOW | 14-Oct | Same step budget as the agent. Report best-of-N random as well as mean random. |
| T8 | Evaluation of the trained policy vs `-O2`/`-O3` on **training** programs | Review 1 obj. 3. | LOW (once T3, T6 exist) | 14-Oct | Report per-program ratio, geomean, wins/ties/losses count. |
| T9 | Evaluation on **held-out** programs vs `-O2`/`-O3` | Review 1 obj. 4. | LOW (once T8 exists) | 14-Oct if training finishes; else 21-Oct | Identical code path as T8, never touch held-out data during training or hyperparameter selection. |
| T10 | Metric computation: per-program ratio relative to baseline, **geometric mean**, wins/ties/losses, min/max | Standard reporting; geomean is the convention because ratios are multiplicative. | LOW | 14-Oct | Define the ratio direction once (e.g. `baseline_count / agent_count`, > 1 means agent better) and use it everywhere. Never average raw percentages across programs without saying so. |
| T11 | **Dense vs sparse reward comparison** | Review 1 obj. 5. | MED | 21-Oct (a single-seed pilot may be possible by 14-Oct) | Dense = per-step delta in instruction count (normalized by the `-O0` count). Sparse = a single terminal reward (final reduction, or final reduction vs a reference) with zero reward in between. Analytic caveat, see Pitfall note below. Needs at least 3 seeds per arm to say anything. |
| T12 | Failure-case analysis | Review 1 obj. 5. | MED | 21-Oct | Concrete, evidence-backed: per-program regression table (programs where agent is worse than `-O3`/`-Oz`), action histograms (does policy collapse to one pass or to no-ops?), policy entropy over training, reward curve, state-sensitivity (does action choice vary with state?), examples where a random sequence beats the policy. Collecting the raw data (histograms, per-program CSV) is cheap and should be built into the training/eval loop from the start; writing it up happens late. |
| T13 | Reproducibility basics: fixed seeds, config file (YAML/JSON) per run, run log, saved checkpoints, pinned dependency versions, CSV output of every table | Course submission must be re-runnable; honest reporting depends on it. | LOW-MED | 14-Oct (start), 21-Oct (complete) | Save the exact action sequence found per program so any result can be replayed. Log git commit/config with each result file. |
| T14 | **Multiple seeds (>= 3) for any claim the agent is better/worse than something** | Field convention (CompilerDream: 3 seeds). A single RL run is an anecdote. | MED (compute-bound) | 21-Oct | Small MLP + small programs make this affordable. For 14-Oct, one seed clearly labeled "preliminary, 1 seed". |
| T15 | Semantic-validity check of produced sequences where possible (cBench `validate`), plus determinism check (replay each final sequence twice, require identical count) | CompilerGym itself found nondeterministic/buggy passes by replay. A "size win" from a miscompile is not a win. | LOW-MED | 21-Oct | Validation is only available for cBench; say so explicitly for other datasets. Note: instruction count is deterministic, so the determinism check should pass, and a failure indicates a real bug. |
| T16 | Result presentation: CSV of per-program results, summary table (geomean + wins/losses), at least a learning-curve plot and a per-program bar/ratio plot, and demo screenshots | Assessment 9/10 deliverables. | LOW-MED | 14-Oct (baseline table + one plot), 21-Oct (all) | Plots from CSVs by script so they can be regenerated. |
| T17 | Honest-reporting rule: report negative results, report the worst programs, fix the evaluation protocol before running the final eval | Project Core Value and Integrity constraint. | LOW | 14-Oct | Write the protocol in the repo before the final runs (what the metric is, which reference, how many seeds, which checkpoint rule). |

**Pitfall note on T11 (dense vs sparse), mathematically important for framing:** with gamma = 1, same normalization and no shaping, the sum of per-step dense rewards telescopes to exactly the sparse terminal reward, so the two have identical expected return and differ only in gradient variance and credit assignment (and in interaction with discounting, return normalization and baselines). Frame the ablation as "does the agent learn faster / more stably", not "which reward is better in value", and state gamma. If dense and sparse are made literally equivalent, the experiment shows nothing. Choose a sparse variant that differs meaningfully (terminal-only, optionally with an explicit stop action) and use gamma < 1 or reward-to-go to keep the contrast real.

### Recommended Additions (cheap, high value; NOT table stakes; none departs from Review 1's approach)

| # | Feature | Value | Complexity | Feasible by | Notes |
|---|---------|-------|------------|-------------|-------|
| R1 | **`-Oz` baseline reported alongside `-O2`/`-O3`** | `-Oz` is the community reference for code size; `-O2/-O3` are not size-targeted pipelines, so beating them on size is a weaker claim and beating `-Oz` is the one reviewers know. Built-in observation `IrInstructionCountOz`, so near-zero cost. | LOW | 14-Oct | Report all four (-O0, -O2, -O3, -Oz). Review 1's `-O2`/`-O3` comparison stays primary. |
| R2 | **Best-of-N search upper bound / "oracle"** over the same action space (e.g. random search with N = 100-1000 rollouts per program, keep best; and/or greedy hill-climb that applies the best single pass until no gain) | Tells the reader how much headroom the action space even has. If best-of-N random does not beat `-O3`, a learned policy cannot be expected to. Also the two baselines CompilerGym itself uses. | LOW-MED | 14-Oct (random best-of-N); 21-Oct (greedy) | Mark clearly as an *offline per-program search* (many compiles at test time), not comparable in cost to a single policy rollout. Report compile-count budget next to each number. |
| R3 | Report policy at two inference modes: deterministic (argmax) single rollout, and best-of-K sampled rollouts | Separates "what the policy learned" from "what search over the policy buys". CompilerDream uses guided search over the policy and gains about 0.4-0.5%. | LOW | 21-Oct | Primary headline = single deterministic rollout. |
| R4 | Fixed-sequence baselines: `-Oz`-derived pass list replayed as the action sequence, and "single best fixed sequence found on the training set, applied to all test programs" | The second one is the key generalization sanity check: a program-independent sequence is the null hypothesis for "the policy uses the state". If the policy cannot beat one fixed sequence, the state is not helping. | LOW | 21-Oct | Strongly recommended; cheap given R2's machinery. |
| R5 | Larger training pool than the test set (e.g. train on Csmith/other generated or bundled programs, test on cBench) | cBench has 23 programs; training on a handful leaves nothing to generalize from. Note from the CompilerGym paper that cross-domain generalization is hard, so set expectations. | LOW-MED | 21-Oct | Pick datasets that exist offline in CompilerGym; Csmith programs are not validatable, so validation covers cBench only. This is still a within-Review-1 train/held-out design; flagged because it changes dataset choice. |
| R6 | State-ablation: policy given random/zero state vs IR2Vec state | Shows whether IR2Vec carries useful information. Pairs naturally with R4. | LOW | 21-Oct | Few lines of code if the policy takes the state as an input. |
| R7 | Learning-curve and reward-vs-step plots with mean +/- std over seeds | Standard figure. | LOW | 21-Oct | |
| R8 | Per-episode cost accounting (env steps, wall-clock, compiles) in every result table | Makes agent vs search comparisons honest. | LOW | 21-Oct | |

### Differentiators (add value beyond baseline replication; do only after table stakes are green)

| # | Feature | Value Proposition | Complexity | Feasible by | Notes |
|---|---------|-------------------|------------|-------------|-------|
| D-1 | Dependency-aware pass groups (POSET-RL-style sub-sequences) as an alternative action space | Review 1 already lists this as optional. Reduces horizon and exploits pass interactions. | MED-HIGH | Stretch | Needs the Oz dependence graph (can approximate by taking runs from the Oz pass list). Only after the single-pass version works. |
| D-2 | Runtime comparison on a few benchmarks (median of >= 10 runs, pinned CPU, report variance) | Already in PROJECT.md as secondary. | MED-HIGH (WSL2 timing noise is high) | Stretch | If done at all: cBench only (runnable), report median and spread, and state WSL2 as a noise source. CompilerGym used median of 30 for final numbers. Do not make claims on a size-trained policy beyond "also measured". |
| D-3 | Second metric: `ObjectTextSizeBytes` on the final IR for the same sequences | Closer to real code size than IR instruction count; shows IR-count wins carry through lowering. | LOW-MED | 21-Oct / stretch | Only recompute for final sequences (not per step), so cost is small. Platform-dependent; state target. |
| D-4 | Reward-normalization variants (raw delta vs normalized by `-O0` vs scaled by `-Oz` gain) | Directly informs the dense-vs-sparse story and training stability. | LOW-MED | Stretch | |
| D-5 | Genetic algorithm baseline | AutoPhase compared GA; common reviewer ask. | MED | Stretch | R2 (random best-of-N plus greedy) already gives the search-baseline coverage; a GA adds little. |
| D-6 | Policy-interpretability plot (pass frequency by program feature, PCA of IR2Vec states colored by chosen action) | Good material for the failure analysis section. | LOW-MED | 21-Oct if time | |
| D-7 | One-command demo script that takes a bitcode/C file, shows -O0/-O2/-O3/-Oz/agent counts and the chosen pass list | Makes the demo screenshots quick and credible. | LOW-MED | 21-Oct | A thin CLI over the existing evaluation code. |

### Anti-Features (deliberately do not build)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Searching the full ~120-pass list as the action space | "More freedom, better results" | Intractable for the time/compute; the project explicitly rules it out. Sparse learning signal. | Curated 15-40 pass subset. |
| Hyperparameter-tuning on the held-out set, or choosing checkpoints by held-out score | Natural way to "get a better number" | Destroys the generalization claim and the Integrity constraint. | Carve a small validation split from training programs, or fix hyperparameters in advance. |
| Reporting only the mean percentage across programs, or only the best programs | Looks better | A few large wins dominate arithmetic means; hides regressions. | Geomean + wins/ties/losses + per-program table including worst cases. |
| Reimplementing AutoPhase / POSET-RL / MLGO as comparison baselines | Fills a related-work table | Out of scope; consumes days. | Cite their published numbers as context, clearly labelled as different setups. |
| Fancy architectures (GNNs over ProGraML, transformers, world models) | State of the art on the leaderboard | CompilerDream's world model took about 1.8 days to train; GATv2+DD-PPO underperformed random search on the leaderboard. Review 1 commits to IR2Vec + policy gradient. | MLP over IR2Vec. |
| Distributed training (RLlib, multi-node), hyperparameter sweep infrastructure | Looks professional | One laptop; setup time exceeds the benefit. | Single process, a handful of configs, 3 seeds. |
| Large-scale benchmark suites (anghabench with about 1M programs, SPEC) | "More data" | Not needed; SPEC is proprietary; time cost for data handling. | cBench plus one more bundled set. |
| Building a custom LLVM env bypassing CompilerGym | If install fails | Changes the committed dependency, costs weeks. | Resolve the install; if it truly cannot work, escalate (change control). |
| Runtime as the training reward | Real performance is the end goal | Noisy, slow, non-deterministic, especially under WSL2. | Static size reward; runtime only as a secondary measurement (D-2). |
| Backend/register-allocation/scheduling work | Scope creep | Explicitly out of scope. | Not applicable. |
| Real-time dashboards, web UIs, experiment-tracking servers | Demo polish | Time sink for a course deliverable. | CSV + matplotlib plots + a CLI demo script. |
| Claiming "beats LLVM" from single-seed, training-set results | A tempting headline | Not credible; contradicts the Integrity constraint. | State separately: train-set vs held-out, number of seeds, reference compiler. |

---

## PROPOSED DEVIATIONS FROM REVIEW 1 (require user approval before adoption)

None of these is needed to deliver Review 1 as written. Each is contingent or optional.

| ID | What | Why | Cost | Recommendation |
|----|------|-----|------|----------------|
| D1 | **Fallback state encoding**: if the IR2Vec integration is not working by about 12-13 Oct, temporarily train with CompilerGym's built-in `Autophase` (56-dim) or `InstCountNorm` observation, and add IR2Vec later | IR2Vec is not a built-in CompilerGym observation; it must be computed externally from the IR at every step. If that integration blocks, the whole 14-Oct early run is blocked. Autophase is what AutoPhase and the CompilerGym leaderboard used, so the fallback is credible. | LOW (observation name swap) but changes the stated state encoding of the MDP | Pre-approve as a *contingency only*; do not adopt unless T5 is blocked. Label any such run "preliminary, Autophase state". |
| D2 | **Change the headline reference from `-O2`/`-O3` to `-Oz`** (keeping `-O2/-O3` reported) | `-Oz` is the size-optimized pipeline and the community norm for size; Review 1 names `-O2/-O3`. Note: if the reward is normalized by `-Oz`, the success threshold is 1.0 in the CompilerGym convention. | LOW | Prefer R1 (report all, keep Review 1 comparison primary). Only a deviation if you want to *change* the primary. |
| D3 | Using a dataset outside the bundled cBench for training (e.g. Csmith-generated programs) with cBench as held-out | cBench is too small for a meaningful train/test split (23 programs). The CompilerGym paper shows cross-domain transfer is poor, so expect honest negative results. | LOW-MED (dataset download size; Csmith programs not validatable) | Optional; fits Review 1's "training programs / held-out programs" wording, so arguably not a deviation. Flag so the decision is explicit. |
| D4 | PPO instead of REINFORCE | PPO is the best-performing RL algorithm in CompilerGym's evaluation. | MED (tuning risk) | Both are "policy gradient" per Review 1; no deviation. Listed only so the choice is deliberate. Prefer REINFORCE+baseline for 14-Oct, PPO only if time remains. |

---

## Feature Dependencies

```
T1 Env working (WSL2)
  |-- T3 -O0/-O2/-O3 baselines (+R1 -Oz)
  |       |-- T10 metrics/geomean
  |       |-- T16 baseline table (14-Oct deliverable)
  |-- T2 Benchmark split
  |-- T7 Random baseline (needs only T1 + T4 action list)
  |-- T5 IR2Vec state  (HIGH risk)  --requires--> T1, IR from env (Ir / BitcodeFile)
          |-- T4 MDP spec (action list, reward, horizon)
          |-- T6 Policy-gradient loop
                  |-- T8 Train-set eval vs O2/O3
                  |       |-- T9 Held-out eval
                  |-- T11 Dense vs sparse (needs T6 + reward switch)
                  |-- T14 Multi-seed (needs T6 stable)
                  |-- T12 Failure analysis (needs logged histograms from T6/T8/T9)
                  |-- R6 State ablation (needs T5, T6)
T13 Logging/seeds/configs ---enhances---> everything; must exist before T6 runs
T15 Validate/replay ---requires---> saved action sequences (T13)
R2 Best-of-N / greedy ---requires---> T1 + T4 action list; R4 fixed-sequence ---requires---> R2
D-3 Object text size ---requires---> saved sequences
```

### Dependency Notes

- **T5 gates T6 for real runs.** A random policy and all search baselines (T7, R2) do *not* need IR2Vec, so they can run while IR2Vec is debugged. This makes the 14-Oct fallback (measured baselines + search results + design) real rather than empty.
- **T13 before T6.** If sequences, seeds and configs are not saved from the first run, results cannot be audited, and T12/T15 lose their raw material.
- **T4's action list is shared** by the agent, random baseline and greedy/oracle: define it once, in one config file, so all comparisons use the same action space.
- **T11 conflicts with its own rigor if rewards are made equivalent** (see pitfall note): define the sparse variant before implementing, so the experiment can differ.
- **T9 must not influence T6/T11 choices**: held-out programs are evaluated once, after configurations are frozen.
- **D-2 (runtime) conflicts with the time budget**; schedule only after T16 is complete.

---

## MVP Definition

### Launch With (14-Oct, early results)

Feasible in about 3 days, in this priority order (each item is a gate for the next):

- [ ] T1 environment green (gate; if red on 12 Oct, escalate)
- [ ] T2 split file committed
- [ ] T3 + R1 `-O0/-O2/-O3/-Oz` measured on train and test programs, CSV exported
- [ ] T4 MDP spec written, curated action list fixed
- [ ] T7 random baseline (and R2 best-of-N random) using the same action list
- [ ] T10 + T16 geomean metric, baseline table, one plot
- [ ] T5 + T6 attempt: IR2Vec state plus a *short* policy-gradient run (one seed, small number of episodes), evaluated on train programs vs `-O2/-O3`; labeled "preliminary, 1 seed"
- [ ] T13 logging and saved sequences from the first run

**Fallback if T5/T6 are not working by 13 Oct:** present T1-T4, T7, T10, T16 (real measured baselines plus the random/best-of-N search headroom) with the MDP/pipeline design, labeled preliminary. This is already consistent with the PROJECT.md decision.

### Add After 14-Oct (by 21-Oct, final deliverable)

- [ ] T6 full training runs, T8 train evaluation, T9 held-out evaluation (the central deliverable)
- [ ] T14 three seeds per arm
- [ ] T11 dense vs sparse comparison (3 seeds per arm, same protocol)
- [ ] T12 failure-case analysis (per-program regressions, action histograms, entropy, state-sensitivity)
- [ ] T15 validate/replay checks on final sequences
- [ ] R4 fixed-sequence baseline and R6 state ablation (the two cheapest checks that the policy uses the state)
- [ ] R2 greedy baseline; R3 inference modes; R7/R8 plots and cost accounting
- [ ] T16 completed: tables, plots, demo screenshots; D-7 demo script
- [ ] T17 written evaluation protocol in the repo

### Future Consideration (stretch / beyond course)

- [ ] D-1 POSET-RL pass-group action space
- [ ] D-2 runtime comparison (cBench subset)
- [ ] D-3 object text size second metric
- [ ] D-4 reward normalization variants
- [ ] D-5 genetic algorithm baseline
- [ ] PPO in place of REINFORCE (D4)

---

## Feature Prioritization Matrix

| Feature | Credibility Value | Implementation Cost | Priority |
|---------|-------------------|---------------------|----------|
| T1 Env working | HIGH | MED-HIGH | P1 |
| T2 Train/held-out split | HIGH | LOW | P1 |
| T3 -O0/-O2/-O3 baselines | HIGH | LOW-MED | P1 |
| R1 -Oz baseline | HIGH | LOW | P1 |
| T4 MDP spec + action list | HIGH | MED | P1 |
| T7 Random baseline | HIGH | LOW | P1 |
| T5 IR2Vec state | HIGH | HIGH | P1 |
| T6 Policy-gradient loop | HIGH | MED | P1 |
| T8/T9 Train and held-out eval | HIGH | LOW | P1 |
| T10 Geomean + wins/losses | HIGH | LOW | P1 |
| T13 Repro basics | HIGH | LOW-MED | P1 |
| T14 3 seeds | HIGH | MED | P1 (21-Oct) |
| T11 Dense vs sparse | HIGH (Review 1) | MED | P1 (21-Oct) |
| T12 Failure analysis | HIGH (Review 1) | MED | P1 (21-Oct) |
| T15 Validate/replay | MED-HIGH | LOW-MED | P1 (21-Oct) |
| T16 Tables/plots/screenshots | HIGH | LOW-MED | P1 |
| R2 Best-of-N / greedy oracle | HIGH | LOW-MED | P2 |
| R4 Fixed best-sequence baseline | HIGH | LOW | P2 |
| R6 State ablation | MED | LOW | P2 |
| R3 Inference modes | MED | LOW | P2 |
| R5 Larger training pool | MED | LOW-MED | P2 |
| D-7 Demo script | MED | LOW-MED | P2 |
| D-3 Object text size | MED | LOW-MED | P3 |
| D-2 Runtime | LOW-MED | MED-HIGH | P3 |
| D-1 Pass groups | MED | MED-HIGH | P3 |
| D-5 Genetic algorithm | LOW | MED | P3 |

**Priority key:** P1 must have, P2 should have, P3 nice to have.

---

## Reference Systems Feature Comparison

| Feature | CompilerGym paper | CompilerDream | POSET-RL | AutoPhase | Our Approach |
|---------|-------------------|---------------|----------|-----------|--------------|
| Metric | Geomean vs Oz (size), O3 (runtime) | Geomean IR-count reduction vs Oz | Min/avg/max size reduction vs Oz; throughput via MCA | Cycle-count speedup vs -O3 | Geomean + wins/losses vs O2, O3 (and Oz) |
| Baselines | Random, greedy, LaMCTS, Nevergrad, OpenTuner; A2C/APEX/IMPALA/PPO | -O0, -Oz, random policy, random search, PPO, Coreset | Oz; manual vs ODG sub-sequences | -O3, random, greedy, GA, OpenTuner variants | -O0/O2/O3/Oz, random, best-of-N, greedy, fixed-sequence |
| Seeds | 10 repeats for autotuners | 3 | Not stated | Not stated | >= 3 |
| Generalization | Train Csmith, test across 13 datasets; mostly fails | Train CodeContests; zero-shot to cBench/NPB/etc. | Train and test on separate suites | 100 training programs, 12k test | Disjoint train/held-out programs, per-program reporting |
| Validation | Differential testing, sanitizers | Not emphasized | Not emphasized | N/A (HLS) | cBench `validate` + replay determinism |

## Sources

- CompilerGym LLVM environment documentation (reward spaces, observation spaces, datasets, validation): http://compilergym.com/llvm/index.html (HIGH)
- CompilerGym: Robust, Performant Compiler Optimization Environments for AI Research (Cummins et al., CGO 2022): https://arxiv.org/html/2109.08267v2 (HIGH; autotuner and RL baselines, geomean over -Oz, reproducibility bug in gvn-sink, runtime nondeterminism, generalization numbers)
- CompilerDream: Learning a Compiler World Model for General Code Optimization: https://arxiv.org/html/2404.16077v2 (HIGH; leaderboard table, splits, geomean metric, 3 seeds, 45-step episodes)
- POSET-RL: https://arxiv.org/pdf/2208.04238 (HIGH for evaluation structure)
- AutoPhase: https://ar5iv.labs.arxiv.org/html/1901.04615 (MEDIUM; baseline set from secondary summaries)
- Project context: C:/Users/rvsre/Documents/compiler project/.planning/PROJECT.md

## Gaps

- **IR2Vec integration route and per-step cost** not verified (not built into CompilerGym per its docs). The Stack researcher should confirm the package/CLI, its LLVM version compatibility with CompilerGym's bundled LLVM (IR emitted by CompilerGym's LLVM 10 may not parse under a newer IR2Vec build), and per-step runtime. This is the main risk to the 14-Oct early-run feasibility labels above.
- **`-O2` measurement route** inside CompilerGym is not built-in; the helper approach in T3 is unverified.
- **Training-budget estimates** (episodes, wall-clock for 3 seeds x 2 reward arms) are unmeasured; feasibility labels for T14/T11 assume a small MLP and cBench-sized programs and should be confirmed after one timed run.
- CompilerGym install on WSL2/current Python was not confirmed by this research (maintenance status unclear; repo last pushed Oct 2024 per a secondary source). Owned by the Stack/Pitfalls researchers.

---
*Feature research for: RL-guided LLVM phase ordering, student replication*
*Researched: 2026-10-11*
