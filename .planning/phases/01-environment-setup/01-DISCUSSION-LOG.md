# Phase 1: Environment Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 1-Environment Setup
**Areas discussed:** WSL distro, Where code lives, Validation fallback, Setup + smoke test

---

## Area selection

The user asked for a recommendation instead of choosing areas. Claude recommended a position on all four areas, and the user chose "Accept all four (Recommended)".

## WSL distro

| Option | Description | Selected |
|--------|-------------|----------|
| Stay on Ubuntu 26.04 + private libtinfo5 | Recipe verified end to end in research; no extra disk | ✓ |
| Add Ubuntu-22.04 distro now | apt libtinfo5, may fix validate(); ~2-3 GB on a 92%-full C: | |

**User's choice:** Stay on 26.04; 22.04 is an escalation step only.

## Where code lives

| Option | Description | Selected |
|--------|-------------|----------|
| Repo on C:, venv/caches/temp in WSL | One git repo; heavy I/O on ext4 | ✓ |
| Develop in a WSL clone, copy results back | Faster source I/O, two repos to sync | |

**User's choice:** Repo on C:, heavy things in WSL.

## Validation fallback

| Option | Description | Selected |
|--------|-------------|----------|
| 2 h time box, then lli output comparison | Disclosed as a weaker check | ✓ |
| Skip validation in Phase 1 | Rejected: roadmap requires pass or disclosed fallback | |

**User's choice:** 2 h time box, then `lli` fallback on qsort and a few small programs.

## Setup + smoke test

| Option | Description | Selected |
|--------|-------------|----------|
| Idempotent setup.sh + SETUP.md + smoke_test.py | Lock file committed; wheelhouse and cache backup outside git | ✓ |
| Written steps only | Less reproducible | |

**User's choice:** setup.sh + SETUP.md + smoke_test.py.

---

## Claude's Discretion

Directory names, SETUP.md wording, smoke-test output layout, choice of small programs for the `lli` fallback.

## Deferred Ideas

None.
