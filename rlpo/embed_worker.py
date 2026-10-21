"""IR2Vec in a separate, periodically recycled worker process.

The ir2vec extension leaks a few MB per initEmbedding() call (about 2 MB on qsort,
far more on large programs), which made long training runs exhaust WSL memory.
Running it in a child process that is replaced every RECYCLE_EVERY calls returns
that memory to the OS. The vectors are bit-identical to the in-process call.

The child is `python -m rlpo.embed_worker`: it reads one .ll path per line on stdin
and writes the 300 float64 values as raw bytes on stdout.
"""
import os
import subprocess
import sys

import numpy as np

RECYCLE_EVERY = 100
EMB_DIM = 300
_proc = None
_calls = 0


def _start():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return subprocess.Popen([sys.executable, "-m", "rlpo.embed_worker"], cwd=root,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE)


def embed_file(path):
    global _proc, _calls
    if _proc is None or _calls >= RECYCLE_EVERY or _proc.poll() is not None:
        close()
        _proc, _calls = _start(), 0
    _proc.stdin.write((path + "\n").encode())
    _proc.stdin.flush()
    data = _proc.stdout.read(EMB_DIM * 8)
    _calls += 1
    if len(data) != EMB_DIM * 8:
        close()
        raise RuntimeError(f"IR2Vec worker failed on {path}")
    return np.frombuffer(data, dtype=np.float64).copy()


def close():
    global _proc
    if _proc is not None:
        try:
            _proc.stdin.close()
            _proc.wait(timeout=10)
        except Exception:  # noqa: BLE001
            _proc.kill()
        _proc = None


def _serve():
    out = os.fdopen(os.dup(1), "wb")  # private copy of stdout for the vectors
    os.dup2(2, 1)  # anything the C++ library prints goes to stderr, not into the stream
    import ir2vec
    for line in sys.stdin:
        vec = np.asarray(ir2vec.initEmbedding(line.rstrip("\n"), "fa", "p").getProgramVector(), dtype=np.float64)
        if vec.shape != (EMB_DIM,):
            vec = np.full(EMB_DIM, np.nan)  # parent rejects non-finite vectors
        out.write(vec.tobytes())
        out.flush()


if __name__ == "__main__":
    _serve()
