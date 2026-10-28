# Roadmap: RL-Guided Compiler Phase Ordering

## Overview

This roadmap takes the project from an empty directory to two course submissions: a PRELIMINARY results package for Assessment 9 (14 Oct 2026) and the final code, results and demo screenshots for Assessment 10 (21 Oct 2026). The path is: make CompilerGym and IR2Vec run reproducibly in WSL2, fix how success is measured (family-level split, `-O0/-O2/-O3/-Oz` baselines, frozen protocol), define the MDP and the random/fixed-sequence baselines, get a REINFORCE-with-baseline agent learning on tiny programs, then train dense vs sparse reward with multiple seeds, evaluate honestly on held-out programs, and package everything so it regenerates from scripts. Phases 1-4 end at the 14 Oct deadline; Phases 5-7 end at the 21 Oct deadline. Every phase ends in something that can be explained in one sentence in the presentation or viva. Results are reported as measured, whether or not the agent beats `-O2`/`-O3`.

## Deadline Mapping

Dates are targets against fixed course deadlines, not effort estimates.

| Checkpoint | Due | Phases | What must exist |
|------------|-----|--------|-----------------|
| Assessment 9 (presentation) | 14 Oct 2026 | 1-4 | OUT-01: real results labeled PRELIMINARY (short training run if it works, otherwise measured baselines plus the MDP design) |
| Assessment 10 (code, results, screenshots) | 21 Oct 2026 | 5-7 | OUT-02 and OUT-03, plus the final dense-vs-sparse, held-out and failure-analysis results |

## Reconciliation Note (2026-10-21)

Tracking was reconciled against repo evidence at HEAD f42916a. All implementation work (commits 0c8c9ef to f42916a, all dated 2026-10-21) was done outside GSD, so no PLAN or SUMMARY files exist for any phase.
The experiment pipeline (drive.sh) was LIVE at check time (wsl.exe running, runs/ files written in the last 15 minutes), so runs/ and results/ were listed only (presence and mtime), never opened; committed results were read with `git show HEAD:`.
The 14 Oct 2026 PRELIMINARY package (Phase 4 SC3 and SC4) was missed: no file in the repo carries a PRELIMINARY label and every implementation commit is dated 21 Oct. It is recorded as MISSED-DEADLINE and has not been backfilled or relabeled.
A script that exists is not counted as a result that exists: a criterion is EVIDENCED only when its output artifact is on disk (or committed) and meets the criterion wording.

## Close-out Note (2026-10-22)

Closed out against HEAD 6c0031a (6c0031acb8681b8cdfcafc1894b18c444516d1e3) after the pipeline finished: `find runs results -type f -mmin -15` printed nothing (idle), and runs/, results/ and the WSL wheel archive (via the `//wsl.localhost` UNC path) were read directly. The Reconciliation Note above is kept as history.
Rules: a criterion is EVIDENCED only if every artifact it names exists and matches its wording (R1); PARTIAL if some do, MISSING if none, MISSED-DEADLINE only for Phase 4 SC3/SC4 (R2); caveats that do not remove an artifact are written into the bullet (R3); a phase is [x] if and only if all its criteria are EVIDENCED (R4).
Totals over the 27 criteria: 22 EVIDENCED, 3 PARTIAL (P5-SC3, P7-SC1, P7-SC2), 0 MISSING, 2 MISSED-DEADLINE (P4-SC3, P4-SC4). Phases 1, 2, 3 and 6 are ticked (4 of 7); Phases 4, 5 and 7 stay unticked. Current phase = Phase 4, the earliest unticked one.
Phase 4 can never be ticked: the 14 Oct PRELIMINARY package was not made by the deadline and is not backfilled or relabeled (gaps G-08, G-09). Phase 5 is held by the missing dense-vs-sparse plot on validation programs (G-21); Phase 7 by the hand-copied supplementary table (G-22) and the missing final-run screenshots (G-19).
All work was done outside GSD (no per-phase PLAN or SUMMARY files), so `roadmap.analyze` reports a `checkbox_conflict` for the ticked phases and its disk-based `completed_phases` stays 0. This is deliberate: no phase directories or SUMMARY files were created to hide it, and STATE progress is set by hand from these checkboxes.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Environment Setup** - A reproducible WSL2 environment where CompilerGym, IR2Vec and output validation all run *(Complete on repo evidence - see Close-out)*
- [x] **Phase 2: Benchmark Split and Reference Baselines** - Family-level train/validation/held-out split, frozen evaluation protocol, and measured `-O0/-O2/-O3/-Oz` sizes *(Complete on repo evidence - see Close-out)*
- [x] **Phase 3: MDP and Sanity Baselines** - The phase-ordering MDP is defined and runnable, with random and best-fixed-sequence baselines to beat *(Complete on repo evidence - see Close-out)*
- [ ] **Phase 4: First Training Run and Preliminary Results** - REINFORCE-with-baseline passes an overfit check; the 14 Oct PRELIMINARY package is frozen *(Partial - see Close-out: SC3/SC4 MISSED-DEADLINE)*
- [x] **Phase 5: Dense vs Sparse Training** - Both reward variants trained with identical settings and at least 3 seeds each *(Complete on repo evidence - G-21 closed in 96a2b60)*
- [x] **Phase 6: Evaluation and Failure Analysis** - Honest train and held-out comparison against `-O2/-O3/-Oz`, failure-case analysis, and replay of every stored sequence *(Complete on repo evidence - see Close-out)*
- [x] **Phase 7: Final Outputs** - Scripted tables and plots, demo screenshots, reproducing README and the one-page design note for 21 Oct *(Complete on repo evidence - G-19, G-22 closed in 96a2b60)*
- [x] **Phase 8: Web Frontend** - Static results explorer (GitHub Pages / offline) plus an optional live tab that runs the trained policy through a WSL server

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

**Close-out (2026-10-22):** Complete - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Partial.
  - SC1: EVIDENCED - setup.sh (uv Python 3.10, pins pip/setuptools/wheel before gym), SETUP.md and requirements.lock are tracked in git; the WSL archive //wsl.localhost/Ubuntu/home/rvsre/rlphase-backup/wheels holds compiler_gym-0.2.5-py3-none-manylinux2014_x86_64.whl and IR2Vec-2.1.1-cp310-cp310-manylinux_2_17_x86_64.manylinux2014_x86_64.whl. Caveat: setup.sh step 9 archives only these two wheels (the packages whose upstream is archived); the other pins (torch, gym 0.21, grpcio, numpy) would be downloaded again. The G-01 closure condition was exactly these two wheels. Gap: G-01 (closed).
  - SC2: EVIDENCED - smoke_test.py; report/outputs/smoke_test.txt shows [PASS] make llvm-v0, reset cbench-v1/qsort, step -mem2reg and -instcombine, IR2Vec fa vector dim=300.
  - SC3: EVIDENCED - SETUP.md section "Output validation: disclosure", rlpo/lli_check.py, and smoke_test.txt "lli fallback output check (qsort|dijkstra|crc32): match"; final run results/lli_validation.csv tallies 42 match, 78 not available, 0 mismatch.

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

**Close-out (2026-10-22):** Complete - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Partial.
  - SC1: EVIDENCED - splits/split.json assigns 9 train, 3 val, 8 test (20 programs) plus a families map; tiff2bw/tiff2rgba/tiffdither/tiffmedian and stringsearch/stringsearch2 are all in test; jpeg-c, jpeg-d and ghostscript are excluded entirely with reasons in the file and in DESIGN.md.
  - SC2: EVIDENCED - DESIGN.md "Evaluation protocol (fixed before any held-out run)"; its last change is 04eef6c (21 Oct 23:27:51), before the first held-out output (results/eval.csv first added in bf2cd61, 22 Oct 01:33). The earlier doc-sync note (G-03) was fixed in b1717c2.
  - SC3: EVIDENCED - results/baselines.csv covers 20/20 split programs (coverage check of splits/split.json against baselines.csv: none missing) with O0/O2/O3/Oz plus service_O3/service_Oz columns; method in the scripts/baselines.py docstring and the DESIGN.md "Baselines" bullet: one counter (CLI opt on the -O0 bitcode, reloaded, IrInstructionCount) for every column including the agent, service values kept as a recorded cross-check and never assumed equal. Caveat: the cause of the service-vs-CLI -O3 difference (for example bitcount CLI 697 against service 607) is still not explained anywhere. Gap: G-02 (closed with caveat).
  - SC4: EVIDENCED - results/RESULTS.md "Per-program instruction counts" table and results/per_program.csv give O0/-O2/-O3/-Oz for all 20 programs. Note: report/fig_baselines.png (21 Oct 22:43) predates the 20-row baselines.csv and is outdated (G-23).

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

**Close-out (2026-10-22):** Complete - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Partial.
  - SC1: EVIDENCED - DESIGN.md MDP table; rlpo/env.py has PASSES (24) + NOOP = ACTIONS (25) and EPISODE_LEN = 15, committed in 0c8c9ef before any training output.
  - SC2: EVIDENCED - scripts/reward_sum_check.py plays random action sequences on the train programs adpcm, crc32 and dijkstra (3 episodes each) in dense and sparse mode; results/reward_sum_check.txt has 9 "ok" lines and "reward sum check: OK". Gap: G-04 (closed).
  - SC3: EVIDENCED - scripts/profile_step.py and report/outputs/train_eval_demo.txt record per-step cost; the 320-episode budget is consistent across DESIGN.md, run_all.sh, drive.sh and drive_seeds.sh (G-06, b1717c2).
  - SC4: EVIDENCED - results/sanity_baselines.csv has 20 rows (random_mean, random_best, best_fixed for 9 train, 3 val and all 8 test programs); results/sanity_baselines_best_fixed_sequence.txt holds the best fixed sequence; results/summary_reduction.csv shows "random seq" and "best fixed seq" beside -O2/-O3/-Oz per split with the same counter. Gap: G-05 (closed).

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

**Close-out (2026-10-22):** Partial - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Partial.
  - SC1: EVIDENCED - the 80%-of-Oz-reduction rule was pre-registered in DESIGN.md (b1717c2, 21 Oct 23:25) before runs/overfit/policy.pt existed (22 Oct 00:06); results/overfit_check.txt says PASS (0.9219 crc32 / 0.9068 qsort / 0.8062 adpcm of the -Oz reduction); runs/overfit/train_log.csv mean_reduction rises from 0.272 (update 1) to 0.456 (update 20); greedy beats the random mean on all three (crc32 124 < 190.9, qsort 346 < 552.9, adpcm 280 < 386.3, from results/sanity_baselines.csv). Caveat: the greedy policy is -sroa x15 and the best fixed sequence beats it on all three (119, 292, 228), so the 80% rule turned out weak. Gap: G-07 (closed with caveat).
  - SC2: EVIDENCED - runs/dense_s0 holds policy.pt, run.json (episodes 320, batch 16, 3 checkpoints), train_log.csv and ckpt_*.pt, produced by one command (drive.sh or run_all.sh).
  - SC3: MISSED-DEADLINE - `git grep -il preliminary -- . ':!.planning'` is empty, and every implementation commit is dated 21-22 Oct, after the 14 Oct deadline. Permanent: not backfilled, not relabeled. Gap: G-08.
  - SC4: MISSED-DEADLINE - same evidence as SC3: no PRELIMINARY-labeled baselines plus MDP design package existed by 14 Oct. Permanent: not backfilled. Gap: G-09.

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

**Close-out (2026-10-22):** Partial - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): In progress.
  - SC1: EVIDENCED - runs/{dense,sparse}_s{0,1,2} all exist; comparing episodes, batch, lr, checkpoints, train_on, max_seconds and train_programs across the six run.json files gives one distinct signature (they differ only in reward, seed, out, selected, wall_seconds, embedding_cache). Gap: G-10 (closed).
  - SC2: EVIDENCED - each of the six runs has train_log.csv (columns update, episodes, seconds, mean_reduction, noop_frac, no_effect_frac, policy_loss, value_loss, entropy), ckpt_*.pt and policy.pt. Gap: G-11 (closed).
  - SC3: EVIDENCED (was PARTIAL) - present: the validation table with mean and sd across seeds (results/RESULTS.md and results/summary_reduction.csv val row) and the gamma = 1 statement in DESIGN.md (Reward (sparse) row: "With discount 1, both give the same episode total, so the comparison isolates *timing*"). Missing: a dense-vs-sparse plot on validation programs; results/training_curves.png plots training-batch reduction (scripts/analyze.py section "1. training curves"), entropy_noop.png covers training and heldout_per_program.png covers test. Gap: G-21. UPDATE 96a2b60: results/val_dense_vs_sparse.png (scripts/analyze.py) adds the dense-vs-sparse plot on validation programs.
  - SC4: EVIDENCED - each run's val_selection.csv selects on bitcount/lame/patricia (the val split); results/leakage_check.txt says "leakage check: OK (6 runs, no test program used in training or selection)". Gap: G-13 (closed).

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

**Close-out (2026-10-22):** Complete - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Not started (code ready).
  - SC1: EVIDENCED - results/eval.csv has 120 rows (6 runs x 20 programs, train/val/test); results/summary_reduction.csv gives geomean reduction beside random and best fixed; results/wins_ties_losses.csv gives W/T/L against -O2/-O3/-Oz/best fixed with a crashes column (all 0); summarized in results/RESULTS.md. Gap: G-14 (closed).
  - SC2: EVIDENCED - README "## Results" held-out table and "What this means" first bullet: the agent beats -O2/-O3 on held-out code size but loses to -Oz and to the best fixed sequence. Gap: G-15 (closed).
  - SC3: EVIDENCED - results/failure_cases.csv (per program vs_Oz_pct and vs_O3_pct), results/action_histogram.png, results/entropy_noop.png, the results/RESULTS.md "Failure analysis" section (NOOP and no-effect actions per episode) and the written explanation in README "What this means". Caveat: failure_cases.csv quantifies only -O3 and -Oz; losses against -O2 show in per_program.csv and wins_ties_losses.csv. Gap: G-16 (closed).
  - SC4: EVIDENCED - results/eval.csv replay check gives 120 rows, 120 replay_ok True, 0 errors; results/long_eval.csv gives 40, 40, 0. Gap: G-17 (closed).

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

**Close-out (2026-10-22):** Partial - re-checked at HEAD 6c0031a after the pipeline finished. Previous verdict (2026-10-21, quick 261021-w5i): Partial.
  - SC1: EVIDENCED (was PARTIAL) - scripts/analyze.py regenerates results/RESULTS.md, summary_reduction.csv, wins_ties_losses.csv, per_program.csv, failure_cases.csv and the four results/*.png from the CSVs, run by run_all.sh step "analysis" and by drive_seeds.sh. Missing: the README table "### Supplementary: 2000-episode runs" (41.4% / 38.2%, W/T/L, distinct sequences, entropy, chosen checkpoint) is copied by hand from results/long_eval.csv and runs/long_*; `grep -rln long_eval scripts/ *.sh report/*.py` lists only drive_long.sh, which evaluates but builds no table. Gap: G-22 (G-18 closed with this residual). UPDATE 96a2b60: scripts/supplementary.py generates the supplementary table (results/long_summary.csv/.md).
  - SC2: EVIDENCED (was PARTIAL) - report/fig_smoke_test.png, report/fig_train_eval.png and report/fig_baselines.png are terminal renders of report/outputs/*.txt dated 21 Oct 22:43, before the final results (results/*.png at 22 Oct 01:31); there are no screenshots of the final training run or the final comparison table. Gap: G-19. UPDATE 96a2b60: report/fig_final_results.png is the captured output of the final analysis run (report/outputs/final_results.txt); figures and report .docx regenerated from final CSVs.
  - SC3: EVIDENCED - README "## Running it" covers setup.sh, smoke_test.py, run_all.sh, drive.sh and drive_seeds.sh, and "## Results" gives the final numbers with drive_long.sh named for the supplementary runs. Caveat: run_all.sh does not run overfit_check.py, leakage_check.py or reward_sum_check.py (`grep -c _check.py run_all.sh` gives 0; drive_seeds.sh runs them), so following only run_all.sh yields every result except the three check files. Gap: G-20 (closed with caveat).
  - SC4: EVIDENCED - DESIGN.md (73 lines) has the MDP table with a "Why" column, the evaluation protocol and "## Likely viva questions"; the stale details were fixed in b1717c2 and 04eef6c.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Environment Setup | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 2. Benchmark Split and Reference Baselines | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 3. MDP and Sanity Baselines | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 4. First Training Run and Preliminary Results | 0/0 (outside GSD) | Partial | - |
| 5. Dense vs Sparse Training | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 6. Evaluation and Failure Analysis | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 7. Final Outputs | 0/0 (outside GSD) | Complete (evidence) | 2026-10-22 |
| 8. Web Frontend | 11/11 | Complete (evidence) | 2026-10-23 |

### Phase 8: Web Frontend

**Goal:** A frontend that lets an examiner or teammate explore the finished results and watch the trained policy optimise a program. (1) A static results explorer in `web/`: plain HTML/CSS/JS, no build step, chart library vendored so it works offline on the viva laptop and on GitHub Pages. (2) An optional live tab backed by a stdlib-only Python server run inside WSL.
**Requirements**: WEB-01, WEB-02, WEB-03
**Success Criteria** (what must be TRUE):
  1. `scripts/export_web.py` builds `web/data.json` only from `results/*.csv`, `results/*_check.*`, `splits/split.json` and `runs/*/{run.json,train_log.csv}`. Every number on the page comes from it, and a check script confirms that page numbers equal `results/` (honesty rule).
  2. Opening `web/index.html` (via a static file server or GitHub Pages, with no WSL) shows: the per-split summary and wins/ties/losses tables; a per-program view (choose a program and see -O0/-O2/-O3/-Oz vs best fixed vs RL dense/sparse per seed vs the 2000-episode runs, plus each run's greedy pass sequence); training curves and entropy; the split; and the checks (replay, lli, leakage, reward-sum, overfit).
  3. `web/server.py` (stdlib only; no new packages in the pinned venv) runs inside WSL, serves `web/`, exposes `/api/health` and an endpoint that runs a chosen trained policy greedily on a chosen cBench program and streams each step (pass, instruction count, no-effect flag). It uses one CompilerGym env at a time, and never writes to `results/` or `runs/`.
  4. The page enables the Live tab only when `/api/health` answers. Live runs reproduce the stored `results/eval.csv` final count for the same run and program.
  5. The README documents how to open the explorer and how to start the live server. The page works at phone width and in light/dark mode.

**Depends on:** Phase 7
**Plans:** 11/11 plans executed

Plans:
- [x] 08-01-PLAN.md — Tracer + data contract: export_web.py -> data.json/data.js -> Overview summary table, check_web.py, render_check.py (wave 1)
- [x] 08-02-PLAN.md — Vendor app.css, charts.js and Geist faces with SHA-256 provenance and check_vendor.py (wave 1)
- [x] 08-03-PLAN.md — Design system and open-plane shell: tokens light/dark, router, shared components, final index.html wiring with registered view stubs, web_gate.sh (wave 2)
- [x] 08-04-PLAN.md — export_traces.py: WSL replay of every stored sequence into web/traces.json, merged and checked (wave 2)
- [x] 08-05-PLAN.md — Overview complete with honest headline; charts-ext.js marks and the sequence strip component (wave 3)
- [x] 08-06-PLAN.md — Live server web/server.py (stdlib, 127.0.0.1, NDJSON, one run at a time) with tests and live_check (wave 3)
- [x] 08-07-PLAN.md — Programs view: per-program bar list, finding, pass-sequence strips, phone step table (wave 4)
- [x] 08-08-PLAN.md — Training, Checks, and Split-and-method views (wave 4)
- [x] 08-09-PLAN.md — Live tab UI: probe, states, streaming run, browser end-to-end check (wave 5)
- [x] 08-10-PLAN.md — Cross-route taste-skill gate: 6 routes x 2 themes x 3 widths to 0 FAIL, fixes in shared files only, critique (wave 6)
- [x] 08-11-PLAN.md — README Frontend section, manual GitHub Pages workflow, final acceptance sweep mapped to SC1-SC5 (wave 7)
