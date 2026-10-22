#!/usr/bin/env bash
# scripts/web_gate.sh — Quality gate runner for web/ routes and themes.
# Runs source hygiene, lint, and browser inspector at 1440, 768 and 390.
# Usage: bash scripts/web_gate.sh [--port N] [--themes light,dark] [--fail-on id,id] [--no-lint] ROUTE...

set -e

PORT=8100
THEMES="light,dark"
FAIL_ON=""
NO_LINT=0
ROUTES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --themes)
      THEMES="$2"
      shift 2
      ;;
    --fail-on)
      FAIL_ON="$2"
      shift 2
      ;;
    --no-lint)
      NO_LINT=1
      shift
      ;;
    *)
      ROUTES+=("$1")
      shift
      ;;
  esac
done

if [[ ${#ROUTES[@]} -eq 0 ]]; then
  ROUTES=("overview")
fi

# Step 1: Check prerequisites
SKILL_DIR=".agents/skills/design-taste-frontend"
INSPECT_SCRIPT="${SKILL_DIR}/scripts/inspect.mjs"
LINT_SCRIPT="${SKILL_DIR}/scripts/lint.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required but not found in PATH" >&2
  exit 2
fi

if ! command -v python >/dev/null 2>&1; then
  echo "Error: python is required but not found in PATH" >&2
  exit 2
fi

if [[ ! -f "$INSPECT_SCRIPT" ]]; then
  echo "Error: taste-skill inspect script not found at $INSPECT_SCRIPT" >&2
  exit 2
fi

# Step 2: Source hygiene check
echo "==> Running source hygiene gate..."
SRC_EXIT=0
python scripts/check_web_source.py || SRC_EXIT=$?
if [[ $SRC_EXIT -ne 0 ]]; then
  echo "FAIL: source hygiene check failed" >&2
fi

# Step 3: Lint check
LINT_EXIT=0
if [[ $NO_LINT -eq 0 ]]; then
  echo "==> Running taste-skill lint..."
  node "$LINT_SCRIPT" --app web/ || LINT_EXIT=$?
  if [[ $LINT_EXIT -ne 0 ]]; then
    echo "FAIL: lint check failed" >&2
  fi
fi

# Step 4: Start local web server
echo "==> Starting local HTTP server on port $PORT..."
python -m http.server --bind 127.0.0.1 --directory web "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Poll for server ready
SERVER_READY=0
for i in {1..20}; do
  if curl -s "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1; then
    SERVER_READY=1
    break
  fi
  sleep 0.5
done

if [[ $SERVER_READY -eq 0 ]]; then
  echo "Error: HTTP server failed to start on 127.0.0.1:$PORT within 10s" >&2
  exit 2
fi

# Step 5: Run inspector for each route and theme
IFS=',' read -ra THEME_LIST <<< "$THEMES"

for ROUTE in "${ROUTES[@]}"; do
  SLUG="${ROUTE//\//-}"
  for THEME in "${THEME_LIST[@]}"; do
    OUT_DIR=".taste-skill/app/inspect-${SLUG}-${THEME}"
    URL="http://127.0.0.1:${PORT}/?theme=${THEME}#/${ROUTE}"
    echo "==> Inspecting $URL -> $OUT_DIR"
    mkdir -p "$OUT_DIR"
    node "$INSPECT_SCRIPT" --app "$URL" --out "$OUT_DIR" || true
  done
done

# Step 6: Summarize report.json files and determine exit code
echo ""
echo "=================================================="
echo "          WEB GATE SUMMARY"
echo "=================================================="

PYTHON_SCRIPT=$(cat << 'EOF'
import sys, json, os
from pathlib import Path

fail_on_str = sys.argv[1]
fail_on = set(filter(None, [x.strip() for x in fail_on_str.split(',')]))
routes = sys.argv[2].split(',')
themes = sys.argv[3].split(',')

total_fails = 0
total_warns = 0
relevant_fails = 0

for route in routes:
    slug = route.replace('/', '-')
    for theme in themes:
        report_path = Path('.taste-skill/app') / f"inspect-{slug}-{theme}" / "report.json"
        if not report_path.is_file():
            print(f"  {route} ({theme}): NO REPORT (missing {report_path})")
            relevant_fails += 1
            continue
        try:
            report = json.loads(report_path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f"  {route} ({theme}): INVALID JSON ({e})")
            relevant_fails += 1
            continue
        findings = report.get('findings', [])
        fails = [f for f in findings if f.get('level') == 'FAIL']
        warns = [f for f in findings if f.get('level') == 'WARN']
        fail_ids = [f.get('id', 'unknown') for f in fails]

        if fail_on:
            counted = [f for f in fails if f.get('id') in fail_on]
        else:
            counted = fails

        relevant_fails += len(counted)
        total_fails += len(fails)
        total_warns += len(warns)

        out_dir = f".taste-skill/app/inspect-{slug}-{theme}"
        id_summary = ', '.join(fail_ids) if fail_ids else 'none'
        print(f"  {route} ({theme}): {len(fails)} FAIL, {len(warns)} WARN (fails: {id_summary}) -> {out_dir}")

sys.exit(1 if relevant_fails > 0 else 0)
EOF
)

GATE_EXIT=0
ROUTE_JOIN=$(IFS=, ; echo "${ROUTES[*]}")
THEME_JOIN=$(IFS=, ; echo "${THEME_LIST[*]}")

python -c "$PYTHON_SCRIPT" "$FAIL_ON" "$ROUTE_JOIN" "$THEME_JOIN" || GATE_EXIT=$?

if [[ $SRC_EXIT -ne 0 || $LINT_EXIT -ne 0 || $GATE_EXIT -ne 0 ]]; then
  echo ""
  echo "GATE RESULT: FAIL (src_exit=$SRC_EXIT, lint_exit=$LINT_EXIT, gate_exit=$GATE_EXIT)"
  exit 1
else
  echo ""
  echo "GATE RESULT: PASS (all criteria satisfied)"
  exit 0
fi
