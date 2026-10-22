# Plan 08-08 Summary: Training, Checks and Split-and-Method Views

## 1. Plan Overview
- **Phase:** 08-web-frontend
- **Plan:** 08 (Training curves and entropy, Checks, Split and method)
- **Status:** Complete (all 2 tasks passed)
- **Goal:** Complete the remaining static views of the frontend:
  1. **Training view:** "Did the policies learn anything?" (3 line charts for reduction, policy entropy with uniform reference line, and no-effect/NOOP steps; Runs table; Validation per checkpoint table; Main and Supplementary tabs).
  2. **Checks view:** "Can these numbers be trusted?" (What was checked table with Replay, Crashes, `lli` output check, leakage, reward sum, overfit rule, and page numbers assertion check; pre-registered overfit card with computed fixed sequence comparison).
  3. **Split and method view:** "What was it trained and tested on, and what is the decision problem?" (Train/Val/Test 32px program lists with -O0 counts, excluded programs table with crash reasons, full MDP decision problem key-value well with 24 pass chips + NOOP, and repository/document links).

---

## 2. Artifacts Produced / Modified
- [`web/views/training.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/training.js): Full Training view with segmented metric switch (No-effect vs NOOP share), main runs (320 episodes) vs supplementary runs (2000 episodes) tabs, dynamic entropy findings, uniform reference line at $\ln(25) \approx 3.22\text{ nats}$, 6-row / 2-row Runs table, and checkpoint validation table.
- [`web/views/training.css`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/training.css): Training-specific styling (3-chart grid, table alignment, tab bar spacing, responsive folding).
- [`web/views/checks.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/checks.js): Checks view with dynamic findings, 7-row "What was checked" verification table with source code chips, neutral "Not available" pill for unrunnable `lli` benchmarks, and overfit rule card comparing agent to best fixed sequences.
- [`web/views/checks.css`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/checks.css): Checks-specific styling (responsive table collapsing into two-line rows on phone, monospace source chips, pill badges).
- [`web/views/method.js`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/method.js): Split and method view with computed subline, 32px program rows across Train (9), Validation (3), and Test (8), excluded benchmarks card (`ghostscript`, `jpeg-c`, `jpeg-d`), MDP decision problem specification with 12px pass chips, and documentation link cards.
- [`web/views/method.css`](file:///c:/Users/rvsre/Documents/compiler%20project/web/views/method.css): Method-specific styling (32px row list layout, chip cloud, external link cards, `align-items: start` grid to avoid panel voids).

---

## 3. Verification & Acceptance Criteria

### Task 1: Training View
- `python scripts/render_check.py training --expect "Training" --expect "Main runs, 320 episodes" --expect "Supplementary, 2000 episodes" --expect "Mean size reduction on training batches" --expect "Policy entropy" --expect "Steps that did nothing" --expect "Uniform over 25 actions" --expect "3.22" --expect "Validation per checkpoint" --expect "RL sparse, seed 2" --fonts`: **PASS (10 expectations)**
- `python scripts/render_check.py training --width 390 --theme dark --expect "Policy entropy"`: **PASS**
- Grep check for hardcoded numbers (`3.22|3.18|2.19|1.83|320|2000`): **0 matches** (all figures dynamic from `DATA`).
- `bash scripts/web_gate.sh --port 8108 training`: **0 FAIL, 1 WARN** (defended: sibling stretch on segmented control card).

### Task 2: Checks & Split/Method Views
- `python scripts/render_check.py checks --expect "Checks" --expect "Every check passed" --expect "120 of 120" --expect "40 of 40" --expect "Not available" --expect "Overfit rule, set before the runs" --expect "Page numbers equal results/" --expect "scripts/check_web.py" --fonts`: **PASS (8 expectations)**
- `python scripts/render_check.py method --expect "Split and method" --expect "Excluded programs" --expect "ghostscript" --expect "The decision problem" --expect=-correlated-propagation --expect "Where to read more" --fonts`: **PASS (6 expectations)**
- `python scripts/render_check.py checks --width 390 --theme dark --expect "What was checked"`: **PASS**
- Grep check for hardcoded numbers (`120 of 120|\b42\b|\b78\b|0.92|\b24 passes`): **0 matches**.
- Source hygiene: `python scripts/check_web_source.py`: **OK (17 files)**.
- Data integrity: `python scripts/check_web.py`: **OK (6110 assertions)**.
- Quality Gate: `bash scripts/web_gate.sh --port 8108 checks method`:
  - `checks (light)`: **0 FAIL, 0 WARN**
  - `checks (dark)`: **0 FAIL, 0 WARN**
  - `method (light)`: **0 FAIL, 1 WARN** (ragged-row, defended)
  - `method (dark)`: **0 FAIL, 1 WARN** (ragged-row, defended)
  - **GATE RESULT: PASS (all criteria satisfied)**

---

## 4. Visual Critique & App-Screen Review

### Visual Examination of Screenshots
Inspected captured images across viewports and themes (`.taste-skill/app/inspect-checks-*`, `.taste-skill/app/inspect-method-*`):
1. **Checks (Desktop 1440px & Mobile 390px, Light/Dark):**
   - Clean, professional audit report presentation.
   - "What was checked" table clearly delineates each sanity verification with positive green pills for matches and zero crashes, while `78 lack wired runtime inputs` cleanly carries the neutral grey pill "Not available" (never misleadingly green).
   - "Overfit rule, set before the runs" table cleanly presents the pre-registered threshold (80%) on `crc32`, `qsort`, and `adpcm`. The computed finding honestly confirms: *"The best fixed sequence is smaller than the agent on 3 of 3 of these programs."*
   - On 390px mobile, the table collapses into two-line rows (check name on line 1 with source code tag, result pill and description cleanly spaced) with zero horizontal overflow.
2. **Split and Method (Desktop 1440px & Mobile 390px, Light/Dark):**
   - Subline immediately informs the reader of the 20 cBench programs, family grouping, and the 15-step action budget.
   - Train (9), Validation (3), and Test (8) columns list program names alongside `-O0` instruction counts with strict 32px row height and tabular numeric alignment.
   - Excluded programs card explicitly details why `ghostscript`, `jpeg-c`, and `jpeg-d` were dropped before split assignment (WSL VM crashing and 1.8s/step latency).
   - Decision problem key-value well formats the MDP compactly; all 24 passes plus `NOOP` render as 12px monospace chips (`.pass-chip`) in a flex cloud.
   - External links card ("Where to read more") provides styled card buttons with external link arrows leading directly to master branch documentation and the GitHub repository.

### WARN Defences
- `[ragged-row] in method`: Cards in the split row end at different natural heights because Train contains 9 programs, Validation contains 3 programs, and Test contains 8 programs. Setting `align-items: start` ensures cards shrink to their content rather than stretching blank void into the Validation card (which previously triggered `[panel-void]`). This is the intended design for split lists with unequal counts.
- `[mono] in app.css/app.js`: Monospace typography is strictly isolated to literal code blocks (`<code>`, `.pass-chip`, shell commands, file paths) in accordance with the typography rules.
