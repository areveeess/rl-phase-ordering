"""-O0/-O2/-O3/-Oz instruction counts for every cBench program (BASE-01).

Method (identical for every benchmark and every level):
  1. reset llvm-v0 on the benchmark and write its unoptimised bitcode;
  2. run CompilerGym's bundled LLVM 10 `opt -O{2,3,z}` on that bitcode;
  3. load the result back into llvm-v0 and read IrInstructionCount.
The agent's results are read with the same IrInstructionCount observation, so all
columns share one counter. The service's own IrInstructionCountO3/Oz observations
are saved alongside as a cross-check.
"""
import argparse
import os
import subprocess
import sys
import tempfile

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from compiler_gym.envs.llvm import make_benchmark  # noqa: E402
from compiler_gym.third_party import llvm  # noqa: E402

from rlpo.env import make_env  # noqa: E402

LEVELS = ["-O2", "-O3", "-Oz"]


def count_bitcode(env, path):
    env.reset(benchmark=make_benchmark(path))
    return int(env.observation["IrInstructionCount"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="results/baselines.csv")
    args = ap.parse_args()

    cols = ["benchmark", "O0", "O2", "O3", "Oz", "service_O3", "service_Oz"]
    rows = pd.read_csv(args.out).to_dict("records") if os.path.exists(args.out) else []
    done = {r["benchmark"] for r in rows}
    env = make_env()
    try:
        uris = sorted(env.datasets["cbench-v1"].benchmark_uris())
        opt = str(llvm.opt_path())
        with tempfile.TemporaryDirectory(dir="/dev/shm") as tmp:
            for uri in uris:
                name = uri.split("/")[-1]
                if name in done or name == "ghostscript":  # crashes the WSL VM; see splits/split.json
                    continue
                env.reset(benchmark=uri)
                row = {
                    "benchmark": name,
                    "O0": int(env.observation["IrInstructionCount"]),
                    "service_O3": int(env.observation["IrInstructionCountO3"]),
                    "service_Oz": int(env.observation["IrInstructionCountOz"]),
                }
                src = os.path.join(tmp, f"{name}.bc")
                env.write_bitcode(src)
                for lvl in LEVELS:
                    dst = os.path.join(tmp, f"{name}{lvl}.bc")
                    subprocess.run([opt, lvl, src, "-o", dst], check=True, timeout=600)
                    row[lvl.lstrip("-")] = count_bitcode(env, dst)
                rows.append(row)
                print(row, flush=True)
                os.makedirs(os.path.dirname(args.out), exist_ok=True)
                pd.DataFrame(rows)[cols].sort_values("benchmark").to_csv(args.out, index=False)
    finally:
        env.close()
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
