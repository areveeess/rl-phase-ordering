# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Viva examiners: faculty evaluating a Compiler Design course project (VIT), shown the explorer on a laptop or projector during the review, with the team (Aryan V Sangai, Nikhila Abdul Salam, Raj Vardhan Singh) driving it and answering questions. Their job is to judge, in a few minutes, what was built, what was measured, and whether the claims are honest.

## Product Purpose

A results explorer for an RL-guided LLVM phase-ordering study. A REINFORCE agent picks a 15-pass sequence per program from 24 size-related LLVM passes (plus NOOP); the explorer shows how its code-size results compare with LLVM's fixed pipelines (-O2, -O3, -Oz), random sequences and the best fixed sequence, on held-out programs it never trained on, and lets the team run a trained policy live. Success: an examiner leaves knowing the finding and trusting that every number is real.

## Positioning

The finding is told honestly, including where the agent loses: it beats -O3 on 7 of 8 held-out programs and -O2 on 6 to 7, but loses to -Oz and to a single good fixed sequence on all of them, and 5 of 6 policies collapse to repeating one pass (-sroa). Every number on the page is generated from the measured result files and machine-checked against them; nothing is hand-typed.

## Operating Context

- Shown during a live viva on a Windows laptop, often on a projector; may be opened from `file://` with no network, or from GitHub Pages.
- The optional live run needs a Python server inside WSL (CompilerGym is Linux-only); when it is not running the explorer still works fully.
- Data comes from `results/` (CSV) and `runs/` via `scripts/export_web.py` into `web/data.json` / `web/data.js`.

## Capabilities and Constraints

- Keep every existing view and feature: overview of the finding, per-program comparison with each run's greedy pass sequence, training curves and entropy, the checks (replay, lli, leakage, reward sum, overfit rule), the train/validation/test split and method, and the optional live run.
- Keep the honesty machinery: data only from `scripts/export_web.py`; `scripts/check_web.py`, `check_web_source.py`, `check_vendor.py`, `render_check.py` must keep passing; no hand-typed figures in source.
- Static site: plain HTML/CSS/JS, no build step, no runtime CDN; opens from `file://` and GitHub Pages, works offline. Third-party files are vendored in `web/vendor/` with SHA-256 records.
- Terminology: cBench programs; LLVM IR instruction count is the size metric; "reduction" = 1 − geomean(final / -O0); dense vs sparse reward; seeds 0–2; 320-episode main runs, 2000-episode supplementary runs (added after the main results, one seed each).
- The repo's root `DESIGN.md` is the project's MDP design note, not a UI design system; the UI's design system lives in `web/DESIGN.md`.

## Evidence on Hand

- `results/` CSVs and checks, `report/Assessment10_RL_Phase_Ordering.docx`, `README.md` Results section, `DESIGN.md` (method).
- No testimonials, users, deployments or external endorsements exist; none may be invented.

## Product Principles

1. The honest finding comes first, including where the agent loses.
2. Every number is traceable to a measured file and checked by a script.
3. An examiner should get the story in under a minute, then be able to drill into any program, run or check.
4. The tool works without its optional parts (no network, no WSL).
