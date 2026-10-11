<!-- GSD:project-start source:PROJECT.md -->

## Project

**RL-Guided Compiler Phase Ordering**

A Compiler Design course project (VIT) that trains a reinforcement learning agent to choose a program-specific sequence of LLVM optimization passes, and tests whether that learned sequence beats LLVM's fixed `-O2`/`-O3` pipelines on code size. It uses CompilerGym as the environment, IR2Vec embeddings of the LLVM IR as the state, and a policy-gradient algorithm for learning. The deliverable is a small, correctly scoped, reproducible replication of the full-sequence phase-ordering formulation, with a train/held-out split to test generalization, reported honestly whether or not the agent wins. Team of three: Aryan V Sangai, Nikhila Abdul Salam, Raj Vardhan Singh.

**Core Value:** Produce real, reproducible, honestly reported numbers comparing a learned pass-ordering policy against `-O2`/`-O3` on programs the agent was not trained on — even if the agent does not win.

### Constraints

- **Timeline**: 14 Oct 2026 (Assessment 9) and 21 Oct 2026 (Assessment 10) — fixed course deadlines; 3 days to the first, 10 days to the second
- **Platform**: Windows 11 host, experiments run in WSL2 — CompilerGym does not run natively on Windows
- **Compute**: single laptop (RTX 3060 Laptop GPU, CPU-first training) — limits action-space size, benchmark count and training budget
- **Scope**: bounded to one semester, curated pass subset, subset of standard benchmark suites (e.g. those bundled with CompilerGym) — keeps the search space tractable
- **Dependencies**: CompilerGym (LLVM environment) and IR2Vec — committed to in the Review 1 document; changing either requires an explicit decision
- **Change control**: research may propose revamping or improvising on the Review 1 topic/approach (e.g. a different environment, algorithm, or action space) if that is clearly better or if the original proves infeasible — but any such change must first be explained to the user (what it is and why) and approved before it is adopted
- **Integrity**: report measured results honestly, including cases where the agent does not beat `-O2`/`-O3` — this is the stated aim of the project; no tuning of the evaluation to force a win

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Headline Findings (read first)

## Recommended Stack

### Core Technologies

| Technology | Version (pin) | Purpose | Why Recommended | Confidence |
|------------|---------------|---------|-----------------|------------|
| Python | **3.10.x** (verified 3.10.22, via `uv`) | Interpreter | The only version in the intersection of all constraints. CompilerGym 0.2.5 classifiers go up to 3.10. `ir2vec` 2.1.1 wheels exist for cp36 to cp311 only. `grpcio<1.44` is pinned by CompilerGym. The user's system Python (3.14) is unusable. | HIGH |
| uv | latest (0.13.0 used) | Fetches a standalone Python 3.10 and makes the venv | No sudo, no deadsnakes PPA, no conda. Works on Ubuntu 26.04 where distro Python is 3.14. | HIGH |
| compiler_gym | **0.2.5** | LLVM phase-ordering environment (`llvm-v0`), datasets, reward spaces | Committed in Review 1. Wheel is `py3-none-manylinux2014_x86_64` (Linux x86_64 and macOS 10.15 x86_64 only, no Windows). Bundles **LLVM 10.0.0** (confirmed with the bundled `opt --version`). 124 flags in the action space. | HIGH |
| gym | **0.21.0** | Env API | Required by CompilerGym (`gym<=0.21,>=0.18`). Old API: `reset()` returns obs, `step()` returns `(obs, r, done, info)`. | HIGH |
| ir2vec | **2.1.1** (2024-01-11, latest) | State embedding | Wheel is `cp36..cp311 manylinux_2_17_x86_64` and the pretrained seed vocabulary is bundled in the wheel (`seedEmbeddingVocab.txt`). Built against LLVM 16.0.1 but reads CompilerGym's LLVM-10 IR text and bitcode without error. 300-dimensional flow-aware (`fa`) program vector. | HIGH |
| PyTorch | **2.5.1+cpu** | Policy networks | Needs `torch>=1.11` for SB3 1.8.0, works with numpy 1.23.5 and Python 3.10. The CPU wheel is about 200 MB vs about 2.5 GB for CUDA. The IR2Vec policy is tiny and env stepping dominates runtime, so a GPU gains nothing. | HIGH (CPU), MEDIUM (GPU) |
| stable-baselines3 | **1.8.0** (2023-04-08) | PPO / A2C | The last release that depends on `gym==0.21`. Tested: `PPO("MlpPolicy", env)` and `A2C` both `learn()` on a CompilerGym+IR2Vec wrapper env. | HIGH |

### Verified Dependency Lock

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sb3-contrib | 1.8.0 | TRPO, RecurrentPPO | Only if plain PPO underperforms. It pins `stable-baselines3<2.0,>=1.8.0`. |
| pandas, matplotlib | pulled in by SB3 (2.3.3 / 3.10.9) | CSV results, plots | Always. Required deliverable: CSV, tables, plots. |
| tensorboard | >=2.9.1 | Training curves | Optional. Not tested here. |
| tqdm / rich | latest | Progress bars | Optional. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Bundled `opt` (LLVM 10.0.0) | `-O0/-O1/-O2/-O3/-Oz` baselines outside the service | At `$COMPILER_GYM_SITE_DATA/llvm-v0/bin/opt` (default site data is `~/.local/share/compiler_gym`). It also needs `libtinfo.so.5` on `LD_LIBRARY_PATH`. |
| `CompilerEnv.validate()` / `Benchmark.from_file` | Semantic validation, and loading optimized bitcode back in to count instructions | `from_file` verified. `validate()` not exercised. |

## Installation (WSL2, Ubuntu 26.04 or 24.04, no sudo required)

# 1. uv (standalone Python manager)

# 2. Python 3.10 venv, seeded with pip

# 3. Pin the build tools BEFORE gym. gym 0.21's setup.py is rejected by modern setuptools

#    ("'extras_require' must be a dictionary...", CompilerGym issue #833).

# 4. gym 0.21 must be built WITHOUT build isolation (isolation pulls the latest setuptools and fails)

# 5. numpy pin, then CompilerGym (brings grpcio 1.43.0 and protobuf 3.20.3)

# 6. IR2Vec (self-contained wheel, vocabulary included)

# 7. libtinfo.so.5 for the bundled LLVM-10 binaries, extracted into a private dir.

#    Ubuntu 24.04+ has no libtinfo5 package. Without this, make("llvm-v0") fails with returncode 127.

# 8. PyTorch CPU wheel, then SB3 (1.8.0 requires gym==0.21, already satisfied)

# 9. Archive the exact wheels (the CompilerGym repo is archived; PyPI could change)

### Smoke test

### Measured numbers worth planning around (this laptop, CPU)

- One `step()` plus a full IR2Vec embedding (text IR to temp file to vector): **about 13 ms** on average. That is roughly 75 steps/s per env, or about 100k steps in 20 minutes on one env. A 10-step episode costs about 0.13 s.
- IR2Vec on `.ll` text and on the `BitcodeFile` path gave identical vectors (max abs diff 0.0). Bitcode was verified at reset time only. Use the text `Ir` route, which was verified after steps.
- IR2Vec program vectors are **unnormalized sums**: L2 norm about 559 for qsort at `-O0`. Normalize before feeding a network, and append a size feature such as `log(instruction_count / O0_count)`. An L2-normalized vector alone discards program size, which is the reward signal.
- WSL has about 8 GB RAM, and the LLVM service uses `/dev/shm` (RAM). Large programs such as ghostscript (about 400k instructions) take about 1 GB per service. Keep parallel envs to about 4 or fewer.

## Benchmark Datasets (all hosted at `dl.fbaipublicfiles.com/compiler_gym/`)

| Dataset | Size / count | Status verified 2026-10-11 |
|---------|--------------|----------------------------|
| `benchmark://cbench-v1` | **23 programs**, 5.5 MB tar, plus 253 MB runtime data (needed for execution and validation) | **Installed and used.** Programs: adpcm, bitcount, blowfish, bzip2, crc32, dijkstra, ghostscript, gsm, ispell, jpeg-c, jpeg-d, lame, patricia, qsort, rijndael, sha, stringsearch, stringsearch2, susan, tiff2bw, tiff2rgba, tiffdither, tiffmedian. |
| `benchmark://chstone-v0` | 12 programs (per CompilerGym docs) | Built on first use from a GitHub tarball (`patmos_HLS` commit e62d878) using the bundled clang. **Not run here**, MEDIUM. Needs internet access to github.com. |
| `benchmark://npb-v0`, `blas-v0`, `opencv-v0`, `mibench-v1` | 1.2 MB, 3.8 MB, 11 MB, 60 KB tars | URLs return HTTP 200. Not installed. Check `ds.size` after install, since `mibench-v1`'s 60 KB tar suggests it is small. |
| `tensorflow-v0`, `linux-v0`, `github-v0` | 100 MB, 290 MB, 344 MB | URLs live. Too large and slow for this project. |
| `anghabench-v1`, `poj104-v1`, `csmith`, `llvm-stress` | Large or generated | Not needed. `poj104-v1` is a `.tar.gz` (a `.bz2` guess returns 403). |

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SB3 1.8.0 PPO (primary) | Hand-written PyTorch REINFORCE with baseline (about 100 lines) | Add it as a second algorithm if the team wants an explicit "vanilla policy gradient" next to PPO, or needs full control of the dense-vs-sparse reward experiment. No dependency risk. |
| SB3 1.8.0 PPO | A2C (same package) | Cheaper per update, useful as a quick comparison. Tested working. |
| uv + standalone Python 3.10 | Ubuntu-22.04 WSL distro + `apt install libtinfo5` | If the user prefers system packages. Both work. |
| CPU torch | `torch==2.5.1` from `https://download.pytorch.org/whl/cu121` (wheel exists) | Only if a larger policy or batch makes the GPU worth it. Windows driver 572.42 already exposes the RTX 3060 inside WSL (`nvidia-smi` works). Install **only** the Windows driver, never a Linux NVIDIA driver in WSL, and no CUDA toolkit is needed for pip wheels. GPU not tested here. |
| IR2Vec `fa` program vector | IR2Vec `sym` mode, Autophase (56-d, built into CompilerGym) | `sym` is cheaper but less informative. Autophase is the zero-risk fallback state if IR2Vec ever fails (it did not). |
| Python IR2Vec wheel | Building IR2Vec from source against LLVM 10 (branch `llvm10`) | Only if the wheel mis-parses some IR. 23/23 cBench passed, so there is no need. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| System Python 3.12 / 3.14 (the user's distro default is 3.14.4) | No `ir2vec` wheel past cp311, and CompilerGym pins `grpcio<1.44`, which has no wheel for newer Pythons | uv-managed Python 3.10 |
| Unpinned `pip install compiler_gym` | Fails building `gym==0.21` (`extras_require` error; CompilerGym issues #833 and #796, still open, repo archived) | Steps 3 to 5 of the recipe |
| `gymnasium`, SB3 >=2.0 directly on CompilerGym | CompilerGym is built on gym 0.21's API (4-tuple step) | SB3 1.8.0 |
| `cleanrl` as a pip dependency | Pins `gym==0.23.1`, `stable-baselines3==1.2.0`, `python<3.11`, and old `wandb`, which conflicts with the stack above | Copy its single-file PPO idea manually into your own code if wanted |
| RLlib / Ray | Needs gymnasium in current versions, and CompilerGym's bundled RLlib examples target an old Ray (not verified here, MEDIUM) | SB3 or custom PyTorch |
| numpy >=1.24 or 2.x | Untested with gym 0.21 and CompilerGym 0.2.5; 1.23.5 is the verified pin | `numpy==1.23.5` |
| Building CompilerGym from source (Bazel/CMake, LLVM 10 build) | Hours of build and a heavy toolchain, with nothing to gain over the PyPI wheel | The PyPI wheel |
| Native Windows install | No Windows wheels exist (macOS and manylinux x86_64 only) | WSL2 |
| Linux NVIDIA driver or full `cuda` apt metapackage inside WSL | NVIDIA's WSL guide warns it can overwrite the mapped Windows driver | Windows driver only; pip torch wheels bring their own CUDA runtime |
| `/mnt/c` for the venv, datasets or site-data | Very slow small-file I/O | WSL home directory |

## Stack Patterns by Variant

- Use the exact recipe above, including the private `libtinfo.so.5` extraction.
- Because there is no libtinfo5 package for 24.04 and later, and the bundled `compiler_gym-llvm-service`, `opt` and `clang` link against it.
- Use `wsl --install -d Ubuntu-22.04`, then `sudo apt install libtinfo5 python3.10-venv`.
- Because it removes both the Python and libtinfo workarounds. CompilerGym's own issue #787 confirms `apt install libtinfo5` as the fix on 22.04.
- Swap step 8's index URL to `.../whl/cu121`.
- Because the driver is already present in WSL, and cu121 wheels for torch 2.5.1 exist.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| compiler_gym 0.2.5 | gym 0.21.0, grpcio 1.43.0, protobuf 3.20.3, numpy 1.23.5, Python 3.10 | Declared: `gym<=0.21`, `grpcio<1.44`, `protobuf<4.21`. Verified together. |
| compiler_gym 0.2.5 | LLVM 10.0.0 (bundled) | Cannot be changed without a source build. |
| ir2vec 2.1.1 (LLVM 16.0.1) | CompilerGym IR (LLVM 10.0.0), as `.ll` text and `.bc` | 23/23 cBench embedded, no parse errors. Retest if you use other datasets (CHStone, NPB). |
| stable-baselines3 1.8.0 | gym 0.21, torch 2.5.1 CPU, Python 3.10 | SB3 1.8.0 declares `torch>=1.11` and `importlib-metadata~=4.13`. PPO and A2C `learn()` verified. |
| setuptools >=67 or wheel >=0.40 | gym 0.21 sdist | Breaks the gym 0.21 metadata step. Pin 65.5.0 and 0.38.4 for the build. |
| Ubuntu >=24.04 | CompilerGym service binaries | Need `libtinfo.so.5` from a jammy `libtinfo5` deb via `LD_LIBRARY_PATH`. |

## Open Question for Phase 1 (baselines, do not skip)

## PROPOSED DEVIATIONS FROM REVIEW 1

### D-1 (addition, needs approval): also report `-Oz` as a baseline next to `-O2`/`-O3`

- **What changes:** Review 1 compares against `-O2`/`-O3`. Add `-Oz` (LLVM's size-optimizing pipeline) as a third reference column. Nothing is removed.
- **Why:** The project's primary metric is code size. `-O2` and `-O3` optimize speed, so size is not their target.
- **Evidence (measured 2026-10-11 with the CompilerGym service on all 23 cBench programs, instruction counts, `-O0` / service `-O3` / service `-Oz`):** `-Oz` is smaller than service `-O3` on every one of the 23 programs. Examples: ghostscript 406198 / 289350 / 177416, jpeg-c 62452 / 46186 / 30195, bzip2 28748 / 19169 / 15946, qsort 638 / 1163 / 315. `-O3` is larger than `-O0` on qsort (1163 vs 638). CompilerGym's size reward space `IrInstructionCountOz` is itself normalized against `-Oz`, so `-Oz` is the natural reference point for the reward as well.
- **Cost / risk:** Near zero. `IrInstructionCountOz` is an existing observation and `-Oz` is a flag on the bundled `opt`. The risk is narrative, not technical: a learned policy that beats `-O3` on size may still lose to `-Oz`, and the report must say so. This matches the project's honesty requirement.

### Contingency (not proposed, listed for completeness)

## Sources

- PyPI JSON API, `compiler-gym` (versions, upload dates, wheel filenames, `requires_dist`, classifiers): HIGH
- GitHub REST API `repos/facebookresearch/CompilerGym` (`archived: true`, `pushed_at`, latest release `v0.2.5` 2022-11-02, commit list ending 2024-10-09): HIGH
- CompilerGym `INSTALL.md`, `docs/source/llvm/index.rst` (observation/reward spaces, datasets, "exactly LLVM 10.0.0"): HIGH
- CompilerGym issues #833 (gym 0.21 `extras_require` failure, open), #796 (`>0.2.0` pip install, open, workaround `pip==22.2 setuptools==59.6.0` plus `libtinfo5`), #787 (returncode 127 fixed by `libtinfo5`): HIGH
- CompilerGym source `compiler_gym/envs/llvm/datasets/*.py` (dataset URLs) plus HTTP HEAD checks of those URLs: HIGH
- PyPI JSON and sdist for `IR2Vec` 2.1.1 (wheel tags cp36..cp311, bundled `seedEmbeddingVocab.txt`, LLVM 16.0.1 badge in PKG-INFO, `core.cpp` API): HIGH
- IR2Vec GitHub README (Python API `initEmbedding(...)`, `getProgramVector()`, LLVM branch map): HIGH
- PyPI JSON for `stable-baselines3` 1.8.0 (`gym==0.21`) and 2.7.0 (`gymnasium`), `sb3-contrib` 1.8.0, `cleanrl` 1.2.0 (`gym==0.23.1`, `python<3.11`), `shimmy` 2.0.1: HIGH
- `download.pytorch.org/whl/cpu` and `/cu121` indexes (torch 2.5.1 cp310 wheels exist): HIGH
- NVIDIA CUDA on WSL 2 user guide (Windows driver only, no Linux display driver in WSL): HIGH (docs); GPU path not run here: MEDIUM
- Packages.ubuntu.com search (`libtinfo5` only in jammy and jammy-updates): HIGH
- On-machine verification, WSL2 Ubuntu 26.04, uv 0.13.0, Python 3.10.22, 2026-10-11: end-to-end smoke test and PPO/A2C run, with the failure reproduction for the missing libtinfo5. HIGH (this machine only)
- Claims about RLlib/Ray compatibility and numpy >=1.24 behavior come from general knowledge and were not verified: LOW to MEDIUM, used only in the "What NOT to Use" table.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
