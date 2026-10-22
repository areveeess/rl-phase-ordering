"""Build web/data.json and web/data.js from the project's result files (phase 8, D-03, D-05).

Every number on the web page is read here from results/*.csv, results/*_check.txt,
results/overfit_check.csv, splits/split.json, runs/*/{run.json,train_log.csv,val_selection.csv},
the literal constants of rlpo/env.py and rlpo/agent.py (parsed with ast, never imported, because
importing rlpo.env needs compiler_gym) and web/traces.json when present. Nothing is typed by hand.
The script writes only web/data.json and web/data.js, never anything under results/ or runs/ (D-05).
Before writing it runs scripts/check_web.py's run_checks() on the finished data and aborts without
writing when any check fails.

Usage (repo root, Windows or WSL, stdlib + pandas):  python scripts/export_web.py
"""
import ast
import datetime
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_web  # noqa: E402  (run_checks is shared with the standalone check)

SCHEMA = 1
SPLITS = ["train", "val", "test"]
MAIN_RUNS = [f"{mode}_s{seed}" for mode in ("dense", "sparse") for seed in (0, 1, 2)]
LONG_RUNS = ["long_dense_s0", "long_sparse_s0"]
TRACES = "web/traces.json"


class Reader:
    """Reads source files under ROOT and remembers every path it read, repo-relative."""

    def __init__(self, root):
        self.root = Path(root)
        self.sources = []

    def _note(self, rel):
        if rel not in self.sources:
            self.sources.append(rel)

    def csv(self, rel):
        """A CSV as a DataFrame of strings (no type guessing, no NaN conversion), so floats are parsed once, exactly."""
        self._note(rel)
        return pd.read_csv(self.root / rel, dtype=str, keep_default_na=False, encoding="utf-8")

    def text(self, rel):
        self._note(rel)
        return (self.root / rel).read_text(encoding="utf-8")

    def json(self, rel):
        self._note(rel)
        return json.loads((self.root / rel).read_text(encoding="utf-8"))

    def exists(self, rel):
        return (self.root / rel).is_file()


# ---------------------------------------------------------------- small parsers

def git_commit(root):
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else None


def opt_int(s):
    return int(s) if s != "" else None


def opt_float(s):
    return float(s) if s != "" else None


def triple(s):
    """'6/1/1' -> [6, 1, 1]; '8/8' -> [8, 8]."""
    return [int(x) for x in s.split("/")]


def geomean(xs):
    return math.exp(math.fsum(math.log(x) for x in xs) / len(xs))


def wtl_counts(finals, refs, crashed):
    """[wins, ties, losses] of finals against refs. Smaller is better; a crashed evaluation counts as a loss."""
    w = t = l = 0
    for f, r, bad in zip(finals, refs, crashed):
        if bad or f > r:
            l += 1
        elif f < r:
            w += 1
        else:
            t += 1
    return [w, t, l]


def last_line(text):
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return lines[-1].strip() if lines else ""


def line_ok(line):
    return ("OK" in line or "PASS" in line) and "FAIL" not in line


# ---------------------------------------------------------------- constants (ast, never import rlpo)

def _literal(node, names):
    """Evaluate a literal or a simple +,-,* expression of literals and already-known names."""
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.List):
        return [_literal(e, names) for e in node.elts]
    if isinstance(node, ast.Name):
        return names[node.id]
    if isinstance(node, ast.BinOp):
        a, b = _literal(node.left, names), _literal(node.right, names)
        ops = {ast.Add: lambda x, y: x + y, ast.Sub: lambda x, y: x - y, ast.Mult: lambda x, y: x * y}
        return ops[type(node.op)](a, b)
    raise ValueError(f"unsupported expression: {ast.dump(node)}")


def module_constants(source):
    names = {}
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            try:
                names[node.targets[0].id] = _literal(node.value, names)
            except (ValueError, KeyError):
                pass  # not a literal constant (e.g. ACTIONS = PASSES + [NOOP] is fine, calls are skipped)
    return names


def arg_default(source, func, arg):
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.FunctionDef) and node.name == func:
            args = node.args.args
            defaults = [None] * (len(args) - len(node.args.defaults)) + list(node.args.defaults)
            for a, d in zip(args, defaults):
                if a.arg == arg and d is not None:
                    return _literal(d, {})
    raise KeyError(f"{func}({arg}=...) default not found")


def build_constants(rd):
    env = module_constants(rd.text("rlpo/env.py"))
    agent_src = rd.text("rlpo/agent.py")
    passes = env["PASSES"]
    n_actions = len(passes) + 1
    return {
        "passes": passes,
        "noop": env["NOOP"],
        "n_actions": n_actions,
        "episode_len": env["EPISODE_LEN"],
        "emb_dim": env["EMB_DIM"],
        "state_dim": env["STATE_DIM"],
        "hidden": arg_default(agent_src, "__init__", "hidden"),
        "gamma": arg_default(agent_src, "reinforce_update", "gamma"),
        "entropy_coef": arg_default(agent_src, "reinforce_update", "entropy_coef"),
        "value_coef": arg_default(agent_src, "reinforce_update", "value_coef"),
        "uniform_entropy": math.log(n_actions),
    }


# ---------------------------------------------------------------- tables

def load_traces(rd):
    if not rd.exists(TRACES):
        return None
    return rd.json(TRACES)


def build_programs(rd, split, traces):
    base = rd.csv("results/baselines.csv").set_index("benchmark")
    sanity = rd.csv("results/sanity_baselines.csv").set_index("benchmark")
    fixed_steps = {e["benchmark"]: e["steps"] for e in (traces or {}).get("best_fixed", [])}
    out = []
    for name in split["test"] + split["val"] + split["train"]:
        sp = next(s for s in SPLITS if name in split[s])
        b, s = base.loc[name], sanity.loc[name]
        out.append({
            "name": name, "split": sp,
            "O0": int(b["O0"]), "O2": int(b["O2"]), "O3": int(b["O3"]), "Oz": int(b["Oz"]),
            "best_fixed": int(s["best_fixed"]),
            "random_mean": float(s["random_mean"]), "random_best": int(s["random_best"]),
            "best_fixed_steps": fixed_steps.get(name),
        })
    return out


def build_runs(rd):
    runs = []
    for group, ids in (("main", MAIN_RUNS), ("long", LONG_RUNS)):
        for rid in ids:
            meta = rd.json(f"runs/{rid}/run.json")
            log = rd.csv(f"runs/{rid}/train_log.csv")
            sel = rd.csv(f"runs/{rid}/val_selection.csv")
            programs = [c for c in sel.columns if c not in ("checkpoint", "val_mean_reduction")]
            val_selection = [{
                "checkpoint": r["checkpoint"],
                "update": int(re.search(r"(\d+)", r["checkpoint"]).group(1)),
                "val_mean_reduction": opt_float(r["val_mean_reduction"]),
                "per_program": {p: opt_float(r[p]) for p in programs},
            } for r in sel.to_dict("records")]
            selected = meta["selected"]
            chosen = [v for v in val_selection if v["checkpoint"] == selected]
            runs.append({
                "id": rid, "group": group, "reward": meta["reward"], "seed": meta["seed"],
                "episodes": meta["episodes"], "batch": meta["batch"], "lr": meta["lr"],
                "checkpoints": meta["checkpoints"], "selected": selected,
                "selected_update": int(re.search(r"(\d+)", selected).group(1)),
                "selected_val_reduction": chosen[0]["val_mean_reduction"] if chosen else None,
                "wall_seconds": meta["wall_seconds"],
                "train_log": {
                    "update": [int(x) for x in log["update"]],
                    "episodes": [int(x) for x in log["episodes"]],
                    "mean_reduction": [float(x) for x in log["mean_reduction"]],
                    "noop_frac": [float(x) for x in log["noop_frac"]],
                    "no_effect_frac": [float(x) for x in log["no_effect_frac"]],
                    "entropy": [float(x) for x in log["entropy"]],
                },
                "val_selection": val_selection,
            })
    return runs


def build_eval(rd, traces):
    steps = {(e["run"], e["benchmark"]): e["steps"] for e in (traces or {}).get("rows", [])}
    rows = []
    for group, rel in (("main", "results/eval.csv"), ("long", "results/long_eval.csv")):
        for r in rd.csv(rel).to_dict("records"):
            rows.append({
                "run": r["run"], "group": group, "reward": r["reward"], "seed": int(r["seed"]),
                "split": r["split"], "benchmark": r["benchmark"], "O0": int(r["O0"]),
                "final": opt_int(r["final"]),  # null for a crash, never dropped
                "sequence": r["sequence"].split(),
                "noop_count": int(r["noop_count"]), "no_effect": int(r["no_effect"]),
                "replay_final": opt_int(r["replay_final"]), "replay_ok": r["replay_ok"] == "True",
                "error": r["error"],
                "steps": steps.get((r["run"], r["benchmark"])),
            })
    return rows


def build_summary(rd, eval_rows, programs):
    """summary_reduction.csv values per split, plus the 2000-episode reductions computed with the supplementary.py convention."""
    long_by = {}
    for e in eval_rows:
        if e["group"] == "long":
            long_by.setdefault((e["reward"], e["split"]), []).append(e)
    out = []
    for r in rd.csv("results/summary_reduction.csv").to_dict("records"):
        entry = {
            "split": r["split"], "programs": int(r["programs"]),
            "O2": float(r["-O2"]), "O3": float(r["-O3"]), "Oz": float(r["-Oz"]),
            "random": float(r["random seq"]), "best_fixed": float(r["best fixed seq"]),
            "dense_mean": float(r["RL dense (mean)"]), "dense_sd": float(r["RL dense (sd)"]),
            "sparse_mean": float(r["RL sparse (mean)"]), "sparse_sd": float(r["RL sparse (sd)"]),
        }
        for mode in ("dense", "sparse"):
            g = long_by.get((mode, r["split"]), [])
            # a crash counts as no reduction (final = O0), as in supplementary.py and analyze.py
            entry[f"long_{mode}"] = (1 - geomean([(e["final"] if e["final"] is not None else e["O0"]) / e["O0"] for e in g])) if g else None
        out.append(entry)
    return out


def build_wtl(rd, eval_rows, programs):
    out = []
    for r in rd.csv("results/wins_ties_losses.csv").to_dict("records"):
        out.append({
            "split": r["split"], "run": f"{r['reward']}_s{r['seed']}", "group": "main",
            "reward": r["reward"], "seed": int(r["seed"]),
            "vs_O2": triple(r["vs -O2"]), "vs_O3": triple(r["vs -O3"]), "vs_Oz": triple(r["vs -Oz"]),
            "vs_best_fixed": triple(r["vs best fixed"]),
            "crashes": int(r["crashes"]), "replay_ok": triple(r["replay ok"]),
        })
    ref = {p["name"]: p for p in programs}
    for rid in LONG_RUNS:
        for split in ("test", "val", "train"):
            g = [e for e in eval_rows if e["run"] == rid and e["split"] == split]
            finals = [e["final"] if e["final"] is not None else e["O0"] for e in g]
            crashed = [e["final"] is None for e in g]
            out.append({
                "split": split, "run": rid, "group": "long", "reward": g[0]["reward"], "seed": g[0]["seed"],
                "vs_O2": wtl_counts(finals, [ref[e["benchmark"]]["O2"] for e in g], crashed),
                "vs_O3": wtl_counts(finals, [ref[e["benchmark"]]["O3"] for e in g], crashed),
                "vs_Oz": wtl_counts(finals, [ref[e["benchmark"]]["Oz"] for e in g], crashed),
                "vs_best_fixed": wtl_counts(finals, [ref[e["benchmark"]]["best_fixed"] for e in g], crashed),
                "crashes": sum(crashed),
                "replay_ok": [sum(1 for e in g if e["replay_ok"]), len(g)],
            })
    return out


def build_long_summary(rd):
    out = []
    for r in rd.csv("results/long_summary.csv").to_dict("records"):
        all_, test = (int(x) for x in r["distinct greedy seqs (all/test)"].split("/"))
        out.append({
            "run": r["run"], "reward": r["reward"], "episodes": int(r["episodes"]),
            "test_reduction": float(r["test reduction"]), "distinct_all": all_, "distinct_test": test,
            "entropy_first": float(r["entropy first"]), "entropy_last": float(r["entropy last"]),
            "selected": r["selected checkpoint"],
        })
    return out


def build_checks(rd, eval_rows, programs):
    def tally(group):
        rows = [e for e in eval_rows if e["group"] == group]
        return [sum(1 for e in rows if e["replay_ok"]), len(rows)], sum(1 for e in rows if e["final"] is None)

    replay_main, crash_main = tally("main")
    replay_long, crash_long = tally("long")

    lli = rd.csv("results/lli_validation.csv")["lli_check"].tolist()
    lli_match = sum(1 for v in lli if v == "match")
    lli_na = sum(1 for v in lli if v == "not available")

    leak = rd.text("results/leakage_check.txt")
    reward = rd.text("results/reward_sum_check.txt")
    over = rd.text("results/overfit_check.txt")
    fixed = {p["name"]: p["best_fixed"] for p in programs}
    thr = re.search(r"threshold\s+(\d+(?:\.\d+)?)%", over)
    return {
        "replay": {"main": replay_main, "long": replay_long},
        "crashes": {"main": crash_main, "long": crash_long},
        "lli": {"match": lli_match, "mismatch": len(lli) - lli_match - lli_na, "not_available": lli_na, "total": len(lli)},
        "leakage": {"ok": line_ok(last_line(leak)), "runs": sum(1 for ln in leak.splitlines() if ln.startswith("runs/")),
                    "line": last_line(leak)},
        "reward_sum": {"ok": line_ok(last_line(reward)), "episodes": sum(1 for ln in reward.splitlines() if ln.rstrip().endswith(" ok")),
                       "line": last_line(reward)},
        "overfit": {
            "ok": line_ok(last_line(over)), "threshold": float(thr.group(1)) / 100 if thr else None,
            "line": last_line(over),
            "rows": [{"benchmark": r["benchmark"], "O0": int(r["O0"]), "Oz": int(r["Oz"]), "final": int(r["final"]),
                      "fraction_of_Oz_reduction": float(r["fraction_of_Oz_reduction"]), "pass": r["pass"] == "True",
                      "best_fixed": fixed[r["benchmark"]]}
                     for r in rd.csv("results/overfit_check.csv").to_dict("records")],
        },
    }


def build_traces_block(traces):
    if traces is None:
        return {"present": False, "generated": None, "rows": 0, "changed_label": None}
    every_count_change = True
    for entry in traces.get("rows", []) + traces.get("best_fixed", []):
        prev = entry["o0"]
        for step in entry["steps"]:
            if step["changed"] and step["after"] == prev:
                every_count_change = False
            prev = step["after"]
    return {"present": True, "generated": traces.get("generated"), "rows": len(traces.get("rows", [])),
            "changed_label": "Changed the count" if every_count_change else "Changed the program"}


def build_data(root=ROOT, page_numbers=None):
    """The page data as a dict. Reads only the D-03 sources. page_numbers is filled in by main() after the first check pass."""
    rd = Reader(root)
    traces = load_traces(rd)
    split = rd.json("splits/split.json")
    constants = build_constants(rd)
    programs = build_programs(rd, split, traces)
    runs = build_runs(rd)
    eval_rows = build_eval(rd, traces)
    data = {
        "schema": SCHEMA,
        "built": datetime.date.today().isoformat(),
        "commit": git_commit(root),
        "sources": rd.sources,  # same list object, filled as files are read
        "constants": constants,
        "split": split,
        "programs": programs,
        "best_fixed_sequence": rd.text("results/sanity_baselines_best_fixed_sequence.txt").split(),
        "runs": runs,
        "eval": eval_rows,
        "summary": build_summary(rd, eval_rows, programs),
        "wtl": build_wtl(rd, eval_rows, programs),
        "long_summary": build_long_summary(rd),
        "checks": build_checks(rd, eval_rows, programs),
        "traces": build_traces_block(traces),
    }
    if page_numbers is not None:
        data["checks"]["page_numbers"] = page_numbers
    return data


def atomic_write(path, text):
    """Write text through a tmp file and os.replace, so a crash never leaves a truncated file."""
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


def roundtrip(data):
    """Pass the data through JSON so the checks see exactly what the page will see."""
    return json.loads(json.dumps(data, ensure_ascii=False, allow_nan=False))


def main():
    if not (ROOT / "runs").is_dir():
        print("runs/ not found: data.json is built from the local training runs; the committed web/data.json is still valid")
        return 1
    web = (ROOT / "web").resolve()
    outputs = [web / "data.json", web / "data.js"]
    for p in outputs:  # D-05: only ever write inside ROOT/web
        if p.resolve().parent != web or web.parent != ROOT.resolve():
            print(f"refusing to write outside web/: {p.resolve()}")
            return 1

    # Pass 1: everything except the page_numbers entry. Pass 2: with it, which must also be clean.
    data = roundtrip(build_data(ROOT))
    failures, n = check_web.run_checks(data, ROOT, page_numbers=False)
    if not failures:
        data = roundtrip(build_data(ROOT, page_numbers={"ok": True, "assertions": n, "script": "scripts/check_web.py"}))
        failures, n2 = check_web.run_checks(data, ROOT)
        if not failures and n2 != n:
            failures = [f"FAIL: assertion count changed between passes ({n} then {n2})"]
    if failures:
        for f in failures:
            print(f)
        print(f"export_web: {len(failures)} check(s) failed, nothing written")
        return 1
    pretty = json.dumps(data, indent=1, ensure_ascii=False, allow_nan=False) + "\n"
    compact = json.dumps(data, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    compact = compact.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    atomic_write(outputs[0], pretty)
    atomic_write(outputs[1], "window.DATA = " + compact + ";\n")
    for p in outputs:
        print(f"wrote {p.relative_to(ROOT).as_posix()} ({p.stat().st_size} bytes, {n} assertions passed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
