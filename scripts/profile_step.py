"""Break down the cost of one MDP step: pass, IR fetch, IR2Vec (fa vs sym)."""
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ir2vec  # noqa: E402

from rlpo.env import make_env  # noqa: E402

env = make_env()
try:
    for prog in sys.argv[1:] or ["qsort", "gsm"]:
        env.reset(benchmark=f"benchmark://cbench-v1/{prog}")
        flags = list(env.action_space.flags)
        t = time.time(); env.step(flags.index("-mem2reg")); t_step = time.time() - t
        t = time.time(); ir = env.observation["Ir"]; t_ir = time.time() - t
        with tempfile.NamedTemporaryFile("w", suffix=".ll", dir="/dev/shm", delete=False) as f:
            f.write(ir)
        res = {}
        for mode in ("fa", "sym"):
            t = time.time(); ir2vec.initEmbedding(f.name, mode, "p").getProgramVector(); res[mode] = time.time() - t
        os.unlink(f.name)
        print(f"{prog}: step {t_step*1e3:.0f}ms  Ir fetch {t_ir*1e3:.0f}ms ({len(ir)//1000}k chars)  "
              f"ir2vec fa {res['fa']*1e3:.0f}ms  sym {res['sym']*1e3:.0f}ms", flush=True)
finally:
    env.close()
