# Setup (WSL2)

CompilerGym has no Windows wheels, so everything runs inside WSL2. Tested on
Windows 11 + WSL2 Ubuntu 26.04 (system Python 3.14 is **not** used).

## One command

```bash
cd "/mnt/c/Users/<you>/Documents/compiler project"   # quote the path, it has a space
bash setup.sh
source ~/venvs/rlphase/bin/activate
python smoke_test.py
```

`setup.sh` is idempotent. It:

1. creates a Python 3.10 venv at `~/venvs/rlphase` (from a uv-managed CPython 3.10,
   installing `uv` only if no such interpreter is on disk);
2. pins `pip==22.2 setuptools==65.5.0 wheel==0.38.4` **before** gym, then installs
   `gym==0.21.0` with `--no-build-isolation` (gym 0.21's `setup.py` is rejected by modern setuptools);
3. installs `numpy==1.23.5`, `pydantic<2`, `compiler_gym==0.2.5`, `ir2vec==2.1.1`,
   CPU `torch==2.5.1`, `pandas`, `matplotlib`;
4. extracts `libtinfo.so.5` from Ubuntu 22.04's `libtinfo5` deb into
   `~/.local/lib/tinfo5` (private, no sudo) and adds it to `LD_LIBRARY_PATH` in the
   venv's `activate` script; the deb's sha256 is written next to it;
5. symlinks that `libtinfo.so.5` into CompilerGym's bundled `llvm-v0/lib`, so the bundled
   `clang` also finds it when CompilerGym strips the environment (see below);
6. writes `requirements.lock` (committed) and saves the CompilerGym and IR2Vec wheels
   to `~/rlphase-backup/wheels` (outside git; the CompilerGym repo is archived).

Everything heavy (venv, datasets, `~/.local/share/compiler_gym`, temp IR files in
`/dev/shm`) lives on the WSL ext4 disk, never under `/mnt/c`.

## Known failure messages

| Message | Cause | Fix (already in `setup.sh`) |
|---|---|---|
| `'extras_require' must be a dictionary...` installing gym | modern setuptools | pin build tools, `--no-build-isolation` |
| `ServiceError: ... returncode: 127` on `make("llvm-v0")` | bundled LLVM 10 needs `libtinfo.so.5`, absent on Ubuntu >= 24.04 | private libtinfo5 + `LD_LIBRARY_PATH` |
| `env.validate()` -> `Gold standard: Runtime error (127)` | validation runs the bundled `clang` with `PATH` only, so `LD_LIBRARY_PATH` is lost | symlink into `llvm-v0/lib` (clang's RUNPATH is `$ORIGIN/../lib`) |
| WSL "Catastrophic failure" / all jobs killed | processing `ghostscript` (~400k instructions) exhausts the 8 GB WSL VM | ghostscript excluded from the study |
| Long jobs vanish when started with `nohup`/`setsid` | WSL stops the distro when no `wsl.exe` client is attached | keep the launching `wsl.exe` call running |

## Output validation: disclosure

After the 127 fix, `env.validate()` on `cbench-v1/qsort` still fails with
`Runtime error (66)` and a segmentation fault inside CompilerGym's own validation
runs (these include sanitizer builds). We did not resolve this within the time box.

Instead, `smoke_test.py` and the final evaluation use an **`lli` output check**
(`rlpo/lli_check.py`): the `-O0` bitcode and the optimized bitcode are both run with the
bundled `lli` on one cBench input, and stdout plus output files must match. This is
**weaker** than `validate()`: one input, no sanitizers, and only programs with a
known command line (qsort, dijkstra, crc32, sha, bitcount, blowfish, stringsearch).
Programs without a command are reported as "not available", not as passing.

Smoke-test result on this machine: every CompilerGym and IR2Vec check passes,
`env.validate()` reports the runtime error above, and the `lli` check passes on
qsort, dijkstra and crc32.
