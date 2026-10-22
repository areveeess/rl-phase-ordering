"""Tables, plots and failure analysis from the results CSVs (EVAL-01, EVAL-02, OUT-02).

Every number in the report comes from this script. Instruction counts are the
CompilerGym IrInstructionCount observation throughout. Size ratio = final / O0
(lower is better); "reduction" = 1 - geomean(ratio). A crashed evaluation counts
as no reduction (ratio 1.0) and as a loss.
"""
import glob
import json
import os

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

# Validated categorical slots, fixed order (blue, orange, aqua, yellow, magenta).
COLORS = {"-O3": "#2a78d6", "-Oz": "#eb6834", "best fixed seq": "#1baf7a", "RL dense": "#eda100", "RL sparse": "#e87ba4"}
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"
OUT = "results"
SPLITS = ["train", "val", "test"]


def style(ax):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(MUTED)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def geomean(x):
    x = np.asarray(x, dtype=float)
    return float(np.exp(np.mean(np.log(x))))


def wtl(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return f"{int((a < b).sum())}/{int((a == b).sum())}/{int((a > b).sum())}"


def md(df):
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        lines.append("| " + " | ".join(f"{v:.4f}" if isinstance(v, float) else str(v) for v in r) + " |")
    return "\n".join(lines)


def main():
    split = json.load(open("splits/split.json"))
    where = {p: s for s in SPLITS for p in split[s]}
    base = pd.read_csv(f"{OUT}/baselines.csv")
    base = base[base.benchmark.isin(where)].copy()
    base["split"] = base.benchmark.map(where)
    sanity = pd.read_csv(f"{OUT}/sanity_baselines.csv")
    ev = pd.read_csv(f"{OUT}/eval.csv")
    ev["failed"] = ev["final"].isna()
    ev["final"] = ev["final"].fillna(ev["O0"]).fillna(ev.benchmark.map(base.set_index("benchmark").O0))
    ev = ev.merge(base[["benchmark", "O0", "O2", "O3", "Oz"]].rename(columns={"O0": "O0_b"}), on="benchmark")
    ev["final"] = ev["final"].astype(int)

    # ---------------- summary table ----------------
    rows = []
    for s in SPLITS:
        b = base[base.split == s]
        sb = sanity[sanity.split == s].set_index("benchmark").loc[b.benchmark]
        r = {"split": s, "programs": len(b)}
        for lvl in ("O2", "O3", "Oz"):
            r[f"-{lvl}"] = 1 - geomean(b[lvl] / b.O0)
        r["random seq"] = 1 - geomean(sb.random_mean.values / b.O0.values)
        r["best fixed seq"] = 1 - geomean(sb.best_fixed.values / b.O0.values)
        for mode in ("dense", "sparse"):
            vals = [1 - geomean(g.final / g.O0_b) for _, g in ev[(ev.split == s) & (ev.reward == mode)].groupby("seed")]
            r[f"RL {mode} (mean)"] = float(np.mean(vals)) if vals else np.nan
            r[f"RL {mode} (sd)"] = float(np.std(vals)) if vals else np.nan
        rows.append(r)
    summary = pd.DataFrame(rows)
    summary.to_csv(f"{OUT}/summary_reduction.csv", index=False)

    # wins/ties/losses of each RL run vs each reference, per split
    wl = []
    for (mode, seed, s), g in ev.groupby(["reward", "seed", "split"]):
        sb = sanity.set_index("benchmark").loc[g.benchmark]
        wl.append({"reward": mode, "seed": seed, "split": s,
                   "vs -O2": wtl(g.final, g.O2), "vs -O3": wtl(g.final, g.O3), "vs -Oz": wtl(g.final, g.Oz),
                   "vs best fixed": wtl(g.final, sb.best_fixed.values),
                   "crashes": int(g.failed.sum()), "replay ok": f"{int(g.replay_ok.sum())}/{len(g)}"})
    wl = pd.DataFrame(wl).sort_values(["split", "reward", "seed"])
    wl.to_csv(f"{OUT}/wins_ties_losses.csv", index=False)

    # per-program held-out table (median over seeds)
    per = []
    for p in split["test"] + split["val"] + split["train"]:
        b = base.set_index("benchmark").loc[p]
        sb = sanity.set_index("benchmark").loc[p]
        r = {"split": where[p], "benchmark": p, "O0": int(b.O0), "-O2": int(b.O2), "-O3": int(b.O3), "-Oz": int(b.Oz),
             "best fixed": int(sb.best_fixed)}
        for mode in ("dense", "sparse"):
            g = ev[(ev.benchmark == p) & (ev.reward == mode)]
            r[f"RL {mode} (median)"] = int(g.final.median()) if len(g) else None
        per.append(r)
    per = pd.DataFrame(per)
    per.to_csv(f"{OUT}/per_program.csv", index=False)

    # ---------------- plots ----------------
    # 1. training curves
    fig, ax = plt.subplots(figsize=(7, 3.6))
    for mode, color in (("dense", COLORS["RL dense"]), ("sparse", COLORS["RL sparse"])):
        logs = [pd.read_csv(f) for f in sorted(glob.glob(f"runs/{mode}_s*/train_log.csv"))]
        for i, lg in enumerate(logs):
            ax.plot(lg.episodes, lg.mean_reduction.rolling(10, min_periods=1).mean(), color=color, lw=2,
                    alpha=0.85, label=f"{mode} reward" if i == 0 else None)
    ax.set_xlabel("training episodes", color=MUTED, fontsize=9)
    ax.set_ylabel("size reduction vs -O0\n(batch mean, rolling 10)", color=MUTED, fontsize=9)
    ax.set_title("Training curves, one line per seed", color=INK, fontsize=10, loc="left")
    style(ax)
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(f"{OUT}/training_curves.png", dpi=160)
    plt.close(fig)

    # 2. entropy and no-op fraction
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.2))
    for mode, color in (("dense", COLORS["RL dense"]), ("sparse", COLORS["RL sparse"])):
        for i, f in enumerate(sorted(glob.glob(f"runs/{mode}_s*/train_log.csv"))):
            lg = pd.read_csv(f)
            lab = f"{mode} reward" if i == 0 else None
            axes[0].plot(lg.episodes, lg.entropy, color=color, lw=2, alpha=0.85, label=lab)
            axes[1].plot(lg.episodes, lg.noop_frac.rolling(10, min_periods=1).mean(), color=color, lw=2, alpha=0.85, label=lab)
    axes[0].set_title("Policy entropy (nats)", color=INK, fontsize=10, loc="left")
    axes[1].set_title("NOOP fraction of actions", color=INK, fontsize=10, loc="left")
    for ax in axes:
        style(ax)
        ax.set_xlabel("training episodes", color=MUTED, fontsize=9)
    axes[0].legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(f"{OUT}/entropy_noop.png", dpi=160)
    plt.close(fig)

    # 3. held-out per-program size ratio vs -O0
    test = per[per.split == "test"]
    series = [("-O3", test["-O3"]), ("-Oz", test["-Oz"]), ("best fixed seq", test["best fixed"]),
              ("RL dense", test["RL dense (median)"]), ("RL sparse", test["RL sparse (median)"])]
    x = np.arange(len(test))
    w = 0.16
    fig, ax = plt.subplots(figsize=(9, 3.8))
    for i, (name, vals) in enumerate(series):
        ax.bar(x + (i - 2) * w, vals.values / test.O0.values, w - 0.02, color=COLORS[name], label=name)
    ax.axhline(1.0, color=MUTED, lw=1, ls="--")
    ax.text(len(test) - 0.5, 1.01, "-O0", color=MUTED, fontsize=8, ha="right", va="bottom")
    ax.set_xticks(x)
    ax.set_xticklabels(test.benchmark, rotation=20, fontsize=8)
    ax.set_ylabel("instructions / -O0 (lower is smaller)", color=MUTED, fontsize=9)
    ax.set_title("Held-out test programs (RL = median over seeds)", color=INK, fontsize=10, loc="left")
    style(ax)
    ax.legend(frameon=False, fontsize=8, ncol=5, loc="upper center", bbox_to_anchor=(0.5, -0.22))
    fig.tight_layout()
    fig.savefig(f"{OUT}/heldout_per_program.png", dpi=160)
    plt.close(fig)

    # 3b. dense vs sparse on the validation programs (median over seeds, bars span min-max over seeds)
    val = per[per.split == "val"]
    fig, ax = plt.subplots(figsize=(7, 3.6))
    xv = np.arange(len(val))
    refs = [("-Oz", val["-Oz"]), ("best fixed seq", val["best fixed"])]
    for i, (name, vals) in enumerate(refs):
        ax.bar(xv + (i - 1.5) * 0.2, vals.values / val.O0.values, 0.18, color=COLORS[name], label=name)
    for i, mode in enumerate(("dense", "sparse")):
        g = ev[(ev.split == "val") & (ev.reward == mode)].groupby("benchmark").final
        med = g.median().loc[val.benchmark].values / val.O0.values
        lo = g.min().loc[val.benchmark].values / val.O0.values
        hi = g.max().loc[val.benchmark].values / val.O0.values
        ax.bar(xv + (i + 0.5) * 0.2, med, 0.18, color=COLORS[f"RL {mode}"], label=f"RL {mode}",
               yerr=[med - lo, hi - med], capsize=3, error_kw={"ecolor": INK, "lw": 1})
    ax.axhline(1.0, color=MUTED, lw=1, ls="--")
    ax.set_xticks(xv)
    ax.set_xticklabels(val.benchmark, fontsize=9)
    ax.set_ylabel("instructions / -O0 (lower is smaller)", color=MUTED, fontsize=9)
    ax.set_title("Validation programs: dense vs sparse reward (median over seeds, bars = min-max)",
                 color=INK, fontsize=10, loc="left")
    style(ax)
    ax.legend(frameon=False, fontsize=8, ncol=4, loc="upper center", bbox_to_anchor=(0.5, -0.12))
    fig.tight_layout()
    fig.savefig(f"{OUT}/val_dense_vs_sparse.png", dpi=160)
    plt.close(fig)

    # 4. action histogram of greedy sequences
    counts = {}
    for mode in ("dense", "sparse"):
        seqs = " ".join(ev[ev.reward == mode].sequence.fillna("")).split()
        counts[mode] = pd.Series(seqs).value_counts()
    acts = sorted(set(counts["dense"].index) | set(counts["sparse"].index),
                  key=lambda a: -(counts["dense"].get(a, 0) + counts["sparse"].get(a, 0)))
    fig, ax = plt.subplots(figsize=(9, 3.6))
    xx = np.arange(len(acts))
    for i, mode in enumerate(("dense", "sparse")):
        tot = counts[mode].sum() or 1
        ax.bar(xx + (i - 0.5) * 0.4, [counts[mode].get(a, 0) / tot for a in acts], 0.38,
               color=COLORS[f"RL {mode}"], label=f"{mode} reward")
    ax.set_xticks(xx)
    ax.set_xticklabels(acts, rotation=55, ha="right", fontsize=7)
    ax.set_ylabel("share of greedy actions", color=MUTED, fontsize=9)
    ax.set_title("Which passes the trained policies choose (all programs, all seeds)", color=INK, fontsize=10, loc="left")
    style(ax)
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()
    fig.savefig(f"{OUT}/action_histogram.png", dpi=160)
    plt.close(fig)

    # ---------------- failure analysis ----------------
    agg = ev.groupby(["benchmark", "split", "reward"]).agg(final=("final", "median"), O0=("O0_b", "first"),
                                                          O3=("O3", "first"), Oz=("Oz", "first")).reset_index()
    agg["vs_Oz_pct"] = 100 * (agg.final / agg.Oz - 1)
    agg["vs_O3_pct"] = 100 * (agg.final / agg.O3 - 1)
    agg.sort_values(["split", "reward", "vs_Oz_pct"]).to_csv(f"{OUT}/failure_cases.csv", index=False)
    regress = ev[ev.final > ev.O0_b]
    with open(f"{OUT}/RESULTS.md", "w") as fh:
        fh.write("# Results (generated by scripts/analyze.py)\n\n")
        fh.write("Size reduction vs -O0 = 1 - geomean(final IR instructions / -O0 instructions); higher is better.\n"
                 "RL columns: mean and standard deviation over seeds of each run's geomean.\n\n")
        fh.write(md(summary) + "\n\n")
        fh.write("## Wins / ties / losses (RL instruction count vs reference, per program)\n\n" + md(wl) + "\n\n")
        fh.write("## Per-program instruction counts (RL = median over seeds)\n\n" + md(per) + "\n\n")
        fh.write("## Failure analysis\n\n")
        fh.write(f"* Programs where a greedy RL sequence ends larger than -O0: {len(regress)} of {len(ev)} evaluations.\n")
        fh.write(f"* Evaluation crashes: {int(ev.failed.sum())}. Replay mismatches: {int((~ev.replay_ok.astype(bool)).sum())}.\n")
        fh.write(f"* Mean NOOP actions per greedy episode: dense {ev[ev.reward == 'dense'].noop_count.mean():.2f}, "
                 f"sparse {ev[ev.reward == 'sparse'].noop_count.mean():.2f} (of {int(ev.sequence.str.split().str.len().max())} steps).\n")
        fh.write(f"* Mean no-effect actions per greedy episode: dense {ev[ev.reward == 'dense'].no_effect.mean():.2f}, "
                 f"sparse {ev[ev.reward == 'sparse'].no_effect.mean():.2f}.\n\n")
        worst = agg[agg.split == "test"].sort_values("vs_Oz_pct", ascending=False)
        fh.write("Held-out programs, RL median vs -Oz and -O3 (percent larger, positive = RL loses):\n\n")
        fh.write(md(worst[["benchmark", "reward", "final", "Oz", "O3", "vs_Oz_pct", "vs_O3_pct"]]) + "\n")
    print(summary.to_string())
    print(wl.to_string())


if __name__ == "__main__":
    main()
