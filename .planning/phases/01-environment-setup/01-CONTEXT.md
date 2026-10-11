# Phase 1: Environment Setup - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A fresh WSL2 shell can run the whole toolchain end to end: pinned Python 3.10 environment, CompilerGym `llvm-v0` on a cBench program, one pass applied, an IR2Vec embedding of the resulting IR, and output validation that either passes or has a disclosed `lli` fallback. Delivers ENV-01. Nothing about splits, baselines, MDP or training belongs here.

</domain>

<decisions>
## Implementation Decisions

### WSL distro
- **D-01:** Stay on the existing Ubuntu 26.04 WSL distro (the Python 3.14 system default is never used). Python 3.10 comes from `uv`; `libtinfo.so.5` is extracted privately from the Ubuntu 22.04 `libtinfo5` deb and put on `LD_LIBRARY_PATH` for every process that launches CompilerGym. Research already ran the full stack (CompilerGym, IR2Vec, torch, SB3 PPO/A2C) this way.
- **D-02:** Adding a second `Ubuntu-22.04` distro is an escalation step only: use it if the smoke test is still red after the 26.04 recipe, or as a diagnosis step for the `validate()` failure (D-05). Do not install it up front (costs about 2-3 GB on a C: drive that is 92% full). — **Reversibility:** reversible — a distro can be added later without touching repo code.

### Where code lives
- **D-03:** The git repo stays on C: (`C:\Users\rvsre\Documents\compiler project`, `/mnt/c/Users/rvsre/Documents/compiler project` in WSL) so GSD tooling and Windows-side commits keep working. Every shell path is quoted because of the space.
- **D-04:** Everything heavy or small-file-intensive lives on WSL ext4, not `/mnt/c`: the venv (`~/venvs/...`), `COMPILER_GYM_CACHE` and `COMPILER_GYM_SITE_DATA` (under `~`), the wheelhouse, and the per-step `.ll` temp files (`/dev/shm`). Scripts write only small outputs (CSV, PNG, checkpoints) into the repo's `results/`.

### Validation
- **D-05:** Time-box the `env.validate()` "Runtime error (127)" diagnosis at a hard 2 hours. Diagnosis order: `COMPILER_GYM_DEBUG` logging, then `build-essential` and a system clang, then the Ubuntu-22.04 distro (D-02).
- **D-06:** If validation is still failing at the time box, use an `lli` fallback: run the `-O0` bitcode and the optimized bitcode with the bundled `lli` on qsort and a couple of other small cBench programs and compare output. It is labelled a weaker check and disclosed in the setup notes (not silently skipped).
- **D-07:** Phase 1 only needs validation to pass or the disclosed fallback to be in place. Full per-program validation of final sequences, with a "validated yes/no/not available" column, is Phase 6 work.

### Setup reproducibility and smoke test
- **D-08:** One idempotent `setup.sh` runs the pinned recipe from `.claude/CLAUDE.md` (uv, Python 3.10 venv, pip/setuptools/wheel pins before gym, `--no-build-isolation` for gym 0.21, numpy 1.23.5, `pydantic<2`, CompilerGym 0.2.5, ir2vec 2.1.1, CPU torch 2.5.1, SB3 1.8.0, libtinfo5 extraction). A short `SETUP.md` explains it and records known failure messages.
- **D-09:** `requirements.lock` is committed. The wheelhouse (`pip download -d`) and a tarball of the CompilerGym cache/site-data are stored as a backup outside git, because the CompilerGym repo is archived and datasets are Meta-hosted.
- **D-10:** One `smoke_test.py` script (not a notebook) does, in order: make `llvm-v0`, reset on `cbench-v1/qsort`, read `Ir` and the `IrInstructionCount*` observations, step two passes, read `action_had_no_effect`, compute the IR2Vec `fa` vector (checks dimension 300 and all values finite), run `validate()` or the `lli` fallback, and `env.close()` in `finally`. It prints one line per check and exits non-zero on any failure.
- **D-11:** Before any run, check for orphaned `compiler_gym` service processes (`ps aux | grep -i service`) since an interrupted run leaves them holding RAM. WSL has about 8 GB RAM, so keep parallel envs to 4 or fewer.

### Claude's Discretion
- Exact directory names for the venv, wheelhouse and backup location.
- Exact wording and layout of `SETUP.md` and the smoke-test output.
- Which "couple of other small programs" the `lli` fallback uses, if it is needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project and scope
- `.planning/ROADMAP.md` §Phase 1 - goal, 3 success criteria, 11 Oct time box (escalate to the user if the smoke test is still red on 12 Oct)
- `.planning/REQUIREMENTS.md` §ENV-01 - the single requirement this phase delivers
- `.planning/PROJECT.md` - constraints (WSL2, change control, integrity)
- `.claude/CLAUDE.md` §Recommended Stack and §Installation - the pinned versions and the verified install recipe

### Research
- `.planning/research/STACK.md` - verified dependency lock, install steps, measured step costs
- `.planning/research/PITFALLS.md` Pitfalls 1-3 and the `lli` fallback in Pitfall 11 - distro/Python failures, `validate()` 127, `/mnt/c` and disk risks
- `.planning/research/SUMMARY.md` - consolidated findings and the open `validate()` question

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. The repo contains only `.planning/` and `.claude/`. WSL has `uv` installed in `~` but no venv yet.

### Established Patterns
- None yet. This phase sets the patterns later phases follow: scripts in the repo, environment and caches in WSL `~`, results copied into `results/`.

### Integration Points
- `setup.sh`, `requirements.lock` and `smoke_test.py` are what Phases 2-7 import and run against. Phase 2 needs the bundled `opt` (`$COMPILER_GYM_SITE_DATA/llvm-v0/bin/opt` with `libtinfo.so.5` on `LD_LIBRARY_PATH`) for its CLI baselines.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the recommendations accepted in discussion: stay on Ubuntu 26.04, repo on C:, heavy things in WSL, 2-hour validation time box then `lli` fallback, one `setup.sh` plus `SETUP.md` plus `smoke_test.py`.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Environment Setup*
*Context gathered: 2026-10-11*
