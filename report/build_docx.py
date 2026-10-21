"""Build the Assessment 10 submission document (report/Assessment10_RL_Phase_Ordering.docx).

Usage: python report/build_docx.py <github-repo-url>
"""
import os
import sys

import pandas as pd
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REPO = sys.argv[1] if len(sys.argv) > 1 else "https://github.com/<to-be-added>"
OUT = os.path.join(HERE, "Assessment10_RL_Phase_Ordering.docx")

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
    setattr(sec, side, Cm(2.2))
doc.styles["Normal"].font.name = "Calibri"
doc.styles["Normal"].font.size = Pt(11)


def shade(cell, hex_fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_fill)
    tcPr.append(shd)


def para(text, bold=False, italic=False, size=None, align=None, space_after=6):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold, r.italic = bold, italic
    if size:
        r.font.size = Pt(size)
    if align:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p


def bullet(text):
    p = doc.add_paragraph(style="List Bullet")
    p.add_run(text)
    p.paragraph_format.space_after = Pt(2)


def code(path, start, end, caption):
    lines = open(os.path.join(ROOT, path), encoding="utf-8").read().split("\n")[start - 1:end]
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = t.rows[0].cells[0]
    shade(cell, "F4F4F2")
    cell.paragraphs[0].text = ""
    for i, line in enumerate(lines):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(line if line else " ")
        r.font.name = "Consolas"
        r._element.rPr.rFonts.set(qn("w:eastAsia"), "Consolas")
        r.font.size = Pt(8)
    para(f"{caption}  ({path}, lines {start}-{end})", italic=True, size=9, space_after=10)


def figure(png, caption, width=16.5):
    doc.add_picture(os.path.join(HERE, png), width=Cm(width))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    para(caption, italic=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=12)


def table(rows, header, widths=None):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.text = ""
        run = c.paragraphs[0].add_run(str(h))
        run.bold = True
        run.font.size = Pt(9)
        shade(c, "E8EEF7")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(v))
            run.font.size = Pt(9)
    for row in t.rows[:-1]:  # keep short tables on one page
        for c in row.cells:
            for p in c.paragraphs:
                p.paragraph_format.keep_with_next = True
    if widths:
        for row in t.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Cm(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


# ---------------- title ----------------
para("RL-Guided Compiler Phase Ordering", bold=True, size=20, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Compiler Design - Assessment 10: Implementation (sample code, output, repository)", size=12,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Aryan V Sangai (24BCI0202)  |  Nikhila Abdul Salam (24BCE2690)  |  Raj Vardhan Singh (24BDS0200)", size=10,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Department of Computer Science and Engineering, VIT  -  21 October 2026", size=10,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=14)

# ---------------- repo ----------------
doc.add_heading("1. GitHub repository", level=1)
p = doc.add_paragraph()
r = p.add_run(REPO)
r.bold = True
r.font.color.rgb = RGBColor(0x1C, 0x5C, 0xAB)
para("The repository contains the full source code, the pinned environment (setup.sh, requirements.lock), the "
     "smoke test, the experiment scripts, the measured results (results/) and the design note (DESIGN.md). "
     "It is updated as the experiments complete.")

# ---------------- overview ----------------
doc.add_heading("2. What we built", level=1)
para("LLVM runs the same hand-tuned pass order (-O2/-O3/-Oz) on every program. We train a reinforcement-learning "
     "agent to choose a program-specific order of LLVM optimization passes, and we compare it with LLVM's fixed "
     "pipelines on code size, including on programs the agent never saw during training.")
table([
    ["Environment", "CompilerGym llvm-v0 (real LLVM 10.0.0) on cBench-v1 programs, inside WSL2 Ubuntu"],
    ["State", "IR2Vec 300-d flow-aware embedding of the current LLVM IR (L2-normalised), plus log(size / -O0 size) and episode progress"],
    ["Actions", "24 size-relevant LLVM passes taken from the -Oz pipeline (e.g. -mem2reg, -instcombine, -gvn, -simplifycfg, -inline) + NOOP"],
    ["Reward", "Reduction in IR instruction count normalised by the -O0 count; dense (every step) and sparse (end of episode) variants"],
    ["Learner", "REINFORCE (policy gradient) with a learned value baseline; 2x128 MLP, Adam, entropy bonus"],
    ["Baselines", "-O0, -O2, -O3, -Oz (all counted the same way), random sequences, best fixed sequence found on training programs"],
    ["Evaluation", "Family-grouped train / validation / held-out test split; greedy policy; wins/ties/losses; replay check; lli output check"],
], ["Component", "Choice"], widths=[3.2, 13.3])

doc.add_heading("Project structure", level=2)
table([
    ["setup.sh, requirements.lock", "One-command, pinned WSL2 environment (Python 3.10, CompilerGym 0.2.5, IR2Vec 2.1.1, PyTorch 2.5.1 CPU)"],
    ["smoke_test.py", "End-to-end check: environment, observations, passes, IR2Vec embedding, output validation"],
    ["rlpo/env.py", "The MDP: action list, IR2Vec state, dense/sparse reward, embedding cache"],
    ["rlpo/agent.py", "Policy/value network, episode rollout, REINFORCE update"],
    ["rlpo/lli_check.py", "Output-equivalence check of optimised programs with LLVM's lli"],
    ["scripts/baselines.py", "-O0/-O2/-O3/-Oz instruction counts -> results/baselines.csv"],
    ["scripts/train.py, evaluate.py, analyze.py", "Training (crash-tolerant, resumable), greedy evaluation with replay, tables and plots"],
], ["File", "Purpose"], widths=[5.0, 11.5])

# ---------------- code ----------------
doc.add_page_break()
doc.add_heading("3. Sample code", level=1)
para("3.1  One step of the phase-ordering MDP: apply a pass in CompilerGym, read the new instruction count, "
     "re-embed the IR with IR2Vec only if the pass changed it, and compute the dense or sparse reward.", bold=False)
code("rlpo/env.py", 113, 134, "Listing 1 - PhaseOrderingEnv.step()")
para("3.2  IR2Vec embedding of the current LLVM IR (the agent's state).")
code("rlpo/env.py", 45, 57, "Listing 2 - embed_ir()")
para("3.3  The policy-gradient update (REINFORCE with a learned baseline).")
code("rlpo/agent.py", 46, 74, "Listing 3 - reinforce_update()")

# ---------------- outputs ----------------
doc.add_heading("4. Output", level=1)
para("4.1  Smoke test. The whole toolchain runs end to end inside WSL2: CompilerGym loads cBench qsort "
     "(638 IR instructions at -O0), applies passes (-mem2reg brings it to 346), IR2Vec returns a valid 300-dimensional "
     "vector, and the lli output check confirms that the optimised program prints exactly the same output as the original.")
figure("fig_smoke_test.png", "Figure 1 - Output of python smoke_test.py (captured terminal log, WSL2 Ubuntu).")

para("4.2  Measured baselines. LLVM's own pipelines on cBench programs, all counted with the same CompilerGym "
     "IrInstructionCount observation after running the bundled opt. -Oz is the smallest on every program, and -O3 is often "
     "larger than -O2 because it optimises for speed (unrolling, vectorisation), not size. This is why we report -Oz as the "
     "reference the agent must approach.")
figure("fig_baselines.png", "Figure 2 - Size after -O2, -O3 and -Oz relative to -O0 (lower is smaller).")
df = pd.read_csv(os.path.join(ROOT, "results", "baselines.csv"))
table([[r.benchmark, r.O0, r.O2, r.O3, r.Oz] for r in df.itertuples()],
      ["Program", "-O0", "-O2", "-O3", "-Oz"], widths=[3.5, 3.0, 3.0, 3.0, 3.0])

para("4.3  Training and evaluation pipeline. A short training run, then greedy evaluation of the learned policy: "
     "every pass sequence is replayed from scratch and reproduces the same instruction count (replay_ok: True). "
     "The profile shows why training is expensive: the IR2Vec embedding dominates the cost of a step and grows with "
     "program size (28 ms for qsort, 430 ms for gsm).")
figure("fig_train_eval.png", "Figure 3 - Short training run, greedy evaluation with replay check, and per-step cost profile.")
para("Note: this 32-episode demonstration run is far too short to learn a good policy. It repeats one pass "
     "(-gvn) 15 times, and 14 of those repeats have no effect. It is shown to demonstrate the working pipeline, not as a result.",
     italic=True, size=10)

# ---------------- status ----------------
doc.add_heading("5. Status and next steps", level=1)
bullet("Done: reproducible environment, MDP, REINFORCE agent, baselines, sanity baselines, evaluation with replay "
       "check, lli validation and analysis scripts, all in the repository.")
bullet("Engineering issues solved: CompilerGym's bundled LLVM needs libtinfo.so.5 (absent on Ubuntu 24.04+); "
       "env.validate() failed with error 127 because the bundled clang lost LD_LIBRARY_PATH (fixed via its RUNPATH).")
bullet("In progress: the full training runs (dense vs sparse reward) and the held-out comparison against -O2/-O3/-Oz. "
       "On this laptop, the WSL2 VM crashes under sustained load (16 GB host RAM shared with Windows), so training was "
       "made crash-tolerant: it saves state after every update and resumes automatically. Results will be pushed "
       "to the repository (results/RESULTS.md) as they complete.")
bullet("Honesty rule of the project: results are reported whether or not the agent beats -O2/-O3/-Oz. "
       "ghostscript and jpeg-c/jpeg-d are excluded because measuring them crashed the WSL VM, and this exclusion is stated in the results.")

doc.add_heading("6. How to run", level=1)
for line in ["bash setup.sh", "source ~/venvs/rlphase/bin/activate", "python smoke_test.py", "bash run_all.sh"]:
    p = doc.add_paragraph()
    r = p.add_run(line)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    p.paragraph_format.space_after = Pt(0)

doc.save(OUT)
print("wrote", OUT)
