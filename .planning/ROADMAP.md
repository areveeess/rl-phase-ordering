# Roadmap: RL-Guided Compiler Phase Ordering

## Overview

This roadmap takes the project from an empty directory to two course submissions: a PRELIMINARY results package for Assessment 9 (14 Oct 2026) and the final code, results and demo screenshots for Assessment 10 (21 Oct 2026). The path is: make CompilerGym and IR2Vec run reproducibly in WSL2, fix how success is measured (family-level split, `-O0/-O2/-O3/-Oz` baselines, frozen protocol), define the MDP and the random/fixed-sequence baselines, get a REINFORCE-with-baseline agent learning on tiny programs, then train dense vs sparse reward with multiple seeds, evaluate honestly on held-out programs, and package everything so it regenerates from scripts. Phases 1-4 end at the 14 Oct deadline; Phases 5-7 end at the 21 Oct deadline. Every phase ends in something that can be explained in one sentence in the presentation or viva. Results are reported as measured, whether or not the agent beats `-O2`/`-O3`.

## Deadline Mapping

Dates are targets against fixed course deadlines, not effort estimates.

| Checkpoint | Due | Phases | What must exist |
|------------|-----|--------|-----------------|
| Assessment 9 (presentation) | 14 Oct 2026 | 1-4 | OUT-01: real results labeled PRELIMINARY (short training run if it works, otherwise measured baselines plus the MDP design) |
| Assessment 10 (code, results, screenshots) | 21 Oct 2026 | 5-7 | OUT-02 and OUT-03, plus the final dense-vs-sparse, held-out and failure-analysis results |

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Environment Setup** - A reproducible WSL2 environment where CompilerGym, IR2Vec and output validation all run
- [ ] **Phase 2: Benchmark Split and Reference Baselines** - Family-level train/validation/held-out split, frozen evaluation protocol, and measured `-O0/-O2/-O3/-Oz` sizes
- [ ] **Phase 3: MDP and Sanity Baselines** - The phase-ordering MDP is defined and runnable, with random and best-fixed-sequence baselines to beat
- [ ] **Phase 4: First Training Run and Preliminary Results** - REINFORCE-with-baseline passes an overfit check; the 14 Oct PRELIMINARY package is frozen
- [ ] **Phase 5: Dense vs Sparse Training** - Both reward variants trained with identical settings and at least 3 seeds each
- [ ] **Phase 6: Evaluation and Failure Analysis** - Honest train and held-out comparison against `-O2/-O3/-Oz`, failure-case analysis, and replay of every stored sequence
- [ ] **Phase 7: Final Outputs** - Scripted tables and plots, demo screenshots, reproducing README and the one-page design note for 21 Oct

## Phase Details

### Phase 1: Environment Setup
**Goal:** A fresh WSL2 shell can run the whole toolchain end to end, so every later phase builds on a working, reproducible environment.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Target window**: 11 Oct (3-4 hour time box; if the smoke test is still red on 12 Oct, escalate to the user rather than continuing silently)
**Requirements**: ENV-01
**Success Criteria** (what must be TRUE):
  1. Following only the written setup steps in WSL2 produces the pinned Python 3.10 environment, and a lock file and saved wheels exist so it can be rebuilt without re-downloading.
  2. One smoke-test command opens a cBench program in the CompilerGym LLVM environment, applies a pass, and gets an IR2Vec embedding of the resulting IR.
  3. Output validation either passes on a benchmark, or the `lli` output-check fallback is in place and its use is disclosed in the setup notes (not silently skipped).
**Plans**: TBD

### Phase 2: Benchmark Split and Reference Baselines
**Goal:** Fix how success will be measured before anything is trained: which programs are train, validation and held-out, and what `-O0/-O2/-O3/-Oz` achieve on them.
**Mode:** mvp
**Depends on**: Phase 1
**Target window**: 11-12 Oct
**Requirements**: DATA-01, BASE-01
**Success Criteria** (what must be TRUE):
  1. A saved split file assigns every chosen benchmark to train, validation or held-out test by program family, and near-duplicate programs (for example the `tiff*` and `jpeg-*` groups) are never split across sets.
  2. A written evaluation protocol (metrics, how crashes are counted, when the held-out set may be used) is saved and frozen before any held-out run.
  3. A baselines CSV lists `-O0`, `-O2`, `-O3` and `-Oz` size per benchmark, all produced through one consistent counter, with the method documented, including how the service-vs-CLI `-O3` size difference was resolved rather than assumed away.
  4. The baselines CSV can be shown as a labeled table on its own, so it works as the minimum 14 Oct fallback.
**Plans**: TBD

### Phase 3: MDP and Sanity Baselines
**Goal:** The agent's world is defined and runnable (curated action list, IR2Vec state, dense and sparse reward), and the random and best-fixed-sequence baselines the agent must beat are measured on the same action list.
**Mode:** mvp
**Depends on**: Phase 2
**Target window**: 12-13 Oct
**Requirements**: MDP-01, BASE-02
**Success Criteria** (what must be TRUE):
  1. A written MDP definition names the roughly 20 curated passes (including a NOOP), the normalized IR2Vec state and the dense and sparse reward, and the action list is fixed before any training result exists.
  2. A random policy runs full episodes on training programs through the environment, and for each episode the dense step rewards sum to the sparse terminal reward.
  3. Per-step cost (steps per second, IR2Vec time) is measured and recorded, so the episode length and training budget used later are set from measurement rather than guessed.
  4. A results CSV shows random-sequence results, and the best single fixed sequence found on the training set applied to held-out programs, beside `-O2/-O3/-Oz`, using the same counter as Phase 2.
**Plans**: TBD

### Phase 4: First Training Run and Preliminary Results
**Goal:** A REINFORCE-with-baseline agent demonstrably learns on tiny programs, and the 14 Oct submission has real, honestly labeled PRELIMINARY results.
**Mode:** mvp
**Depends on**: Phase 3
**Target window**: 13-14 Oct (aim to freeze the package on 13 Oct; the morning of 14 Oct is the hard stop so the team can assemble the presentation)
**Requirements**: TRAIN-01, OUT-01
**Success Criteria** (what must be TRUE):
  1. The overfit sanity check passes: on 2-3 tiny programs the training reward rises over episodes and the greedy sequence beats the random-sequence average on those programs (pass threshold written down before running).
  2. A short run on the training set completes from one command, with its budget stated and its learning curve and checkpoint saved.
  3. A frozen PRELIMINARY results package exists by 14 Oct: the short run's greedy sizes against `-O2/-O3/-Oz` next to the Phase 2-3 baselines, with every table and plot stamped PRELIMINARY and the budget stated. Learned-policy numbers come from train and validation programs only.
  4. If the overfit check has not passed by the end of 13 Oct, the 14 Oct package is the measured baselines plus the MDP design, labeled PRELIMINARY, with no training claim made and no number invented or tuned.
**Plans**: TBD

### Phase 5: Dense vs Sparse Training
**Goal:** Train the agents that will be evaluated, and find out whether dense or sparse reward trains better under a fair, identical setup.
**Mode:** mvp
**Depends on**: Phase 4
**Target window**: 15-17 Oct
**Requirements**: TRAIN-02
**Success Criteria** (what must be TRUE):
  1. Dense and sparse arms are each trained on the full training set with at least 3 seeds, and the saved configs show the reward variant is the only difference (same network, hyperparameters and budget).
  2. Every run leaves machine-readable learning curves (reward and policy entropy) and a checkpoint.
  3. A dense-vs-sparse comparison table and plot on validation programs (mean and spread across seeds) exists, with the write-up stating that at gamma = 1 the dense sum equals the sparse reward, so any difference is about training speed and stability.
  4. Checkpoint and hyperparameter choices were made on validation programs only, and a leakage check confirms no learned policy has touched the held-out set yet.
**Plans**: TBD

### Phase 6: Evaluation and Failure Analysis
**Goal:** Judge the trained agent honestly: headline numbers on train and held-out programs against `-O2/-O3/-Oz`, an explanation of where and why it loses, and proof that every reported sequence is reproducible.
**Mode:** mvp
**Depends on**: Phase 5
**Target window**: 17-19 Oct
**Requirements**: EVAL-01, EVAL-02, EVAL-03
**Success Criteria** (what must be TRUE):
  1. The selected policy is run greedily on train and held-out programs, and a results table shows geomean size reduction and wins/ties/losses against `-O2`, `-O3` and `-Oz`, with the random and fixed-sequence baselines alongside; crashes are counted as failures, never dropped.
  2. The held-out result is reported as measured, whether the agent wins or loses, stated plainly in the results text.
  3. A failure-case analysis lists the programs where the agent is worse than `-O2/-O3`, with action histograms, policy entropy and no-op fraction, and a written explanation of what the agent did and did not learn.
  4. Every stored action sequence is replayed from scratch and reproduces the same instruction count; any mismatch is listed rather than hidden.
**Plans**: TBD

### Phase 7: Final Outputs
**Goal:** Everything the team needs for the 21 Oct submission exists, regenerates from scripts, and can be explained in a viva.
**Mode:** mvp
**Depends on**: Phase 6
**Target window**: 19-21 Oct (no new experiments on 20 Oct; 21 Oct is buffer)
**Requirements**: OUT-02, OUT-03
**Success Criteria** (what must be TRUE):
  1. One scripted run regenerates all result tables and plots from the saved results CSVs, with no hand-edited numbers.
  2. Demo screenshots from the final run exist (for example the smoke test, a training run, and the final comparison table).
  3. A README lets a reader follow it on a fresh WSL2 setup to reproduce the final results.
  4. A one-page design note covers the MDP definition, why each choice was made, and likely viva questions with answers, each answerable in one sentence.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Environment Setup | 0/TBD | Not started | - |
| 2. Benchmark Split and Reference Baselines | 0/TBD | Not started | - |
| 3. MDP and Sanity Baselines | 0/TBD | Not started | - |
| 4. First Training Run and Preliminary Results | 0/TBD | Not started | - |
| 5. Dense vs Sparse Training | 0/TBD | Not started | - |
| 6. Evaluation and Failure Analysis | 0/TBD | Not started | - |
| 7. Final Outputs | 0/TBD | Not started | - |
