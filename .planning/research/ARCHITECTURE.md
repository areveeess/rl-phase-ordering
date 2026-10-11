# Architecture Research

**Domain:** RL-guided LLVM compiler phase ordering (CompilerGym + IR2Vec + policy gradient), small course-research replication
**Researched:** 2026-10-11
**Confidence:** MEDIUM-HIGH (CompilerGym spaces, reward-normalization semantics and repo status verified against compilergym.com / GitHub; IR2Vec Python call names, CompilerGym helper paths and `info` flags are from memory and flagged "VERIFY" for the Slice-0 smoke test)

## Executive Answer

Published RL phase-ordering systems (AutoPhase, POSET-RL, CompilerGym's own examples) all share the same five-part shape. This project should copy that shape and keep each part behind a narrow interface:

1. **Compiler session layer**: owns the CompilerGym process, benchmarks, baselines (-O0/-O2/-O3/-Oz) and crash recovery.
2. **Featurizer**: IR text/bitcode in, fixed-length vector out (IR2Vec), with a content-hash cache.
3. **MDP environment**: a thin `gym.Env` that composes (1)+(2)+an *action table* + a *reward function*.
4. **Agent**: policy (MLP over a fixed vector) + policy-gradient trainer + rollout collector. Knows nothing about LLVM.
5. **Evaluation + results**: harness that loads a frozen split and a checkpoint, runs greedy/sampled rollouts, writes CSVs, then tables/plots read the CSVs only.

The single most valuable design rule: **CSV/JSON files are the only interface between pipeline stages** (split -> baselines -> train -> eval -> plots). Any stage can be re-run alone, and a partial pipeline (baselines + random policy) is already a valid "preliminary results" deliverable for 14 Oct.

## Standard Architecture

### System Overview

```
 OFFLINE PREP (run once, results frozen to files)
┌──────────────────────────────────────────────────────────────────────┐
│  make_split.py ──> data/splits/split_v1.json   (URIs, seed, hash)     │
│  compute_baselines.py ──> results/baselines.csv (O0/O2/O3/Oz counts)  │
│  (optional) pass_screen.py ──> results/pass_screen.csv  -> action set │
└───────────────┬──────────────────────────────────────────────────────┘
                │ reads split + baselines + configs/actions/*.yaml
                v
 ENVIRONMENT STACK (one instance per worker process)
┌──────────────────────────────────────────────────────────────────────┐
│  PhaseOrderEnv (gym.Env)                                              │
│    reset(uri) / step(a) / obs = normalized IR2Vec vec (300,)          │
│   ┌──────────────┐ ┌───────────────┐ ┌───────────────┐ ┌──────────┐  │
│   │ ActionTable  │ │ RewardFn      │ │ Featurizer    │ │ Session  │  │
│   │ id->[flags]  │ │ dense|sparse  │ │ IR2Vec+cache  │ │ (CG wrap)│  │
│   │ (YAML)       │ │ c0|O3-norm    │ │ +normalizer   │ │ + retry  │  │
│   └──────────────┘ └───────────────┘ └───────┬───────┘ └────┬─────┘  │
│                                              │ Ir/Bitcode    │        │
│                                              └───────<───────┘        │
│                                       CompilerGym service (LLVM 10)    │
└───────────────┬──────────────────────────────────────────────────────┘
                │ (obs, reward, terminated, truncated, info)
                v
 LEARNING                                         EVALUATION
┌───────────────────────────────┐   ckpt   ┌─────────────────────────────┐
│ RolloutCollector (N workers)  │ ───────> │ evaluate.py                  │
│ PolicyNet (MLP) + ValueHead   │          │  policies: greedy|sampled|   │
│ REINFORCE+baseline  (PPO later)│          │  random|O0|O2|O3|Oz          │
│ -> runs/<id>/train_log.csv    │          │ -> eval_per_benchmark.csv    │
└───────────────────────────────┘          │ -> traces.csv                │
                                           └──────────────┬──────────────┘
                                                          v
                          summarize.py -> summary_table.csv -> plots/*.png -> screenshots/
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `compiler.session` | Create/close CompilerGym env, `reset(benchmark)`, apply flags (`multistep`), expose `ir_text()`, `ir_count()`, `o3/oz/o0 count`, catch `ServiceError`/session loss and recycle the env | Thin wrapper; the **only** module importing `compiler_gym` |
| `compiler.baselines` | Compute -O0/-O2/-O3/-Oz instruction count (and optionally object text size) per benchmark with the same cost model as the env | -O0/-O3/-Oz from CompilerGym observations `IrInstructionCountO0/O3/Oz`; **-O2 is not a CompilerGym observation** -> run LLVM `opt -O2` on the benchmark bitcode, reload as a benchmark, read `IrInstructionCount` (VERIFY `compiler_gym.third_party.llvm.opt_path()` or equivalent) |
| `embed.ir2vec` | IR text or bitcode file -> 300-d float32 vector; cache by IR content hash | `ir2vec` PyPI wheel (VERIFY: `initEmbedding(path, "fa", "p")` + `getProgramVector`); temp-file I/O; dict/LRU + on-disk npz cache |
| `embed.normalizer` | Make raw IR2Vec vectors suitable for an MLP (program vectors are **sums**, so magnitude grows with program size) | z-score stats fit on train-set states, saved inside the checkpoint, frozen at eval |
| `env.actions` | Load an action table: action id -> ordered list of LLVM flags (single pass **or** POSET-RL-style group) | YAML in `configs/actions/`; swapping single-pass vs group is config, not code |
| `env.rewards` | Turn a sequence of instruction counts into rewards (dense/sparse; c0-normalized or O3-normalized) | Pure functions of `(c0, c_prev, c_now, c_o3, done)` -> unit-testable without LLVM |
| `env.phase_env` | The MDP: composes session + featurizer + actions + rewards; enforces episode length | `gym.Env` subclass, Gymnasium-style 5-tuple API exposed outwards |
| `data.splits` | Deterministic train/val/test split by benchmark URI, frozen to JSON with a hash | seed + sorted URIs; disjointness assertion; group-aware if suite has families |
| `agent.policy` | Fixed-vector policy: MLP -> action logits; separate value head/baseline | PyTorch, 2x256 hidden |
| `agent.rollout` | Collect episodes (sequential, then multiprocess) with the current policy | one env per worker; ships CPU `state_dict` to workers |
| `agent.reinforce` | Policy-gradient update (REINFORCE + learned baseline + entropy bonus), PPO as drop-in second trainer | ~150 lines own PyTorch |
| `eval.evaluate` | Run policies on a split; write per-benchmark rows and per-step traces | Reads split JSON + checkpoint + baselines CSV only |
| `eval.metrics` | ratios vs O3/O2/Oz, geomean, win/tie/loss, bootstrap CI | pandas/numpy, no LLVM dependency |
| `results.schema` | Single source of truth for CSV column names and run-registry writes | dataclasses / column constants imported by writers **and** plotters |
| `plots` | Learning curves, per-benchmark bars, win/loss, action histograms | matplotlib reading CSVs only |

## Recommended Project Structure

```
compiler project/
├── README.md                     # WSL2 setup + exact reproduce commands
├── environment.yml | requirements.txt   # pinned (Python/CompilerGym pins decided by STACK research)
├── Makefile                      # make check | split | baselines | random | train-smoke | eval | plots
├── configs/
│   ├── actions/
│   │   ├── single_pass_v1.yaml   # ~15-30 curated flags (+ optional NOOP)
│   │   └── poset_groups_v1.yaml  # pass groups (same schema; value = list of flags)
│   ├── data/split_v1.yaml        # suites, counts per split, seed, min-size filter
│   ├── env/default.yaml          # episode_len, reward_mode, reward_norm, obs_norm
│   └── train/
│       ├── reinforce_dense.yaml
│       └── reinforce_sparse.yaml
├── src/rlpo/
│   ├── compiler/   session.py  baselines.py
│   ├── embed/      ir2vec_embedder.py  normalizer.py  cache.py
│   ├── env/        phase_env.py  actions.py  rewards.py  fake_env.py
│   ├── data/       splits.py  manifest.py
│   ├── agent/      policy.py  reinforce.py  ppo.py(later)  rollout.py
│   ├── eval/       evaluate.py  metrics.py  decoders.py
│   ├── results/    schema.py  registry.py
│   └── plots/      curves.py  bars.py  actions.py
├── scripts/                      # thin CLIs, numbered = pipeline order
│   ├── 00_smoke_check.py         # CompilerGym + IR2Vec go/no-go
│   ├── 01_make_split.py
│   ├── 02_compute_baselines.py
│   ├── 03_eval_random.py
│   ├── 04_train.py
│   ├── 05_evaluate.py
│   ├── 06_summarize.py
│   └── 07_make_plots.py
├── data/
│   ├── splits/split_v1.json      # COMMITTED, never regenerated once results exist
│   └── cache/                    # gitignored: ir2vec vectors, tmp .ll/.bc
├── results/                      # COMMITTED (small CSVs) - what the course submission cites
│   ├── baselines.csv
│   ├── runs.csv                  # registry: one row per training/eval run
│   ├── runs/<run_id>/            # config.yaml, train_log.csv, ckpt_final.pt, eval_*.csv, traces.csv
│   ├── tables/summary_table.csv
│   └── plots/*.png
├── screenshots/                  # demo screenshots for Assessment 10
└── tests/                        # rewards, splits-disjoint, fake-env training, schema
```

### Structure Rationale

- **`src/rlpo/` + thin `scripts/`:** logic is importable and testable; scripts are 20-line argparse shells. Numbered scripts double as the "how to reproduce" for the submission.
- **Only `compiler/session.py` imports `compiler_gym`; only `embed/` imports `ir2vec`.** CompilerGym is archived and version-fragile (see Risks); isolating it keeps any later swap local and lets everything else be tested without it.
- **`agent/` depends only on torch/numpy and the env's spaces.** Build and test the trainer against `env/fake_env.py` (synthetic MDP with 300-d observations and K actions) **while the CompilerGym install is still being fought on 11-12 Oct**. This de-risks the schedule.
- **`results/` is committed; `data/cache/` is not.** Results are the deliverable; caches are regenerable.
- **Configs are data, not code:** action set, reward mode, episode length are YAML so dense-vs-sparse and single-vs-group are one-flag experiments and every result row can carry a `config_hash`.

## Architectural Patterns

### Pattern 1: Action table as data (single pass and pass group are the same abstraction)

**What:** action id -> list of CompilerGym flags. A single pass is a 1-element list; a POSET-RL-style group is an n-element list applied atomically with one `multistep` call and one embedding at the end.
**When to use:** always. Review 1 allows both granularities; the table makes the choice a config switch.
**Trade-offs:** + groups cut episode length and embedding calls; - group definitions need care (flags must exist among CompilerGym's 123 actions; POSET-RL's groups came from the Oz dependence graph and may include passes not in CompilerGym).

```python
# configs/actions/poset_groups_v1.yaml
# 0: [-mem2reg]
# 1: [-sroa, -early-cse, -simplifycfg]
class ActionTable:
    def __init__(self, yaml_path): self.groups = load(yaml_path)  # list[list[str]]
    def __len__(self): return len(self.groups)
    def to_indices(self, a, flag_to_idx): return [flag_to_idx[f] for f in self.groups[a]]
# env.step(a): session.multistep(table.to_indices(a, ...))
```

### Pattern 2: Reward as a pure function; dense and sparse share one return

**What:** compute rewards from raw instruction counts, not from CompilerGym's built-in reward spaces. With gamma = 1, **dense per-step reward telescopes to the same total as the sparse terminal reward**, so dense-vs-sparse differs only in credit assignment/variance, not in the objective. That makes the dense-vs-sparse comparison (a stated objective) clean.
**When to use:** always; `reward_mode in {dense, sparse}`, `reward_norm in {o3, c0}`.
**Trade-offs:** O3-normalized (CompilerGym's recommended form: reduction divided by the reduction -O3 achieves; cumulative return 1.0 = parity with -O3, interpretable y-axis for learning curves) blows up when `c0 - c_O3` is ~0; guard with a floor and filter such benchmarks from the training manifest. c0-normalized is bounded and robust (use as ablation/fallback).

```python
def step_reward(c0, c_prev, c_now, c_ref, mode, norm, done):
    denom = max(c0 - c_ref, 0.01 * c0) if norm == "o3" else c0   # guard tiny denominators
    delta = (c_prev - c_now) / denom                              # >0 = fewer instructions
    if mode == "dense":  return delta
    return ((c0 - c_now) / denom) if done else 0.0                # sparse: terminal only
```

CompilerGym's built-in `IrInstructionCountO3`/`...Oz` reward spaces implement exactly the O3/Oz-normalized dense form (verified in docs; success threshold 1.0). Prefer own `rewards.py` so sparse and dense share code and so a unit test can assert `sum(dense) == sparse_terminal`.

### Pattern 3: Content-hash featurization cache

**What:** key the embedding cache on SHA-1 of the IR text. Many passes are no-ops on a given program (IR unchanged), and rollouts of the same benchmark revisit identical IR; both hit the cache and skip the IR2Vec call. Also record `ir_hash` per step so the harness can detect "action had no effect" itself.
**When to use:** from the first env implementation; IR2Vec on a text round-trip through a temp file is the likely per-step bottleneck.
**Trade-offs:** + large speedup, trivially correct; - memory growth (300 floats x 4 B = 1.2 KB/entry; fine) .
Skip a full (benchmark, action-prefix) -> state transition cache: complexity not worth it at this scale.

### Pattern 4: Frozen, hashed split + three-way discipline

**What:** `split_v1.json` stores URIs for `train`, `val` (carved from the training pool, used for checkpoint choice/early stopping), `test` (the Review 1 held-out set, touched only by final eval). File hash is written into every result row (`split_hash`).
**When to use:** always. This keeps the Review 1 train / disjoint held-out design intact and prevents quietly selecting checkpoints on the held-out set (which would invalidate the generalization claim).
**Trade-offs:** costs a handful of benchmarks of training data.

### Pattern 5: Episode = fixed length, truncation not termination

**What:** `T` steps always (config; ~25 for single-pass actions with K~20-30, ~10-15 for pass groups; AutoPhase used 45). `terminated=False`, `truncated=True` at `T`. Include a **NOOP** action only if the action table lists it (lets the policy "stop early" by idling without a variable-length episode).
**Trade-offs:** + trivially batched, fixed-length returns, comparable across runs; - wastes steps after convergence. Optimization valid **only for greedy eval** and only if the state has no step index: once an action leaves the IR hash unchanged, the greedy policy will repeat it forever, so break out of the rollout and record the remaining steps as no-ops. Never do this for sampled rollouts or training.

### Pattern 6: Policy over a fixed-length vector

**What:** MLP `300 -> 256 -> 256 -> K` (tanh or ReLU) + separate value head `300 -> 256 -> 1` (value used as baseline only). Input = normalized IR2Vec vector. No recurrence, no graph net: IR2Vec already compresses the program.
**Notes:** the state is only partially observable (IR2Vec cannot tell the policy how many steps remain or what was already applied; see Deviation D2 for the optional fix). Entropy bonus (~0.01) prevents early collapse to one pass. Normalize advantages per batch.
**Algorithm choice (inside Review 1's "policy gradient"):** start with REINFORCE + learned baseline + entropy bonus (simple, no gymnasium/SB3 dependency clash with CompilerGym's old `gym`), batch of ~16-64 episodes per update across mixed benchmarks. PPO (clipped surrogate, same rollouts) is the planned upgrade if REINFORCE is too noisy. Both are policy-gradient, so this is a within-Review-1 choice; user may still want to confirm the algorithm name for the paper.

### Pattern 7: Action masking, keep it optional

**What:** CompilerGym provides no validity mask; with a curated subset every pass is always legal. The only useful masks are heuristic: (a) forbid repeating the immediately previous action (most passes are idempotent), (b) after a step whose `ir_hash` did not change, mask that action until the IR changes. Implement as `info["action_mask"]` consumed by the policy (set logits to -inf). Off by default; add as an ablation only if training shows policies wasting steps on repeats.
**Trade-offs:** + less wasted budget; - makes the policy's behavior depend on history the state does not encode; adds a code path.

### Pattern 8: Parallel rollout workers (after the sequential slice works)

**What:** each worker process owns one env (one CompilerGym service process + one embedding cache). The trainer broadcasts a CPU `state_dict`, workers return trajectories (obs, actions, rewards, benchmark, ir_hash trace). Use `torch.multiprocessing` or `multiprocessing.Pool`, 4-6 workers; cap WSL2 memory in `.wslconfig` (each service holds several hundred MB). Recycle each env every N episodes to bound service memory growth. Do **not** try to parallelize inside one env.

## Data Flow

### Pipeline Flow (files are the interfaces)

```
configs/data/split_v1.yaml ──> 01_make_split ──> data/splits/split_v1.json  (hash H_s)
                                                     │
                       02_compute_baselines <────────┘
                              │
                              v
                  results/baselines.csv  (uri, c_O0, c_O2, c_O3, c_Oz, ok)
                      │              │
      03_eval_random ─┘              └─> filter train manifest (drop ok=False / tiny O3 gap)
                │                                │
                v                                v
   eval_per_benchmark.csv         04_train ──> runs/<id>/{config.yaml,train_log.csv,ckpt_*.pt}
   (policy=random)                                │ ckpt includes normalizer stats + action-table hash
                                                  v
                       05_evaluate (split=train|val|test, decode=greedy|sampled)
                                                  v
                  runs/<id>/eval_per_benchmark.csv + traces.csv
                                                  v
                    06_summarize ──> results/tables/summary_table.csv
                                                  v
                    07_make_plots ──> results/plots/*.png ──> screenshots/
```

### One Environment Step

```
policy logits -> action a -> ActionTable[a] = [flags]
   -> Session.multistep(flag_indices)
   -> Session.ir_count()  -> c_now        -> RewardFn(c0,c_prev,c_now,c_O3,done) -> r
   -> Session.ir_text()/bitcode -> sha1 -> cache? ──hit──> vec
                                            └─miss─> IR2Vec(file) -> vec -> cache
   -> Normalizer(vec) -> obs (300,)  ;  info = {ir_hash, ir_count, flags, no_effect}
```

Request observations explicitly per step (`env.observation["Ir"]`, `["IrInstructionCount"]`) rather than relying on a default observation space; this keeps the env deterministic about what it reads.

### Key Data Flows

1. **Baselines flow:** computed once per benchmark via the same cost model as the env (`IrInstructionCount`) and cached in `baselines.csv`; env reads `c0`, `c_O3`, `c_Oz` from it at reset (no recomputation per episode). Sanity test: external `opt -O3` count must equal CompilerGym's `IrInstructionCountO3`.
2. **Training flow:** sample benchmark from the train list each episode (uniform; optionally curriculum later) -> rollout -> returns-to-go -> advantage (return minus value baseline, batch-normalized) -> gradient step -> append row to `train_log.csv`; every M updates run greedy rollouts on **val** and log `val_geomean_ratio_o3`.
3. **Evaluation flow:** frozen split + checkpoint + baselines -> per-benchmark rollouts -> per-benchmark CSV rows (+ per-step traces) -> aggregated table. Evaluation never imports the trainer; only `agent.policy` and `env`.
4. **Normalizer flow:** statistics are computed once from random-policy rollouts on the *train* split (reuse `03_eval_random` states), saved to `data/cache/obs_norm.npz` and copied into every checkpoint so eval cannot silently use different scaling. Alternatives (L2-normalize; divide by instruction count) are one-line ablations; z-scoring is the default because it preserves relative structure without the size-sum artefact dominating.

## Evaluation Harness Design

| Decision | Recommendation | Why |
|----------|----------------|-----|
| Primary metric | final-step IR instruction count; ratio `c_agent / c_O3` (<1 = agent better), also vs -O2, -Oz, -O0 | Matches Review 1; deterministic; cheap |
| Secondary metric | `ObjectTextSizeBytes` at final step only (eval, not training) | Real code size, but slower (compiles); do for final tables |
| Decoding modes | **greedy** (argmax, 1 rollout) as headline; **sampled** (N=16, report mean and best-of-N, clearly labelled); **random** policy baseline (same T, N seeds) | Greedy is the honest deployable policy; best-of-N is stronger but costs N compiles vs O3's one, so it must be labelled "search-assisted" |
| Episode length | identical `T` in training and eval, fixed | Avoids train/eval mismatch |
| "Best prefix" reporting | report **final-step** as primary; "best-so-far over steps" only as a separate labelled column (it uses the cost oracle) | Integrity: no oracle leakage in the headline number |
| Aggregation | geomean of ratio; win/tie/loss counts vs O3 (tie = equal count); mean % improvement; bootstrap 95% CI over benchmarks | Ratios must be geomean'd; counts are what a reader checks |
| Splits reported | train, val, **test (held-out)**; optionally cBench-23 as a separate real-program OOD set | Generalization is the core question |
| Seeds | >= 3 training seeds per configuration for dense vs sparse; report mean +/- std | RL variance is large; one seed cannot support a dense-vs-sparse claim |
| Failure analysis inputs | `traces.csv` (per-step action, count, no-effect flag) -> action-frequency histograms, per-benchmark worst-loss list, collapse-to-one-action detection | Required objective; needs per-step data, so log it from day one |

## Dataset, Caching and Splits

- **Pool:** CompilerGym downloads datasets on first use (needs network; stored under the CompilerGym site-data dir). Use a pool that is large enough to generalize and cheap per step: sample from `benchmark://anghabench-v1` (function-level, small) and/or `poj104-v1` / `mibench-v1` / `chstone-v0` / `csmith` (generator, seedable), a few hundred programs for train, 50-100 for val/test. `cbench-v1` (23 programs, runnable, most-used in the literature) works well as a separate OOD test set and the only suite where runtime/validation is practical for the secondary timing comparison.
- **Leakage control:** if a suite contains families of near-duplicate programs (e.g. many solutions to the same task), split by family, not by program, or the "held-out" set is effectively seen. Disjointness assertion in `data/splits.py` plus a unit test.
- **Filtering (in `manifest.py`, recorded in baselines.csv `ok` column):** drop benchmarks that fail to reset/embed, are tiny (e.g. `c_O0 < ~50`), or where `c_O0 - c_O3` is ~0 (ratio metrics degenerate). Report how many were dropped.
- **Freezing:** seed + sorted URI list -> JSON -> SHA-1 stored as `split_hash`. Do not regenerate after the first training run.
- **Pre-materialize:** run `02_compute_baselines` over the whole pool once; this forces all downloads, computes counts, and caches the initial IR2Vec vector per benchmark (`data/cache/init_vec.npz`). Training then never waits on a download.
- **Caches:** `ir_hash -> vector` (in-memory + npz flush per worker); initial states; obs-norm stats. All regenerable, all gitignored.

## Results Schema

All files in `results/`, long format, one header row, UTF-8, no index column. Column names live in `rlpo/results/schema.py` and are imported by both writers and plotters.

**`baselines.csv`** (one row per benchmark): `benchmark_uri, dataset, split, ir_count_o0, ir_count_o2, ir_count_o3, ir_count_oz, textsize_o0, textsize_o2, textsize_o3, textsize_oz, ir_hash_o0, ok, drop_reason`

**`runs.csv`** (registry, one row per train/eval run): `run_id, started_at, git_commit, role (train|eval), algo, reward_mode, reward_norm, action_set, action_set_hash, episode_len, seed, split_hash, config_path, ckpt_path, status`

**`runs/<id>/train_log.csv`** (one row per update): `run_id, update, episodes_total, env_steps_total, mean_return, mean_final_ratio_vs_o3_train, policy_loss, value_loss, entropy, grad_norm, val_geomean_ratio_o3, steps_per_sec, wall_time_s`

**`eval_per_benchmark.csv`** (one row per benchmark x policy x decode x sample): `run_id, split, benchmark_uri, dataset, policy (agent|random|O0|O2|O3|Oz), decode (greedy|sampled|none), sample_idx, seed, episode_len, steps_applied, ir_count_o0, ir_count_final, ir_count_o2, ir_count_o3, ir_count_oz, ratio_vs_o3, ratio_vs_o2, ratio_vs_oz, reduction_vs_o0, textsize_final, action_sequence, ckpt_hash, split_hash, config_hash, wall_time_s, status (ok|crash|timeout)`

**`traces.csv`** (one row per step; for failure analysis and per-benchmark step plots): `run_id, split, benchmark_uri, decode, sample_idx, step, action_id, action_name, flags, ir_count, ir_hash, no_effect, reward`

**`tables/summary_table.csv`** (derived; one row per run x split x policy x decode): `run_id, split, policy, decode, n_benchmarks, n_failed, geomean_ratio_o3, geomean_ratio_o2, geomean_ratio_oz, mean_pct_improve_vs_o3, wins_vs_o3, ties_vs_o3, losses_vs_o3, ci95_lo, ci95_hi`

Crashed/timed-out episodes are written with `status != ok` and **counted as failures in `n_failed`, never silently dropped** (honest-reporting requirement).

## Scaling Considerations

The relevant "scale" is compute and benchmark count, not users.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Smoke test (5-20 train programs, 1 env, 1 seed, minutes) | Sequential rollouts, in-memory cache. This is the 14 Oct slice |
| Main experiments (100-500 train programs, 3 seeds x {dense, sparse}, hours total on laptop) | 4-6 rollout workers, on-disk embedding cache, recycle envs, `.wslconfig` memory cap, run seeds as separate processes overnight |
| If more is wanted (thousands of programs, larger action sets) | Not needed for course scope; the file-based pipeline would let runs be farmed out unchanged, but do not build for it |

### Scaling Priorities

1. **First bottleneck: per-step latency** (pass application + IR export + temp file + IR2Vec). Fix with the content-hash cache, `multistep` for groups, and multiprocess workers. Measure `steps_per_sec` in the smoke test and size the training budget from it.
2. **Second bottleneck: env service memory/crashes** in long runs. Fix by catching service errors, recycling envs, logging `status=crash`, and keeping WSL2 memory capped.

## Anti-Patterns

### Anti-Pattern 1: Choosing checkpoints or hyperparameters on the held-out set
**What people do:** evaluate the test split every N updates and keep the best.
**Why it's wrong:** the held-out number becomes a tuned training number; "generalization" is not measured.
**Do this instead:** val split carved from the training pool for selection; test split evaluated once per final configuration.

### Anti-Pattern 2: Raw instruction-count reward, or O3-normalized without a guard
**What people do:** reward = raw delta; large programs dominate gradients. Or divide by `c0 - c_O3` with no floor.
**Why it's wrong:** scale imbalance across benchmarks / divide-by-near-zero spikes destroy training.
**Do this instead:** normalized reward with a denominator floor, tiny-gap benchmarks filtered at manifest time, per-batch advantage normalization.

### Anti-Pattern 3: Feeding unnormalized IR2Vec vectors
**What people do:** pass the raw program vector (sum of instruction embeddings) to the MLP.
**Why it's wrong:** magnitude tracks program size, not "what to do next"; training is dominated by scale.
**Do this instead:** frozen train-set z-scoring (or L2/instruction-count scaling as an ablation), stats saved in the checkpoint.

### Anti-Pattern 4: CompilerGym calls scattered through the codebase
**What people do:** `import compiler_gym` in trainer, eval and plotting scripts.
**Why it's wrong:** the library is archived and version-fragile; one install problem blocks everything and nothing is testable.
**Do this instead:** single `compiler.session` module plus `FakeEnv` for agent tests.

### Anti-Pattern 5: Comparing against baselines computed with a different cost model
**What people do:** take -O2/-O3 counts from `opt | llvm-dis | grep -c` while the agent is scored by CompilerGym's `IrInstructionCount`.
**Why it's wrong:** counting differences masquerade as wins/losses.
**Do this instead:** count every baseline and the agent through the same `IrInstructionCount` observation (reload baseline bitcode as a benchmark).

### Anti-Pattern 6: Reporting best-of-trajectory or best-of-N as the headline
**Why it's wrong:** uses the cost oracle / extra compile budget that -O3 does not get.
**Do this instead:** greedy final-step as headline; others labelled and reported beside it.

### Anti-Pattern 7: Single-seed dense-vs-sparse conclusions
**Do this instead:** >= 3 seeds, mean +/- std on learning curves and final ratios; say "inconclusive" if CIs overlap.

## Integration Points

### External Services / Libraries

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| CompilerGym (LLVM env) | `compiler_gym.make("llvm-v0")`; explicit `env.observation[...]`; `env.multistep(...)` | **Repo archived 26 May 2026 (read-only); last release v0.2.5, Nov 2022 (Python 3.10 added, 3.7 dropped)**. Linux/macOS only -> WSL2. Bundles LLVM 10. Pin an old Python (3.8-3.10) in a dedicated env. Exposes 123 actions; observations `Ir`, `BitcodeFile`, `Autophase`, `InstCount`, `IrInstructionCount{,O0,O3,Oz}`, `ObjectTextSize*`; has **no -O2 baseline**. Outwards API is old `gym` (reset returns obs; 4-tuple step) |
| IR2Vec | `pip install ir2vec` (PyPI latest 2.1.1 per a third-party index); call with a **file path** | VERIFY at Slice 0: Python names (`initEmbedding`, `getProgramVector`), 300-d output, `fa` vs `sym` mode, and **LLVM version of the wheel vs CompilerGym's LLVM 10 IR**. If textual IR from LLVM 10 fails to parse, try passing the `BitcodeFile` observation (bitcode is backward-compatible) before anything else |
| LLVM `opt` | Used for -O2 baseline only | Use the same LLVM build CompilerGym ships (VERIFY helper in `compiler_gym.third_party.llvm`); a system `opt` of a different version gives different -O2 results |
| PyTorch | CPU-first | RTX 3060 is not needed for a 300x256x256xK MLP; rollouts (CompilerGym) dominate wall time |
| gym / gymnasium | Own wrapper exposes Gymnasium-style API; inner CompilerGym keeps old `gym` | Different package names, can coexist; avoids SB3 coupling to CompilerGym's old gym pin |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `env` <-> `compiler.session` | Python calls; session returns plain ints/strings/paths | Session hides CompilerGym types |
| `env` <-> `embed` | `embed(ir_text_or_path) -> np.float32[300]` | Cache lives in `embed`; env only passes IR |
| `agent` <-> `env` | Gymnasium-style `reset/step`, `observation_space`, `action_space`, `info["action_mask"]` | Agent has no LLVM imports; `FakeEnv` satisfies same API |
| `train` -> `eval` | checkpoint file (weights + normalizer stats + action-table hash + config) | Eval refuses a checkpoint whose action-table hash mismatches the config |
| `eval` -> `plots` | CSV files only | Plots reproducible without LLVM installed |
| any stage -> `results/` | writers in `results.schema` | One place to change column names |

## Suggested Build Order (minimal end-to-end slice first)

Dependencies: Session -> Baselines -> Env -> Random eval -> Trainer -> Trained eval -> Plots. The **agent can be built in parallel** against `FakeEnv`.

| Slice | Date target | Build | Gate / deliverable |
|-------|-------------|-------|--------------------|
| **S0: go/no-go** | 11 Oct | WSL2 env; `import compiler_gym`; `make("llvm-v0")`, reset on one cBench program, apply one pass, read `Ir`/`BitcodeFile` + `IrInstructionCount`; run IR2Vec on that file -> 300-d vector | **If IR2Vec cannot embed CompilerGym's IR: stop and raise Deviation D1/D4.** In parallel: write `FakeEnv` + `PolicyNet` + REINFORCE and test they learn the toy MDP |
| **S1: baselines** | 11-12 Oct | `session.py`, `01_make_split` (small pool first: e.g. 30 train / 10 val / 10 test + cBench), `02_compute_baselines` incl. -O2 via `opt`; `baselines.csv` | Usable alone as the **fallback 14 Oct deliverable** (measured baselines + MDP/pipeline design, labelled preliminary) |
| **S2: env + random** | 12 Oct | `ActionTable`, `RewardFn`, `Featurizer`+cache, `PhaseOrderEnv`; `03_eval_random` writes `eval_per_benchmark.csv` and `traces.csv`; first plot (random vs O3); measure `steps_per_sec` | First real end-to-end vertical slice: env -> baselines -> random policy -> CSV -> plot |
| **S3: train + eval** | 12-13 Oct | Obs normalizer, rollout collector (sequential), REINFORCE on the small train set (dense reward, ~minutes to 1 h), `05_evaluate` greedy on val/test, `06_summarize`, `07_make_plots` | **Early-results deliverable for 14 Oct**: trained policy vs random vs O2/O3 on held-out, real numbers whatever they are |
| 14 Oct | | Freeze S0-S3 outputs as `results/prelim/` (copy), label preliminary | Assessment 9 inputs |
| **S4: scale + dense vs sparse** | 15-17 Oct | Grow pool (hundreds of train programs), parallel workers, sparse reward, 3 seeds x 2 modes, learning-curve plot | Reward-design comparison |
| **S5: action granularity + failure analysis** | 17-19 Oct | Pass-group action set (POSET-RL style), pass-screen script for curating single-pass set, action histograms, worst-loss list, optional PPO | Action-space comparison, failure-case objective |
| **S6: secondary + polish** | 19-20 Oct | Text-size at eval, runtime comparison on cBench subset only if timing is stable, cBench OOD table, README with exact commands, screenshots | Assessment 10 inputs |
| 21 Oct | | Freeze `results/`, tag commit | Submit |

**Ordering rationale:** the trained-policy path (S3) needs only S1 baselines + S2 env; sparse/dense, groups, and PPO are config/trainer variations on an already-working loop, so they are safe to defer. Writing `FakeEnv` + trainer on 11 Oct hides CompilerGym install delays. Every slice ends with CSV output that the next slice consumes, so a stall at any slice still leaves a presentable result.

## Risks That Shape the Architecture

1. **CompilerGym is archived and old** (read-only since 26 May 2026; last PyPI release Nov 2022). Expect pinned Python 3.8-3.10, old numpy/gym; install on WSL2 may take a long slice of 11 Oct. Mitigation: dedicated venv, isolate behind `session.py`, S0 gate.
2. **IR2Vec vs CompilerGym LLVM mismatch** (LLVM 10 IR/bitcode into a different-LLVM IR2Vec). Highest-probability integration failure. Mitigation in S0; fallback in Deviations.
3. **Per-step latency** may limit training to few thousand episodes. Mitigation: cache, parallel workers, short `T`, small pass set; measure early.
4. **Little to no learning on held-out programs** is a plausible honest outcome; the architecture supports reporting it (random baseline, val/test, traces for failure analysis).

## PROPOSED DEVIATIONS FROM REVIEW 1

**None of these are adopted. Each needs explicit user approval before any code depends on it.** Everything in the sections above stays inside Review 1 (IR2Vec state, curated pass / pass-group actions, change-in-size reward, policy-gradient, held-out evaluation vs -O2/-O3). Additions that do not change those (val split, cBench OOD set, extra -Oz reporting, text-size metric) are not deviations.

### D1: Fallback state encoding if IR2Vec cannot embed CompilerGym's IR (contingent)

- **What:** use CompilerGym's built-in `Autophase` (56-d) or `InstCount` (70-d, normalized `InstCountNorm`) observation as the state, with the identical MLP/trainer.
- **Trigger:** S0 shows IR2Vec cannot parse CompilerGym's IR/bitcode and no wheel/build fix works within about half a day.
- **Pros:** zero extra tooling, no file round-trip, fastest steps (large speedup), used by AutoPhase.
- **Cons:** departs from Review 1's central state choice and from POSET-RL's IR2Vec; weaker semantic content; must be disclosed as a limitation.
- **Suggestion:** ask only if S0 fails; otherwise keep IR2Vec.

### D2: Augment the state with step/budget and history features

- **What:** concatenate to the IR2Vec vector: `t/T` (remaining budget), `log(instruction_count)/log(c0)`, and a histogram of previously applied actions (AutoPhase appended an action histogram).
- **Why:** the pure IR2Vec state is partially observable (cannot see time or history); this typically stabilizes learning and removes the need for masking.
- **Pros:** cheap (K+2 extra inputs), often a clear gain; keeps IR2Vec as the main content.
- **Cons:** state is no longer "IR2Vec only"; makes the greedy early-exit optimization invalid.
- **Suggestion:** run pure-IR2Vec first; propose D2 as an ablation only if learning stalls.

### D3: STOP / variable-length episodes

- **What:** add a terminal STOP action so the agent chooses sequence length (as in CompilerGym's example loops with patience).
- **Pros:** shorter, more natural sequences; less wasted compute.
- **Cons:** changes episode structure and action space beyond "pass or pass group"; makes sparse-reward credit assignment harder; requires length penalty design.
- **Suggestion:** do not adopt; a NOOP entry in the curated action list (within Review 1) gives most of the benefit.

### D4: Replace CompilerGym with a thin custom LLVM-`opt` environment (last resort)

- **What:** own env that shells out to LLVM `opt` and counts instructions, same MDP interface above it.
- **Trigger:** CompilerGym cannot be made to run on WSL2 by the end of 12 Oct.
- **Pros:** no archived dependency, full control of LLVM version (which also fixes IR2Vec mismatch).
- **Cons:** loses CompilerGym's datasets, crash safeguards, and cost-model observations; large engineering cost with 3 days to the first deadline; breaks Review 1's committed dependency. Probably infeasible by 14 Oct.
- **Suggestion:** do not adopt unless S0 hard-fails; in that case fall back to the baselines-plus-design 14 Oct deliverable and decide afterwards.

### D5: PPO as the final algorithm (note, not a true deviation)

- **What:** REINFORCE+baseline for the vertical slice; PPO for final runs if REINFORCE is too noisy.
- **Why listed:** Review 1 says "policy gradient" without naming the algorithm; both qualify. Listed so the user can veto the choice or fix which one is named in the write-up.

## Sources

- CompilerGym LLVM environment docs (observation spaces, 123-action space, reward spaces including `IrInstructionCountO3/Oz` normalization, datasets): https://compilergym.com/llvm/index.html (fetched 2026-10-11; HIGH)
- CompilerGym repository (archived 27 May 2026 notice, v0.2.5 Nov 2022 adds Python 3.10 and drops 3.7, basic `make/reset/step` flow): https://github.com/facebookresearch/CompilerGym (fetched 2026-10-11; HIGH)
- CompilerGym PyPI (Linux/macOS prebuilt only; install `pip install -U compiler_gym`): https://pypi.org/project/compiler-gym/ (search snippet; MEDIUM)
- IR2Vec PyPI (`pip install -U ir2vec`; latest 2.1.1 per third-party index): https://pypi.org/project/ir2vec/ (search snippet; Python API names NOT confirmed, LOW-MEDIUM, verify in S0 with `help(ir2vec)`)
- IR2Vec paper (VenkataKeerthy et al., TACO 2020): https://arxiv.org/pdf/1909.06228
- Project context: `.planning/PROJECT.md` (Review 1 summary, constraints, deadlines)
- Background from training knowledge, not re-fetched (MEDIUM): AutoPhase (Haj-Ali et al. 2019; action-histogram + feature state, 45-step episodes), POSET-RL (Jain et al. 2022; Oz dependence-graph sub-sequences as actions, IR2Vec state, DDQN), CompilerGym paper (Cummins et al., CGO 2022; O3/Oz-normalized rewards, `multistep`, service crash handling)

---
*Architecture research for: RL-guided LLVM phase ordering (course project)*
*Researched: 2026-10-11*
