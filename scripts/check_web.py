"""Prove that the numbers in web/data.json equal the files in results/ (phase 8, D-03).

run_checks(data, root) re-reads the sources with the stdlib csv module, an independent code path
from scripts/export_web.py's pandas, and compares every value the page shows. It returns
(failures, assertions): a list of "FAIL: ..." strings and the number of values compared.

Values copied from a file are compared exactly. Values derived by arithmetic (a geometric mean over a
split) are recomputed here with a separate implementation and compared to 1e-12. Nothing is compared
against a typed-in result figure: counts and ranges are always recomputed from the source files.

Standalone:  python scripts/check_web.py [--data web/data.json] [--require-traces]
Exit 0 and "check_web: OK (<n> assertions)" only when every comparison holds; exit 1 otherwise.
"""
import argparse
import csv
import json
import math
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPLITS = ["train", "val", "test"]
MAIN_RUNS = ["dense_s0", "dense_s1", "dense_s2", "sparse_s0", "sparse_s1", "sparse_s2"]
LONG_RUNS = ["long_dense_s0", "long_sparse_s0"]
REFS = [("O2", "-O2", "vs_O2"), ("O3", "-O3", "vs_O3"), ("Oz", "-Oz", "vs_Oz"), ("best_fixed", "best fixed", "vs_best_fixed")]
TOP_KEYS = {"schema", "built", "commit", "sources", "constants", "split", "programs", "best_fixed_sequence",
            "runs", "eval", "summary", "wtl", "long_summary", "checks", "traces"}
TOL = 1e-12


def read_csv(root, rel):
    with open(Path(root) / rel, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def read_text(root, rel):
    return (Path(root) / rel).read_text(encoding="utf-8")


def read_json(root, rel):
    return json.loads(read_text(root, rel))


def ints(s):
    return [int(x) for x in s.split("/")]


def int_or_none(s):
    return int(s) if s != "" else None


def geomean(xs):
    return math.exp(sum(math.log(x) for x in xs) / len(xs))


def wtl_triple(finals, refs, crashed):
    """[wins, ties, losses]: smaller is better; a crashed evaluation is a loss."""
    res = [0, 0, 0]
    for f, r, bad in zip(finals, refs, crashed):
        if bad or f > r:
            res[2] += 1
        elif f < r:
            res[0] += 1
        else:
            res[1] += 1
    return res


def last_line(text):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[-1].strip() if lines else ""


class Checker:
    """Counts every comparison and collects the failures."""

    def __init__(self):
        self.failures = []
        self.count = 0

    def eq(self, label, stored, source):
        self.count += 1
        if stored != source or type(stored) is not type(source):
            self.failures.append(f"FAIL: {label}: page data {stored!r} != source {source!r}")

    def close(self, label, stored, source):
        self.count += 1
        ok = isinstance(stored, float) and isinstance(source, float) and abs(stored - source) <= TOL
        if not ok:
            self.failures.append(f"FAIL: {label}: page data {stored!r} != recomputed {source!r}")

    def true(self, label, cond, detail=""):
        self.count += 1
        if not cond:
            self.failures.append(f"FAIL: {label}{': ' + detail if detail else ''}")


class Sources:
    """The source files, read once with the csv module."""

    def __init__(self, root):
        self.root = Path(root)
        self.split = read_json(root, "splits/split.json")
        self.programs = self.split["test"] + self.split["val"] + self.split["train"]
        self.base = {r["benchmark"]: r for r in read_csv(root, "results/baselines.csv")}
        self.sanity = {r["benchmark"]: r for r in read_csv(root, "results/sanity_baselines.csv")}
        self.eval = {"main": read_csv(root, "results/eval.csv"), "long": read_csv(root, "results/long_eval.csv")}
        self.have_runs = (self.root / "runs").is_dir()
        self.traces = read_json(root, "web/traces.json") if (self.root / "web/traces.json").is_file() else None

    def split_of(self, name):
        return next(s for s in SPLITS if name in self.split[s])

    def eval_rows(self):
        for group in ("main", "long"):
            for r in self.eval[group]:
                yield group, r


# ---------------------------------------------------------------- individual checks

def check_meta(c, data, src):
    c.eq("top-level keys", sorted(data.keys()), sorted(TOP_KEYS))
    c.eq("schema", data.get("schema"), 1)
    c.eq("split", data.get("split"), src.split)
    for rel in data.get("sources", []):
        if rel.startswith("runs/") and not src.have_runs:
            continue
        c.true(f"source file {rel}", (src.root / rel).is_file(), "listed in sources but missing")
    c.eq("best_fixed_sequence", data.get("best_fixed_sequence"),
         read_text(src.root, "results/sanity_baselines_best_fixed_sequence.txt").split())


def check_summary(c, data, src):
    """(a) every summary value equals results/summary_reduction.csv; long values recomputed from long_eval.csv."""
    rows = read_csv(src.root, "results/summary_reduction.csv")
    by_split = {e["split"]: e for e in data.get("summary", [])}
    c.eq("summary: number of splits", len(data.get("summary", [])), len(rows))
    cols = {"O2": "-O2", "O3": "-O3", "Oz": "-Oz", "random": "random seq", "best_fixed": "best fixed seq",
            "dense_mean": "RL dense (mean)", "dense_sd": "RL dense (sd)",
            "sparse_mean": "RL sparse (mean)", "sparse_sd": "RL sparse (sd)"}
    for r in rows:
        s = r["split"]
        e = by_split.get(s)
        if e is None:
            c.true(f"summary[{s}]", False, "split missing from page data")
            continue
        c.eq(f"summary[{s}].programs", e.get("programs"), int(r["programs"]))
        for key, col in cols.items():
            c.eq(f"summary[{s}].{key}", e.get(key), float(r[col]))
        for mode in ("dense", "sparse"):
            g = [x for x in src.eval["long"] if x["reward"] == mode and x["split"] == s]
            ratios = [(int(x["final"]) if x["final"] != "" else int(src.base[x["benchmark"]]["O0"])) / int(src.base[x["benchmark"]]["O0"]) for x in g]
            c.close(f"summary[{s}].long_{mode}", e.get(f"long_{mode}"), 1 - geomean(ratios))


def check_programs(c, data, src):
    """(d) programs equal baselines.csv and sanity_baselines.csv; per-seed medians equal per_program.csv."""
    progs = data.get("programs", [])
    c.eq("programs: order", [p["name"] for p in progs], src.programs)
    for p in progs:
        n = p["name"]
        b, s = src.base[n], src.sanity[n]
        c.eq(f"programs[{n}].split", p["split"], src.split_of(n))
        for key, col in (("O0", "O0"), ("O2", "O2"), ("O3", "O3"), ("Oz", "Oz")):
            c.eq(f"programs[{n}].{key}", p[key], int(b[col]))
        c.eq(f"programs[{n}].O0 (sanity file)", p["O0"], int(s["O0"]))
        c.eq(f"programs[{n}].best_fixed", p["best_fixed"], int(s["best_fixed"]))
        c.eq(f"programs[{n}].random_mean", p["random_mean"], float(s["random_mean"]))
        c.eq(f"programs[{n}].random_best", p["random_best"], int(s["random_best"]))
    stored = {p["name"]: p for p in progs}
    for r in read_csv(src.root, "results/per_program.csv"):
        n = r["benchmark"]
        p = stored[n]
        for key, col in (("O0", "O0"), ("O2", "-O2"), ("O3", "-O3"), ("Oz", "-Oz"), ("best_fixed", "best fixed")):
            c.eq(f"per_program[{n}].{key}", p[key], int(r[col]))
        for mode in ("dense", "sparse"):
            finals = [e["final"] if e["final"] is not None else e["O0"]
                      for e in data.get("eval", []) if e["group"] == "main" and e["reward"] == mode and e["benchmark"] == n]
            c.eq(f"per_program[{n}].{mode} median over seeds", int(statistics.median(finals)), int(r[f"RL {mode} (median)"]))


def check_runs(c, data, src):
    """Runs equal runs/*/{run.json,train_log.csv,val_selection.csv}."""
    c.eq("runs: ids", [r["id"] for r in data.get("runs", [])], MAIN_RUNS + LONG_RUNS)
    if not src.have_runs:
        return
    for run in data.get("runs", []):
        rid = run["id"]
        meta = read_json(src.root, f"runs/{rid}/run.json")
        for key in ("reward", "seed", "episodes", "batch", "lr", "checkpoints", "selected", "wall_seconds"):
            c.eq(f"runs[{rid}].{key}", run[key], meta[key])
        c.eq(f"runs[{rid}].group", run["group"], "long" if rid.startswith("long_") else "main")
        c.eq(f"runs[{rid}].selected_update", run["selected_update"], int(re.search(r"(\d+)", meta["selected"]).group(1)))
        log = read_csv(src.root, f"runs/{rid}/train_log.csv")
        for col in ("update", "episodes"):
            c.eq(f"runs[{rid}].train_log.{col}", run["train_log"][col], [int(x[col]) for x in log])
        for col in ("mean_reduction", "noop_frac", "no_effect_frac", "entropy"):
            c.eq(f"runs[{rid}].train_log.{col}", run["train_log"][col], [float(x[col]) for x in log])
        sel = read_csv(src.root, f"runs/{rid}/val_selection.csv")
        c.eq(f"runs[{rid}].val_selection: rows", len(run["val_selection"]), len(sel))
        for stored, r in zip(run["val_selection"], sel):
            ck = r["checkpoint"]
            c.eq(f"runs[{rid}].val_selection[{ck}].checkpoint", stored["checkpoint"], ck)
            c.eq(f"runs[{rid}].val_selection[{ck}].update", stored["update"], int(re.search(r"(\d+)", ck).group(1)))
            c.eq(f"runs[{rid}].val_selection[{ck}].val_mean_reduction", stored["val_mean_reduction"],
                 float(r["val_mean_reduction"]) if r["val_mean_reduction"] != "" else None)
            progs = [k for k in r if k not in ("checkpoint", "val_mean_reduction")]
            c.eq(f"runs[{rid}].val_selection[{ck}].per_program", stored["per_program"],
                 {k: (float(r[k]) if r[k] != "" else None) for k in progs})
        chosen = [r for r in sel if r["checkpoint"] == meta["selected"]]
        c.true(f"runs[{rid}]: selected checkpoint is in val_selection.csv", len(chosen) == 1)
        if chosen:
            c.eq(f"runs[{rid}].selected_val_reduction", run["selected_val_reduction"],
                 float(chosen[0]["val_mean_reduction"]) if chosen[0]["val_mean_reduction"] != "" else None)


def check_eval(c, data, src):
    """(c) every eval row equals its CSV row; 120 main and 40 long rows; every (run, program) pair once."""
    stored = {}
    for e in data.get("eval", []):
        stored[(e["group"], e["run"], e["benchmark"])] = e
    c.eq("eval: number of rows", len(data.get("eval", [])), len(stored))
    c.eq("eval: main rows", sum(1 for e in data.get("eval", []) if e["group"] == "main"), len(src.eval["main"]))
    c.eq("eval: long rows", sum(1 for e in data.get("eval", []) if e["group"] == "long"), len(src.eval["long"]))
    c.eq("eval: main rows equal 6 runs x programs", len(src.eval["main"]), len(MAIN_RUNS) * len(src.programs))
    c.eq("eval: long rows equal 2 runs x programs", len(src.eval["long"]), len(LONG_RUNS) * len(src.programs))
    for group, rows in src.eval.items():
        for run in sorted({r["run"] for r in rows}):
            c.eq(f"eval[{run}]: programs, each exactly once", sorted(r["benchmark"] for r in rows if r["run"] == run), sorted(src.programs))
    for group, r in src.eval_rows():
        key = (group, r["run"], r["benchmark"])
        e = stored.get(key)
        label = f"eval[{r['run']}/{r['benchmark']}]"
        if e is None:
            c.true(label, False, "row missing from page data")
            continue
        c.eq(f"{label}.group", e["group"], group)
        c.eq(f"{label}.reward", e["reward"], r["reward"])
        c.eq(f"{label}.seed", e["seed"], int(r["seed"]))
        c.eq(f"{label}.split", e["split"], r["split"])
        c.eq(f"{label}.O0", e["O0"], int(r["O0"]))
        c.eq(f"{label}.final", e["final"], int_or_none(r["final"]))
        c.eq(f"{label}.sequence", e["sequence"], r["sequence"].split())
        c.eq(f"{label}.noop_count", e["noop_count"], int(r["noop_count"]))
        c.eq(f"{label}.no_effect", e["no_effect"], int(r["no_effect"]))
        c.eq(f"{label}.replay_final", e["replay_final"], int_or_none(r["replay_final"]))
        c.eq(f"{label}.replay_ok", e["replay_ok"], r["replay_ok"] == "True")
        c.eq(f"{label}.error", e["error"], r["error"])


def reference_lists(src, rows):
    ref = {k: [int(src.base[r["benchmark"]][col]) for r in rows] for k, col in (("O2", "O2"), ("O3", "O3"), ("Oz", "Oz"))}
    ref["best_fixed"] = [int(src.sanity[r["benchmark"]]["best_fixed"]) for r in rows]
    return ref


def check_wtl(c, data, src):
    """(b) main wins/ties/losses equal wins_ties_losses.csv and are re-derived from eval.csv; long ones re-derived from long_eval.csv."""
    stored = {(w["group"], w["run"], w["split"]): w for w in data.get("wtl", [])}
    csv_rows = read_csv(src.root, "results/wins_ties_losses.csv")
    c.eq("wtl: main entries", sum(1 for w in data.get("wtl", []) if w["group"] == "main"), len(csv_rows))
    for r in csv_rows:
        run = f"{r['reward']}_s{r['seed']}"
        w = stored.get(("main", run, r["split"]))
        label = f"wtl[{run}/{r['split']}]"
        if w is None:
            c.true(label, False, "entry missing from page data")
            continue
        c.eq(f"{label}.vs_O2", w["vs_O2"], ints(r["vs -O2"]))
        c.eq(f"{label}.vs_O3", w["vs_O3"], ints(r["vs -O3"]))
        c.eq(f"{label}.vs_Oz", w["vs_Oz"], ints(r["vs -Oz"]))
        c.eq(f"{label}.vs_best_fixed", w["vs_best_fixed"], ints(r["vs best fixed"]))
        c.eq(f"{label}.crashes", w["crashes"], int(r["crashes"]))
        c.eq(f"{label}.replay_ok", w["replay_ok"], ints(r["replay ok"]))
        c.eq(f"{label}.reward", w["reward"], r["reward"])
        c.eq(f"{label}.seed", w["seed"], int(r["seed"]))
        # the CSV itself must follow from eval.csv
        g = [x for x in src.eval["main"] if x["run"] == run and x["split"] == r["split"]]
        crashed = [x["final"] == "" for x in g]
        finals = [int(x["final"]) if x["final"] != "" else int(x["O0"]) for x in g]
        ref = reference_lists(src, g)
        for key, _, field in REFS:
            c.eq(f"{label}.{field} recomputed from eval.csv", w[field], wtl_triple(finals, ref[key], crashed))
    # the 2000-episode runs, per split
    for run in LONG_RUNS:
        for split in SPLITS:
            w = stored.get(("long", run, split))
            label = f"wtl[{run}/{split}]"
            g = [x for x in src.eval["long"] if x["run"] == run and x["split"] == split]
            if w is None:
                c.true(label, False, "entry missing from page data")
                continue
            crashed = [x["final"] == "" for x in g]
            finals = [int(x["final"]) if x["final"] != "" else int(x["O0"]) for x in g]
            ref = reference_lists(src, g)
            for key, _, field in REFS:
                c.eq(f"{label}.{field} recomputed from long_eval.csv", w[field], wtl_triple(finals, ref[key], crashed))
            c.eq(f"{label}.crashes", w["crashes"], sum(crashed))
            c.eq(f"{label}.replay_ok", w["replay_ok"], [sum(1 for x in g if x["replay_ok"] == "True"), len(g)])


def check_long_summary(c, data, src):
    """(e) long_summary.csv, with the numbers behind it recomputed from the stored 2000-episode rows and runs."""
    stored = {s["run"]: s for s in data.get("long_summary", [])}
    runs = {r["id"]: r for r in data.get("runs", [])}
    wtl = {(w["run"], w["split"]): w for w in data.get("wtl", []) if w["group"] == "long"}
    rows = read_csv(src.root, "results/long_summary.csv")
    c.eq("long_summary: entries", len(data.get("long_summary", [])), len(rows))
    for r in rows:
        rid = r["run"]
        s = stored.get(rid)
        label = f"long_summary[{rid}]"
        if s is None:
            c.true(label, False, "entry missing from page data")
            continue
        c.eq(f"{label}.reward", s["reward"], r["reward"])
        c.eq(f"{label}.episodes", s["episodes"], int(r["episodes"]))
        c.eq(f"{label}.test_reduction", s["test_reduction"], float(r["test reduction"]))
        test = [x for x in src.eval["long"] if x["run"] == rid and x["split"] == "test"]
        ratios = [(int(x["final"]) if x["final"] != "" else int(x["O0"])) / int(x["O0"]) for x in test]
        c.eq(f"{label}.test_reduction recomputed, 4 decimals", round(1 - geomean(ratios), 4), float(r["test reduction"]))
        c.eq(f"{label}: test programs", len(test), int(r["test programs"]))
        allrows = [x for x in src.eval["long"] if x["run"] == rid]
        d_all, d_test = ints(r["distinct greedy seqs (all/test)"])
        c.eq(f"{label}.distinct_all", s["distinct_all"], d_all)
        c.eq(f"{label}.distinct_test", s["distinct_test"], d_test)
        c.eq(f"{label}.distinct_all recomputed", len({x["sequence"] for x in allrows}), d_all)
        c.eq(f"{label}.distinct_test recomputed", len({x["sequence"] for x in test}), d_test)
        c.eq(f"{label}.entropy_first", s["entropy_first"], float(r["entropy first"]))
        c.eq(f"{label}.entropy_last", s["entropy_last"], float(r["entropy last"]))
        ent = runs[rid]["train_log"]["entropy"]
        c.eq(f"{label}.entropy_first vs train_log", round(ent[0], 2), float(r["entropy first"]))
        c.eq(f"{label}.entropy_last vs train_log", round(ent[-1], 2), float(r["entropy last"]))
        c.eq(f"{label}.selected", s["selected"], r["selected checkpoint"])
        if src.have_runs:
            c.eq(f"{label}.selected vs run.json", s["selected"], read_json(src.root, f"runs/{rid}/run.json")["selected"])
        c.eq(f"{label}: replay ok", [sum(1 for x in allrows if x["replay_ok"] == "True"), len(allrows)], ints(r["replay ok"]))
        w = wtl.get((rid, "test"))
        if w is not None:
            for _, col, field in REFS:
                c.eq(f"{label}.{field} vs long_summary.csv", w[field], ints(r[f"vs {col}"]))


def check_checks_block(c, data, src):
    """(f) replay, crashes, lli, leakage, reward-sum and overfit blocks."""
    ck = data.get("checks", {})
    for group in ("main", "long"):
        rows = src.eval[group]
        c.eq(f"checks.replay.{group}", ck["replay"][group], [sum(1 for r in rows if r["replay_ok"] == "True"), len(rows)])
        c.eq(f"checks.crashes.{group}", ck["crashes"][group], sum(1 for r in rows if r["final"] == ""))
    lli = [r["lli_check"] for r in read_csv(src.root, "results/lli_validation.csv")]
    c.eq("checks.lli.match", ck["lli"]["match"], sum(1 for v in lli if v == "match"))
    c.eq("checks.lli.not_available", ck["lli"]["not_available"], sum(1 for v in lli if v == "not available"))
    c.eq("checks.lli.mismatch", ck["lli"]["mismatch"], sum(1 for v in lli if v not in ("match", "not available")))
    c.eq("checks.lli.total", ck["lli"]["total"], len(lli))
    c.eq("checks.lli: parts add up", ck["lli"]["match"] + ck["lli"]["mismatch"] + ck["lli"]["not_available"], ck["lli"]["total"])

    leak = read_text(src.root, "results/leakage_check.txt")
    c.eq("checks.leakage.line", ck["leakage"]["line"], last_line(leak))
    c.eq("checks.leakage.runs", ck["leakage"]["runs"], sum(1 for ln in leak.splitlines() if ln.startswith("runs/")))
    c.eq("checks.leakage.ok", ck["leakage"]["ok"], "OK" in last_line(leak) and "FAIL" not in last_line(leak))
    c.eq("checks.leakage: every run has test-overlap=none", all("test-overlap=none" in ln for ln in leak.splitlines() if ln.startswith("runs/")), True)

    rs = read_text(src.root, "results/reward_sum_check.txt")
    c.eq("checks.reward_sum.line", ck["reward_sum"]["line"], last_line(rs))
    c.eq("checks.reward_sum.episodes", ck["reward_sum"]["episodes"], sum(1 for ln in rs.splitlines() if ln.rstrip().endswith(" ok")))
    c.eq("checks.reward_sum.ok", ck["reward_sum"]["ok"], "OK" in last_line(rs) and "FAIL" not in last_line(rs))

    over = read_text(src.root, "results/overfit_check.txt")
    c.eq("checks.overfit.line", ck["overfit"]["line"], last_line(over))
    c.eq("checks.overfit.ok", ck["overfit"]["ok"], "PASS" in last_line(over) and "FAIL" not in last_line(over))
    m = re.search(r"threshold\s+(\d+(?:\.\d+)?)%", over)
    c.eq("checks.overfit.threshold", ck["overfit"]["threshold"], float(m.group(1)) / 100 if m else None)
    rows = read_csv(src.root, "results/overfit_check.csv")
    c.eq("checks.overfit.rows: count", len(ck["overfit"]["rows"]), len(rows))
    by_name = {r["benchmark"]: r for r in ck["overfit"]["rows"]}
    for r in rows:
        n = r["benchmark"]
        s = by_name.get(n)
        if s is None:
            c.true(f"checks.overfit[{n}]", False, "row missing from page data")
            continue
        c.eq(f"checks.overfit[{n}].O0", s["O0"], int(r["O0"]))
        c.eq(f"checks.overfit[{n}].Oz", s["Oz"], int(r["Oz"]))
        c.eq(f"checks.overfit[{n}].final", s["final"], int(r["final"]))
        c.eq(f"checks.overfit[{n}].fraction_of_Oz_reduction", s["fraction_of_Oz_reduction"], float(r["fraction_of_Oz_reduction"]))
        c.eq(f"checks.overfit[{n}].pass", s["pass"], r["pass"] == "True")
        c.eq(f"checks.overfit[{n}].best_fixed", s["best_fixed"], int(src.sanity[n]["best_fixed"]))


def check_constants(c, data, src):
    """(g) constants re-read from rlpo/env.py and rlpo/agent.py with regular expressions; every sequence is made of known passes."""
    k = data.get("constants", {})
    env = read_text(src.root, "rlpo/env.py")
    agent = read_text(src.root, "rlpo/agent.py")
    block = re.search(r"^PASSES\s*=\s*\[(.*?)\]", env, re.S | re.M)
    passes = re.findall(r'"([^"]+)"', block.group(1)) if block else []
    c.eq("constants.passes", k.get("passes"), passes)
    c.eq("constants: 24 passes", len(k.get("passes", [])), 24)
    c.eq("constants.n_actions", k.get("n_actions"), len(passes) + 1)
    c.eq("constants: n_actions is 25", k.get("n_actions"), 25)
    c.eq("constants.noop", k.get("noop"), re.search(r'^NOOP\s*=\s*"([^"]+)"', env, re.M).group(1))
    emb = int(re.search(r"^EMB_DIM\s*=\s*(\d+)", env, re.M).group(1))
    c.eq("constants.emb_dim", k.get("emb_dim"), emb)
    c.eq("constants.state_dim", k.get("state_dim"), emb + int(re.search(r"^STATE_DIM\s*=\s*EMB_DIM\s*\+\s*(\d+)", env, re.M).group(1)))
    c.eq("constants.episode_len", k.get("episode_len"), int(re.search(r"^EPISODE_LEN\s*=\s*(\d+)", env, re.M).group(1)))
    c.eq("constants.hidden", k.get("hidden"), int(re.search(r"hidden\s*=\s*(\d+)", agent).group(1)))
    for key in ("gamma", "entropy_coef", "value_coef"):
        c.eq(f"constants.{key}", k.get(key), float(re.search(rf"{key}\s*=\s*([0-9.]+)", agent).group(1)))
    c.close("constants.uniform_entropy", k.get("uniform_entropy"), math.log(len(passes) + 1))
    allowed = set(passes) | {k.get("noop")}
    for e in data.get("eval", []):
        label = f"eval[{e['run']}/{e['benchmark']}]"
        c.eq(f"{label}: sequence length", len(e["sequence"]), k.get("episode_len"))
        c.true(f"{label}: every step is a pass or NOOP", all(p in allowed for p in e["sequence"]))


def check_sentence_inputs(c, data, src):
    """(h) every input of the computed sentences exists."""
    wtl = {(w["run"], w["split"]) for w in data.get("wtl", [])}
    for split in SPLITS:
        for run in MAIN_RUNS + LONG_RUNS:
            c.true(f"sentence input: wtl[{run}/{split}] present", (run, split) in wtl)
    runs = {r["id"]: r for r in data.get("runs", [])}
    for run in MAIN_RUNS + LONG_RUNS:
        c.true(f"sentence input: runs[{run}] entropy series non-empty", bool(runs.get(run, {}).get("train_log", {}).get("entropy")))


def check_kpi_ranges(c, data, src):
    """(i) the range of wins against each reference on the test split across the six main runs: computed, never a constant."""
    rows = [r for r in read_csv(src.root, "results/wins_ties_losses.csv") if r["split"] == "test"]
    c.eq("kpi: six main runs on test", len(rows), len(MAIN_RUNS))
    stored = [w for w in data.get("wtl", []) if w["group"] == "main" and w["split"] == "test"]
    c.eq("kpi: six main runs in page data", len(stored), len(MAIN_RUNS))
    for _, col, field in REFS:
        wins = [ints(r[f"vs {col}"])[0] for r in rows]
        sw = [w[field][0] for w in stored]
        c.eq(f"kpi: range of wins vs {col}", [min(sw), max(sw)], [min(wins), max(wins)])
        c.true(f"kpi: range vs {col} is ordered", min(wins) <= max(wins))


def check_steps(c, label, steps, seq, o0, final, no_effect, episode_len):
    c.eq(f"{label}: step count", len(steps), episode_len)
    c.eq(f"{label}: step passes equal the sequence", [s["pass"] for s in steps], seq)
    if no_effect is not None:
        c.eq(f"{label}: steps with changed false equal no_effect", sum(1 for s in steps if not s["changed"]), no_effect)
    prev = o0
    for i, s in enumerate(steps, 1):
        if not s["changed"]:
            c.eq(f"{label}: step {i} changed false keeps the count", s["after"], prev)
        prev = s["after"]
    c.eq(f"{label}: last count equals final", steps[-1]["after"] if steps else None, final)


def check_traces(c, data, src, require):
    """(j) step traces: consistent with the stored sequences and counts."""
    tr = data.get("traces", {})
    c.eq("traces.present", tr.get("present"), src.traces is not None)
    if src.traces is not None:
        c.eq("traces.rows", tr.get("rows"), len(src.traces.get("rows", [])))
        c.eq("traces.generated", tr.get("generated"), src.traces.get("generated"))
    episode_len = data.get("constants", {}).get("episode_len")
    file_rows = {(r["run"], r["benchmark"]): r for r in (src.traces or {}).get("rows", [])}
    file_fixed = {r["benchmark"]: r for r in (src.traces or {}).get("best_fixed", [])}
    for e in data.get("eval", []):
        label = f"trace[{e['run']}/{e['benchmark']}]"
        if e["steps"] is None:
            c.true(f"{label} present", not require, "--require-traces: row has no steps")
            continue
        check_steps(c, label, e["steps"], e["sequence"], e["O0"], e["final"], e["no_effect"], episode_len)
        row = file_rows.get((e["run"], e["benchmark"]))
        c.true(f"{label}: matches web/traces.json", row is not None and row["steps"] == e["steps"] and row["o0"] == e["O0"])
    fixed_seq = data.get("best_fixed_sequence")
    for p in data.get("programs", []):
        label = f"trace[best fixed/{p['name']}]"
        if p["best_fixed_steps"] is None:
            c.true(f"{label} present", not require, "--require-traces: program has no best-fixed steps")
            continue
        check_steps(c, label, p["best_fixed_steps"], fixed_seq, int(src.base[p["name"]]["O0"]),
                    int(src.sanity[p["name"]]["best_fixed"]), None, episode_len)
        row = file_fixed.get(p["name"])
        c.true(f"{label}: matches web/traces.json", row is not None and row["steps"] == p["best_fixed_steps"] and row["o0"] == p["O0"])


CHECKS = [check_meta, check_summary, check_programs, check_runs, check_eval, check_wtl, check_long_summary,
          check_checks_block, check_constants, check_sentence_inputs, check_kpi_ranges]


def run_checks(data, root=ROOT, require_traces=False, page_numbers=True):
    """Returns (failures, assertions). With page_numbers=False the checks.page_numbers entry is not required
    (export_web.py's first pass; the entry records the count this function returns)."""
    c = Checker()
    src = Sources(root)
    for fn in CHECKS + [lambda c_, d_, s_: check_traces(c_, d_, s_, require_traces)]:
        try:
            fn(c, data, src)
        except Exception as exc:  # a malformed data file is a failure, not a crash
            name = getattr(fn, "__name__", "check")
            c.failures.append(f"FAIL: {name}: could not complete: {type(exc).__name__}: {exc}")
    if page_numbers:  # self-description of the check run; reported, not counted
        pn = data.get("checks", {}).get("page_numbers")
        ok = (isinstance(pn, dict) and pn.get("ok") is True and pn.get("script") == "scripts/check_web.py"
              and pn.get("assertions") == c.count)
        if not ok:
            c.failures.append(f"FAIL: checks.page_numbers: page data {pn!r} does not describe this run (ok true, {c.count} assertions)")
    return c.failures, c.count


def load_js_payload(path):
    """The JSON payload of web/data.js ('window.DATA = {...};')."""
    text = Path(path).read_text(encoding="utf-8").strip()
    prefix = "window.DATA ="
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError("web/data.js does not have the form 'window.DATA = {...};'")
    return json.loads(text[len(prefix):-1])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    default = ROOT / "web" / "data.json"
    ap.add_argument("--data", default=str(default), help="data file to check (default web/data.json)")
    ap.add_argument("--require-traces", action="store_true", help="every eval row must carry step traces")
    args = ap.parse_args(argv)
    data_path = Path(args.data)
    failures = []
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        print(f"FAIL: cannot read {data_path}: {exc}")
        return 1
    if data_path.resolve() == default.resolve():
        try:
            if load_js_payload(ROOT / "web" / "data.js") != data:
                failures.append("FAIL: web/data.js and web/data.json carry different payloads")
        except (OSError, ValueError) as exc:
            failures.append(f"FAIL: cannot read web/data.js: {exc}")
    if not (ROOT / "runs").is_dir():
        print("check_web: note: runs/ not found, values taken from runs/ are not compared", file=sys.stderr)
    more, n = run_checks(data, ROOT, require_traces=args.require_traces)
    failures += more
    if failures:
        for f in failures:
            print(f)
        return 1
    print(f"check_web: OK ({n} assertions)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
