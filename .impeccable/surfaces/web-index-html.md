---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Results explorer (web/)

## Scope and mode
Whole explorer: Results (story-first opening), then reference sections Programs, Training, Checks, Method, Live run. Mode: Read. Audience: viva examiners on a laptop or projector in a lit room; the team drives it.

## Task
Answer "Did the agent beat LLVM's pipelines on code size, and can I trust that?" within a minute, then let the reader drill into any program, run or check. Losses (-Oz, best fixed sequence, the -sroa collapse) stay as prominent as the wins. Every figure generated from results/; all features kept.

## Direction contract
THESIS: The results are a printed railway timetable: each run's 15 passes are a train's stops on a route line, filled where the pass changed the program and struck where it ran through doing nothing. Refuses the analytics dashboard (cards, KPI tiles, sidebar) and its glossy-editorial opposite.

OWN-WORLD: Cool paper ground, black timetable ink, one route blue that owns the frame (running head band, route lines, RL columns), signal red only for losses and struck stops' state. Cited exception: a status green, used only for passed checks on the Checks route (a check result is a state that must read as passed at a glance). Timetable ruling: heavy rule under captions, hairline row rules, alternate row tint, tabular figures. Archivo (narrow widths) for the frame, tables, headings and numbers; Source Serif 4 for the reading column. No cards, no shadows, no gradients, no pills used as decoration.

STORY: The reader learns the answer (beats -O3 and mostly -O2, loses to -Oz and the best fixed sequence), why (policies collapse to one repeated pass), and the evidence (replay, lli, leakage, overfit rule), then opens a program's route to see it pass by pass.

FIRST VIEWPORT: Route-blue running head with the route roundel, title and literal section tabs. Left column (about 420px): the question as h1, then an ordered list of three steps (result, why, evidence) in the serif. Right: the held-out timetable, 8 programs by -O0, -O2, -O3, -Oz, best fixed, RL dense, RL sparse, best per row bold, RL losses in red; under it one route line (RL dense, seed 0, bzip2). Bottom: a dense dark footnote band with geomean reductions, budget, overfit rule and source. Primary action: open a program's route.

FORM: Railway timetable, position 3 on the ordered list (green-bar printout 1, textbook figure system 2). seed:9491716cdd6be379
Raises: state is a mark, not a hue (cutting bench); numbered steps (zine); bare answer over dense footnotes (obi sleeve); literal section names (quote grammar); type does the ranking (alphabet storm).
Signature interaction: choosing a program redraws its routes; hovering or focusing a stop shows the pass and the count change.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
