# Plan 08-06 Summary: Live-Run Server and E2E Reproduction

## 1. Plan Overview
- **Phase:** 08-web-frontend
- **Plan:** 06 (Live server backend)
- **Status:** Complete (all 2 tasks passed)
- **Goal:** Implement the optional live-run backend (D-01, D-10 to D-13): a stdlib-only HTTP server running inside WSL that serves `web/` and executes one trained RL policy at a time greedily on a chosen cBench program, streaming NDJSON step events while guaranteeing full reproducibility against stored evaluations, zero filesystem writes to `results/` or `runs/`, and strict loopback security.

---

## 2. Artifacts Produced
- [`web/server.py`](file:///c:/Users/rvsre/Documents/compiler%20project/web/server.py): Threading HTTP server (stdlib only) with double-fork daemonization (`--daemon`), strict Host (`localhost:[PORT]`, `127.0.0.1:[PORT]`) and loopback Origin verification, path traversal prevention, lazy CompilerGym and `rlpo` imports, non-blocking lock (HTTP 409 busy), streaming NDJSON step events, and clean shutdown handling.
- [`tests/test_server.py`](file:///c:/Users/rvsre/Documents/compiler%20project/tests/test_server.py): Stdlib unittest suite covering 12 test cases (health, runs, run streaming, 404 unknown run/program, 400 malformed JSON/missing fields, 415 media type, 413 payload size, 403 host header protection, CORS origin validation, path traversal prevention, 409 busy concurrency lock, error recovery).
- [`scripts/live_check.py`](file:///c:/Users/rvsre/Documents/compiler%20project/scripts/live_check.py): Verification client that asserts NDJSON event structure (start, 15 steps, done), compares live final against stored `results/eval.csv` and `web/data.json`, verifies concurrency rejection (`--busy`), and confirms zero writes to `results/` and `runs/` (`--no-writes`). Includes Windows loopback latency optimization for instantaneous connection without IPv6 timeout.
- [`scripts/live_e2e.sh`](file:///c:/Users/rvsre/Documents/compiler%20project/scripts/live_e2e.sh): Git Bash server lifecycle manager (`start`, `stop`, `status`) handling Windows-to-WSL path translation and confirming zero leftover `compiler_gym-llvm-service` processes upon shutdown.

---

## 3. Verification & Benchmark Reproduction

### Unit Test Suite
- **Command:** `python -m unittest discover -s tests -p "test_server.py" -v`
- **Result:** 12 tests passed in 6.431s (0 FAIL, 0 ERROR).

### Live E2E Replay (8 Pairs Across All Runs & Splits)
The server was started in WSL (`scripts/live_e2e.sh start 8765`), and `scripts/live_check.py` evaluated 8 representative pairs including held-out programs, seeds, sparse/dense, and 2000-episode runs:

| Pair (Run : Program) | Live Final | Stored Final | Match | Elapsed (s) |
|---|:---:|:---:|:---:|:---:|
| `dense_s0:blowfish` | 2,327 | 2,327 | **True** | 6.41s |
| `dense_s1:bzip2` | 18,846 | 18,846 | **True** | 54.02s |
| `dense_s2:patricia` | 800 | 800 | **True** | 1.17s |
| `sparse_s0:stringsearch` | 727 | 727 | **True** | 1.40s |
| `sparse_s1:adpcm` | 280 | 280 | **True** | 0.95s |
| `sparse_s2:tiff2bw` | 37,222 | 37,222 | **True** | 9.96s |
| `long_dense_s0:qsort` | 337 | 337 | **True** | 1.22s |
| `long_sparse_s0:bitcount` | 508 | 508 | **True** | 1.11s |

- **First-run start-up time:** Initial health check became ready in < 2 seconds. First environment reset (`dense_s0:blowfish`) took 6.41s to initialize CompilerGym and IR2Vec worker; subsequent cached runs executed in ~1.0-1.4s.
- **Concurrency Check (`--busy`):** Second concurrent POST while runner held lock returned `HTTP 409` with `{"error": "busy", "message": "Another run is already in progress. The server runs one at a time."}`.
- **Integrity Check (`--no-writes`):** Scanned all files under `results/` and `runs/` before and after execution; 0 files modified, added, or deleted.
- **Shutdown Cleanliness:** Upon `scripts/live_e2e.sh stop 8765`, `pgrep -fc "[c]ompiler_gym-llvm-service"` reported `0` (clean shutdown with zero orphaned daemon services).
- **Grep Checks:** `grep -nE "0\.0\.0\.0|shell=True|os\.system|subprocess" web/server.py` matched 0 forbidden patterns; `weights_only=True` confirmed present.

---

## 4. Operational Notes
- Windows loopback resolution (`localhost`) attempts IPv6 `::1` before falling back to `127.0.0.1`, which can introduce a 2-second connection latency on Windows Python clients connecting to an IPv4-only WSL service. `live_check.py` maps the network connection directly to `127.0.0.1` while preserving `Host: localhost:[PORT]` in the HTTP headers, ensuring sub-millisecond connection times and robust concurrency testing.
- The double-fork daemonization in `web/server.py` reparents the server process cleanly under WSL PID 1, decoupling it from ephemeral Windows-to-WSL command sessions.
