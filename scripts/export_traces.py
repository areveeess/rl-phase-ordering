"""export_traces.py — Read-only replay of stored greedy sequences in WSL.

Produces web/traces.json: per-step pass, instruction count after it, and changed flag
for the 120 main evaluation runs, 40 long runs, and best fixed sequence on all 20 programs.
Runs only inside the WSL venv (Python 3.10 with CompilerGym).
"""
import csv
import datetime
import json
import os
import sys
from pathlib import Path

# Add repo root to sys.path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import compiler_gym  # noqa: E402
from rlpo.env import NOOP, bench_uri, make_env  # noqa: E402

OUTPUT_PATH = ROOT / "web" / "traces.json"


def read_csv(rel):
    with open(ROOT / rel, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_json(rel):
    with open(ROOT / rel, encoding="utf-8") as f:
        return json.load(f)


def replay_sequence(env, flags, benchmark, sequence):
    env.reset(benchmark=bench_uri(benchmark))
    o0 = int(env.observation["IrInstructionCount"])
    prev_count = o0
    steps = []

    for pass_name in sequence:
        if pass_name == NOOP:
            after = prev_count
            changed = False
        else:
            action_idx = flags.index(pass_name)
            obs, _, done, info = env.step(action_idx)
            if done:
                raise RuntimeError(f"CompilerGym ended early on {benchmark}: {info}")
            after = int(obs)
            changed = not info.get("action_had_no_effect", False)
            prev_count = after

        steps.append({
            "pass": pass_name,
            "after": after,
            "changed": changed
        })

    return o0, steps


def main():
    assert OUTPUT_PATH.resolve().parent == (ROOT / "web").resolve(), "Write target must be inside web/"

    split = read_json("splits/split.json")
    all_programs = split.get("test", []) + split.get("val", []) + split.get("train", [])

    eval_main = read_csv("results/eval.csv")
    eval_long = read_csv("results/long_eval.csv")
    all_eval_rows = eval_main + eval_long

    sanity_csv = read_csv("results/sanity_baselines.csv")
    sanity_map = {r["benchmark"]: int(r["best_fixed"]) for r in sanity_csv}

    best_fixed_seq_text = (ROOT / "results/sanity_baselines_best_fixed_sequence.txt").read_text(encoding="utf-8").strip()
    best_fixed_seq = best_fixed_seq_text.split()

    env = make_env()
    flags = list(env.action_space.flags)

    mismatches = []
    traces_rows = []
    traces_best_fixed = []

    total_items = len(all_eval_rows) + len(all_programs)
    item_idx = 0

    try:
        # 1. Replay eval rows
        for r in all_eval_rows:
            item_idx += 1
            run_id = r["run"]
            benchmark = r["benchmark"]
            stored_final = int(r["final"]) if r["final"] else None
            sequence = r["sequence"].split() if r["sequence"] else []

            if not sequence:
                continue

            o0, steps = replay_sequence(env, flags, benchmark, sequence)
            replayed_final = steps[-1]["after"] if steps else o0

            if stored_final is not None and replayed_final != stored_final:
                print(f"MISMATCH [{item_idx}/{total_items}]: {run_id}/{benchmark}: stored {stored_final} != replayed {replayed_final}", file=sys.stderr)
                mismatches.append({
                    "run": run_id,
                    "benchmark": benchmark,
                    "stored": stored_final,
                    "replayed": replayed_final
                })
            else:
                print(f"[{item_idx}/{total_items}] Replayed {run_id}/{benchmark} -> final {replayed_final}")

            traces_rows.append({
                "run": run_id,
                "benchmark": benchmark,
                "o0": o0,
                "steps": steps
            })

        # 2. Replay best fixed sequence on all 20 programs in split order
        for p_name in all_programs:
            item_idx += 1
            stored_final = sanity_map.get(p_name)
            o0, steps = replay_sequence(env, flags, p_name, best_fixed_seq)
            replayed_final = steps[-1]["after"] if steps else o0

            if stored_final is not None and replayed_final != stored_final:
                print(f"MISMATCH [{item_idx}/{total_items}]: best_fixed/{p_name}: stored {stored_final} != replayed {replayed_final}", file=sys.stderr)
                mismatches.append({
                    "run": "best_fixed",
                    "benchmark": p_name,
                    "stored": stored_final,
                    "replayed": replayed_final
                })
            else:
                print(f"[{item_idx}/{total_items}] Replayed best_fixed/{p_name} -> final {replayed_final}")

            traces_best_fixed.append({
                "benchmark": p_name,
                "o0": o0,
                "steps": steps
            })

    finally:
        env.close()

    result = {
        "schema": 1,
        "generated": datetime.date.today().isoformat(),
        "compiler_gym": str(compiler_gym.__version__),
        "rows": traces_rows,
        "best_fixed": traces_best_fixed,
        "mismatches": mismatches
    }

    # Write atomically via tmp file
    tmp_path = OUTPUT_PATH.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    os.replace(tmp_path, OUTPUT_PATH)

    print(f"Wrote {len(traces_rows)} eval rows and {len(traces_best_fixed)} best-fixed traces to {OUTPUT_PATH}")

    if mismatches:
        print(f"FAIL: {len(mismatches)} mismatches recorded in {OUTPUT_PATH}", file=sys.stderr)
        sys.exit(1)

    print("export_traces: OK (0 mismatches)")


if __name__ == "__main__":
    main()
