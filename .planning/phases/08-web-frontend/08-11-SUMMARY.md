# Phase 8 Plan 11 Summary: Frontend Documentation & Final Acceptance Sweep

## 1. Plan Overview
- **Phase:** 08-web-frontend
- **Plan:** 11 of 11
- **Type:** Execute (Wave 7)
- **Goal:** Document the static results explorer and live WSL server in `README.md`, add manual GitHub Pages deployment workflow `.github/workflows/pages.yml`, and execute the comprehensive final acceptance sweep across all Phase 8 success criteria (SC1-SC5) and requirements (WEB-01, WEB-02, WEB-03).

---

## 2. Artifacts Produced
- **`README.md`**: Added `## Frontend` section (between `## Running it` and `## Code`) and Code table rows for `web/`, `web/server.py`, `scripts/export_web.py`, `scripts/export_traces.py`, and `scripts/web_gate.sh`. Diff against 7137529 is strictly additive (44 added lines, 0 deleted lines).
- **`.github/workflows/pages.yml`**: Manual GitHub Pages deployment workflow triggered solely via `workflow_dispatch` deploying `web/` artifact via official GitHub Actions (`actions/checkout@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`).

---

## 3. Final Acceptance Sweep (Evidence for SC1 - SC5)

### SC1: Data Provenance & Truth (`export_web.py` & `check_web.py`)
- **Criterion:** `scripts/export_web.py` builds `web/data.json` only from `results/*.csv`, `results/*_check.*`, `splits/split.json`, and `runs/*/{run.json,train_log.csv}`. Every number on the page comes from it, and a check script confirms that page numbers equal `results/`.
- **Evidence:**
  - `python scripts/export_web.py`: Wrote `web/data.json` (364,524 bytes, 6,110 assertions passed) and `web/data.js` (231,471 bytes).
  - `python scripts/check_web.py --require-traces`: `check_web: OK (6110 assertions)`.
  - `python scripts/check_vendor.py`: `check_vendor: OK (6 files)`.
  - `git diff --quiet 7137529 -- results/`: Byte-identical to commit 7137529 (zero modifications).
  - Data reproducibility check: `assert a==b` apart from timestamp/commit stamps passed (`data.json reproducible`).

### SC2: Static Results Explorer (`web/index.html` & Views)
- **Criterion:** Opening `web/index.html` (via static server or GitHub Pages with no WSL) shows: summary & W/T/L tables; per-program view with baselines vs RL vs 2000-episode runs with greedy pass sequences; training curves and entropy; benchmark split; and sanity checks.
- **Evidence:**
  - Offline rendering test with vendored Geist fonts:
    - `python scripts/render_check.py overview --offline --fonts`: OK
    - `python scripts/render_check.py programs/blowfish --offline --fonts`: OK
    - `python scripts/render_check.py training --offline --fonts`: OK
    - `python scripts/render_check.py checks --offline --fonts`: OK
    - `python scripts/render_check.py method --offline --fonts`: OK
  - Honest headline check:
    - `python scripts/render_check.py overview --expect "but loses to -Oz and the best fixed sequence" --expect "Loses to best fixed sequence"`: OK

### SC3: Live Runner Server (`web/server.py`)
- **Criterion:** `web/server.py` (stdlib only; no new packages in pinned venv) runs inside WSL, serves `web/`, exposes `/api/health` and an endpoint that runs a chosen trained policy greedily on a chosen cBench program and streams each step (pass, instruction count, no-effect flag). It uses one CompilerGym env at a time, and never writes to `results/` or `runs/`.
- **Evidence:**
  - Unit tests: `python -m unittest discover -s tests -p "test_server.py"`: Ran 12 tests in 6.376s, all **OK**.
  - Standard library only: Zero third-party dependencies (`import http.server, socketserver, urllib, json, os, sys, threading, time, csv, re`).
  - Read-only guarantee: `scripts/live_check.py --no-writes`: `Write check: OK (no files modified in results/ or runs/)`.

### SC4: Live Tab UI & Verification (`#/live`)
- **Criterion:** The page enables the Live tab only when `/api/health` answers. Live runs reproduce the stored `results/eval.csv` final count for the same run and program.
- **Evidence:**
  - Offline probe check: `python scripts/render_check.py live --offline --expect "The live server isn't running"`: OK.
  - End-to-end live check across two model/benchmark pairs:
    - `dense_s0:bzip2`: final=18846, stored=18846, match=True.
    - `long_dense_s0:tiff2bw`: final=35276, stored=35276, match=True.
    - Result: `live_check: OK (2 pairs verified)`.
  - Process hygiene: Stopped cleanly with 0 leftover `compiler_gym-llvm-service` processes in WSL.

### SC5: Documentation & Responsive Quality
- **Criterion:** The README documents how to open the explorer and how to start the live server. The page works at phone width and in light/dark mode.
- **Evidence:**
  - `README.md` updated with `## Frontend` section documenting file opening, HTTP server, GitHub Pages, data regeneration, and live execution.
  - Plan 08-10 Visual Gate: 12 / 12 routes/themes at 0 FAIL across 1440px desktop, 768px tablet, and 390px mobile viewports.

---

## 4. Human-Check Queue for UAT
The following visual backstops from `08-UI-SPEC.md` are queued for human inspection:
1. **Strip Pattern Rendering:** Verify that best-fixed hatch lines, -O3 tint fill, RL sparse tint fill with borders, and hollow 2000-episode dots render consistently across 1440, 768, and 390 viewports in both light and dark themes.
2. **Tabular Numerics Alignment:** Verify that table columns align digit for digit using Geist tabular numerals (`font-variant-numeric: tabular-nums`).
3. **Dark-Mode Contrast & Legibility:** Verify that all pill statuses (positive `#3fc07a`, negative `#e5566f`, neutral `#b4b4b4`, notice `#e0b25a`) and axis labels are comfortably legible against pure `#000000` / `#111111` ground in dark theme.
