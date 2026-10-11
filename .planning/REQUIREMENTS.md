# Requirements: RL-Guided Compiler Phase Ordering

**Defined:** 2026-10-11
**Core Value:** Produce real, reproducible, honestly reported numbers comparing a learned pass-ordering policy against `-O2`/`-O3` on programs the agent was not trained on — even if the agent does not win.

**Design principle:** Everything in v1 must be explainable in one sentence in a presentation or viva. Complexity beyond that is deferred to v2.

## v1 Requirements

Requirements for the 14 Oct (preliminary) and 21 Oct (final) submissions. Each maps to a roadmap phase.

### Environment

- [ ] **ENV-01**: A reproducible WSL2 setup (pinned Python 3.10 environment with written steps, lock file and saved wheels) passes a smoke test: the CompilerGym LLVM env runs, IR2Vec embeds its IR, and output validation works (or the `lli` output-check fallback is used and disclosed)

### Data & Protocol

- [ ] **DATA-01**: Benchmarks are split by program family into train / validation / held-out test (near-duplicate programs stay together), the split file is saved, and a written evaluation protocol is frozen before the first held-out run

### Baselines

- [ ] **BASE-01**: `-O0`, `-O2`, `-O3` and `-Oz` code sizes are measured per benchmark with one consistent counter and saved to a CSV, with the method documented
- [ ] **BASE-02**: Two sanity baselines run on the same action list: random pass sequences, and the best single fixed sequence found on the training set applied to held-out programs

### MDP

- [ ] **MDP-01**: Phase ordering is defined as an MDP: about 20 curated LLVM passes (including a NOOP) as actions, the normalized IR2Vec embedding of the current IR as state, and reward from the change in instruction count (dense per-step and sparse terminal variants)

### Training

- [ ] **TRAIN-01**: A REINFORCE-with-baseline policy-gradient agent trains on the training set, and first passes an overfit sanity check on 2–3 tiny programs
- [ ] **TRAIN-02**: Dense vs sparse reward is compared under identical network, hyperparameters, budget and at least 3 seeds each

### Evaluation

- [ ] **EVAL-01**: The trained policy is run greedily on train and held-out programs and compared against `-O2`/`-O3`/`-Oz` using geomean size reduction and wins/ties/losses; crashes are counted as failures, never dropped
- [ ] **EVAL-02**: A failure-case analysis explains where and why the agent loses (regressions, action histograms, policy entropy, no-op fraction)
- [ ] **EVAL-03**: Every stored action sequence is replayed and must reproduce the same instruction count

### Outputs

- [ ] **OUT-01**: By 14 Oct, real results labeled PRELIMINARY: a short training run if it works, otherwise measured baselines plus the MDP design
- [ ] **OUT-02**: Scripted tables and plots from the results CSVs, demo screenshots, and a README that reproduces the final results, ready for the 21 Oct submission
- [ ] **OUT-03**: A one-page design note covering the MDP definition, why each choice was made, and likely viva questions with answers

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Extensions

- **DATA-02**: Train on extra small bundled suites (e.g. NPB, BLAS, MiBench, OpenCV, CHStone) and test on cBench families; re-test IR2Vec per suite
- **ALGO-01**: PPO (Stable-Baselines3 1.8.0) as a second algorithm
- **MDP-02**: POSET-RL-style dependency-aware pass groups as actions
- **MDP-03**: State-feature ablation (step index, applied-pass histogram, size feature)
- **EVAL-04**: Execution-time comparison on a cBench subset where timing is reliable
- **EVAL-05**: Object `.text` size reported for final sequences
- **BASE-03**: Genetic-algorithm or other search baseline

## Out of Scope

| Feature | Reason |
|---------|--------|
| Register allocation, scheduling, backend optimizations | Review 1: only IR-level pass ordering is in scope |
| Beating published systems; reimplementing AutoPhase/POSET-RL as baselines | Controlled small-scale replication; like-for-like comparison is against `-O2`/`-O3` |
| Searching the full LLVM pass list | Intractable within compute and time |
| Deploying the trained model inside LLVM (MLGO-style) | Practicality discussion only |
| Replacing CompilerGym with a custom `opt` environment | Multi-day cost; CompilerGym verified working. Not approved |
| `-Oz` as the headline reference (instead of `-O2`/`-O3`) | `-Oz` is only an extra column. Not approved |
| STOP action / variable-length episodes | A NOOP action gives most of the benefit. Not approved |
| Autophase/InstCount fallback state | IR2Vec verified on all 23 cBench programs. Contingency only, not approved |
| Writing the Assessment 9 presentation and Assessment 10 document | The team assembles these; the project supplies code, results, screenshots and the design note |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENV-01 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| BASE-01 | Phase 2 | Pending |
| MDP-01 | Phase 3 | Pending |
| BASE-02 | Phase 3 | Pending |
| TRAIN-01 | Phase 4 | Pending |
| OUT-01 | Phase 4 | Pending |
| TRAIN-02 | Phase 5 | Pending |
| EVAL-01 | Phase 6 | Pending |
| EVAL-02 | Phase 6 | Pending |
| EVAL-03 | Phase 6 | Pending |
| OUT-02 | Phase 7 | Pending |
| OUT-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-11*
*Last updated: 2026-10-11 after roadmap creation*
