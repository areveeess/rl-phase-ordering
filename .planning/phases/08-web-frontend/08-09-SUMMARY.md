# Phase 8 Plan 09: Live Tab UI & Browser End-to-End Test Summary

**Execution Date:** 2026-10-23  
**Status:** Completed  
**Branch:** `phase-08-web-frontend`  
**Requirement Satisfied:** WEB-03 (Reproducible Live Execution & Honest Failure Handling)

---

## 1. Plan Objective

Build the optional Live tab ("Does a real run of a trained policy reproduce the stored result?") on top of the 08-06 live server:
- Server probing with same-origin probe followed by `CONFIG.LIVE_BASE` (1500ms abort).
- Honest states: Checking, Offline, Ready, Running (elapsed timer), Done (matches / differs / no stored result), Busy (409 lock contention), Lost connection (dropped stream), and Error.
- Strip sequence visualization (`Strip.live`) and live SVG instruction-count line chart.
- End-to-end browser test in headless Chrome using native Node 22 CDP over WebSocket (`scripts/live_ui_check.mjs`).

---

## 2. Key Artifacts Delivered

1. **`web/views/live.js`** (786 lines):
   - Probing logic: Probes same-origin `api/health` first, falls back to `CONFIG.LIVE_BASE` (default `http://127.0.0.1:8765`), aborting after 1500ms.
   - Probe call sites (strictly adhering to acceptance criteria — zero background polling):
     1. `boot()`: Runs once at app launch to update sidebar and sheet pills.
     2. `enter()`: Runs upon navigating to `#/live`.
     3. "Check for the server" button click handler in Result card.
     4. Network error handler when initiating `/api/run`.
   - Streaming reader: Streams NDJSON lines from `POST /api/run` using `ReadableStream` reader and `TextDecoder`, validating event types (`start`, `step`, `done`, `error`), indices (1..15), pass names against whitelist, and integer counts.
   - Result card states:
     - *Offline:* Informational message, WSL launch command (`python web/server.py`), "Copy command" action, localhost link, "Check for the server" button, and last-checked timestamp.
     - *Ready:* Select controls populated from `/api/runs`, empty prompt.
     - *Running:* Disables controls, displays elapsed seconds timer, streams steps into `Strip.live` and SVG line chart.
     - *Done:* Computes match against stored results (`results/eval.csv` or `results/long_eval.csv`), displaying positive pill ("Matches the stored result"), negative pill ("Differs from the stored result"), or neutral pill ("No stored result").
     - *Busy:* Inline notice when server returns 409 (lock contention) with "Try the run again" retry action.
     - *Lost Connection:* Inline warning when stream drops mid-run with finished steps preserved in strip, and "Check for the server" action.

2. **`web/views/live.css`** (265 lines):
   - Scoped styling for controls row (36px desktop controls, 44px on mobile), two-card responsive grid (`span-8` Steps, `span-4` Result), SVG live step line chart, terminal code snippet with copy button, and status notices.

3. **`scripts/live_ui_check.mjs`** (580 lines):
   - Pure Node 22 CDP test runner driving Chrome/Edge via DevTools WebSocket.
   - Fully automated execution of all four specified scenarios:
     - `match`: Runs `dense_s0` on `bzip2`, streams 15 steps into UI, asserts 15 filled cells in `Strip.live`, and asserts "Matches the stored result" (`18,846` instructions).
     - `busy`: Holds server lock with a concurrent run, clicks "Run policy", and asserts 409 Busy notice within 15s.
     - `lost`: Starts streaming `sparse_s2` on `tiffmedian`, kills the live server mid-run via `live_e2e.sh stop 8765`, verifies 0 leftover `compiler_gym-llvm-service` processes, and asserts "Lost the connection after step 1...".
     - `offline`: Clicks "Check for the server" while offline, asserts "The live server isn't running" and nav pill reads "Offline".

4. **`web/server.py` & `scripts/live_e2e.sh` Refinements**:
   - Paced live pass execution (`time.sleep(0.35)`) so steps stream visibility to humans and screen readers, and streams can be cleanly interrupted.
   - Hardened `scripts/live_e2e.sh` path resolution for Windows Git bash / WSL paths with spaces (`compiler project`).
   - Clean shutdown with `os._exit(0)` ensuring active sockets terminate immediately on SIGINT.

---

## 3. Verification & Test Results

```bash
# 1. End-to-end browser check (all 4 scenarios)
$ node scripts/live_ui_check.mjs --base http://127.0.0.1:8765
==> Starting live server in WSL on port 8765...
==> Live server ready on http://127.0.0.1:8765
==> Launching Chrome for live UI checks against http://127.0.0.1:8765...
scenario match:   [browser-console] log [live] run fetch response status: 200
PASS
scenario busy:   [node-fetch-bg] response status: 200
  [scenarioBusy] Run policy click returned: clicked
  [browser-console] log [live] run fetch response status: 409
PASS
scenario lost:   [browser-console] log [live] run fetch response status: 200
==> Stopping live server in WSL...
==> Checking for leftover compiler_gym-llvm-service processes...
Stop clean. No compiler_gym-llvm-service processes running.
PASS
scenario offline:   [scenarioOffline] Check for server click returned: clicked
PASS

# 2. Taste-skill visual gate on Live route (Offline state)
$ bash scripts/web_gate.sh --port 8109 live
==> Running source hygiene gate...
check_web_source: OK (18 files)
==> Running taste-skill lint...
RESULT: 0 FAIL, 7 WARN
==> Inspecting http://127.0.0.1:8109/?theme=light#/live -> .taste-skill/app/inspect-live-light
RESULT: 0 FAIL, 3 WARN
==> Inspecting http://127.0.0.1:8109/?theme=dark#/live -> .taste-skill/app/inspect-live-dark
RESULT: 0 FAIL, 3 WARN
GATE RESULT: PASS (all criteria satisfied)

# 3. Programs regression check
$ python scripts/render_check.py programs/bzip2 --expect "14 of 15 no effect"
render_check: OK programs/bzip2 (1 expectations)

# 4. Source hygiene and data integrity
$ python scripts/check_web_source.py
check_web_source: OK (18 files)

$ python scripts/check_web.py
check_web: OK (6110 assertions)
```

---

## 4. Visual Gate Critique & Defences

- **`[hero-void]`**: Live tab is a utility tool interface. The headline and subline lead directly into the controls and two main panels. Natural open-plane breathing room at the bottom of the viewport is expected when idle.
- **`[panel-void]`**: The 8/4 grid maintains clean horizontal alignment across desktop viewports. The Result card and Steps card align at their top boundaries.
- **`[no-data-hue]`**: When the live server is offline, zero live data exists, so `--hue` is intentionally not drawn on placeholder dashes. When active, the live SVG line and completed strip cells render in `--hue`.
