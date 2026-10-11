# Stack Research

**Domain:** RL-guided LLVM phase ordering (CompilerGym + IR2Vec + policy gradient), WSL2 on Windows 11
**Researched:** 2026-10-11
**Confidence:** HIGH for the committed stack (CompilerGym + IR2Vec + SB3 PPO). Every pin below was installed and run end-to-end on this laptop's WSL2 on 2026-10-11, in a throwaway venv that has since been deleted.

## Headline Findings (read first)

1. **The committed stack works. No swap is needed.** CompilerGym 0.2.5, `ir2vec` 2.1.1 and SB3 PPO/A2C all run together under Python 3.10. A full smoke test passed: `llvm-v0` env, cBench download, IR2Vec vectors from the env's IR, and PPO/A2C training on an IR2Vec-state env.
2. **CompilerGym is archived and frozen.** GitHub API: `archived: true`, read-only since 2026-05-27. The last release is **v0.2.5 (2022-11-02)** and the last real commit is 2024-10-09 (later commits are Dependabot bumps). It still installs from PyPI, but nobody will fix anything. Pin exactly and keep a local copy of the wheel.
3. **The user's WSL is not a default-friendly target.** Their distro is **Ubuntu 26.04 with system Python 3.14.4**. CompilerGym and IR2Vec cannot use that Python. The bundled LLVM binaries also need `libtinfo.so.5`, which Ubuntu 24.04 and later no longer ship. I reproduced the failure: `ServiceError: ... Service terminated with returncode: 127`. Both problems have a no-sudo fix in the recipe below.
4. **IR2Vec is NOT a CompilerGym observation space.** CompilerGym ships Autophase, InstCount, Inst2vec and ProGraML, but no IR2Vec. IR2Vec is a separate pip package (`ir2vec`) that you call on the IR string from `env.observation["Ir"]`. This is cheap and works: 23/23 cBench programs embed, about 13 ms per step including the embedding.
5. **Gym API is the old `gym==0.21`** (`reset()` returns obs, `step()` returns a 4-tuple). This forces **SB3 1.8.0**, the last gym-based release. SB3 2.x uses gymnasium and does not work directly.
6. **Baseline warning that affects the project's claim.** On cBench, `-Oz` beats `-O3` on instruction count in every program, and `-O3` is far from the size optimum. See "PROPOSED DEVIATIONS FROM REVIEW 1" (D-1).

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

These are the versions pip resolved in the working test environment:

```
python 3.10.22   pip 22.2   setuptools 65.5.0   wheel 0.38.4
gym 0.21.0       compiler_gym 0.2.5    ir2vec 2.1.1
numpy 1.23.5     grpcio 1.43.0         protobuf 3.20.3
networkx 3.4.2   docker 7.2.0          absl-py 2.5.1
torch 2.5.1+cpu  stable-baselines3 1.8.0
importlib-metadata 4.13.0   pandas 2.3.3   matplotlib 3.10.9
```

After installing, run `pip freeze > requirements.lock` and commit it. That is the reproducibility artifact for the submission.

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

Keep the repo and venv on the WSL ext4 filesystem (`~/...`), not under `/mnt/c`, because `/mnt/c` is slow for many small files. Copy results out to Windows at the end.

```bash
# 1. uv (standalone Python manager)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# 2. Python 3.10 venv, seeded with pip
uv venv --seed --python 3.10 ~/venvs/rlphase
source ~/venvs/rlphase/bin/activate
python --version            # must print 3.10.x

# 3. Pin the build tools BEFORE gym. gym 0.21's setup.py is rejected by modern setuptools
#    ("'extras_require' must be a dictionary...", CompilerGym issue #833).
pip install "pip==22.2" "setuptools==65.5.0" "wheel==0.38.4"

# 4. gym 0.21 must be built WITHOUT build isolation (isolation pulls the latest setuptools and fails)
pip install --no-build-isolation "gym==0.21.0"

# 5. numpy pin, then CompilerGym (brings grpcio 1.43.0 and protobuf 3.20.3)
pip install "numpy==1.23.5" "compiler_gym==0.2.5"

# 6. IR2Vec (self-contained wheel, vocabulary included)
pip install "ir2vec==2.1.1"

# 7. libtinfo.so.5 for the bundled LLVM-10 binaries, extracted into a private dir.
#    Ubuntu 24.04+ has no libtinfo5 package. Without this, make("llvm-v0") fails with returncode 127.
mkdir -p ~/.local/lib/tinfo5 && cd /tmp
curl -s http://archive.ubuntu.com/ubuntu/pool/universe/n/ncurses/ | grep -o 'libtinfo5_6.3-2ubuntu0[^"]*amd64.deb' | sort -u   # pick one
curl -sSLO http://archive.ubuntu.com/ubuntu/pool/universe/n/ncurses/libtinfo5_6.3-2ubuntu0.3_amd64.deb
dpkg-deb -x libtinfo5_6.3-2ubuntu0.3_amd64.deb ~/.local/lib/tinfo5
echo 'export LD_LIBRARY_PATH="$HOME/.local/lib/tinfo5/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"' >> ~/venvs/rlphase/bin/activate
source ~/venvs/rlphase/bin/activate

# 8. PyTorch CPU wheel, then SB3 (1.8.0 requires gym==0.21, already satisfied)
pip install "torch==2.5.1" --index-url https://download.pytorch.org/whl/cpu
pip install "stable-baselines3==1.8.0"

# 9. Archive the exact wheels (the CompilerGym repo is archived; PyPI could change)
pip download "compiler_gym==0.2.5" "ir2vec==2.1.1" --no-deps -d ~/wheels
pip freeze > requirements.lock
```

**If the user prefers apt:** `wsl --install -d Ubuntu-22.04` gives system Python 3.10 and `sudo apt install libtinfo5` works, so steps 1 and 7 are unnecessary. Steps 3 to 6, 8 and 9 still apply. This is a valid fallback but unneeded given the recipe above works on 26.04.

### Smoke test

This is the minimum "Phase 0 done" check. It matches what was verified, and the reset call also triggers the cBench download:

```python
import tempfile, os, gym, compiler_gym, ir2vec, numpy as np
env = compiler_gym.make("llvm-v0", reward_space="IrInstructionCountOz")
obs = env.reset(benchmark="benchmark://cbench-v1/qsort")         # downloads cBench on first use
with tempfile.NamedTemporaryFile("w", suffix=".ll", delete=False) as f:
    f.write(env.observation["Ir"]); p = f.name
vec = np.array(ir2vec.initEmbedding(p, "fa", "p").getProgramVector())   # shape (300,)
os.unlink(p)
o, r, done, info = env.step(env.action_space.flags.index("-mem2reg"))   # 4-tuple (old gym API)
```

### Measured numbers worth planning around (this laptop, CPU)

- One `step()` plus a full IR2Vec embedding (text IR to temp file to vector): **about 13 ms** on average. That is roughly 75 steps/s per env, or about 100k steps in 20 minutes on one env. A 10-step episode costs about 0.13 s.
- IR2Vec on `.ll` text and on the `BitcodeFile` path gave identical vectors (max abs diff 0.0). Bitcode was verified at reset time only. Use the text `Ir` route, which was verified after steps.
- IR2Vec program vectors are **unnormalized sums**: L2 norm about 559 for qsort at `-O0`. Normalize before feeding a network, and append a size feature such as `log(instruction_count / O0_count)`. An L2-normalized vector alone discards program size, which is the reward signal.
- WSL has about 8 GB RAM, and the LLVM service uses `/dev/shm` (RAM). Large programs such as ghostscript (about 400k instructions) take about 1 GB per service. Keep parallel envs to about 4 or fewer.

## Benchmark Datasets (all hosted at `dl.fbaipublicfiles.com/compiler_gym/`)

Datasets are fetched automatically on first access (`env.datasets["benchmark://cbench-v1"]` or `env.reset(benchmark=...)`). Default location is `~/.local/share/compiler_gym`, overridable via `COMPILER_GYM_SITE_DATA`.

| Dataset | Size / count | Status verified 2026-10-11 |
|---------|--------------|----------------------------|
| `benchmark://cbench-v1` | **23 programs**, 5.5 MB tar, plus 253 MB runtime data (needed for execution and validation) | **Installed and used.** Programs: adpcm, bitcount, blowfish, bzip2, crc32, dijkstra, ghostscript, gsm, ispell, jpeg-c, jpeg-d, lame, patricia, qsort, rijndael, sha, stringsearch, stringsearch2, susan, tiff2bw, tiff2rgba, tiffdither, tiffmedian. |
| `benchmark://chstone-v0` | 12 programs (per CompilerGym docs) | Built on first use from a GitHub tarball (`patmos_HLS` commit e62d878) using the bundled clang. **Not run here**, MEDIUM. Needs internet access to github.com. |
| `benchmark://npb-v0`, `blas-v0`, `opencv-v0`, `mibench-v1` | 1.2 MB, 3.8 MB, 11 MB, 60 KB tars | URLs return HTTP 200. Not installed. Check `ds.size` after install, since `mibench-v1`'s 60 KB tar suggests it is small. |
| `tensorflow-v0`, `linux-v0`, `github-v0` | 100 MB, 290 MB, 344 MB | URLs live. Too large and slow for this project. |
| `anghabench-v1`, `poj104-v1`, `csmith`, `llvm-stress` | Large or generated | Not needed. `poj104-v1` is a `.tar.gz` (a `.bz2` guess returns 403). |

**Split suggestion for the stack decision:** cBench has only 23 programs. A cross-suite held-out set (train on cBench, test on CHStone or NPB/BLAS) is a stronger generalization test than a 23-program random split. It also fits the Review 1 wording "held-out programs".

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

**If the user stays on Ubuntu 26.04 WSL (current):**
- Use the exact recipe above, including the private `libtinfo.so.5` extraction.
- Because there is no libtinfo5 package for 24.04 and later, and the bundled `compiler_gym-llvm-service`, `opt` and `clang` link against it.

**If a second WSL distro is acceptable:**
- Use `wsl --install -d Ubuntu-22.04`, then `sudo apt install libtinfo5 python3.10-venv`.
- Because it removes both the Python and libtinfo workarounds. CompilerGym's own issue #787 confirms `apt install libtinfo5` as the fix on 22.04.

**If a GPU is wanted later:**
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

The service-reported baselines and CLI `opt` numbers disagree for `-O3`. On qsort, `-O0` is 638 instructions. The service's `IrInstructionCountO3` is 1163, and `-Oz` is 315 (CLI `opt -Oz` gives 316). But the bundled `opt -O2` and `opt -O3` CLI runs, with the output loaded back via `Benchmark.from_file`, both gave **2323**. My untested hypothesis is that the service builds the pipeline without a target machine, so it skips target-specific unrolling. Whatever the cause, the project must measure `-O2`, `-O3` and `-Oz` **the same way for every benchmark** (for example all via the CLI `opt` then `from_file`, cross-checked against the service's O3/Oz observations) and report which method it used. `-O2` has no service observation, so a CLI route is needed anyway.

## PROPOSED DEVIATIONS FROM REVIEW 1

**Nothing in the committed stack (CompilerGym, IR2Vec, policy gradient, curated pass subset, instruction-count reward) is infeasible, and I propose no swap. The one item below is an addition to the evaluation and needs user approval before adoption.**

### D-1 (addition, needs approval): also report `-Oz` as a baseline next to `-O2`/`-O3`

- **What changes:** Review 1 compares against `-O2`/`-O3`. Add `-Oz` (LLVM's size-optimizing pipeline) as a third reference column. Nothing is removed.
- **Why:** The project's primary metric is code size. `-O2` and `-O3` optimize speed, so size is not their target.
- **Evidence (measured 2026-10-11 with the CompilerGym service on all 23 cBench programs, instruction counts, `-O0` / service `-O3` / service `-Oz`):** `-Oz` is smaller than service `-O3` on every one of the 23 programs. Examples: ghostscript 406198 / 289350 / 177416, jpeg-c 62452 / 46186 / 30195, bzip2 28748 / 19169 / 15946, qsort 638 / 1163 / 315. `-O3` is larger than `-O0` on qsort (1163 vs 638). CompilerGym's size reward space `IrInstructionCountOz` is itself normalized against `-Oz`, so `-Oz` is the natural reference point for the reward as well.
- **Cost / risk:** Near zero. `IrInstructionCountOz` is an existing observation and `-Oz` is a flag on the bundled `opt`. The risk is narrative, not technical: a learned policy that beats `-O3` on size may still lose to `-Oz`, and the report must say so. This matches the project's honesty requirement.

### Contingency (not proposed, listed for completeness)

If CompilerGym ever becomes unusable, the fallback would be a thin custom environment around LLVM `opt` and a modern LLVM with the same Gym interface. This is multi-day work, which makes it infeasible before 14 Oct. It is not needed, because CompilerGym installs and runs today.

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

---
*Stack research for: RL-guided LLVM phase ordering on WSL2*
*Researched: 2026-10-11*
