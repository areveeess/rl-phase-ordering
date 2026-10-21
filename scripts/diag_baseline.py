"""Find which baseline step crashes WSL for one program (progress to a WSL-side file)."""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from compiler_gym.envs.llvm import make_benchmark  # noqa: E402
from compiler_gym.third_party import llvm  # noqa: E402

from rlpo.env import make_env  # noqa: E402

name = sys.argv[1]
log = open(os.path.expanduser(f"~/diag_{name}.txt"), "w", buffering=1)
env = make_env()
try:
    log.write("reset\n"); os.fsync(log.fileno())
    env.reset(benchmark=f"benchmark://cbench-v1/{name}")
    log.write("write_bitcode\n"); os.fsync(log.fileno())
    env.write_bitcode("/tmp/d.bc")
    for lvl in ("-O2", "-O3", "-Oz"):
        log.write(f"opt {lvl}\n"); os.fsync(log.fileno())
        subprocess.run([str(llvm.opt_path()), lvl, "/tmp/d.bc", "-o", f"/tmp/d{lvl}.bc"], check=True)
        log.write(f"reload {lvl}\n"); os.fsync(log.fileno())
        env.reset(benchmark=make_benchmark(f"/tmp/d{lvl}.bc"))
        log.write(f"count {lvl} {env.observation['IrInstructionCount']}\n"); os.fsync(log.fileno())
finally:
    env.close()
log.write("ok\n")
