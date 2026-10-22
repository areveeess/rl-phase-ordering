# Phase 8 Plan 10 Summary: Cross-Route Visual Gate & Layout Consolidation

## 1. Plan Overview
- **Phase:** 08-web-frontend
- **Plan:** 10
- **Type:** Execute (Wave 6)
- **Goal:** Run the visual gate across all six routes in both light and dark themes at three viewports (1440, 768, 390); fold view-scoped CSS overrides from 08-08 into shared foundation styles (`web/app.css`); inspect rendered screenshots across all routes; critique and eliminate cross-route layout flaws.

---

## 2. Folded Overrides Mapping
The view-scoped overrides introduced in 08-08 (due to wave isolation) were consolidated into shared styles in `web/app.css`:
- **Grid top-alignment:** `.grid { align-items: start; }` added to `web/app.css`, resolving `panel-void` globally and allowing content-driven heights. Removed redundant `.view-method .grid` from `web/views/method.css`.
- **Responsive columns:** Added `.span-6` grid utility and responsive tablet collapse (`@media (max-width: 1100px) { .span-4, .span-6 { grid-column: span 12; } }`) in `web/app.css`. Removed duplicate rules from `web/views/method.css` and `web/views/training.css`.
- **Table frame & cell styles:** Added shared table cell padding, alignment, and border rules for `.table-frame table` in `web/app.css`.
- **Card notes & explanations:** Added shared `.card-note, .checks-note` styling (12px, font-mono, muted ink, rule border, 8px padding) to `web/app.css`, removing redundant duplicate definitions in `web/views/checks.css`.
- **Strip container scroll containment:** Added `max-width: 100%; overflow-x: auto;` to `.strip-row, .strip-live` in `web/app.css` to prevent phone horizontal page clipping on mobile viewports.

---

## 3. Web Gate Results (12 / 12 Clean)
Command: `bash scripts/web_gate.sh --port 8110 overview programs/blowfish training checks method live`

```
==> Running source hygiene gate...
check_web_source: OK (18 files)
==> Running taste-skill lint...
TASTESKILL · LINT   19 file(s)
RESULT: 0 FAIL, 7 WARN

==================================================
          WEB GATE SUMMARY
==================================================
  overview (light): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-overview-light
  overview (dark): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-overview-dark
  programs/blowfish (light): 0 FAIL, 0 WARN (fails: none) -> .taste-skill/app/inspect-programs-blowfish-light
  programs/blowfish (dark): 0 FAIL, 0 WARN (fails: none) -> .taste-skill/app/inspect-programs-blowfish-dark
  training (light): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-training-light
  training (dark): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-training-dark
  checks (light): 0 FAIL, 0 WARN (fails: none) -> .taste-skill/app/inspect-checks-light
  checks (dark): 0 FAIL, 0 WARN (fails: none) -> .taste-skill/app/inspect-checks-dark
  method (light): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-method-light
  method (dark): 0 FAIL, 1 WARN (fails: none) -> .taste-skill/app/inspect-method-dark
  live (light): 0 FAIL, 4 WARN (fails: none) -> .taste-skill/app/inspect-live-light
  live (dark): 0 FAIL, 4 WARN (fails: none) -> .taste-skill/app/inspect-live-dark

GATE RESULT: PASS (all criteria satisfied)
```

---

## 4. WARN Defences
1. **`[ragged-row]` (overview, training, method, live):** Cards sharing a row contain distinct diagnostic and tabular summaries whose natural heights reflect concise density without padding fake empty space.
2. **`[hero-void]` (live):** In initial unstarted state, the canvas intentionally leaves room below the prompt and control row for the dynamic execution log once triggered.
3. **`[panel-void]` (live):** The step log container reserves viewport space to ensure no layout shift occurs when streaming the 15-step trajectory.
4. **`[no-data-hue]` (live):** In initial idle state before stepping, no RL trajectory data is active; RL hue is strictly reserved for agent passes and renders dynamically during run execution.
5. **`[mono]` (lint 7x):** Monospace font (`Geist Mono`) is restricted strictly to LLVM flags, pass names, code identifiers, and tabular hex/numeric metrics per UI-SPEC design contract.

---

## 5. Whole-App Critique (7 Questions of app-screens.md 2.7)

### Q1: What is this screen for?
- **Overview:** Instant, honest ledger of compiler agent vs standard LLVM baselines (-O2, -O3, -Oz, and best fixed).
- **Programs:** Deep per-benchmark inspection with pass sequence comparison and step-by-step reduction curves.
- **Training:** Proof of training convergence across 50,000 PPO steps (loss, entropy, reward trends).
- **Checks:** Explicit verification audit (determinism, legality, verification parity).
- **Method:** Formal mathematical definition of the phase-ordering MDP, observation spaces, action mask, and reward function.
- **Live:** Interactive step-by-step CompilerGym execution via local WSL Python server.

### Q2: What is the primary datum or action?
- Primary datum is the geometric mean code size reduction and relative win/loss margin against LLVM flags, surfaced in bold tabular figures and high-contrast strip plots.

### Q3: What is secondary?
- Secondary data are per-benchmark breakdowns, individual step pass sequences, ablation logs, and verification assertions.

### Q4: Does the eye move in a deliberate hierarchy?
- Yes: Level 1 Title + honest finding banner -> Level 2 KPI strip / metric summaries -> Level 3 Detailed data table / interactive strip -> Level 4 Footnotes and check details.

### Q5: Is the style coherent across all views?
- Completely unified: Achromatic ledger tokens (`#f2f4f7` ground light, `#000000` dark; `#1d5fbf`/`#5b9bff` reserved exclusively for RL data). All views use identical typography (Geist/Geist Mono), 8px card radii, and consistent table frames.

### Q6: Does it respect responsive viewports (1440, 768, 390)?
- At 1440: Balanced 12-column grid and 256px persistent sidebar.
- At 768: Sidebar collapses to mobile header with slide-over drawer; 2-column cards stack cleanly.
- At 390: Single column flow; horizontal scroll containment on data strips and wide tables; zero page-level horizontal overflow.

### Q7: Are there anti-slop violations (gradients, glow, emoji, rainbow charts)?
- Zero gradients, zero glow/box-shadow bloat, zero emoji, zero rainbow charts. All data graphics are crisp SVG strips, discrete step plots, and clean line charts with 1px hairline rules.

---

## 6. Verification Records
- `python scripts/check_web_source.py`: OK (18 files)
- `python scripts/check_web.py`: OK (6,110 assertions)
- `python scripts/render_check.py training --expect "Policy entropy"`: OK
- `python scripts/render_check.py checks --expect "What was checked"`: OK
- `python scripts/render_check.py method --expect "The decision problem"`: OK
- `python scripts/render_check.py overview --expect "but loses to -Oz and the best fixed sequence" --expect "Loses to best fixed sequence" --fonts`: OK
