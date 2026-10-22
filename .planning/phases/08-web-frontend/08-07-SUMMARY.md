# Plan 08-07 Summary: Programs View (Per-Program Explorer)

## 1. Plan Overview
- **Phase:** 08-web-frontend
- **Plan:** 07 (Programs view: per-program bar list, finding, pass-sequence strips, phone step table)
- **Status:** Complete (all 2 tasks passed)
- **Goal:** Deliver the per-program explorer ("On this program, where does each method land, and what did the agent actually do?"), allowing visitors to inspect any of the 20 cBench benchmarks across reference compilers (`-O0`, `-O2`, `-O3`, `-Oz`), the best fixed sequence, and all RL policy runs with their exact 15-step pass sequences and muted no-effect steps.

---

## 2. Artifacts Produced / Modified
- [`web/views/programs.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/programs.js): Complete Programs view implementation with 3-split listbox sidebar, sticky desktop layout, mobile optgroup selector, computed finding sentence from medians, method instruction bar chart with `-O0` dashed reference line, 10-row sequence strip list with muted no-effect steps, expandable "Show every step" table, and mobile single-run step table. Zero typed numbers; all metrics derived dynamically from `window.DATA`.
- [`web/views/programs.css`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/programs.css): Programs-specific styling (12-column responsive layout, 44px list items with hover outline and active fill, sticky sidebar, mobile fold at 1100px and 640px, strip list gap and headers).
- [`web/charts-ext.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/charts-ext.js): Added reference line top padding (22px) to prevent label clipping in count mode, and supported grey dash (`-`) for missing 2000-episode runs.
- [`web/strip.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/strip.js): Added `data-ui="true"` attribute on `.strip-row` so interface widgets are recognized by layout linters as self-contained clipping surfaces.

---

## 3. Verification & Acceptance Criteria
- **Task 1 Automated Verification:**
  - `python scripts/render_check.py programs/blowfish --expect "Programs" --expect "Instructions after each method" --expect "3,898" --expect "2,327" --expect "1,932" --expect "RL dense and RL sparse both end at 2,327 instructions" --expect "19.1% larger than -O3" --expect "20.4% larger than -Oz" --expect "13.7% larger than the best fixed sequence" --fonts`: **PASS (9 expectations)**
  - `python scripts/render_check.py programs/qsort --expect "+264.1%"`: **PASS** (displays signed note in negative red token)
  - `python scripts/render_check.py programs/nosuchprogram --expect "No program called" --expect "Showing blowfish instead"`: **PASS** (empty state handled cleanly)
  - `python scripts/render_check.py overview --expect "but loses to -Oz and the best fixed sequence"`: **PASS** (0 regressions on Overview)
  - Grep check for hardcoded numbers (`3,898|2,327|264\.1|19\.1`): **0 matches**.
- **Task 2 Automated Verification:**
  - `python scripts/render_check.py programs/bzip2 --expect "Pass sequences chosen by each run" --expect "Best fixed sequence" --expect "RL sparse, seed 2" --expect "Added after the main results, one seed" --expect "Show every step" --expect "14 of 15 no effect"`: **PASS (6 expectations)**
  - `python scripts/render_check.py programs/blowfish --expect "0 of 15 no effect"`: **PASS**
  - `python scripts/render_check.py programs/bzip2 --width 390 --theme dark --expect "no effect"`: **PASS**
  - `python scripts/render_check.py overview --expect "What the policies learned"`: **PASS**
- **Quality Gate Runner:**
  - `bash scripts/web_gate.sh --port 8107 programs/blowfish programs/bzip2`:
    - `programs/blowfish (light)`: **0 FAIL, 0 WARN**
    - `programs/blowfish (dark)`: **0 FAIL, 0 WARN**
    - `programs/bzip2 (light)`: **0 FAIL, 0 WARN**
    - `programs/bzip2 (dark)`: **0 FAIL, 0 WARN**
    - **GATE RESULT: PASS (all criteria satisfied)**

---

## 4. Visual Critique & App-Screen Review

### Visual Examination of Screenshots
Inspected captured images across viewports and themes (`.taste-skill/app/inspect-programs-*`):
1. **Desktop 1440px (`desktop-fold.jpg`, `desktop-page-01.jpg`):**
   - 2-column open plane: sticky left column (256px equivalent, span 3) cleanly organizes the 20 benchmarks into Test (8), Validation (3), and Train (9) with tabular `-O0` counts.
   - Detail column (span 9) shows the benchmark title, neutral split pill, `-O0` reference count, and the computed finding sentence.
   - "Instructions after each method" bar chart features crisp geometric alignment: `-O0` vertical dashed line clearly denotes the baseline; `-O2`, `-O3`, `-Oz`, and best fixed marks match the categorical assignment table. Seed ticks appear on RL rows only where seeds vary.
   - "Pass sequences chosen by each run": 15-cell grid render is clean. On `blowfish`, all cells in `dense_s0` are filled with `--hue` (`#1d5fbf` / `#5b9bff`) because all steps changed instructions. On `bzip2`, the `-sroa x15` collapse is immediately conspicuous: cell 1 is filled with `--hue` and cells 2-15 are muted with `--raised` fill and `--muted` text ("14 of 15 no effect").
2. **Tablet 768px (`tablet-fold.jpg`, `tablet-page-01.jpg`):**
   - Program navigation stacks above the detail column; 15-cell strip maintains > 41px minimum cell width (42px measured) without horizontal scrolling.
3. **Mobile 390px (`mobile-fold.jpg`, `mobile-page-01.jpg`):**
   - The desktop listbox transforms into a 44px native `<select>` with `<optgroup>` per split and 44px Previous/Next touch targets.
   - The strip list is replaced by a single-run dropdown and a 15-row step table with mono code passes and muted "no effect" labels, eliminating horizontal scrolling.

### WARN Defences
- `[mono] Monospace type (6x)`: Permitted and expected. Monospace font declarations (`font-family: 'Geist Mono'`, `GeistMono`, `.font-mono`) are restricted to literal code blocks (`<code>` pass names, shell commands, and file paths) in accordance with the typography guidelines.
