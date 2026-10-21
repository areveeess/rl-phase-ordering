"""End-to-end smoke test: CompilerGym llvm-v0 + IR2Vec + output validation.

Prints one line per check and exits non-zero on any failure.
Run inside the venv:  python smoke_test.py
"""
import subprocess
import sys

import numpy as np

from rlpo.env import ACTIONS, embed_ir, make_env
from rlpo.lli_check import lli_equivalent

failures = 0


def check(name, ok, detail=""):
    global failures
    print(f"[{'PASS' if ok else 'FAIL'}] {name}{': ' + detail if detail else ''}", flush=True)
    failures += 0 if ok else 1


orphans = subprocess.run("pgrep -fc '[c]ompiler_gym-llvm-service'", shell=True, capture_output=True, text=True)
check("no orphaned compiler_gym services", orphans.stdout.strip() in ("", "0"), f"count={orphans.stdout.strip() or 0}")

env = None
try:
    env = make_env()
    check("make llvm-v0", True)
    env.reset(benchmark="benchmark://cbench-v1/qsort")
    check("reset cbench-v1/qsort", True)

    ir = env.observation["Ir"]
    counts = {k: int(env.observation[k]) for k in
              ("IrInstructionCount", "IrInstructionCountO0", "IrInstructionCountO3", "IrInstructionCountOz")}
    check("Ir observation", len(ir) > 0, f"{len(ir)} chars")
    check("instruction counts", all(v > 0 for v in counts.values()), str(counts))

    flags = list(env.action_space.flags)
    for p in ("-mem2reg", "-instcombine"):
        obs, _, done, info = env.step(flags.index(p))
        check(f"step {p}", not done, f"count={int(obs)} action_had_no_effect={info.get('action_had_no_effect')}")

    vec = embed_ir(env.observation["Ir"])
    check("IR2Vec fa vector", vec.shape == (300,) and bool(np.all(np.isfinite(vec))),
          f"dim={vec.shape[0]} L2={np.linalg.norm(vec):.1f}")

    # CompilerGym's validate() is tried first. On this machine it fails inside its own
    # sanitizer runs (see SETUP.md), so the disclosed lli output check is the gate.
    try:
        result = env.validate()
        validate_ok, detail = result.okay(), str(result)[:120]
    except Exception as e:  # noqa: BLE001
        validate_ok, detail = False, f"{type(e).__name__}: {e}"[:120]
    print(f"[{'PASS' if validate_ok else 'INFO'}] env.validate(): {detail}", flush=True)
    if not validate_ok:
        seq = [ACTIONS.index(p) for p in ("-mem2reg", "-instcombine", "-simplifycfg", "-gvn")]
        for prog in ("qsort", "dijkstra", "crc32"):
            status = lli_equivalent(env, prog, seq)
            check(f"lli fallback output check ({prog})", status == "match", status)
finally:
    if env is not None:
        env.close()

sys.exit(1 if failures else 0)
