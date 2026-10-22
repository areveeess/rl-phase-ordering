"""Figures for the Assessment 10 report: captured terminal output and the baseline chart."""
import os

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def terminal(txt_file, png_file, title, width=11, fontsize=8.5):
    lines = open(os.path.join(HERE, "outputs", txt_file), encoding="utf-8").read().rstrip("\n").split("\n")
    step = 0.24 * fontsize / 8.5  # line height in inches, scaled with the font
    h = 0.6 + step * len(lines)
    fig = plt.figure(figsize=(width, h))
    fig.patch.set_facecolor("#1e1e1e")
    fig.text(0.012, 1 - 0.18 / h, title, color="#9cdcfe", family="monospace", fontsize=9, va="top")
    for i, line in enumerate(lines):
        color = "#7ee787" if line.startswith("[PASS]") else "#e3b341" if line.startswith("[INFO]") \
            else "#9cdcfe" if line.startswith(("$", "(rlphase)")) else "#d4d4d4"
        fig.text(0.012, 1 - (0.45 + step * i) / h, line, color=color, family="monospace", fontsize=fontsize, va="top")
    fig.savefig(os.path.join(HERE, png_file), dpi=170, facecolor=fig.get_facecolor())
    plt.close(fig)


TOP = 1.2  # y-axis cap; qsort -O2/-O3 (3.64) would otherwise squash every other bar


def baseline_chart():
    df = pd.read_csv(os.path.join(ROOT, "results", "baselines.csv"))
    series = [("-O2", "O2", "#2a78d6"), ("-O3", "O3", "#eb6834"), ("-Oz", "Oz", "#1baf7a")]
    x = range(len(df))
    w = 0.26
    fig, ax = plt.subplots(figsize=(11, 4.2))
    for i, (label, col, color) in enumerate(series):
        vals = df[col] / df.O0
        bars = ax.bar([k + (i - 1) * w for k in x], vals.clip(upper=TOP), w - 0.03, color=color, label=label)
        for b, v in zip(bars, vals):  # bars above TOP are cut off and labelled with their real value
            ax.text(b.get_x() + b.get_width() / 2, min(v, TOP) + 0.01, f"{v:.2f}" + ("^" if v > TOP else ""),
                    ha="center", va="bottom", fontsize=5.5, color=INK if v > TOP else MUTED, rotation=90)
    ax.axhline(1.0, color=MUTED, lw=1, ls="--")
    ax.text(len(df) - 0.5, 1.015, "-O0 = 1.0", color=MUTED, fontsize=8, ha="right", va="bottom")
    ax.set_xticks(list(x))
    ax.set_xticklabels(df.benchmark, fontsize=8, rotation=35, ha="right")
    ax.set_ylabel("IR instructions / -O0 (lower = smaller)", color=MUTED, fontsize=9)
    ax.set_title("Measured LLVM baselines on cBench (same counter for every column)", color=INK, fontsize=10, loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED)
    ax.set_ylim(0, TOP + 0.15)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper left", bbox_to_anchor=(0, 1.0))
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fig_baselines.png"), dpi=170)
    plt.close(fig)


terminal("smoke_test.txt", "fig_smoke_test.png", "WSL2 Ubuntu - smoke test of the full toolchain")
terminal("train_eval_demo.txt", "fig_train_eval.png", "WSL2 Ubuntu - short training run, greedy evaluation with replay check, step profiling")
terminal("final_results.txt", "fig_final_results.png",
         "WSL2 Ubuntu - final analysis of all runs (3 seeds per reward) and the supplementary 2000-episode runs",
         width=12, fontsize=6.8)
baseline_chart()
print("figures written")
