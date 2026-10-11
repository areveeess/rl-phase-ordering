# RL-Guided Compiler Phase Ordering

## What This Is

A Compiler Design course project (VIT) that trains a reinforcement learning agent to choose a program-specific sequence of LLVM optimization passes, and tests whether that learned sequence beats LLVM's fixed `-O2`/`-O3` pipelines on code size. It uses CompilerGym as the environment, IR2Vec embeddings of the LLVM IR as the state, and a policy-gradient algorithm for learning. The deliverable is a small, correctly scoped, reproducible replication of the full-sequence phase-ordering formulation, with a train/held-out split to test generalization, reported honestly whether or not the agent wins. Team of three: Aryan V Sangai, Nikhila Abdul Salam, Raj Vardhan Singh.

## Core Value

Produce real, reproducible, honestly reported numbers comparing a learned pass-ordering policy against `-O2`/`-O3` on programs the agent was not trained on — even if the agent does not win.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Working CompilerGym LLVM environment on WSL2 (Windows 11), reproducible from written setup steps
- [ ] Measured `-O0`/`-O2`/`-O3` baselines (instruction count / code size) on the chosen benchmark subsets
- [ ] `-Oz` reported as an additional reference column beside `-O2`/`-O3`
- [ ] Sanity baselines: random pass sequences and the best single fixed sequence found on the training set
- [ ] Benchmark subset split (by program family) into disjoint training, validation and held-out test sets
- [ ] Everything explainable in one sentence for the presentation and viva; a one-page design note with likely viva questions
- [ ] Phase ordering formulated as an MDP: IR2Vec embedding as state, selection of a pass (or pass group) as action, change in code size/instruction count as reward
- [ ] Action space limited to a curated subset of LLVM passes (optionally dependency-aware pass groups, as in POSET-RL)
- [ ] Policy-gradient training pipeline that learns a pass-selection policy on the training set
- [ ] Learned policy evaluated against `-O2` and `-O3` on the training programs
- [ ] Learned policy evaluated against `-O2` and `-O3` on the held-out programs to assess generalization
- [ ] Reward-design comparison: dense versus sparse reward
- [ ] Failure-case analysis of what the agent does and does not learn
- [ ] Results exported as machine-readable files (CSV), result tables/plots and demo screenshots usable in the course submissions
- [ ] Early results for Assessment 9 (14 Oct 2026): a short real training run vs `-O2`/`-O3` if achievable; otherwise measured baselines plus the MDP/pipeline design, clearly labeled preliminary
- [ ] Execution-time comparison on a subset of benchmarks where reliable timing is feasible (secondary; static size/instruction count is the primary metric)

### Out of Scope

- Register allocation, instruction scheduling, target-specific backend optimizations — the project concerns only ordering of IR-level optimization passes
- Exceeding the results of AutoPhase, POSET-RL, MLGO and similar published systems — they were built by dedicated research groups over longer timeframes; this is a controlled replication
- Reimplementing other learned systems as comparison baselines — the comparison is deliberately like-for-like against `-O2`/`-O3`
- Searching the full LLVM pass list as the action space — intractable within the compute and time budget
- Deploying the trained model inside LLVM as MLGO does — discussed as practicality context only
- Writing the Assessment 9 presentation and Assessment 10 submission documents — the team assembles these; this project supplies code, results, tables/plots and screenshots

## Context

- **Source document:** "Assessment 8 — Project Review 1: Problem Identification and Objectives, and Literature Survey" (Compiler Design Lab Submission 8). It defines the problem, scope, five objectives and a literature survey. Primary objective: formulate phase ordering as an MDP. Supporting objectives: build the CompilerGym training pipeline, evaluate vs `-O2`/`-O3`, test generalization on held-out programs, analyze failure cases and dense vs sparse reward.
- **Literature:**
  - CompilerGym (Cummins et al., CGO 2022) — the environment
  - AutoPhase (Haj-Ali et al., 2019) — earliest deep-RL phase ordering, established the MDP formulation
  - POSET-RL (Jain et al., ISPASS 2022) — pass sub-sequences from an Oz dependence graph, IR2Vec state
  - IR2Vec (VenkataKeerthy et al., TACO 2020) — fixed-length LLVM IR embeddings
  - Static Neural Compiler Optimization (Mammadli et al., LLVM-HPC 2020) — static reward can still improve runtime, up to 1.32x on unseen programs
  - MLGO (Trofin et al., 2021) — learned inlining heuristic inside production LLVM, up to 7% size reduction over `-Oz`
- **Submission schedule** (today is 11 Oct 2026):
  - Assessment 9, due 14 Oct 2026: project presentation document with Title, Abstract, Introduction, Research Gap, Methodology, Results, Conclusions
  - Assessment 10, due 21 Oct 2026: document with Source Code, Results, Demo Screenshots
- **Environment:** Windows 11 laptop with an RTX 3060 (laptop) GPU. Experiments run under WSL2 (Linux). The policy network over fixed-size IR2Vec vectors is small, so CPU training is expected to suffice; the GPU is a bonus. The project directory started empty (no prior code).
- **Known risk:** CompilerGym targets Linux/macOS and is an older codebase with strict Python/LLVM version expectations. Exact supported versions and the IR2Vec integration route need to be verified during research. Getting the environment working is the main schedule risk before the 14 Oct deadline.

## Constraints

- **Timeline**: 14 Oct 2026 (Assessment 9) and 21 Oct 2026 (Assessment 10) — fixed course deadlines; 3 days to the first, 10 days to the second
- **Platform**: Windows 11 host, experiments run in WSL2 — CompilerGym does not run natively on Windows
- **Compute**: single laptop (RTX 3060 Laptop GPU, CPU-first training) — limits action-space size, benchmark count and training budget
- **Scope**: bounded to one semester, curated pass subset, subset of standard benchmark suites (e.g. those bundled with CompilerGym) — keeps the search space tractable
- **Dependencies**: CompilerGym (LLVM environment) and IR2Vec — committed to in the Review 1 document; changing either requires an explicit decision
- **Change control**: research may propose revamping or improvising on the Review 1 topic/approach (e.g. a different environment, algorithm, or action space) if that is clearly better or if the original proves infeasible — but any such change must first be explained to the user (what it is and why) and approved before it is adopted
- **Integrity**: report measured results honestly, including cases where the agent does not beat `-O2`/`-O3` — this is the stated aim of the project; no tuning of the evaluation to force a win

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CompilerGym as the experimental environment | Removes LLVM-interfacing engineering, provides crash safeguards and Gym API; committed to in Review 1 | — Pending (install risk on WSL2) |
| IR2Vec embeddings as RL state | Pretrained, fixed-length, reusable feature extractor; used by POSET-RL | — Pending |
| Curated pass subset (optionally dependency-aware pass groups) as the action space | Full pass list is intractable for the available compute and time | — Pending |
| Policy-gradient-based RL algorithm (specific algorithm decided in research/planning) | Specified in Review 1 objective 2 | — Pending |
| Static code size / instruction count as the primary reward and metric | Cleanly quantifiable; static reward shown viable by Mammadli et al.; avoids unreliable timing | — Pending |
| Run experiments in WSL2 on the local laptop | User's available machine; no dependency on external servers | — Pending |
| For 14 Oct: try for a real early training run, fall back to measured baselines plus design labeled preliminary | Only 3 days and environment setup risk; results must be real, not fabricated | — Pending |
| Project supplies code, results and screenshots; the team writes the submission documents | User's choice | — Pending |
| Research may revamp the topic/approach, but only after educating the user and getting approval | User wants a better outcome if one exists, without silent scope changes | — Pending |
| Add `-Oz` as an extra reference column beside `-O2`/`-O3` (approved 2026-10-11) | `-Oz` is the size-focused level and beats service `-O3` on all 23 cBench programs; avoids a too-low bar. Nothing removed. | — Pending |
| Add random-sequence and best-single-fixed-sequence sanity baselines (approved 2026-10-11) | Random search is strong in the literature; the agent must beat it for the result to mean anything | — Pending |
| Extra small training suites, test on cBench families: approved 2026-10-11, then moved to v2 the same day | User needs the project compact enough to present and answer viva questions; cBench-only family split is the v1 plan | — Pending |
| Keep v1 compact (13 requirements), each explainable in one sentence | User must present and answer viva voce | — Pending |
| REINFORCE with baseline is the primary algorithm; PPO is an optional backup (approved 2026-10-11) | Still policy gradient per Review 1; full control of dense vs sparse experiment | — Pending |
| Not adopted: `-Oz` as headline, extra state features (ablation only), Autophase fallback, STOP action, replacing CompilerGym | Cost or risk outweighs benefit now; revisit only with the user's approval | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-11 after initialization*
