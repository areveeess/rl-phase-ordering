# Pitfalls Research

**Domain:** RL-guided LLVM phase ordering (CompilerGym 0.2.5 + IR2Vec + policy gradient), course research project, WSL2 on a single Windows 11 laptop, 3 days to early results (14 Oct 2026) and 10 days to final (21 Oct 2026)
**Researched:** 2026-10-11
**Confidence:** HIGH for install/environment and CompilerGym/IR2Vec behaviour (I reproduced them on this machine's WSL2 on 2026-10-11, see "Probe results"); MEDIUM for RL-training and evaluation pitfalls (established practice plus the measured numbers below, not tested on this project's code); LOW only where explicitly marked.

Phase names used below are indicative (the roadmapper may rename them):
**P1** Environment + smoke test, **P2** Baselines + benchmark split + eval protocol, **P3** Env wrapper + IR2Vec state, **P4** Policy-gradient training + early results, **P5** Evaluation + dense-vs-sparse + failure analysis, **P6** Export + plots + screenshots + reproducibility.

---

## Probe results (measured on this laptop, 2026-10-11)

These are not general knowledge. I ran them in the user's WSL2 and then deleted the probe environments. The roadmap should treat them as ground truth for planning.

| Fact | Evidence |
|------|----------|
| WSL distro is **Ubuntu 26.04**, default **Python 3.14.4**, no conda/uv/pyenv, no `libtinfo.so.5` (only `.so.6`). WSL sees **7.8 GB RAM**, 16 cores, `/` has ~949 GB virtual free, but the VHD lives on **C: which has only ~40 GB free (92% full)**. No `~/.wslconfig`. | `lsb_release`, `free`, `df` in WSL |
| The shell cwd in WSL is `/mnt/c/Users/rvsre/Documents/compiler project` (Windows drive, **path contains a space**). | `pwd` |
| CompilerGym is **archived** (read-only since 2026-05-27). Latest release 0.2.5 (2022-11-02), wheel tag `py3-none-manylinux2014_x86_64`. It pins `gym>=0.18,<=0.21`, `grpcio<1.44`, `protobuf<4.21`, but leaves `numpy>=1.19.3` and `pydantic>=1.8` unbounded. | GitHub page, PyPI JSON, `compiler_gym/requirements.txt` |
| `pip install compiler_gym` on Python 3.9 **fails to build gym 0.21.0** with modern setuptools/pip/uv (`'extras_require' must be a dictionary...`; `opencv-python (>=3.)` is an invalid specifier). Works with `pip==23.3.2`, `setuptools==65.5.0`, `wheel==0.38.4` and `--no-build-isolation`. **uv refuses it outright; use pip for this one package.** | Reproduced |
| After install, pip resolves **numpy 2.0.2** and **pydantic 2.x**. `import compiler_gym` then dies with `AttributeError: np.NINF was removed in NumPy 2.0`. Pinning `numpy==1.23.5` and `pydantic<2` (1.10.26) fixes it. protobuf resolved to 3.20.3, grpcio to 1.43.0. | Reproduced |
| The LLVM 10.0.0 `opt`/`clang` binaries CompilerGym downloads (95 MB tarball, `llvm-v0-linux.tar.bz2`) **need `libtinfo.so.5`**. Symlinking `.so.6` to `.so.5` does **not** work (`version NCURSES_TINFO_5.0.19991023 not found`). Extracting the real `libtinfo5_6.3-2ubuntu0.3_amd64.deb` (Ubuntu 22.04 universe) into a private dir and setting `LD_LIBRARY_PATH` works. Ubuntu 24.04+ no longer ships libtinfo5. | readelf + run |
| With those fixes: `compiler_gym.make("llvm-v0")` works, `compiler_version` = `10.0.0`, **124 actions**, `reset()` ~1 s on qsort. | Reproduced |
| **IR2Vec is NOT a CompilerGym observation space.** Spaces include Autophase, InstCount, Inst2vec (a different thing), ProGraML, `Ir`, `IrSha1`, `BitcodeFile`, but nothing named Ir2vec. IR2Vec must be bridged from the `Ir` text. | `env.observation.spaces` |
| `pip install ir2vec` (2.1.1, Jan 2024) has wheels only for **cp36-cp311** (no 3.12+). Its Python signature is `initEmbedding(file, mode, level)`, **three arguments, no `dim`**; the README on GitHub `main` documents a `dim` argument and passing it gives `TypeError: Invalid Arguments`. Output is 300-d. It **parses LLVM 10.0.0 textual IR fine**. Works with numpy 1.23.5. | Reproduced |
| `env.validate()` on `cbench-v1/qsort` returned **`Gold standard: Runtime error (127)`** on all 5 retries, in this setup (Ubuntu 26.04, Python 3.9, extracted libtinfo5). Root cause **not determined** (127 = command not found; LLVM tarball also ships no clang resource headers). **Semantic validation does not work out of the box here.** | Reproduced, unresolved |
| `step()` returns `info["action_had_no_effect"]` (verified True when `-mem2reg` was applied twice; reward 0.0 on the repeat). `IrSha1` observation exists. | Reproduced |
| Disk after one cBench run: ~1.1 GB site data + ~340 MB download cache (tarballs are kept). | `du` |
| `dl.fbaipublicfiles.com` still serves (HTTP 200) LLVM, cBench-v1 (5.4 MB), cBench runtime data (253 MB), npb-v0, mibench-v1, blas-v0, opencv-v0, github-v0 (344 MB) as of today. Repo is archived, so nothing will fix a future outage. | `curl -I` |
| pip downloads ran at ~70 kB/s in the probe and one `ReadTimeoutError` occurred. | Observed |

### cBench-v1 measurements (IrInstructionCount; IR2Vec flow-aware program vector, measured end to end from `env.observation["Ir"]`)

| Program | O0 | O3 | Oz | IR2Vec s | reset s | validatable |
|---------|----|----|----|----------|---------|-------------|
| adpcm | 567 | 222 | 209 | 0.02 | 0.7 | no |
| bitcount | 857 | 607 | 405 | 0.02 | 0.9 | yes |
| blowfish | 3898 | 1978 | 1933 | 0.10 | 1.0 | yes |
| bzip2 | 28748 | 19169 | 15946 | **42.7** | 3.6 | yes |
| crc32 | 242 | 164 | 114 | 0.01 | 1.0 | yes |
| dijkstra | 450 | 366 | 254 | 0.01 | 1.0 | yes |
| ghostscript | 406198 | 289350 | 177416 | **47.9** | **44.1** | no |
| gsm | 14902 | 10028 | 6870 | 0.46 | 3.0 | yes |
| ispell | 15184 | 12848 | 8079 | 0.30 | 3.5 | no |
| jpeg-c | 62452 | 46186 | 30195 | 2.1 | 8.1 | yes |
| jpeg-d | 59942 | 45383 | 28883 | 2.1 | 7.2 | yes |
| lame | 49131 | 35594 | 22785 | 2.6 | 6.7 | no |
| patricia | 1282 | 566 | 383 | 0.03 | 1.2 | yes |
| qsort | 638 | **1163** | 315 | 0.02 | 1.3 | yes |
| rijndael | 6133 | 3642 | 3524 | 0.17 | 1.3 | no |
| sha | 799 | **789** | 500 | 0.02 | 1.3 | yes |
| stringsearch | 1348 | 697 | 616 | 0.03 | 1.3 | yes |
| stringsearch2 | 482 | 281 | 214 | 0.02 | 1.3 | yes |
| susan | 13282 | 5731 | 5468 | 0.80 | 2.3 | yes |
| tiff2bw / tiff2rgba / tiffdither / tiffmedian | 58.4k-61.3k | 39.2k-40.7k | 30.7k-32.0k | 2.3-2.5 | 7.0-7.4 | yes |

Implications used throughout this document: program sizes span ~1700x; **-O3 is larger than -O0 on qsort and equal on sha**; **-Oz is the smallest in all 23**; the IR2Vec vector norm scales roughly with instruction count (tiny to 600k); IR2Vec flow-aware on bzip2 and ghostscript is 40+ s per call; four tiff programs and two jpeg programs are near-duplicates of each other.

---

## Critical Pitfalls

### Pitfall 1: Installing into the WSL default Python / newest Ubuntu and losing the first day

**What goes wrong:**
The default distro is Ubuntu 26.04 with Python 3.14. CompilerGym needs `gym<=0.21`, `grpcio<1.44`, `protobuf<4.21` (none have wheels for 3.12+), IR2Vec wheels stop at cp311, and the bundled LLVM 10 `opt`/`clang` need `libtinfo.so.5`. Three independent failures (Python ABI, gym build, libtinfo) stack, then numpy 2 / pydantic 2 produce a fourth at import time.

**Why it happens:**
CompilerGym is frozen at 2022 ecosystems and was archived in May 2026, so no upstream fix will ever land. Its install docs say "Python 3.7 or newer" and `pip install -U compiler_gym`, which is true only for a 2022 toolchain.

**How to avoid:**
Do not use the system Python. Preferred: add a second distro with `wsl --install -d Ubuntu-22.04` (libtinfo5 is installable from apt there; closest to what CompilerGym was tested on), then a **Python 3.9** venv via uv/Miniforge (3.9 is inside both CompilerGym's and IR2Vec's wheel ranges; 3.10 also worked for IR2Vec). If staying on 26.04, extract the Ubuntu 22.04 `libtinfo5` deb to a private directory and export `LD_LIBRARY_PATH` for every process that launches CompilerGym. Verified recipe (all versions are pins, commit them as `constraints.txt` on day 1):

```
python -m pip install "pip==23.3.2" "setuptools==65.5.0" "wheel==0.38.4"
python -m pip install --no-build-isolation "gym==0.21.0"
python -m pip install compiler_gym==0.2.5 "numpy==1.23.5" "pydantic<2" ir2vec==2.1.1
# resolved automatically and correct: protobuf 3.20.3, grpcio 1.43.0
```
Install PyTorch (CPU build is enough) **afterwards, under a constraints file** that pins numpy 1.23.5, then re-run the smoke test. Importing order: if anything upgrades numpy, `import compiler_gym` breaks again.

**Warning signs:**
`No matching distribution found for grpcio<1.44`; `error in gym setup command: 'extras_require'`; `np.NINF was removed`; `libtinfo.so.5: cannot open shared object file`; `pydantic` `ImportError`/validator errors; `Descriptors cannot be created directly` (means protobuf >= 4.21 sneaked in, issue #696 upstream).

**Phase to address:** P1. Hard time-box (see Pitfall 13): the smoke test script must pass before anything else is written.

---

### Pitfall 2: Treating a successful `import` as a working environment (validation, services, caches)

**What goes wrong:**
`make("llvm-v0")`, `reset()` and `step()` work, so the environment is declared done, but `env.validate()` (semantic correctness) fails, or services leak, or the first dataset use hangs on a download. In the probe, **`validate()` returned `Gold standard: Runtime error (127)` for qsort on every retry**, and the cause is undiagnosed.

**Why it happens:**
Validation compiles the benchmark to a binary and runs it against cBench's runtime data (253 MB download) using system toolchain pieces; the bundled LLVM tarball has no clang resource headers (`stddef.h` not found), and Ubuntu 26.04's toolchain is far newer than anything CompilerGym tested. The smoke test most people write never calls `validate()`.

**How to avoid:**
The P1 smoke test must be a script, not a notebook, and must do all of: make env, reset on `cbench-v1/qsort`, read `Ir`, `IrInstructionCountO0/O3/Oz`, step two actions, read `action_had_no_effect`, compute IR2Vec, **call `env.validate()` and require success**, `env.close()`. Cap diagnosis of the validation failure at about 2-3 hours (try the Ubuntu 22.04 distro, `apt install build-essential`, running with `COMPILER_GYM_DEBUG=4`). If still failing, use the fallback in Pitfall 11 (own output-equivalence check with `lli`, which ships in the LLVM tarball) and **state in the report that CompilerGym validation was unavailable**. Always `env.close()` in `finally`; before each run check for orphaned `compiler_gym` service processes (`ps aux | grep -i service`) since a Ctrl-C leaves them holding RAM.

**Warning signs:**
`Validation callback failed (...) attempt=n/5` in the log; `ServiceError`/"Session not found"; `step()` returning `done=True` with `info["error_details"]` (compiler crash, timeout, OOM); resident memory growing across episodes.

**Phase to address:** P1 (diagnose), P5 (require validation on final sequences).

---

### Pitfall 3: Building the project on `/mnt/c` with a path containing a space, with unbacked caches on a nearly full C: drive

**What goes wrong:**
The working directory is `/mnt/c/Users/rvsre/Documents/compiler project`. Code, venv, dataset caches and logs there hit 9P file-system latency (every CompilerGym service start, every `.ll` temp file, every checkpoint), unquoted shell scripts break on the space, and the WSL VHD (which grows and never shrinks on its own) lives on a C: with ~40 GB free. A second distro plus datasets plus checkpoints plus a venv is several GB; a runaway log or an accidentally downloaded `github-v0` (344 MB archive) or anghabench manifest set is easy to hit.

**Why it happens:**
It is the natural place to open a terminal, and Windows-side tools (editor, `.planning/`) live there.

**How to avoid:**
Keep the git repo, venv, `COMPILER_GYM_CACHE`/`COMPILER_GYM_SITE_DATA` (defaults `~/.local/cache/compiler_gym`, `~/.local/share/compiler_gym`) and all temp files on the **WSL ext4 filesystem** (e.g. `~/phase-order/`), use `/dev/shm` for the per-step `.ll` files given to IR2Vec, and copy only results (CSV, PNG) back to `/mnt/c/.../results` (or use VS Code Remote-WSL). Quote all paths. Download only the datasets you will use: cbench-v1 (5.4 MB bitcode + 253 MB runtime data), plus small ones such as npb-v0 (1.2 MB), mibench-v1, blas-v0 (3.8 MB), opencv-v0 (11 MB). Check `df -h /c` before long runs. Optionally create `C:\Users\rvsre\.wslconfig` with `[wsl2] memory=...` (default is capped at the 7.8 GB seen now) and apply with `wsl --shutdown`.
**Insurance against hosting disappearing:** the repo is archived and `dl.fbaipublicfiles.com` is Meta-hosted. After the first successful full run, tar the two CompilerGym directories and the pip wheelhouse (`pip download -d wheelhouse ... `) to a second location.

**Warning signs:**
`reset()` several times slower than the 1-3 s measured for small programs; "No space left on device"; scripts failing on `compiler`/`project` as two tokens; a `.vhdx` that keeps growing.

**Phase to address:** P1.

---

### Pitfall 4: Wrong baselines: -O3 as the size baseline, no -O2 in CompilerGym, and inconsistent counting

**What goes wrong:**
Three separate traps.
(a) CompilerGym provides **O0, O3 and Oz** baselines (observations `IrInstructionCountO0/O3/Oz`, reward spaces `...O3`, `...Oz`); **there is no -O2**. Review 1 promises `-O2`/`-O3`; -O2 must be produced separately.
(b) **-O3 is not a size optimizer.** Measured: qsort O3 = 1163 vs O0 = 638 (O3 *larger* than unoptimized), sha O3 = 789 vs O0 = 799. Beating -O3 on instruction count is therefore trivial on some programs and says nothing about phase-ordering skill. -Oz is the smallest on all 23 cBench programs (often by 20-40% vs O3).
(c) Counting a different way for the baseline than for the agent (e.g. `grep -c` on `.ll` text for -O2 versus CompilerGym's `IrInstructionCount` for the agent, or `ObjectTextSizeBytes` for one and instruction count for the other).

**Why it happens:**
The proposal text says `-O2`/`-O3`; the tool only gives O3/Oz; counting scripts get written ad hoc.

**How to avoid:**
Compute **-O2 with the same LLVM 10 `opt`** CompilerGym uses (`compiler_gym.third_party.llvm.opt_path()` per the source; or `~/.local/share/compiler_gym/llvm-v0/bin/opt`) on the O0 bitcode, then measure by loading the resulting bitcode back as a benchmark and reading `IrInstructionCount` — one counter for everything. Cross-check that your own `opt -O3`/`-Oz` counts equal the env's `IrInstructionCountO3/Oz` (confirms same pipeline). Report **O0, O2, O3, Oz and the agent** in every table, add Oz as the headline size reference (see Proposed Deviations D1), and state explicitly which metric (IR instruction count; optionally `.text` size via `ObjectTextSizeBytes`/`TextSizeBytes`) each number is. Never mix metrics in one column.

**Warning signs:**
Agent "beats -O3" by a lot while a 5-pass hand sequence also does; baseline columns derived from different scripts; O3 ratio > 1.0 vs O0 on any program (expected on some).

**Phase to address:** P2 (baselines table is also the 14 Oct fallback deliverable).

---

### Pitfall 5: Reward scaling blowups (especially with CompilerGym's built-in Oz/O3-normalized rewards)

**What goes wrong:**
Programs differ ~1700x in size (242 to 406k instructions). With raw `IrInstructionCount` reward, big programs dominate every gradient. With the built-in `IrInstructionCountOz`/`O3` rewards, the normalizer is `max(init_cost - baseline_cost, 1)`. For qsort that makes the **O3 reward's normalizer 1** (because O3 > O0), so one `-mem2reg` step yields a reward in the hundreds instead of ~0.9 (the Oz variant gave 0.904 for the same step). Rewards then vary by orders of magnitude between programs, and a policy-gradient run silently optimizes only a few programs.

**Why it happens:**
Reward spaces are chosen by name without looking at their definition; "normalized" is assumed to mean "bounded".

**How to avoid:**
Use `IrInstructionCountNorm` (step delta divided by the O0 count) or compute your own `(prev - cur) / O0_count`, giving episode return = fractional reduction vs O0, comparable across programs. Log reward min/max/std per program in P3 and assert `abs(step_reward) < 1` (or clip to [-1, 1] with a warning counter). For evaluation, report ratio to a baseline (`final / Oz`, `final / O2`), not raw deltas. Do not use `ObjectTextSizeBytes` as the training reward (requires an object compile each step; much slower); keep it for final reporting.

**Warning signs:**
Return histograms with a heavy tail; loss/gradient norm spikes; training curves that move only when one specific program is sampled; any |step reward| > 1.

**Phase to address:** P3 (reward wrapper), P5 (ratio-based reporting).

---

### Pitfall 6: IR2Vec latency and scale: the state blows the time budget and encodes program size instead of structure

**What goes wrong:**
Two issues, both measured.
(1) **Latency.** IR2Vec flow-aware on bzip2 took 42.7 s and ghostscript 47.9 s per call; jpeg/tiff/lame ~2-2.6 s; most small programs < 0.1 s. An episode of 25 steps recomputes the state 25 times, so mid-size programs cost ~1 min per episode and bzip2 ~18 min. `reset()` alone is 3-8 s on those and 44 s for ghostscript. A 2000-episode run on tiff-size programs is a day, not an hour.
(2) **Scale.** The program-level vector's L2 norm tracks instruction count (25.8 for a 35-line toy, ~600k for ghostscript). Fed raw to a network, the policy reads program size and the embedding of tiny edits is lost in the scale.

**Why it happens:**
IR2Vec is designed for offline embedding; the pip API takes a file path, so each step round-trips IR text through disk.

**How to avoid:**
- Normalize: divide the vector by instruction count (or L2-normalize), then optionally standardize with running mean/std computed on **training programs only**. Include log(instruction count) as a separate scalar feature if size information is wanted deliberately.
- Memoize embeddings by `IrSha1` (a CompilerGym observation); no-op steps and repeated states are frequent and then cost nothing.
- Write temp `.ll` files to `/dev/shm`, not `/mnt/c`.
- Time-box the training set to programs with roughly <= 15k IR instructions (bitcount, blowfish, crc32, dijkstra, patricia, qsort, sha, stringsearch(2), susan, gsm, adpcm, rijndael, ispell, plus small programs from npb/mibench/blas if used). Treat bzip2 and ghostscript as out of scope for training; consider evaluating on large programs only once at the end, if at all. Compare `sym` vs `fa` IR2Vec modes for speed in P3 (not measured here).
- Measure steps/second before designing the training budget (Pitfall 13).

**Warning signs:**
Wall-clock per episode > 10 s; CPU idle while one process embeds; embedding norms differing by 10^3 between programs; the policy's output depending mainly on a "size" direction (probe by shuffling program identity).

**Phase to address:** P3.

---

### Pitfall 7: Policy collapse to one pass or one fixed sequence; no-op loops

**What goes wrong:**
REINFORCE-style training with sparse positive signal quickly puts all probability on whichever pass paid off first (typically `-mem2reg`/`-sroa`/`-instcombine`), then repeats it: after the first application further applications do nothing (verified: second `-mem2reg` gives reward 0.0, `action_had_no_effect=True`). The episode burns its fixed length on no-ops and the policy gets zero gradient signal. A second form: the policy converges to **one fixed sequence for every program**, ignoring the IR2Vec state.

**Why it happens:**
Policy gradient without an entropy bonus or a good baseline has high variance and early determinism; with an action space containing many idempotent passes, a repeated action is a safe "zero".

**How to avoid:**
- Entropy bonus with a schedule (start high, anneal) and log policy entropy and top-1 action frequency every update; alarm if entropy < ~25% of initial or top-1 frequency > 60%.
- Mask the immediately repeated action (cheap, uses no expert knowledge), and use `info["action_had_no_effect"]` for diagnostics and, if desired, a small penalty or early termination after K consecutive no-ops.
- Choose and justify the episode design explicitly (fixed T such as 20-45 steps, optionally with a STOP action). Without STOP, the agent cannot end early and long episodes become no-op padding; with STOP, sparse-reward collapse (learning to stop immediately for reward 0) is a risk, so initialize STOP probability low.
- Use a per-program baseline (Pitfall 8). Start with REINFORCE + baseline; add PPO/A2C only if time allows.
- Add the "best single fixed sequence found by random search on the training set" as a comparison (Proposed Deviations D2). If the learned state-dependent policy does not beat that, the honest finding is that state adds nothing.

**Warning signs:**
Per-update entropy curve collapsing in the first ~50 updates; identical action sequences across different programs in the eval CSV; mean `action_had_no_effect` fraction > 50% of steps; return plateauing at the value of "apply mem2reg + a few passes".

**Phase to address:** P4 (diagnostics and entropy in the first training loop), P5 (failure-case analysis).

---

### Pitfall 8: High-variance policy gradient from program-dependent returns

**What goes wrong:**
A single global baseline (or none) means that "easy" programs (large possible reduction) always have positive advantage and hard ones negative regardless of action quality; the policy learns which program it is in, not which pass to pick. Training curves look noisy and then flat.

**Why it happens:**
Standard single-task REINFORCE recipes are copied to a multi-program setting.

**How to avoid:**
Subtract a baseline conditioned on the program (moving average keyed by benchmark URI, or a learned value function on the state), normalize advantages per batch, use reward-to-go, and sample a batch of programs per update. Use gamma = 1 with fixed-length episodes unless there is a reason not to (Pitfall 9). Learning rate small (1e-4-1e-3 range typical), gradient clipping on. Keep the network small; CPU is enough.

**Warning signs:**
Advantage mean per program far from zero; improvement only on the programs sampled most often; updates oscillating.

**Phase to address:** P4.

---

### Pitfall 9: A dense-vs-sparse reward comparison that is not actually a comparison

**What goes wrong:**
With reward defined as per-step instruction-count deltas and gamma = 1, the sum of dense rewards equals the sparse terminal reward (the sum telescopes). If both settings are trained with the same advantage/baseline machinery, differences come only from credit assignment and variance, and if the experiment is run with one seed, noise. Dense reward also penalizes **enabling passes** that temporarily grow code (inlining, unrolling, loop rotation) before cleanup passes shrink it, so a dense-reward agent is myopic and may avoid sequences that sparse reward would find. Conversely, sparse reward with 25+ steps and 124 (or even 20) actions rarely finds signal early and can show no learning at all.

**Why it happens:**
"Dense vs sparse" is treated as two reward functions to plug in, with different learning rates, budgets or normalization per setting.

**How to avoid:**
Define both up front in the eval protocol: dense = per-step normalized delta; sparse = 0 every step and the same normalized total at the last step; same gamma (1), same network, same hyperparameters, same environment-step budget, same seeds (>= 3), same training programs. Plot **return vs environment steps and vs wall-clock** and report final held-out ratio vs Oz for each seed. State the telescoping fact in the analysis so the claim is correct: the difference is learning speed/stability, not optimum. Report negative result honestly if sparse fails to learn within budget (that is a finding).

**Warning signs:**
Different hyperparameters in the two configs; only one seed; sparse curve flat at zero (expected; do not "fix" by changing its budget only).

**Phase to address:** P5.

---

### Pitfall 10: Overfitting to the training programs and leakage between train and test through near-duplicate programs

**What goes wrong:**
cBench-v1 has only 23 programs. A random split puts, for example, `tiff2bw` in train and `tiff2rgba` in test: they are 58-61k-instruction builds of the same library (as are `jpeg-c`/`jpeg-d`, and likely `stringsearch`/`stringsearch2`). The "held-out" result then measures memorization of one family. Also: hyperparameters tuned by looking at test results; best-checkpoint chosen on test; the same program set used for train and eval without a flag.

**Why it happens:**
Splitting by program name instead of by source family; small dataset pressure; no validation set.

**How to avoid:**
Split by **family**, not by file: tiff* together, jpeg-* together, stringsearch* together. Use **three** sets: train / validation (hyperparameter and checkpoint selection, early stopping) / test (touched once, at the end). With cBench alone this leaves a very small test set; strengthen the setup by training on programs from other bundled suites (npb-v0, mibench-v1, blas-v0, opencv-v0 are small downloads) and testing on cBench families (cross-suite generalization). Commit a `splits.json` (URIs + family tags + sha256 of the file) on day 2 and make every train/eval script load it; the eval script must `assert set(train) & set(test) == set()` and write a `split` column into every results CSV. Never read test numbers while developing.

**Warning signs:**
Held-out ratio nearly equal to training ratio on tiff/jpeg-like pairs while small unrelated programs lag; test programs present in any training log; a result CSV without a `split` column.

**Phase to address:** P2 (split + protocol), P4 (validation-based early stopping), P5.

---

### Pitfall 11: Skipping semantic validation and trusting passes that miscompile or are nondeterministic

**What goes wrong:**
An optimized module that is smaller is meaningless if it is wrong. CompilerGym's own history shows pass sequences that break programs: `-structurizecfg` caused validation failures on ghostscript and tiff2bw/tiff2rgba/tiffdither and was **removed from the action space** upstream (issue #103); `-gvn-sink` produced nondeterministic states (issue #46). Only **18 of 23** cBench programs have validators (adpcm, ispell, rijndael, lame, ghostscript do not: disabled for timeouts, memory errors or segfaults on the gold standard), and the other bundled suites have none ("only cbench-v1 is Partially validatable").

**Why it happens:**
Validation is slow and, in this environment, currently broken (Pitfall 2), so it is deferred and then forgotten.

**How to avoid:**
- Keep `-structurizecfg` and `-gvn-sink` out of the curated action set (verify the exact flag names against `env.action_space.flags`); prefer passes in the -Oz/-O2 pipelines.
- Run `env.validate()` on **final learned sequences for every validatable test program** (cBench 18) and report a "validated: yes/no/not available" column. Programs from non-validatable suites are reported as "unvalidated".
- If validation cannot be fixed (Pitfall 2), build a fallback check: run the optimized bitcode and the O0 bitcode with `lli` (in the LLVM tarball) on the benchmark's own sample inputs for the small programs and compare outputs; label it as a weaker check.
- Replay test: store every final action sequence in the CSV; in P6 replay all of them in a fresh environment and assert identical `IrInstructionCount` (catches nondeterminism).

**Warning signs:**
Reward from a particular pass appears and disappears for the same input; replay mismatch; validation errors on a specific pass in the learned sequences.

**Phase to address:** P3 (curate action set), P5 (validation run), P6 (replay check).

---

### Pitfall 12: Evaluation protocol that favors the agent or is silently different from training

**What goes wrong:**
- Giving the agent best-of-N stochastic rollouts per program while -O2/-O3/-Oz get one pipeline each (not like-for-like).
- Evaluating with the stochastic policy in one place and the greedy policy elsewhere.
- Averaging per-program percentages arithmetically instead of geometric mean of ratios; one program with a huge win hides several losses.
- Single-seed claims ("the agent beats -O3 by 12%") with an n = 5-7 test set.
- Cherry-picking: reporting the best seed, best checkpoint, or the subset of programs where it won.
- Declaring "beats -O3" using the unnormalized reward or the default CompilerGym leaderboard-style summary.

**Why it happens:**
Small project, strong wish for a positive result, no pre-registered protocol.

**How to avoid:**
Write `EVAL_PROTOCOL.md` **before** the first test-set evaluation (P2) and treat it as frozen: metric (IR instruction count, optionally .text size), baselines (O0, O2, O3, Oz), policy mode (greedy argmax, one rollout per program as headline; best-of-N sampling reported separately and labeled with N), episode length, checkpoint rule (best on validation), seeds (>= 3, preferably 5), aggregation (per-program table plus geometric mean of `final/baseline`, win/tie/loss counts vs each baseline), no statistical-significance language with n this small, and the full seed range shown (min/median/max). Publish all seeds, even bad ones. Keep failure programs in the tables.

**Warning signs:**
Headline number that is only produced by one config; tables with a single run per row; baselines recomputed after seeing the results; "we beat -O3" without saying O3 can be larger than O0.

**Phase to address:** P2 (protocol), P5 (execution).

---

### Pitfall 13: Building everything before getting any result (3-day then 10-day schedule)

**What goes wrong:**
Four components (env, IR2Vec bridge, policy, evaluation) are built in sequence and first integrated on day 3; install trouble (Pitfall 1-2) eats the first two days; there is nothing to show on 14 Oct and nothing to debug the RL with. Real time left today (11 Oct, ~21:00 IST by server timestamps) is roughly 2.5 working days to 14 Oct.

**Why it happens:**
Natural bottom-up ordering; underestimating CompilerGym's install cost; no early baseline.

**How to avoid (suggested sequencing for the roadmap):**
- **11 Oct (rest of today):** P1 only. Hard 3-4 hour box for the smoke test script (Pitfall 2). Then immediately produce the **O0/O2/O3/Oz baseline table on all cBench programs** (small programs take seconds; bzip2/ghostscript optional). That table is already a real, labeled-preliminary 14 Oct deliverable.
- **12 Oct:** P3 + first P4 slice: env wrapper with normalized reward, memoized IR2Vec state, **random-policy rollouts** (sanity check of the whole pipeline and a baseline), then REINFORCE overfit test on 2-3 tiny programs (bitcount, crc32, sha). If it cannot overfit 3 programs, the code is wrong; fix before scaling.
- **13 Oct:** train on a small train set (<= ~10 programs, short episodes), 3 seeds, short budget; evaluate on the validation split, produce a preliminary table and 2-3 screenshots; write the design/MDP content; **label everything PRELIMINARY**.
- **14 Oct:** freeze preliminary artifacts into `results/prelim_*`; do not touch.
- **15-19 Oct:** full runs (more programs, more steps), dense vs sparse, ablations, failure analysis. **20 Oct:** no new experiments; export CSV/plots/screenshots, replay check, README/setup steps. 21 Oct: submit.
- Measure episode time and steps/sec on day 2 and size the training budget from that; do not guess.

**Warning signs:**
No numbers by end of 12 Oct; any time spent on a second algorithm, extra datasets or GPU tuning before a baseline plus a random-policy result exists; a notebook-only workflow without scripts and configs.

**Phase to address:** Roadmap structure itself; P1-P4.

---

### Pitfall 14: Presenting preliminary results as final (honesty and reporting)

**What goes wrong:**
The 14 Oct numbers (a few minutes of training, few seeds, validation-split) end up in the 21 Oct document unchanged, or are described as "the agent's performance". Screenshots show a run that is not the one the table reports. The agent loses to Oz or O3 on most programs and the write-up is softened. Baseline-only results are phrased as "agent results".

**Why it happens:**
Pressure, reuse of slides, and no mechanical separation between preliminary and final artifacts. PROJECT.md's own Core Value says to report honestly even when the agent does not win.

**How to avoid:**
Every results file and figure carries `run_id`, git commit, config hash, split, seed, date and a `status` of `PRELIMINARY` or `FINAL`; filenames start with `prelim_` or `final_`. The 14 Oct document states budget (programs, episodes, seeds, wall-clock) next to each number. Final results are produced by re-running from scratch with the frozen protocol, not by editing preliminary files. Screenshots come from the same run that generated the reported CSV (put the `run_id` in the terminal prompt or command). If the agent does not beat Oz/O2/O3 on held-out programs, the conclusion says so and the failure analysis explains why (Pitfall 7, 9, 10).

**Warning signs:**
Numbers in a document not traceable to a CSV row; words like "outperforms" without baselines in the same table; missing seeds/budget statement.

**Phase to address:** P2 (protocol and naming), P4 (prelim labeling), P6 (final export).

---

## Moderate Pitfalls

### Pitfall 15: Gym API / library mismatch with modern RL libraries
**What goes wrong:** CompilerGym uses the old Gym API (`reset()` returns obs; `step()` returns `(obs, reward, done, info)`). Gymnasium-based libraries (Stable-Baselines3 2.x, CleanRL recent versions) expect 5-tuples and `terminated/truncated`; using them with gym 0.21 gives confusing shape/API errors, and installing them can upgrade numpy and break CompilerGym.
**Prevention:** Write the policy-gradient loop yourself in PyTorch (REINFORCE + baseline is ~100 lines and gives full control of diagnostics) and wrap the env in a thin class owned by the project. If a library is wanted, use a pre-gymnasium version under the constraints file and test the import first. The observation from the wrapper should be a plain `np.float32` vector.
**Phase:** P3/P4.

### Pitfall 16: Action-space curation done by looking at results
**What goes wrong:** The curated subset (Review 1: "curated pass subset") is selected by trying passes on the test programs, or by dropping passes that "never help" after seeing evaluation results. This leaks test information. Also easy to include analysis-only or debug passes that never change the IR (wasting capacity) or passes that can bloat code.
**Prevention:** Decide the subset **before** any training result, from an a-priori source (e.g. the pass lists of -Oz/-O2, POSET-RL-style Oz sub-sequences) and document why; optionally prune using training-set statistics only. Record the final list (names validated against `env.action_space.flags`) in the config. Typical sizes of 15-30 passes keep sampling tractable. Keep at least the enabling passes (mem2reg/sroa, instcombine, simplifycfg, inline, gvn/early-cse, dce/adce, sccp, licm, loop passes) because O0 IR starts full of allocas.
**Phase:** P3.

### Pitfall 17: State that cannot distinguish time or history (non-Markov)
**What goes wrong:** The IR2Vec vector after a pass often barely changes (the embedding is a coarse summary), so the policy sees nearly the same state at step 1 and step 20 and cannot learn "stop doing X" or ordering dependence. AutoPhase-style work augments state with an action histogram.
**Prevention:** At minimum track and log state-change magnitude per step; if the policy cannot learn, add the step index and/or a multi-hot of applied passes to the input. That is a change to the Review 1 state definition, so it is listed under Proposed Deviations (D3) rather than done silently.
**Phase:** P3/P4.

### Pitfall 18: Memory and process explosion from parallel environments
**What goes wrong:** Each `llvm-v0` env owns a compiler-service process; 8-16 envs on WSL2's default 7.8 GB with large IR (jpeg/tiff programs have ~4 MB IR strings, ghostscript ~28 MB) leads to OOM kills of services (`done=True` with error details) and corrupted statistics (episodes that ended by crash are counted as zero reward).
**Prevention:** Start with 1 env, then at most 3-4 worker processes; `torch.set_num_threads(1)` per worker; treat any `info["error_details"]` episode as invalid and excluded and counted in a log; restart envs periodically. Pin the GPU question: the policy network is tiny, run on CPU.
**Phase:** P4.

### Pitfall 19: Not recording enough to reproduce or analyze
**What goes wrong:** Only the final ratio is saved; failure-case analysis (required by Review 1) needs the action sequences, per-step rewards, entropy, and programs that failed.
**Prevention:** Log per episode: program, split, seed, action sequence, per-step IR counts, total return, no-op count, wall-clock, git commit. One CSV row per (run_id, program, policy, seed). Save checkpoints per seed.
**Phase:** P3/P4, P6.

### Pitfall 20: Execution-time comparison treated as equal in rigor to size
**What goes wrong:** Review 1's secondary runtime metric is measured on a noisy laptop (WSL2, thermal throttling, other processes) with one run; the "speedup" is noise. CompilerGym's `Runtime` observation exists but is marked experimental, and 5 cBench programs have no runnable validation.
**Prevention:** Only on a subset of small, runnable cBench programs; pin CPU frequency expectations (close other apps), run >= 30 repetitions, report median and spread, report as secondary and say static size/instruction count is primary. If it is not stable, state that and skip.
**Phase:** P5 (optional).

---

## Minor Pitfalls

### Pitfall 21: README/documentation drift for IR2Vec
**What goes wrong:** The IR2Vec GitHub README (main branch targeting LLVM 20) documents `initEmbedding(file, mode, level, dim=300, ...)`, the PyPI 2.1.1 wheel takes only `(file, mode, level)`. Copy-pasted examples fail with `TypeError: Invalid Arguments`.
**Prevention:** Read `ir2vec/__init__.py` of the installed wheel; keep a 10-line wrapper function with a unit test (embed a tiny `.ll`, assert shape (300,)). Pin `ir2vec==2.1.1`.

### Pitfall 22: Counting episodes that end early by crash as successes
**What goes wrong:** `step()` returns `done=True` on service crash, timeout or OOM (`info["error_details"]`); naive loops treat it as normal termination.
**Prevention:** Check `info.get("error_details")`; drop such episodes from stats and log them.

### Pitfall 23: Reset cost hidden in training budget
**What goes wrong:** `reset()` takes 3-8 s on mid-size programs (44 s on ghostscript) and dominates a short episode; iterating over datasets with `env.datasets.benchmarks()` on large suites is slow.
**Prevention:** Keep a small fixed list of URIs in `splits.json`; measure reset share of wall-clock; prefer more updates on small programs.

### Pitfall 24: Mixing the O0 reference
**What goes wrong:** Some benchmarks (user-made via `make_benchmark`) compiled at -O0 carry `optnone` attributes that make passes skip functions; the agent then "cannot improve" anything.
**Prevention:** Stay on bundled datasets (built without optnone); if you add custom C programs, compile with `-Xclang -disable-O0-optnone`.

### Pitfall 25: Plot and table hygiene
**What goes wrong:** Learning curves averaged over one seed with a smoothing window that hides collapse; y-axis in raw instructions across programs of different size; plots without baselines.
**Prevention:** Plot normalized return, mean and min-max band over seeds, horizontal lines for O2/O3/Oz, same axes for dense and sparse.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Install into system Python / newest Ubuntu | None (it fails) | Lost day, irreproducible setup | Never |
| Hard-coding paths to `/mnt/c/...` for venv, caches or temp files | Quick start | Slow IO, breaks on space in path, not reproducible | Never for caches/venv; fine for final result copy |
| Notebook-only experiments | Fast iteration | Unreproducible, no configs/seeds; hard to export CSV | Only for plotting from CSV |
| Raw `IrInstructionCount` reward | No wrapper needed | Size-dominated gradients (Pitfall 5) | Never for multi-program training |
| Single seed for first 14 Oct run | Fast | Cannot say anything about noise | OK for 13 Oct smoke run if labeled "single seed, preliminary" |
| Skipping validation on non-cBench programs | No extra work | Unverified correctness | OK if disclosed in a `validated` column |
| Training only on cBench | One dataset | Tiny, correlated sets; leakage | Only for the 14 Oct preliminary run |
| Using CompilerGym's own `-O3` reward space | Zero code | Exploding rewards where O3 > O0 | Never |
| Writing a custom algorithm library vs using SB3 | Own loop is ~100 lines | Need own diagnostics | Preferred here (Pitfall 15) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| CompilerGym <-> pip/setuptools | `pip install compiler_gym` with current pip/uv | `pip==23.3.2`, `setuptools==65.5.0`, `wheel==0.38.4`, `--no-build-isolation gym==0.21.0`, then compiler_gym; pin numpy 1.23.5, pydantic<2 |
| CompilerGym <-> LLVM 10 binaries | Assume system libs suffice | Provide real `libtinfo.so.5` (Ubuntu 22.04 package); `LD_LIBRARY_PATH` for all launched processes |
| CompilerGym <-> datasets | Let first `reset()` trigger big downloads | Pre-fetch specific datasets; set `COMPILER_GYM_CACHE`/`COMPILER_GYM_SITE_DATA` to ext4; keep a backup of the dirs |
| CompilerGym <-> reward spaces | Use `IrInstructionCountO3/Oz` raw | Use `IrInstructionCountNorm` or custom `(prev-cur)/O0` (Pitfall 5) |
| CompilerGym <-> IR2Vec | Expect an `Ir2vec` observation | Read `env.observation["Ir"]`, write `.ll` to `/dev/shm`, `ir2vec.initEmbedding(path, "fa", "p")`, memoize by `IrSha1` |
| IR2Vec <-> numpy | Let pip pull numpy 2 | Constraints file pinning 1.23.5 (ir2vec worked with 1.23.5 and 2.2.6, CompilerGym only with <2) |
| CompilerGym <-> gym API | Use gymnasium-era RL libs | Own loop; old 4-tuple `step` |
| Validation | Assume `env.validate()` works | Test it in P1; fallback with `lli` output comparison |
| Baselines | Expect `-O2` | Run the bundled `opt -O2` on O0 bitcode and count through the same environment counter |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| IR2Vec on large IR | 40+ s per state | Exclude bzip2/ghostscript from training; memoize by `IrSha1`; try `sym` mode | > ~15k instructions for training; bzip2 (28.7k) already 42 s |
| `reset()` cost | Episodes dominated by reset | Small fixed training set; keep env alive | jpeg/tiff/lame/ghostscript (7-44 s) |
| `/mnt/c` temp files | Step latency 5-10x worse | `/dev/shm` for temp `.ll` | any |
| Too many env processes | OOM kills, `done=True` | <= 3-4 workers on 7.8 GB | > ~6 envs with mid-size programs |
| Full training set of 25-step episodes with 124 actions | Sparse signal, slow learning | Curated 15-30 passes; shorter T | 124 actions with sparse reward |
| ObjectTextSize reward in training | 10x slower steps | Use IR count for training; `.text` size only in final reporting | any |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Running downloaded benchmark binaries outside CompilerGym's validator, or generated C (Csmith) without sandbox | Executes arbitrary compiled code | Only run via CompilerGym validation; no root; keep to bundled suites |
| `torch.load`/pickle of checkpoints from other people | Code execution | Only load your own checkpoints; use `weights_only=True` where available |
| Unpinned downloads from a Meta bucket after archive | Silent change/disappearance | CompilerGym checks SHA-256 of tarballs; keep backups of caches |
| `sudo pip` / installing over system Python | Breaks WSL | Always use a venv |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Demo screenshots of a notebook with no run id | Cannot be traced to results; reviewer doubts | Terminal output with run_id, git commit, split and table matching CSV |
| Screenshots of random or untrained policy as "learned" | Dishonest by accident | Screenshot labels policy type |
| Tables with raw instruction counts only | No sense of improvement | Ratio vs O0/O2/O3/Oz plus counts |
| One setup instruction in the head of the author | Evaluators cannot reproduce | `SETUP.md` with the pinned recipe and a `smoke_test.py` |

## "Looks Done But Isn't" Checklist

- [ ] **Environment:** `import compiler_gym` works but `env.validate()` fails, no libtinfo5 recipe written down — verify `smoke_test.py` passes from a fresh venv, including `validate()`.
- [ ] **Baselines:** only O3/Oz present, no O2 — verify O2 column exists, was produced through the same counter, and O3/Oz match the env's observations.
- [ ] **Split:** random file-level split — verify family-level split, `splits.json` committed, assert in eval script, `split` column in every CSV.
- [ ] **Training:** reward goes up on average — verify per-program reward, entropy curve, top-1 action frequency, no-op fraction, and that the policy beats the fixed best-sequence and random-sequence baselines.
- [ ] **Dense vs sparse:** both ran — verify same gamma/budget/seeds/hyperparameters and >= 3 seeds each.
- [ ] **Evaluation:** "beats -O3" — verify against Oz and O2 too, greedy single rollout, geometric mean, win/tie/loss per program, all seeds shown.
- [ ] **Correctness:** sequences were measured — verify validation (or fallback check) on final sequences and replay reproduces counts.
- [ ] **Early results:** numbers exist — verify labeled PRELIMINARY with budget, seeds and split stated.
- [ ] **Exports:** plots exist — verify machine-readable CSV with run_id/commit/config for every number.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CompilerGym install fails after the 3-4 h box | HIGH | Try Ubuntu 22.04 distro; if still failing, ask the user to approve D5 (driving LLVM 10 `opt` directly using the same tarball); do not decide silently |
| `validate()` stays broken | MEDIUM | `lli` output comparison on small programs; disclose in report |
| Policy collapse | LOW | Raise entropy coefficient, add repeat mask, reduce lr, per-program baseline, fewer passes |
| No learning in sparse mode | LOW | Report as result; extend budget equally for both only if time and doing so for both |
| Leakage discovered late | HIGH | Re-split by family, retrain (budget at least a day for it), so check on 15 Oct, not 20 Oct |
| Preliminary numbers already circulated as final | MEDIUM | Correct explicitly in final document, show prelim vs final table |
| Dataset hosting disappears | MEDIUM | Restore from backed-up cache directories |
| C: disk fills | MEDIUM | `wsl --shutdown`, compact VHD (`Optimize-VHD`), delete download cache tarballs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Wrong Python/Ubuntu, dep pins | P1 | `smoke_test.py` passes from fresh venv; `constraints.txt` committed |
| 2 Import != working (validate, leaks) | P1 (diagnose), P5 | `env.validate()` passes on qsort, or fallback documented |
| 3 `/mnt/c`, space in path, disk | P1 | Repo/venv/caches under `~`; cache backup exists |
| 4 Baselines (no O2, O3 != size) | P2 | Table with O0/O2/O3/Oz from one counter |
| 5 Reward scaling | P3 | Logged per-program reward ranges; |step reward| <= 1 |
| 6 IR2Vec latency/scale | P3 | Normalized, memoized state; measured steps/s; program size cap |
| 7 Policy collapse/no-ops | P4 | Entropy and top-1 plots; no-op fraction logged |
| 8 Variance, baselines | P4 | Per-program baseline implemented; overfit test on 3 programs passes |
| 9 Dense vs sparse validity | P5 | Config diff between runs only the reward |
| 10 Overfit/leakage | P2, P4 | Family-level `splits.json`; assert in eval; validation early stopping |
| 11 Semantic validation | P3, P5, P6 | Validated column; replay reproduces counts |
| 12 Evaluation protocol | P2 (freeze), P5 | `EVAL_PROTOCOL.md` dated before first test eval |
| 13 Schedule | Roadmap | Baseline table by 11-12 Oct; random policy + overfit by 12 Oct; prelim by 13 Oct |
| 14 Prelim vs final | P2, P4, P6 | `status` column; `prelim_` vs `final_` files |
| 15 Gym API mismatch | P3 | Own training loop; imports checked under constraints |
| 16 Action-set curation | P3 | List and rationale committed before training |
| 17 Non-Markov state | P3, P4 | State-change magnitude logged; D3 decision |
| 18 Memory/processes | P4 | Worker count <= 4; crash episodes excluded |
| 19 Logging | P3, P4, P6 | One-row-per-episode CSV with sequences |
| 20 Runtime metric noise | P5 | >= 30 reps, median, flagged secondary |

---

## PROPOSED DEVIATIONS FROM REVIEW 1 (for user approval; none applied)

Nothing here has been adopted. Each item is a suggestion for the user to approve or reject. Items D1-D3 are additive to Review 1; D5 would change a committed dependency and is only a contingency.

| ID | Proposal | Why (evidence) | Cost | Default if not approved |
|----|----------|----------------|------|-------------------------|
| D1 | Add **-Oz** as a third reference alongside -O2/-O3 in all result tables (O0, O2, O3, Oz) | CompilerGym itself provides Oz as the size baseline; measured O3 > O0 on qsort and equal on sha, Oz smallest on all 23 cBench programs; "beats -O3 on code size" is a weak claim | Near zero (observation already exists) | Report O2/O3 only, with a footnote about O3 size inflation and the O3-vs-O0 numbers |
| D2 | Add two sanity baselines: (a) random pass sequences with the same episode length and budget, (b) the best single fixed sequence found by random search on the training set and applied to every program | Needed to show that learning (and state dependence) contributes anything; not a "learned system", so consistent with the out-of-scope rule on reimplementing other systems | Low (a few hours of compute) | Omit; claims about learning are then weaker |
| D3 | Augment the IR2Vec state with step index and/or a multi-hot of applied passes | IR2Vec of a partly optimized module changes little per pass, so the state is nearly non-Markov (AutoPhase uses an action histogram) | Low | Pure IR2Vec state as in Review 1; document the limitation in failure analysis |
| D4 | Training on additional bundled suites (npb-v0, mibench-v1, blas-v0, opencv-v0) while keeping cBench families as the held-out test | cBench has 23 programs with near-duplicate families; a meaningful held-out test needs more training programs | Medium (download + small-program filter) | cBench-only family split (small test set) |
| D5 | **Contingency only:** if CompilerGym cannot be made to work within the P1 time box, drive the LLVM 10 `opt` binaries directly in a thin custom environment (same MDP, same IR2Vec, same rewards) | The LLVM 10 tools in the CompilerGym tarball run standalone with libtinfo5; but it drops crash safeguards, datasets and the Gym API Review 1 commits to | High | Stay on CompilerGym; fall back to baselines + design for 14 Oct |

Not deviations (inside Review 1's scope; listed so the roadmap does not treat them as changes): choice of REINFORCE + baseline vs PPO/A2C, fixed-length episodes with or without STOP, IR2Vec `fa` vs `sym`, exclusion of bzip2/ghostscript from training, using `IrInstructionCount` as the training reward and also reporting `.text` size.

## Sources

- CompilerGym repository, archived 2026-05-27 (GitHub page); `INSTALL.md`; `compiler_gym/requirements.txt` (gym<=0.21, grpcio<1.44, protobuf<4.21); `CHANGELOG.md` (v0.2.5, 2022-11-01); PyPI JSON for `compiler-gym` (wheel `py3-none-manylinux2014_x86_64`) — HIGH.
- CompilerGym source: `compiler_gym/third_party/llvm/__init__.py` (LLVM tarball download, `opt_path()`), `envs/llvm/datasets/__init__.py`, `envs/llvm/datasets/cbench.py` (validator list and disabled benchmarks), `envs/llvm/llvm_rewards.py` (`BaselineImprovementNormalizedReward` normalizer `max(init - baseline, 1)`) — HIGH.
- CompilerGym docs: LLVM environment page (reward spaces, observation spaces, 123-124 passes, datasets, "only cBench partially validatable"), FAQ (cache dirs, env vars, `done` on unrecoverable errors) — HIGH.
- CompilerGym issues: #696 (protobuf >= 4.21 incompatible), #771 (numpy pin conflict in requirements), #103 (`-structurizecfg` validation failures, pass removed), #46 (`-gvn-sink` nondeterministic states) — MEDIUM (read via GitHub issue pages).
- IR2Vec GitHub README (per-LLVM-version branches, API as documented on main) and PyPI JSON for `ir2vec` 2.1.1 (cp36-cp311 wheels) — HIGH; installed wheel source `core.cpp` (3-argument `initEmbedding`) — HIGH.
- gym 0.21 install failure with modern setuptools/wheel (SPEAR issue and gym PR #3239 about the `opencv-python>=3.` specifier) — MEDIUM, and reproduced locally.
- Direct measurements on the user's WSL2 on 2026-10-11 (tables above): HIGH for what was measured; the `validate()` root cause remains UNKNOWN.
- RL-specific pitfalls (entropy collapse, baselines, telescoping reward, split leakage, reporting practice): established practice, MEDIUM; not verified against this project's code. Original-paper results (AutoPhase, POSET-RL, MLGO, Mammadli et al.) from PROJECT.md summaries only; not re-verified.

---
*Pitfalls research for: RL-guided LLVM phase ordering (CompilerGym + IR2Vec + policy gradient) on WSL2*
*Researched: 2026-10-11*
