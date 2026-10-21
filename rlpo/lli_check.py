"""Output-equivalence check with the bundled `lli` (fallback for env.validate()).

Runs the unoptimised (-O0) bitcode and the bitcode after a pass sequence on the same
cBench input with LLVM's interpreter/JIT and compares stdout plus any output files.
This is weaker than CompilerGym's validate(): one input, no sanitizers.
"""
import filecmp
import os
import subprocess
import tempfile

from compiler_gym.third_party import llvm

from rlpo.env import ACTIONS, NOOP, bench_uri

DATA = os.path.join(os.path.expanduser(os.environ.get("COMPILER_GYM_SITE_DATA", "~/.local/share/compiler_gym")),
                    "llvm-v0", "cbench-v1-runtime-data", "runtime_data")

# benchmark -> (arguments with $D for the data dir, output files to compare)
COMMANDS = {
    "qsort": ("$D/automotive_qsort_data/1.dat", ["sorted_output.dat"]),
    "dijkstra": ("$D/network_dijkstra_data/1.dat", []),
    "crc32": ("$D/telecom_data/1.pcm", []),
    "sha": ("$D/office_data/1.txt", []),
    "bitcount": ("1125000", []),
    "blowfish": ("d $D/office_data/1.benc output.txt 1234567890abcdeffedcba0987654321", ["output.txt"]),
    "stringsearch": ("$D/office_data/1.txt $D/office_data/1.s.txt output.txt", ["output.txt"]),
}


def _run(bc, args, outs, cwd):
    os.makedirs(cwd, exist_ok=True)
    cmd = [str(llvm.lli_path()), bc] + args.replace("$D", DATA).split()
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, timeout=300)
    return p.returncode, p.stdout, [os.path.join(cwd, o) for o in outs]


def lli_equivalent(env, benchmark, actions):
    """Return 'match', 'mismatch: ...' or 'not available'."""
    if benchmark not in COMMANDS:
        return "not available"
    args, outs = COMMANDS[benchmark]
    flags = list(env.action_space.flags)
    with tempfile.TemporaryDirectory(dir="/dev/shm") as tmp:
        env.reset(benchmark=bench_uri(benchmark))
        ref = os.path.join(tmp, "ref.bc")
        env.write_bitcode(ref)
        for a in actions:
            if ACTIONS[a] != NOOP:
                env.step(flags.index(ACTIONS[a]))
        opt = os.path.join(tmp, "opt.bc")
        env.write_bitcode(opt)
        rc1, out1, files1 = _run(ref, args, outs, os.path.join(tmp, "a"))
        rc2, out2, files2 = _run(opt, args, outs, os.path.join(tmp, "b"))
        if rc1 != rc2:
            return f"mismatch: exit {rc1} vs {rc2}"
        if out1 != out2:
            return "mismatch: stdout differs"
        for f1, f2 in zip(files1, files2):
            if os.path.exists(f1) != os.path.exists(f2) or (os.path.exists(f1) and not filecmp.cmp(f1, f2, shallow=False)):
                return f"mismatch: {os.path.basename(f1)} differs"
        return "match"
