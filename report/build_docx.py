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

# ---------------- background ----------------
def topic(title, body, ours=None, example=None):
    doc.add_heading(title, level=2)
    for b in ([body] if isinstance(body, str) else body):
        para(b, space_after=4)
    if example:
        para("Example: " + example, italic=True, size=10, space_after=4)
    if ours:
        p = doc.add_paragraph()
        r = p.add_run("In our project: ")
        r.bold = True
        p.add_run(ours)
        p.paragraph_format.space_after = Pt(8)


def steps(items):
    for i, t in enumerate(items, 1):
        p = doc.add_paragraph(style="List Bullet")
        r = p.add_run(f"Step {i}. ")
        r.bold = True
        p.add_run(t)
        p.paragraph_format.space_after = Pt(2)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


doc.add_heading("2. Background: the ideas from scratch", level=1)
para("This section explains every idea the project uses, assuming only a first course in compilers. "
     "Each topic ends with how it appears in our project.")

topic("2.1 What a compiler does",
      "A compiler translates a program written by a person (for example in C) into machine code that a CPU can run. "
      "Modern compilers work in three stages. The front end reads the source code and checks it. The middle end "
      "improves (optimises) the program. The back end turns it into instructions for a specific CPU.",
      ours="we only work on the middle end, which is where optimisation happens.")
topic("2.2 Intermediate Representation (IR) and LLVM IR",
      "Between the front end and the back end, the program is stored in an Intermediate Representation (IR). The IR is "
      "simpler than C but not tied to any one CPU, so the same optimisations work for every source language and every "
      "processor. LLVM is a widely used compiler framework (behind Clang, Rust and Swift). Its IR looks like a simple "
      "assembly language, with instructions such as add, load, store, br (branch) and call.",
      example="the C statement  x = a + b;  becomes one LLVM IR instruction like  %x = add i32 %a, %b.",
      ours="all measurements are made on LLVM IR. 'Size' means the number of LLVM IR instructions in the program.")
topic("2.3 Optimisation passes",
      ["A pass is one small transformation of the IR. Each pass does one job, for example: remove code whose result is "
       "never used (dead code elimination), replace a variable by a constant when its value is known (constant "
       "propagation), or copy a small function's body into its caller (inlining).",
       "Passes interact. One pass can create an opportunity for another, or destroy it. For example, inlining a function "
       "can expose dead code, which a later dead-code pass can then delete."],
      example="on the qsort program, the single pass -mem2reg (which moves variables from memory into registers) "
              "cut the program from 638 to 346 IR instructions, and -instcombine then took it to 337.",
      ours="the agent can choose from 24 passes, all taken from LLVM's size-optimising pipeline.")
topic("2.4 Optimisation levels: -O0, -O2, -O3, -Oz",
      "Instead of asking users to pick passes, compilers offer fixed recipes. -O0 means no optimisation. -O2 is the "
      "normal release setting. -O3 adds aggressive speed optimisations (loop unrolling, vectorisation) that often make "
      "code bigger. -Oz is designed to make code as small as possible. Each level is a fixed list of passes in a fixed "
      "order, chosen by LLVM developers and applied to every program in the same way.",
      ours="these are the baselines the agent is compared against. Because our goal is small code, -Oz is the "
           "toughest and fairest reference.")
topic("2.5 The phase-ordering problem",
      ["Which passes run, and in which order, matters a lot, because passes interact. The best order is different for "
       "different programs, but -O2/-O3/-Oz use one order for all of them. Trying every order is impossible: with 25 "
       "choices and 15 steps there are 25^15 (about 9 x 10^20) possible sequences.",
       "Phase ordering asks: for this particular program, which sequence of passes gives the best result?"],
      ours="we try to learn a good program-specific sequence of 15 passes, instead of searching blindly.")
topic("2.6 Reinforcement learning (RL)",
      ["Reinforcement learning is learning by trial and error. An agent sees the current situation (the state), "
       "chooses an action, and receives a reward that says how good that action was. Over many attempts it learns a "
       "policy: a rule that tells it which action to take in each state so that the total reward is as large as possible.",
       "Nobody gives the agent the correct answers. It only sees rewards, so it has to explore."],
      example="a child learning to ride a bicycle is not told the correct handlebar angle at every moment; falling "
              "over (negative reward) and staying up (positive reward) shape how they ride.",
      ours="the agent's action is 'apply this pass next', and its reward is how much the program shrank.")
topic("2.7 Markov Decision Process (MDP)",
      "An MDP is the formal description of an RL problem. It lists the states, the actions, the rewards, and how an "
      "action moves the system from one state to the next. One full run from start to finish is an episode. The "
      "Markov property means the next state depends only on the current state and the action, not on the full history.",
      ours="state = the current program (as an IR2Vec vector); action = one pass; transition = LLVM applies the pass; "
           "reward = drop in instruction count; episode = 15 passes starting from the unoptimised program.")
topic("2.8 Program embeddings with IR2Vec",
      ["A neural network needs a fixed-size list of numbers as input, but programs have different lengths. IR2Vec "
       "solves this: it gives each kind of opcode, type and operand a pre-learned vector, then combines these over all "
       "instructions, basic blocks and functions into one vector of 300 numbers for the whole program. The "
       "flow-aware version also uses how values flow between instructions.",
       "Programs that look alike get similar vectors, so the agent can recognise situations it has seen before."],
      ours="after every pass we recompute the IR2Vec vector of the changed program; that vector is what the agent sees.")
topic("2.9 Policy gradient and REINFORCE",
      ["The policy is a small neural network. Given the state, it outputs a probability for each of the 25 actions, "
       "and the agent samples an action from those probabilities. REINFORCE is the simplest policy-gradient method: "
       "after an episode, it makes the actions that led to a high total reward more likely, and the actions that led "
       "to a low reward less likely.",
       "A baseline makes learning more stable. A second output of the network (the value) predicts the reward the "
       "agent usually gets from this state. The agent learns from the difference between what it actually got and what "
       "it expected (the advantage), not from the raw reward. An entropy bonus stops the probabilities from collapsing "
       "too early, so the agent keeps exploring."],
      ours="a 2-layer network (128 units each) with a policy head and a value head, trained with REINFORCE in PyTorch.")
topic("2.10 Dense and sparse rewards",
      "A dense reward is given after every step: 'this pass removed 3% of the instructions'. A sparse reward is given "
      "once at the end: 'the whole sequence removed 40%'. Dense rewards give quick feedback but can favour short-term "
      "gains; sparse rewards match the real goal but make it harder to tell which pass helped.",
      ours="both variants give exactly the same total per episode; only the timing differs. We compare which one "
           "trains a better agent.")
topic("2.11 CompilerGym",
      "CompilerGym is a Python library from Meta AI Research that wraps the real LLVM compiler in the standard Gym "
      "interface used across RL research. reset() loads a program and returns its first state; step(action) applies "
      "one pass and returns the new state and reward. It ships benchmark programs such as cBench.",
      ours="every pass in this project is applied by real LLVM 10 through CompilerGym, on cBench programs "
           "(qsort, bzip2, sha, dijkstra and others).")
topic("2.12 Generalisation: train, validation and test sets",
      "A policy is only useful if it also works on new programs. So the programs are split into three groups: the agent "
      "learns on the training set, we pick the best saved model using the validation set, and the final score comes "
      "from the test set, which the agent never sees during training. Very similar programs (for example the two "
      "stringsearch versions) are always kept in the same group, so the test is not secretly the same as training.",
      ours="9 training, 3 validation and 8 test programs, fixed in splits/split.json before any results were produced.")
topic("2.13 Checking that optimised code is still correct",
      "An optimisation is only valid if the program still does the same thing. We run the original program and the "
      "optimised program on the same input with LLVM's lli (an LLVM IR interpreter) and check that they print exactly "
      "the same output.",
      ours="this lli check passes on qsort, dijkstra and crc32. CompilerGym's own validate() does not work on our "
           "machine, so we state clearly that our check is a weaker one (one input, a subset of programs).")

# ---------------- overview ----------------
doc.add_heading("3. What we built", level=1)
para("Putting the pieces together: the agent starts from an unoptimised program, picks 15 passes one by one, and is "
     "rewarded for making the program smaller. The table summarises each part, and the walkthrough below follows one episode.")
table([
    ["Environment", "CompilerGym llvm-v0 (real LLVM 10.0.0) on cBench-v1 programs, inside WSL2 Ubuntu"],
    ["State", "IR2Vec 300-number vector of the current LLVM IR (scaled to length 1), plus the current size compared with -O0, and how far through the episode we are"],
    ["Actions", "24 size-related LLVM passes taken from the -Oz pipeline (e.g. -mem2reg, -instcombine, -gvn, -simplifycfg, -inline) + NOOP (do nothing)"],
    ["Reward", "Drop in IR instruction count divided by the -O0 count; dense (every step) or sparse (end of episode)"],
    ["Learner", "REINFORCE (policy gradient) with a learned value baseline; 2x128 neural network, Adam optimiser, entropy bonus"],
    ["Baselines", "-O0, -O2, -O3, -Oz (all counted the same way), random sequences, and the best fixed sequence found on training programs"],
    ["Evaluation", "Train / validation / test split; the trained agent always takes its most likely action; wins/ties/losses; replay check; lli output check"],
], ["Component", "Choice"], widths=[3.2, 13.3])

doc.add_heading("One episode, step by step", level=2)
steps([
    "reset(): CompilerGym loads a program, e.g. qsort, in its unoptimised form (638 IR instructions).",
    "IR2Vec turns that IR into a 300-number vector. Together with the size feature, this is the state.",
    "The policy network reads the state and gives a probability for each of the 25 actions; the agent picks one, e.g. -mem2reg.",
    "step(): LLVM applies -mem2reg. The program now has 346 instructions.",
    "Reward: (638 - 346) / 638 = 0.46 (dense version). The new IR is embedded again to get the next state.",
    "Steps 3 to 5 repeat until 15 passes have been chosen. That is one episode.",
    "After a batch of 16 episodes, REINFORCE updates the network so that sequences that shrank programs more become more likely.",
])

doc.add_heading("Project structure", level=2)
table([
    ["setup.sh, requirements.lock", "One-command, pinned WSL2 environment (Python 3.10, CompilerGym 0.2.5, IR2Vec 2.1.1, PyTorch 2.5.1 CPU)"],
    ["smoke_test.py", "End-to-end check: environment, observations, passes, IR2Vec embedding, output validation"],
    ["rlpo/env.py", "The MDP: action list, IR2Vec state, dense/sparse reward, embedding cache"],
    ["rlpo/agent.py", "Policy/value network, running an episode, REINFORCE update"],
    ["rlpo/lli_check.py", "Checks that the optimised program prints the same output as the original (with lli)"],
    ["scripts/baselines.py", "-O0/-O2/-O3/-Oz instruction counts -> results/baselines.csv"],
    ["scripts/train.py, evaluate.py, analyze.py", "Training (resumes after a crash), evaluation with replay check, tables and plots"],
], ["File", "Purpose"], widths=[5.0, 11.5])

# ---------------- code ----------------
doc.add_page_break()
doc.add_heading("4. Sample code", level=1)
para("4.1  One step of the MDP (the transition and the reward).", bold=True)
code("rlpo/env.py", 113, 134, "Listing 1 - PhaseOrderingEnv.step()")
para("What this code does:", bold=True, space_after=2)
steps([
    "Remember the current instruction count (prev), so the change can be measured.",
    "If the action is a real pass (not NOOP), ask CompilerGym to apply it. LLVM runs the pass and returns the new count. "
    "CompilerGym also reports whether the pass changed anything (action_had_no_effect).",
    "Only if the program changed, compute a new IR2Vec vector. An unchanged program has the same vector, which saves time.",
    "The episode ends after 15 steps (self.T).",
    "Reward: in dense mode, the drop since the previous step; in sparse mode, zero until the last step, then the drop "
    "since the start. Both are divided by the -O0 count, so big and small programs are on the same scale.",
])
para("4.2  Turning the program into numbers (the state).", bold=True)
code("rlpo/env.py", 45, 57, "Listing 2 - embed_ir()")
para("What this code does:", bold=True, space_after=2)
steps([
    "Write the IR text to a temporary file in /dev/shm (memory, so it is fast), because IR2Vec reads from a file.",
    "Call IR2Vec in flow-aware mode ('fa') at program level ('p') to get one vector for the whole program.",
    "Delete the temporary file, and check that the vector has exactly 300 numbers and that none is NaN or infinite.",
])
para("4.3  Learning from experience (the REINFORCE update).", bold=True)
code("rlpo/agent.py", 46, 74, "Listing 3 - reinforce_update()")
para("What this code does:", bold=True, space_after=2)
steps([
    "For every step of every episode, compute the return: the total reward from that step to the end of the episode.",
    "Run the network on all the states to get action scores (logits) and value predictions.",
    "Advantage = actual return minus predicted value, then normalised. A positive advantage means 'better than expected'.",
    "Policy loss: raise the log-probability of actions with a positive advantage, lower it for negative ones.",
    "Value loss: teach the value head to predict returns more accurately. Entropy bonus: keep some randomness.",
    "Back-propagate, clip the gradient for stability, and take one Adam step.",
])

# ---------------- outputs ----------------
doc.add_heading("5. Output", level=1)
para("5.1  Smoke test: does the whole toolchain work?", bold=True)
figure("fig_smoke_test.png", "Figure 1 - Output of python smoke_test.py (captured terminal log, WSL2 Ubuntu).")
para("How to read it:", bold=True, space_after=2)
bullet("Each line is one check; PASS means it worked.")
bullet("instruction counts: qsort has 638 IR instructions unoptimised; LLVM's -O3 gives 1163 (larger, because -O3 optimises for speed) and -Oz gives 315.")
bullet("step -mem2reg / -instcombine: applying two passes shrinks qsort to 346 and then 337 instructions.")
bullet("IR2Vec fa vector: dim=300 confirms the state vector has the right size.")
bullet("lli fallback output check: match means the optimised programs print exactly the same output as the originals.")
bullet("env.validate() shows INFO because CompilerGym's own validator does not work on our machine; the lli check replaces it.")

para("5.2  How well do LLVM's fixed pipelines shrink code?", bold=True)
figure("fig_baselines.png", "Figure 2 - Size after -O2, -O3 and -Oz relative to -O0 (lower is smaller).")
para("How to read it:", bold=True, space_after=2)
bullet("Each bar is the program size after optimisation divided by its unoptimised size. 1.0 (dashed line) means no change; 0.5 means half the size.")
bullet("-Oz (green) is the smallest on every program, which is expected because it is built for size.")
bullet("-O3 (orange) is often bigger than -O2 (blue), e.g. bzip2 0.77 vs 0.70, because it trades size for speed.")
bullet("To be useful for code size, the agent has to come close to -Oz while using only 15 passes; -Oz runs about 90 pass invocations.")
df = pd.read_csv(os.path.join(ROOT, "results", "baselines.csv"))
table([[r.benchmark, r.O0, r.O2, r.O3, r.Oz] for r in df.itertuples()],
      ["Program", "-O0", "-O2", "-O3", "-Oz"], widths=[3.5, 3.0, 3.0, 3.0, 3.0])

para("5.3  The training and evaluation pipeline runs.", bold=True)
figure("fig_train_eval.png", "Figure 3 - Short training run, greedy evaluation with replay check, and per-step cost profile.")
para("How to read it:", bold=True, space_after=2)
bullet("train.py trained a policy for 32 episodes on two small programs and saved it.")
bullet("evaluate.py ran that policy on crc32 (242 to 199 instructions) and dijkstra (450 to 360).")
bullet("replay_ok: True means re-running the same pass sequence from scratch gives exactly the same count, so results are reproducible.")
bullet("profile_step.py shows where the time goes: computing IR2Vec takes 28 ms for qsort but 430 ms for the larger gsm, "
       "so the embedding is the main cost of training.")
para("Note: 32 episodes is far too few to learn a good policy. This policy repeats one pass (-gvn) 15 times, and 14 "
     "of those repeats change nothing. It shows that the pipeline works; it is not a result.", italic=True, size=10)

# ---------------- status ----------------
doc.add_heading("6. Status and next steps", level=1)
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

doc.add_heading("7. How to run", level=1)
for line in ["bash setup.sh", "source ~/venvs/rlphase/bin/activate", "python smoke_test.py", "bash run_all.sh"]:
    p = doc.add_paragraph()
    r = p.add_run(line)
    r.font.name = "Consolas"
    r.font.size = Pt(9)
    p.paragraph_format.space_after = Pt(0)

doc.save(OUT)
print("wrote", OUT)
