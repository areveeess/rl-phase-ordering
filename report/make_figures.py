"""Figures for the Assessment 10 report: captured terminal output and the baseline chart."""
import os

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def terminal(txt_file, png_file, title):
    lines = open(os.path.join(HERE, "outputs", txt_file), encoding="utf-8").read().rstrip("\n").split("\n")
    h = 0.6 + 0.24 * len(lines)
    fig = plt.figure(figsize=(11, h))
    fig.patch.set_facecolor("#1e1e1e")
    fig.text(0.012, 1 - 0.18 / h, title, color="#9cdcfe", family="monospace", fontsize=9, va="top")
    for i, line in enumerate(lines):
        color = "#7ee787" if line.startswith("[PASS]") else "#e3b341" if line.startswith("[INFO]") \
            else "#9cdcfe" if line.startswith(("$", "(rlphase)")) else "#d4d4d4"
        fig.text(0.012, 1 - (0.45 + 0.24 * i) / h, line, color=color, family="monospace", fontsize=8.5, va="top")
    fig.savefig(os.path.join(HERE, png_file), dpi=170, facecolor=fig.get_facecolor())
    plt.close(fig)


def baseline_chart():
    df = pd.read_csv(os.path.join(ROOT, "results", "baselines.csv"))
    series = [("-O2", "O2", "#2a78d6"), ("-O3", "O3", "#eb6834"), ("-Oz", "Oz", "#1baf7a")]
    x = range(len(df))
    w = 0.26
    fig, ax = plt.subplots(figsize=(9, 3.8))
    for i, (label, col, color) in enumerate(series):
        vals = df[col] / df.O0
        bars = ax.bar([k + (i - 1) * w for k in x], vals, w - 0.03, color=color, label=label)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.01, f"{v:.2f}", ha="center", va="bottom", fontsize=6.5, color=MUTED)
    ax.axhline(1.0, color=MUTED, lw=1, ls="--")
    ax.text(len(df) - 0.5, 1.015, "-O0 = 1.0", color=MUTED, fontsize=8, ha="right", va="bottom")
    ax.set_xticks(list(x))
    ax.set_xticklabels(df.benchmark, fontsize=9)
    ax.set_ylabel("IR instructions / -O0 (lower = smaller)", color=MUTED, fontsize=9)
    ax.set_title("Measured LLVM baselines on cBench (same counter for every column)", color=INK, fontsize=10, loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.yaxis.grid(True, color=GRID)
    ax.set_axisbelow(True)
    ax.tick_params(colors=MUTED)
    ax.set_ylim(0, 1.15)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper left", bbox_to_anchor=(0, 1.0))
    fig.tight_layout()
    fig.savefig(os.path.join(HERE, "fig_baselines.png"), dpi=170)
    plt.close(fig)


terminal("smoke_test.txt", "fig_smoke_test.png", "WSL2 Ubuntu - smoke test of the full toolchain")
terminal("train_eval_demo.txt", "fig_train_eval.png", "WSL2 Ubuntu - short training run, greedy evaluation with replay check, step profiling")
baseline_chart()
print("figures written")
