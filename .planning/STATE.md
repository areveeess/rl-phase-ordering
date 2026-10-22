---
gsd_state_version: "1.0"
current_phase: 8
current_phase_name: Web Frontend
status: complete
stopped_at: Completed Phase 8 (all 11 plans complete)
last_updated: "2026-10-23T03:03:00.000Z"
last_activity: 2026-10-23
last_activity_desc: Phase 8 Plan 11 completed (Documentation, README Frontend section, GitHub Pages workflow, final acceptance sweep passed)
state_head: pending-commit
progress:
  total_phases: 8
  completed_phases: 7
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-11)

**Core value:** Produce real, reproducible, honestly reported numbers comparing a learned pass-ordering policy against `-O2`/`-O3` on programs the agent was not trained on, even if the agent does not win.
**Current focus:** Phase 8 — Web Frontend (Complete)

## Current Position

Phase: 8 (Web Frontend) — COMPLETE
Plan: 11 of 11 (08-11 Documentation, README, and Final Acceptance Sweep)
Status: Complete (all success criteria SC1-SC5 evidenced)
Last activity: 2026-10-23 — Phase 8 complete

Progress: [██████████] 100% (11 of 11 Phase 8 plans complete; all acceptance criteria met)

## Deadlines

- Assessment 9 (Phases 1-4): 14 Oct 2026 - PRELIMINARY results (OUT-01) - MISSED: no PRELIMINARY package exists and all implementation commits are dated 21 Oct
- Assessment 10 (Phases 5-7): 21 Oct 2026 - code, results, screenshots (OUT-02, OUT-03) - final results committed 22 Oct (bf2cd61, 6c0031a) after the user-reported ~2-day extension (21 Oct 23:30 note); open: G-19 screenshots, G-23 docx

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (all work done outside GSD)
- Average duration: - min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 8 P01 | 25min | 2 tasks | 9 files |
| Phase 8 P02 | 10min | 2 tasks | 9 files |
| Phase 8 P03 | 20min | 3 tasks | 13 files |
| Phase 8 P04 | 15min | 2 tasks | 4 files |

## Accumulated Context

### Roadmap Evolution

- Phase 8 added (2026-10-22): Web Frontend - static results explorer plus optional live WSL-server tab (user chose 'Both')

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: REINFORCE with baseline is the primary algorithm; PPO is an optional backup
- [Init]: `-Oz` added as an extra reference column; random and best-fixed-sequence baselines added
- [Init]: v1 kept to 13 requirements; extra training suites moved to v2 (cBench-only family split)
- [Init]: For 14 Oct, try a real short training run, else baselines plus MDP design labeled PRELIMINARY
- [Roadmap]: 7 phases; phase boundary after Phase 4 produces the 14 Oct package, Phase 7 the 21 Oct package
- [Repo, outside GSD]: 24 curated -Oz passes + NOOP (25 actions), episode length 15 (rlpo/env.py, committed 0c8c9ef before any training output)
- [Repo, outside GSD]: jpeg-c, jpeg-d and ghostscript excluded from the split (embedding cost, WSL VM memory); split is 9 train / 3 val / 8 test, 20 programs (splits/split.json, 91571a9)
- [Repo, outside GSD]: env.validate() replaced by the disclosed `lli` output check (SETUP.md "Output validation: disclosure", rlpo/lli_check.py)
- [Repo, outside GSD]: baselines via CLI `opt` on the -O0 bitcode, reloaded into CompilerGym and counted with IrInstructionCount; service_O3/service_Oz columns kept as a cross-check
- [Repo, outside GSD]: drive.sh chunked, retrying driver (run from Windows) because the WSL VM crashes under sustained load; trains seed 0 per arm only
- [Close-out]: Phases are ticked on repo evidence without GSD PLAN/SUMMARY files; the resulting `roadmap.analyze` checkbox_conflict is accepted and documented in the ROADMAP Close-out Note (quick 261022-but)
- [Close-out]: OUT-01 is recorded as Missed and Phase 4 SC3/SC4 as MISSED-DEADLINE; never backfilled or relabeled as PRELIMINARY
- [Phase 8]: 08-01: no check asserts a fixed -O2 win count; the KPI range is computed from wins_ties_losses.csv (6 to 7 of 8 today)
- [Phase 8]: 08-01: export_web.py exits 1 without runs/; check_web.py skips only runs/-sourced comparisons when runs/ is absent and says so on stderr
- [Phase 8]: 08-02: web/vendor/** marked -text in .gitattributes so core.autocrlf cannot change vendored file hashes; skill files record licence 'see skill README' (none stated)

### Pending Todos

- [done] Re-run the reconciliation after the pipeline finished: quick 261022-but (ROADMAP Close-out)
- [done] Record the missed OUT-01 honestly: OUT-01 Missed in REQUIREMENTS.md, Phase 4 SC3/SC4 MISSED-DEADLINE, G-08/G-09 OPEN, no backfill
- [done] Seeds 1-2 for TRAIN-02: trained via drive_seeds.sh (runs/dense_s1, dense_s2, sparse_s1, sparse_s2)
- [done] REQUIREMENTS.md traceability filled with status and evidence for all 13 IDs (quick 261022-but)
- [done 96a2b60] G-19: final-run capture report/fig_final_results.png
- [done 96a2b60] G-23: updated report/Assessment10_RL_Phase_Ordering.docx and report/fig_baselines.png with the final numbers (report/make_figures.py, report/build_docx.py)
- [done 96a2b60] G-21 results/val_dense_vs_sparse.png; G-22 scripts/supplementary.py

### Blockers/Concerns

- [Phase 1, resolved/mitigated]: `env.validate()` runtime error: 127 fixed (SETUP.md), 66 remains unresolved; `lli` fallback in place and disclosed (SETUP.md, rlpo/lli_check.py, report/outputs/smoke_test.txt)
- [Phase 1, resolved]: CompilerGym install on WSL Ubuntu 26.04: pinned Python 3.10 recipe in setup.sh/SETUP.md; smoke test passes (report/outputs/smoke_test.txt)
- [Phase 2, mitigated]: Service vs CLI -O3 size difference: method chosen and documented (CLI opt on -O0 bitcode, service columns as cross-check), but the cause is still not explained
- [Phase 3, mitigated]: IR2Vec step cost measured (scripts/profile_step.py, report/outputs/train_eval_demo.txt: 26-430 ms) and ghostscript/jpeg excluded; training budget is inconsistent across DESIGN.md (800), run_all.sh (480), drive.sh (320)
- [All]: C: is about 92% full (about 40 GB free) and RAM is 7.8 GB. A negative or non-generalizing result is plausible and must be reported as is.
- [Live, resolved]: WSL VM crashes under sustained load; the pipeline finished (no files in runs/ or results/ written in the last 15 minutes at the 22 Oct check). Still avoid invoking wsl while another job runs: another project (GPU LLM training) shares the VM.
- [Live, resolved]: Seeds 1-2 were trained via drive_seeds.sh; runs/{dense,sparse}_s{0,1,2} all exist, so TRAIN-02's 3-seed requirement is met.
- [Live, resolved]: The overfit threshold was pre-registered in DESIGN.md (b1717c2) before runs/overfit existed; results/overfit_check.txt reports PASS (with the weak-rule caveat, see G-07).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261021-w5i | Reconcile ROADMAP/STATE with repo (phase verdicts + Gap List) | 2026-10-21 | - (.planning gitignored) | [261021-w5i-reconcile-roadmap-state-with-repo](./quick/261021-w5i-reconcile-roadmap-state-with-repo/) |
| 2 | Pre-register overfit threshold; fix DESIGN split/budget text | 2026-10-21 | b1717c2 | — |
| 3 | Add overfit/leakage/reward-sum check scripts | 2026-10-21 | a902fd2 | — |
| 4 | Add drive_seeds.sh for seeds 1-2 + full eval | 2026-10-21 | df1aa74 | — |
| 5 | Docs: drive_seeds.sh, checks, 50 candidates | 2026-10-21 | 04eef6c | — |
| 6 | Close out GSD tracking: phases 1,2,3,6 ticked; REQUIREMENTS 11 Complete / 1 Partial / 1 Missed (261022-but) | 2026-10-22 | 6c0031a | — |
| 7 | Complete remaining gaps G-19/21/22/23: report docx, figures, val plot, supplementary script (96a2b60) | 2026-10-22 | 96a2b60 | — |

## Gap List

Non-EVIDENCED criteria and doc-sync notes at HEAD f42916a (pipeline LIVE at check time).

| ID | Phase | SC | What is missing | Closes via | Auto-closes when drive.sh finishes? | Status (2026-10-22) |
|----|-------|----|-----------------|------------|-------------------------------------|---------------------|
| G-01 | 1 | SC1 | Wheel archive (~/rlphase-backup/wheels) not inspected; needs compiler_gym and ir2vec wheels listed | Read-only `ls` of that directory when pipeline is IDLE | no (re-check when idle) | CLOSED - wheels compiler_gym-0.2.5 and IR2Vec-2.1.1 in //wsl.localhost/Ubuntu/home/rvsre/rlphase-backup/wheels. Caveat: only these two wheels are archived (torch, gym, grpcio, numpy are not) |
| G-02 | 2 | SC3 | results/baselines.csv covers 8 / 20 programs (missing lame, patricia, qsort, rijndael, sha, stringsearch, stringsearch2, susan, tiff2bw, tiff2rgba, tiffdither, tiffmedian); service-vs-CLI -O3 cause unexplained | drive.sh step "baselines"; add a one-line note on the cause | partial | CLOSED - results/baselines.csv covers 20/20 programs. Caveat: service-vs-CLI -O3 cause still not explained |
| G-03 | 2 | SC2 (doc-sync) | DESIGN.md says jpeg-c/jpeg-d "moved from train to test" and "22 of 23 programs"; splits/split.json excludes jpeg and ghostscript, 20 programs | Edit DESIGN.md text | no | CLOSED - fixed in b1717c2; DESIGN.md matches splits/split.json |
| G-04 | 3 | SC2 | No check or recorded output that dense step rewards sum to the sparse terminal reward | Write a small check script and record its output | no | CLOSED - scripts/reward_sum_check.py; results/reward_sum_check.txt (9 ok, OK) |
| G-05 | 3 | SC4 | results/sanity_baselines.csv absent | drive.sh step "sanity baselines" | yes | CLOSED - results/sanity_baselines.csv (20 rows) |
| G-06 | 3 | SC3 (doc-sync) | Training budget inconsistent: DESIGN.md 800 episodes, run_all.sh 480, drive.sh 320 | Decide the true budget, align the docs | needs user decision | CLOSED - 320 episodes everywhere (b1717c2) |
| G-07 | 4 | SC1 | No pre-registered overfit threshold; runs/overfit and results/overfit_eval.csv absent | Write threshold down before the overfit result is read; drive.sh steps "overfit" and "eval overfit" | partial | CLOSED - rule pre-registered in b1717c2 before runs/overfit; results/overfit_check.txt PASS. Caveat: greedy policy is -sroa x15 and loses to best fixed, so the 80% rule was weak |
| G-08 | 4 | SC3 | 14 Oct PRELIMINARY package missed (MISSED-DEADLINE) | Cannot be closed retroactively | needs user decision | OPEN - MISSED-DEADLINE, not closable, not backfilled (no PRELIMINARY file in the repo) |
| G-09 | 4 | SC4 | 14 Oct PRELIMINARY fallback package missed (MISSED-DEADLINE) | Cannot be closed retroactively | needs user decision | OPEN - MISSED-DEADLINE, not closable, not backfilled |
| G-10 | 5 | SC1 | Only seed 0 per arm (dense_s0 done, sparse_s0 running); need at least 3 seeds each; same-config check pending run.json | Run seeds 1-2 (run_all.sh crashes WSL; needs a drive.sh variant) | needs user decision | CLOSED - runs/{dense,sparse}_s{0,1,2} exist with one config signature |
| G-11 | 5 | SC2 | Curves and checkpoints exist only for dense_s0; sparse_s0 in progress | drive.sh sparse training; seeds 1-2 as G-10 | partial | CLOSED - all six runs have train_log.csv, ckpt_*.pt and policy.pt |
| G-12 | 5 | SC3 | results/summary_reduction.csv and results/training_curves.png absent; spread undefined with one seed | drive.sh step "analyze" (single-seed only) | partial | CLOSED - results/summary_reduction.csv and results/training_curves.png exist. Residual: no validation-program plot, tracked as G-21 |
| G-13 | 5 | SC4 | No leakage check showing the held-out set is untouched by learned policies | Write and run a leakage check | no | CLOSED - scripts/leakage_check.py; results/leakage_check.txt OK (6 runs) |
| G-14 | 6 | SC1 | results/eval.csv, summary_reduction.csv, wins_ties_losses.csv absent | drive.sh steps "eval" and "analyze" | partial | CLOSED - results/eval.csv (120 rows), summary_reduction.csv, wins_ties_losses.csv |
| G-15 | 6 | SC2 | No held-out result stated in the results text | Write after eval.csv exists; report as measured | no | CLOSED - README Results and What this means state the held-out result as measured |
| G-16 | 6 | SC3 | results/failure_cases.csv and action_histogram.png absent; written explanation missing | drive.sh step "analyze" for files; explanation by hand | partial | CLOSED - results/failure_cases.csv, action_histogram.png, RESULTS.md Failure analysis, README What this means |
| G-17 | 6 | SC4 | No replay of final stored sequences | drive.sh step "eval" (replay_ok column), then list mismatches | partial | CLOSED - eval.csv replay_ok 120/120; long_eval.csv 40/40; 0 mismatches |
| G-18 | 7 | SC1 | Final tables and plots not generated by the scripted run | drive.sh step "analyze", then report/make_figures.py | partial | CLOSED - scripts/analyze.py regenerates tables and plots. Residual: supplementary README table copied by hand, tracked as G-22 |
| G-19 | 7 | SC2 | No screenshots of the final run or final comparison table | Capture after the final run | no | CLOSED - 96a2b60 |
| G-20 | 7 | SC3 | README does not yet reproduce final results (they do not exist) | Update README Results section after the final run | no | CLOSED - README Results gives the final numbers. Caveat: run_all.sh does not run the three check scripts (drive_seeds.sh does) |
| G-21 | 5 | SC3 | No dense-vs-sparse plot on validation programs (the table exists in RESULTS.md and summary_reduction.csv; training_curves.png covers training batches only) | Add a validation-program plot to scripts/analyze.py | no | CLOSED - 96a2b60 |
| G-22 | 7 | SC1 | README table "Supplementary: 2000-episode runs" is copied by hand from results/long_eval.csv and runs/long_*; no script builds it | Extend scripts/analyze.py (or drive_long.sh) to build the table from long_eval.csv | no | CLOSED - 96a2b60 |
| G-23 | 7 | - (not an SC) | report/Assessment10_RL_Phase_Ordering.docx (21 Oct 22:58) and report/fig_baselines.png (21 Oct 22:43) predate the final results and the 20-row baselines.csv | Re-run report/make_figures.py and report/build_docx.py with the final numbers | no | CLOSED - 96a2b60 |

### Gap updates (2026-10-21 23:30, user extended deadline ~2 days, auto mode)

- G-03 CLOSED: DESIGN.md split text matches split.json (20 of 23; jpeg + ghostscript excluded) - b1717c2
- G-06 CLOSED: budget fixed at 320 episodes, 3 checkpoints, everywhere (DESIGN.md, run_all.sh, drive.sh, drive_seeds.sh) - b1717c2
- G-07 threshold PRE-REGISTERED before runs/overfit existed: >= 80% of -Oz reduction on crc32, qsort, adpcm (scripts/overfit_check.py) - b1717c2, a902fd2
- G-04, G-13: scripts/reward_sum_check.py and scripts/leakage_check.py written; run by drive_seeds.sh (outputs results/*_check.txt)
- G-10: drive_seeds.sh trains seeds 1-2 for both arms; queued detached to start when drive.sh (pid 7339) exits; log logs/drive_seeds.out
- Sanity baseline doc-sync: DESIGN.md now says 50 candidates (what drive.sh runs)
- Remaining after the pipeline: G-01 (wheel listing), G-02 cause note, G-15/G-19/G-20 write-up, report docx update

### Early finding (2026-10-22 00:30)

- Overfit run (crc32, qsort, adpcm): greedy policy = `-sroa` repeated 15 times on all three. Pre-registered 80% rule: PASS (0.92 / 0.91 / 0.81 of the -Oz reduction), but best fixed random sequence beats it on all three (119 vs 124, 292 vs 346, 228 vs 280). Indicates policy collapse to a single pass; the 80% bar turned out to be weak. Report as is; any fix (e.g. no-effect action masking, entropy schedule) is an approach change needing user approval.

### Pipeline fixes (2026-10-22 00:45)

- IR2Vec leaked ~2 MB/call (train.py grew ~30 MB/s, OOM-killed under shared WSL load). Fixed: rlpo/embed_worker.py recycles a worker every 100 calls; vectors bit-identical; RSS flat - 1401a36
- drive_seeds.sh marked every new run done after one chunk: `wsl -- bash -lc` routes through the distro's default shell, which expanded $?/$rc early, so `exit $rc` returned tail's 0 (not a WSL restart, not CompilerGym). Fixed with `wsl --exec` in drive.sh and drive_finish.sh (1787ec6); drive_seeds.sh still has the bug (patch it after it exits). Checks' true results are in results/*_check.txt, not the drive logs. drive_finish.sh (ab2bded) verifies completion and is queued after drive_seeds.sh; it is the stage the write-up waits for.
- User raised WSL to 10 GB RAM + 8 GB swap; another project (GPU LLM training) shares the VM.

### Results (2026-10-22 01:35) - bf2cd61

- Test reduction vs -O0: -O2 30.6%, -O3 27.0%, -Oz 49.1%, random 19.9%, best fixed 47.3%, RL dense 38.2% +/- 0.0, RL sparse 40.5% +/- 3.2 (3 seeds, 320 episodes).
- RL beats -O3 on 7/8 and -O2 on 6-7/8 test programs (corrected 2026-10-22); loses to -Oz (8/8, except sparse_s0 bzip2) and to best fixed sequence (8/8).
- 5/6 greedy policies = -sroa x15 for every program (sparse_s0 = -sroa -gvn x14); entropy 3.22 -> ~3.18 (max 3.22): undertrained, not program-specific.
- Checks: 120/120 replay ok, 0 crashes, lli 42 match / 0 mismatch / 78 n.a., reward sum exact, leakage OK, overfit PASS (0.92/0.91/0.81).
- Closed: G-02, G-04, G-05, G-07 (with caveat), G-10, G-11, G-12, G-13, G-14, G-15, G-16, G-17, G-18, G-20. Open: G-01 wheel listing, G-19 screenshots, report docx update.
- Supplementary 2000-episode runs (6c0031a, one seed each, added after main results): dense 41.4%, sparse 38.2% test reduction; both 0/0/8 vs -Oz and best fixed; entropy 3.22 -> 2.19 / 1.83; dense = effectively -sroa -instcombine everywhere, sparse = -sroa x15 (val picked 400-ep ckpt). README subsection added; report docx not yet updated.

### Morning check (2026-10-22 07:45)

- Supplementary 2000-episode runs (6c0031a) verified against results/long_eval.csv: dense 41.4%, sparse 38.2% test reduction; still lose to -Oz and best fixed on 8/8; entropy 3.22 -> 2.19 / 1.83.
- G-01 CLOSED: ~/rlphase-backup/wheels holds compiler_gym-0.2.5 and IR2Vec-2.1.1 wheels.
- Remaining: G-19 screenshots, Assessment report (.docx) update with final numbers, REQUIREMENTS.md traceability.

### Close-out (2026-10-22)

- Totals over 27 criteria at HEAD 6c0031a: 22 EVIDENCED, 3 PARTIAL (P5-SC3, P7-SC1, P7-SC2), 0 MISSING, 2 MISSED-DEADLINE (P4-SC3, P4-SC4). Requirements: 11 Complete, 1 Partial (OUT-02), 1 Missed (OUT-01).
- Ticked: Phases 1, 2, 3 and 6 (all criteria EVIDENCED). Unticked: Phase 4 (SC3/SC4 MISSED-DEADLINE, never closable, not backfilled), Phase 5 (SC3 lacks the validation-program plot, G-21), Phase 7 (SC1 hand-copied supplementary table G-22; SC2 no final-run screenshots G-19).
- Caveats the user may overrule (R3 judgment calls, all kept EVIDENCED): P1-SC1 only two wheels archived; P2-SC3 cause of the service-vs-CLI -O3 gap unexplained; P4-SC1 greedy policy collapsed to -sroa x15 and loses to best fixed; P7-SC3 run_all.sh does not run the three check scripts; TRAIN-01 overfit check ran after the seed-0 training runs, not first. Other caveat: P6-SC3 failure_cases.csv quantifies only -O3 and -Oz.
- New gaps found by this re-check: G-21, G-22, G-23 (all OPEN). Open overall: G-08, G-09 (not closable), G-19, G-21, G-22, G-23.
- Progress is set by hand from the ROADMAP checkboxes. A GSD command that recomputes progress from disk (state update-progress, roadmap update-plan-progress, phase complete) would see 0 plans and reset the percent to 0; do not run those without re-applying the numbers above.

### Completion (2026-10-22, 96a2b60)

- G-19, G-21, G-22, G-23 CLOSED: validation dense-vs-sparse plot, scripts/supplementary.py, captured final-run output, report .docx and figures regenerated from final CSVs (14 pages, rendered via Word and checked).
- Phases 5 and 7 ticked: 6 of 7 (86%); 27 criteria: 25 EVIDENCED, 0 PARTIAL, 2 MISSED-DEADLINE. Requirements: 12 Complete, 1 Missed (OUT-01).
- Only Phase 4 stays unticked, permanently: the 14 Oct PRELIMINARY package (SC3/SC4) was missed and is not backfilled. Nothing else is open.

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-22T15:32:34.981Z
Stopped at: Completed 08-02-PLAN.md
Resume file: None
