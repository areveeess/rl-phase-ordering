#!/usr/bin/env bash
# Idempotent environment setup for the RL phase-ordering project (WSL2, Ubuntu 24.04+/26.04, no sudo).
# Everything heavy lives on the WSL ext4 home, never under /mnt/c.
set -euo pipefail

VENV="${VENV:-$HOME/venvs/rlphase}"
TINFO_DIR="$HOME/.local/lib/tinfo5"
WHEELS="${WHEELS:-$HOME/rlphase-backup/wheels}"
REPO="$(cd "$(dirname "$0")" && pwd)"

log() { printf '[setup] %s\n' "$*"; }

# 1-2. Python 3.10 venv, seeded with pip. A uv-managed standalone CPython 3.10 is
# reused if one is already on disk; otherwise uv is installed and fetches one.
export PATH="$HOME/.local/bin:$PATH"
if [ ! -x "$VENV/bin/python" ]; then
  py310="$(ls -d "$HOME"/.local/share/uv/python/cpython-3.10*-linux-x86_64-gnu/bin/python3.10 2>/dev/null | tail -1 || true)"
  if [ -n "$py310" ]; then
    log "creating venv at $VENV from $py310"
    "$py310" -m venv "$VENV"
  else
    command -v uv >/dev/null 2>&1 || { log "installing uv"; curl -LsSf https://astral.sh/uv/install.sh | sh; }
    log "creating venv at $VENV"
    uv venv --seed --python 3.10 "$VENV"
  fi
fi
PY="$VENV/bin/python"
PIP=("$PY" -m pip install --disable-pip-version-check -q)

# 3. Build tools pinned BEFORE gym (gym 0.21's setup.py breaks with modern setuptools)
"${PIP[@]}" "pip==22.2" "setuptools==65.5.0" "wheel==0.38.4"

# 4. gym 0.21 without build isolation
"$PY" -c 'import gym' 2>/dev/null || "${PIP[@]}" --no-build-isolation "gym==0.21.0"

# 5-6. numpy pin, CompilerGym, IR2Vec
"${PIP[@]}" "numpy==1.23.5" "pydantic<2" "compiler_gym==0.2.5" "ir2vec==2.1.1"

# 7. libtinfo.so.5 for the bundled LLVM-10 binaries, private dir only
if [ ! -e "$TINFO_DIR/lib/x86_64-linux-gnu/libtinfo.so.5" ]; then
  log "extracting libtinfo5 into $TINFO_DIR"
  tmp="$(mktemp -d)"
  base="http://archive.ubuntu.com/ubuntu/pool/universe/n/ncurses"
  deb="$(curl -s "$base/" | grep -o 'libtinfo5_6\.3-2ubuntu0[^"]*_amd64\.deb' | sort -uV | tail -1)"
  [ -n "$deb" ] || { log "ERROR: could not find a jammy libtinfo5 deb at $base"; exit 1; }
  curl -sSL -o "$tmp/$deb" "$base/$deb"
  mkdir -p "$TINFO_DIR"
  dpkg-deb -x "$tmp/$deb" "$TINFO_DIR"
  sha256sum "$tmp/$deb" | tee "$TINFO_DIR/deb.sha256"
  rm -rf "$tmp"
fi
LINE='export LD_LIBRARY_PATH="$HOME/.local/lib/tinfo5/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"'
grep -qF "tinfo5" "$VENV/bin/activate" || echo "$LINE" >> "$VENV/bin/activate"

# 7b. env.validate() compiles benchmarks with the bundled clang under a stripped
# environment (PATH only), so LD_LIBRARY_PATH is lost and clang exits with 127.
# The bundled binaries have RUNPATH $ORIGIN/../lib, so a symlink there fixes it.
# shellcheck disable=SC1091
source "$VENV/bin/activate"
python -c 'import compiler_gym; compiler_gym.make("llvm-v0").close()'  # unpacks the LLVM site data
SITE="${COMPILER_GYM_SITE_DATA:-$HOME/.local/share/compiler_gym}/llvm-v0"
ln -sf "$TINFO_DIR/lib/x86_64-linux-gnu/libtinfo.so.5" "$SITE/lib/libtinfo.so.5"

# 8. PyTorch CPU wheel, plus result tooling
"$PY" -c 'import torch' 2>/dev/null || "${PIP[@]}" "torch==2.5.1" --index-url https://download.pytorch.org/whl/cpu
"${PIP[@]}" pandas matplotlib

# 9. Lock file (committed) and wheel backup (outside git)
"$PY" -m pip freeze > "$REPO/requirements.lock"
if [ ! -d "$WHEELS" ]; then
  log "archiving wheels to $WHEELS"
  "$PY" -m pip download -q "compiler_gym==0.2.5" "ir2vec==2.1.1" --no-deps -d "$WHEELS" || log "WARNING: wheel archive failed"
fi
log "done. Activate with: source $VENV/bin/activate"
